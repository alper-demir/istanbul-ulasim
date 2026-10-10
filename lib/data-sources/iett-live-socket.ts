const IETT_HOST = 'api.ibb.gov.tr';
const IETT_PATH = '/iett/FiloDurum/SeferGerceklesme.asmx';

function headerBoundary(bytes: Uint8Array) {
  for (let index = 0; index <= bytes.length - 4; index += 1) {
    if (bytes[index] === 13 && bytes[index + 1] === 10 && bytes[index + 2] === 13 && bytes[index + 3] === 10) return index;
  }
  return -1;
}

function combineChunks(chunks: Uint8Array[], totalLength: number) {
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

/**
 * Cloudflare's regular fetch adds network metadata that the legacy IETT SOAP
 * gateway can reject with HTTP 500. A direct TLS socket keeps the request
 * minimal and uses a separate Workers egress range. This is a fallback only.
 */
export async function fetchIettLiveViaSocket(body: string, signal: AbortSignal, maxResponseBytes: number) {
  const { connect } = await import('cloudflare:sockets');
  const socket = connect({ hostname:IETT_HOST, port:443 }, { secureTransport:'on', allowHalfOpen:false });
  const closeOnAbort = () => { void socket.close(); };
  signal.addEventListener('abort', closeOnAbort, { once:true });

  try {
    const bodyBytes = new TextEncoder().encode(body);
    const requestHead = [
      `POST ${IETT_PATH} HTTP/1.0`,
      `Host: ${IETT_HOST}`,
      'Accept: text/xml',
      'Content-Type: text/xml; charset=utf-8',
      'SOAPAction: http://tempuri.org/GetHatOtoKonum_json',
      'User-Agent: Istanbulum/0.11 (+https://istanbulum.alper-apps.workers.dev)',
      `Content-Length: ${bodyBytes.byteLength}`,
      'Connection: close',
      '',
      '',
    ].join('\r\n');

    const writer = socket.writable.getWriter();
    await writer.write(new TextEncoder().encode(requestHead));
    await writer.write(bodyBytes);
    await writer.close();

    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    const reader = socket.readable.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      totalLength += value.byteLength;
      if (totalLength > maxResponseBytes + 16_384) {
        throw new Error('İETT canlı araç socket yanıtı güvenli boyut sınırını aştı');
      }
      chunks.push(value);
    }

    const raw = combineChunks(chunks, totalLength);
    const boundary = headerBoundary(raw);
    if (boundary < 0) throw new Error('İETT canlı araç socket yanıtı geçerli HTTP başlığı içermiyor');
    const headerText = new TextDecoder('latin1').decode(raw.subarray(0, boundary));
    const status = Number(headerText.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/u)?.[1]);
    if (!Number.isInteger(status)) throw new Error('İETT canlı araç socket yanıtı geçerli HTTP durumu içermiyor');

    const responseBody = raw.subarray(boundary + 4);
    if (responseBody.byteLength > maxResponseBytes) throw new Error('İETT canlı araç yanıtı güvenli boyut sınırını aştı');
    const responseText = new TextDecoder().decode(responseBody);
    const soapFault = responseText.match(/<faultstring>([\s\S]*?)<\/faultstring>/iu)?.[1]
      ?.replace(/<[^>]+>/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim();
    if (soapFault) throw new Error(`İETT canlı araç socket SOAP hatası: ${soapFault.slice(0, 120)}`);
    return new Response(responseBody, { status, headers:{ 'Content-Type':'text/xml; charset=utf-8' } });
  } finally {
    signal.removeEventListener('abort', closeOnAbort);
    await socket.close().catch(() => undefined);
  }
}
