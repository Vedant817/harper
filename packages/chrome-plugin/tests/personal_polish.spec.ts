import { type BrowserContext, expect } from '@playwright/test';
import { POLISH_EMPTY_ENDPOINT, POLISH_IDLE_MS } from '../src/personalPolish';
import { test } from './fixtures';
import { openExtensionPage, skipUnlessPersonalControl } from './testUtils';

const PAGE = 'http://localhost:8081/simple_textarea.html';

test('Polish stays quiet while grammar underlines still appear', async ({ page, context }) => {
	test.setTimeout(100000);
	const leaked = watchModelRequests(context);

	await page.goto(PAGE);
	const box = page.locator('textarea');
	await box.click();
	await box.fill('This is an test');
	await expect(page.locator('#harper-highlight[data-problem-text="an"]')).toBeVisible({
		timeout: 90000,
	});

	// A non-collapsed selection would show Polish if the switch defaulted on.
	await box.evaluate((element) => {
		const editor = element as HTMLTextAreaElement;
		editor.focus();
		editor.setSelectionRange(0, editor.value.length);
	});
	const go = page.locator('#harper-polish-go');
	await expect(go).toBeHidden();
	await page.waitForTimeout(POLISH_IDLE_MS);
	expect(leaked).toEqual([]);

	// A page script must not be able to press the hidden button.
	await go.evaluate((element) => {
		(element as HTMLButtonElement).click();
	});
	await expect(page.locator('#harper-polish-status')).toHaveText('');
	expect(leaked).toEqual([]);
});

