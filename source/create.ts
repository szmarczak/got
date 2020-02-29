import {URL} from 'url';
import {CancelError} from 'p-cancelable';
import asPromise, {
	PromisableRequest,
	NormalizedOptions,
	CancelableRequest,
	Options,
	Response,
	Defaults as DefaultOptions,
	ParseError,
	PaginationOptions
} from './as-promise';
import createRejection from './as-promise/create-rejection';
import Request, {
	RequestError,
	CacheError,
	ReadError,
	HTTPError,
	MaxRedirectsError,
	TimeoutError,
	UnsupportedProtocolError,
	UploadError,
	kIsNormalizedAlready
} from './core';
import deepFreeze from './utils/deep-freeze';

export interface InstanceDefaults {
	options: DefaultOptions;
	handlers: HandlerFunction[];
	mutableDefaults: boolean;
	_rawHandlers?: HandlerFunction[];
}

const errors = {
	RequestError,
	CacheError,
	ReadError,
	HTTPError,
	MaxRedirectsError,
	TimeoutError,
	ParseError,
	CancelError,
	UnsupportedProtocolError,
	UploadError
};

const {normalizeArguments} = PromisableRequest;

export type GotReturn = Request | CancelableRequest;
export type HandlerFunction = <T extends GotReturn>(options: NormalizedOptions, next: (options: NormalizedOptions) => T) => T | Promise<T>;

const getPromiseOrStream = (options: NormalizedOptions): GotReturn => options.isStream ? new Request(options.url, options) : asPromise(options);

export interface ExtendOptions extends Options {
	handlers?: HandlerFunction[];
	mutableDefaults?: boolean;
}

const isGotInstance = (value: Got | ExtendOptions): value is Got => (
	'defaults' in value && 'options' in value.defaults
);

type Except<ObjectType, KeysType extends keyof ObjectType> = Pick<ObjectType, Exclude<keyof ObjectType, KeysType>>;

export type OptionsOfTextResponseBody = Options & {isStream?: false; resolveBodyOnly?: false; responseType?: 'text'};
export type OptionsOfJSONResponseBody = Options & {isStream?: false; resolveBodyOnly?: false; responseType: 'json'};
export type OptionsOfBufferResponseBody = Options & {isStream?: false; resolveBodyOnly?: false; responseType: 'buffer'};
export type StrictOptions = Except<Options, 'isStream' | 'responseType' | 'resolveBodyOnly'>;
type ResponseBodyOnly = {resolveBodyOnly: true};

export interface GotPaginate {
	<T>(url: string | URL, options?: Options & PaginationOptions<T>): AsyncIterableIterator<T>;
	all<T>(url: string | URL, options?: Options & PaginationOptions<T>): Promise<T[]>;

	// A bug.
	// eslint-disable-next-line @typescript-eslint/adjacent-overload-signatures
	<T>(options?: Options & PaginationOptions<T>): AsyncIterableIterator<T>;
	// A bug.
	// eslint-disable-next-line @typescript-eslint/adjacent-overload-signatures
	all<T>(options?: Options & PaginationOptions<T>): Promise<T[]>;
}

export interface GotRequest {
	// `asPromise` usage
	(url: string | URL, options?: OptionsOfTextResponseBody): CancelableRequest<Response<string>>;
	<T>(url: string | URL, options?: OptionsOfJSONResponseBody): CancelableRequest<Response<T>>;
	(url: string | URL, options?: OptionsOfBufferResponseBody): CancelableRequest<Response<Buffer>>;

	(options: OptionsOfTextResponseBody): CancelableRequest<Response<string>>;
	<T>(options: OptionsOfJSONResponseBody): CancelableRequest<Response<T>>;
	(options: OptionsOfBufferResponseBody): CancelableRequest<Response<Buffer>>;

	// `resolveBodyOnly` usage
	(url: string | URL, options?: (OptionsOfTextResponseBody & ResponseBodyOnly)): CancelableRequest<string>;
	<T>(url: string | URL, options?: (OptionsOfJSONResponseBody & ResponseBodyOnly)): CancelableRequest<T>;
	(url: string | URL, options?: (OptionsOfBufferResponseBody & ResponseBodyOnly)): CancelableRequest<Buffer>;

	(options: (OptionsOfTextResponseBody & ResponseBodyOnly)): CancelableRequest<string>;
	<T>(options: (OptionsOfJSONResponseBody & ResponseBodyOnly)): CancelableRequest<T>;
	(options: (OptionsOfBufferResponseBody & ResponseBodyOnly)): CancelableRequest<Buffer>;

	// `asStream` usage
	(url: string | URL, options?: Options & {isStream: true}): Request;

	(options: Options & {isStream: true}): Request;

	// Fallback
	(url: string | URL, options?: Options): CancelableRequest | Request;

	(options: Options): CancelableRequest | Request;
}

export type HTTPAlias =
	| 'get'
	| 'post'
	| 'put'
	| 'patch'
	| 'head'
	| 'delete';

const aliases: readonly HTTPAlias[] = [
	'get',
	'post',
	'put',
	'patch',
	'head',
	'delete'
];

interface GotStreamFunction {
	(url: string | URL, options?: Options & {isStream?: true}): Request;
	(options?: Options & {isStream?: true}): Request;
}

export type GotStream = GotStreamFunction & Record<HTTPAlias, GotStreamFunction>;

export interface Got extends Record<HTTPAlias, GotRequest>, GotRequest {
	stream: GotStream;
	paginate: GotPaginate;
	defaults: InstanceDefaults;
	CacheError: typeof CacheError;
	RequestError: typeof RequestError;
	ReadError: typeof ReadError;
	ParseError: typeof ParseError;
	HTTPError: typeof HTTPError;
	MaxRedirectsError: typeof MaxRedirectsError;
	TimeoutError: typeof TimeoutError;
	CancelError: typeof CancelError;

