/** Host stored in `domainStatus` keys. `www` is not a different site. */
export function canonicalHost(host: string): string {
	return host
		.trim()
		.toLowerCase()
		.replace(/\.$/, '')
		.replace(/^www\./, '');
}

export function domainStorageKeys(host: string): { canonical: string; legacyWww: string } {
	const canonical = canonicalHost(host);
	return {
		canonical: `domainStatus ${canonical}`,
		legacyWww: `domainStatus www.${canonical}`,
	};
}

/**
 * A stored pause on either the canonical key or the legacy `www` key wins.
 * A lone `true` enables the site. No boolean means the caller decides.
 */
export function storedDomainStatus(
	host: string,
	values: Record<string, unknown>,
): boolean | undefined {
	const { canonical, legacyWww } = domainStorageKeys(host);
	const flags = [values[canonical], values[legacyWww]].filter(
		(value): value is boolean => typeof value === 'boolean',
	);

	if (flags.includes(false)) {
		return false;
	}

	if (flags.includes(true)) {
		return true;
	}

	return undefined;
}

export function isDefaultEnabledHost(host: string, defaults: readonly string[]): boolean {
	const canonical = canonicalHost(host);
	return defaults.some((item) => canonicalHost(item) === canonical);
}

export function resolveDomainEnabled(args: {
	host: string;
	stored: Record<string, unknown>;
	defaultHosts: readonly string[];
	defaultEnable: unknown;
	personal: boolean;
}): boolean {
	const stored = storedDomainStatus(args.host, args.stored);
	if (stored !== undefined) {
		return stored;
	}

	if (isDefaultEnabledHost(args.host, args.defaultHosts)) {
		return true;
	}

	if (typeof args.defaultEnable === 'boolean') {
		return args.defaultEnable;
	}

	return args.personal;
}

/** Write one key and drop the legacy `www` duplicate so the two cannot drift. */
export function domainEnableWrite(
	host: string,
	status: boolean,
): { set: Record<string, boolean>; remove: string[] } {
	const { canonical, legacyWww } = domainStorageKeys(host);
	return {
		set: { [canonical]: status },
		remove: [legacyWww],
	};
}
