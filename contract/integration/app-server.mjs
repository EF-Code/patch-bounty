import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createChain} from './app-chain.mjs';
import {Application, helper} from './app-service.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const python = process.env.PATCHBOUNTY_PYTHON || 'python3';
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('PORT must be 1024–65535.');
const configFile = process.env.PATCHBOUNTY_TESTNET_CONFIG;
if (configFile && !process.argv.includes('--testnet-spending-authorized')) throw Error('Testnet mode spends testnet NEAR. Start with --testnet-spending-authorized after reviewing the configured accounts.');
const dataDir = path.join(repo, '.patchbounty', 'runs');
const token = randomBytes(32).toString('hex');
const origin = `http://127.0.0.1:${port}`;
const headers = {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
let chain;
try {
  // Preflight real sandbox execution before starting a chain or loading signing keys.
  await helper(repo, python, 'verify', '{"user":"alice","path":"/accounts/alice/profile"}');
  chain = await createChain({wasm:path.join(repo,'contract/target/wasm32-unknown-unknown/release/patchbounty_escrow_near.wasm'), configFile, repo});
  const app = await new Application({repo, python, chain, dataDir}).init();
  let queue = Promise.resolve();
  const requests = new Map();
  const json = (res, code, data) => { res.writeHead(code, headers); res.end(JSON.stringify(data)); };
  async function body(req) {
    if (req.headers['content-type'] !== 'application/json') throw Error('Content-Type must be application/json.');
    let data = ''; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 8192) throw Error('Request exceeds 8192 bytes.'); data += chunk; }
    const parsed = JSON.parse(data || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('Request must be an object.');
    return parsed;
  }
  async function route(req, res, url) {
    if (req.method === 'GET' && url === '/api/session') return json(res, 200, {token, ...await app.session()});
    if (req.method === 'GET' && url === '/api/export') {
      res.writeHead(200, {...headers, 'Content-Disposition':'attachment; filename="patchbounty-run.json"'});
      return res.end(JSON.stringify(app.data, null, 2) + '\n');
    }
    if (req.method === 'GET' && url === '/api/archives') {
      const names = (await fs.readdir(dataDir)).filter(n => /^[a-zA-Z0-9._-]+\.json$/.test(n));
      return json(res, 200, names);
    }
    const archived = url.match(/^\/api\/archives\/([a-zA-Z0-9._-]+\.json)$/);
    if (req.method === 'GET' && archived) {
      const bytes = await fs.readFile(path.join(dataDir, archived[1]));
      res.writeHead(200, {...headers, 'Content-Disposition':'attachment; filename="patchbounty-archive.json"'}); return res.end(bytes);
    }
    const evidence = url.match(/^\/api\/challenges\/(\d+)\/evidence\/(\d+)$/);
    if (req.method === 'GET' && evidence) {
      const item = app.challenge(evidence[1]);
      const attempt = item.attempts.find(a => a.claimId === evidence[2]);
      if (!attempt?.evidenceBytes) throw Error('No successful verification evidence for this claim.');
      res.writeHead(200, {...headers, 'Content-Disposition':'attachment; filename="patchbounty-evidence.json"'}); return res.end(attempt.evidenceBytes);
    }
    if (req.method !== 'POST') return json(res, 404, {error:'Not found.'});
    if (req.headers['x-patchbounty-token'] !== token) return json(res, 403, {error:'Refresh the application before making changes.'});
    const data = await body(req);
    const requestId = req.headers['x-request-id'];
    if (typeof requestId !== 'string' || !/^[0-9a-f-]{36}$/.test(requestId)) throw Error('A UUID request ID is required.');
    const fingerprint = JSON.stringify({url, data});
    if (requests.has(requestId)) {
      const previous = requests.get(requestId);
      if (previous.fingerprint !== fingerprint) throw Error('Request ID was already used for another action.');
      return json(res, previous.status, previous.result);
    }
    if (requests.size >= 10000) throw Error('Session request limit reached; restart the operator application.');
    let result, status = 200;
    try {
      if (url === '/api/challenges') result = await app.create(data);
      else if (url === '/api/generate') result = await helper(repo, python, 'generate');
      else {
        const match = url.match(/^\/api\/challenges\/(\d+)\/(claim|verify|settle|refund|retry)$/);
        if (!match) return json(res, 404, {error:'Not found.'});
        const [, id, action] = match;
        if (action === 'claim') result = await app.claim(id, data);
        else if (action === 'verify') result = await app.verify(id);
        else if (action === 'settle') result = await app.settle(id);
        else result = await app.recover(id, action);
      }
    } catch (error) { status = 400; result = {error:error.message}; }
    requests.set(requestId, {fingerprint, status, result});
    return json(res, status, result);
  }
  const server = http.createServer((req, res) => {
    if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, {error:'Only the local application origin is allowed.'});
    const url = req.url;
    const staticFiles = {'/':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/style.css':['style.css','text/css']};
    if (req.method === 'GET' && staticFiles[url]) {
      const [name, type] = staticFiles[url];
      fs.readFile(path.join(repo,'app',name)).then(bytes => {res.writeHead(200, {...headers,'Content-Type':type+'; charset=utf-8'});res.end(bytes);}).catch(() => json(res,500,{error:'Application assets unavailable.'}));
      return;
    }
    queue = queue.then(() => route(req,res,url)).catch(error => {if (!res.headersSent) json(res,400,{error:error.message}); else res.end();});
  });
  server.requestTimeout = 90000; server.headersTimeout = 10000;
  server.on('error', async error => {console.error('Unable to listen: ' + error.code); await chain.close(); process.exit(1);});
  server.listen(port, '127.0.0.1', () => console.log(`PatchBounty ready at ${origin} (${chain.network}). Public run evidence: ${app.file}`));
  let stopping = false;
  async function stop() { if (stopping) return; stopping = true; server.close(); await queue; await app.save(); await chain.close(); process.exit(0); }
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
} catch (error) {
  console.error('Application startup failed: ' + error.message);
  if (chain) await chain.close();
  process.exit(1);
}
