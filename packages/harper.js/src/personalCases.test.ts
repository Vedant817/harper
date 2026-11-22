import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildPresetFiles } from '../../chrome-plugin/src/personalWeir';
import { overlayLintConfig } from '../../chrome-plugin/src/personalPreset';
import type { PersonalPresetId } from '../../chrome-plugin/src/protocol';
import { binaryInlined } from './binaries/binaryInlined';
import LocalLinter from './LocalLinter';
import { packWeirpackFiles } from './weirpack';

/**
 * Opt-in acceptance suite for the personal browser build. It is deliberately
 * separate from the normal test run: a red result means the build is not yet
 * ready to replace a premium grammar checker, not that the repository is
 * broken. Run it with
 * `HARPER_PERSONAL_EVAL=1 pnpm vitest run src/personalCases.test.ts --browser.enabled=false`.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const casesPath = path.join(root, 'eval/personal/cases.json');
const reportPath = path.join(root, 'eval/reports/personal.json');

interface ExpectedLint {
	rule: string;
	suggestion?: string;
}

interface PersonalCase {
	id: string;
	text: string;
	preset: 'casual' | 'linkedin' | 'email' | 'core';
	expect?: ExpectedLint[];
	expectAnySuggestion?: string;
	forbidAllPersonal?: boolean;
}

interface ObservedLint {
	rule: string;
	suggestions: string[];
}

interface CaseResult {
	id: string;
	text: string;
	preset: string;
	pass: boolean;
	observed: ObservedLint[];
	reason?: string;
}

const cases: PersonalCase[] = JSON.parse(fs.readFileSync(casesPath, 'utf8')).cases;
const results: CaseResult[] = [];
const linters = new Map<string, LocalLinter>();

async function makeLinter(preset: PersonalCase['preset']): Promise<LocalLinter> {
	const linter = new LocalLinter({ binary: binaryInlined });
	await linter.setup();
	if (preset !== 'core') {
		const presetId = preset as PersonalPresetId;
		await linter.setLintConfig(overlayLintConfig(await linter.getLintConfig(), presetId));
		const files = buildPresetFiles(presetId);
		if (files == null) {
			throw new Error(`Preset ${preset} has no pack`);
		}
		const failures = await linter.loadWeirpackFromBytes(packWeirpackFiles(files));
		if (failures != null) {
			throw new Error(`Preset ${preset} failed its own Weir tests: ${JSON.stringify(failures)}`);
		}
	}
	return linter;
}

const enabled = process.env.HARPER_PERSONAL_EVAL === '1';

describe.skipIf(!enabled)('personal acceptance cases', () => {
	beforeAll(async () => {
		for (const preset of ['casual', 'email', 'core'] as const) {
			linters.set(preset, await makeLinter(preset));
		}
	});

	afterAll(async () => {
		fs.mkdirSync(path.dirname(reportPath), { recursive: true });
		fs.writeFileSync(
			reportPath,
			JSON.stringify(
				{
					generatedAt: new Date().toISOString(),
					cases: results,
				},
				null,
				2,
			),
		);
		for (const linter of linters.values()) {
			await linter.dispose();
		}
	});

	for (const testCase of cases) {
		test(testCase.id, async () => {
			const linter = linters.get(testCase.preset);
			if (linter == null) {
				throw new Error(`No linter for preset ${testCase.preset}`);
			}

			const organized = await linter.organizedLints(testCase.text);
			const observed: ObservedLint[] = Object.entries(organized).flatMap(([rule, lints]) =>
				lints.map((lint) => ({
					rule,
					suggestions: lint.suggestions().map((suggestion) => suggestion.get_replacement_text()),
				})),
			);

			const failures: string[] = [];
			for (const expected of testCase.expect ?? []) {
				const found = observed.some(
					(lint) =>
						lint.rule === expected.rule &&
						(expected.suggestion == null || lint.suggestions.includes(expected.suggestion)),
				);
				if (!found) {
					failures.push(
						`expected ${expected.rule}${expected.suggestion == null ? '' : ` -> ${JSON.stringify(expected.suggestion)}`}`,
					);
				}
			}

			if (testCase.expectAnySuggestion != null) {
				const found = observed.some((lint) =>
					lint.suggestions.some((suggestion) => suggestion.includes(testCase.expectAnySuggestion!)),
				);
				if (!found) {
					failures.push(
						`expected a suggestion containing ${JSON.stringify(testCase.expectAnySuggestion)}`,
					);
				}
			}

			if (testCase.forbidAllPersonal) {
				const personal = observed.filter((lint) => lint.rule.startsWith('Personal'));
				if (personal.length > 0) {
					failures.push(`expected no personal lint, got ${JSON.stringify(personal)}`);
				}
			}

			results.push({
				id: testCase.id,
				text: testCase.text,
				preset: testCase.preset,
				pass: failures.length === 0,
				observed,
				reason: failures.length === 0 ? undefined : failures.join('; '),
			});

			expect(
				failures,
				`${testCase.id}: ${failures.join('; ')}; observed ${JSON.stringify(observed)}`,
			).toEqual([]);
		});
	}
});
