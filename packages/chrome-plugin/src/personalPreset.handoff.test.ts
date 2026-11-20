import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { presetHandoffAction } from './personalPreset.ts';

describe('preset handoff', () => {
	it('keeps a preset that is already applied and stored', () => {
		assert.equal(
			presetHandoffAction({
				inFlight: null,
				applied: 'email',
				stored: 'email',
				requested: 'email',
			}),
			'keep',
		);
	});

	it('does not cancel a rebuild that is already publishing the same preset', () => {
		assert.equal(
			presetHandoffAction({
				inFlight: 'linkedin',
				applied: 'email',
				stored: 'email',
				requested: 'linkedin',
			}),
			'keep',
		);
	});

	it('queues a switch back while another preset is still rebuilding', () => {
		assert.equal(
			presetHandoffAction({
				inFlight: 'linkedin',
				applied: 'email',
				stored: 'email',
				requested: 'email',
			}),
			'rebuild',
		);
	});

	it('queues when the engine and storage disagree', () => {
		assert.equal(
			presetHandoffAction({
				inFlight: null,
				applied: 'linkedin',
				stored: 'email',
				requested: 'email',
			}),
			'rebuild',
		);
	});
});
