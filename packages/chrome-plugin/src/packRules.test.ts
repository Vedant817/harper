import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { packRulesToRestore } from './packRules.ts';

describe('pack rules survive a saved config replacement', () => {
	it('keeps pack rules that the saved config does not mention', () => {
		const restored = packRulesToRestore(
			{ SpellCheck: true, PersonalHopeYoureWell: true, InstalledPackRule: true },
			{ SpellCheck: false },
		);

		assert.deepEqual(restored, {
			PersonalHopeYoureWell: true,
			InstalledPackRule: true,
		});
	});

	it('does not turn a saved rule back on', () => {
		const restored = packRulesToRestore(
			{ SpellCheck: true, AvoidContractions: true },
			{ SpellCheck: false, AvoidContractions: false },
		);

		assert.deepEqual(restored, {});
	});

	it('ignores a pack rule that was already off', () => {
		assert.deepEqual(packRulesToRestore({ InstalledPackRule: false }, {}), {});
	});
});
