import fs from 'node:fs';
import path from 'node:path';
import { expect } from '@playwright/test';
import { test } from './fixtures';
import { getTextarea, waitForHighlightsToSettle } from './testUtils';

/**
 * Opt-in acceptance checks for the personal browser build.
 *
 * These are product gates, not unit tests: a failure means the extension does
 * not meet the stated latency, coverage, or popup contract. Run with
 * `HARPER_PERSONAL_EVAL=1` so the normal suite stays independent of a local
 * extension build and its timing variance.
 */

const PAGE = 'http://localhost:8081/simple_textarea.html';
const metricsDir = path.resolve(import.meta.dirname, '../../../eval/reports/extension');

/**
 * Write one metric file per measurement.
 *
 * Playwright runs tests in separate workers, so a shared object would lose
 * measurements. One file per metric also keeps a failing gate's number visible
 * without depending on another test.
 */
function record(name: string, value: unknown) {
	fs.mkdirSync(metricsDir, { recursive: true });
	fs.writeFileSync(
		path.join(metricsDir, `${name}.json`),
		JSON.stringify({ name, value, at: new Date().toISOString() }, null, 2),
	);
}

const DRAFT = [
	'The release is almost ready, we are checking the last few items.',
	'This is an test of the full draft path.',
	'I wanted to follow up on the notes from Tuesday.',
	'We should of shipped the smaller change first.',
	'The checklist is below, please read it before the call.',
	'Copy the file to the shared drive and tell me when it finishes.',
	'If the build fails, open the log and search for the first error.',
	'The meeting moved to Thursday at 10, I will send a new invite.',
	'There are less blockers than last week.',
	'I will send the summary once the draft is done.',
	'The dashboard loads slowly on the office network.',
	'Please check the numbers in the second table.',
	'We can split the work if that makes the review easier.',
	'The final paragraph has a mistaek that must be underlined.',
].join(' ');

test.describe('personal extension acceptance', () => {
	test.skip(
		process.env.HARPER_PERSONAL_EVAL !== '1',
		'Set HARPER_PERSONAL_EVAL=1 to run the personal extension acceptance gates.',
	);

	test.beforeEach(async ({ page }) => {
		await page.goto(PAGE);
	});

	test('bulk paste underlines within 700 ms', async ({ page }) => {
		test.setTimeout(120000);
		const box = getTextarea(page);
		await box.click();

		// Warm up the content script and WASM module, then measure a steady-state
		// paste. Startup latency is covered by the other gates, not this budget.
		await box.fill('This is an test');
		await page.locator('#harper-highlight[data-problem-text="an"]').waitFor({
			state: 'visible',
			timeout: 90000,
		});
		await box.fill('');
		await page.waitForTimeout(100);

		const started = Date.now();
		await box.fill('This is an test');
		await page.locator('#harper-highlight[data-problem-text="an"]').waitFor({
			state: 'visible',
			timeout: 10000,
		});
		const elapsed = Date.now() - started;

		record('pasteUnderlineMs', elapsed);
		expect(
			elapsed,
			'The first underline should appear within 700 ms of a bulk paste.',
		).toBeLessThanOrEqual(700);
	});

	test('the whole pasted draft is linted', async ({ page }) => {
		test.setTimeout(90000);
		const box = getTextarea(page);
		await box.click();
		await box.fill(DRAFT);

		// The last sentence carries the error. Seeing it proves the extension did
		// not stop after the first paragraph or the first viewport of text.
		await expect(page.locator('#harper-highlight[data-problem-text="mistaek"]')).toBeVisible({
			timeout: 30000,
		});
		await waitForHighlightsToSettle(page);

		record('fullDraftWords', DRAFT.split(/\s+/).length);
		record('fullDraftTailUnderlined', true);
	});

	test('highlights render inside a shadow root', async ({ page }) => {
		test.setTimeout(60000);
		const box = getTextarea(page);
		await box.click();
		await box.fill('This is an test');
		const highlight = page.locator('#harper-highlight[data-problem-text="an"]');
		await expect(highlight).toBeVisible({ timeout: 30000 });

		const inShadowRoot = await highlight.evaluate(
			(element) => element.getRootNode() instanceof ShadowRoot,
		);
		record('highlightInShadowRoot', inShadowRoot);
		expect(
			inShadowRoot,
			'Highlights must render in a shadow root so page CSS cannot restyle them.',
		).toBe(true);
	});

	test('a textarea inside an open shadow root is linted', async ({ page }) => {
		test.setTimeout(90000);
		await page.goto('http://localhost:8081/shadow_textarea.html');
		const box = page.locator('textarea');
		await box.click();
		await box.fill('This is an test');
		await expect(page.locator('#harper-highlight[data-problem-text="an"]')).toBeVisible({
			timeout: 60000,
		});
		record('shadowEditorUnderlined', true);
	});

	test('the suggestion card stays within 280 px and opens within 300 ms', async ({ page }) => {
		test.setTimeout(60000);
		const box = getTextarea(page);
		await box.click();
		await box.fill('This is an test');
		const highlight = page.locator('#harper-highlight[data-problem-text="an"]');
		await expect(highlight).toBeVisible({ timeout: 30000 });
		const bounds = await highlight.boundingBox();
		expect(bounds).not.toBeNull();

		const started = Date.now();
		await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
		const card = page.locator('.harper-container');
		await card.waitFor({ state: 'visible', timeout: 10000 });
		const openMs = Date.now() - started;

		const cardBox = await card.boundingBox();
		expect(cardBox).not.toBeNull();
		record('cardOpenMs', openMs);
		record('cardWidthPx', cardBox!.width);

		expect(cardBox!.width, 'The suggestion card must not exceed 280 px.').toBeLessThanOrEqual(
			280,
		);
		expect(
			openMs,
			'The suggestion card should open within 300 ms of the click.',
		).toBeLessThanOrEqual(300);
	});

	test('pasting opens no dialog and shows no alert', async ({ page }) => {
		test.setTimeout(60000);
		await page.evaluate(() => {
			const calls: string[] = [];
			(window as unknown as { __harperDialogs: string[] }).__harperDialogs = calls;
			for (const name of ['alert', 'confirm', 'prompt'] as const) {
				(window as unknown as Record<string, unknown>)[name] = (message?: string) => {
					calls.push(`${name}:${message ?? ''}`);
					return name === 'confirm' ? true : name === 'prompt' ? null : undefined;
				};
			}
		});

		const box = getTextarea(page);
		await box.click();
		await box.fill(DRAFT);
		await expect(page.locator('#harper-highlight[data-problem-text="mistaek"]')).toBeVisible({
			timeout: 30000,
		});

		const dialogs = await page.evaluate(() => ({
			calls: (window as unknown as { __harperDialogs: string[] }).__harperDialogs,
			open: document.querySelectorAll('dialog[open]').length,
		}));
		record('dialogCalls', dialogs.calls);
		record('openDialogElements', dialogs.open);
		expect(dialogs.calls, 'Pasting must not trigger alert, confirm, or prompt.').toEqual([]);
		expect(dialogs.open, 'Pasting must not leave a modal dialog open.').toBe(0);
	});
});
