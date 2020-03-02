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
}).on('cycle', (event: Benchmark.Event) => {
	console.log(String(event.target));
}).on('complete', function (this: any) {
	console.log(`Fastest is ${this.filter('fastest').map('name') as string}`);

	internalBenchmark();
}).run();

const internalBenchmark = () => {
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
// got - promise        x 2,996 ops/sec ±5.62%  (67 runs sampled)
// got - stream         x 4,603 ops/sec ±4.93%  (77 runs sampled)
// got - promise core   x 5,643 ops/sec ±4.81%  (76 runs sampled)
// got - stream core    x 5,922 ops/sec ±1.89%  (83 runs sampled)
// request - callback   x 6,297 ops/sec ±11.26% (68 runs sampled)
// request - stream     x 8,035 ops/sec ±3.16%  (81 runs sampled)
// node-fetch - promise x 6,662 ops/sec ±7.74%  (73 runs sampled)
// node-fetch - stream  x 7,949 ops/sec ±4.60%  (80 runs sampled)
// axios - promise      x 6,308 ops/sec ±7.81%  (78 runs sampled)
// axios - stream       x 8,322 ops/sec ±4.15%  (79 runs sampled)
// Fastest is axios - stream

// got - normalize options x 145,450 ops/sec ±0.84% (92 runs sampled)
