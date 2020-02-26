import create, {defaultHandler, InstanceDefaults} from './create';

const defaults: InstanceDefaults = {
	options: {
		method: 'GET',
		retry: {
			limit: 2,
			methods: [
				'GET',
				'PUT',
				'HEAD',
				'DELETE',
				'OPTIONS',
				'TRACE'
			],
			statusCodes: [
				408,
				413,
				429,
				500,
				502,
				503,
				504,
				521,
				522,
				524
			],
			errorCodes: [
				'ETIMEDOUT',
				'ECONNRESET',
				'EADDRINUSE',
				'ECONNREFUSED',
				'EPIPE',
				'ENOTFOUND',
				'ENETUNREACH',
				'EAI_AGAIN'
			],
			maxRetryAfter: undefined,
			calculateDelay: ({computedValue}) => computedValue
		},
		timeout: {},
		headers: {
			'user-agent': 'got (https://github.com/sindresorhus/got)'
		},
		hooks: {
			init: [],
			beforeRequest: [],
			beforeRedirect: [],
			beforeRetry: [],
			beforeError: [],
			afterResponse: []
		},
		decompress: true,
		throwHttpErrors: true,
		followRedirect: true,
		isStream: false,
		responseType: 'text',
		resolveBodyOnly: false,
		maxRedirects: 10,
		prefixUrl: '',
		methodRewriting: true,
		ignoreInvalidCookies: false,
		context: {},
		http2: false,
		allowGetBody: false,
		rejectUnauthorized: true
	},
	handlers: [defaultHandler],
	mutableDefaults: false
};

// TODO: This shouldn't be present in this file
Object.defineProperty(defaults.options, 'followRedirects', {
	get: () => defaults.options.followRedirect,
	set: value => {
		defaults.options.followRedirect = value;
	},
	configurable: false,
	enumerable: false
});

const got = create(defaults);

export default got;

// TODO:
// - fix test/hooks.ts
// - fix test/pagination.ts
// - fix test/progress.ts

/*
clear && npm run build && ava test/unix-socket.ts test/post.ts test/agent.ts test/arguments.ts test/cache.ts test/cancel.ts test/cookies.ts test/create.ts test/error.ts test/gzip.ts test/headers.ts test/helpers.ts test/http.ts test/https.ts test/merge-instances.ts test/normalize-arguments.ts test/promise.ts test/redirects.ts test/response-parse.ts test/retry.ts test/socket-destroyed.ts test/stream.ts test/timeout.ts test/url-to-options.ts
*/

// For CommonJS default export support
module.exports = got;
module.exports.default = got;

export * from './create';
export * from './as-promise';
