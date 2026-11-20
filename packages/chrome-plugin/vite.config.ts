import { crx } from '@crxjs/vite-plugin';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import copy from 'rollup-plugin-copy';
import sveltePreprocess from 'svelte-preprocess';
import { defineConfig, loadEnv, type PluginOption } from 'vite';
import { createManifest } from './src/manifest';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');

	const browser = env.TARGET_BROWSER ?? 'chrome';

	if (browser !== 'chrome' && browser !== 'firefox') {
		throw new Error('UNSUPPORTED BROWSER TYPE');
	}

	console.log(`Building for ${browser}`);

	const production = mode === 'production';
	const personal = env.HARPER_PERSONAL === '1';

	console.log(`Personal build: ${personal}`);

	return {
		define: {
			__HARPER_PERSONAL__: JSON.stringify(personal),
		},
		build: {
			minify: false,
			outDir: 'build',
			// Vite's modulepreload links resolve on the host page and 404. The content
			// script imports extension chunks directly.
			modulePreload: false,
			rollupOptions: {
				output: {
					chunkFileNames: 'assets/chunk-[hash].js',
				},
			},
		},
		plugins: [
			copy({
				hook: 'buildStart',
				targets: [
					{
						src: '../harper.js/dist/harper_wasm_bg.wasm',
						dest: './public/wasm',
					},
					{
						src: '../harper.js/dist/harper_wasm_slim_bg.wasm',
						dest: './public/wasm',
					},
				],
			}) as unknown as PluginOption,
			tailwindcss(),
			crx({ manifest: createManifest(personal), browser }) as unknown as PluginOption,
			svelte({
				compilerOptions: {
					dev: !production,
				},
				preprocess: sveltePreprocess(),
			}),
		],
		resolve: {
			alias: {
				'@': path.resolve(__dirname, 'src'),
			},
		},
		legacy: {
			skipWebSocketTokenCheck: true,
		},
	};
});
