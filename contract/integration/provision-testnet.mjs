#!/usr/bin/env node
// Dedicated testnet accounts only. Never creates a mainnet account or buys credits.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {connect, keyStores, KeyPair} from 'near-api-js';

if (!process.argv.includes('--testnet-spending-authorized')) throw Error('This creates faucet-funded testnet accounts and deploys a contract. Pass --testnet-spending-authorized to proceed.');
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const wasm=await fs.readFile(path.join(repo,'contract/target/wasm32-unknown-unknown/release/patchbounty_escrow_near.wasm'));
const keysDirectory=path.join(os.homedir(),'.near-credentials');
const configDirectory=path.join(os.homedir(),'.config','patchbounty');
await fs.mkdir(path.join(keysDirectory,'testnet'),{recursive:true,mode:0o700});
await fs.mkdir(configDirectory,{recursive:true,mode:0o700});
const configFile=path.join(configDirectory,'testnet.json');
try { await fs.access(configFile); console.log('Reusing existing configuration: '+configFile); process.exit(0); } catch(error) { if(error.code!=='ENOENT')throw error; }
const store=new keyStores.UnencryptedFileSystemKeyStore(keysDirectory);
const progressFile=path.join(configDirectory,'provisioning.json');
let progress;
try { progress=JSON.parse(await fs.readFile(progressFile,'utf8')); } catch(error) { if(error.code!=='ENOENT')throw error; progress={rootId:`pb-app-${Date.now()}.testnet`,faucetRequested:false}; }
const rootId=progress.rootId;
async function saveProgress(){await fs.writeFile(progressFile,JSON.stringify(progress,null,2)+'\n',{mode:0o600});}
await saveProgress();
async function keyFor(accountId) {
 const existing=await store.getKey('testnet',accountId);
 if(existing)return existing.getPublicKey();
 const key=KeyPair.fromRandom('ed25519');
 await store.setKey('testnet',accountId,key);
 await fs.chmod(path.join(keysDirectory,'testnet',accountId+'.json'),0o600);
 return key.getPublicKey();
}
const publicKey=await keyFor(rootId);
const near=await connect({networkId:'testnet',nodeUrl:'https://test.rpc.fastnear.com',keyStore:store});
const root=await near.account(rootId);
async function exists(accountId){
 try { await (await near.account(accountId)).state(); return true; }
 catch(error){ if(error.type==='AccountDoesNotExist' || error.type==='UnknownAccount')return false; throw error; }
}
if(!(await exists(rootId))){
 if(progress.faucetRequested)throw Error('An earlier faucet request has an uncertain result. Inspect '+rootId+' before requesting funds again. Progress and keys were retained outside the repository.');
 console.log('Requesting faucet funds for dedicated test account '+rootId);
 progress.faucetRequested=true;await saveProgress();
 const response=await fetch('https://helper.testnet.near.org/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({newAccountId:rootId,newAccountPublicKey:publicKey.toString()})});
 if(!response.ok)throw Error('Testnet faucet returned HTTP '+response.status+'. Progress and keys were saved; do not repeat funding automatically.');
 await response.arrayBuffer();
}
const accounts={};
for(const [role,amount] of [['contract','3'],['creator','1'],['verifier','0.2'],['claimant','0.2']]) {
 const id=`${role}.${rootId}`;
 const key=await keyFor(id);
 const [whole,fraction='']=amount.split('.');
 const yocto=BigInt(whole)*10n**24n+BigInt(fraction.padEnd(24,'0'));
 if(!(await exists(id)))await root.createAccount(id,key,yocto.toString());
 accounts[role]=id;
 console.log('Created '+role+' account '+id);
}
await (await near.account(accounts.contract)).deployContract(wasm);
progress.completed=true;await saveProgress();
await fs.writeFile(configFile,JSON.stringify({...accounts,keysDirectory},null,2)+'\n',{flag:'wx',mode:0o600});
console.log('Deployment complete. Start the application with:');
console.log('PATCHBOUNTY_TESTNET_CONFIG='+configFile+' scripts/start.sh --testnet-spending-authorized');
