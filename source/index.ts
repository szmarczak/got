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
// - fix test/unix-socket.ts

/*
clear && npm run build && ava test/agent.ts test/arguments.ts test/cache.ts test/cancel.ts test/cookies.ts test/create.ts test/error.ts test/gzip.ts test/headers.ts test/helpers.ts test/http.ts test/https.ts test/merge-instances.ts test/normalize-arguments.ts test/promise.ts test/redirects.ts test/response-parse.ts test/retry.ts test/socket-destroyed.ts test/stream.ts test/timeout.ts test/url-to-options.ts

  http.ts › doesn't throw if `options.throwHttpErrors` is false

  dist/test/http.js:53

   52:     });
   53:     t.is((await got({ throwHttpErrors: false })).body, 'not');
   54: });

  Difference:

  - ''
  + 'not'

  dist/test/http.js:53:7
  dist/test/helpers/with-server.js:36:9



  response-parse.ts › `options.resolveBodyOnly` combined with `options.throwHttpErrors`

  dist/test/response-parse.js:20

   19:     });
   20:     t.is(await got({ resolveBodyOnly: true, throwHttpErrors: false }), '/…
   21: });

  Difference:

  - ''
  + '/'

  dist/test/response-parse.js:20:7
  dist/test/helpers/with-server.js:36:9



  stream.ts › throws on write if body is specified

  dist/test/stream.js:63

   62:     for (const stream of streams) {
   63:         t.throws(() => {
   64:             stream.end('wow');

  Function returned:

  undefined

  dist/test/stream.js:63:11
  dist/test/helpers/with-server.js:36:15



  retry.ts › respects 413 Retry-After with RFC-1123 timestamp

  dist/test/retry.js:170

   169:     t.is(statusCode, 413);
   170:     t.true(Date.now() >= Date.parse(body));
   171: });

  Value is not `true`:

  false

  dist/test/retry.js:170:11
  dist/test/helpers/with-server.js:36:9



  retry.ts › respects 413 Retry-After

  dist/test/retry.js:153

   152:     t.is(statusCode, 413);
   153:     t.true(Number(body) >= retryAfterOn413 * 1000);
   154: });

  Value is not `true`:

  false

  dist/test/retry.js:153:11
  dist/test/helpers/with-server.js:36:9



  Uncaught exception in test/error.ts

  dist/test/error.js:129

   128:             proxy.read = () => {
   129:                 proxy.destroy(new Error(message));
   130:                 return null;

  Error: snap!



  Uncaught exception in test/headers.ts

  dist/source/core/index.js:912

   911:         if (this[kIsWriteLocked]) {
   912:             throw new TypeError('The payload has been already provided');
   913:         }

  TypeError: The payload has been already provided

  PromisableRequest._write (dist/source/core/index.js:912:19)
  dist/source/core/index.js:939:13



  Uncaught exception in test/headers.ts

  dist/source/core/index.js:912

   911:         if (this[kIsWriteLocked]) {
   912:             throw new TypeError('The payload has been already provided');
   913:         }

  TypeError: The payload has been already provided

  PromisableRequest._write (dist/source/core/index.js:912:19)
  dist/source/core/index.js:939:13
*/

// For CommonJS default export support
module.exports = got;
module.exports.default = got;

export * from './create';
export * from './as-promise';
