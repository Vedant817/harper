import type { LintConfig } from 'harper.js';

/**
 * Rule ids that a loaded pack turned on and that are absent from the saved config.
 * `set_lint_config` replaces the whole config, and a missing key is disabled.
 */
export function packRulesToRestore(previous: LintConfig, saved: LintConfig): LintConfig {
	const restored: LintConfig = {};

	for (const [ruleId, enabled] of Object.entries(previous)) {
		if (enabled === true && !Object.hasOwn(saved, ruleId)) {
			restored[ruleId] = true;
		}
	}

	return restored;
}
