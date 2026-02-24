// Online presence tracker via Redis (was Vercel Blob)
const { redis } = require('./_redis.js');

const KEY = 'moltgrid:presence';
const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;

async function getPresence() {
  try {
    const r = redis();
    const raw = await r.get(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function savePresence(data) {
  const r = redis();
  await r.set(KEY, JSON.stringify(data));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      const { wallet } = req.body || {};
      if (!wallet || wallet.length < 20) return res.status(400).json({ error: 'wallet required' });

      const users = await getPresence();
      users[wallet] = Date.now();
      const cutoff = Date.now() - 86400000;
      for (const w of Object.keys(users)) { if (users[w] < cutoff) delete users[w]; }
      await savePresence(users);
      return res.json({ ok: true });
    }

    if (req.method === 'GET') {
      const users = await getPresence();
      const now = Date.now();

      if (req.query.list) {
        const result = {};
        for (const [w, ts] of Object.entries(users)) {
          result[w] = { lastSeen: ts, online: (now - ts) < ONLINE_THRESHOLD_MS };
        }
        return res.json({ users: result });
      }

      const wallet = req.query.wallet;
      if (!wallet) return res.status(400).json({ error: 'wallet required' });
      const ts = users[wallet];
      if (!ts) return res.json({ lastSeen: null, online: false });
      return res.json({ lastSeen: ts, online: (now - ts) < ONLINE_THRESHOLD_MS });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error('Presence error:', e);
    return res.status(500).json({ error: e.message });
  }
}
