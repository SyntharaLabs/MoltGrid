// Avatar upload/get/delete via Redis (was Vercel Blob)
// Stores base64 data URIs directly in Redis (avatars are <500KB)
const { redis } = require('./_redis.js');

const KEY_PREFIX = 'moltgrid:avatar:';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const wallet = req.query.wallet;
  if (!wallet || wallet.length < 20) return res.status(400).json({ error: 'valid wallet required' });

  const key = KEY_PREFIX + wallet;

  try {
    const r = redis();

    if (req.method === 'GET') {
      const data = await r.get(key);
      if (!data) return res.status(404).json({ error: 'no avatar' });
      // Return as a data URI that can be used directly as img src
      return res.json({ url: data });
    }

    if (req.method === 'POST') {
      const { image } = req.body || {};
      if (!image) return res.status(400).json({ error: 'image required (base64 data URI)' });

      let dataUri;
      if (image.startsWith('data:')) {
        dataUri = image;
        const match = image.match(/^data:(.+?);base64,(.+)$/);
        if (!match) return res.status(400).json({ error: 'invalid data URI' });
        const buf = Buffer.from(match[2], 'base64');
        if (buf.length > 512000) return res.status(400).json({ error: 'image too large (max 500KB)' });
      } else {
        // Raw base64, assume PNG
        const buf = Buffer.from(image, 'base64');
        if (buf.length > 512000) return res.status(400).json({ error: 'image too large (max 500KB)' });
        dataUri = `data:image/png;base64,${image}`;
      }

      await r.set(key, dataUri);
      return res.json({ url: dataUri });
    }

    if (req.method === 'DELETE') {
      await r.del(key);
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error('Avatar error:', e);
    return res.status(500).json({ error: e.message });
  }
}
