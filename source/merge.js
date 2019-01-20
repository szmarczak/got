'use strict';
const {URL} = require('url');
const is = require('@sindresorhus/is');
const knownHookEvents = require('./known-hook-events').default;

const merge = (target, ...sources) => {
	for (const source of sources) {
		for (const [key, sourceValue] of Object.entries(source)) {
			if (is.undefined(sourceValue)) {
				continue;
			}

			const targetValue = target[key];
			if (is.urlInstance(targetValue) && (is.urlInstance(sourceValue) || is.string(sourceValue))) {
				target[key] = new URL(sourceValue, targetValue);
			} else if (is.plainObject(sourceValue)) {
				if (is.plainObject(targetValue)) {
					target[key] = merge({}, targetValue, sourceValue);
				} else {
					target[key] = merge({}, sourceValue);
				}
			} else if (is.array(sourceValue)) {
				target[key] = merge([], sourceValue);
			} else {
				target[key] = sourceValue;
			}
		}
	}

	return target;
};

const mergeOptions = (...sources) => {
	// Merge options
	sources = sources.map(source => typeof source === 'function' ? {handler: source} : (source || {}));
	const merged = merge({}, ...sources);

	// Merge hooks
	const hooks = {};
	for (const hook of knownHookEvents) {
		hooks[hook] = [];
	}

	for (const source of sources) {
		if (source.hooks) {
			for (const hook of knownHookEvents) {
				hooks[hook] = hooks[hook].concat(source.hooks[hook]);
			}
		}
	}

	merged.hooks = hooks;

	// Merge handlers
	const handlers = sources.filter(source => Reflect.has(source, 'handler')).map(source => source.handler);

	if (handlers.length > 1) {
		const handlersCount = handlers.length - 1;

		merged.handler = (options, next) => {
			let iteration = -1;
			const iterate = options => handlers[++iteration](options, iteration === handlersCount ? next : iterate);

			return iterate(options);
		};
	}

	return merged;
};

module.exports = merge;
module.exports.options = mergeOptions;
