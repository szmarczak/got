import {promisify} from 'util';
import {Duplex, Writable, Readable} from 'stream';
import {ReadStream} from 'fs';
import {URL} from 'url';
import {Socket} from 'net';
import {SecureContextOptions} from 'tls';
import http = require('http');
import {ClientRequest, RequestOptions, IncomingMessage, ServerResponse, request as httpRequest} from 'http';
import https = require('https');
import timer, {ClientRequestWithTimings, Timings} from '@szmarczak/http-timer';
import decompressResponse = require('decompress-response');
import CacheableLookup from 'cacheable-lookup';
import CacheableRequest = require('cacheable-request');
// @ts-ignore Missing types
import http2wrapper = require('http2-wrapper');
import lowercaseKeys = require('lowercase-keys');
import ResponseLike = require('responselike');
import is, {assert} from '@sindresorhus/is';
import getBodySize from '../utils/get-body-size';
import isFormData from '../utils/is-form-data';
import proxyEvents from '../utils/proxy-events';
import timedOut, {Delays, TimeoutError as TimedOutTimeoutError} from '../utils/timed-out';
import urlToOptions from '../utils/url-to-options';

type HttpRequestFunction = typeof httpRequest;
type Error = NodeJS.ErrnoException;

const kRequest = Symbol('request');
const kResponse = Symbol('response');
const kResponseSize = Symbol('responseSize');
const kDownloadedSize = Symbol('downloadedSize');
const kBodySize = Symbol('bodySize');
const kUploadedSize = Symbol('uploadedSize');
const kServerResponsesPiped = Symbol('serverResponsesPiped');
const kUnproxyEvents = Symbol('unproxyEvents');
const kIsFromCache = Symbol('isFromCache');
export const kIsNormalizedAlready = Symbol('kIsNormalizedAlready');

const supportsBrotli = is.string((process.versions as any).brotli);

export interface Agents {
	http?: http.Agent;
	https?: https.Agent;
	http2?: unknown;
}

export const isAgents = (value: any): value is Agents => {
	return is.object(value) && ('http' in value || 'https' in value || 'http2' in value);
};

export const withoutBody: ReadonlySet<string> = new Set(['GET', 'HEAD']);

export interface ToughCookieJar {
	getCookieString(currentUrl: string, options: {[key: string]: unknown}, cb: (err: Error | null, cookies: string) => void): void;
	getCookieString(url: string, callback: (error: Error | null, cookieHeader: string) => void): void;
	setCookie(cookieOrString: unknown, currentUrl: string, options: {[key: string]: unknown}, cb: (err: Error | null, cookie: unknown) => void): void;
	setCookie(rawCookie: string, url: string, callback: (error: Error | null, result: unknown) => void): void;
}

export interface PromiseCookieJar {
	getCookieString(url: string): Promise<string>;
	setCookie(rawCookie: string, url: string): Promise<unknown>;
}

export type Method =
	| 'GET'
	| 'POST'
	| 'PUT'
	| 'PATCH'
	| 'HEAD'
	| 'DELETE'
	| 'OPTIONS'
	| 'TRACE'
	| 'get'
	| 'post'
	| 'put'
	| 'patch'
	| 'head'
	| 'delete'
	| 'options'
	| 'trace';

type Promisable<T> = T | Promise<T>;

export type InitHook = (options: Options & {url: string | URL}) => Promisable<void>;
export type BeforeRequestHook = (options: NormalizedOptions) => Promisable<void | Response | ResponseLike>;
export type BeforeRedirectHook = (options: NormalizedOptions, response: Response) => Promisable<void>;
export type BeforeErrorHook = (error: RequestError) => Promisable<RequestError>;

export interface Hooks {
	init?: InitHook[];
	beforeRequest?: BeforeRequestHook[];
	beforeRedirect?: BeforeRedirectHook[];
	beforeError?: BeforeErrorHook[];
}

export type HookEvent = 'init' | 'beforeRequest' | 'beforeRedirect' | 'beforeError';

export const knownHookEvents: HookEvent[] = ['init', 'beforeRequest', 'beforeRedirect', 'beforeError'];

export type RequestFunction<T = IncomingMessage | ResponseLike> = (url: URL, options: RequestOptions, callback?: (response: T) => void) => ClientRequest | T | Promise<ClientRequest> | Promise<T> | undefined;

export type Headers = Record<string, string | string[] | undefined>;

export interface Options extends SecureContextOptions {
	request?: RequestFunction;
	agent?: Agents | false;
	decompress?: boolean;
	timeout?: Delays | number;
	prefixUrl?: string | URL;
	body?: unknown;
	form?: {[key: string]: any};
	json?: {[key: string]: any};
	url?: string | URL;
	cookieJar?: PromiseCookieJar | ToughCookieJar;
	ignoreInvalidCookies?: boolean;
	encoding?: string;
	searchParams?: string | {[key: string]: string | number | boolean | null} | URLSearchParams;
	dnsCache?: CacheableLookup | boolean;
	context?: object;
	hooks?: Hooks;
	followRedirects?: boolean;
	followRedirect?: boolean;
	maxRedirects?: number;
	cache?: string | CacheableRequest.StorageAdapter;
	throwHttpErrors?: boolean;
	username?: string;
	password?: string;
	http2?: boolean;
	allowGetBody?: boolean;
	lookup?: CacheableLookup['lookup'];
	rejectUnauthorized?: boolean;
	headers?: Headers;

