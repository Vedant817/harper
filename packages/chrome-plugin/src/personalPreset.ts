import type { LintConfig } from 'harper.js';
import type { PersonalPresetId } from './protocol';

/**
 * Browser-only writing presets. The Weir pack is not one of these ids.
 * `off` keeps the saved dialect, rules, dictionary, and installed packs.
 */
export const PERSONAL_PRESETS = ['off', 'casual', 'linkedin', 'email'] as const;

export const GREETING_FOLLOWERS = [
	'I',
	'We',
	'Please',
	'Just',
	'Thanks',
	'The',
	'This',
	'Can',
	'Could',
	'Would',
	'Hope',
	'Wanted',
	'Let',
] as const;

/** Style rules that load for every preset except Off. */
export const CORE_RULES = [
	'PersonalCommaSplice',
	'PersonalDirectQuestion',
	'PersonalObjectCase',
	'PersonalLessFewer',
	'PersonalInOrderTo',
	'PersonalDueToTheFact',
	'PersonalAtThisPoint',
	'PersonalInTheEvent',
	'PersonalIrregardless',
	'PersonalCouldCareLess',
	// Stacked marks are not Weir patterns. `!` is the Not operator, and each
	// `?` already ends the chunk, so `???` is never one span.
	...GREETING_FOLLOWERS.map((word) => `PersonalGreetingComma${word}`),
] as const;

/** Subjectless openers. LinkedIn DM and email only. */
export const OPENER_RULES = ['PersonalHopeYoureWell', 'PersonalWantedToFollowUp'] as const;

/** Stiff email phrases. Email only. */
export const STOCK_RULES = [
	'PersonalPerMyLastEmail',
	'PersonalCirclingBack',
	'PersonalWantedToReachOut',
] as const;

const PRESET_RULES: Record<Exclude<PersonalPresetId, 'off'>, Record<string, boolean>> = {
	casual: {
		AvoidContractions: false,
		AvoidCurses: false,
		Gonna: false,
		Gotta: false,
		Wanna: false,
	},
	linkedin: {
		AvoidContractions: false,
		AvoidCurses: true,
		Gonna: true,
		Gotta: true,
		Wanna: true,
	},
	email: {
		AvoidContractions: true,
		AvoidCurses: true,
		Gonna: true,
		Gotta: true,
		Wanna: true,
	},
};

export function parsePersonalPreset(value: unknown): PersonalPresetId {
	return PERSONAL_PRESETS.find((preset) => preset === value) ?? 'off';
}

export function ruleIdsFor(preset: PersonalPresetId): readonly string[] {
	switch (preset) {
		case 'casual':
			return CORE_RULES;
		case 'linkedin':
			return [...CORE_RULES, ...OPENER_RULES];
		case 'email':
			return [...CORE_RULES, ...OPENER_RULES, ...STOCK_RULES];
		default:
			return [];
	}
}

/**
 * Saved rule choices stay in `baseline`. The returned object is what the
 * engine uses while the preset is selected.
 */
export function overlayLintConfig(baseline: LintConfig, preset: PersonalPresetId): LintConfig {
	if (preset === 'off') {
		return baseline;
	}

	const next: LintConfig = { ...baseline, ...PRESET_RULES[preset] };
	for (const ruleId of ruleIdsFor(preset)) {
		next[ruleId] = true;
	}
	return next;
}