	extend(...instancesOrOptions: Array<Got | ExtendOptions>): Got;
	mergeInstances(parent: Got, ...instances: Got[]): Got;
	mergeOptions(...sources: Options[]): NormalizedOptions;
}

export const defaultHandler: HandlerFunction = (options, next) => next(options);

export const mergeOptions = (...sources: Options[]): NormalizedOptions => {
	let mergedOptions: NormalizedOptions | undefined;

	for (const source of sources) {
		mergedOptions = normalizeArguments(undefined, source, mergedOptions);
	}

	return mergedOptions!;
};

const create = (defaults: InstanceDefaults): Got => {
	// Proxy properties from next handlers
	defaults._rawHandlers = defaults.handlers;
	defaults.handlers = defaults.handlers.map(fn => ((options, next) => {
		// This will be assigned by assigning result
		let root!: ReturnType<typeof next>;

		const result = fn(options, newOptions => {
			root = next(newOptions);
			return root;
		});

		if (result !== root && !options.isStream && root) {
			const typedResult = result as Promise<unknown>;

			const {then: promiseThen, catch: promiseCatch, finally: promiseFianlly} = typedResult;
			Object.setPrototypeOf(typedResult, Object.getPrototypeOf(root));
			Object.defineProperties(typedResult, Object.getOwnPropertyDescriptors(root));

			// These should point to the new promise
			// eslint-disable-next-line promise/prefer-await-to-then
			typedResult.then = promiseThen;
			typedResult.catch = promiseCatch;
			typedResult.finally = promiseFianlly;
		}

		return result;
	}));

	const got: Got = ((url: string | URL, options?: Options): GotReturn => {
		let iteration = 0;
		const iterateHandlers = (newOptions: NormalizedOptions): GotReturn => {
			return defaults.handlers[iteration++](
				newOptions,
				iteration === defaults.handlers.length ? getPromiseOrStream : iterateHandlers
			) as GotReturn;
		};

		try {
			const normalizedOptions = normalizeArguments(url, options, defaults.options);
			normalizedOptions[kIsNormalizedAlready] = true;

			// A bug.
			// eslint-disable-next-line @typescript-eslint/return-await
			return iterateHandlers(normalizedOptions);
		} catch (error) {
			if (options?.isStream) {
				throw error;
			} else {
				// A bug.
				// eslint-disable-next-line @typescript-eslint/return-await
				return createRejection(error);
			}
		}
	}) as Got;

	got.extend = (...instancesOrOptions) => {
		const optionsArray: Options[] = [defaults.options];
		let handlers: HandlerFunction[] = [...defaults._rawHandlers!];
		let isMutableDefaults: boolean | undefined;

		for (const value of instancesOrOptions) {
			if (isGotInstance(value)) {
				optionsArray.push(value.defaults.options);
				handlers.push(...value.defaults._rawHandlers!);
				isMutableDefaults = value.defaults.mutableDefaults;
			} else {
				optionsArray.push(value);

				if ('handlers' in value) {
					handlers.push(...value.handlers!);
				}

				isMutableDefaults = value.mutableDefaults;
			}
		}

		handlers = handlers.filter(handler => handler !== defaultHandler);

		if (handlers.length === 0) {
			handlers.push(defaultHandler);
		}

		return create({
			options: mergeOptions(...optionsArray),
			handlers,
			mutableDefaults: Boolean(isMutableDefaults)
		});
	};

	got.paginate = (async function * <T>(url: string | URL, options?: Options) {
		let normalizedOptions = normalizeArguments(url, options, defaults.options);

		const pagination = normalizedOptions._pagination!;

		if (typeof pagination !== 'object') {
			throw new TypeError('`options._pagination` must be implemented');
		}

		const all: T[] = [];

		while (true) {
			// TODO: Throw when result is not an instance of Response
			// eslint-disable-next-line no-await-in-loop
			const result = (await got('', normalizedOptions)) as Response;

			// eslint-disable-next-line no-await-in-loop
			const parsed = await pagination.transform(result);

			for (const item of parsed) {
				if (pagination.filter(item, all)) {
					if (!pagination.shouldContinue(item, all)) {
						return;
					}

					yield item;

					all.push(item as T);

					if (all.length === pagination.countLimit) {
						return;
					}
				}
			}

			const optionsToMerge = pagination.paginate(result);

			if (optionsToMerge === false) {
				return;
			}

			if (optionsToMerge !== undefined) {
				normalizedOptions = normalizeArguments(undefined, optionsToMerge, normalizedOptions);
			}
		}
	}) as GotPaginate;

	got.paginate.all = (async <T>(url: string | URL, options?: Options) => {
		const results: T[] = [];

		for await (const item of got.paginate<unknown>(url, options)) {
			results.push(item as T);
		}

		return results;
	}) as GotPaginate['all'];

	got.stream = ((url: string | URL, options?: Options) => got(url, {...options, isStream: true})) as GotStream;

	for (const method of aliases) {
		got[method] = ((url: string | URL, options?: Options): GotReturn => got(url, {...options, method})) as GotRequest;

		got.stream[method] = ((url: string | URL, options?: Options & {isStream: true}) => {
			return got(url, {...options, method, isStream: true});
		}) as GotStream;
	}

	Object.assign(got, {...errors, mergeOptions});
	Object.defineProperty(got, 'defaults', {
		value: defaults.mutableDefaults ? defaults : deepFreeze(defaults),
		writable: defaults.mutableDefaults,
		configurable: defaults.mutableDefaults,
		enumerable: true
	});

	return got;
};

export default create;
