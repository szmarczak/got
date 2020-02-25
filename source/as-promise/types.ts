import PCancelable = require('p-cancelable');
import {
	// Interfaces to be extended
	Options as RequestOptions,
	NormalizedOptions as RequestNormalizedOptions,
	Defaults as RequestDefaults,
	Hooks as RequestHooks,
	Response as RequestResponse,

	// Errors to be exported
	RequestError,
	MaxRedirectsError,
	CacheError,
	UploadError,
	TimeoutError,
	HTTPError,
	ReadError,

	// Hooks to be exported
	HookEvent as RequestHookEvent,
	InitHook,
	BeforeRequestHook,
	BeforeRedirectHook,
	BeforeErrorHook,

	// Types that will not be exported
	Method,
	RequestEvents
} from '../core';

export type ResponseType = 'json' | 'buffer' | 'text';

export interface Response<T = unknown> extends RequestResponse {
	body: T;
}

export interface RetryObject {
	attemptCount: number;
	retryOptions: RequiredRetryOptions;
	error: TimeoutError | RequestError;
	computedValue: number;
}

export type RetryFunction = (retryObject: RetryObject) => number;

export interface RequiredRetryOptions {
	limit: number;
	methods: Method[];
	statusCodes: number[];
	errorCodes: string[];
	calculateDelay: RetryFunction;
	maxRetryAfter?: number;
}

export type BeforeRetryHook = (options: NormalizedOptions, error?: RequestError, retryCount?: number) => void | Promise<void>;
export type AfterResponseHook = (response: Response, retryWithMergedOptions: (options: Options) => CancelableRequest<Response>) => Response | CancelableRequest<Response> | Promise<Response | CancelableRequest<Response>>;

export interface Hooks extends RequestHooks {
	beforeRetry?: BeforeRetryHook[];
	afterResponse?: AfterResponseHook[];
}

export interface PaginationOptions<T> {
	_pagination?: {
		transform?: (response: Response) => Promise<T[]> | T[];
		filter?: (item: T, allItems: T[]) => boolean;
		paginate?: (response: Response) => Options | false;
		shouldContinue?: (item: T, allItems: T[]) => boolean;
		countLimit?: number;
	};
}

export interface Options extends RequestOptions, PaginationOptions<unknown> {
	hooks?: Hooks;
	responseType?: ResponseType;
	resolveBodyOnly?: boolean;
	methodRewriting?: boolean;
	retry?: Partial<RequiredRetryOptions>;
	isStream?: boolean;
}

export interface NormalizedOptions extends RequestNormalizedOptions {
	hooks: Required<Hooks>;
	responseType: ResponseType;
	resolveBodyOnly: boolean;
	methodRewriting: boolean;
	retry: RequiredRetryOptions;
	isStream: boolean;
	_pagination?: Required<PaginationOptions<unknown>['_pagination']>;
}

export interface Defaults extends RequestDefaults {
	hooks: Required<Hooks>;
	responseType: ResponseType;
	resolveBodyOnly: boolean;
	methodRewriting: boolean;
	retry: RequiredRetryOptions;
	isStream: boolean;
	_pagination?: Required<PaginationOptions<unknown>['_pagination']>;
}

export class ParseError extends RequestError {
	declare readonly response: Response;

	constructor(error: Error, response: Response, options: NormalizedOptions) {
		super(`${error.message} in "${options.url.toString()}"`, error, options);
		this.name = 'ParseError';

		Object.defineProperty(this, 'response', {
			enumerable: false,
			value: response
		});
	}
}

export interface CancelableRequest<T extends Response | Response['body'] = Response['body']> extends PCancelable<T>, RequestEvents<CancelableRequest<T>> {
	json<ReturnType>(): CancelableRequest<ReturnType>;
	buffer(): CancelableRequest<Buffer>;
	text(): CancelableRequest<string>;
}

export type HookEvent = RequestHookEvent | 'beforeRetry' | 'afterResponse';

export {
	RequestError,
	MaxRedirectsError,
	CacheError,
	UploadError,
	TimeoutError,
	HTTPError,
	ReadError
};

export {
	InitHook,
	BeforeRequestHook,
	BeforeRedirectHook,
	BeforeErrorHook
};
