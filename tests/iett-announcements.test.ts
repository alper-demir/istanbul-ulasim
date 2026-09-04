import { describe, expect, it } from 'vitest';
import { normalizeIettAnnouncements, parseIettAnnouncementResponse } from '@/lib/data-sources/iett-announcements';

describe('IETT announcement normalization', () => {
  it('normalizes route codes and removes expired records', () => {
    const result = normalizeIettAnnouncements({ data: [
      { duyuruId: 'a1', baslik: 'Hat değişikliği', aciklama: '<b>500T</b> etkileniyor', hatKodu: '500T; 34BZ', baslangicTarihi: '2026-09-01T00:00:00Z', bitisTarihi: '2026-09-10T00:00:00Z' },
      { duyuruId: 'old', baslik: 'Eski', bitisTarihi: '2026-08-01T00:00:00Z' },
    ] }, Date.parse('2026-09-04T00:00:00Z'));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'a1', routeCodes: ['500T', '34BZ'], status: 'active' });
    expect(result[0]?.description).not.toContain('<b>');
  });

  it('keeps general announcements when no route code is supplied', () => {
    expect(normalizeIettAnnouncements([{ id: 'general', title: 'Genel duyuru' }])[0]?.routeCodes).toEqual([]);
  });

  it('drops duplicate and expired records while preserving unknown date status', () => {
    const result = normalizeIettAnnouncements([
      { id: 'same', title: 'Birden fazla hat', hat: '500T, 34BZ' },
      { id: 'same', title: 'Tekrarlanan kayıt', hat: '500T' },
      { id: 'bad-date', title: 'Tarih bilinmiyor', baslangicTarihi: 'geçersiz tarih' },
      { id: 'expired', title: 'Süresi bitti', bitisTarihi: '2026-09-01T00:00:00Z' },
    ], Date.parse('2026-09-04T00:00:00Z'));
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'same', routeCodes: ['500T', '34BZ'], status: 'unknown' });
    expect(result[1]).toMatchObject({ id: 'bad-date', status: 'unknown' });
  });

  it('parses entity-encoded JSON from the official SOAP response', () => {
    const xml = '<soap:Envelope><GetDuyurular_jsonResult>[{&quot;duyuruId&quot;:&quot;soap-1&quot;,&quot;baslik&quot;:&quot;500T duyurusu&quot;,&quot;hatKodu&quot;:&quot;500T&quot;}]</GetDuyurular_jsonResult></soap:Envelope>';
    expect(parseIettAnnouncementResponse(xml)).toMatchObject([{ id: 'soap-1', title: '500T duyurusu', routeCodes: ['500T'] }]);
  });
});