	// From http.RequestOptions
	localAddress?: string;
	socketPath?: string;
	method?: string;
	createConnection?: (options: http.RequestOptions, oncreate: (error: Error, socket: Socket) => void) => Socket;
}

export interface NormalizedOptions extends Options {
	method: Method;
	url: URL;
	timeout: Delays;
	prefixUrl: string;
	ignoreInvalidCookies: boolean;
	decompress: boolean;
	searchParams?: URLSearchParams;
	cookieJar?: PromiseCookieJar;
	headers: Headers;
	context: object;
	hooks: Required<Hooks>;
	followRedirects: boolean;
	maxRedirects: number;
	throwHttpErrors: boolean;
	dnsCache?: CacheableLookup;
	cacheableRequest?: (options: string | URL | http.RequestOptions, callback?: (response: http.ServerResponse | ResponseLike) => void) => CacheableRequest.Emitter;
	http2: boolean;
	allowGetBody: boolean;
	rejectUnauthorized: boolean;
	lookup?: CacheableLookup['lookup'];
	[kRequest]: HttpRequestFunction;
	[kIsNormalizedAlready]?: boolean;
}

export interface Defaults {
	timeout: Delays;
	prefixUrl: string;
	method: Method;
	ignoreInvalidCookies: boolean;
	decompress: boolean;
	context: object;
	cookieJar?: PromiseCookieJar | ToughCookieJar;
	dnsCache?: CacheableLookup;
	headers: Headers;
	hooks: Required<Hooks>;
	followRedirects: boolean;
	maxRedirects: number;
	cache?: string | CacheableRequest.StorageAdapter;
	throwHttpErrors: boolean;
	http2: boolean;
	allowGetBody: boolean;
}

export interface Progress {
	percent: number;
	transferred: number;
	total?: number;
}

export interface PlainResponse extends IncomingMessage {
	requestUrl: string;
	redirectUrls: string[];
	request: Request;
	ip?: string;
	isFromCache: boolean;
	statusCode: number;
	url: string;
}

// For Promise support
export interface Response<T = unknown> extends PlainResponse {
	body: T;
	retryCount: number;
}

export interface RequestEvents<T> {
	on(name: 'request', listener: (request: http.ClientRequest) => void): T;
	on(name: 'response', listener: (response: Response) => void): T;
	on(name: 'redirect', listener: (response: Response, nextOptions: NormalizedOptions) => void): T;
	on(name: 'uploadProgress' | 'downloadProgress', listener: (progress: Progress) => void): T;
}

function validateSearchParams(searchParams: Record<string, unknown>): asserts searchParams is Record<string, string | number | boolean | null> {
	// eslint-disable-next-line guard-for-in
	for (const key in searchParams) {
		const value = searchParams[key];

		if (!is.string(value) && !is.number(value) && !is.boolean(value) && !is.null_(value)) {
			throw new TypeError(`The \`searchParams\` value '${String(value)}' must be a string, number, boolean or null`);
		}
	}
}

const cacheFn = async (url: URL, options: RequestOptions): Promise<ClientRequest | ResponseLike> => new Promise<ClientRequest | ResponseLike>((resolve, reject) => {
	// TODO: Remove `utils/url-to-options.ts` when `cacheable-request` is fixed
	Object.assign(options, urlToOptions(url));

	// `http-cache-semantics` checks this
	delete (options as unknown as NormalizedOptions).url;

	// TODO: `cacheable-request` is incorrectly typed
	const cacheRequest = (options as Pick<NormalizedOptions, 'cacheableRequest'>).cacheableRequest!(options, resolve as any);

	cacheRequest.once('error', (error: Error) => {
		if (error instanceof CacheableRequest.RequestError) {
			// TODO: `options` should be `normalizedOptions`
			reject(new RequestError(error.message, error, options as unknown as NormalizedOptions));
			return;
		}

		// TODO: `options` should be `normalizedOptions`
		reject(new CacheError(error, options as unknown as NormalizedOptions));
	});
	cacheRequest.once('request', resolve);
});

const waitForOpenFile = async (file: ReadStream): Promise<void> => new Promise((resolve, reject) => {
	const onError = (error: Error): void => {
		reject(error);
	};

	file.once('error', onError);
	file.once('open', () => {
		file.off('error', onError);
		resolve();
	});
});

const redirectCodes: ReadonlySet<number> = new Set([300, 301, 302, 303, 304, 307, 308]);

type NonEnumerableProperty = 'context' | 'body' | 'json' | 'form';
const nonEnumerableProperties: NonEnumerableProperty[] = [
	'context',
	'body',
	'json',
	'form'
];

