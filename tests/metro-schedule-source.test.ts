import { describe, expect, it } from 'vitest';
import { extractMetroRequestCode, findSourceDirection, parseMetroScheduleCatalog, summarizeFirstLastDepartures } from '../scripts/metro-schedule-source.mjs';

const fixture = `<a onclick="changeTheElements(9);"><span>M1A</span></a><select id="seferler_9"><option value="67">Yenikapı-->>Atatürk Havalimanı</option></select><select id="istasyonlar_9"><option value="121">Yenikapı</option></select><script>formData.append("kod", 'temporary-code');</script>`;

describe('Metro İstanbul sefer kaynağı', () => {
  it('hat, yön, başlangıç istasyonu ve geçici istek kodunu kaynak sayfasından çıkarır', () => {
    const line = parseMetroScheduleCatalog(fixture).get('M1A');
    expect(line).toBeDefined();
    expect(findSourceDirection(line!, 'Yenikapı → Atatürk Havalimanı')).toEqual({ routeId: '67', stationId: '121', sourceFrom: 'Yenikapı', sourceTo: 'Atatürk Havalimanı' });
    expect(extractMetroRequestCode(fixture)).toBe('temporary-code');
  });

  it('istasyon adlarındaki küçük kaynak farklarını ve tek yönlü ring hattını eşleştirir', () => {
    const line = parseMetroScheduleCatalog('<a onclick="changeTheElements(3);"><span>T3</span></a><select id="seferler_3"><option value="4">Kadıköy İDO-->>Damga Sokak</option></select><select id="istasyonlar_3"><option value="5">Kadıköy İDO</option></select>').get('T3');
    expect(findSourceDirection(line!, 'Kadıköy - İDO- Metro → Damga Sokak')).toMatchObject({ routeId: '4', stationId: '5' });
  });

  it('gece yarısını geçen son hareketi 24 saat gösterimine taşır', () => {
    expect(summarizeFirstLastDepartures({ durum: '0', sefer: [{ zaman: '06:00' }, { zaman: '00:00' }] })).toEqual({ first: '06:00', last: '24:00' });
  });

  it('boş veya başarısız kaynak yanıtını reddeder', () => {
    expect(() => summarizeFirstLastDepartures({ durum: '-1', sefer: [] })).toThrow(/sefer bulunamadı/);
  });
});
