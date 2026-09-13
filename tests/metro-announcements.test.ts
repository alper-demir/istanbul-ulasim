import { describe, expect, it } from 'vitest';
import { parseMetroAnnouncements } from '@/lib/data-sources/metro-announcements';

describe('Metro İstanbul announcement parser', () => {
  it('keeps meaningful title, summary, detail URL and detected line codes', () => {
    const html = `<div class="caption"><h4> M2 Yenikapı-Hacıosman Hattında Sefer Düzenlemesi </h4><p>Etkinlik nedeniyle M2 hattında sefer düzenlemesi yapılacaktır.</p><a href="/duyuru/detay/m2-sefer-duzenlemesi">devamı</a></div>`;
    expect(parseMetroAnnouncements(html)).toMatchObject([{
      title: 'M2 Yenikapı-Hacıosman Hattında Sefer Düzenlemesi',
      description: 'Etkinlik nedeniyle M2 hattında sefer düzenlemesi yapılacaktır.',
      routeCodes: ['M2'],
      sourceUrl: 'https://www.metro.istanbul/duyuru/detay/m2-sefer-duzenlemesi',
      provider: 'metro-istanbul',
    }]);
  });

  it('rejects empty or incomplete announcement cards instead of inventing content', () => {
    expect(parseMetroAnnouncements('<div class="caption"><h4>Duyuru</h4><p></p></div>')).toEqual([]);
  });
});
