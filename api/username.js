// Username storage via Redis (was Vercel Blob)
// GET ?wallet=xxx → { username }
// POST { wallet, username } → { ok }
// GET ?list=1 → { users: { wallet: username, ... } }
const { redis } = require('./_redis.js');

const KEY = 'moltgrid:usernames';

async function getUsers() {
  try {
    const r = redis();
    const raw = await r.get(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Redis username GET:', e.message);
    return {};
  }
}

async function saveUsers(users) {
  const r = redis();
  await r.set(KEY, JSON.stringify(users));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const users = await getUsers();
      if (req.query.list) return res.json({ users });
      const wallet = req.query.wallet;
      if (!wallet) return res.status(400).json({ error: 'wallet required' });
      return res.json({ username: users[wallet] || null });
    }

    if (req.method === 'POST') {
      const { wallet, username } = req.body || {};
      if (!wallet || wallet.length < 20) return res.status(400).json({ error: 'valid wallet required' });
      if (!username || username.length < 2 || username.length > 24) return res.status(400).json({ error: 'username must be 2-24 characters' });
      if (!/^[a-zA-Z0-9_ -]+$/.test(username)) return res.status(400).json({ error: 'username can only contain letters, numbers, spaces, underscores, hyphens' });

      const users = await getUsers();
      const lowerName = username.toLowerCase();
      for (const [w, u] of Object.entries(users)) {
        if (w !== wallet && u.toLowerCase() === lowerName) return res.status(409).json({ error: 'username already taken' });
      }

      users[wallet] = username;
      await saveUsers(users);
      return res.json({ ok: true, username });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error('Username error:', e);
    return res.status(500).json({ error: e.message });
  }
}
