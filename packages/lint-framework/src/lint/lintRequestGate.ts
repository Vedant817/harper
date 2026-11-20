/** What to do with an in-flight lint once it settles. */
export function lintResultDisposition(input: {
	failed: boolean;
	/** A paste or other edit queued another pass. */
	followUp: boolean;
	/** An immediate refresh is waiting to run after this pass. */
	waiting: boolean;
}): 'paint' | 'drop' {
	if (input.failed || input.followUp || input.waiting) {
		return 'drop';
	}
	return 'paint';
}

/**
 * The waiting refresh reads the current text, so it replaces a queued follow-up.
 * A failed pass still has to start a follow-up that nobody else is waiting to run.
 */
export function lintShouldFlushFollowUp(input: { followUp: boolean; waiting: boolean }): boolean {
	return input.followUp && !input.waiting;
}
