import '@webcomponents/custom-elements';
import {
	getClosestBlockAncestor,
	isVisible,
	LintFramework,
	leafNodes,
	type UnpackedLint,
} from 'lint-framework';
import isSubstack from '../isSubstack';
import isWordPress from '../isWordPress';
import { linterStorageKeys } from '../linterStorageKeys';
import ProtocolClient from '../ProtocolClient';
import { HARPER_PERSONAL } from '../personal';
import {
	editorHostFromNode,
	focusedEditor,
	isEditorHost,
	querySelectorAllDeep,
} from './editorHost';
import { createGoogleDocsBridgeSync, isGoogleDocsPage } from './googleDocs';
import {
	loadPageSettings,
	pageActivationKey,
	pageDelay,
	pageHotkey,
	pageOpenSuggestionsOnHover,
} from './pageSettings';

let fw: LintFramework;
let syncGoogleDocsBridge: () => Promise<void> = async () => {};
let started = false;

/** Load the grammar UI in this frame. The scout calls this only after the frame is in use. */
export function startLintPage(): void {
	if (started) {
		return;
	}

	started = true;
	void bootLintPage();
}

async function bootLintPage() {
	await loadPageSettings();

	// A stored pause still wins. This runs only once this frame is about to lint.
	if (isWordPress() || isSubstack()) {
		ProtocolClient.setDomainEnabled(window.location.hostname, true, false);
	}

	fw = new LintFramework((text, domain, options) => ProtocolClient.lint(text, domain, options), {
		ignoreLint: (hash) => ProtocolClient.ignoreHash(hash),
		getActivationKey: () => Promise.resolve(pageActivationKey()),
		getHotkey: () => Promise.resolve(pageHotkey()),
		getDelay: () => Promise.resolve(pageDelay()),
		openOptions: () => ProtocolClient.openOptions(),
		addToUserDictionary: (words) => ProtocolClient.addToUserDictionary(words),
		reportError: (lint: UnpackedLint, ruleId: string) =>
			ProtocolClient.openReportError(
				padWithContext(lint.source, lint.span.start, lint.span.end, 15),
				ruleId,
				'',
			),
		setRuleEnabled: async (ruleId, enabled) => {
			await ProtocolClient.setRuleEnabled(ruleId, enabled);
			fw.update();
		},
	});
	fw.setOpenSuggestionsOnHover(pageOpenSuggestionsOnHover());
	chrome.storage.onChanged.addListener((changes, area) => {
		if (area !== 'local') {
			return;
		}

		if (changes.openSuggestionsOnHover) {
			fw.setOpenSuggestionsOnHover(changes.openSuggestionsOnHover.newValue === true);
		}

		if (linterStorageKeys.some((key) => changes[key] != null)) {
			ProtocolClient.invalidateLintCache();
			fw.update();
		}
	});
	syncGoogleDocsBridge = createGoogleDocsBridgeSync(fw);

	document.addEventListener('visibilitychange', () => {
		if (document.hidden) {
			window.clearTimeout(docsSyncTimer);
			docsSyncTimer = 0;
			return;
		}

		scheduleDocsSync();
	});

	if (isGoogleDocsPage()) {
		scheduleDocsSync();
	}

	document.addEventListener(
		'focusin',
		(event) => {
			// focusin is retargeted to the shadow host at the document level, so
			// composedPath()[0] is the real editor inside an open shadow root.
			lintFocusedEditor(event.composedPath()[0] ?? event.target, false);
		},
		{ capture: true },
	);

	scan();
	if (document.body) {
		observeMutations(document.body);
		watchOpenShadows(document.body);
	}

	lintFocusedEditor(document.activeElement, false);

	// The scout must not load this. A public build drops the import.
	if (HARPER_PERSONAL) {
		void import('./personalPolishBar').then((mod) => {
			mod.startPersonalPolish();
		});
	}
}

function padWithContext(source: string, start: number, end: number, contextLength: number): string {
	const normalizedStart = Math.max(0, Math.min(start, source.length));
	const normalizedEnd = Math.max(normalizedStart, Math.min(end, source.length));
	const contextStart = Math.max(0, normalizedStart - contextLength);
	const contextEnd = Math.min(source.length, normalizedEnd + contextLength);

	return source.slice(contextStart, contextEnd);
}

