import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lintResultDisposition, lintShouldFlushFollowUp } from './src/lint/lintRequestGate.ts';

describe('an in-flight lint does not paint over a newer pass', () => {
	it('paints only when this pass is the latest one and it succeeded', () => {
		assert.equal(
			lintResultDisposition({ failed: false, followUp: false, waiting: false }),
			'paint',
		);
	});

	it('drops a result when a paste queued a follow-up', () => {
		assert.equal(lintResultDisposition({ failed: false, followUp: true, waiting: false }), 'drop');
		assert.equal(lintShouldFlushFollowUp({ followUp: true, waiting: false }), true);
	});

	it('drops a result when an immediate refresh is already waiting', () => {
		assert.equal(lintResultDisposition({ failed: false, followUp: false, waiting: true }), 'drop');
		assert.equal(lintShouldFlushFollowUp({ followUp: true, waiting: true }), false);
	});

	it('drops a failed pass and still flushes a paste that arrived during it', () => {
		assert.equal(lintResultDisposition({ failed: true, followUp: true, waiting: false }), 'drop');
		assert.equal(lintShouldFlushFollowUp({ followUp: true, waiting: false }), true);
		assert.equal(lintShouldFlushFollowUp({ followUp: false, waiting: false }), false);
	});
});
