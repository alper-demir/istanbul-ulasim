import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/announcements**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [
    { id:'iett-e2e', title:'500T güzergâh duyurusu', description:'Test duyurusu', routeCodes:['500T'], routeName:'Tuzla Şifa Mahallesi — 4. Levent Metro', announcementType:'Sefer', sourceUpdateLabel:null, sourceLabel:'İETT duyurusu', provider:'iett', status:'active', publishedAt:null, effectiveTo:null, sourceUrl:'https://iett.istanbul' },
    { id:'metro-e2e', title:'Metro bakım duyurusu', description:'Test raylı sistem duyurusu', routeCodes:['M2'], routeName:null, announcementType:'Metro İstanbul', sourceUpdateLabel:null, sourceLabel:'Metro İstanbul duyurusu', provider:'metro-istanbul', status:'active', publishedAt:null, effectiveTo:null, sourceUrl:'https://www.metro.istanbul/duyuru/detay/e2e' },
    { id:'ferry-e2e', title:'Vapur sefer düzenlemesi', description:'Test vapur duyurusu', routeCodes:[], routeName:null, announcementType:'Şehir Hatları', sourceUpdateLabel:null, sourceLabel:'Şehir Hatları duyurusu', provider:'sehir-hatlari', status:'active', publishedAt:null, effectiveTo:null, sourceUrl:'https://sehirhatlari.istanbul/tr/duyurular/e2e' },
    { id:'marmaray-e2e', title:'Marmaray duyurusu', description:'Test Marmaray duyurusu', routeCodes:['B1'], routeName:'Marmaray', announcementType:'Marmaray / TCDD', sourceUpdateLabel:null, sourceLabel:'Marmaray / TCDD duyurusu', provider:'marmaray-tcdd', status:'unknown', publishedAt:null, effectiveTo:null, sourceUrl:'https://www.tcddtasimacilik.gov.tr/marmaray/tr/duyurular/detay/1' },
  ], meta: { status:'live', cacheStatus:'miss', fetchedAt:new Date().toISOString() } }) }));
});

test('opens the map shell and searches for a route', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('textbox').first();
  await expect(search).toBeVisible({ timeout:20_000 });
  await search.fill('500T');
  await expect(page.getByText('500T', { exact: true }).first()).toBeVisible();
});

test('supports keyboard dismissal of the about dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Uygulama hakkında' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('opens planned departures directly from a selected stop', async ({ page }) => {
  await page.goto('/?route=500T&direction=outbound&stop=iett-stop%3A312');
  await page.getByText('Ayrıntıları göster', { exact: true }).click();
  const stopDetails = page.getByText('Bu duraktan geçen hatlar', { exact: true });
  await expect(stopDetails).toBeVisible();
  await page.getByRole('button', { name: 'Seferleri gör' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByText('500T · planlı seferler')).toBeVisible();
});

test('opens the global announcements panel with explicit source coverage', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Global duyuruları göster' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Aktif kesintiler ve duyurular')).toBeVisible();
  await expect(page.getByRole('dialog').getByText('İETT, Metro İstanbul ve Şehir Hatları resmî duyuru listeleri kontrol ediliyor.')).toBeVisible();
});

test('filters global announcements by transport type and preserves source links', async ({ page }) => {
  await page.goto('/');
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name:'Global duyuruları göster' }).click();
  await dialog.getByRole('button', { name:'Vapur', exact:true }).click();
  await expect(dialog.getByText('Vapur sefer düzenlemesi')).toBeVisible();
  await expect(dialog.getByText('Şehir Hatları detayını aç')).toHaveAttribute('href', /sehirhatlari/);
  await expect(dialog.getByText('Metro bakım duyurusu')).toHaveCount(0);
});

test('shows the TCDD scope warning in the planned schedule dialog', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('textbox').first();
  await expect(search).toBeVisible({ timeout:15_000 });
  await search.fill('M11');
  await page.getByText('M11', { exact:true }).first().click();
  await expect(page.getByText('Hat üzerindeki araçlar', { exact:true })).toBeVisible({ timeout:15_000 });
  await page.getByRole('button', { name:'Sefer saatlerini gör' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('TCDD ilk / son hareket özeti')).toBeVisible();
  await expect(dialog.getByText(/Ara istasyon saatleri ve yolculuk süresi tahmini gösterilmez/)).toBeVisible();
});
