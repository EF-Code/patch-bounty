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
try { await fs.access(configFile); throw Error('A testnet configuration already exists. Reuse it or archive it before provisioning another demo.'); } catch(error) { if(error.code!=='ENOENT')throw error; }
const store=new keyStores.UnencryptedFileSystemKeyStore(keysDirectory);
const rootId=`pb-app-${Date.now()}.testnet`;
async function keyFor(accountId) {
 const key=KeyPair.fromRandom('ed25519');
 await store.setKey('testnet',accountId,key);
 await fs.chmod(path.join(keysDirectory,'testnet',accountId+'.json'),0o600);
 return key.getPublicKey();
}
const publicKey=await keyFor(rootId);
console.log('Requesting faucet funds for dedicated test account '+rootId);
const response=await fetch('https://helper.testnet.near.org/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({newAccountId:rootId,newAccountPublicKey:publicKey.toString()})});
if(!response.ok)throw Error('Testnet faucet returned HTTP '+response.status+'. Keys were saved outside the repository; do not repeat funding automatically.');
await response.arrayBuffer();
const near=await connect({networkId:'testnet',nodeUrl:'https://rpc.testnet.near.org',keyStore:store});
const root=await near.account(rootId);
const accounts={};
for(const [role,amount] of [['contract','3'],['creator','1'],['verifier','0.2'],['claimant','0.2']]) {
 const id=`${role}.${rootId}`;
 const key=await keyFor(id);
 const [whole,fraction='']=amount.split('.');
 const yocto=BigInt(whole)*10n**24n+BigInt(fraction.padEnd(24,'0'));
 await root.createAccount(id,key,yocto.toString());
 accounts[role]=id;
 console.log('Created '+role+' account '+id);
}
await (await near.account(accounts.contract)).deployContract(wasm);
await fs.writeFile(configFile,JSON.stringify({...accounts,keysDirectory},null,2)+'\n',{flag:'wx',mode:0o600});
console.log('Deployment complete. Start the application with:');
console.log('PATCHBOUNTY_TESTNET_CONFIG='+configFile+' scripts/start.sh --testnet-spending-authorized');
