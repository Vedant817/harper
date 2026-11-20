import { expect, test } from './fixtures';

const TEST_PAGE_URL = 'http://localhost:8081/quill_simple.html';

test('Focused Quill editor has a highlight', async ({ page }) => {
	test.setTimeout(60000);
	await page.goto(TEST_PAGE_URL);
	// The saved marketing page shifts the bubble editor off the visible slide
	// and paints controls over it. A hit-test click never lands in the editor.
	await page.evaluate(() => {
		const carousel = document.getElementById('carousel-container');
		if (carousel) {
			carousel.style.marginLeft = '0';
		}
		const cover = document.getElementById('above-container');
		if (cover) {
			cover.style.pointerEvents = 'none';
		}
	});
	const editor = page.locator('#bubble-container .ql-editor');
	await editor.focus();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.insertText('This is an test.');
	await expect(editor).toContainText('an test');
	const an = page.locator('#harper-highlight[data-problem-text="an"]');
	await expect(an).toHaveCount(1, { timeout: 30000 });
});
