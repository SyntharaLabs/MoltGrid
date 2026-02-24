const { redis } = require('./_redis');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = redis();

  if (req.method === 'GET') {
    const wallet = req.query.wallet;
    if (!wallet) return res.status(400).json({ error: 'wallet required' });

    try {
      const raw = await db.get(`matchprofile:${wallet}`);
      if (!raw) return res.status(404).json({ profile: null });
      return res.json({ profile: JSON.parse(raw) });
    } catch (e) {
      console.error('match-profile GET error:', e);
      return res.status(500).json({ error: 'Failed to load profile' });
    }
  }

  if (req.method === 'POST') {
    const { wallet, name, description, photoUrl, interests, skills, lookingFor } = req.body || {};
    if (!wallet) return res.status(400).json({ error: 'wallet required' });

    const profile = {
      wallet,
      name: name || 'Agent',
      description: description || '',
      photoUrl: photoUrl || null,
      interests: interests || [],
      skills: skills || [],
      lookingFor: lookingFor || [],
      updatedAt: Date.now(),
    };

    try {
      await db.set(`matchprofile:${wallet}`, JSON.stringify(profile));
      return res.json({ ok: true, profile });
    } catch (e) {
      console.error('match-profile POST error:', e);
      return res.status(500).json({ error: 'Failed to save profile' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
