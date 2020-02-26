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
import PromisableRequest, {parseBody} from './core';
import proxyEvents from '../utils/proxy-events';

export default function asPromise<T>(options: NormalizedOptions): CancelableRequest<T> {
	let retryCount = 0;
	let body: Buffer;
	const emitter = new EventEmitter();

	const promise = new PCancelable<T>((resolve, reject, onCancel) => {
		const makeRequest = (): void => {
			if (options.responseType === 'json' && options.headers.accept === undefined) {
				options.headers.accept = 'application/json';
			}

			// Support retries
			const {throwHttpErrors} = options;
			if (!throwHttpErrors) {
				options.throwHttpErrors = true;
			}

			const request = new PromisableRequest(options.url, options);
			request._throwHttpErrors = throwHttpErrors;
			onCancel(() => request.destroy());

			request.once('response', async (response: Response) => {
				response.retryCount = retryCount;

				if (response.request.aborted) {
					// Canceled while downloading - will throw a `CancelError` or `TimeoutError` error
					return;
				}

				// Download body
				try {
					body = await getStream.buffer(response, {encoding: 'binary'});
				} catch (error) {
					request._beforeError(new ReadError(error, options, response));
					return;
				}

				// Parse body
				try {
					response!.body = parseBody(body, options.responseType, options.encoding);
				} catch (error) {
					response!.body = body.toString();

					const parseError = new ParseError(error, response, options);
					request._beforeError(parseError);
					return;
				}

				resolve(options.resolveBodyOnly ? response.body as T : response as unknown as T);
			});

			request.once('error', (error: RequestError) => {
				if (promise.isCanceled) {
					return;
				}

				if (!request.options) {
					reject(error);
					return;
				}

				let backoff: number;

				if (error.code !== 'GOT_RETRY') {
					retryCount++;
				} else {
					options = (error as any)._options;
				}

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
					request.destroy();
					reject(error_);
					return;
				}

				if (backoff) {
					// Don't emit the `response` event
					request.destroy();

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

						options.throwHttpErrors = throwHttpErrors;
						makeRequest();
					};

					setTimeout(retry, backoff);
					return;
				} else if (error.code !== 'GOT_RETRY') {
					// No retry has been made
					retryCount--;
				}

				if (!throwHttpErrors && error instanceof HTTPError) {
					return;
				}

				// Don't emit the `response` event
				request.destroy();

				reject(error);
			});

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
