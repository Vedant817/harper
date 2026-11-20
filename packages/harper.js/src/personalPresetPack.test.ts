import { expect, test } from 'vitest';
import {
	overlayLintConfig,
	parsePersonalPreset,
	ruleIdsFor,
} from '../../chrome-plugin/src/personalPreset';
import { buildPresetFiles } from '../../chrome-plugin/src/personalWeir';
import { binary } from './binaries/binary';
import LocalLinter from './LocalLinter';
import { packWeirpackFiles } from './weirpack';

test('an unknown preset is off and loads no pack', () => {
	expect(parsePersonalPreset('formal')).toBe('off');
	expect(parsePersonalPreset(null)).toBe('off');
	expect(buildPresetFiles('off')).toBeNull();
});

test('stock phrases stay out of the pack unless the preset is email', () => {
	const casual = buildPresetFiles('casual');
	const linkedin = buildPresetFiles('linkedin');
	const email = buildPresetFiles('email');
	expect(casual?.has('PersonalPerMyLastEmail.weir')).toBe(false);
	expect(casual?.has('PersonalHopeYoureWell.weir')).toBe(false);
	expect(linkedin?.has('PersonalHopeYoureWell.weir')).toBe(true);
	expect(linkedin?.has('PersonalPerMyLastEmail.weir')).toBe(false);
	expect(email?.has('PersonalPerMyLastEmail.weir')).toBe(true);
	expect(email?.has('manifest.json')).toBe(true);
	const splice = casual?.get('PersonalCommaSplice.weir') ?? '';
	expect(splice).toContain('let scope "Sentence"');
	expect(splice).toContain('Hi Sarah, I sent it');
});

test('the preset overlay does not rewrite the saved config object', () => {
	const baseline = { AvoidContractions: false, Spelling: true };
	const overlaid = overlayLintConfig(baseline, 'email');
	expect(baseline.AvoidContractions).toBe(false);
	expect(overlaid.AvoidContractions).toBe(true);
	expect(overlaid.Gonna).toBe(true);
	expect(overlaid.PersonalCommaSplice).toBe(true);
	expect(overlaid.PersonalPerMyLastEmail).toBe(true);
	expect('PersonalPerMyLastEmail' in baseline).toBe(false);
	const names = [...(buildPresetFiles('email')?.keys() ?? [])]
		.filter((name) => name.endsWith('.weir'))
		.map((name) => name.replace(/\.weir$/, ''))
		.sort();
	expect(names).toEqual([...ruleIdsFor('email')].sort());
});

async function linterWith(preset: 'casual' | 'linkedin' | 'email') {
	const files = buildPresetFiles(preset);
	if (files == null) {
		throw new Error(`Preset ${preset} has no pack`);
	}
	const linter = new LocalLinter({ binary });
	await linter.setup();
	const failures = await linter.loadWeirpackFromBytes(packWeirpackFiles(files));
	return { linter, failures };
}

test('email preset pack passes its own Weir tests', async () => {
	const { linter, failures } = await linterWith('email');
	expect(failures).toBeUndefined();
	await linter.dispose();
}, 120000);

test('casual preset corrects a comma splice and leaves stock phrases alone', async () => {
	const { linter, failures } = await linterWith('casual');
	expect(failures).toBeUndefined();

	const splice = await linter.organizedLints('I finished the draft, I sent it.');
	expect(splice.PersonalCommaSplice?.length).toBe(1);

	const stock = await linter.organizedLints('Per my last email, the draft is ready.');
	expect(stock.PersonalPerMyLastEmail).toBeUndefined();

	const opener = await linter.organizedLints("Hope you're well.");
	expect(opener.PersonalHopeYoureWell).toBeUndefined();

	await linter.dispose();
}, 120000);

test('linkedin preset inserts I only in the two openers', async () => {
	const { linter, failures } = await linterWith('linkedin');
	expect(failures).toBeUndefined();

	const hope = await linter.organizedLints("Hope you're well.");
	expect(hope.PersonalHopeYoureWell?.length).toBe(1);
	const replacement = hope.PersonalHopeYoureWell?.[0].suggestions()[0].get_replacement_text();
	expect(replacement).toBe("I hope you're well");
	for (const lint of hope.PersonalHopeYoureWell ?? []) {
		lint.free();
	}

	const already = await linter.organizedLints("I hope you're well.");
	expect(already.PersonalHopeYoureWell?.length ?? 0).toBe(0);

	await linter.dispose();
}, 120000);
