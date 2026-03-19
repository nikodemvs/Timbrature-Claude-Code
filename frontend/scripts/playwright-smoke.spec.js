const fs = require('fs/promises');
const path = require('path');
const { test, expect } = require('@playwright/test');

const baseUrl = process.env.PLAYWRIGHT_SMOKE_BASE_URL || 'http://localhost:8081/';
const outputDir = process.env.PLAYWRIGHT_SMOKE_OUTPUT_DIR
  ? path.resolve(process.env.PLAYWRIGHT_SMOKE_OUTPUT_DIR)
  : path.resolve('output/playwright/bustapaga-smoke');

async function takeShot(page, name) {
  await page.screenshot({
    path: path.join(outputDir, name),
    fullPage: true,
  });
}

test.describe.configure({ mode: 'serial' });
test.use({
  viewport: { width: 390, height: 844 },
  channel: 'chrome',
});

test('workflow smoke app web', async ({ page }) => {
  await fs.mkdir(outputDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const homeTab = page.getByRole('tab', { name: /Home/ });
  const timbratureTab = page.getByRole('tab', { name: /Timbrature/ });
  const altroTab = page.getByRole('tab', { name: /Altro/ });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await expect(homeTab).toBeVisible({ timeout: 20000 });
  await expect(timbratureTab).toBeVisible({ timeout: 20000 });
  await expect(altroTab).toBeVisible({ timeout: 20000 });
  await expect(homeTab).toHaveAttribute('aria-selected', /true/);
  await takeShot(page, '01-home-tab.png');

  await timbratureTab.click();
  await expect(timbratureTab).toHaveAttribute('aria-selected', /true/);
  await takeShot(page, '02-timbrature-tab.png');

  await altroTab.click();
  await expect(altroTab).toHaveAttribute('aria-selected', /true/);
  await expect(page.getByText('Statistiche', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Impostazioni', { exact: true })).toBeVisible({ timeout: 20000 });
  await takeShot(page, '03-altro-menu.png');

  await page.getByText('Impostazioni', { exact: true }).click();
  await expect(page.getByText('Dati Contrattuali', { exact: true })).toBeVisible({ timeout: 20000 });
  await takeShot(page, '04-impostazioni.png');

  await fs.writeFile(
    path.join(outputDir, 'summary.txt'),
    [
      'Workflow completato con successo',
      `BaseUrl: ${baseUrl}`,
      `Avvio: ${startedAt}`,
      `Fine: ${new Date().toISOString()}`,
      'Screenshot:',
      ' - 01-home-tab.png',
      ' - 02-timbrature-tab.png',
      ' - 03-altro-menu.png',
      ' - 04-impostazioni.png',
    ].join('\n') + '\n',
    'utf8'
  );
});
