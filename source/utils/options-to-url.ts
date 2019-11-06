const validateSearchParams = (searchParams: Record<string, unknown>): void => {
	for (const value of Object.values(searchParams)) {
		if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean' && value !== null) {
			throw new TypeError(`The \`searchParams\` value '${value}' must be a string, number, boolean or null`);
		}
	}
};

export interface URLOptions {
	href?: string;
	origin?: string;
	protocol?: string;
	username?: string;
	password?: string;
	host?: string;
	hostname?: string;
	port?: string | number;
	pathname?: string;
	search?: string;
	searchParams?: Record<string, string | number | boolean | null> | URLSearchParams | string;
	hash?: string;
}

const keys = [
	'port',
	'username',
	'password',
	'pathname',
	'search',
	'hash'
];

export default (options: URLOptions): URL => {
	let origin: string;

	if (Reflect.has(options, 'path')) {
		throw new TypeError('Parameter `path` is deprecated. Use `pathname` instead.');
	}

	if (Reflect.has(options, 'auth')) {
		throw new TypeError('Parameter `auth` is deprecated. Use `username`/`password` instead.');
	}

	if (Reflect.has(options, 'search') && Reflect.has(options, 'searchParams')) {
		throw new TypeError('Parameters `search` and `searchParams` are mutually exclusive.');
	}

	if (Reflect.has(options, 'href')) {
		return new URL(options.href);
	}

	if (Reflect.has(options, 'origin')) {
		origin = options.origin;
	} else {
		origin = `${options.protocol}//${options.hostname || options.host}`;
	}

	const url = new URL(origin);

	for (const key of keys) {
		if (Reflect.has(options, key)) {
			url[key] = options[key];
		}
	}

	if (Reflect.has(options, 'searchParams')) {
		if (typeof options.searchParams !== 'string' && !(options.searchParams instanceof URLSearchParams)) {
			validateSearchParams(options.searchParams);
		}

		(new URLSearchParams(options.searchParams as Record<string, string>)).forEach((value, key) => {
			url.searchParams.append(key, value);
		});
	}

	return url;
};
