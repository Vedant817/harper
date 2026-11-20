/** True only for the personal extension build. The public build leaves this unset. */
export const HARPER_PERSONAL: boolean =
	typeof __HARPER_PERSONAL__ !== 'undefined' && __HARPER_PERSONAL__;
