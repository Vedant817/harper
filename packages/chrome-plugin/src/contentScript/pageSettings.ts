import { HARPER_PERSONAL } from '../personal';
import { ActivationKey, type Hotkey } from '../protocol';

const DEFAULT_HOTKEY: Hotkey = { modifiers: ['Ctrl'], key: 'e' };

type PageSettings = {
	delay: number;
	openSuggestionsOnHover: boolean;
	activationKey: ActivationKey;
	hotkey: Hotkey;
};

let settings: PageSettings = {
	delay: 0,
	openSuggestionsOnHover: false,
	activationKey: ActivationKey.Off,
	hotkey: DEFAULT_HOTKEY,
};

let loaded: Promise<void> | null = null;

function storedDelay(value: unknown): number {
	const delay =
		typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
	return HARPER_PERSONAL ? Math.max(delay, 250) : delay;
}

function storedActivationKey(value: unknown): ActivationKey {
	if (
		value === ActivationKey.Shift ||
		value === ActivationKey.Control ||
		value === ActivationKey.Off
	) {
		return value;
	}

	return ActivationKey.Off;
}

function storedHotkey(value: unknown): Hotkey {
	if (typeof value !== 'object' || value == null || !('key' in value) || !('modifiers' in value)) {
		return DEFAULT_HOTKEY;
	}

	const key = value.key;
	const modifiers = value.modifiers;
	if (typeof key !== 'string' || !Array.isArray(modifiers)) {
		return DEFAULT_HOTKEY;
	}

	const allowed = modifiers.filter(
		(modifier): modifier is Hotkey['modifiers'][number] =>
			modifier === 'Ctrl' || modifier === 'Shift' || modifier === 'Alt',
	);
	return { key, modifiers: allowed };
}

function applyStored(stored: Record<string, unknown>) {
	settings = {
		delay: storedDelay(stored.delay),
		openSuggestionsOnHover: stored.openSuggestionsOnHover === true,
		activationKey: storedActivationKey(stored.activationKey),
		hotkey: storedHotkey(stored.hotkey),
	};
}

/** Read delay, hover, and hotkey from extension storage. Does not wake the service worker. */
export function loadPageSettings(): Promise<void> {
	if (loaded) {
		return loaded;
	}

	loaded = chrome.storage.local
		.get({
			delay: 0,
			openSuggestionsOnHover: false,
			activationKey: ActivationKey.Off,
			hotkey: DEFAULT_HOTKEY,
		})
		.then((stored) => {
			applyStored(stored);
		});

	chrome.storage.onChanged.addListener((changes, area) => {
		if (area !== 'local') {
			return;
		}

		if (changes.delay) {
			settings.delay = storedDelay(changes.delay.newValue);
		}

		if (changes.openSuggestionsOnHover) {
			settings.openSuggestionsOnHover = changes.openSuggestionsOnHover.newValue === true;
		}

		if (changes.activationKey) {
			settings.activationKey = storedActivationKey(changes.activationKey.newValue);
		}

		if (changes.hotkey) {
			settings.hotkey = storedHotkey(changes.hotkey.newValue);
		}
	});

	return loaded;
}

export function pageDelay(): number {
	return settings.delay;
}

export function pageOpenSuggestionsOnHover(): boolean {
	return settings.openSuggestionsOnHover;
}

export function pageActivationKey(): ActivationKey {
	return settings.activationKey;
}

export function pageHotkey(): Hotkey {
	return settings.hotkey;
}
