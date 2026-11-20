import { readFileSync } from 'node:fs';

const file = process.argv[2];
const expected = process.argv[3] ?? './harper_wasm_bg.js';

if (!file) {
	console.error('Usage: node check-wasm-import.mjs <file.wasm> [module]');
	process.exit(1);
}

const imports = WebAssembly.Module.imports(new WebAssembly.Module(readFileSync(file))).map(
	(item) => item.module,
);
const unexpected = [...new Set(imports.filter((name) => name !== expected))];

if (unexpected.length > 0) {
	console.error(`${file} imports ${unexpected.join(', ')} instead of ${expected}`);
	process.exit(1);
}
