import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = {...process.env, PORT:'3007'};
delete env.PATCHBOUNTY_TESTNET_CONFIG;
delete env.NEAR_AI_API_KEY; // Browser CI never incurs inference charges.
const server = spawn('bash', ['scripts/start.sh', '--low-fd'], {cwd:repo, env, detached:true, stdio:['ignore','pipe','pipe']});
let log=''; server.stdout.on('data', data=>{log+=data;}); server.stderr.on('data', data=>{log+=data;});
async function ready(){
  for(let i=0;i<120;i++){
    if(log.includes('PatchBounty ready')) return;
    if(server.exitCode !== null)throw Error(log);
    await new Promise(r=>setTimeout(r,500));
  }
  throw Error('Server startup timed out: '+log);
}
let browser;
try {
 await ready();
 browser=await chromium.launch({executablePath:process.env.PATCHBOUNTY_BROWSER || undefined,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3007/');
 await page.getByText('No challenges yet.',{exact:false}).waitFor();
 await page.locator('#new-challenge').click();
 await page.locator('#title').fill('Authorization edge cases');
 await page.getByRole('button',{name:'Fund challenge',exact:true}).click();
 await page.locator('#candidate-form').waitFor({timeout:60000});
 await page.locator('#candidate').fill('{"user":"alice","user":"bob","path":"/accounts/bob/profile"}');
 await page.getByRole('button',{name:'Submit claim',exact:true}).click();
 await page.locator('#notice.error').waitFor();
 if(!(await page.locator('#notice').innerText()).includes('unique keys'))throw Error('duplicate keys accepted');
 await page.getByRole('button',{name:'Benign sample',exact:true}).click();
 await page.getByRole('button',{name:'Submit claim',exact:true}).click();
 await page.locator('#verify').waitFor({timeout:60000});
 await page.locator('#verify').click();
 await page.locator('#settle').waitFor({timeout:60000});
 if(await page.locator('#settle').innerText()!=='Reject claim')throw Error('benign claim rewarded');
 await page.locator('#settle').click();
 await page.locator('#candidate-form').waitFor({timeout:60000});
 await page.getByRole('button',{name:'Qualifying sample',exact:true}).click();
 await page.getByRole('button',{name:'Submit claim',exact:true}).click();
 await page.locator('#verify').waitFor({timeout:60000});await page.locator('#verify').click();
 await page.locator('#settle').waitFor({timeout:60000});
 if(await page.locator('#settle').innerText()!=='Approve reward payout')throw Error('eligible decision missing');

 await page.locator('#settle').click();
 await page.getByText('Reward paid to the recorded claimant',{exact:true}).waitFor({timeout:60000});

 const session=await (await page.request.get('http://127.0.0.1:3007/api/session')).json();
 const challenge=session.challenges[0];const settlement=challenge.attempts.at(-1).settlement;
 if(BigInt(settlement.balanceAfter)-BigInt(settlement.balanceBefore)!==80000000000000000000000n)throw Error('wrong payout delta');
 const forged=await page.request.post('http://127.0.0.1:3007/api/challenges/0/settle',{data:{}});
 if(forged.status()!==403)throw Error('missing token accepted');
 const foreign=await page.request.get('http://127.0.0.1:3007/api/session',{headers:{Origin:'http://attacker.example'}});
 if(foreign.status()!==403)throw Error('foreign origin accepted');
 const replay=await page.request.post('http://127.0.0.1:3007/api/challenges/0/settle',{data:{},headers:{'X-PatchBounty-Token':session.token,'X-Request-ID':randomUUID()}});
 if(replay.status()!==400)throw Error('repeat settlement accepted');
 await page.reload();await page.getByText('Reward paid to the recorded claimant',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('mobile overflow');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: real local-chain create, invalid input, benign rejection, eligible verification, exact payout, replay rejection, origin/token checks, reload and mobile layout.');
} finally {
 if(browser)await browser.close();
 try { process.kill(-server.pid, 'SIGTERM'); } catch {}
 await new Promise(resolve => { if(server.exitCode!==null)return resolve(); server.once('close',resolve); setTimeout(resolve,10000).unref(); });
}
