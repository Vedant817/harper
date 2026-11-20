import ProtocolClient from '../ProtocolClient';
import { HARPER_PERSONAL } from '../personal';
import {
	defaultPolishSettings,
	POLISH_CHANGED,
	POLISH_EMPTY_TEXT,
	POLISH_IDLE_MS,
	type PolishBox,
	type PolishControlStyle,
	type PolishSettings,
	polishBlockReason,
	polishClickAllowed,
	polishControlStyleAllowed,
	polishSettingsFromStorage,
	polishStorageKeys,
} from '../personalPolish';
import { focusedEditor } from './editorHost';

type ValueSnap = { kind: 'value'; start: number; end: number; text: string };
type RangeSnap = { kind: 'range'; range: Range; text: string };
type Pending = {
	editor: HTMLElement;
	source: string;
	replacement: string;
	selection: ValueSnap | RangeSnap | null;
};

let started = false;
let settings: PolishSettings = defaultPolishSettings();
let generation = 0;
let idleTimer = 0;
let pending: Pending | null = null;
let region: HTMLDivElement;
let goButton: HTMLButtonElement;
let statusNode: HTMLDivElement;
let previewNode: HTMLDivElement;
let acceptButton: HTMLButtonElement;
let dismissButton: HTMLButtonElement;
/** Boxes measured the last time the bar was laid out. A later stretch does not count. */
const placedBoxes = new Map<HTMLElement, PolishBox>();

/** Mount the selection polish bar. Call this only from the lint page, and only on a personal build. */
export function startPersonalPolish(): void {
	if (started || !HARPER_PERSONAL) {
		return;
	}

	started = true;
	mount();
	void chrome.storage.local.get([...polishStorageKeys]).then((stored) => {
		settings = polishSettingsFromStorage(stored);
		layout();
	});
	chrome.storage.onChanged.addListener((changes, area) => {
		if (area !== 'local' || !polishStorageKeys.some((key) => changes[key] != null)) {
			return;
		}
		void chrome.storage.local.get([...polishStorageKeys]).then((stored) => {
			settings = polishSettingsFromStorage(stored);
			if (!settings.idle) {
				window.clearTimeout(idleTimer);
			}
			layout();
		});
	});
	document.addEventListener('selectionchange', layout);
	document.addEventListener('focusin', layout, true);
	document.addEventListener('mouseup', layout, true);
	document.addEventListener('keyup', layout, true);
	document.addEventListener('input', onInput, true);
	document.addEventListener('keydown', onKeydown, true);
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden) {
			return;
		}
		window.clearTimeout(idleTimer);
		dismiss();
	});
}

function mount(): void {
	region = document.createElement('div');
	region.id = 'harper-polish';
	region.style.position = 'fixed';
	region.style.zIndex = '2147483647';
	region.style.maxWidth = 'min(280px, calc(100vw - 16px))';
	region.style.boxSizing = 'border-box';
	region.style.flexDirection = 'column';
	region.style.gap = '6px';
	region.style.padding = '8px';
	region.style.borderRadius = '8px';
	region.style.background = '#fff';
	region.style.color = '#111';
	region.style.border = '1px solid #d0d0d0';
	region.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.16)';
	region.style.font = '13px/1.4 system-ui, sans-serif';
	region.style.setProperty('display', 'none', 'important');
	region.addEventListener('mousedown', (event) => {
		event.preventDefault();
	});

	goButton = actionButton('harper-polish-go', 'Polish selection', onGo);
	statusNode = document.createElement('div');
	statusNode.id = 'harper-polish-status';
	statusNode.setAttribute('aria-live', 'polite');
	previewNode = document.createElement('div');
	previewNode.id = 'harper-polish-preview';
	previewNode.style.whiteSpace = 'pre-wrap';
	previewNode.style.overflow = 'auto';
	previewNode.style.maxHeight = '8em';
	acceptButton = actionButton('harper-polish-accept', 'Replace', onAccept);
	dismissButton = actionButton('harper-polish-dismiss', 'Dismiss', dismiss);
	region.append(goButton, statusNode, previewNode, acceptButton, dismissButton);
	lockButton(goButton, false);
	lockButton(acceptButton, false);
	lockButton(dismissButton, false);
	setDisplayed(previewNode, false);
	document.documentElement.append(region);
}

