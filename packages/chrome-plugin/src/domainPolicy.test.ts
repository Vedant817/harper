import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	canonicalHost,
	domainEnableWrite,
	domainStorageKeys,
	resolveDomainEnabled,
	storedDomainStatus,
} from './domainPolicy.ts';

const defaults = ['www.linkedin.com', 'mail.google.com', 'localhost'];

describe('domain policy', () => {
	it('treats www and the bare host as one site', () => {
		assert.equal(canonicalHost('WWW.LinkedIn.com.'), 'linkedin.com');
		assert.equal(canonicalHost('mail.google.com'), 'mail.google.com');
	});

	it('pauses when either stored key is false', () => {
		const www = domainStorageKeys('www.linkedin.com');
		assert.equal(storedDomainStatus('linkedin.com', { [www.legacyWww]: false }), false);
		assert.equal(
			storedDomainStatus('www.linkedin.com', {
				[www.canonical]: false,
				[www.legacyWww]: true,
			}),
			false,
		);
	});

	it('enables a site that is only stored under the legacy www key', () => {
		const www = domainStorageKeys('linkedin.com');
		assert.equal(storedDomainStatus('www.linkedin.com', { [www.legacyWww]: true }), true);
	});

	it('keeps an unknown site off in the public build and on in the personal build', () => {
		const base = {
			host: 'example.com',
			stored: {},
			defaultHosts: defaults,
			defaultEnable: undefined,
		};
		assert.equal(resolveDomainEnabled({ ...base, personal: false }), false);
		assert.equal(resolveDomainEnabled({ ...base, personal: true }), true);
	});

	it('does not migrate a stored default of off', () => {
		assert.equal(
			resolveDomainEnabled({
				host: 'example.com',
				stored: {},
				defaultHosts: defaults,
				defaultEnable: false,
				personal: true,
			}),
			false,
		);
	});

	it('matches the default list through either host form', () => {
		assert.equal(
			resolveDomainEnabled({
				host: 'linkedin.com',
				stored: {},
				defaultHosts: defaults,
				defaultEnable: false,
				personal: false,
			}),
			true,
		);
		assert.equal(
			resolveDomainEnabled({
				host: 'docs.google.com',
				stored: {},
				defaultHosts: defaults,
				defaultEnable: false,
				personal: false,
			}),
			false,
		);
	});

	it('writes the canonical key and removes the www duplicate', () => {
		const write = domainEnableWrite('www.linkedin.com', false);
		assert.deepEqual(write.set, { 'domainStatus linkedin.com': false });
		assert.deepEqual(write.remove, ['domainStatus www.linkedin.com']);
	});
});
