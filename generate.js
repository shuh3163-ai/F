export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, falKey } = req.body;
  if (!prompt || !falKey) return res.status(400).json({ error: 'Missing prompt or falKey' });

  try {
    // Step 1: Submit
    const submitRes = await fetch('https://queue.fal.run/fal-ai/flux/dev', {
      method: 'POST',
      headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image_size: 'square_hd', num_inference_steps: 28, guidance_scale: 3.5, num_images: 1, enable_safety_checker: false })
    });
    if (!submitRes.ok) {
      const err = await submitRes.text();
      return res.status(submitRes.status).json({ error: `提交失败: ${err}` });
    }
    const { request_id } = await submitRes.json();
    if (!request_id) return res.status(500).json({ error: '未获得 request_id' });

    // Step 2: Poll status
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(
        `https://queue.fal.run/fal-ai/flux/dev/requests/${request_id}/status`,
        { headers: { 'Authorization': `Key ${falKey}` } }
      );
      if (!statusRes.ok) continue;
      const statusData = await statusRes.json();

      if (statusData.status === 'COMPLETED') {
        // Step 3: Fetch result
        const resultRes = await fetch(
          `https://queue.fal.run/fal-ai/flux/dev/requests/${request_id}`,
          { headers: { 'Authorization': `Key ${falKey}` } }
        );
        const resultData = await resultRes.json();
        const url = resultData.images?.[0]?.url || resultData.image?.url;
        if (!url) return res.status(500).json({ error: '未获取到图片 URL' });
        return res.status(200).json({ url });
      }
      if (statusData.status === 'FAILED') {
        return res.status(500).json({ error: statusData.error || '生成失败' });
      }
    }
    return res.status(504).json({ error: '超时，请重试' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
