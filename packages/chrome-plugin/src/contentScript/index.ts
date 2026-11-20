import { focusedEditor } from './editorHost';

/**
 * Silent scout. This file is injected in every frame and must not construct the
 * linter, observe the document, or message the extension until this frame is in use.
 */
function isGoogleDocsDocument(): boolean {
	return (
		window.location.hostname === 'docs.google.com' &&
		window.location.pathname.startsWith('/document/')
	);
}

let arming = false;

function frameShouldLint(): boolean {
	if (document.hidden || !document.hasFocus()) {
		return false;
	}

	if (isGoogleDocsDocument()) {
		return true;
	}

	return focusedEditor() != null;
}

function arm() {
	if (arming || !frameShouldLint()) {
		return;
	}

	arming = true;
	void import('./lintPage')
		.then((mod) => {
			mod.startLintPage();
		})
		.catch((error: unknown) => {
			arming = false;
			console.error('Harper failed to start on this page', error);
		});
}

document.addEventListener('focusin', () => arm(), true);
window.addEventListener('focus', () => arm());
document.addEventListener('visibilitychange', () => {
	if (!document.hidden) {
		arm();
	}
});
arm();
