'use strict';
const errors = require('./errors');
const asStream = require('./as-stream');
const asPromise = require('./as-promise');
const normalizeArguments = require('./normalize-arguments');
const merge = require('./merge');
const deepFreeze = require('./utils/deep-freeze').default;

const aliases = [
	'get',
	'post',
	'put',
	'patch',
	'head',
	'delete'
];

const create = defaults => {
	defaults = merge({}, defaults);
	normalizeArguments.preNormalize(defaults);

	if (!defaults.handler) {
		// This can't be getPromiseOrStream, because when merging
		// the chain would stop at this point and no further handlers would be called.
		defaults.handler = (options, next) => next(options);
	}

	function got(url, options) {
		try {
			options = normalizeArguments(url, options, defaults);
		} catch (error) {
			if (options && options.stream) {
				throw error;
			}

			return Promise.reject(error);
		}

		const promiseOrStream = options.stream ? asStream(options) : asPromise(options);

		defaults.handler(options, promiseOrStream._sendRequest);

		return promiseOrStream;
	}

	got.create = create;
	got.extend = (...args) => {
		args = args.map(arg => Reflect.has(arg, 'defaults') ? arg.defaults : arg);

		return create(merge.options(defaults, ...args));
	};

	got.stream = (url, options) => got(url, {...options, stream: true});

	for (const method of aliases) {
		got[method] = (url, options) => got(url, {...options, method});
		got.stream[method] = (url, options) => got.stream(url, {...options, method});
	}

	Object.assign(got, {...errors, mergeOptions: merge.options});
	Object.defineProperty(got, 'defaults', {
		value: defaults.mutableDefaults ? defaults : deepFreeze(defaults),
		writable: defaults.mutableDefaults,
		configurable: defaults.mutableDefaults,
		enumerable: defaults.mutableDefaults
	});

	return got;
};

module.exports = create;
