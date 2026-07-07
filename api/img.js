// AI 연인 캐릭터 이미지 프록시 — 같은 오리진으로 서빙해 캔버스 CORS 문제를 제거
const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_2zgU8WENBNYEO4lt0oTuMlue5RY';

const IMAGES = {
  yuri: `${CDN}/hf_20260707_144109_c2702b18-6bbb-4952-bc62-d0ee53b9ad55_min.webp`,
  sena: `${CDN}/hf_20260707_144109_6cfe75d7-b0b8-4ae2-b9e6-78e9213090fe_min.webp`,
  jiho: `${CDN}/hf_20260707_144106_92a57afe-7c24-4103-834b-81fa9730c4c6_min.webp`,
  doyun: `${CDN}/hf_20260707_144106_85a1a2f0-2716-4ada-97f9-c5f7b5dfc48f_min.webp`,
};

export default async function handler(req, res) {
  const id = (req.query && req.query.id) || '';
  const url = IMAGES[id];
  if (!url) return res.status(404).json({ error: 'unknown image id' });

  try {
    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: 'upstream ' + r.status });
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.status(200).send(buf);
  } catch (e) {
    console.error('img proxy error', e);
    return res.status(502).json({ error: 'fetch failed' });
  }
}
