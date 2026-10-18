import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  downloadText,
  editScript,
  example,
  finding,
  freshApp,
  loadSample,
  nav,
  openView,
  runAudit,
  status,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await freshApp(page);
});

test('journey 1: import a draft, run four audits, reject one, apply one, compare, export', async ({
  page,
}) => {
  await page.getByLabel('Markdown or text file').setInputFiles(example('draft.md'));
  await expect(status(page)).toContainText('Imported draft.md as revision 1.');
  await expect(page.locator('#title-input')).toHaveValue('The Shocking Story of the Paper Bridge');
  await expect(page.getByTestId('totals')).toContainText('spoken words');
  await expect(page.getByTestId('sample-banner')).toHaveCount(0);

  // Four separate audits, each run on its own.
  for (const name of [
    'Grounding and citations',
    'Narrative structure',
    'Spoken readability',
    'Packaging and marketability',
  ]) {
    await runAudit(page, name);
  }
  await expect(page.getByRole('tab', { name: /not run/ })).toHaveCount(0);

  // Reject the title suggestion.
  await page.getByRole('tab', { name: /Packaging/ }).click();
  const p2 = finding(page, 'P2');
  await expect(p2).toHaveCount(1);
  await p2.getByRole('button', { name: 'Reject' }).click();
  await expect(page.locator('li.finding[data-rule="P2"]:not(.rejected)')).toHaveCount(0);
  await expect(page.locator('li.finding.rejected[data-rule="P2"]')).toHaveCount(1);
  await expect(page.getByTestId('summary-packaging')).toContainText('1 rejected');

  // Preview, then apply the double-space fix.
  await page.getByRole('tab', { name: /Spoken/ }).click();
  const s5 = finding(page, 'S5');
  await s5.getByRole('button', { name: 'Preview change' }).click();
  await expect(s5.getByTestId('finding-diff-old')).toContainText('itself.  Ours');
  await expect(s5.getByTestId('finding-diff-new')).toContainText('itself. Ours');
  await s5.getByRole('button', { name: /^Apply/ }).click();
  await expect(status(page)).toContainText('Revision 2 created');
  await expect(finding(page, 'S5')).toHaveCount(0);
  // The rejected decision survives the new revision.
  await page.getByRole('tab', { name: /Packaging/ }).click();
  await expect(page.getByTestId('summary-packaging')).toContainText('1 rejected');

  // Compare original and current.
  await openView(page, 'History');
  await page.getByRole('button', { name: 'Compare revision 1 with the current one' }).click();
  // The double space (left) became one space (right); nothing else changed.
  await expect(page.getByTestId('compare-old').locator('del')).toHaveCount(1);
  await expect(page.getByTestId('compare-new').locator('ins')).toHaveCount(1);
  expect(
    await page
      .getByTestId('compare-old')
      .locator('del')
      .evaluate((e) => e.textContent),
  ).toBe('  ');
  expect(
    await page
      .getByTestId('compare-new')
      .locator('ins')
      .evaluate((e) => e.textContent),
  ).toBe(' ');
  await expect(page.getByTestId('compare')).toContainText('0 word(s) removed, 0 word(s) added');

  // Export the revision.
  await openView(page, 'Editor');
  const { text, download } = await downloadText(page, () =>
    page.getByRole('button', { name: 'Download Markdown' }).click(),
  );
  expect(download.suggestedFilename()).toBe('the-shocking-story-of-the-paper-bridge-r2.md');
  expect(
    text.startsWith(
      '# The Shocking Story of the Paper Bridge\n\nEvery town has a story it tells about itself. Ours is',
    ),
  ).toBe(true);
  expect(text).not.toContain('itself.  Ours');
  const report = await downloadText(page, () =>
    page.getByRole('button', { name: 'Download audit report' }).click(),
  );
  expect(report.text).toContain(
    'They do not verify facts and do not predict views, click-through or retention.',
  );
  expect(report.text).toContain('1 rejected');
});

