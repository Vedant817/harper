import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './fixtures';
import { clickHarperHighlight, openExtensionPage, skipUnlessPersonalControl } from './testUtils';

const PAGE = 'http://localhost:8081/simple_textarea.html';

test('Personal presets change style rules and leave installed packs alone', async ({
	page,
	context,
}) => {
	test.setTimeout(180000);
	const background = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

	await openExtensionPage(context, page, 'popup.html');
	const start = page.getByRole('button', { name: "Let's start writing" });
	if ((await start.count()) > 0) {
		await start.click();
	}

	const preset = page.locator('#harper-preset');
	await skipUnlessPersonalControl(page, preset, 'This build has no personal preset control');

	const packsBefore = await background.evaluate(async () => {
		const stored = await chrome.storage.local.get('weirpacks');
		return stored.weirpacks ?? null;
	});

	await preset.selectOption('email');
	await expect.poll(() => storedPreset(background), { timeout: 20000 }).toBe('email');

	await page.goto(PAGE);
	const box = page.locator('textarea');
	await box.click();

	await applySuggestion(
		page,
		box,
		'I finished the draft, I sent it.',
		', ',
		'This comma joins two sentences. Use a period or a semicolon.',
		'. ',
		'I finished the draft. I sent it.',
	);

	await applySuggestion(
		page,
		box,
		"Hope you're well.",
		"Hope you're well",
		'Start with I.',
		"I hope you're well",
		"I hope you're well.",
	);
	await applySuggestion(
		page,
		box,
		"I hope you're well.",
		"you're",
		'Consider expanding this contraction.',
		'you are',
		'I hope you are well.',
	);

	await applySuggestion(
		page,
		box,
		'Per my last email, the draft is ready.',
		'Per my last email',
		'Say this in a plainer way.',
		'As I mentioned',
		'As I mentioned, the draft is ready.',
	);

	await presetFromPopup(context, page, 'casual');
	await page.goto(PAGE);
	await page.locator('textarea').click();
	await page.locator('textarea').fill("Hope you're well. This is an test.");
	await expectOnlyProblem(page, 'an');
	await page.locator('textarea').fill('I finished the draft, I sent it.');
	expect(await clickHarperHighlight(page, ', ')).toBe(true);
	await expect(
		page.getByText('This comma joins two sentences. Use a period or a semicolon.', { exact: true }),
	).toBeVisible();

	await openExtensionPage(context, page, 'options.html');
	const optionsPreset = page.locator('select[aria-labelledby="preset-label"]');
	await expect(optionsPreset).toBeVisible({ timeout: 20000 });
	await expect(optionsPreset).toHaveValue('casual');
	await optionsPreset.selectOption('linkedin');
	await expect.poll(() => storedPreset(background), { timeout: 45000 }).toBe('linkedin');

	await page.goto(PAGE);
	await page.locator('textarea').click();
	await page.locator('textarea').fill("Hope you're well. Per my last email, this is an test.");
	await expect(problem(page, "Hope you're well")).toBeVisible({ timeout: 45000 });
	await expect(problem(page, 'an')).toHaveCount(1);
	await expect(problem(page, 'Per my last email')).toHaveCount(0);

	await presetFromPopup(context, page, 'off');
	await page.goto(PAGE);
	await page.locator('textarea').click();
	await page
		.locator('textarea')
		.fill("This is an test. I finished the draft, I sent it. Hope you're well.");
	await expectOnlyProblem(page, 'an');

	const packsAfter = await background.evaluate(async () => {
		const stored = await chrome.storage.local.get('weirpacks');
		return stored.weirpacks ?? null;
	});
	expect(packsAfter).toEqual(packsBefore);
});

async function storedPreset(
	background: import('@playwright/test').Worker,
): Promise<string | undefined> {
	return background.evaluate(async () => {
		const stored = await chrome.storage.local.get('personalPreset');
		return stored.personalPreset;
	});
}

async function presetFromPopup(
	context: import('@playwright/test').BrowserContext,
	page: Page,
	value: string,
) {
	await openExtensionPage(context, page, 'popup.html');
	const start = page.getByRole('button', { name: "Let's start writing" });
	if ((await start.count()) > 0) {
		await start.click();
	}
	const preset = page.locator('#harper-preset');
	await expect(preset).toBeVisible({ timeout: 20000 });
	await preset.selectOption(value);
	const background = context.serviceWorkers()[0];
	if (background) {
		await expect.poll(() => storedPreset(background), { timeout: 20000 }).toBe(value);
	}
}

function problem(page: Page, problemText: string): Locator {
	return page.locator(`#harper-highlight[data-problem-text="${problemText}"]`);
}

async function expectOnlyProblem(page: Page, problemText: string) {
	await expect(problem(page, problemText)).toHaveCount(1, { timeout: 45000 });
	const texts = await page
		.locator('#harper-highlight')
		.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-problem-text')));
	expect(texts).toEqual([problemText]);
}

async function applySuggestion(
	page: Page,
	editor: Locator,
	source: string,
	problemText: string,
	message: string,
	replacement: string,
	result: string,
) {
	await editor.fill(source);
	expect(await clickHarperHighlight(page, problemText)).toBe(true);
	await expect(page.getByText(message, { exact: true })).toBeVisible();
	const width = await page.locator('.harper-container').boundingBox();
	expect(width?.width ?? 0).toBeLessThanOrEqual(280);
	await page.getByTitle(`Click to replace "${problemText}" with "${replacement}"`).click();
	await expect(editor).toHaveValue(result);
}
