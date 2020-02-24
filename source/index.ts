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
// - fix test/post.ts
// - fix test/progress.ts

// For CommonJS default export support
module.exports = got;
module.exports.default = got;

export * from './create';
export * from './as-promise';