test('journey 2: a claim tag clears grounding warnings only for the covered sentence', async ({
  page,
}) => {
  await loadSample(page);
  await runAudit(page, 'Grounding and citations');
  await expect(page.getByTestId('coverage')).toHaveText('1 of 10');
  await expect(finding(page, 'G1', 'The worst storm took 3 metres')).toHaveCount(1);
  await expect(finding(page, 'G1', 'She was the first keeper')).toHaveCount(1);
  const before = await page.locator('li.finding').count();

  // Tag one sentence of the paragraph with a supported claim.
  await editScript(page, (t) =>
    t.replace('in a single night.', 'in a single night [c:worst-storm].'),
  );
  await openView(page, 'Audits');
  await expect(page.getByTestId('coverage')).toHaveText('2 of 10');
  await expect(finding(page, 'G1', 'The worst storm took 3 metres')).toHaveCount(0);
  await expect(finding(page, 'G1', 'She was the first keeper')).toHaveCount(1);
  await expect(page.locator('li.finding')).toHaveCount(before - 1);

  // A tag whose claim does not contain the sentence's specifics does not cover it.
  await editScript(page, (t) =>
    t.replace('She was the first keeper to ask', 'She was the first keeper [c:keeper-log] to ask'),
  );
  await openView(page, 'Audits');
  await expect(finding(page, 'G1', 'She was the first keeper')).toHaveCount(0);
  await expect(finding(page, 'G4', 'She was the first keeper')).toContainText(
    'Not in the linked claim: first.',
  );
  await expect(page.getByTestId('coverage')).toHaveText('2 of 10');
  await editScript(page, (t) => t.replace('[c:worst-storm]', '[c:worst-storms]'));
  await openView(page, 'Audits');
  await expect(finding(page, 'G2', 'The worst storm')).toContainText(
    'Unknown claim id: worst-storms.',
  );
  await editScript(page, (t) =>
    t.replace('[c:worst-storms]', '[c:worst-storm]').replace('took 3 metres', 'took 4 metres'),
  );
  await openView(page, 'Audits');
  await expect(finding(page, 'G4', 'took 4 metres')).toContainText('Not in the linked claim: 4.');

  // Adding a source to the unsourced claim covers its sentence.
  await expect(finding(page, 'G3')).toHaveCount(1);
  await openView(page, 'Claims');
  const claim = page.locator('[data-claim="storm-record"]');
  await claim.getByText('Add a source to storm-record').click();
  await claim
    .getByLabel('Citation (where it comes from)')
    .fill('Sample source: harbour almanac (invented for this test)');
  await claim
    .getByLabel('Supporting quote (copied from the source)')
    .fill('The longest storm season on record.');
  await claim.getByRole('button', { name: 'Add source' }).click();
  await expect(claim).toContainText('supported');
  await openView(page, 'Audits');
  await expect(finding(page, 'G3')).toHaveCount(0);
});

