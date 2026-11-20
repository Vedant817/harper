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
import ProtocolClient from '../ProtocolClient';
import { editorHostFromNode, isEditorHost, querySelectorAllDeep } from './editorHost';
import { createGoogleDocsBridgeSync, isGoogleDocsPage } from './googleDocs';

if (isWordPress() || isSubstack()) {
	ProtocolClient.setDomainEnabled(window.location.hostname, true, false);
}

const fw = new LintFramework(
	(text, domain, options) => ProtocolClient.lint(text, domain, options),
	{
		ignoreLint: (hash) => ProtocolClient.ignoreHash(hash),
		getActivationKey: () => ProtocolClient.getActivationKey(),
		getHotkey: () => ProtocolClient.getHotkey(),
		getDelay: () => ProtocolClient.getDelay(),
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
	},
);

// Read once at startup; changes to this preference require a page reload.
ProtocolClient.getOpenSuggestionsOnHover()
	.then((enabled) => fw.setOpenSuggestionsOnHover(enabled))
	.catch((error) => console.error('Failed to load suggestion hover setting:', error));

const syncGoogleDocsBridge = createGoogleDocsBridgeSync(fw);

function padWithContext(source: string, start: number, end: number, contextLength: number): string {
	const normalizedStart = Math.max(0, Math.min(start, source.length));
	const normalizedEnd = Math.max(normalizedStart, Math.min(end, source.length));
	const contextStart = Math.max(0, normalizedStart - contextLength);
	const contextEnd = Math.min(source.length, normalizedEnd + contextLength);

	return source.slice(contextStart, contextEnd);
}

const keepAliveCallback = () => {
	ProtocolClient.lint('', 'example.com', {});
	void syncGoogleDocsBridge();

	setTimeout(keepAliveCallback, 400);
};

keepAliveCallback();

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
	const reasons = getTextareaReasons(element, requireVisible);
	if (reasons.length > 0) {
		return;
	}

	fw.addTarget(element);
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
		if (!isEditorHost(element)) {
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
			const isTypstPlayground = window.location.hostname === 'typst.app';
			const explicitlyTypst = element.getAttribute('data-language') === 'typst';

			if (!isTypstPlayground && !explicitlyTypst) {
				return;
			}

			if (element.closest('[contenteditable="false"],[disabled],[readonly]') != null) {
				return;
			}

			if (!isVisible(element)) {
				return;
			}

			element.setAttribute('data-language', 'typst');
			fw.addTarget(element);
		});

	querySelectorAllDeep<HTMLElement>(
		document,
		'[contenteditable="true"],[contenteditable="plaintext-only"],[contenteditable=""]',
	).forEach((element) => {
		if (element.classList.contains('cm-content') && element.closest('.cm-editor') != null) {
			return;
		}

		// spellcheck="false" is how LinkedIn and other composers avoid a second underline.
		// A combobox is skipped only when it is not itself an editing host.
		if (!isEditorHost(element)) {
			return;
		}

		if (element.classList.contains('ck-editor__editable')) {
			element.querySelectorAll('p').forEach((paragraph) => {
				if (paragraph.closest('[contenteditable="false"],[disabled],[readonly]') != null) {
					return;
				}

				if (!isVisible(paragraph)) {
					return;
				}

				fw.addTarget(paragraph);
			});

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

			if (!isVisible(blockContainer)) {
				continue;
			}

			fw.addTarget(blockContainer);
		}
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

scan();
if (document.body) {
	observeMutations(document.body);
	watchOpenShadows(document.body);
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

	if (requireVisible && !isVisible(host)) {
		return;
	}

	fw.addTarget(host);
}

document.addEventListener(
	'focusin',
	(event) => {
		lintFocusedEditor(event.target, false);
	},
	{ capture: true },
);

lintFocusedEditor(document.activeElement, false);

setTimeout(scan, 1000);