/**
 * Google Docs is not a contenteditable. Retry the bridge only while the tab is visible.
 * A hidden tab does not schedule another attempt.
 */
let docsSyncTimer = 0;

function scheduleDocsSync() {
	if (!isGoogleDocsPage() || document.hidden || docsSyncTimer !== 0) {
		return;
	}

	const tick = () => {
		docsSyncTimer = 0;
		if (!isGoogleDocsPage() || document.hidden) {
			return;
		}

		void syncGoogleDocsBridge();
		docsSyncTimer = window.setTimeout(tick, 1000);
	};

	tick();
}

/** True when `element` is the focused editor, or sits inside it, or contains it. */
function relatesToFocusedEditor(element: Element): boolean {
	const active = focusedEditor();
	if (!active) {
		return false;
	}

	return element === active || element.contains(active) || active.contains(element);
}

/**
 * Returns the reasons Harper should skip this textarea while scanning for targets.
 * An empty array means the textarea is eligible to be added.
 */
function getTextareaReasons(element: HTMLTextAreaElement, requireVisible: boolean): string[] {
	const reasons = [];

	if (requireVisible && !isVisible(element)) {
		reasons.push('not-visible');
	}

	if (element.getAttribute('data-enable-grammarly') === 'false') {
		reasons.push('grammarly-disabled');
	}

	if (element.disabled) {
		reasons.push('disabled');
	}

	if (element.readOnly) {
		reasons.push('readonly');
	}

	return reasons;
}

function maybeAddTextareaTarget(element: HTMLTextAreaElement, requireVisible: boolean) {
	if (!relatesToFocusedEditor(element)) {
		return;
	}

	const reasons = getTextareaReasons(element, requireVisible);
	if (reasons.length > 0) {
		return;
	}

	fw.addTarget(element);
}

/** CodeMirror is linted only when the page is Typst. */
function maybeAddTypstEditor(element: HTMLElement, requireVisible: boolean): void {
	if (!relatesToFocusedEditor(element)) {
		return;
	}

	const isTypstPlayground = window.location.hostname === 'typst.app';
	const explicitlyTypst = element.getAttribute('data-language') === 'typst';

	if (!isTypstPlayground && !explicitlyTypst) {
		return;
	}

	if (element.closest('[contenteditable="false"],[disabled],[readonly]') != null) {
		return;
	}

	if (requireVisible && !isVisible(element)) {
		return;
	}

	element.setAttribute('data-language', 'typst');
	fw.addTarget(element);
}

/**
 * Lint the blocks inside a contenteditable.
 * The host text includes every block, so targeting both draws two underlines for one mistake.
 */
function addContentEditableTarget(element: HTMLElement, requireVisible: boolean): void {
	if (!relatesToFocusedEditor(element)) {
		return;
	}

	if (element.classList.contains('cm-content') && element.closest('.cm-editor') != null) {
		return;
	}

	// spellcheck="false" is how LinkedIn and other composers avoid a second underline.
	// A combobox is skipped only when it is not itself an editing host.
	if (!isEditorHost(element)) {
		return;
	}

	// Quill replaces the inner paragraph while typing. The host stays, so it is the only target.
	if (element.classList.contains('ql-editor')) {
		if (!requireVisible || isVisible(element)) {
			fw.addTarget(element);
		}
		return;
	}

	if (element.classList.contains('ck-editor__editable')) {
		let added = false;

		element.querySelectorAll('p').forEach((paragraph) => {
			if (paragraph.closest('[contenteditable="false"],[disabled],[readonly]') != null) {
				return;
			}

			if (requireVisible && !isVisible(paragraph)) {
				return;
			}

			addEditableLintTarget(element, paragraph);
			added = true;
		});

		if (!added && (!requireVisible || isVisible(element))) {
			addEditableLintTarget(element, element);
		}

		return;
	}

	const leafs = leafNodes(element);
	const seenBlockContainers = new Set<Element>();

	for (const leaf of leafs) {
		if (lockedInsideHost(leaf, element)) {
			continue;
		}

		// Flex and grid composers have no `display: block` ancestor. Lint the host itself.
		const blockContainer = getClosestBlockAncestor(leaf, element) ?? element;

		if (!blockContainer || seenBlockContainers.has(blockContainer)) {
			continue;
		}

		seenBlockContainers.add(blockContainer);

		if (requireVisible && !isVisible(blockContainer)) {
			continue;
		}

		addEditableLintTarget(element, blockContainer);
	}
}

