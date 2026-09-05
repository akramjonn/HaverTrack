import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { connect,loadEnv } from './db';

// Configures only this feature's secrets/job. Secret values never reach logs or disk.
async function main(){
  loadEnv();
  const url=process.env.SUPABASE_URL??process.env.EXPO_PUBLIC_SUPABASE_URL;
  if(!url||!/^https:\/\/[a-z]+\.supabase\.co$/.test(url))throw new Error('A Supabase project URL is required.');
  const secret=randomBytes(32).toString('hex');
  const project=new URL(url).hostname.split('.')[0];
  const set=spawnSync('supabase',['secrets','set','--project-ref',project,'--env-file','/dev/stdin'],{input:`RATING_DISPATCH_SECRET=${secret}\nRATING_DISPATCH_ENABLED=true\n`,encoding:'utf8'});
  if(set.status!==0)throw new Error('Could not configure the Edge Function secrets. No scheduler was installed.');
  const db=await connect();
  try{
    await db.query('begin');
    const existing=await db.query(`select id from vault.secrets where name='havertrack_rating_dispatch_secret'`);
    if(existing.rows.length)await db.query(`select vault.update_secret($1,$2)`,[existing.rows[0].id,secret]);
    else await db.query(`select vault.create_secret($1,'havertrack_rating_dispatch_secret','Meal-rating scheduler authentication')`,[secret]);
    const job=`select net.http_post(url := '${url}/functions/v1/send-rating-reminders', headers := jsonb_build_object('Content-Type','application/json','x-dispatch-secret',(select decrypted_secret from vault.decrypted_secrets where name='havertrack_rating_dispatch_secret')), body := '{}'::jsonb, timeout_milliseconds := 55000);`;
    await db.query(`select cron.schedule('havertrack-rating-reminders','* * * * *',$1)`,[job]);
    await db.query('commit');
    const invoke=await fetch(`${url}/functions/v1/send-rating-reminders`,{method:'POST',headers:{'x-dispatch-secret':secret,'Content-Type':'application/json'},body:'{}'});
    if(!invoke.ok)throw new Error(`Scheduler configured, but worker verification returned HTTP ${invoke.status}.`);
    const body=await invoke.json();
    console.log(`Rating scheduler configured and verified. Jobs attempted: ${body.attempted??0}.`);
  }catch(e){await db.query('rollback');throw e;}finally{await db.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