test('approved scripts are locked; undo and revert restore exact text', async ({ page }) => {
  await loadSample(page);
  await runAudit(page, 'Spoken readability');
  await openView(page, 'Editor');
  await page.getByRole('button', { name: 'Approve script' }).click();
  await expect(page.getByTestId('status')).toHaveText('Approved: locked');
  await expect(page.getByLabel(/^Script \(revision/)).toHaveAttribute('readonly', '');
  await openView(page, 'Audits');
  await expect(finding(page, 'S5').getByRole('button', { name: /^Apply/ })).toBeDisabled();
  await openView(page, 'Editor');
  await page.getByRole('button', { name: 'Reopen for editing' }).click();
  await openView(page, 'Audits');
  const original = await finding(page, 'S1', 'Engineers lifted').locator('blockquote').innerText();
  await finding(page, 'S1', 'Engineers lifted')
    .getByRole('button', { name: /^Apply/ })
    .click();
  await expect(status(page)).toContainText('Revision 2 created');
  await openView(page, 'History');
  await page.getByRole('button', { name: 'Undo last change' }).click();
  await expect(status(page)).toContainText('Revision 3 has the exact text');
  await page.getByRole('button', { name: 'Compare revision 1 with the current one' }).click();
  await expect(page.getByTestId('compare')).toContainText('No differences.');
  await openView(page, 'Audits');
  await expect(finding(page, 'S1', 'Engineers lifted').locator('blockquote')).toHaveText(original);
  // Unsaved edits block applying, so nothing is overwritten silently.
  await openView(page, 'Editor');
  await page.getByLabel(/^Script \(revision/).fill('Something else entirely.');
  await openView(page, 'Audits');
  await expect(page.getByText('You have unsaved edits in the Editor.').first()).toBeVisible();
  await expect(finding(page, 'S5').getByRole('button', { name: /^Apply/ })).toBeDisabled();
});

test('decisions and history persist across a reload; a corrupted store is kept aside', async ({
  page,
}) => {
  await loadSample(page);
  await runAudit(page, 'Packaging and marketability');
  await finding(page, 'P3').getByRole('button', { name: 'Reject' }).click();
  await page.reload();
  await expect(page.getByTestId('sample-banner')).toBeVisible();
  await runAudit(page, 'Packaging and marketability');
  await expect(page.getByTestId('summary-packaging')).toContainText('1 rejected');
  await page.evaluate(() => localStorage.setItem('script-audit.workspace.v1', '{"schema":"nope"'));
  await page.reload();
  await expect(page.getByRole('alert').first()).toContainText(
    'The saved workspace could not be read',
  );
  expect(await page.evaluate(() => localStorage.getItem('script-audit.workspace.v1.corrupt'))).toBe(
    '{"schema":"nope"',
  );
  await expect(page.getByText('No script yet.')).toBeVisible();
});

test('import validation: empty, binary and broken workspace files are refused', async ({
  page,
}) => {
  const file = page.getByLabel('Markdown or text file');
  await file.setInputFiles({
    name: 'empty.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Only a title\n\n   \n'),
  });
  await expect(page.getByRole('alert')).toContainText('The file has no script text.');
  await file.setInputFiles({
    name: 'bin.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from([0x50, 0x00, 0x4b]),
  });
  await expect(page.getByRole('alert')).toContainText('NUL characters');
  await page.getByLabel(/^Workspace file/).setInputFiles({
    name: 'w.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schema":"script-audit.workspace","version":2}'),
  });
  await expect(page.getByRole('alert')).toContainText('The workspace was not opened');
  await page
    .getByLabel(/^Paste a draft/)
    .fill('Line one with “curly quotes” — and an em dash… done.\r\nSecond line.');
  await page.getByRole('button', { name: 'Import pasted text' }).click();
  await expect(status(page)).toContainText('Imported pasted text');
  await expect(page.getByLabel(/^Script \(revision 1/)).toHaveValue(
    'Line one with “curly quotes” — and an em dash… done.\nSecond line.',
  );
});

test('AI explanations: opt-in, validated rewrites, unsafe rewrites dropped, nothing applied automatically', async ({
  page,
}) => {
  await loadSample(page);
  await editScript(
    page,
    (t) =>
      `${t}\nOne more [[FAKE:NUMBER]] sentence, which runs on about the tower and the town and the horses and the rails and the weather and the crew for far too long.\n`,
  );
  await runAudit(page, 'Spoken readability');
  const ai = page.getByRole('region', { name: 'AI explanations (optional)' });
  await expect(ai.getByTestId('ai-state')).toContainText('Available: fake / fake-deterministic');
  await expect(ai.getByRole('button', { name: 'Ask for explanations' })).toHaveCount(0);
  await ai.getByLabel(/I opt in/).check();
  await ai.getByRole('checkbox', { name: /S1 Long sentence: Engineers lifted/ }).check();
  await ai.getByRole('checkbox', { name: /S3 No place to breathe: Stone towers/ }).check();
  await ai.getByRole('button', { name: 'Ask for explanations' }).click();
  const results = ai.getByTestId('ai-results');
  await expect(results).toContainText('deterministic test provider');
  await expect(results.getByText('AI, unverified').first()).toBeVisible();
  const revBefore = await page.evaluate(
    () => JSON.parse(localStorage.getItem('script-audit.workspace.v1') ?? '{}').revisions.length,
  );
  await results.getByRole('button', { name: 'Preview AI rewrite' }).first().click();
  await expect(results.getByTestId('ai-diff-new')).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('script-audit.workspace.v1') ?? '{}').revisions.length,
    ),
  ).toBe(revBefore);
  await results.getByRole('button', { name: 'Apply AI rewrite' }).first().click();
  await expect(status(page)).toContainText('Applied AI rewrite (unverified)');
  await openView(page, 'History');
  await expect(page.locator('tbody tr').first()).toContainText('AI rewrite');

  // A rewrite that adds a number is dropped by the backend.
  await runAudit(page, 'Spoken readability');
  await expect(finding(page, 'S1', 'FAKE:NUMBER')).toHaveCount(1);
  for (const box of await ai.locator('.ai-pick input[type=checkbox]:checked').all())
    await box.uncheck();
  await ai.getByRole('checkbox', { name: /S1 Long sentence: One more \[\[FAKE:NUMBER/ }).check();
  await ai.getByRole('button', { name: 'Ask for explanations' }).click();
  await expect(results).toContainText('1 item(s) were dropped');
  await expect(results.getByRole('button', { name: 'Apply AI rewrite' })).toHaveCount(0);
});