function actionButton(id: string, label: string, action: () => void): HTMLButtonElement {
	const button = document.createElement('button');
	button.id = id;
	button.type = 'button';
	button.textContent = label;
	button.style.font = 'inherit';
	button.style.cursor = 'pointer';
	button.addEventListener('click', (event) => {
		// A page script can call click() on a hidden button. Only a real user click counts.
		if (!event.isTrusted) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		const live = button.getBoundingClientRect();
		if (
			!polishClickAllowed({
				trusted: true,
				clientX: event.clientX,
				clientY: event.clientY,
				live,
				placed: placedBoxes.get(button) ?? null,
			}) ||
			!polishControlStyleAllowed(readControlStyle(button)) ||
			!polishControlStyleAllowed(readControlStyle(region))
		) {
			// The page moved or stretched this control. Put it back and do not send text.
			layout();
			return;
		}
		action();
	});
	return button;
}

function onInput(event: Event): void {
	if (!event.isTrusted || !settings.idle || document.hidden) {
		return;
	}

	const editor = focusedEditor();
	if (!editor || !eventInEditor(event, editor)) {
		return;
	}

	window.clearTimeout(idleTimer);
	idleTimer = window.setTimeout(() => {
		idleTimer = 0;
		void runIdle(editor);
	}, POLISH_IDLE_MS);
}

async function runIdle(editor: HTMLElement): Promise<void> {
	if (!settings.idle || document.hidden || focusedEditor() !== editor) {
		return;
	}

	const source = fieldText(editor);
	if (polishBlockReason(settings, source)) {
		return;
	}

	const token = ++generation;
	const result = await ProtocolClient.polishText(source, 'idle');
	if (token !== generation || !settings.idle || document.hidden || focusedEditor() !== editor) {
		return;
	}
	if (!result.ok || fieldText(editor) !== source) {
		return;
	}

	pending = { editor, source, replacement: result.text, selection: null };
	previewNode.textContent = result.text;
	statusNode.textContent = '';
	layout();
}

function onGo(): void {
	if (!settings.selection) {
		return;
	}

	window.clearTimeout(idleTimer);
	const editor = focusedEditor();
	const selection = editor ? readSelection(editor) : null;
	if (!editor || !selection) {
		pending = null;
		showStatus(POLISH_EMPTY_TEXT);
		return;
	}

	const reason = polishBlockReason(settings, selection.text);
	if (reason) {
		pending = null;
		showStatus(reason);
		return;
	}

	const token = ++generation;
	const source = selection.text;
	showStatus('Polishing…');
	void ProtocolClient.polishText(source, 'selection').then((result) => {
		if (token !== generation) {
			return;
		}
		if (!result.ok) {
			pending = null;
			showStatus(result.text);
			return;
		}
		if (!selectionStill(editor, selection)) {
			pending = null;
			showStatus(POLISH_CHANGED);
			return;
		}
		pending = { editor, source, replacement: result.text, selection };
		previewNode.textContent = result.text;
		statusNode.textContent = '';
		layout();
	});
}

function onAccept(): void {
	if (!pending) {
		return;
	}

	const { editor, source, replacement, selection } = pending;
	if (!editor.isConnected) {
		showStatus(POLISH_CHANGED);
		return;
	}

	if (selection) {
		if (!replaceSelection(editor, selection, replacement)) {
			showStatus(POLISH_CHANGED);
			return;
		}
	} else if (fieldText(editor) !== source) {
		showStatus(POLISH_CHANGED);
		return;
	} else {
		writeField(editor, replacement);
	}

	pending = null;
	previewNode.textContent = '';
	statusNode.textContent = '';
	layout();
}

function dismiss(): void {
	generation += 1;
	pending = null;
	previewNode.textContent = '';
	statusNode.textContent = '';
	layout();
}

