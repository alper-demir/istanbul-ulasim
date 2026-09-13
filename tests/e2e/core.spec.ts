import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/announcements**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], meta: { status: 'live', cacheStatus: 'miss', fetchedAt: new Date().toISOString() } }) }));
});

test('opens the map shell and searches for a route', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('textbox').first();
  await expect(search).toBeVisible();
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
