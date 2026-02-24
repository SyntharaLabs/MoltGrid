// Minimal Redis client for Vercel serverless (Node.js runtime)
const net = require('net');

const REDIS_URL = process.env.REDIS_URL || '';

function parseURL(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port) || 6379,
    password: decodeURIComponent(u.password),
    username: u.username || 'default',
  };
}

function encode(...args) {
  const parts = ['*' + args.length];
  for (const a of args) {
    const s = String(a);
    parts.push('$' + Buffer.byteLength(s), s);
  }
  return parts.join('\r\n') + '\r\n';
}

function execCmd(cfg, ...args) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: cfg.host, port: cfg.port }, () => {
      sock.write(encode('AUTH', cfg.username, cfg.password));
    });

    let phase = 0;
    let buf = Buffer.alloc(0);

    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      const str = buf.toString();

      if (phase === 0) {
        // Wait for AUTH +OK
        const idx = str.indexOf('\r\n');
        if (idx === -1) return;
        const line = str.slice(0, idx);
        if (line.startsWith('-')) { sock.destroy(); return reject(new Error(line)); }
        phase = 1;
        buf = Buffer.alloc(0);
        sock.write(encode(...args));
      } else {
        // Parse reply
        const idx = str.indexOf('\r\n');
        if (idx === -1) return;
        const first = str.slice(0, idx);

        if (first.startsWith('+')) { sock.destroy(); resolve(first.slice(1)); }
        else if (first.startsWith('-')) { sock.destroy(); reject(new Error(first.slice(1))); }
        else if (first.startsWith(':')) { sock.destroy(); resolve(parseInt(first.slice(1))); }
        else if (first.startsWith('$')) {
          const len = parseInt(first.slice(1));
          if (len === -1) { sock.destroy(); resolve(null); return; }
          const dataStart = idx + 2;
          const needed = dataStart + len + 2;
          if (buf.length >= needed) {
            sock.destroy();
            resolve(buf.slice(dataStart, dataStart + len).toString());
          }
          // else wait for more data
        }
      }
    });

    sock.on('error', (e) => { reject(e); });
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('redis timeout')); }, 8000);
    sock.on('close', () => clearTimeout(timer));
  });
}

function makeClient() {
  if (!REDIS_URL) throw new Error('No REDIS_URL');
  const cfg = parseURL(REDIS_URL);
  return {
    get: (key) => execCmd(cfg, 'GET', key),
    set: (key, val) => execCmd(cfg, 'SET', key, val),
    del: (key) => execCmd(cfg, 'DEL', key),
  };
}

// CommonJS + ESM compat
module.exports = { redis: makeClient };
module.exports.redis = makeClient;
