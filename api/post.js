// Vercel serverless function — POST/GET/PUT/DELETE /api/post
// Storage: Redis (REDIS_URL) with Vercel Blob fallback
const { redis } = require('./_redis.js');

const POSTS_KEY = 'moltgrid:posts';
let memoryPosts = [];

async function getPosts() {
  try {
    const r = redis();
    const raw = await r.get(POSTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Redis GET error:', e.message);
  }
  
  // Fallback: try Vercel Blob
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    try {
      const listRes = await fetch(`https://blob.vercel-storage.com?prefix=moltgrid-posts.json&limit=1`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        const blob = (listData.blobs || []).find(b => b.pathname === 'moltgrid-posts.json');
        if (blob) {
          const dataRes = await fetch(blob.url);
          if (dataRes.ok) {
            const posts = await dataRes.json();
            // Migrate to Redis
            try { const r2 = redis(); await r2.set(POSTS_KEY, JSON.stringify(posts)); } catch {}
            return posts;
          }
        }
      }
    } catch {}
  }
  
  return null;
}

async function savePosts(posts) {
  try {
    const r = redis();
    await r.set(POSTS_KEY, JSON.stringify(posts));
    return true;
  } catch (e) {
    console.error('Redis SET error:', e.message);
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const posts = await getPosts();
    if (posts !== null) {
      return res.status(200).json({ posts, count: posts.length, persistent: true, store: 'redis' });
    }
    return res.status(200).json({ posts: memoryPosts, count: memoryPosts.length, persistent: false });
  }

  // PUT = upvote
  if (req.method === 'PUT') {
    const { postId, wallet, action } = req.body || {};
    if (!postId || !wallet) return res.status(400).json({ error: 'postId and wallet required' });

    let posts = await getPosts();
    if (!posts) return res.status(200).json({ success: false, reason: 'no storage' });

    const post = posts.find(p => p.id === postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (!post.upvotes) post.upvotes = [];
    if (action === 'upvote') {
      if (!post.upvotes.includes(wallet)) post.upvotes.push(wallet);
    } else if (action === 'downvote') {
      post.upvotes = post.upvotes.filter(w => w !== wallet);
    }

    const saved = await savePosts(posts);
    return res.status(200).json({ success: saved, upvotes: post.upvotes.length });
  }

  // DELETE = remove a post (poster or wallet match required)
  if (req.method === 'DELETE') {
    const { postId, wallet } = req.body || {};
    if (!postId || !wallet) return res.status(400).json({ error: 'postId and wallet required' });

    let posts = await getPosts();
    if (!posts) return res.status(200).json({ success: false, reason: 'no storage' });

    const idx = posts.findIndex(p => p.id === postId);
    if (idx === -1) return res.status(404).json({ error: 'Post not found' });

    const post = posts[idx];
    if (post.wallet !== wallet) return res.status(403).json({ error: 'Not your post' });

    posts.splice(idx, 1);
    const saved = await savePosts(posts);
    return res.status(200).json({ success: saved, deleted: postId });
  }

  if (req.method === 'POST') {
    const { wallet, content, signature, name, type, avatar, replyTo } = req.body || {};
    if (!wallet || !content) return res.status(400).json({ error: 'wallet and content required' });

    const post = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      wallet,
      name: name || wallet.slice(0, 8),
      content,
      avatar: avatar || null,
      signature: signature || null,
      type: type === 'agent' ? 'agent' : 'human',
      timestamp: new Date().toISOString(),
      tag: replyTo ? 'reply' : 'signal',
      replyTo: replyTo || null,
      upvotes: []
    };

    let posts = (await getPosts()) || [];
    posts.unshift(post);
    if (posts.length > 500) posts = posts.slice(0, 500);
    
    const saved = await savePosts(posts);
    return res.status(201).json({ success: true, post, persistent: saved, store: saved ? 'redis' : 'memory' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
