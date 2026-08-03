/**
 * Next.js API Route — remove.bg 抠图代理
 * 直接传图给 remove.bg，返回透明背景 PNG
 */

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { imageBase64 } = body;

    if (!imageBase64) {
      return Response.json({ error: 'Missing imageBase64' }, { status: 400 });
    }

    const apiKey = process.env.REMOVEBG_API_KEY;
    if (!apiKey) {
      return Response.json({ error: 'REMOVEBG_API_KEY not configured' }, { status: 500 });
    }

    // remove.bg 接受 base64（去掉 data:image/...;base64, 前缀）
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    const formData = new FormData();
    // 将 base64 解码为 Blob 后上传
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    formData.append('image_file', new Blob([bytes], { type: 'image/png' }), 'image.png');
    formData.append('size', 'auto');

    const res = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      try {
        const err = JSON.parse(errText);
        throw new Error(`remove.bg: ${err.errors?.[0]?.title || errText}`);
      } catch {
        if (errText.length < 200) throw new Error(`remove.bg HTTP ${res.status}: ${errText}`);
        throw new Error(`remove.bg HTTP ${res.status}`);
      }
    }

    const resultBuffer = await res.arrayBuffer();
    const resultBase64 = Buffer.from(resultBuffer).toString('base64');

    return Response.json({ success: true, imageBase64: `data:image/png;base64,${resultBase64}` });

  } catch (error) {
    return Response.json(
      { error: 'Background removal failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