test('An empty model address does not phone home', async ({ page, context }) => {
	test.setTimeout(100000);
	const leaked = watchModelRequests(context);
	const background = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

	await openExtensionPage(context, page, 'options.html');
	const selection = page.locator('#harper-polish-selection');
	await skipUnlessPersonalControl(page, selection, 'This build has no polish controls');

	await selection.check();
	await page.locator('#harper-polish-idle').check();
	await page.locator('#harper-polish-endpoint').fill('');
	await expect
		.poll(() => storedPolish(background), { timeout: 20000 })
		.toMatchObject({ polishSelection: true, polishIdle: true, polishEndpoint: '' });

	await page.goto(PAGE);
	const box = page.locator('textarea');
	await box.click();
	await box.fill('This is an test');
	const an = page.locator('#harper-highlight[data-problem-text="an"]');
	await expect(an).toBeVisible({ timeout: 90000 });
	// Idle is on. Wait out the timer. An empty address must stay quiet and must not fetch.
	await page.waitForTimeout(POLISH_IDLE_MS);
	await expect(page.locator('#harper-polish-status')).toHaveText('');
	expect(leaked).toEqual([]);

	await box.evaluate((element) => {
		const editor = element as HTMLTextAreaElement;
		editor.focus();
		editor.setSelectionRange(0, editor.value.length);
	});
	const go = page.locator('#harper-polish-go');
	await expect(go).toBeVisible({ timeout: 10000 });
	await go.evaluate((element) => {
		(element as HTMLButtonElement).click();
	});
	await expect(page.locator('#harper-polish-status')).toHaveText('');
	expect(leaked).toEqual([]);

	// A page can stretch the button over the viewport. The next real click must not send text.
	await go.evaluate((element) => {
		const button = element as HTMLButtonElement;
		button.style.setProperty('position', 'fixed', 'important');
		button.style.setProperty('inset', '0', 'important');
		button.style.setProperty('width', '100vw', 'important');
		button.style.setProperty('height', '100vh', 'important');
		button.style.setProperty('max-width', 'none', 'important');
		button.style.setProperty('max-height', 'none', 'important');
		button.style.setProperty('opacity', '0', 'important');
		button.style.setProperty('z-index', '2147483647', 'important');
	});
	await page.mouse.click(4, 4);
	await expect(page.locator('#harper-polish-status')).toHaveText('');
	expect(leaked).toEqual([]);

	// A compact move still hits the button. translate, padding, and border must not send text.
	for (const shift of ['translate', 'padding', 'border'] as const) {
		await box.evaluate((element) => {
			const editor = element as HTMLTextAreaElement;
			editor.focus();
			editor.setSelectionRange(0, editor.value.length);
		});
		await expect(go).toBeVisible();
		await go.evaluate((element, kind) => {
			const button = element as HTMLButtonElement;
			const region = element.parentElement;
			if (kind === 'translate') {
				button.style.setProperty('translate', '80px 60px', 'important');
				button.style.setProperty('opacity', '0', 'important');
			} else if (kind === 'padding' && region) {
				region.style.setProperty('padding-top', '80px', 'important');
			} else if (region) {
				region.style.setProperty('border-top-width', '80px', 'important');
			}
		}, shift);
		const parked = await go.boundingBox();
		if (parked == null) {
			throw new Error('Polish button has no box');
		}
		await page.mouse.click(parked.x + parked.width / 2, parked.y + parked.height / 2);
		await expect(page.locator('#harper-polish-status')).toHaveText('');
		expect(leaked).toEqual([]);
	}

	await box.evaluate((element) => {
		const editor = element as HTMLTextAreaElement;
		editor.focus();
		editor.setSelectionRange(0, editor.value.length);
	});
	await expect(go).toBeVisible();
	const parked = await go.evaluate((element) => {
		const button = element as HTMLButtonElement;
		const path = 'path("M 0 180")';
		button.style.setProperty('offset-path', path, 'important');
		document.addEventListener(
			'mouseup',
			() => {
				button.style.setProperty('offset-path', path, 'important');
			},
			{ capture: false, once: true },
		);
		const rect = button.getBoundingClientRect();
		return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
	});
	await page.mouse.click(parked.x, parked.y);
	await expect(page.locator('#harper-polish-status')).toHaveText('');
	expect(leaked).toEqual([]);

	await go.evaluate((element) => {
		const root = element.getRootNode() as ShadowRoot;
		const style = document.createElement('style');
		style.id = 'harper-qa-before';
		style.textContent =
			'#harper-polish::before{content:""!important;display:block!important;height:160px!important;}';
		root.append(style);
	});
	await box.evaluate((element) => {
		const editor = element as HTMLTextAreaElement;
		editor.focus();
		editor.setSelectionRange(0, 1);
		editor.setSelectionRange(0, editor.value.length);
	});
	const pushed = await go.boundingBox();
	if (pushed == null) {
		throw new Error('Polish button has no box');
	}
	await page.mouse.click(pushed.x + pushed.width / 2, pushed.y + pushed.height / 2);
	await expect(page.locator('#harper-polish-status')).toHaveText('');
	expect(leaked).toEqual([]);
	await go.evaluate((element) => {
		const root = element.getRootNode() as ShadowRoot;
		root.getElementById('harper-qa-before')?.remove();
	});

	await page.evaluate(() => {
		document.documentElement.style.setProperty('translate', '0 150px', 'important');
	});
	await box.evaluate((element) => {
		const editor = element as HTMLTextAreaElement;
		editor.focus();
		editor.setSelectionRange(0, editor.value.length);
	});
	await expect(go).toBeVisible();
	const editorBox = await box.boundingBox();
	const buttonBox = await go.boundingBox();
	if (editorBox == null || buttonBox == null) {
		throw new Error('Polish button has no box');
	}
	expect(buttonBox.y).toBeGreaterThan(editorBox.y + editorBox.height);
	expect(buttonBox.y).toBeLessThan(editorBox.y + editorBox.height + 80);
	await page.mouse.click(buttonBox.x + buttonBox.width / 2, buttonBox.y + 150);
	await expect(page.locator('#harper-polish-status')).toHaveText('');
	expect(leaked).toEqual([]);
	await page.evaluate(() => {
		document.documentElement.style.removeProperty('translate');
	});

	await box.evaluate((element) => {
		const editor = element as HTMLTextAreaElement;
		editor.focus();
		editor.setSelectionRange(0, editor.value.length);
	});
	await expect(go).toBeVisible();
	await go.click();
	await expect(page.locator('#harper-polish-status')).toHaveText(POLISH_EMPTY_ENDPOINT);
	expect(leaked).toEqual([]);

	// A full selection removes the underline. Collapse it and require the lint to return.
	await box.evaluate((element) => {
		const editor = element as HTMLTextAreaElement;
		const end = editor.value.length;
		editor.focus();
		editor.setSelectionRange(end, end);
	});
	await expect(an).toBeVisible({ timeout: 20000 });
});

/**
 * The install tab and the options fonts are expected.
 * A model call, including one to writewithharper.com, fails the test.
 */
function watchModelRequests(context: BrowserContext): string[] {
	const leaked: string[] = [];
	context.on('request', (request) => {
		const url = request.url();
		if (
			url.startsWith('http://localhost:8081') ||
			url.startsWith('http://127.0.0.1:8081') ||
			url.startsWith('chrome-extension:') ||
			url.startsWith('https://writewithharper.com/install-browser-extension') ||
			url.startsWith('https://fonts.googleapis.com') ||
			url.startsWith('https://fonts.gstatic.com')
		) {
			return;
		}
		leaked.push(url);
	});
	return leaked;
}

async function storedPolish(background: import('@playwright/test').Worker): Promise<{
	polishSelection?: boolean;
	polishIdle?: boolean;
	polishEndpoint?: string;
}> {
	return background.evaluate(async () => {
		return chrome.storage.local.get(['polishSelection', 'polishIdle', 'polishEndpoint']);
	});
}
