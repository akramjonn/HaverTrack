import { Platform } from 'react-native';
import * as ExpoCrypto from 'expo-crypto';

// Hermes does not provide WebCrypto. Supply the random values and SHA digest
// operations used by Supabase PKCE so it never falls back to Math.random/plain.
// Browsers keep their complete native WebCrypto implementation.
if (Platform.OS !== 'web') {
  if (!globalThis.crypto) {
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
  }
  if (!globalThis.crypto.getRandomValues) {
    Object.defineProperty(globalThis.crypto, 'getRandomValues', { value: ExpoCrypto.getRandomValues });
  }
  if (!globalThis.crypto.subtle) {
    Object.defineProperty(globalThis.crypto, 'subtle', {
      value: {
        digest: (algorithm: string | { name: string }, data: BufferSource) => {
          const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
          if (name.toUpperCase() !== 'SHA-256') throw new Error('Unsupported auth digest algorithm');
          return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data);
        },
      },
    });
  }
}
