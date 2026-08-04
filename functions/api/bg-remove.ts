interface Env {
  VOLC_ACCESS_KEY_ID: string;
  VOLC_SECRET_ACCESS_KEY: string;
}

const VOLC_API_HOST = 'visual.volcengineapi.com';
const VOLC_API_REGION = 'cn-north-1';
const VOLC_API_SERVICE = 'cv';

const encoder = new TextEncoder();

function toHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  return new Uint8Array(sig);
}

async function sha256(data: string): Promise<string> {
  const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return toHex(new Uint8Array(hashBuf));
}

function uriEscape(str: string): string {
  try {
    return encodeURIComponent(str).replace(/[*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
  } catch {
    return '';
  }
}

function queryParamsToString(params: Record<string, string>): string {
  return Object.keys(params).sort().map(key => `${uriEscape(key)}=${uriEscape(params[key])}`).join('&');
}

function getDateTimeNow(): string {
  return new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
}

async function generateSignature(
  method: string, pathName: string, query: Record<string, string>,
  headers: Record<string, string>, bodySha: string,
  accessKeyId: string, secretAccessKey: string
): Promise<string> {
  const datetime = headers['X-Date'];
  const date = datetime.substring(0, 8);
  const signedHeaderKeys = Object.keys(headers).filter(k => {
    const lk = k.toLowerCase();
    return lk === 'host' || lk === 'x-date' || lk === 'content-type';
  }).sort().map(k => k.toLowerCase()).join(';');
  const canonicalHeaders = Object.keys(headers).sort().map(k => `${k.toLowerCase()}:${headers[k].toString().trim()}`).join('\n');

  const canonicalRequest = [
    method.toUpperCase(), pathName, queryParamsToString(query) || '',
    `${canonicalHeaders}\n`, signedHeaderKeys, bodySha,
  ].join('\n');

  const credentialScope = [date, VOLC_API_REGION, VOLC_API_SERVICE, 'request'].join('/');
  const stringToSign = ['HMAC-SHA256', datetime, credentialScope, await sha256(canonicalRequest)].join('\n');

  const secretKey = encoder.encode(secretAccessKey);
  const kDate = await hmac(secretKey, date);
  const kRegion = await hmac(kDate, VOLC_API_REGION);
  const kService = await hmac(kRegion, VOLC_API_SERVICE);
  const kSigning = await hmac(kService, 'request');
  const signature = toHex(await hmac(kSigning, stringToSign));

  return `HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderKeys}, Signature=${signature}`;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { request, env } = context;
    const { imageBase64, apiKey } = await request.json<{ imageBase64: string; apiKey?: string }>();

    if (!imageBase64) {
      return Response.json({ error: 'Missing imageBase64 parameter' }, { status: 400 });
    }

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    // --- 如果客户端传了 remove.bg API Key，直接用 remove.bg ---
    if (apiKey) {
      // base64 → Uint8Array（避免 atob 兼容问题）
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      const formData = new FormData();
      formData.append('image_file', new Blob([bytes], { type: 'image/png' }), 'image.png');
      formData.append('size', 'auto');

      const rbResponse = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey },
        body: formData,
      });

      if (!rbResponse.ok) {
        const errText = await rbResponse.text();
        let errMsg = `remove.bg HTTP ${rbResponse.status}`;
        try {
          const err = JSON.parse(errText);
          errMsg = err.errors?.[0]?.title || errText.substring(0, 200);
        } catch { /* use raw */ }
        throw new Error(errMsg);
      }

      const resultBuffer = await rbResponse.arrayBuffer();
      // 安全 base64 编码：分块处理避免爆栈
      const resultBytes = new Uint8Array(resultBuffer);
      const chunks: string[] = [];
      const CHUNK = 0x8000; // 32KB per chunk
      for (let i = 0; i < resultBytes.length; i += CHUNK) {
        chunks.push(String.fromCharCode(...resultBytes.subarray(i, i + CHUNK)));
      }
      const resultBase64 = btoa(chunks.join(''));
      return Response.json({ success: true, imageBase64: `data:image/png;base64,${resultBase64}` });
    }

    // --- 未传 apiKey，用火山引擎 entity_seg ---
    const reqBody = {
      req_key: 'entity_seg',
      binary_data_base64: [base64Data],
      return_format: '1',
      refine_mask: true,
    };

    const body = JSON.stringify(reqBody);
    const bodySha = await sha256(body);
    const query = { Action: 'CVProcess', Version: '2022-08-31' };
    const xDate = getDateTimeNow();

    const headers: Record<string, string> = {
      'host': VOLC_API_HOST,
      'X-Date': xDate,
      'content-type': 'application/json',
    };

    const authorization = await generateSignature(
      'POST', '/', query, headers, bodySha,
      env.VOLC_ACCESS_KEY_ID, env.VOLC_SECRET_ACCESS_KEY
    );

    const qs = queryParamsToString(query);
    const response = await fetch(`https://${VOLC_API_HOST}/?${qs}`, {
      method: 'POST',
      headers: { ...headers, 'Authorization': authorization, 'Content-Length': encoder.encode(body).length.toString() },
      body,
    });

    const responseText = await response.text();
    console.log('BG Remove Response:', response.status, responseText.substring(0, 500));

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${responseText.substring(0, 300)}`);
    }

    const data = JSON.parse(responseText);
    if (data.code !== 10000) {
      throw new Error(`Segmentation failed: ${data.message || 'Unknown error'} (code: ${data.code})`);
    }

    if (data.data?.binary_data_base64?.[0]) {
      return Response.json({ success: true, imageBase64: `data:image/png;base64,${data.data.binary_data_base64[0]}` });
    }

    if (data.data?.image_urls?.[0]) {
      return Response.json({ success: true, imageUrl: data.data.image_urls[0] });
    }

    throw new Error('No image data in response');

  } catch (error) {
    console.error('Background removal error:', error);
    return Response.json(
      { error: 'Background removal failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
