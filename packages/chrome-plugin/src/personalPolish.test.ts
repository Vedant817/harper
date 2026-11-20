import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	buildPolishRequest,
	defaultPolishSettings,
	executePolish,
	POLISH_EMPTY_ENDPOINT,
	POLISH_MAX_CHARS,
	POLISH_NEED_ACK,
	POLISH_NEED_MODEL,
	POLISH_NEED_PERMISSION,
	POLISH_NO_ANSWER,
	POLISH_NO_TEXT,
	POLISH_OFF,
	POLISH_REMOTE_HTTP,
	POLISH_TIMEOUT,
	POLISH_TOO_LONG,
	type PolishSettings,
	polishBlockReason,
	polishEndpointKind,
	polishOriginPattern,
	polishReplyText,
	polishSettingsFromStorage,
} from './personalPolish.ts';

const local: PolishSettings = {
	...defaultPolishSettings(),
	selection: true,
	idle: true,
	endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
	model: 'llama3.2',
};

function neverFetch(): Promise<Response> {
	throw new Error('fetch was called');
}

describe('polish stays on this device until the user allows it', () => {
	it('classifies loopback, remote https, and plain http', () => {
		assert.equal(polishEndpointKind(''), 'empty');
		assert.equal(polishEndpointKind('http://127.0.0.1:11434/v1/chat/completions'), 'local');
		assert.equal(polishEndpointKind('http://127.0.0.2:11434/v1'), 'local');
		assert.equal(polishEndpointKind('http://localhost.:11434/v1'), 'local');
		assert.equal(polishEndpointKind('http://[::1]:11434/v1'), 'local');
		assert.equal(polishEndpointKind('https://api.example.com/v1/chat/completions'), 'remote');
		assert.equal(polishEndpointKind('http://api.example.com/v1'), 'insecure');
		assert.equal(polishEndpointKind('http://user:pass@127.0.0.1/v1'), 'invalid');
		assert.equal(polishEndpointKind('file:///tmp/model'), 'invalid');
		assert.equal(polishEndpointKind('https://127.0.0.1.evil.com/v1'), 'remote');
	});

	it('does not build a request for the default settings', () => {
		const settings = defaultPolishSettings();
		assert.equal(settings.selection, false);
		assert.equal(settings.idle, false);
		assert.equal(settings.cloudAck, false);
		const missing = polishSettingsFromStorage({});
		assert.equal(missing.selection, false);
		assert.equal(missing.idle, false);
		assert.equal(polishBlockReason(settings, 'Hello'), POLISH_EMPTY_ENDPOINT);
		assert.equal(buildPolishRequest(settings, 'Hello'), null);
		assert.equal(polishOriginPattern('http://example.com/v1'), null);
		assert.equal(polishOriginPattern(local.endpoint), 'http://127.0.0.1/*');
	});

	it('refuses text that is too long before any other check', () => {
		assert.equal(polishBlockReason(local, 'a'.repeat(POLISH_MAX_CHARS + 1)), POLISH_TOO_LONG);
	});

	it('requires a model name and an explicit ack for a remote address', () => {
		assert.equal(polishBlockReason({ ...local, model: '  ' }, 'Hello'), POLISH_NEED_MODEL);
		const remote = {
			...local,
			endpoint: 'https://api.example.com/v1/chat/completions',
			cloudAck: false,
		};
		assert.equal(polishBlockReason(remote, 'Hello'), POLISH_NEED_ACK);
		assert.equal(
			polishBlockReason({ ...local, endpoint: 'http://example.com/v1' }, 'Hello'),
			POLISH_REMOTE_HTTP,
		);
	});

	it('does not call fetch when polish is off or the address is empty', async () => {
		const off = await executePolish(
			{ ...local, selection: false, idle: false },
			'Hello',
			'selection',
			async () => true,
			neverFetch,
		);
		assert.deepEqual(off, { ok: false, text: POLISH_OFF });

		const idleOff = await executePolish(
			{ ...local, idle: false },
			'Hello',
			'idle',
			async () => true,
			neverFetch,
		);
		assert.deepEqual(idleOff, { ok: false, text: POLISH_OFF });

		const missing = await executePolish(
			{ ...defaultPolishSettings(), selection: true },
			'Hello',
			'selection',
			async () => true,
			neverFetch,
		);
		assert.deepEqual(missing, { ok: false, text: POLISH_EMPTY_ENDPOINT });
	});

	it('does not call fetch until the address is allowed', async () => {
		let called = false;
		const result = await executePolish(
			local,
			'Hello',
			'selection',
			async () => false,
			async () => {
				called = true;
				return new Response('{}');
			},
		);
		assert.equal(called, false);
		assert.deepEqual(result, { ok: false, text: POLISH_NEED_PERMISSION });
	});

	it('sends the selection to the saved address and keeps the key out of the body', async () => {
		let seenUrl = '';
		let seenInit: RequestInit | undefined;
		const result = await executePolish(
			{ ...local, apiKey: 'secret-key' },
			'Hello there',
			'selection',
			async () => true,
			async (url, init) => {
				seenUrl = url;
				seenInit = init;
				return new Response(JSON.stringify({ choices: [{ message: { content: 'Hello.' } }] }), {
					status: 200,
				});
			},
		);

		assert.deepEqual(result, { ok: true, text: 'Hello.' });
		assert.equal(seenUrl, local.endpoint);
		assert.equal(seenInit?.method, 'POST');
		assert.equal(seenInit?.redirect, 'error');
		assert.equal(seenInit?.credentials, 'omit');
		assert.equal(seenInit?.referrerPolicy, 'no-referrer');
		const headers = seenInit?.headers as Record<string, string>;
		assert.equal(headers.authorization, 'Bearer secret-key');
		const body = String(seenInit?.body);
		assert.equal(body.includes('secret-key'), false);
		assert.equal(JSON.parse(body).messages[1].content, 'Hello there');
	});

	it('reads an Ollama response and refuses a body that is not text', async () => {
		assert.equal(polishReplyText({ response: '  Clearer. ' }), 'Clearer.');
		const ollama = await executePolish(
			local,
			'Hello',
			'idle',
			async () => true,
			async () => {
				return new Response(JSON.stringify({ response: 'Clearer.' }), { status: 200 });
			},
		);
		assert.deepEqual(ollama, { ok: true, text: 'Clearer.' });

		const empty = await executePolish(
			local,
			'Hello',
			'selection',
			async () => true,
			async () => {
				return new Response(JSON.stringify({ choices: [] }), { status: 200 });
			},
		);
		assert.deepEqual(empty, { ok: false, text: POLISH_NO_TEXT });
	});

	it('turns a timeout or a dropped connection into a sentence', async () => {
		const timedOut = await executePolish(
			local,
			'Hello',
			'selection',
			async () => true,
			async () => {
				throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
			},
		);
		assert.deepEqual(timedOut, { ok: false, text: POLISH_TIMEOUT });

		const dropped = await executePolish(
			local,
			'Hello',
			'selection',
			async () => true,
			async () => {
				throw new Error('Failed to fetch');
			},
		);
		assert.deepEqual(dropped, { ok: false, text: POLISH_NO_ANSWER });
	});
});
