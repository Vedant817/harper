export const POLISH_MAX_CHARS = 8000;
export const POLISH_IDLE_MS = 1200;
export const POLISH_TIMEOUT_MS = 20_000;

export const POLISH_EMPTY_ENDPOINT = 'Add a local model address in Harper settings.';
export const POLISH_TOO_LONG = 'That selection is too long to polish.';
export const POLISH_EMPTY_TEXT = 'Select some text to polish.';
export const POLISH_INVALID_URL =
	'That model address is not a valid URL. Use a local address such as http://127.0.0.1:11434/v1/chat/completions.';
export const POLISH_REMOTE_HTTP = 'A model that is not on this computer must use https.';
export const POLISH_NEED_MODEL = 'Add a model name in Harper settings.';
export const POLISH_NEED_ACK =
	'This address is not on this computer. Confirm that Harper may send this text there.';
export const POLISH_BAD_MODEL = 'The model name cannot contain a line break.';
export const POLISH_BAD_KEY = 'The API key cannot contain a line break.';
export const POLISH_OFF = 'Polish is turned off.';
export const POLISH_NEED_PERMISSION =
	'Allow this model address in Harper settings, then try again.';
export const POLISH_NO_TEXT = 'The model did not return text.';
export const POLISH_NO_ANSWER = 'The model did not answer.';
export const POLISH_TIMEOUT = 'The model did not answer in time.';
export const POLISH_REDIRECT = 'The model address redirected. Harper did not follow it.';
export const POLISH_CHANGED = 'The selection changed. Polish was not applied.';
export const POLISH_UNAVAILABLE = 'Polish is not available in this build.';

const POLISH_SYSTEM =
	'Rewrite the selection so it is clearer. Keep the meaning, the names, and the language. Return only the rewritten text.';

export const polishStorageKeys = [
	'polishSelection',
	'polishIdle',
	'polishEndpoint',
	'polishModel',
	'polishApiKey',
	'polishCloudAck',
] as const;

export type PolishSource = 'selection' | 'idle';

export type PolishEndpointKind = 'empty' | 'local' | 'remote' | 'insecure' | 'invalid';

export type PolishSettings = {
	selection: boolean;
	idle: boolean;
	endpoint: string;
	model: string;
	apiKey: string;
	cloudAck: boolean;
};

export type PolishResult = {
	ok: boolean;
	text: string;
};

export function defaultPolishSettings(): PolishSettings {
	return {
		selection: false,
		idle: false,
		endpoint: '',
		model: '',
		apiKey: '',
		cloudAck: false,
	};
}

export function personalConnectSources(): string[] {
	return [
		'http://127.0.0.1:*',
		'http://localhost:*',
		'http://[::1]:*',
		'https://127.0.0.1:*',
		'https://localhost:*',
		'https://[::1]:*',
		'https:',
	];
}

export function personalOptionalOrigins(): string[] {
	return [
		'http://127.0.0.1/*',
		'http://localhost/*',
		'https://127.0.0.1/*',
		'https://localhost/*',
		'https://*/*',
	];
}

export function normalizePolishSettings(value: unknown): PolishSettings {
	const record =
		value != null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
	return {
		selection: record.selection === true,
		idle: record.idle === true,
		endpoint: clipString(record.endpoint, 2000),
		model: clipString(record.model, 200),
		apiKey: clipString(record.apiKey, 4000),
		cloudAck: record.cloudAck === true,
	};
}

export function polishSettingsFromStorage(raw: object): PolishSettings {
	const record = raw as Record<string, unknown>;
	return normalizePolishSettings({
		selection: record.polishSelection === true,
		idle: record.polishIdle === true,
		endpoint: record.polishEndpoint,
		model: record.polishModel,
		apiKey: record.polishApiKey,
		cloudAck: record.polishCloudAck === true,
	});
}

export function polishSettingsToStorage(
	settings: PolishSettings,
): Record<string, boolean | string> {
	const normalized = normalizePolishSettings(settings);
	return {
		polishSelection: normalized.selection,
		polishIdle: normalized.idle,
		polishEndpoint: normalized.endpoint,
		polishModel: normalized.model,
		polishApiKey: normalized.apiKey,
		polishCloudAck: normalized.cloudAck,
	};
}

export function samePolishSettings(left: PolishSettings, right: PolishSettings): boolean {
	return (
		left.selection === right.selection &&
		left.idle === right.idle &&
		left.endpoint === right.endpoint &&
		left.model === right.model &&
		left.apiKey === right.apiKey &&
		left.cloudAck === right.cloudAck
	);
}

export function polishEndpointKind(endpoint: string): PolishEndpointKind {
	const trimmed = endpoint.trim();
	if (!trimmed) {
		return 'empty';
	}

	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return 'invalid';
	}

	if (url.username || url.password || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
		return 'invalid';
	}

	if (isLoopback(url.hostname)) {
		return 'local';
	}

	if (url.protocol !== 'https:') {
		return 'insecure';
	}

	return 'remote';
}

export function polishOriginPattern(endpoint: string): string | null {
	const kind = polishEndpointKind(endpoint);
	if (kind !== 'local' && kind !== 'remote') {
		return null;
	}

	const url = new URL(endpoint.trim());
	return `${url.protocol}//${url.hostname}/*`;
}

