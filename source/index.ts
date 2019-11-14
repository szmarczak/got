import create, {defaultHandler} from './create';
import {Defaults} from './utils/types.js';

const defaults: Defaults = {
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
				504
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
			beforeRequest: [],
			beforeRedirect: [],
			beforeRetry: [],
			afterResponse: []
		},
		decompress: true,
		throwHttpErrors: true,
		followRedirect: true,
		isStream: false,
		cache: false,
		dnsCache: false,
		useElectronNet: false,
		responseType: '',
		resolveBodyOnly: false,
		maxRedirects: 10
	},
	handlers: [defaultHandler],
	mutableDefaults: false
};

const got = create(defaults);

export default got;

// For CommonJS default export support
module.exports = got;
module.exports.default = got;

// Export types
export * from './utils/types';

export {
	Got,
	GotStream,
	ReturnResponse,
	ReturnStream,
	GotReturn
} from './create';

export {
	ProxyStream as ResponseStream
} from './as-stream';

export {
	GotError,
	CacheError,
	RequestError,
	ParseError,
	HTTPError,
	MaxRedirectsError,
	UnsupportedProtocolError,
	TimeoutError,
	CancelError
} from './errors';

export {
	InitHook,
	BeforeRequestHook,
	BeforeRedirectHook,
	BeforeRetryHook,
	BeforeErrorHook,
	AfterResponseHook,
	HookType,
	Hooks,
	HookEvent
} from './known-hook-events';