function onKeydown(event: KeyboardEvent): void {
	if (!event.isTrusted || event.key !== 'Escape' || region.style.display === 'none') {
		return;
	}
	event.preventDefault();
	event.stopPropagation();
	dismiss();
}

function layout(): void {
	const selection = settings.selection ? currentSelection() : null;
	const showGo = selection != null && pending == null;
	const showResult = pending != null;
	const showStatus = (statusNode.textContent ?? '').length > 0;
	lockButton(goButton, showGo);
	setDisplayed(previewNode, showResult);
	lockButton(acceptButton, showResult);
	lockButton(dismissButton, showResult || showStatus);
	const editor = focusedEditor();
	if (showGo || showResult || showStatus) {
		region.style.setProperty('display', 'flex', 'important');
		if (editor) {
			place(editor);
		}
		rememberControl(goButton);
		rememberControl(acceptButton);
		rememberControl(dismissButton);
		return;
	}
	placedBoxes.clear();
	region.style.setProperty('display', 'none', 'important');
}

function showStatus(message: string): void {
	statusNode.textContent = message;
	layout();
}

function place(editor: HTMLElement): void {
	const rect = editor.getBoundingClientRect();
	const width = Math.min(280, window.innerWidth - 16);
	let top = rect.bottom + 8;
	if (top > window.innerHeight - 48) {
		top = Math.max(8, rect.top - 48);
	}
	const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
	const style = region.style;
	style.setProperty('position', 'fixed', 'important');
	style.setProperty('inset', 'auto', 'important');
	style.setProperty('top', `${top}px`, 'important');
	style.setProperty('left', `${left}px`, 'important');
	style.setProperty('width', `${width}px`, 'important');
	style.setProperty('height', 'auto', 'important');
	style.setProperty('max-width', `${width}px`, 'important');
	style.setProperty('max-height', '240px', 'important');
	style.setProperty('margin', '0', 'important');
	style.setProperty('padding', '8px', 'important');
	style.setProperty('border-width', '1px', 'important');
	style.setProperty('border-style', 'solid', 'important');
	style.setProperty('box-sizing', 'border-box', 'important');
	style.setProperty('gap', '6px', 'important');
	style.setProperty('flex-direction', 'column', 'important');
	style.setProperty('opacity', '1', 'important');
	style.setProperty('visibility', 'visible', 'important');
	style.setProperty('transform', 'none', 'important');
	style.setProperty('translate', 'none', 'important');
	style.setProperty('rotate', 'none', 'important');
	style.setProperty('scale', 'none', 'important');
	style.setProperty('filter', 'none', 'important');
	style.setProperty('zoom', '1', 'important');
	style.setProperty('clip-path', 'none', 'important');
	style.setProperty('pointer-events', 'auto', 'important');
}

function rememberControl(element: HTMLElement): void {
	if (element.style.display === 'none') {
		placedBoxes.delete(element);
		return;
	}
	const rect = element.getBoundingClientRect();
	placedBoxes.set(element, {
		left: rect.left,
		top: rect.top,
		width: rect.width,
		height: rect.height,
	});
}

function setDisplayed(element: HTMLElement, shown: boolean): void {
	element.style.setProperty('display', shown ? 'flex' : 'none', 'important');
}

/** Page CSS and page script can restyle a button in the document. Pin the box on each layout. */
function lockButton(button: HTMLButtonElement, shown: boolean): void {
	const style = button.style;
	style.setProperty('display', shown ? 'inline-flex' : 'none', 'important');
	style.setProperty('position', 'static', 'important');
	style.setProperty('inset', 'auto', 'important');
	style.setProperty('width', 'auto', 'important');
	style.setProperty('height', 'auto', 'important');
	style.setProperty('max-width', '100%', 'important');
	style.setProperty('max-height', '48px', 'important');
	style.setProperty('min-width', '0', 'important');
	style.setProperty('min-height', '0', 'important');
	style.setProperty('margin', '0', 'important');
	style.setProperty('padding', '0', 'important');
	style.setProperty('border-width', '0', 'important');
	style.setProperty('box-sizing', 'border-box', 'important');
	style.setProperty('order', '0', 'important');
	style.setProperty('opacity', '1', 'important');
	style.setProperty('visibility', 'visible', 'important');
	style.setProperty('transform', 'none', 'important');
	style.setProperty('translate', 'none', 'important');
	style.setProperty('rotate', 'none', 'important');
	style.setProperty('scale', 'none', 'important');
	style.setProperty('filter', 'none', 'important');
	style.setProperty('zoom', '1', 'important');
	style.setProperty('clip-path', 'none', 'important');
	style.setProperty('z-index', 'auto', 'important');
	style.setProperty('pointer-events', shown ? 'auto' : 'none', 'important');
}