const setNonEnumerableProperties = (sources: (Options | Defaults | undefined)[], to: Options): void => {
	// Non enumerable properties shall not be merged
	const properties: Partial<{[Key in NonEnumerableProperty]: any}> = {};

	for (const source of sources) {
		if (!source) {
			continue;
		}

		for (const name of nonEnumerableProperties) {
			if (!(name in source)) {
				continue;
			}

			properties[name] = {
				writable: true,
				configurable: true,
				enumerable: false,
				// @ts-ignore TS doesn't see the check above
				value: source[name]
			};
		}
	}

	Object.defineProperties(to, properties);
};

export class RequestError extends Error {
	code?: string;
	stack!: string;
	declare readonly options: NormalizedOptions;
	readonly response?: Response;
	readonly request?: Request;
	readonly timings?: Timings;

	constructor(message: string, error: Partial<Error & {code?: string}>, options: NormalizedOptions, requestOrResponse?: Request | Response) {
		super(message);
		Error.captureStackTrace(this, this.constructor);

		this.name = 'RequestError';
		this.code = error.code;

		Object.defineProperty(this, 'options', {
			// This fails because of TS 3.7.2 useDefineForClassFields
			// Ref: https://github.com/microsoft/TypeScript/issues/34972
			enumerable: false,
			value: options
		});

		if (requestOrResponse instanceof IncomingMessage) {
			Object.defineProperty(this, 'response', {
				enumerable: false,
				value: requestOrResponse
			});

			requestOrResponse = requestOrResponse.request;
		}

		if (requestOrResponse instanceof Request) {
			Object.defineProperty(this, 'request', {
				enumerable: false,
				value: requestOrResponse
			});

			this.timings = requestOrResponse.timings;
		}
	}
}

export class MaxRedirectsError extends RequestError {
	declare readonly response: Response;

	constructor(response: Response, maxRedirects: number, options: NormalizedOptions) {
		super(`Redirected ${maxRedirects} times. Aborting.`, {}, options);
		this.name = 'MaxRedirectsError';

		Object.defineProperty(this, 'response', {
			enumerable: false,
			value: response
		});
	}
}

export class HTTPError extends RequestError {
	declare readonly response: Response;

	constructor(response: Response, options: NormalizedOptions) {
		super(`Response code ${response.statusCode} (${response.statusMessage!})`, {}, options);
		this.name = 'HTTPError';

		Object.defineProperty(this, 'response', {
			enumerable: false,
			value: response
		});
	}
}

export class CacheError extends RequestError {
	constructor(error: Error, options: NormalizedOptions) {
		super(error.message, error, options);
		this.name = 'CacheError';
	}
}

export class UploadError extends RequestError {
	constructor(error: Error, options: NormalizedOptions, request: Request) {
		super(error.message, error, options, request);
		this.name = 'UploadError';
	}
}

export class TimeoutError extends RequestError {
	readonly timings: Timings;
	readonly event: string;

	constructor(error: TimedOutTimeoutError, timings: Timings, options: NormalizedOptions) {
		super(error.message, error, options);
		this.name = 'TimeoutError';
		this.event = error.event;
		this.timings = timings;
	}
}

export class ReadError extends RequestError {
	constructor(error: Error, options: NormalizedOptions, response: Response) {
		super(error.message, error, options, response);
		this.name = 'ReadError';
	}
}

export class UnsupportedProtocolError extends RequestError {
	constructor(options: NormalizedOptions) {
		super(`Unsupported protocol "${options.url.protocol}"`, {}, options);
		this.name = 'UnsupportedProtocolError';
	}
}

export default class Request extends Duplex implements RequestEvents<Request> {
	['constructor']: typeof Request;

	declare [kRequest]: ClientRequest;
	declare [kResponse]: IncomingMessage;
	declare [kResponseSize]?: number;
	declare [kUnproxyEvents]: () => void;
	[kDownloadedSize]: number;
	[kUploadedSize]: number;
	[kBodySize]?: number;
	[kServerResponsesPiped]: Set<ServerResponse>;
	[kIsFromCache]?: boolean;

	declare options: NormalizedOptions;
	declare requestUrl: string;
	finalized: boolean;
	redirects: string[];

