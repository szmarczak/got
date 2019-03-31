import {promisify} from 'util';
import zlib from 'zlib';
import test from 'ava';
import getStream from 'get-stream';
import withServer from './helpers/with-server';

const testContent = 'Compressible response content.\n';
const testContentUncompressed = 'Uncompressed response content.\n';
let gzipData;

test.before('setup', async () => {
	gzipData = await promisify(zlib.gzip)(testContent);
});

test('decompress content', withServer, async (t, server, got) => {
	server.get('/', (request, response) => {
		response.setHeader('Content-Encoding', 'gzip');
		response.end(gzipData);
	});

	t.is((await got('')).body, testContent);
});

test('decompress content - stream', withServer, async (t, server, got) => {
	server.get('/', (request, response) => {
		response.setHeader('Content-Encoding', 'gzip');
		response.end(gzipData);
	});

	t.is((await getStream(got.stream(''))), testContent);
});

test('handles gzip error', withServer, async (t, server, got) => {
	server.get('/corrupted', (request, response) => {
		response.setHeader('Content-Encoding', 'gzip');
		response.end('Not gzipped content');
	});

	const error = await t.throwsAsync(() => got('corrupted'));
	t.is(error.message, 'incorrect header check');
	// @ts-ignore
	t.is(error.path, '/corrupted');
	t.is(error.name, 'ReadError');
});

test('handles gzip error - stream', withServer, async (t, server, got) => {
	server.get('/corrupted', (request, response) => {
		response.setHeader('Content-Encoding', 'gzip');
		response.end('Not gzipped content');
	});

	const error = await t.throwsAsync(getStream(got.stream('corrupted')));
	t.is(error.message, 'incorrect header check');
	// @ts-ignore
	t.is(error.path, '/corrupted');
	t.is(error.name, 'ReadError');
});

test('decompress option opts out of decompressing', withServer, async (t, server, got) => {
	server.get('/', (request, response) => {
		response.setHeader('Content-Encoding', 'gzip');
		response.end(gzipData);
	});

	const {body} = await got({decompress: false});
	t.is(Buffer.compare(body, gzipData), 0);
});

test('decompress option doesn\'t alter encoding of uncompressed responses', withServer, async (t, server, got) => {
	server.get('/uncompressed', (request, response) => {
		response.end(testContentUncompressed);
	});

	const {body} = await got('uncompressed', {decompress: false});
	t.is(body, testContentUncompressed);
});

test('preserve headers property', withServer, async (t, server, got) => {
	server.get('/', (request, response) => {
		response.setHeader('Content-Encoding', 'gzip');
		response.end(gzipData);
	});

	t.truthy((await got('')).headers);
});

test('do not break HEAD responses', withServer, async (t, server, got) => {
	server.get('/', (request, response) => {
		response.end();
	});

	t.is((await got.head('')).body, '');
});

test('ignore missing data', withServer, async (t, server, got) => {
	server.get('/missing-data', (request, response) => {
		response.setHeader('Content-Encoding', 'gzip');
		response.end(gzipData.slice(0, -1));
	});

	t.is((await got('missing-data')).body, testContent);
});

test('has url and requestUrl properties', withServer, async (t, server, got) => {
	server.get('/', (request, response) => {
		response.setHeader('Content-Encoding', 'gzip');
		response.end(gzipData);
	});

	const response = await got('');
	t.truthy(response.url);
	t.truthy(response.requestUrl);
});
