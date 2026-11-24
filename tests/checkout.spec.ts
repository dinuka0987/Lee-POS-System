import { test, expect, type Page } from '@playwright/test';

async function signIn(page: Page, admin = false) {
  await page.goto('/');
  await page
    .getByLabel('Email address')
    .fill((admin ? process.env.E2E_ADMIN_EMAIL : process.env.E2E_EMAIL)!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible();
}
async function scan(page: Page) {
  const scanner = page.getByRole('textbox', { name: 'Scan barcode or search products' });
  await scanner.fill(process.env.E2E_BARCODE!);
  await scanner.press('Enter');
  await expect(page.getByRole('spinbutton', { name: 'Quantity for Browser Test Tea' })).toHaveValue(
    '1',
  );
}
test('owner registers the first administrator in the POS and registration then closes', async ({
  page,
}) => {
  await page.route('**/api/auth/setup', (route) => route.abort());
  await page.goto('/setup');
  await expect(page.getByRole('alert')).toContainText('Cannot connect to Lee’s server');
  await expect(page.getByRole('alert')).not.toContainText('sale');
  await page.unroute('**/api/auth/setup');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByLabel('Your name', { exact: true })).toBeVisible();
  await page.goto('/login');
  await page.getByRole('link', { name: 'Create your administrator account' }).click();
  await expect(page.getByRole('heading', { name: 'Create your admin account' })).toBeVisible();
  await page.getByLabel('Your name', { exact: true }).fill('Browser Test Admin');
  await page.getByLabel('Email address').fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByLabel('Confirm password').fill('does-not-match');
  await page.getByLabel('Setup key', { exact: true }).fill(process.env.E2E_SETUP_KEY!);
  await page.getByRole('button', { name: 'Create admin account', exact: true }).click();
  await expect(page.getByText('Passwords must match')).toBeVisible();
  await page.getByLabel('Confirm password').fill(process.env.E2E_PASSWORD!);
  await page.setViewportSize({ width: 390, height: 667 });
  await expect(
    page.getByRole('button', { name: 'Create admin account', exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: 'test-results/lee-admin-setup-mobile.png' });
  await page.getByRole('button', { name: 'Create admin account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your account is ready' })).toBeVisible();
  await page.getByRole('link', { name: 'Continue to sign in' }).click();
  await expect(page.getByRole('link', { name: 'Create your administrator account' })).toHaveCount(
    0,
  );
  await page.goto('/setup');
  await expect(
    page.getByText('An administrator account already exists.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create admin account', exact: true })).toHaveCount(
    0,
  );
});