export function polishBlockReason(settings: PolishSettings, text: string): string | null {
	if (text.length > POLISH_MAX_CHARS) {
		return POLISH_TOO_LONG;
	}
	if (text.trim().length === 0) {
		return POLISH_EMPTY_TEXT;
	}

	const kind = polishEndpointKind(settings.endpoint);
	if (kind === 'empty') {
		return POLISH_EMPTY_ENDPOINT;
	}
	if (kind === 'invalid') {
		return POLISH_INVALID_URL;
	}
	if (kind === 'insecure') {
		return POLISH_REMOTE_HTTP;
	}
	if (/[\r\n\0]/.test(settings.model)) {
		return POLISH_BAD_MODEL;
	}
	if (settings.model.trim().length === 0) {
		return POLISH_NEED_MODEL;
	}
	if (/[\r\n\0]/.test(settings.apiKey)) {
		return POLISH_BAD_KEY;
	}
	if (kind === 'remote' && !settings.cloudAck) {
		return POLISH_NEED_ACK;
	}

	return null;
}

export function polishReplyText(value: unknown): string | null {
	if (value == null || typeof value !== 'object') {
		return null;
	}

	const record = value as Record<string, unknown>;
	const choices = record.choices;
	if (Array.isArray(choices) && choices[0] != null && typeof choices[0] === 'object') {
		const message = (choices[0] as Record<string, unknown>).message;
		if (message != null && typeof message === 'object') {
			const content = textFromContent((message as Record<string, unknown>).content);
			if (content) {
				return content;
			}
		}
	}

	return textFromContent(record.response);
}

export function buildPolishRequest(
	settings: PolishSettings,
	text: string,
): { url: string; init: RequestInit } | null {
	if (polishBlockReason(settings, text) != null) {
		return null;
	}

	const endpoint = settings.endpoint.trim();
	const headers: Record<string, string> = { 'content-type': 'application/json' };
	const apiKey = settings.apiKey.trim();
	if (apiKey) {
		headers.authorization = `Bearer ${apiKey}`;
	}

	return {
		url: endpoint,
		init: {
			method: 'POST',
			headers,
			body: JSON.stringify({
				model: settings.model.trim(),
				messages: [
					{ role: 'system', content: POLISH_SYSTEM },
					{ role: 'user', content: text },
				],
			}),
			redirect: 'error',
			credentials: 'omit',
			referrerPolicy: 'no-referrer',
			signal: AbortSignal.timeout(POLISH_TIMEOUT_MS),
		},
	};
}

export async function executePolish(
	settings: PolishSettings,
	text: string,
	source: PolishSource,
	allowed: (pattern: string) => Promise<boolean>,
	fetchImpl: (url: string, init: RequestInit) => Promise<Response>,
): Promise<PolishResult> {
	if ((source === 'selection' && !settings.selection) || (source === 'idle' && !settings.idle)) {
		return { ok: false, text: POLISH_OFF };
	}

	const reason = polishBlockReason(settings, text);
	if (reason) {
		return { ok: false, text: reason };
	}

	const request = buildPolishRequest(settings, text);
	const pattern = polishOriginPattern(settings.endpoint);
	if (!request || !pattern) {
		return { ok: false, text: POLISH_INVALID_URL };
	}

	let permitted = false;
	try {
		permitted = await allowed(pattern);
	} catch {
		permitted = false;
	}
	if (!permitted) {
		return { ok: false, text: POLISH_NEED_PERMISSION };
	}

	try {
		const response = await fetchImpl(request.url, request.init);
		if (!response.ok) {
			return { ok: false, text: POLISH_NO_TEXT };
		}

		const raw = await response.text();
		if (raw.length > 100_000) {
			return { ok: false, text: POLISH_NO_TEXT };
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return { ok: false, text: POLISH_NO_TEXT };
		}

		const reply = polishReplyText(parsed);
		if (!reply || reply.length > POLISH_MAX_CHARS) {
			return { ok: false, text: POLISH_NO_TEXT };
		}

		return { ok: true, text: reply };
	} catch (error) {
		if (error instanceof DOMException && error.name === 'TimeoutError') {
			return { ok: false, text: POLISH_TIMEOUT };
		}
		if (error instanceof Error && /redirect/i.test(error.message)) {
			return { ok: false, text: POLISH_REDIRECT };
		}
		return { ok: false, text: POLISH_NO_ANSWER };
	}
}

function clipString(value: unknown, max: number): string {
	return typeof value === 'string' ? value.slice(0, max) : '';
}

function isLoopback(hostname: string): boolean {
	const host = hostname.toLowerCase().replace(/\.+$/, '');
	if (host === 'localhost' || host === '::1' || host === '[::1]') {
		return true;
	}

	const match = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
	if (!match) {
		return false;
	}

	return match.slice(1).every((part) => Number(part) <= 255);
}

function textFromContent(content: unknown): string | null {
	if (typeof content === 'string') {
		const trimmed = content.trim();
		return trimmed.length > 0 ? trimmed : null;
	}

	if (!Array.isArray(content)) {
		return null;
	}

	const text = content
		.map((part) => {
			if (typeof part === 'string') {
				return part;
			}
			if (part != null && typeof part === 'object' && 'text' in part) {
				const value = (part as { text?: unknown }).text;
				return typeof value === 'string' ? value : '';
			}
			return '';
		})
		.join('')
		.trim();

	return text.length > 0 ? text : null;
}
