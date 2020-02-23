import {URL} from 'url';
import is, {assert} from '@sindresorhus/is';
import {Options, NormalizedOptions, Defaults} from './types';
import Request, {knownHookEvents} from '../core';

if (!knownHookEvents.includes('beforeRetry' as any)) {
	knownHookEvents.push('beforeRetry' as any, 'afterResponse' as any);
}

export default class PromisableRequest extends Request {
	['constructor']: typeof PromisableRequest;

	static normalizeArguments(url?: string | URL, nonNormalizedOptions?: Options, defaults?: Defaults): NormalizedOptions {
		const options = super.normalizeArguments(url, nonNormalizedOptions, defaults) as NormalizedOptions;

		if (!('responseType' in options)) {
			// @ts-ignore TypeScript bug - it says `options` is `never`
			options.responseType = 'text';
		}

		assert.any([is.boolean, is.undefined], options.resolveBodyOnly);
		assert.any([is.boolean, is.undefined], options.methodRewriting);
		assert.any([is.boolean, is.undefined], options.isStream);

		options.resolveBodyOnly = Boolean(options.resolveBodyOnly);
		options.methodRewriting = Boolean(options.methodRewriting);
		options.isStream = Boolean(options.isStream);

		// `options.retry`
		const {retry} = options;

		if (defaults) {
			options.retry = {...defaults.retry};
		} else {
			options.retry = {
				calculateDelay: retryObject => retryObject.computedValue,
				limit: 0,
				methods: [],
				statusCodes: [],
				errorCodes: [],
				maxRetryAfter: undefined
			};
		}

		if (is.object(retry)) {
			options.retry = {
				...options.retry,
				...retry
			};
		} else if (is.number(retry)) {
			options.retry.limit = retry;
		}

		if (is.undefined(options.retry.maxRetryAfter)) {
			options.retry.maxRetryAfter = Math.min(
				...[options.timeout.request, options.timeout.connect].filter(is.number)
			);
		}

		// `options._pagination`
		if (is.object(options._pagination)) {
			if (defaults) {
				(options as Options)._pagination = {
					...defaults._pagination,
					...options._pagination
				};
			}

			const {_pagination: pagination} = options;

			if (!is.function_(pagination.transform)) {
				throw new Error('`options._pagination.transform` must be implemented');
			}

			if (!is.function_(pagination.shouldContinue)) {
				throw new Error('`options._pagination.shouldContinue` must be implemented');
			}

			if (!is.function_(pagination.paginate)) {
				throw new Error('`options._pagination.paginate` must be implemented');
			}
		} else if (defaults) {
			options._pagination = defaults._pagination;
		}

		return options;
	}
}
