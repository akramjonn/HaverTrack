import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, Socket } from 'node:net';
import { join } from 'node:path';
import { createSecureContext, TLSSocket } from 'node:tls';
import { Client } from 'pg';
import { pgConfigFromUrl } from './db';

function message(type: string, body: Buffer) {
  const header = Buffer.alloc(5);
  header.write(type);
  header.writeInt32BE(body.length + 4, 1);
  return Buffer.concat([header, body]);
}

// A disposable PostgreSQL SSL negotiation endpoint. Use the actual pg client
// and TLS stack so these tests prove peer verification, not just config values.
async function endpoint(key: Buffer, cert: Buffer) {
  const sockets = new Set<Socket>();
  let startups = 0;
  const context = createSecureContext({ key, cert });
  const server = createServer((raw) => {
    sockets.add(raw);
    raw.on('close', () => sockets.delete(raw));
    raw.on('error', () => {});
    raw.once('data', (request) => {
      assert.ok(Buffer.isBuffer(request));
      assert.equal(request.readInt32BE(0), 8);
      assert.equal(request.readInt32BE(4), 80877103); // PostgreSQL SSLRequest
      raw.write('S');
      const secure = new TLSSocket(raw, { isServer: true, secureContext: context });
      secure.on('error', () => {}); // The rejected client closes its handshake.
      let buffer = Buffer.alloc(0);
      let started = false;
      secure.on('data', (data) => {
        assert.ok(Buffer.isBuffer(data));
        buffer = Buffer.concat([buffer, data]);
        while (buffer.length >= (started ? 5 : 4)) {
          const size = buffer.readInt32BE(started ? 1 : 0) + (started ? 1 : 0);
          if (buffer.length < size) break;
          const packet = buffer.subarray(0, size);
          buffer = buffer.subarray(size);
          if (!started) {
            started = true;
            startups += 1;
            secure.write(Buffer.concat([
              message('R', Buffer.alloc(4)), // AuthenticationOk
              message('Z', Buffer.from('I')), // ReadyForQuery
            ]));
          } else if (packet[0] === 81) { // Simple query: return SELECT 1.
            const description = Buffer.alloc(20);
            description.writeInt16BE(1, 0);
            description.writeInt32BE(23, 8); // int4
            description.writeInt16BE(4, 12);
            description.writeInt32BE(-1, 14);
            const field = Buffer.concat([description.subarray(0, 2), Buffer.from('one\0'), description.subarray(2)]);
            const row = Buffer.alloc(7);
            row.writeInt16BE(1, 0);
            row.writeInt32BE(1, 2);
            row.write('1', 6);
            secure.write(Buffer.concat([
              message('T', field), message('D', row),
              message('C', Buffer.from('SELECT 1\0')), message('Z', Buffer.from('I')),
            ]));
          } else if (packet[0] === 88) secure.end(); // Terminate
        }
      });
    });
  });
  await new Promise<void>((done) => server.listen(0, done));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    port: address.port,
    startups: () => startups,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
    },
  };
}

async function main() {
  // Run from a disposable checkout: all generated certificate files stay there.
  const directory = mkdtempSync(join(process.cwd(), '.db-tls-test-'));
  const previousCA = process.env.DATABASE_SSL_CA_FILE;
  delete process.env.DATABASE_SSL_CA_FILE;
  try {
    const certificates = new Map<string, { key: Buffer; cert: Buffer; ca: string }>();
    for (const hostname of ['localhost', 'wrong.invalid']) {
      const prefix = join(directory, hostname);
      writeFileSync(`${prefix}.cnf`, `[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=${hostname}\n[ext]\nsubjectAltName=DNS:${hostname}\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n`);
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1',
        '-config', `${prefix}.cnf`, '-keyout', `${prefix}.key`, '-out', `${prefix}.crt`], { stdio: 'ignore' });
      certificates.set(hostname, { key: readFileSync(`${prefix}.key`), cert: readFileSync(`${prefix}.crt`), ca: `${prefix}.crt` });
    }

    const parsed = pgConfigFromUrl('postgresql://postgres:raw@pass#word@localhost:5432/postgres?sslmode=disable');
    assert.equal(parsed.password, 'raw@pass#word');
    assert.equal(parsed.ssl.rejectUnauthorized, true);
    assert.equal(pgConfigFromUrl('postgresql://postgres:p%40%23@localhost/postgres').password, 'p@#');
    assert.throws(() => pgConfigFromUrl('postgresql://postgres:p@localhost/postgres', join(directory, 'missing.crt')), /ENOENT/);

    for (const [hostname, trusted, expected] of [
      ['localhost', false, 'DEPTH_ZERO_SELF_SIGNED_CERT'],
      ['localhost', true, null],
      ['wrong.invalid', true, 'ERR_TLS_CERT_ALTNAME_INVALID'],
    ] as const) {
      const certificate = certificates.get(hostname)!;
      const local = await endpoint(certificate.key, certificate.cert);
      const client = new Client({
        ...pgConfigFromUrl(`postgresql://test:dummy@localhost:${local.port}/postgres?sslmode=disable`, trusted ? certificate.ca : undefined),
        connectionTimeoutMillis: 3000,
      });
      try {
        if (expected) {
          await assert.rejects(client.connect(), (error: Error & { code?: string }) => error.code === expected);
          assert.equal(local.startups(), 0, 'No PostgreSQL credentials may be sent to an unverified peer');
        } else {
          await client.connect();
          assert.deepEqual((await client.query('SELECT 1')).rows, [{ one: 1 }]);
          assert.equal(local.startups(), 1);
        }
      } finally {
        await client.end().catch(() => {});
        await local.close();
      }
    }
    // The production default reads the dedicated CA environment variable.
    process.env.DATABASE_SSL_CA_FILE = certificates.get('localhost')!.ca;
    assert.equal(pgConfigFromUrl('postgresql://test:dummy@localhost/postgres').ssl.ca, certificates.get('localhost')!.cert.toString());
    console.log('Database TLS tests passed: untrusted and wrong-host peers rejected; trusted localhost query succeeds.');
  } finally {
    if (previousCA === undefined) delete process.env.DATABASE_SSL_CA_FILE;
    else process.env.DATABASE_SSL_CA_FILE = previousCA;
    rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
