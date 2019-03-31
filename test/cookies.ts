import net from 'net';
import test from 'ava';
import tough from 'tough-cookie';
import delay from 'delay';
import got from '../source';
import withServer from './helpers/with-server';

test('reads a cookie', withServer, async (t, server, got) => {
	server.get('/set-cookie', (request, response) => {
		response.setHeader('set-cookie', 'hello=world');
		response.end();
	});

	const cookieJar = new tough.CookieJar();

	await got('set-cookie', {cookieJar});

	const cookie = cookieJar.getCookiesSync(server.url)[0];
	t.is(cookie.key, 'hello');
	t.is(cookie.value, 'world');
});

test('reads multiple cookies', withServer, async (t, server, got) => {
	server.get('/set-multiple-cookies', (request, response) => {
		response.setHeader('set-cookie', ['hello=world', 'foo=bar']);
		response.end();
	});

	const cookieJar = new tough.CookieJar();

	await got('set-multiple-cookies', {cookieJar});

	const cookies = cookieJar.getCookiesSync(server.url);
	const cookieA = cookies[0];
	t.is(cookieA.key, 'hello');
	t.is(cookieA.value, 'world');

	const cookieB = cookies[1];
	t.is(cookieB.key, 'foo');
	t.is(cookieB.value, 'bar');
});

test('cookies doesn\'t break on redirects', withServer, async (t, server, got) => {
	server.get('/set-cookies-then-redirect', (request, response) => {
		response.setHeader('set-cookie', ['hello=world', 'foo=bar']);
		response.setHeader('location', '/');
		response.statusCode = 302;
		response.end();
	});

	server.get('/', (request, response) => {
		response.end(request.headers.cookie || '');
	});

	const cookieJar = new tough.CookieJar();

	const {body} = await got('set-cookies-then-redirect', {cookieJar});
	t.is(body, 'hello=world; foo=bar');
});

test('throws on invalid cookies', withServer, async (t, server, got) => {
	server.get('/invalid', (request, response) => {
		response.setHeader('set-cookie', 'hello=world; domain=localhost');
		response.end();
	});

	const cookieJar = new tough.CookieJar();

	await t.throwsAsync(() => got('invalid', {cookieJar}), 'Cookie has domain set to a public suffix');
});

test('catches store errors', async t => {
	const error = 'Some error';
	// @ts-ignore
	const cookieJar = new tough.CookieJar({
		findCookies: (_, __, cb) => {
			cb(new Error(error), []);
		}
	});

	await t.throwsAsync(() => got('https://example.com', {cookieJar}), error);
});

test('overrides options.headers.cookie', withServer, async (t, server, got) => {
	server.get('/set-cookies-then-redirect', (request, response) => {
		response.setHeader('set-cookie', ['hello=world', 'foo=bar']);
		response.setHeader('location', '/');
		response.statusCode = 302;
		response.end();
	});

	server.get('/', (request, response) => {
		response.end(request.headers.cookie || '');
	});

	const cookieJar = new tough.CookieJar();
	const {body} = await got('set-cookies-then-redirect', {
		cookieJar,
		headers: {
			cookie: 'a=b'
		}
	});
	t.is(body, 'hello=world; foo=bar');
});

test('no unhandled errors', async t => {
	const server = net.createServer(connection => {
		connection.end('blah');
	}).listen(0);

	const message = 'snap!';

	const options = {
		cookieJar: {
			setCookie: () => {},
			getCookieString: (_, __, cb) => cb(new Error(message))
		}
	};

	// @ts-ignore
	await t.throwsAsync(() => got(`http://127.0.0.1:${server.address().port}`, options), {message});
	await delay(500);
	t.pass();

	server.close();
});
