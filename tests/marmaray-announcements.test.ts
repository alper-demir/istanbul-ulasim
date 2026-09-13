import { describe, expect, it } from 'vitest';
import { parseMarmarayAnnouncements } from '@/lib/data-sources/marmaray-announcements';

describe('Marmaray/TCDD announcement parser', () => {
  it('keeps the B1 scope and official detail URL', () => {
    const body = [{ id:51, name:'Sefer Düzenlemesi Hakkında', descriptions:'Marmaray seferlerinde düzenleme yapılacaktır.', announcementsDate:'2026-09-12T12:00:00', announcementId:1 }];
    expect(parseMarmarayAnnouncements(body)).toMatchObject([{
      title:'Sefer Düzenlemesi Hakkında',
      description:'Marmaray seferlerinde düzenleme yapılacaktır.',
      routeCodes:['B1'],
      sourceUrl:'https://www.tcddtasimacilik.gov.tr/marmaray/tr/duyurular/detay/51',
      provider:'marmaray-tcdd',
      publishedAt:'2026-09-12T12:00:00',
    }]);
  });

  it('rejects links without a meaningful title', () => {
    expect(parseMarmarayAnnouncements([{ id:51, name:'', descriptions:null }])).toEqual([]);
  });
});