	constructor(url: string | URL, options?: Options, defaults?: Defaults) {
		super();

		this[kDownloadedSize] = 0;
		this[kUploadedSize] = 0;
		this.finalized = false;
		this[kServerResponsesPiped] = new Set<ServerResponse>();
		this.redirects = [];

		if (!options) {
			options = {};
		}

		this.on('pipe', source => {
			if (source instanceof IncomingMessage) {
				this.options.headers = {
					...source.headers,
					...this.options.headers
				};
			}
		});

		(async (nonNormalizedOptions: Options) => {
			try {
				if (nonNormalizedOptions.body instanceof ReadStream) {
					await waitForOpenFile(nonNormalizedOptions.body);
				}

				const initHooks = nonNormalizedOptions.hooks?.init;
				if (initHooks) {
					nonNormalizedOptions = {...nonNormalizedOptions, url};

					for (const hook of initHooks) {
						// eslint-disable-next-line no-await-in-loop
						await hook(nonNormalizedOptions as Options & {url: string | URL});
					}
				}

				if (kIsNormalizedAlready in nonNormalizedOptions) {
					this.options = nonNormalizedOptions as NormalizedOptions;
				} else {
					// @ts-ignore Common TypeScript bug saying that `this.constructor` is not accessible
					this.options = this.constructor.normalizeArguments(url, nonNormalizedOptions, defaults);
				}

				const {options} = this;

				this.requestUrl = options.url.toString();

				await this.finalizeBody();

				// Set cookies
				if (options.cookieJar) {
					const cookieString: string = await options.cookieJar.getCookieString(options.url.toString());

					if (cookieString !== '') {
						options.headers.cookie = cookieString;
					}
				}

				if (options.encoding) {
					this.setEncoding(options.encoding);
				}

				await this.makeRequest();

				if (options.body instanceof Readable) {
					options.body.pipe(this);
					options.body.once('error', (error: NodeJS.ErrnoException) => {
						this._beforeError(new UploadError(error, options, this));
					});
				} else if (options.body) {
					this._writeRequest(options.body, null as unknown as string, () => {});
					this.end();
				}

				this.finalized = true;
				this.emit('finalized');
			} catch (error) {
				this._beforeError(error);
			}
		})(options);
	}

