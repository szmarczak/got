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

test('merging instances', async t => {
	const instanceA = got.extend({headers: {unicorn: 'rainbow'}});
	const instanceB = got.extend({baseUrl: s.url});
	const merged = instanceA.extend(instanceB);

	const headers = await merged('/').json();
	t.is(headers.unicorn, 'rainbow');
	t.not(headers['user-agent'], undefined);
});

test('works even if no default handler in the end', async t => {
	const instanceA = got.create({
		handler: (options, next) => next(options)
	});

	const instanceB = got.create({
		handler: (options, next) => next(options)
	});

	const merged = instanceA.extend(instanceB);
	await t.notThrows(() => merged(s.url));
});

test('merges default handlers & custom handlers', async t => {
	const instanceA = got.extend({headers: {unicorn: 'rainbow'}});
	const instanceB = got.create({
		handler: (options, next) => {
			options.headers.cat = 'meow';
			return next(options);
		}
	});
	const merged = instanceA.extend(instanceB);

	const headers = await merged(s.url).json();
	t.is(headers.unicorn, 'rainbow');
	t.is(headers.cat, 'meow');
});

test('merging one group & one instance', async t => {
	const instanceA = got.extend({headers: {dog: 'woof'}});
	const instanceB = got.extend({headers: {cat: 'meow'}});
	const instanceC = got.extend({headers: {bird: 'tweet'}});
	const instanceD = got.extend({headers: {mouse: 'squeek'}});

	const merged = instanceA.extend(instanceB, instanceC);
	const doubleMerged = merged.extend(instanceD);

	const headers = await doubleMerged(s.url).json();
	t.is(headers.dog, 'woof');
	t.is(headers.cat, 'meow');
	t.is(headers.bird, 'tweet');
	t.is(headers.mouse, 'squeek');
});

test('merging two groups of merged instances', async t => {
	const instanceA = got.extend({headers: {dog: 'woof'}});
	const instanceB = got.extend({headers: {cat: 'meow'}});
	const instanceC = got.extend({headers: {bird: 'tweet'}});
	const instanceD = got.extend({headers: {mouse: 'squeek'}});

	const groupA = instanceA.extend(instanceB);
	const groupB = instanceC.extend(instanceD);

	const merged = groupA.extend(groupB);

	const headers = await merged(s.url).json();
	t.is(headers.dog, 'woof');
	t.is(headers.cat, 'meow');
	t.is(headers.bird, 'tweet');
	t.is(headers.mouse, 'squeek');
});

test('hooks are merged', t => {
	const getBeforeRequestHooks = instance => instance.defaults.hooks.beforeRequest;

	const instanceA = got.extend({hooks: {
		beforeRequest: [
			options => {
				options.headers.dog = 'woof';
			}
		]
	}});
	const instanceB = got.extend({hooks: {
		beforeRequest: [
			options => {
				options.headers.cat = 'meow';
			}
		]
	}});

	const merged = instanceA.extend(instanceB);
	t.deepEqual(getBeforeRequestHooks(merged), getBeforeRequestHooks(instanceA).concat(getBeforeRequestHooks(instanceB)));
});

test('hooks are passed by though other instances don\'t have them', t => {
	const instanceA = got.extend({hooks: {
		beforeRequest: [
			options => {
				options.headers.dog = 'woof';
			}
		]
	}});
	const instanceB = got.create({
		options: {}
	});
	const instanceC = got.create({
		options: {hooks: {}}
	});

	const merged = instanceA.extend(instanceB, instanceC);
	t.deepEqual(merged.defaults.hooks.beforeRequest, instanceA.defaults.hooks.beforeRequest);
});
