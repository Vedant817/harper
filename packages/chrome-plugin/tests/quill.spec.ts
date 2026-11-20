import { expect, test } from './fixtures';
import { getHarperHighlights } from './testUtils';

const TEST_PAGE_URL = 'http://localhost:8081/quill_simple.html';

test('Focused Quill editor has a highlight', async ({ page }) => {
	await page.goto(TEST_PAGE_URL);
	const editor = page.locator('[contenteditable="true"]').first();
	await editor.focus();
	await expect(getHarperHighlights(page)).toHaveCount(1, { timeout: 30000 });
});
