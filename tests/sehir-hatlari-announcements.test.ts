import { describe, expect, it } from 'vitest';
import { parseSehirHatlariAnnouncements } from '@/lib/data-sources/sehir-hatlari-announcements';

describe('Şehir Hatları announcement parser', () => {
  it('keeps meaningful title, nearby summary and official detail URL', () => {
    const html = `<div class="announcement"><a href="/tr/duyurular/16-agustos-2026-sefer-duzenlemeleri-duyurusu-3781"><span>16 Ağustos 2026 Sefer Düzenlemeleri Duyurusu</span></a><p>Bazı seferler düzenlenecektir.</p></div>`;
    expect(parseSehirHatlariAnnouncements(html)).toMatchObject([{
      title:'16 Ağustos 2026 Sefer Düzenlemeleri Duyurusu',
      description:'Bazı seferler düzenlenecektir.',
      sourceUrl:'https://sehirhatlari.istanbul/tr/duyurular/16-agustos-2026-sefer-duzenlemeleri-duyurusu-3781',
      provider:'sehir-hatlari',
    }]);
  });

  it('rejects empty announcement links', () => {
    expect(parseSehirHatlariAnnouncements('<a href="/tr/duyurular/ornek"></a>')).toEqual([]);
  });
});
