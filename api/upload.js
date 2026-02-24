// Proxy for catbox.moe uploads (avoids CORS)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { image } = req.body || {};
    if (!image) return res.status(400).json({ error: 'image required (base64 data URI)' });

    // Parse data URI
    const match = image.match(/^data:(.+?);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'invalid data URI' });
    
    const contentType = match[1];
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length > 600000) return res.status(400).json({ error: 'image too large' });

    const ext = contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif' : 'jpg';
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    
    const parts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="reqtype"\r\n\r\nfileupload\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="fileToUpload"; filename="avatar.${ext}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ];
    
    const head = Buffer.from(parts[0] + parts[1], 'utf-8');
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    const body = Buffer.concat([head, buf, tail]);

    const catRes = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: body,
    });

    const text = await catRes.text();
    if (text.startsWith('https://')) {
      return res.json({ url: text.trim() });
    }
    return res.status(500).json({ error: 'Upload failed', detail: text.slice(0, 200) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
