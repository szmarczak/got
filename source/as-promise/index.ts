import {EventEmitter} from 'events';
import getStream = require('get-stream');
import PCancelable = require('p-cancelable');
import calculateRetryDelay from './calculate-retry-delay';
import {
	NormalizedOptions,
	CancelableRequest,
	Response,
	RequestError,
	HTTPError,
	ReadError,
	ParseError
} from './types';
import PromisableRequest from './core';
import proxyEvents from '../utils/proxy-events';

export const knownBodyTypes = ['json', 'buffer', 'text'];

// @ts-ignore The error is: Not all code paths return a value.
const parseBody = (body: Buffer, responseType: NormalizedOptions['responseType'], encoding: NormalizedOptions['encoding']): unknown => {
	if (responseType === 'text') {
		return body.toString(encoding);
	}

	if (responseType === 'json') {
		return body.length === 0 ? '' : JSON.parse(body.toString());
	}

	if (responseType === 'buffer') {
		return Buffer.from(body);
	}

	if (!knownBodyTypes.includes(responseType)) {
		throw new TypeError(`Unknown body type '${responseType as string}'`);
	}
};

export default function asPromise<T>(options: NormalizedOptions): CancelableRequest<T> {
	let retryCount = 0;
	let body: Buffer;
	const emitter = new EventEmitter();

	const promise = new PCancelable<T>((resolve, reject, onCancel) => {
		const makeRequest = (): void => {
			if (options.responseType === 'json' && options.headers.accept === undefined) {
				options.headers.accept = 'application/json';
			}

			const request = new PromisableRequest(options.url, options);
			onCancel(() => request.destroy());

			request.once('response', async (response: Response) => {
				response.retryCount = retryCount;

				// Download body
				try {
					body = await getStream.buffer(response, {encoding: 'binary'});
				} catch (error) {
					request._beforeError(new ReadError(error, options, response));
					return;
				}

				if (response.request.aborted) {
					// Canceled while downloading - will throw a `CancelError` or `TimeoutError` error
					return;
				}

				// Parse body
				try {
					response.body = parseBody(body, options.responseType, options.encoding);
				} catch (error) {
					response.body = body.toString();

					const parseError = new ParseError(error, response, options);
					request._beforeError(parseError);
					return;
				}

				try {
					for (const [index, hook] of options.hooks.afterResponse.entries()) {
						// @ts-ignore TS doesn't notice that CancelableRequest is a Promise
						// eslint-disable-next-line no-await-in-loop
						response = await hook(response, async (updatedOptions): CancelableRequest<Response> => {
							const typedOptions = request.constructor.normalizeArguments(undefined, {
								...updatedOptions,
								retry: {
									calculateDelay: () => 0
								},
								throwHttpErrors: false,
								resolveBodyOnly: false
							}, options);

							// Remove any further hooks for that request, because we'll call them anyway.
							// The loop continues. We don't want duplicates (asPromise recursion).
							typedOptions.hooks.afterResponse = typedOptions.hooks.afterResponse.slice(0, index);

							for (const hook of typedOptions.hooks.beforeRetry) {
								// eslint-disable-next-line no-await-in-loop
								await hook(typedOptions);
							}

							const promise: CancelableRequest<Response> = asPromise(typedOptions);

							onCancel(() => {
								promise.catch(() => {});
								promise.cancel();
							});

							return promise;
						});
					}
				} catch (error) {
					request._beforeError(error);
					return;
				}

				resolve(options.resolveBodyOnly ? response.body as T : response as unknown as T);
			});

			request.once('error', (error: RequestError) => {
				if (error instanceof HTTPError) {
					let backoff: number;

					retryCount++;

					try {
						backoff = options.retry.calculateDelay({
							attemptCount: retryCount,
							retryOptions: options.retry,
							error,
							computedValue: calculateRetryDelay({
								attemptCount: retryCount,
								retryOptions: options.retry,
								error,
								computedValue: 0
							})
						});
					} catch (error_) {
						request._beforeError(error_);
						return;
					}

					if (backoff) {
						const retry = async (): Promise<void> => {
							try {
								for (const hook of options.hooks.beforeRetry) {
									// eslint-disable-next-line no-await-in-loop
									await hook(options, error, retryCount);
								}
							} catch (error_) {
								request._beforeError(error_);
								return;
							}

							makeRequest();
						};

						setTimeout(retry, backoff);
						return;
					}
				}

				reject(error);
			});

			if (!('body' in options)) {
				request.end();
			}

			proxyEvents(request, emitter, [
				'request',
				'response',
				'redirect',
				'uploadProgress',
				'downloadProgress'
			]);
		};

		makeRequest();
	}) as CancelableRequest<T>;

	promise.on = (event: string, fn: (...args: any[]) => void) => {
		emitter.on(event, fn);
		return promise;
	};

	const shortcut = <T>(responseType: NormalizedOptions['responseType']): CancelableRequest<T> => {
		const newPromise = (async () => {
			await promise;
			return parseBody(body, responseType, options.encoding);
		})();

		Object.defineProperties(newPromise, Object.getOwnPropertyDescriptors(promise));

		return newPromise as CancelableRequest<T>;
	};

	promise.json = () => {
		if (body === undefined && options.headers.accept === undefined) {
			options.headers.accept = 'application/json';
		}

		return shortcut('json');
	};

	promise.buffer = () => shortcut('buffer');
	promise.text = () => shortcut('text');

	return promise;
}

export * from './types';
export {PromisableRequest};
