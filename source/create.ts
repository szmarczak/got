import * as errors from './errors';
import {
	Options,
	Defaults,
	NormalizedOptions,
	Response,
	CancelableRequest,
	URLOrOptions,
	HandlerFunction,
	ExtendedOptions
} from './utils/types';
import deepFreeze from './utils/deep-freeze';
import asPromise from './as-promise';
import asStream, {ProxyStream} from './as-stream';
import {normalizeArguments, mergeOptions} from './normalize-arguments';
import {Hooks} from './known-hook-events';

export type HTTPAlias =
	| 'get'
	| 'post'
	| 'put'
	| 'patch'
	| 'head'
	| 'delete';

export type ReturnResponse = (url: URLOrOptions | Options & { stream?: false }, options?: Options & { stream?: false }) => CancelableRequest<Response>;
export type ReturnStream = (url: URLOrOptions | Options & { stream: true }, options?: Options & { stream: true }) => ProxyStream;
export type GotReturn = ProxyStream | CancelableRequest<Response>;

const getPromiseOrStream = (options: NormalizedOptions): GotReturn => options.isStream ? asStream(options) : asPromise(options);

export interface Got extends Record<HTTPAlias, ReturnResponse> {
	stream: GotStream;
	defaults: Defaults | Readonly<Defaults>;
	GotError: typeof errors.GotError;
	CacheError: typeof errors.CacheError;
	RequestError: typeof errors.RequestError;
	ReadError: typeof errors.ReadError;
	ParseError: typeof errors.ParseError;
	HTTPError: typeof errors.HTTPError;
	MaxRedirectsError: typeof errors.MaxRedirectsError;
	UnsupportedProtocolError: typeof errors.UnsupportedProtocolError;
	TimeoutError: typeof errors.TimeoutError;
	CancelError: typeof errors.CancelError;

	(url: URLOrOptions | Options & {stream?: false}, options?: Options & {stream?: false}): CancelableRequest<Response>;
	(url: URLOrOptions | Options & {stream: true}, options?: Options & {stream: true}): ProxyStream;
	(url: URLOrOptions, options?: Options): CancelableRequest<Response> | ProxyStream;
	extend(...instancesOrOptions: Array<Got | ExtendedOptions>): Got;
	mergeInstances(parent: Got, ...instances: Got[]): Got;
	mergeOptions<T extends Options>(...sources: T[]): T & {hooks: Partial<Hooks>};
}

export interface GotStream extends Record<HTTPAlias, ReturnStream> {
	(url: URLOrOptions, options?: Options): ProxyStream;
}

const aliases: readonly HTTPAlias[] = [
	'get',
	'post',
	'put',
	'patch',
	'head',
	'delete'
];

export const defaultHandler: HandlerFunction = (options, next) => next(options);

const create = (defaults: Defaults): Got => {
	// Proxy properties from next handlers
	defaults._rawHandlers = defaults.handlers;
	defaults.handlers = defaults.handlers.map(fn => ((options, next) => {
		let root: GotReturn;

		const result = fn(options, newOptions => {
			root = next(newOptions);
			return root;
		});

		if (result !== root && !options.isStream) {
			Object.setPrototypeOf(result, Object.getPrototypeOf(root));
			Object.defineProperties(result, Object.getOwnPropertyDescriptors(root));
		}

		return result;
	}) as HandlerFunction);

	// @ts-ignore Because the for loop handles it for us, as well as the other Object.defines
	const got: Got = (url: URLOrOptions, options?: Options): GotReturn => {
		let iteration = 0;
		const iterateHandlers: HandlerFunction = newOptions => {
			return defaults.handlers[iteration++](
				newOptions,
				// @ts-ignore TS doesn't know that it calls `getPromiseOrStream` at the end
				iteration === defaults.handlers.length ? getPromiseOrStream : iterateHandlers
			);
		};

		try {
			// @ts-ignore This handler takes only one parameter.
			return iterateHandlers(normalizeArguments(url, options, defaults));
		} catch (error) {
			if (options?.isStream) {
				throw error;
			} else {
				// @ts-ignore It's an Error not a response, but TS thinks it's calling .resolve
				return Promise.reject(error);
			}
		}
	};

	got.extend = (...instancesOrOptions) => {
		const optionsArray: Options[] = [defaults.options];
		let handlers: HandlerFunction[] = [...defaults._rawHandlers];
		let mutableDefaults: boolean;

		for (const value of instancesOrOptions) {
			if (Reflect.has(value, 'defaults')) {
				optionsArray.push((value as Got).defaults.options);

				handlers.push(...(value as Got).defaults._rawHandlers);

				mutableDefaults = (value as Got).defaults.mutableDefaults;
			} else {
				optionsArray.push(value as ExtendedOptions);

				if (Reflect.has(value, 'handlers')) {
					handlers.push(...(value as ExtendedOptions).handlers);
				}

				mutableDefaults = (value as ExtendedOptions).mutableDefaults;
			}
		}

		handlers = handlers.filter(handler => handler !== defaultHandler);

		if (handlers.length === 0) {
			handlers.push(defaultHandler);
		}

		return create({
			options: mergeOptions(...optionsArray),
			handlers,
			mutableDefaults
		});
	};

	// @ts-ignore The missing methods because the for-loop handles it for us
	got.stream = (url, options) => got(url, {...options, isStream: true});

	for (const method of aliases) {
		got[method] = (url, options) => got(url, {...options, method});
		got.stream[method] = (url, options) => got.stream(url, {...options, method});
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
