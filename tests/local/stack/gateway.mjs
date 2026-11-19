// Local stand-in for the Supabase API gateway (Kong) on :54321.
// /auth/v1/*  -> Supabase Auth (GoTrue) on :9999
// /rest/v1/*  -> PostgREST on :3000
// /storage/v1/* -> a small in-process storage stub (files on disk, metadata in memory + storage.objects)
// Test-only. Never deployed.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = '/home/claude/stack/storage';
const SECRET = process.env.JWT_SECRET || 'local-only-jwt-secret-for-yuppie-tests-0123456789abcdef';
const PORT = 54321;

function forward(req, res, port, stripPrefix) {
  const headers = { ...req.headers };
  if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
  headers.host = `127.0.0.1:${port}`;
  const target = req.url.slice(stripPrefix.length) || '/';
  const p = http.request({ host: '127.0.0.1', port, path: target, method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  p.on('error', (e) => { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ message: String(e) })); });
  req.pipe(p);
}

function readBody(req) {
  return new Promise((resolve) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => resolve(Buffer.concat(c))); });
}
function json(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(obj)); }
function metaPath(bucket, name) { return path.join(ROOT, bucket, name + '.__meta.json'); }
function filePath(bucket, name) {
  const p = path.join(ROOT, bucket, name);
  if (!p.startsWith(path.join(ROOT, bucket))) throw new Error('bad path');
  return p;
}
function sign(bucket, name, expiresIn) {
  const exp = Math.floor(Date.now() / 1000) + expiresIn;
  const payload = Buffer.from(JSON.stringify({ url: `${bucket}/${name}`, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verify(token, bucket, name) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return false;
  const good = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (good !== sig) return false;
  const p = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return p.url === `${bucket}/${name}` && p.exp > Date.now() / 1000;
}
function serveFile(res, bucket, name) {
  let fp; try { fp = filePath(bucket, name); } catch { return json(res, 400, { error: 'bad path' }); }
  if (!fs.existsSync(fp)) return json(res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
  let ct = 'application/octet-stream';
  try { ct = JSON.parse(fs.readFileSync(metaPath(bucket, name))).contentType || ct; } catch {}
  res.writeHead(200, { 'content-type': ct, 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
  fs.createReadStream(fp).pipe(res);
}

// ---- private buckets (added 30 Oct 2026, stage 2 foundation). The real storage API runs every request as the
// caller's role against storage.objects' RLS; the stage 2 migration gives anon and authenticated no access to a
// private bucket (member-photos). The stub stands in for that: a bucket whose storage.buckets.public is false has
// no public URL, and only a valid service_role token may read, list, upload, delete or sign in it. A signed URL
// (object/sign/... ?token=) works for whoever holds it, as in Supabase. Public buckets behave exactly as before,
// and a bucket missing from storage.buckets counts as public (the stub's old behaviour).
function b64url(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64url'); }
function serviceJwt() {
  const h = b64url({ alg: 'HS256', typ: 'JWT' });
  const p = b64url({ role: 'service_role', iss: 'gateway-stub', exp: Math.floor(Date.now() / 1000) + 60 });
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
function roleOf(req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : String(req.headers.apikey || '');
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) return 'anon';
  if (crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url') !== sig) return 'invalid';
  try {
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (claims.exp && claims.exp < Date.now() / 1000) return 'invalid';
    return claims.role || 'anon';
  } catch { return 'invalid'; }
}
const bucketCache = new Map();
async function isPrivate(bucket) {
  const hit = bucketCache.get(bucket);
  if (hit && hit.at > Date.now() - 3000) return hit.private;
  let priv = false;
  try {
    const r = await fetch(`http://127.0.0.1:3000/buckets?id=eq.${encodeURIComponent(bucket)}&select=public`, { headers: { Authorization: `Bearer ${serviceJwt()}`, 'Accept-Profile': 'storage' } });
    const rows = await r.json();
    priv = Array.isArray(rows) && rows[0] ? rows[0].public === false : false;
  } catch { priv = false; }
  bucketCache.set(bucket, { at: Date.now(), private: priv });
  return priv;
}
const denied = (res) => json(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });

async function storage(req, res) {
  const u = new URL(req.url, 'http://x');
  const parts = u.pathname.replace(/^\/storage\/v1\//, '').split('/').map(decodeURIComponent);
  if (parts[0] === 'object') {
    // Which bucket the request is about: object/<bucket>/..., object/public|sign|list|authenticated/<bucket>/...
    const bucket = ['public', 'sign', 'list', 'authenticated', 'info'].includes(parts[1]) ? parts[2] : parts[1];
    const signedGet = parts[1] === 'sign' && req.method === 'GET';
    if (bucket && !signedGet && (await isPrivate(bucket))) {
      if (parts[1] === 'public') return json(res, 400, { statusCode: '400', error: 'InvalidRequest', message: 'The bucket is not public' });
      if (roleOf(req) !== 'service_role') return denied(res);
    }
  }
  // object/public/:bucket/...name
  if (parts[0] === 'object' && parts[1] === 'public' && req.method === 'GET') return serveFile(res, parts[2], parts.slice(3).join('/'));
  // object/authenticated/:bucket/...name (a read with the caller's token; private buckets checked above)
  if (parts[0] === 'object' && parts[1] === 'authenticated' && req.method === 'GET') return serveFile(res, parts[2], parts.slice(3).join('/'));
  if (parts[0] === 'object' && parts[1] === 'sign') {
    const bucket = parts[2]; const name = parts.slice(3).join('/');
    if (req.method === 'GET') {
      if (!verify(u.searchParams.get('token'), bucket, name)) return json(res, 400, { error: 'InvalidSignature' });
      return serveFile(res, bucket, name);
    }
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    if (body.paths) return json(res, 200, body.paths.map((p) => ({ path: p, signedURL: `/object/sign/${bucket}/${p}?token=${sign(bucket, p, body.expiresIn || 60)}`, error: null })));
    return json(res, 200, { signedURL: `/object/sign/${bucket}/${name}?token=${sign(bucket, name, body.expiresIn || 60)}` });
  }
  if (parts[0] === 'object' && parts[1] === 'list') {
    const bucket = parts[2]; const body = JSON.parse((await readBody(req)).toString() || '{}');
    const dir = path.join(ROOT, bucket, body.prefix || '');
    const items = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.endsWith('.__meta.json')).map((n) => ({ name: n, id: n, metadata: {} })) : [];
    return json(res, 200, items);
  }
  if (parts[0] === 'object' && req.method === 'DELETE' && parts.length === 2) {
    const bucket = parts[1]; const body = JSON.parse((await readBody(req)).toString() || '{}');
    const out = [];
    for (const p of body.prefixes || []) { try { fs.rmSync(filePath(bucket, p)); fs.rmSync(metaPath(bucket, p), { force: true }); out.push({ name: p }); } catch {} }
    return json(res, 200, out);
  }
  if (parts[0] === 'object' && (req.method === 'POST' || req.method === 'PUT')) {
    const bucket = parts[1]; const name = parts.slice(2).join('/');
    const body = await readBody(req);
    let data = body; let ct = req.headers['content-type'] || 'application/octet-stream';
    if (ct.startsWith('multipart/form-data')) {
      // supabase-js sends a Blob/Buffer directly for Buffers; FormData only for File in browsers. Minimal multipart parse.
      const boundary = '--' + ct.split('boundary=')[1];
      const s = body.toString('latin1'); const seg = s.split(boundary).find((x) => x.includes('filename='));
      if (seg) { const i = seg.indexOf('\r\n\r\n'); const m = /Content-Type: ([^\r\n]+)/i.exec(seg); ct = m ? m[1] : ct; data = Buffer.from(seg.slice(i + 4, seg.length - 2), 'latin1'); }
    }
    const fp = filePath(bucket, name);
    if (fs.existsSync(fp) && req.method === 'POST' && req.headers['x-upsert'] !== 'true') return json(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, data);
    fs.writeFileSync(metaPath(bucket, name), JSON.stringify({ contentType: ct, size: data.length }));
    return json(res, 200, { Key: `${bucket}/${name}`, Id: crypto.randomUUID(), path: name });
  }
  if (parts[0] === 'object' && req.method === 'GET') return serveFile(res, parts[1], parts.slice(2).join('/'));
  // bucket/<id> (getBucket): the row from storage.buckets (added 30 Oct 2026). Anything else under bucket/: [] as before.
  if (parts[0] === 'bucket' && req.method === 'GET' && parts[1]) {
    const r = await fetch(`http://127.0.0.1:3000/buckets?id=eq.${encodeURIComponent(parts[1])}&select=id,name,public,file_size_limit,allowed_mime_types,created_at,updated_at`, { headers: { Authorization: `Bearer ${serviceJwt()}`, 'Accept-Profile': 'storage' } });
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows[0]) return json(res, 404, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
    return json(res, 200, rows[0]);
  }
  if (parts[0] === 'bucket') return json(res, 200, []);
  return json(res, 404, { error: 'not implemented in local stub', path: u.pathname, method: req.method });
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }); return res.end(); }
  if (req.url.startsWith('/templates/')) {
    // Auth email templates: the repo's supabase/templates/<name>.html if present, else the local minimal one.
    const name = path.basename(req.url.split('?')[0]);
    const repo = process.env.TEMPLATES_REPO || '/home/claude/co';
    const cands = [path.join(repo, 'supabase/templates', name), path.join('/home/claude/stack/templates', name)];
    const f = cands.find((c) => fs.existsSync(c));
    if (!f) return json(res, 404, { error: 'no template' });
    res.writeHead(200, { 'content-type': 'text/html' }); return res.end(fs.readFileSync(f));
  }
  if (req.url.startsWith('/auth/v1')) return forward(req, res, 9999, '/auth/v1');
  if (req.url.startsWith('/rest/v1')) return forward(req, res, 3000, '/rest/v1');
  if (req.url.startsWith('/storage/v1')) return storage(req, res).catch((e) => json(res, 500, { error: String(e) }));
  json(res, 404, { error: 'unknown route' });
}).listen(PORT, process.env.GATEWAY_HOST || '127.0.0.1', () => console.log('gateway on', PORT));
