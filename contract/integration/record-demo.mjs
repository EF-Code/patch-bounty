import {chromium} from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const response=await fetch('http://127.0.0.1:3000/api/session');
if((await response.json()).network!=='local-sandbox')throw Error('Recording automation is restricted to simulated local funds.');
const browser=await chromium.launch({executablePath:process.env.PATCHBOUNTY_BROWSER || undefined,args:['--no-sandbox']});
const dir=path.join(repo,'.patchbounty','recordings');await fs.mkdir(dir,{recursive:true});
const context=await browser.newContext({viewport:{width:1280,height:900},recordVideo:{dir,size:{width:1280,height:900}}});
const page=await context.newPage();
try {
 await page.goto('http://127.0.0.1:3000/');
 await page.locator('#new-challenge').click();await page.locator('#title').fill('Challenge the authorization patch');
 await page.getByRole('button',{name:'Fund challenge',exact:true}).click();
 await page.locator('#candidate-form').waitFor({timeout:60000});
 for(const sample of ['Benign sample','Qualifying sample']) {
  await page.getByRole('button',{name:sample,exact:true}).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button',{name:'Submit claim',exact:true}).click();
  await page.locator('#verify').waitFor({timeout:60000});await page.locator('#verify').click();
  await page.locator('#settle').waitFor({timeout:60000});await page.locator('#settle').scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000);await page.locator('#settle').click();
  if(sample==='Benign sample')await page.locator('#candidate-form').waitFor({timeout:60000});
 }
 await page.getByText('Reward paid to the recorded claimant',{exact:true}).waitFor({timeout:60000});
 await page.getByText('Reward paid to the recorded claimant',{exact:true}).scrollIntoViewIfNeeded();
 await page.waitForTimeout(4000);
 const video=page.video();await page.close();await context.close();console.log(await video.path());
} finally {await browser.close();}