	static normalizeArguments(url?: string | URL, options?: Options, defaults?: Defaults): NormalizedOptions {
		const rawOptions = options;

		if (is.object(url) && !is.urlInstance(url)) {
			options = {...defaults as NormalizedOptions, ...(url as Options)};
		} else {
			options = {...defaults as NormalizedOptions, ...options, url};
		}

		// Disallow `options.path` and `options.pathname`
		if ((options as any).path || (options as any).pathname) {
			throw new TypeError('Parameters `path` and `pathname` cannot be used');
		}

		// `options.method`
		if (is.string(options.method)) {
			options.method = options.method.toUpperCase();
		} else if (is.undefined(options.method)) {
			options.method = 'GET';
		} else {
			throw new TypeError(`Parameter \`method\` must be a string, not ${is(options.method)}`);
		}

		// `options.headers`
		if (is.undefined(options.headers)) {
			options.headers = {};
		} else if (is.object(options.headers)) {
			options.headers = lowercaseKeys({...(defaults?.headers), ...options.headers});
		} else {
			throw new TypeError(`Parameter \`headers\` must be an object, not ${is(options.headers)}`);
		}

		// `options.prefixUrl` & `options.url`
		if (is.string(options.prefixUrl) || is.urlInstance(options.prefixUrl)) {
			options.prefixUrl = options.prefixUrl.toString();

			if (options.prefixUrl !== '' && !options.prefixUrl.endsWith('/')) {
				options.prefixUrl += '/';
			}

			if (is.string(options.url)) {
				if (options.url.startsWith('/')) {
					throw new Error('`input` must not begin with a slash when using `prefixUrl`');
				}

				options.url = new URL(options.prefixUrl + options.url);
			} else if (is.undefined(options.url) && options.prefixUrl !== '') {
				options.url = new URL(options.prefixUrl);
			}
		} else if (!is.undefined(options.prefixUrl)) {
			throw new TypeError(`Parameter \`prefixUrl\` must be a string, not ${is(options.prefixUrl)}`);
		} else if (is.string(options.url)) {
			options.url = new URL(options.url);
		}

		// Protocol check
		if (options.url) {
			const {protocol} = options.url;

			if (protocol !== 'http:' && protocol !== 'https:') {
				throw new UnsupportedProtocolError(options as NormalizedOptions);
			}
		}

		// `options.username` & `options.password`
		if (options.username || options.password) {
			if ('auth' in options) {
				throw new TypeError('Parameter `auth` is mutually exclusive with the `username` and `password` option');
			}

			options.url!.username = options.username ?? '';
			options.url!.password = options.password ?? '';
		}

		// `options.cookieJar`
		if (!options.cookieJar && defaults) {
			options.cookieJar = defaults.cookieJar;
		}

		if (is.object(options.cookieJar)) {
			let {setCookie, getCookieString} = options.cookieJar;

			// Horrible `tough-cookie` check
			if (setCookie.length === 4 && getCookieString.length === 0) {
				if (!(promisify.custom in setCookie)) {
					setCookie = promisify(setCookie.bind(options.cookieJar));
					getCookieString = promisify(getCookieString.bind(options.cookieJar));
				}
			} else if (setCookie.length !== 2) {
				throw new TypeError('`options.cookieJar.setCookie` needs to be an async function with 2 arguments');
			} else if (getCookieString.length !== 1) {
				throw new TypeError('`options.cookieJar.getCookieString` needs to be an async function with 1 argument');
			}

			options.cookieJar = {setCookie, getCookieString};
		} else if (!is.undefined(options.cookieJar)) {
			throw new TypeError(`Parameter \`cookieJar\` must be an object, not ${is(options.cookieJar)}`);
		}

		// `options.searchParams`
		if (is.string(options.searchParams) || is.object(options.searchParams)) {
			if (!is.string(options.searchParams) && !(options.searchParams instanceof URLSearchParams)) {
				validateSearchParams(options.searchParams);
			}

			options.searchParams = new URLSearchParams(options.searchParams as Record<string, string>);

			// `normalizeArguments()` is also used to merge options
			const defaultsAsOptions = defaults as Options | undefined;
			if (defaultsAsOptions && defaultsAsOptions.searchParams instanceof URLSearchParams) {
				defaultsAsOptions.searchParams.forEach((value, key) => {
					(options!.searchParams as URLSearchParams).append(key, value);
				});
			}

			if (options.url) {
				options.searchParams.forEach((value, key) => {
					(options!.url as URL).searchParams.append(key, value);
				});
			}
		} else if (!is.undefined(options.searchParams)) {
			throw new TypeError(`Parameter \`searchParams\` must be an object or a string, not ${is(options.searchParams)}`);
		}

		// `options.cache`
		if (!options.cache && defaults) {
			options.cache = defaults.cache;
		}

		if ((is.object(options.cache) || is.string(options.cache)) && !(options as NormalizedOptions).cacheableRequest) {
			// Better memory management, so we don't have to generate a new object every time
			(options as NormalizedOptions).cacheableRequest = new CacheableRequest(
				((requestOptions: RequestOptions, handler?: (response: IncomingMessage) => void): ClientRequest => (requestOptions as Pick<NormalizedOptions, typeof kRequest>)[kRequest](requestOptions, handler)) as HttpRequestFunction,
				options.cache
			);
		} else if (!is.undefined(options.cache)) {
			throw new TypeError(`Parameter \`cache\` must be an object, not ${is(options.cache)}`);
		}

		// `options.dnsCache`
		if (options.dnsCache === true) {
			options.dnsCache = new CacheableLookup();
		} else if (!is.undefined(options.dnsCache) && options.dnsCache !== false && !(options.dnsCache instanceof CacheableLookup)) {
			throw new TypeError(`Parameter \`dnsCache\` must be a CacheableLookup instance or a boolean, not ${is(options.dnsCache)}`);
		}

		// `options.timeout`
		if (is.number(options.timeout)) {
			options.timeout = {request: options.timeout};
		} else if (is.undefined(options.timeout)) {
			options.timeout = {};
		} else if (is.object(options.timeout)) {
			options.timeout = {...options.timeout};
		} else {
			throw new TypeError(`Parameter \`timeout\` must be an object or a number, not ${is(options.timeout)}`);
		}

		if (defaults) {
			options.timeout = {
				...defaults.timeout,
				...options.timeout
			};
		}

		// `options.context`
		if (is.undefined(options.context)) {
			if (!(defaults && defaults.context)) {
				options.context = {};
			}
		} else if (!is.object(options.context)) {
			throw new TypeError(`Parameter \`context\` must be an object, not ${is('options.context')}`);
		}

		// `options.hooks`
		if (is.object(options.hooks) || is.undefined(options.hooks)) {
			options.hooks = {...options.hooks};

			for (const event of knownHookEvents) {
				if (event in options.hooks) {
					if (Array.isArray(options.hooks[event])) {
						// See https://github.com/microsoft/TypeScript/issues/31445#issuecomment-576929044
						(options.hooks as any)[event] = [...options.hooks[event]!];
					} else {
						throw new TypeError(`Parameter \`${event}\` must be an array, not ${is(options.hooks[event])}`);
					}
				} else {
					options.hooks[event] = [];
				}
			}
		} else {
			throw new TypeError(`Parameter \`hooks\` must be an object, not ${is(options.hooks)}`);
		}

		if (defaults) {
			for (const event of knownHookEvents) {
				if (!(event in options.hooks && is.undefined(options.hooks[event]))) {
					// See https://github.com/microsoft/TypeScript/issues/31445#issuecomment-576929044
					(options.hooks as any)[event] = [
						...defaults.hooks[event],
						...options.hooks[event]!
					];
				}
			}
		}

		// Other options
		assert.any([is.boolean, is.undefined], options.decompress);
		assert.any([is.boolean, is.undefined], options.ignoreInvalidCookies);
		assert.any([is.string, is.undefined], options.encoding);
		assert.any([is.boolean, is.undefined], options.followRedirects, options.followRedirect);
		assert.any([is.string, is.undefined], options.encoding);
		assert.any([is.number, is.undefined], options.maxRedirects);
		assert.any([is.boolean, is.undefined], options.throwHttpErrors);
		assert.any([is.boolean, is.undefined], options.http2);
		assert.any([is.boolean, is.undefined], options.allowGetBody);
		assert.any([is.boolean, is.undefined], options.rejectUnauthorized);

		if ('followRedirects' in options && 'followRedirect' in options) {
			throw new TypeError('Parameters `followRedirects` and `followRedirect` are mutually exclusive');
		}

		if (rawOptions && !('followRedirects' in options) && 'followRedirect' in rawOptions) {
			options.followRedirects = rawOptions.followRedirect;

			delete options.followRedirect;
		}

		options.decompress = Boolean(options.decompress);
		options.ignoreInvalidCookies = Boolean(options.ignoreInvalidCookies);
		options.followRedirects = Boolean(options.followRedirects);
		options.maxRedirects = options.maxRedirects ?? 0;
		options.throwHttpErrors = Boolean(options.throwHttpErrors);
		options.http2 = Boolean(options.http2);
		options.allowGetBody = Boolean(options.allowGetBody);
		options.allowGetBody = Boolean(options.rejectUnauthorized);

		// Set non-enumerable properties
		setNonEnumerableProperties([defaults, options], options);

		return options as NormalizedOptions;
	}

