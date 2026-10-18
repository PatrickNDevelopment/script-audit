/**
 * Regressions for defects found in the independent acceptance review (prompt 06B), on the
 * production build under /script-audit/.
 */
import { expect, test } from '@playwright/test';
import { editScript, freshApp, loadSample, openView, runAudit, status } from './helpers';

const storedWorkspace = (page: import('@playwright/test').Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('script-audit.workspace.v1') ?? 'null'));

test.beforeEach(async ({ page }) => {
  await freshApp(page);
});

test('settings: a typed narration speed and sentence limit are kept, not clamped mid-typing', async ({
  page,
}) => {
  await loadSample(page);
  await openView(page, 'Settings');
  const wpm = page.getByLabel(/Narration speed/);
  await wpm.click();
  await wpm.press('Control+A');
  await wpm.pressSequentially('180');
  await wpm.blur();
  await expect(wpm).toHaveValue('180');
  const limit = page.getByLabel(/Long sentence limit/);
  await limit.click();
  await limit.press('Control+A');
  await limit.pressSequentially('40');
  await limit.blur();
  expect((await storedWorkspace(page)).settings).toEqual({ wpm: 180, maxWords: 40 });
  // An out-of-range value is explained and not saved; leaving the field restores the saved one.
  await limit.click();
  await limit.press('Control+A');
  await limit.pressSequentially('5');
  await expect(page.getByText('Use a whole number from 12 to 60')).toBeVisible();
  await limit.blur();
  await expect(limit).toHaveValue('40');
  expect((await storedWorkspace(page)).settings.maxWords).toBe(40);
});

test('text that cannot be stored is refused, so a reload never loses the workspace', async ({
  page,
}) => {
  await page.getByLabel(/^Paste a draft/).fill('# Only a title');
  await page.getByRole('button', { name: 'Import pasted text' }).click();
  await expect(page.getByRole('alert')).toContainText('The pasted text has no script text.');
  await page.getByLabel(/^Paste a draft/).fill('Text with a NUL \u0000 inside.');
  await page.getByRole('button', { name: 'Import pasted text' }).click();
  await expect(page.getByRole('alert')).toContainText('NUL character');
  await loadSample(page);
  await openView(page, 'Editor');
  const box = page.getByLabel(/^Script \(revision/);
  await box.fill('Text with a NUL \u0000 inside.');
  await page.getByRole('button', { name: /^Save as revision/ }).click();
  await expect(status(page)).toContainText('cannot be saved');
  await page.reload();
  await expect(page.getByText('The saved workspace could not be read')).toHaveCount(0);
  await expect(page.getByTestId('sample-banner')).toBeVisible();
  expect((await storedWorkspace(page)).revisions).toHaveLength(1);
});

test('hostile backend answers: invented numbers, claims and duplicates are dropped in the browser', async ({
  page,
}) => {
  await loadSample(page);
  await editScript(
    page,
    (t) =>
      `${t}\nThe crew pulled the tower inland across the soft wet fields of the coast, and the whole town came out each morning to watch them work slowly through the deep mud.\n`,
  );
  await runAudit(page, 'Spoken readability');
  const s1 = page.locator('li.finding[data-key^="S1|The crew pulled the tower inland"]');
  const key = (await s1.getAttribute('data-key')) ?? '';
  const excerpt = key.split('|')[1] ?? '';
  const meta = {
    provider: 'stub',
    model: 'hostile',
    promptVersion: 'p',
    dropped: 0,
    cached: false,
  };
  await page.route('**/api/ai/explain', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        recommendations: [
          {
            findingKey: key,
            explanation: '<img src=x onerror="window.__xss=1">Shorter is easier.',
            rewrite: {
              original: excerpt,
              replacement: excerpt.replace(
                'each morning',
                'three million times, according to experts',
              ),
            },
          },
          { findingKey: key, explanation: 'A second answer for the same finding.' },
        ],
        meta,
      }),
    }),
  );
  const ai = page.getByRole('region', { name: 'AI explanations (optional)' });
  await ai.getByLabel(/I opt in/).check();
  await ai.getByRole('checkbox', { name: /S1 Long sentence: The crew pulled/ }).check();
  await ai.getByRole('button', { name: 'Ask for explanations' }).click();
  const results = ai.getByTestId('ai-results');
  await expect(results).toContainText('2 item(s) were dropped');
  await expect(results.locator('li')).toHaveCount(1);
  await expect(results).toContainText('<img src=x');
  await expect(
    results.getByText(/A proposed rewrite was dropped: the rewrite adds a number/),
  ).toBeVisible();
  await expect(results.getByRole('button', { name: 'Apply AI rewrite' })).toHaveCount(0);
  expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
  expect((await storedWorkspace(page)).revisions).toHaveLength(2);
});
