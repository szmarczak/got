'use strict';
const errors = require('./errors');
const asStream = require('./as-stream');
const asPromise = require('./as-promise');
const normalizeArguments = require('./normalize-arguments');
const merge = require('./merge');
const deepFreeze = require('./utils/deep-freeze').default;

const getPromiseOrStream = options => options.stream ? asStream(options) : asPromise(options);

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
			return defaults.handler(normalizeArguments(url, options, defaults), getPromiseOrStream);
		} catch (error) {
			if (options && options.stream) {
				throw error;
			} else {
				return Promise.reject(error);
			}
		}
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
		value: deepFreeze(defaults),
		writable: false,
		configurable: false,
		enumerable: true
	});

	return got;
};

module.exports = create;