/** A descendant block replaces the host. Keeping both would underline the same words twice. */
function addEditableLintTarget(host: HTMLElement, target: Element): void {
	if (target !== host && fw.hasTarget(host)) {
		void fw.removeTarget(host);
	}

	fw.addTarget(target);
}

function scan() {
	void syncGoogleDocsBridge();

	if (isGoogleDocsPage()) {
		return;
	}

	querySelectorAllDeep<HTMLTextAreaElement>(document, 'textarea').forEach((element) => {
		maybeAddTextareaTarget(element, true);
	});

	querySelectorAllDeep<HTMLInputElement>(document, 'input').forEach((element) => {
		if (!isEditorHost(element) || !relatesToFocusedEditor(element)) {
			return;
		}

		if (!isVisible(element)) {
			return;
		}

		fw.addTarget(element);
	});

	document
		.querySelectorAll('[data-testid="gutenberg-editor"], .block-editor-iframe__body')
		.forEach((element) => {
			const leafs = leafNodes(element);

			const seenBlockContainers = new Set<Element>();

			for (const leaf of leafs) {
				const blockContainer = getClosestBlockAncestor(leaf, element);

				if (!blockContainer || seenBlockContainers.has(blockContainer)) {
					continue;
				}

				if (!relatesToFocusedEditor(blockContainer)) {
					continue;
				}

				seenBlockContainers.add(blockContainer);

				if (!isVisible(blockContainer)) {
					continue;
				}

				fw.addTarget(blockContainer);
			}
		});

	document
		.querySelectorAll<HTMLElement>('.cm-editor .cm-content[contenteditable="true"]')
		.forEach((element) => {
			maybeAddTypstEditor(element, true);
		});

	querySelectorAllDeep<HTMLElement>(
		document,
		'[contenteditable="true"],[contenteditable="plaintext-only"],[contenteditable=""]',
	).forEach((element) => {
		addContentEditableTarget(element, true);
	});

	if (document.body) {
		watchOpenShadows(document.body);
	}
}

const observedRoots = new WeakSet<Node>();

function observeMutations(root: Node) {
	if (observedRoots.has(root)) {
		return;
	}

	observedRoots.add(root);
	new MutationObserver(() => {
		scan();
	}).observe(root, { childList: true, subtree: true });
}

function watchOpenShadows(parent: ParentNode) {
	parent.querySelectorAll<Element>('*').forEach((element) => {
		if (!element.shadowRoot) {
			return;
		}

		observeMutations(element.shadowRoot);
		watchOpenShadows(element.shadowRoot);
	});
}

function lockedInsideHost(leaf: Node, host: Element): boolean {
	let current = leaf.parentElement;

	while (current && current !== host) {
		if (current.matches('[contenteditable="false"],[disabled],[readonly]')) {
			return true;
		}

		current = current.parentElement;
	}

	return false;
}

/** An editor that already has focus must be linted even though its focus event already fired. */
function lintFocusedEditor(node: EventTarget | null, requireVisible: boolean) {
	const host = editorHostFromNode(node instanceof Node ? node : null);
	if (!host) {
		return;
	}

	if (host instanceof HTMLTextAreaElement) {
		maybeAddTextareaTarget(host, requireVisible);
		return;
	}

	if (host instanceof HTMLInputElement) {
		if (!relatesToFocusedEditor(host)) {
			return;
		}

		if (requireVisible && !isVisible(host)) {
			return;
		}

		fw.addTarget(host);
		return;
	}

	if (host.classList.contains('cm-content') && host.closest('.cm-editor') != null) {
		maybeAddTypstEditor(host, requireVisible);
		return;
	}

	addContentEditableTarget(host, requireVisible);
}