	async finalizeBody(): Promise<void> {
		const {options} = this;
		const {headers} = options;

		const write = this.write.bind(this);

		const isForm = !is.undefined(options.form);
		const isJSON = !is.undefined(options.json);
		const isBody = !is.undefined(options.body);
		const hasPayload = isForm || isJSON || isBody;
		if (hasPayload) {
			if (withoutBody.has(options.method) && !(options.method === 'GET' && options.allowGetBody)) {
				throw new TypeError(`The \`${options.method}\` method cannot be used with a body`);
			}

			if ([isBody, isForm, isJSON].filter(isTrue => isTrue).length > 1) {
				throw new TypeError('The `body`, `json` and `form` options are mutually exclusive');
			}

			if (
				isBody &&
				!(options.body instanceof Readable) &&
				!is.string(options.body) &&
				!is.buffer(options.body) &&
				!isFormData(options.body)
			) {
				throw new TypeError('The `body` option must be a stream.Readable, string or Buffer');
			}

			if (isForm && !is.object(options.form)) {
				throw new TypeError('The `form` option must be an Object');
			}

			const lockWrite = (): void => {
				this.write = (): never => {
					throw new Error('The payload has been already provided');
				};
			};

			const dataListener = (): void => {
				this.write = write;
			};

			lockWrite();

			this.on('pipe', (source: Writable) => {
				source.prependListener('data', dataListener);
				source.on('data', lockWrite);
			});

			this.on('unpipe', (source: Writable) => {
				source.off('data', dataListener);
				source.off('data', lockWrite);
			});

			{
				// Serialize body
				const noContentType = !is.string(headers['content-type']);

				if (isBody) {
					// Special case for https://github.com/form-data/form-data
					if (isFormData(options.body) && noContentType) {
						headers['content-type'] = `multipart/form-data; boundary=${options.body.getBoundary()}`;
					}
				} else if (isForm) {
					if (noContentType) {
						headers['content-type'] = 'application/x-www-form-urlencoded';
					}

					options.body = (new URLSearchParams(options.form as Record<string, string>)).toString();
				} else if (isJSON) {
					if (noContentType) {
						headers['content-type'] = 'application/json';
					}

					options.body = JSON.stringify(options.json);
				}

				const uploadBodySize = await getBodySize(options);

				// See https://tools.ietf.org/html/rfc7230#section-3.3.2
				// A user agent SHOULD send a Content-Length in a request message when
				// no Transfer-Encoding is sent and the request method defines a meaning
				// for an enclosed payload body.  For example, a Content-Length header
				// field is normally sent in a POST request even when the value is 0
				// (indicating an empty payload body).  A user agent SHOULD NOT send a
				// Content-Length header field when the request message does not contain
				// a payload body and the method semantics do not anticipate such a
				// body.
				if (is.undefined(headers['content-length']) && is.undefined(headers['transfer-encoding'])) {
					if (
						(options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH') &&
						!is.undefined(uploadBodySize)
					) {
						headers['content-length'] = String(uploadBodySize);
					}
				}

				if (options.decompress && is.undefined(headers['accept-encoding'])) {
					headers['accept-encoding'] = supportsBrotli ? 'gzip, deflate, br' : 'gzip, deflate';
				}
			}
		}

		this[kBodySize] = Number(headers['content-length']) || undefined;
	}

	async _onResponse(response: IncomingMessage): Promise<void> {
		const {options} = this;
		const {url} = options;
		const statusCode = response.statusCode!;
		const typedResponse = response as Response;

		typedResponse.statusMessage = typedResponse.statusMessage === '' ? http.STATUS_CODES[statusCode] : typedResponse.statusMessage;
		typedResponse.url = options.url.toString();
		typedResponse.requestUrl = this.requestUrl;
		typedResponse.redirectUrls = this.redirects;
		typedResponse.request = this;
		typedResponse.isFromCache = (response as any).fromCache || false;
		typedResponse.ip = typedResponse.isFromCache ? undefined : response.socket.remoteAddress!;

		this[kIsFromCache] = typedResponse.isFromCache;

		if (options.followRedirects && response.headers.location && redirectCodes.has(statusCode)) {
			response.resume(); // We're being redirected, we don't care about the response.

			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete this[kRequest];
			this[kUnproxyEvents]();

			if (statusCode === 303 && options.method !== 'GET' && options.method !== 'HEAD') {
				// Server responded with "see other", indicating that the resource exists at another location,
				// and the client should request it from that location via GET or HEAD.
				options.method = 'GET';
			}

			if (this.redirects.length >= options.maxRedirects) {
				this._beforeError(new MaxRedirectsError(typedResponse, options.maxRedirects, options));
				return;
			}

			// Handles invalid URLs. See https://github.com/sindresorhus/got/issues/604
			const redirectBuffer = Buffer.from(response.headers.location, 'binary').toString();
			const redirectUrl = new URL(redirectBuffer, url);

			// Redirecting to a different site, clear cookies.
			if (redirectUrl.hostname !== url.hostname && 'cookie' in options.headers) {
				delete options.headers.cookie;
			}

			this.redirects.push(redirectUrl.toString());
			options.url = redirectUrl;

			for (const hook of options.hooks.beforeRedirect) {
				// eslint-disable-next-line no-await-in-loop
				await hook(options, typedResponse);
			}

			this.emit('redirect', typedResponse, options);

			try {
				await this.makeRequest();
			} catch (error) {
				this._beforeError(error);
				return;
			}

			if (options.method === 'GET' || options.method === 'HEAD') {
				this[kRequest].end();
			}

			return;
		}

		if (options.throwHttpErrors && statusCode !== 304 && (statusCode < 200 || statusCode > 299)) {
			this._beforeError(new HTTPError(typedResponse, options));
			return;
		}

		const rawCookies = response.headers['set-cookie'];
		if (is.object(options.cookieJar) && rawCookies) {
			let promises: Array<Promise<unknown>> = rawCookies.map(async (rawCookie: string) => (options.cookieJar as PromiseCookieJar).setCookie(rawCookie, url.toString()));

			if (options.ignoreInvalidCookies) {
				promises = promises.map(async p => p.catch(() => {}));
			}

			try {
				await Promise.all(promises);
			} catch (error) {
				this._beforeError(error);
				return;
			}
		}

		if (options.decompress) {
			response = decompressResponse(response);
		}

		response.on('readable', () => {
			if (this.isPaused()) {
				return;
			}

			this._read();
		});

		response.once('end', () => {
			this[kResponseSize] = this[kDownloadedSize];
			this.emit('downloadProgress', this.downloadProgress);

			this.push(null);
		});

		response.on('error', (error: Error) => {
			this._beforeError(new ReadError(error, options, response as Response));
		});

		for (const destination of this[kServerResponsesPiped]) {
			if (destination.headersSent) {
				continue;
			}

			// eslint-disable-next-line guard-for-in
			for (const key in response.headers) {
				const isAllowed = options.decompress ? key !== 'content-encoding' : true;
				const value = response.headers[key];

				if (isAllowed) {
					destination.setHeader(key, value!);
				}
			}

			destination.statusCode = statusCode;
		}

		this[kResponseSize] = Number(response.headers['content-length']) || undefined;

		this[kResponse] = response;
		this.emit('response', response);
	}

	async makeRequest(): Promise<void> {
		if (kRequest in this) {
			return;
		}

		const {options} = this;
		const {url, headers} = options;

		for (const key in headers) {
			if (is.undefined(headers[key])) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete headers[key];
			}
		}

		for (const hook of options.hooks.beforeRequest) {
			// eslint-disable-next-line no-await-in-loop
			const result = await hook(options);

			if (result instanceof ResponseLike) {
				options.request = () => result;
				break;
			}
		}

		if (options.dnsCache) {
			(options as any).lookup = options.dnsCache.lookup;
		}

		// UNIX sockets
		if (url.hostname === 'unix') {
			const matches = /(?<socketPath>.+?):(?<path>.+)/.exec(`${url.pathname}${url.search}`);

			if (matches?.groups) {
				const {socketPath, path} = matches.groups;

				Object.assign(options, {
					socketPath,
					path,
					host: ''
				});
			}
		}

		const isHttps = url.protocol === 'https:';

		let realFn: RequestFunction<unknown> = options.request!;
		if (!realFn) {
			if (options.http2) {
				realFn = http2wrapper.auto;
			} else {
				realFn = isHttps ? https.request : http.request;
			}
		}

		const fn: RequestFunction<unknown> = options.cacheableRequest ? cacheFn : realFn;

		if (isAgents(options.agent) && !options.http2) {
			(options as unknown as RequestOptions).agent = options.agent[isHttps ? 'https' : 'http'];
		}

		options[kRequest] = realFn as HttpRequestFunction;
		delete options.request;

		const {timeout} = options;
		if (timeout) {
			delete options.timeout;
		}

		let request;

		try {
			request = await fn(url, options as unknown as RequestOptions);

			options.request = options[kRequest];
			options.timeout = timeout;

			if (request instanceof ClientRequest) {
				timer(request);

				if (timeout) {
					timedOut(request, timeout, url);
				}

				request.once('response', response => {
					this._onResponse(response);
				});

				request.on('error', (error: Error) => {
					if (error instanceof TimedOutTimeoutError) {
						error = new TimeoutError(error, this.timings!, options);
					} else {
						error = new RequestError(error.message, error, options, this);
					}

					this._beforeError(error as RequestError);
				});

				this[kUnproxyEvents] = proxyEvents(request, this, [
					'socket',
					'abort',
					'connect',
					'continue',
					'information',
					'upgrade',
					'timeout'
				]);

				this[kRequest] = request;
			} else if (is.undefined(request)) {
				// Fallback to http(s).request
				throw new Error('Fallback to `http.request` not implemented yet');
			} else {
				// TODO: Rewrite `cacheable-request`
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
				this._onResponse(request as unknown as IncomingMessage);
			}
		} catch (error) {
			throw new RequestError(error.message, error, options, this);
		}
	}

