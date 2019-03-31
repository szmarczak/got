import test from 'ava';
import toReadableStream from 'to-readable-stream';
import got from '../source';
import withServer from './helpers/with-server';

const defaultEndpoint = (request, response) => {
	response.setHeader('method', request.method);
	request.pipe(response);
};

const echoHeaders = (request, response) => {
	response.end(JSON.stringify(request.headers));
};

test('GET cannot have body', withServer, async (t, server, got) => {
	server.post('/', defaultEndpoint);

	await t.throwsAsync(got.get('', {body: 'hi'}), 'The `GET` method cannot be used with a body');
});

test('sends strings', withServer, async (t, server, got) => {
	server.post('/', defaultEndpoint);

	const {body} = await got.post('', {body: 'wow'});
	t.is(body, 'wow');
});

test('sends Buffers', withServer, async (t, server, got) => {
	server.post('/', defaultEndpoint);

	const {body} = await got.post('', {body: Buffer.from('wow')});
	t.is(body, 'wow');
});

test('sends Streams', withServer, async (t, server, got) => {
	server.post('/', defaultEndpoint);

	const {body} = await got.post('', {body: toReadableStream('wow')});
	t.is(body, 'wow');
});

test('sends plain objects as forms', withServer, async (t, server, got) => {
	server.post('/', defaultEndpoint);

	const {body} = await got.post('', {
		form: {such: 'wow'}
	});

	t.is(body, 'such=wow');
});

test('does NOT support sending arrays as forms', withServer, async (t, server, got) => {
	server.post('/', defaultEndpoint);

	await t.throwsAsync(() => got.post('', {
		form: ['such', 'wow']
	}), TypeError);
});

test('sends plain objects as JSON', withServer, async (t, server, got) => {
	server.post('/', defaultEndpoint);

	const {body} = await got.post('', {
		json: {such: 'wow'},
		responseType: 'json'
	});
	t.deepEqual(body, {such: 'wow'});
});

test('sends arrays as JSON', withServer, async (t, server, got) => {
	server.post('/', defaultEndpoint);

	const {body} = await got.post('', {
		json: ['such', 'wow'],
		responseType: 'json'
	});
	t.deepEqual(body, ['such', 'wow']);
});

test('works with empty post response', withServer, async (t, server, got) => {
	server.post('/empty', (request, response) => {
		response.end();
	});

	const {body} = await got.post('empty', {body: 'wow'});
	t.is(body, '');
});

test('content-length header with string body', withServer, async (t, server, got) => {
	server.post('/headers', echoHeaders);

	const {body} = await got.post('headers', {body: 'wow'});
	const headers = JSON.parse(body);
	t.is(headers['content-length'], '3');
});

test('content-length header with Buffer body', withServer, async (t, server, got) => {
	server.post('/headers', echoHeaders);

	const {body} = await got.post('headers', {body: Buffer.from('wow')});
	const headers = JSON.parse(body);
	t.is(headers['content-length'], '3');
});

test('content-length header with Stream body', withServer, async (t, server, got) => {
	server.post('/headers', echoHeaders);

	const {body} = await got.post('headers', {body: toReadableStream('wow')});
	const headers = JSON.parse(body);
	t.is(headers['transfer-encoding'], 'chunked', 'likely failed to get headers at all');
	t.is(headers['content-length'], undefined);
});

test('content-length header is not overriden', withServer, async (t, server, got) => {
	server.post('/headers', echoHeaders);

	const {body} = await got.post('headers', {
		body: 'wow',
		headers: {
			'content-length': '10'
		}
	});
	const headers = JSON.parse(body);
	t.is(headers['content-length'], '10');
});

test('content-length header disabled for chunked transfer-encoding', withServer, async (t, server, got) => {
	server.post('/headers', echoHeaders);

	const {body} = await got.post('headers', {
		body: '3\r\nwow\r\n0\r\n',
		headers: {
			'transfer-encoding': 'chunked'
		}
	});
	const headers = JSON.parse(body);
	t.is(headers['transfer-encoding'], 'chunked', 'likely failed to get headers at all');
	t.is(headers['content-length'], undefined);
});

test('content-type header is not overriden when object in options.body', withServer, async (t, server, got) => {
	server.post('/headers', echoHeaders);

	const {body: headers} = await got.post('headers', {
		headers: {
			'content-type': 'doge'
		},
		json: {
			such: 'wow'
		},
		responseType: 'json'
	});
	t.is(headers['content-type'], 'doge');
});

test('throws when form body is not a plain object or array', async t => {
	await t.throwsAsync(() => got.post('https://example.com', {form: 'such=wow'}), TypeError);
});
