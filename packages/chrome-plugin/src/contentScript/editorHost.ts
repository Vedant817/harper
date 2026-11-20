/** A real editor. `spellcheck="false"` does not disqualify it. */
export function isEditorHost(element: Element): element is HTMLElement {
	if (!(element instanceof HTMLElement)) {
		return false;
	}

	if (element.getAttribute('data-enable-grammarly') === 'false') {
		return false;
	}

	if (element instanceof HTMLTextAreaElement) {
		return !element.disabled && !element.readOnly;
	}

	if (element instanceof HTMLInputElement) {
		const type = (element.getAttribute('type') ?? 'text').toLowerCase();
		if (type !== 'text' && type !== 'search' && type !== '') {
			return false;
		}

		return !element.disabled && !element.readOnly;
	}

	const editable = element.getAttribute('contenteditable');
	return editable === '' || editable === 'true' || editable === 'plaintext-only';
}

/**
 * The editing host that owns the document's active element.
 * Open shadow roots are followed. A closed shadow root stops the walk.
 */
export function focusedEditor(): HTMLElement | null {
	let current: Element | null = document.activeElement;
	const seen = new Set<Element>();

	while (current && !seen.has(current)) {
		seen.add(current);
		const inner = current.shadowRoot?.activeElement;
		if (!inner) {
			break;
		}

		current = inner;
	}

	return editorHostFromNode(current);
}

/** Walk up through open shadow roots to the editing host that contains `node`. */
export function editorHostFromNode(node: Node | null): HTMLElement | null {
	let current: Node | null = node;

	while (current) {
		if (current instanceof HTMLElement && isEditorHost(current)) {
			return current;
		}

		if (current instanceof ShadowRoot) {
			current = current.host;
			continue;
		}

		current = current.parentNode;
	}

	return null;
}

/** Light DOM plus every open shadow root. Closed roots are unreachable. */
export function querySelectorAllDeep<T extends Element>(root: ParentNode, selector: string): T[] {
	const found: T[] = [];

	const visit = (parent: ParentNode) => {
		parent.querySelectorAll<T>(selector).forEach((element) => {
			found.push(element);
		});

		parent.querySelectorAll<Element>('*').forEach((element) => {
			if (element.shadowRoot) {
				visit(element.shadowRoot);
			}
		});
	};

	visit(root);
	return found;
}
