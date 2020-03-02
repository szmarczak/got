'use strict';
import {URL} from 'url';
import https = require('https');
import axios from 'axios';
import Benchmark = require('benchmark');
import fetch from 'node-fetch';
import request = require('request');
import got from '../source';
import PromisableRequest from '../source/as-promise/core';
import Request from '../source/core';

const {normalizeArguments} = PromisableRequest;

// Configuration
const httpsAgent = new https.Agent({
	keepAlive: true,
	rejectUnauthorized: false
});

const url = new URL('https://127.0.0.1:8080');
const urlString = url.toString();

const gotOptions = {
	agent: {
		https: httpsAgent
	},
	rejectUnauthorized: false
};

const requestOptions = {
	strictSSL: false,
	agent: httpsAgent
};

const fetchOptions = {
	agent: httpsAgent
};

const axiosOptions = {
	url: urlString,
	httpsAgent,
	rejectUnauthorized: false
};

const axiosStreamOptions: typeof axiosOptions & {responseType: 'stream'} = {
	...axiosOptions,
	responseType: 'stream'
};

const httpsOptions = {
	rejectUnauthorized: false,
	agent: httpsAgent
};

const suite = new Benchmark.Suite();

// Benchmarking
suite.add('got - promise', {
	defer: true,
	fn: async (deferred: {resolve(): void}) => {
		await got(url, gotOptions);
		deferred.resolve();
	}
}).add('got - stream', {
	defer: true,
	fn: async (deferred: {resolve(): void}) => {
		got.stream(url, gotOptions).resume().once('end', () => {
			deferred.resolve();
		});
	}
}).add('got - promise core', {
	defer: true,
	fn: async (deferred: {resolve(): void}) => {
		const stream = new PromisableRequest(url, gotOptions);
		stream.resume().once('end', () => {
			deferred.resolve();
		});
	}
}).add('got - stream core', {
	defer: true,
	fn: async (deferred: {resolve(): void}) => {
		const stream = new Request(url, gotOptions);
		stream.resume().once('end', () => {
			deferred.resolve();
		});
	}
}).add('request - callback', {
	defer: true,
	fn: (deferred: {resolve(): void}) => {
		request(urlString, requestOptions, (error: Error) => {
			if (error) {
				throw error;
			}

			deferred.resolve();
		});
	}
}).add('request - stream', {
	defer: true,
	fn: (deferred: {resolve(): void}) => {
		const stream = request(urlString, requestOptions);
		stream.resume();
		stream.once('end', () => {
			deferred.resolve();
		});
	}
}).add('node-fetch - promise', {
	defer: true,
	fn: async (deferred: {resolve(): void}) => {
		const response = await fetch(url, fetchOptions);
		await response.text();

		deferred.resolve();
	}
}).add('node-fetch - stream', {
	defer: true,
	fn: async (deferred: {resolve(): void}) => {
		const {body} = await fetch(url, fetchOptions);

		body.resume();
		body.once('end', () => {
			deferred.resolve();
		});
	}
}).add('axios - promise', {
	defer: true,
	fn: async (deferred: {resolve(): void}) => {
		await axios.request(axiosOptions);
		deferred.resolve();
	}
}).add('axios - stream', {
	defer: true,
	fn: async (deferred: {resolve(): void}) => {
		const {data} = await axios.request(axiosStreamOptions);
		data.resume();
		data.once('end', () => {
			deferred.resolve();
		});
	}
}).add('https - stream', {
	defer: true,
	fn: (deferred: {resolve(): void}) => {
		https.request(urlString, httpsOptions, response => {
			response.resume();
			response.once('end', () => {
				deferred.resolve();
			});
		}).end();
	}
}).on('cycle', (event: Benchmark.Event) => {
	console.log(String(event.target));
}).on('complete', function (this: any) {
	console.log(`Fastest is ${this.filter('fastest').map('name') as string}`);

	internalBenchmark();
}).run();

const internalBenchmark = (): void => {
	console.log();

	const internalSuite = new Benchmark.Suite();
	internalSuite.add('got - normalize options', {
		fn: () => {
			normalizeArguments(url, gotOptions);
		}
	}).on('cycle', (event: Benchmark.Event) => {
		console.log(String(event.target));
	});

	internalSuite.run();
};

// Results (i7-7700k, CPU governor: performance):
// got - promise        x 2,875 ops/sec ±5.64% (73 runs sampled)
// got - stream         x 3,947 ops/sec ±6.51% (69 runs sampled)
// got - promise core   x 5,198 ops/sec ±4.51% (73 runs sampled)
// got - stream core    x 5,665 ops/sec ±3.28% (81 runs sampled)
// request - callback   x 6,839 ops/sec ±7.83% (74 runs sampled)
// request - stream     x 7,579 ops/sec ±6.19% (75 runs sampled)
// node-fetch - promise x 6,950 ops/sec ±5.76% (73 runs sampled)
// node-fetch - stream  x 7,370 ops/sec ±4.78% (77 runs sampled)
// axios - promise      x 5,978 ops/sec ±6.65% (72 runs sampled)
// axios - stream       x 8,434 ops/sec ±6.12% (84 runs sampled)
// https - stream       x 10,222 ops/sec ±7.38% (76 runs sampled)
// Fastest is https - stream

// got - normalize options x 142,407 ops/sec ±0.73% (95 runs sampled)