	async _beforeError(error: RequestError): Promise<void> {
		try {
			for (const hook of this.options.hooks.beforeError) {
				// eslint-disable-next-line no-await-in-loop
				error = await hook(error);
			}
		} catch (error_) {
			error = error_;
		}

		this.destroy(error);
	}

	_read(): void {
		if (kResponse in this) {
			let data;

			while ((data = this[kResponse].read()) !== null) {
				this[kDownloadedSize] += data.length;

				const progress = this.downloadProgress;

				if (progress.percent < 1) {
					this.emit('downloadProgress', progress);
				}

				this.push(data);
			}
		}
	}

	_write(chunk: any, encoding: string, callback: (error?: Error | null) => void): void {
		const {options} = this;
		if (withoutBody.has(options.method)) {
			callback(new TypeError(`The \`${options.method}\` method cannot be used with a body`));
			return;
		}

		const write = (): void => {
			if (kRequest in this) {
				this._writeRequest(chunk, encoding, callback);
			}
		};

		if (this.finalized) {
			write();
		} else {
			this.once('finalized', write);
		}
	}

	_writeRequest(chunk: any, encoding: string, callback: (error?: Error | null) => void): void {
		this[kRequest].write(chunk, encoding, (error?: Error | null) => {
			if (!error) {
				this[kUploadedSize] += Buffer.byteLength(chunk, encoding as BufferEncoding);

				const progress = this.uploadProgress;

				if (progress.percent < 1) {
					this.emit('uploadProgress', progress);
				}
			}

			callback(error);
		});
	}

