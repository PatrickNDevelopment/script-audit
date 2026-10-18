import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Download, type Locator, type Page } from '@playwright/test';

export const nav = (page: Page) => page.getByRole('navigation', { name: 'Sections' });
export const status = (page: Page) => page.getByRole('status').first();
export const example = (name: string): string => join(process.cwd(), 'examples', name);

export async function freshApp(page: Page): Promise<void> {
  await page.goto('./');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'ScriptAudit' })).toBeVisible();
}

export async function openView(page: Page, name: string): Promise<void> {
  await nav(page).getByRole('link', { name, exact: true }).click();
  await expect(nav(page).getByRole('link', { name, exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
}

export async function loadSample(page: Page): Promise<void> {
  await openView(page, 'Editor');
  await page.getByRole('button', { name: 'Load the sample script' }).click();
  const replace = page.getByRole('button', { name: 'Replace' });
  if (await replace.isVisible()) await replace.click();
  await expect(page.getByTestId('sample-banner')).toBeVisible();
}

export async function runAudit(page: Page, tabName: string): Promise<void> {
  await openView(page, 'Audits');
  await page.getByRole('tab', { name: new RegExp(tabName) }).click();
  const run = page.getByRole('button', { name: new RegExp(`^Run ${tabName}`, 'i') });
  if (await run.isVisible()) await run.click();
  await expect(page.getByRole('tabpanel')).toContainText('open finding');
}

export function finding(page: Page, rule: string, text?: string): Locator {
  const all = page.locator(`li.finding[data-rule="${rule}"]`);
  // Match on the highlighted excerpt, not on the surrounding context shown with it.
  return text ? all.filter({ has: page.locator('mark').filter({ hasText: text }).first() }) : all;
}

export async function downloadText(
  page: Page,
  action: () => Promise<void>,
): Promise<{ text: string; download: Download }> {
  const [download] = await Promise.all([page.waitForEvent('download'), action()]);
  return { text: readFileSync(await download.path(), 'utf8'), download };
}

export async function editScript(page: Page, change: (text: string) => string): Promise<void> {
  await openView(page, 'Editor');
  const box = page.getByLabel(/^Script \(revision/);
  const before = await box.inputValue();
  await box.fill(change(before));
  await page.getByRole('button', { name: /^Save as revision/ }).click();
  await expect(status(page)).toContainText('Saved revision');
}
