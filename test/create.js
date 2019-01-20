import http from 'http';
import {URL} from 'url';
import test from 'ava';
import got from '../dist';
import {createServer} from './helpers/server';

let s;

test.before('setup', async () => {
	s = await createServer();

	s.on('/', (request, response) => {
		request.resume();
		response.end(JSON.stringify(request.headers));
	});

	await s.listen(s.port);
});

test.after('cleanup', async () => {
	await s.close();
});

test('preserve global defaults', async t => {
	const globalHeaders = await got(s.url).json();
	const instanceHeaders = await got.extend()(s.url).json();
	t.deepEqual(instanceHeaders, globalHeaders);
});

test('support instance defaults', async t => {
	const instance = got.extend({
		headers: {
			'user-agent': 'custom-ua-string'
		}
	});
	const headers = await instance(s.url).json();
	t.is(headers['user-agent'], 'custom-ua-string');
});

test('support invocation overrides', async t => {
	const instance = got.extend({
		headers: {
			'user-agent': 'custom-ua-string'
		}
	});
	const headers = await instance(s.url, {
		headers: {
			'user-agent': 'different-ua-string'
		}
	}).json();
	t.is(headers['user-agent'], 'different-ua-string');
});

test('curry previous instance defaults', async t => {
	const instanceA = got.extend({
		headers: {
			'x-foo': 'foo'
		}
	});
	const instanceB = instanceA.extend({
		headers: {
			'x-bar': 'bar'
		}
	});
	const headers = await instanceB(s.url).json();
	t.is(headers['x-foo'], 'foo');
	t.is(headers['x-bar'], 'bar');
});

test('custom headers (extend)', async t => {
	const options = {headers: {unicorn: 'rainbow'}};

	const instance = got.extend(options);
	const headers = await instance(`${s.url}/`).json();
	t.is(headers.unicorn, 'rainbow');
});

test('extend overwrites arrays with a deep clone', t => {
	const beforeRequest = [0];
	const a = got.extend({hooks: {beforeRequest}});
	beforeRequest[0] = 1;
	t.deepEqual(a.defaults.hooks.beforeRequest, [0]);
	t.not(a.defaults.hooks.beforeRequest, beforeRequest);
});

test('extend keeps the old value if the new one is undefined', t => {
	const a = got.extend({headers: undefined});
	t.deepEqual(
		a.defaults.headers,
		got.defaults.headers
	);
});

test('extend merges URL instances', t => {
	const a = got.extend({baseUrl: new URL('https://example.com')});
	const b = a.extend({baseUrl: '/foo'});
	t.is(b.defaults.baseUrl.toString(), 'https://example.com/foo/');
});

test('extend with custom handler', async t => {
	const instance = got.extend((options, next) => {
		options.headers.unicorn = 'rainbow';
		return next(options);
	});
	const headers = await instance(s.url).json();
	t.is(headers.unicorn, 'rainbow');
});

test('extend with instances', t => {
	const a = got.extend({baseUrl: new URL('https://example.com/')});
	const b = got.extend(a);
	t.is(b.defaults.baseUrl.toString(), 'https://example.com/');
});

test('extend with a chain', t => {
	const a = got.extend({baseUrl: 'https://example.com/'});
	const b = got.extend(a, {headers: {foo: 'bar'}});
	t.is(b.defaults.baseUrl.toString(), 'https://example.com/');
	t.is(b.defaults.headers.foo, 'bar');
});

test('create', async t => {
	const instance = got.create({
		handler: (options, next) => {
			options.headers.unicorn = 'rainbow';
			return next(options);
		}
	});
	const headers = await instance(s.url).json();
	t.is(headers.unicorn, 'rainbow');
	t.is(headers['user-agent'], undefined);
});

test('hooks are merged on got.extend()', t => {
	const hooksA = [() => {}];
	const hooksB = [() => {}];

	const instanceA = got.create({hooks: {beforeRequest: hooksA}});

	const extended = instanceA.extend({hooks: {beforeRequest: hooksB}});
	t.deepEqual(extended.defaults.hooks.beforeRequest, hooksA.concat(hooksB));
});

test('custom endpoint with custom headers (extend)', async t => {
	const instance = got.extend({headers: {unicorn: 'rainbow'}, baseUrl: s.url});
	const headers = await instance('/').json();
	t.is(headers.unicorn, 'rainbow');
	t.not(headers['user-agent'], undefined);
});

test('no tampering with defaults', t => {
	const baseUrl = new URL('https://example.com');
	const instance = got.extend({baseUrl});

	const instance2 = instance.create(instance.defaults);

	// Tamper Time
	t.throws(() => {
		instance.defaults.baseUrl = 'http://google.com';
	});

	t.is(instance.defaults.baseUrl, baseUrl);
	t.is(instance2.defaults.baseUrl, baseUrl);
});

test('only plain objects are freezed', async t => {
	const instance = got.extend({
		agent: new http.Agent({keepAlive: true})
	});

	await t.notThrowsAsync(() => instance(s.url));
});

test('defaults are cloned on instance creation', t => {
	const options = {foo: 'bar', hooks: {beforeRequest: [() => {}]}};
	const instance = got.create({options});

	t.notThrows(() => {
		options.foo = 'foo';
		delete options.hooks.beforeRequest[0];
	});

	t.not(options.foo, instance.defaults.options.foo);
	t.not(options.hooks.beforeRequest, instance.defaults.options.hooks.beforeRequest);
});

test('ability to pass a custom request method', async t => {
	let called = false;

	const request = (...args) => {
		called = true;
		return http.request(...args);
	};

	const instance = got.extend({request});
	await instance(s.url);

	t.true(called);
});

test('hooks aren\'t overriden when merging options', async t => {
	let called = false;
	const instance = got.extend({
		hooks: {
			beforeRequest: [
				() => {
					called = true;
				}
			]
		}
	});

	await instance(s.url, {});

	t.true(called);
});