	_final(callback: (error?: Error | null) => void): void {
		const endRequest = (): void => {
			// We need to check if `this[kRequest]` is present,
			// because it isn't when we use cache.
			if (!(kRequest in this)) {
				return;
			}

			this[kRequest].end((error?: Error | null) => {
				if (!error) {
					this[kBodySize] = this[kUploadedSize];

					this.emit('uploadProgress', this.uploadProgress);
					this.emit('upload-complete');
				}

				callback(error);
			});
		};

		if (this.finalized) {
			endRequest();
		} else {
			this.once('finalized', endRequest);
		}
	}

	_destroy(error: Error | null, callback: (error: Error | null) => void): void {
		if (kRequest in this) {
			this[kRequest].abort();
		} else {
			this.once('finalized', (): void => {
				if (kRequest in this) {
					this[kRequest].abort();
				}
			});
		}

		if (error !== null && !is.undefined(error) && !(error instanceof RequestError)) {
			error = new RequestError(error.message, error, this.options);
		}

		callback(error);
	}

	get socket(): Socket {
		return this[kRequest]?.socket;
	}

	get aborted(): boolean {
		return Boolean(this[kRequest]?.aborted);
	}

	get downloadProgress(): Progress {
		return {
			percent: this[kResponseSize] ? this[kDownloadedSize] / this[kResponseSize]! : 0,
			transferred: this[kDownloadedSize],
			total: this[kResponseSize]
		};
	}

	get uploadProgress(): Progress {
		return {
			percent: this[kBodySize] ? this[kUploadedSize] / this[kBodySize]! : 0,
			transferred: this[kUploadedSize],
			total: this[kBodySize]
		};
	}

	get timings(): Timings | undefined {
		return (this[kRequest] as ClientRequestWithTimings)?.timings;
	}

	get flushedHeaders(): boolean {
		return Boolean(this[kRequest]);
	}

	get isFromCache(): boolean | undefined {
		return this[kIsFromCache];
	}

	pipe<T extends NodeJS.WritableStream>(destination: T, options?: {end?: boolean}): T {
		if (this.downloadProgress.transferred > 0) {
			throw new Error('Failed to pipe. The response has been emitted already.');
		}

		if (destination instanceof ServerResponse) {
			this[kServerResponsesPiped].add(destination);
		}

		return super.pipe(destination, options);
	}

	unpipe<T extends NodeJS.WritableStream>(destination: T): this {
		if (destination instanceof ServerResponse) {
			this[kServerResponsesPiped].delete(destination);
		}

		super.unpipe(destination);

		return this;
	}
}