function readControlStyle(element: HTMLElement): PolishControlStyle {
	const style = getComputedStyle(element);
	return {
		opacity: style.opacity,
		visibility: style.visibility,
		transform: style.transform,
		translate: style.getPropertyValue('translate'),
		rotate: style.getPropertyValue('rotate'),
		scale: style.getPropertyValue('scale'),
	};
}

function currentSelection(): ValueSnap | RangeSnap | null {
	const editor = focusedEditor();
	return editor ? readSelection(editor) : null;
}

function readSelection(editor: HTMLElement): ValueSnap | RangeSnap | null {
	if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
		const start = editor.selectionStart;
		const end = editor.selectionEnd;
		if (start == null || end == null || start === end) {
			return null;
		}
		const from = Math.min(start, end);
		const to = Math.max(start, end);
		return { kind: 'value', start: from, end: to, text: editor.value.slice(from, to) };
	}

	const selected = editor.ownerDocument.getSelection();
	if (!selected || selected.rangeCount === 0 || selected.isCollapsed) {
		return null;
	}
	const range = selected.getRangeAt(0);
	if (!editor.contains(range.commonAncestorContainer)) {
		return null;
	}
	const text = range.toString();
	if (!text) {
		return null;
	}
	return { kind: 'range', range: range.cloneRange(), text };
}

function selectionStill(editor: HTMLElement, selection: ValueSnap | RangeSnap): boolean {
	if (selection.kind === 'value') {
		if (!(editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement)) {
			return false;
		}
		return editor.value.slice(selection.start, selection.end) === selection.text;
	}
	return selection.range.toString() === selection.text;
}

function replaceSelection(
	editor: HTMLElement,
	selection: ValueSnap | RangeSnap,
	replacement: string,
): boolean {
	if (!selectionStill(editor, selection)) {
		return false;
	}

	if (selection.kind === 'value') {
		if (!(editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement)) {
			return false;
		}
		const next =
			editor.value.slice(0, selection.start) + replacement + editor.value.slice(selection.end);
		editor.value = next;
		const caret = selection.start + replacement.length;
		editor.setSelectionRange(caret, caret);
		editor.dispatchEvent(
			new InputEvent('input', {
				bubbles: true,
				inputType: 'insertReplacementText',
				data: replacement,
			}),
		);
		return true;
	}

	const range = selection.range;
	range.deleteContents();
	const node = editor.ownerDocument.createTextNode(replacement);
	range.insertNode(node);
	range.setStartAfter(node);
	range.collapse(true);
	const selected = editor.ownerDocument.getSelection();
	selected?.removeAllRanges();
	selected?.addRange(range);
	editor.dispatchEvent(
		new InputEvent('input', {
			bubbles: true,
			inputType: 'insertReplacementText',
			data: replacement,
		}),
	);
	return true;
}

function fieldText(editor: HTMLElement): string {
	if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
		return editor.value;
	}
	return editor.innerText;
}

function writeField(editor: HTMLElement, text: string): void {
	if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
		editor.value = text;
	} else {
		editor.textContent = text;
	}
	editor.dispatchEvent(
		new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: text }),
	);
}

function eventInEditor(event: Event, editor: HTMLElement): boolean {
	const target = event.target;
	return target instanceof Node && (target === editor || editor.contains(target));
}
