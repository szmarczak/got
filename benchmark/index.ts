'use strict';
import {URL} from 'url';
import https = require('https');
import Benchmark = require('benchmark');
// @ts-ignore No types
import request = require('request');
import got from '../source';

// Configuration
const url = new URL('https://127.0.0.1:8080');
const urlString = url.toString();
const options = {
	agent: {
		https: new https.Agent({keepAlive: true})
	},
	rejectUnauthorized: false
};

const requestOptions = {
	strictSSL: false
};

const suite = new Benchmark.Suite();

// Benchmarking
suite.add('got - promise', {
	defer: true,
	fn: async (deferred: {resolve(): void}) => {
		await got(url, options);
		deferred.resolve();
	}
}).add('got - stream', {
	defer: true,
	fn: async (deferred: {resolve(): void}) => {
		got.stream(url, options).resume().once('end', () => {
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
}).on('cycle', (event: Benchmark.Event) => {
	console.log(String(event.target));
}).on('complete', function (this: any) {
	console.log(`Fastest is ${this.filter('fastest').map('name') as string}`);
}).run();

// Results (i7-7700k, CPU governor: performance):
// got - promise      x 3,296 ops/sec ±4.39% (78 runs sampled)
// got - stream       x 4,876 ops/sec ±2.38% (81 runs sampled)
// request - callback x 1,013 ops/sec ±3.66% (79 runs sampled)
// Fastest is got - stream
