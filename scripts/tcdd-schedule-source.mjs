export function decodeHtml(value) {
  return value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#39;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, ' ').trim();
}

export function extractStationNames(html) {
  return [...new Set([...html.matchAll(/<(?:option|li)[^>]*>([\s\S]*?)<\/(?:option|li)>/gi)].map((match) => decodeHtml(match[1])).filter((name) => name.length > 1 && !/^(nereden|nereye|ara)$/iu.test(name)))];
}

export function extractTimes(html) {
  const resultBlock = html.match(/(?:muhtemel hareket saati|hareket saati)[\s\S]{0,50000}/iu)?.[0];
  if (!resultBlock) return [];
  return [...new Set([...resultBlock.matchAll(/\b([01]?\d|2[0-4]):[0-5]\d\b/g)].map((match) => match[0]))];
}

function validTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-4]):[0-5]\d(?::[0-5]\d)?$/.test(value);
}

export function extractApiDepartureTimes(value, mapping) {
  if (!Array.isArray(value)) throw new Error('TCDD API yanıtı liste değil');
  const times = value
    .filter((item) => item?.originStation === mapping.sourceFrom && item?.destinationStation === mapping.sourceTo)
    .map((item) => item.originTime)
    .filter(validTime)
    .map((time) => time.slice(0, 5));
  const unique = [...new Set(times)];
  if (!unique.length) throw new Error(`TCDD API yanıtında ${mapping.sourceFrom} → ${mapping.sourceTo} doğrulanmış kalkış bulunamadı`);
  return unique.sort((left, right) => left.localeCompare(right));
}

export function assertTCDDDisclaimer(html) {
  if (!/taahhüt|muhtemel hareket/iu.test(decodeHtml(html))) throw new Error('TCDD kaynağında muhtemel hareket/zaman taahhüdü uyarısı bulunamadı');
}