test('AI states: provider not configured and backend offline; the app still works', async ({
  page,
}) => {
  await loadSample(page);
  await openView(page, 'Settings');
  await page.getByLabel('Backend address').fill('http://127.0.0.1:8800');
  await page.getByRole('button', { name: 'Use this address' }).click();
  await runAudit(page, 'Grounding and citations');
  await expect(page.getByTestId('ai-state')).toContainText('no AI provider is configured');
  await openView(page, 'Settings');
  await page.getByLabel('Backend address').fill('http://127.0.0.1:9');
  await page.getByRole('button', { name: 'Use this address' }).click();
  await openView(page, 'Audits');
  await expect(page.getByTestId('ai-state')).toContainText('Backend not reachable', {
    timeout: 15_000,
  });
  await expect(page.getByTestId('coverage')).toHaveText('1 of 10');
});

test('glossary from a pronunciation finding, narration export and empty states', async ({
  page,
}) => {
  for (const name of ['Audits', 'Claims', 'History', 'Compare']) {
    await openView(page, name);
    await expect(page.getByRole('link', { name: 'Go to the Editor' })).toBeVisible();
  }
  await loadSample(page);
  await runAudit(page, 'Spoken readability');
  const s4 = finding(page, 'S4', 'Siobhán');
  await s4.getByLabel(/Say “Siobhán” as/).fill('shiv-AWN');
  await s4.getByRole('button', { name: 'Add to glossary' }).click();
  await expect(finding(page, 'S4', 'Siobhán')).toHaveCount(0);
  await openView(page, 'Editor');
  const { text } = await downloadText(page, () =>
    page.getByRole('button', { name: 'Download narration text' }).click(),
  );
  expect(text).toContain('- Siobhán: shiv-AWN');
  expect(text).not.toMatch(/\[c:|\{setup|##/);
});

test('mobile width has no horizontal page scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await loadSample(page);
  await runAudit(page, 'Spoken readability');
  await finding(page, 'S1', 'Engineers lifted')
    .getByRole('button', { name: 'Preview change' })
    .click();
  for (const name of ['Editor', 'Audits', 'Claims', 'History', 'Compare', 'Settings', 'About']) {
    await openView(page, name);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, name).toBeLessThanOrEqual(0);
  }
});

test('screenshots for the docs', async ({ page }) => {
  const dir = join(process.cwd(), 'docs', 'screenshots');
  mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await loadSample(page);
  await page.screenshot({ path: join(dir, 'editor-desktop.png'), fullPage: true });
  await runAudit(page, 'Spoken readability');
  await finding(page, 'S1', 'Engineers lifted')
    .getByRole('button', { name: 'Preview change' })
    .click();
  await page.screenshot({ path: join(dir, 'audits-desktop.png'), fullPage: true });
  await runAudit(page, 'Grounding and citations');
  await page.screenshot({ path: join(dir, 'grounding-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('tab', { name: /Spoken/ }).click();
  await page.screenshot({ path: join(dir, 'audits-mobile.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openView(page, 'Editor');
  await page.screenshot({ path: join(dir, 'editor-dark.png'), fullPage: true });
  await expect(nav(page)).toBeVisible();
});
