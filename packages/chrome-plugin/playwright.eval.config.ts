import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Local acceptance configuration.
 *
 * The product config points Chromium at a Linux vglrun wrapper and runs three
 * repeats across two browsers. The acceptance gates are timing-sensitive and
 * only need one headed Chromium, so keep this config separate from the normal
 * suite.
 */
export default defineConfig({
	testDir: path.join(here, 'tests'),
	testIgnore: ['**/google_docs*.spec.ts', '**/googleDocs*.spec.ts'],
	fullyParallel: false,
	retries: 0,
	repeatEach: 1,
	reporter: 'line',
	use: {
		trace: 'off',
		screenshot: 'only-on-failure',
		// Chromium extensions cannot load in headless mode (see tests/fixtures.ts).
		headless: false,
	},
	globalTimeout: 1800000,
	webServer: {
		command: 'pnpm exec http-server ./tests/pages -p 8081 -a 127.0.0.1',
		cwd: here,
		url: 'http://127.0.0.1:8081',
		reuseExistingServer: true,
		stdout: 'pipe',
		stderr: 'pipe',
	},
	projects: [
		{
			name: 'chromium',
			workers: 1,
			use: {
				...devices['Desktop Chrome'],
				launchOptions: {
					executablePath: chromium.executablePath(),
					args: ['--disable-gpu-sandbox'],
				},
			},
		},
	],
});