test('cash checkout: barcode, quantity, change, receipt, and browser print', async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => document.documentElement.setAttribute('data-print-requested', 'yes');
  });
  await signIn(page, true);
  await page.getByRole('link', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  const emptyCategory = `Browser Empty ${process.env.E2E_CATEGORY_ID}`;
  await page.getByLabel('New category name', { exact: true }).fill(emptyCategory);
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  await expect(page.getByLabel('New category name', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Close product form', exact: true }).click();
  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await expect(page.getByRole('button', { name: emptyCategory, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'All products', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Add Browser Test Tea', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  await page.getByLabel('Product name', { exact: true }).fill('Browser Test Soap');
  await page.getByLabel('SKU', { exact: true }).fill(process.env.E2E_NEW_BARCODE!);
  await page.getByLabel('Barcode', { exact: true }).fill(process.env.E2E_NEW_BARCODE!);
  await page.getByLabel('Selling price (LKR, before tax)', { exact: true }).fill('49.90');
  await page
    .getByRole('combobox', { name: 'Category', exact: true })
    .selectOption({ label: emptyCategory });
  await page.getByLabel('Opening stock', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Save product', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Edit Browser Test Soap', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Edit Browser Test Soap', exact: true }).click();
  await page.getByLabel('Product name', { exact: true }).fill('Browser Test Soap Updated');
  await page.getByRole('button', { name: 'Save product', exact: true }).click();
  await page
    .getByRole('button', { name: 'Archive Browser Test Soap Updated', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Restore Browser Test Soap Updated', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await expect(page.getByRole('button', { name: emptyCategory, exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Products', exact: true }).click();
  await page
    .getByRole('button', { name: 'Restore Browser Test Soap Updated', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Archive Browser Test Soap Updated', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/lee-products.png', fullPage: true });
  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await expect(page.getByRole('button', { name: emptyCategory, exact: true })).toBeVisible();
  await scan(page);
  await page.getByRole('spinbutton', { name: 'Quantity for Browser Test Tea' }).fill('2');
  for (const [width, height] of [
    [1920, 930],
    [1366, 768],
    [1280, 720],
    [1024, 768],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole('button', { name: /Take payment/ })).toBeInViewport({ ratio: 1 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight + 1 &&
          document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /Take payment/ }).click();
  await page.getByLabel('Cash received (LKR)').fill('500');
  await expect(page.getByText('LKR 300.00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Complete sale', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sale complete' })).toBeVisible();
  await expect(page.locator('#sale-receipt')).toContainText('LKR 200.00');
  for (const [width, height] of [
    [1366, 768],
    [1280, 600],
    [390, 667],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole('button', { name: 'Print receipt', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await expect(page.getByRole('button', { name: 'New sale', exact: true })).toBeInViewport({
      ratio: 1,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Print receipt' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-print-requested', 'yes');
  await page.screenshot({ path: 'test-results/lee-cash-receipt.png', fullPage: true });
  await page.emulateMedia({ media: 'print' });
  expect((await page.locator('#sale-receipt').boundingBox())!.width).toBeLessThanOrEqual(273);
  await page.locator('#sale-receipt').screenshot({ path: 'test-results/lee-print-receipt.png' });
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'New sale', exact: true }).click();
  await expect(page.getByText('A fresh start')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Add Browser Test Tea', exact: true }),
  ).toContainText('18 in stock');
  await expect(page.getByRole('button', { name: 'Open offline sync status' })).toHaveText(
    /Online.*0 unsynced/,
    { timeout: 20000 },
  );
  await page.screenshot({ path: 'test-results/lee-checkout.png', fullPage: true });
  await page.getByRole('link', { name: 'Products', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Adjust stock for Browser Test Tea', exact: true }),
  ).toHaveText('18');
  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('textbox', { name: 'Scan barcode or search products' }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/lee-mobile-checkout.png', fullPage: true });
});
test('card sale survives a lost response and reload without a duplicate', async ({ page }) => {
  test.setTimeout(65000);
  await signIn(page);
  await scan(page);
  let savedId = '';
  let attempts = 0;
  let allowRetry = false;
  await page.route('**/api/sync/sales', async (route) => {
    attempts++;
    if (attempts === 1) {
      savedId = route.request().postDataJSON().id;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort('failed');
    } else {
      expect(route.request().postDataJSON().id).toBe(savedId);
      if (allowRetry) await route.continue();
      else await route.abort('failed');
    }
  });
  await page.getByRole('button', { name: /Take payment/ }).click();
  await page.getByRole('button', { name: 'Card terminal', exact: true }).click();
  await page.getByLabel('External terminal reference').fill('BROWSER-TERMINAL-001');
  await page.getByRole('button', { name: 'Complete sale', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sale complete' })).toBeVisible();
  await expect.poll(() => savedId).not.toBe('');
  await expect(page.locator('#sale-receipt')).toContainText(savedId);
  await page.reload();
  allowRetry = true;
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open offline sync status' })).toHaveText(
    /Online.*0 unsynced/,
    { timeout: 45000 },
  );
  const result = await page.evaluate(async (id) => {
    const session = JSON.parse(sessionStorage.getItem('lee-pos-session-v1')!);
    const response = await fetch(`/api/sales?q=${id}`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    return response.json();
  }, savedId);
  expect(result.total).toBe(1);
  expect(result.data[0].payments[0].reference).toBe('BROWSER-TERMINAL-001');
  expect(attempts).toBeGreaterThanOrEqual(2);
});

test('installed app reloads offline, prints a queued sale, and syncs automatically on reconnect', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    window.print = () => document.documentElement.setAttribute('data-print-requested', 'yes');
  });
  await signIn(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await scan(page);
  await page.getByRole('button', { name: /Take payment/ }).click();
  await page.getByRole('button', { name: 'Use exact amount' }).click();
  await page.getByRole('button', { name: 'Complete sale', exact: true }).click();
  await expect(page.locator('#sale-receipt')).toBeVisible();
  await expect(page.locator('#sale-receipt')).not.toContainText('AWAITING SYNC');
  const id = await page.evaluate(
    async () =>
      new Promise<string>((resolve, reject) => {
        const opened = indexedDB.open('lee-pos-offline-v1');
        opened.onerror = () => reject(new Error('No local database'));
        opened.onsuccess = () => {
          const db = opened.result;
          const request = db.transaction('sales').objectStore('sales').getAll();
          request.onsuccess = () => {
            resolve(request.result.find((entry) => entry.state === 'pending').id);
            db.close();
          };
        };
      }),
  );
  await page.getByRole('button', { name: 'Print receipt' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-print-requested', 'yes');
  await page.screenshot({ path: 'test-results/lee-offline-receipt.png', fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open offline sync status' })).toHaveText(
    /Offline.*1 unsynced/,
  );
  await context.setOffline(false);
  await expect(page.getByRole('button', { name: 'Open offline sync status' })).toHaveText(
    /Online.*0 unsynced/,
    { timeout: 20000 },
  );
  const result = await page.evaluate(async (saleId) => {
    const session = JSON.parse(sessionStorage.getItem('lee-pos-session-v1')!);
    const response = await fetch(`/api/sales?q=${saleId}`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    return response.json();
  }, id);
  expect(result.total).toBe(1);
  expect(result.data[0].cashierId).toBe(process.env.E2E_USER_ID);
  const apiCache = await page.evaluate(async () => {
    const results = await Promise.all(
      (await caches.keys()).map(async (name) =>
        (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname),
      ),
    );
    return results.flat().filter((path) => path.startsWith('/api/'));
  });
  expect(apiCache).toEqual([]);
});

test('admin manages cashiers and settings, reprints history, voids a sale, and views reports and audit', async ({
  page,
}) => {
  await signIn(page, true);
  await page.getByRole('link', { name: 'Users', exact: true }).click();
  await page.getByRole('button', { name: 'Add cashier', exact: true }).click();
  await page.getByLabel('Cashier name').fill('Browser Managed Cashier');
  await page.getByLabel('Email address').fill(process.env.E2E_MANAGED_EMAIL!);
  await page.getByLabel('New password').fill('Browser-Only-Password123');
  await page.getByRole('button', { name: 'Create cashier', exact: true }).click();
  const account = page.getByRole('row').filter({ hasText: process.env.E2E_MANAGED_EMAIL! });
  await account.getByRole('button', { name: 'Disable', exact: true }).click();
  await expect(account.getByText('Disabled', { exact: true })).toBeVisible();
  await account.getByRole('button', { name: 'Reset password' }).click();
  await page.getByLabel('New password').fill('Browser-Only-New-Password456');
  await page.getByRole('button', { name: 'Reset password', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Shop name').fill('Lee Trial');
  await page.getByLabel('Shop address').fill('Trial address');
  await page.getByLabel('Receipt footer').fill('Thanks from Lee');
  await page.getByRole('combobox', { name: 'Paper width' }).selectOption('58');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Shop settings saved.')).toBeVisible();
  const developer = page.getByRole('region', { name: 'Developer & support', exact: true });
  await expect(developer.getByText('Dinuka Dilshan', { exact: true })).toBeVisible();
  await expect(
    developer.getByRole('link', { name: 'dinukadilshan1009@gmail.com', exact: true }),
  ).toHaveAttribute('href', 'mailto:dinukadilshan1009@gmail.com');
  await expect(developer.getByRole('link', { name: '0705237919', exact: true })).toHaveAttribute(
    'href',
    'tel:0705237919',
  );
  await expect(
    developer.getByRole('button', { name: 'Edit developer details', exact: true }),
  ).toHaveCount(0);
  await expect(developer.locator('input, textarea, select')).toHaveCount(0);
  await page.reload();
  await expect(developer.getByText('Dinuka Dilshan', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/lee-developer-settings.png', fullPage: true });
  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await scan(page);
  await page.getByRole('button', { name: /Take payment/ }).click();
  await page.getByRole('button', { name: 'Use exact amount' }).click();
  await page.getByRole('button', { name: 'Complete sale', exact: true }).click();
  await expect(page.locator('#sale-receipt')).toContainText('Lee Trial');
  await page.emulateMedia({ media: 'print' });
  expect((await page.locator('#sale-receipt').boundingBox())!.width).toBeLessThan(190);
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'New sale', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open offline sync status' })).toHaveText(
    /Online.*0 unsynced/,
    { timeout: 20000 },
  );
  await page.getByRole('link', { name: 'Sales history', exact: true }).click();
  await page.getByRole('button', { name: 'View receipt', exact: true }).first().click();
  await expect(page.locator('#sale-receipt')).toBeVisible();
  await page.getByRole('button', { name: 'Void this sale' }).click();
  await page.getByLabel('Reason', { exact: true }).fill('Cash returned during automated trial');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirm void' }).click();
  await expect(page.locator('#sale-receipt')).toContainText('VOIDED');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Add Browser Test Tea', exact: true }),
  ).toContainText('in stock');
  await page.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Daily sales report' })).toBeVisible();
  await expect(page.getByText('1 voided transactions excluded')).toBeVisible();
  await page.screenshot({ path: 'test-results/lee-daily-report.png', fullPage: true });
  await page.getByRole('link', { name: 'Audit log', exact: true }).click();
  await page.getByRole('combobox', { name: 'Audit action' }).selectOption('void');
  await expect(page.getByRole('table').getByText('void', { exact: true })).toBeVisible();
  await page.getByText('View changes', { exact: true }).first().click();
  await expect(
    page.getByText('Cash returned during automated trial', { exact: false }),
  ).toBeVisible();
});

test('stock adjustments and payments update another open till automatically', async ({
  page,
  browser,
}) => {
  await signIn(page, true);
  await page.getByRole('link', { name: 'Products', exact: true }).click();
  const stock = page.getByRole('button', {
    name: 'Adjust stock for Browser Test Tea',
    exact: true,
  });
  const original = Number((await stock.innerText()).trim());
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
  try {
    const till = await other.newPage();
    await signIn(till);
    const tile = till.getByRole('button', { name: 'Add Browser Test Tea', exact: true });
    await expect(tile).toContainText(`${original} in stock`);
    await stock.click();
    await page.getByLabel('New stock quantity', { exact: true }).fill(String(original + 5));
    await page
      .getByLabel('Adjustment reason', { exact: true })
      .fill('Delivery received during browser test');
    await page.getByRole('button', { name: 'Save stock', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Adjust stock', exact: true })).toHaveCount(0);
    await expect(stock).toHaveText(String(original + 5));
    await expect(tile).toContainText(`${original + 5} in stock`, { timeout: 15000 });
    await tile.click();
    await till.getByRole('button', { name: /Take payment/ }).click();
    await till.getByRole('button', { name: 'Use exact amount', exact: true }).click();
    await till.getByRole('button', { name: 'Complete sale', exact: true }).click();
    await till.getByRole('button', { name: 'New sale', exact: true }).click();
    await expect(tile).toContainText(`${original + 4} in stock`);
    await expect(stock).toHaveText(String(original + 4), { timeout: 15000 });
    await page.screenshot({ path: 'test-results/lee-live-stock.png', fullPage: true });
  } finally {
    await other.close();
  }
});

test('cashier bills an unlisted item offline, reloads, prints and syncs without deducting stock', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    window.print = () => document.documentElement.setAttribute('data-print-requested', 'yes');
  });
  await signIn(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const tile = page.getByRole('button', { name: 'Add Browser Test Tea', exact: true });
  const stock = (await tile.innerText()).match(/\d+ in stock/)![0];
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Add manual item', exact: true }).click();
  await page.getByLabel('Item name', { exact: true }).fill('Unlisted Handmade Candle');
  await page.getByLabel('Unit price (LKR)', { exact: true }).fill('125.50');
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await page.setViewportSize({ width: 390, height: 667 });
  await expect(page.getByRole('button', { name: 'Add to bill', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await page.screenshot({ path: 'test-results/lee-manual-item-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Add to bill', exact: true }).click();
  await expect(
    page.getByRole('spinbutton', { name: 'Quantity for Unlisted Handmade Candle', exact: true }),
  ).toHaveValue('2');
  await page.reload();
  await expect(
    page.getByRole('spinbutton', { name: 'Quantity for Unlisted Handmade Candle', exact: true }),
  ).toHaveValue('2');
  await expect(page.getByRole('button', { name: /Take payment/ })).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: /Take payment/ }).click();
  await page.getByRole('button', { name: 'Use exact amount', exact: true }).click();
  await page.getByRole('button', { name: 'Complete sale', exact: true }).click();
  await expect(page.locator('#sale-receipt')).toContainText('Unlisted Handmade Candle');
  await expect(page.locator('#sale-receipt')).toContainText('LKR 251.00');
  await page.getByRole('button', { name: 'Print receipt', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-print-requested', 'yes');
  await page.screenshot({ path: 'test-results/lee-manual-receipt-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'New sale', exact: true }).click();
  await expect(tile).toContainText(stock);
  await context.setOffline(false);
  await expect(
    page.getByRole('button', { name: 'Open offline sync status', exact: true }),
  ).toHaveText(/Online.*0 unsynced/, { timeout: 20000 });
  await page.getByRole('link', { name: 'Sales history', exact: true }).click();
  await page.getByRole('button', { name: 'View receipt', exact: true }).first().click();
  await expect(page.locator('#sale-receipt')).toContainText('Unlisted Handmade Candle');
  await expect(page.locator('#sale-receipt')).toContainText('LKR 251.00');
});

test('admin completes and voids a mixed manual bill and can audit its entered details', async ({
  page,
}) => {
  await signIn(page, true);
  const tile = page.getByRole('button', { name: 'Add Browser Test Tea', exact: true });
  const original = Number((await tile.innerText()).match(/(\d+) in stock/)![1]);
  await tile.click();
  await page.getByRole('button', { name: 'Add manual item', exact: true }).click();
  await page.getByLabel('Item name', { exact: true }).fill('Unlisted Gift Wrap');
  await page.getByLabel('Unit price (LKR)', { exact: true }).fill('49.90');
  await page.getByRole('button', { name: 'Add to bill', exact: true }).click();
  await page.getByRole('button', { name: /Take payment/ }).click();
  await page.getByRole('button', { name: 'Use exact amount', exact: true }).click();
  await page.getByRole('button', { name: 'Complete sale', exact: true }).click();
  await expect(page.locator('#sale-receipt')).toContainText('Browser Test Tea');
  await expect(page.locator('#sale-receipt')).toContainText('Unlisted Gift Wrap');
  await expect(page.locator('#sale-receipt')).toContainText('LKR 149.90');
  await page.getByRole('button', { name: 'New sale', exact: true }).click();
  await expect(tile).toContainText(`${original - 1} in stock`);
  await expect(
    page.getByRole('button', { name: 'Open offline sync status', exact: true }),
  ).toHaveText(/Online.*0 unsynced/, { timeout: 20000 });
  await page.getByRole('link', { name: 'Sales history', exact: true }).click();
  await page.getByRole('button', { name: 'View receipt', exact: true }).first().click();
  await page.getByRole('button', { name: 'Void this sale', exact: true }).click();
  await page.getByLabel('Reason', { exact: true }).fill('Mixed bill returned during browser trial');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirm void', exact: true }).click();
  await expect(page.locator('#sale-receipt')).toContainText('VOIDED');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await expect(tile).toContainText(`${original} in stock`);
  await page.getByRole('link', { name: 'Audit log', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Audit action', exact: true })
    .selectOption('sale.manual');
  await page.getByText('View changes', { exact: true }).first().click();
  await expect(page.getByText('Unlisted Gift Wrap', { exact: false }).first()).toBeVisible();
});
