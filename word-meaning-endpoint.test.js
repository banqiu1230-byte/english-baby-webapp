const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const text = 'I was responsible for the design.';
const input = { text, start: text.indexOf('responsible'), end: text.indexOf('responsible') + 'responsible'.length,
  sceneId: 'interview', taskId: 'interview-background' };
const definition = { term: 'responsible for', meaning: '负责设计工作。' };
async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; }

async function startApp(t, providerUrl, key = 'test-only-no-live-key') {
  const reservation = http.createServer();
  const port = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['server.js'], { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, HOST: '127.0.0.1', PORT: String(port), NODE_OPTIONS: '', DEEPSEEK_API_KEY: key,
    DEEPSEEK_BASE_URL: providerUrl, DEEPSEEK_MODEL: 'fallback-model', DEEPSEEK_FEEDBACK_MODEL: 'word-test-model', DOUBAO_API_KEY: 'test-only-no-speech',
  } });
  t.after(async () => { if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } });
  child.stderr.resume();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('test_server_start_timeout')), 5000);
    child.stdout.on('data', chunk => { if (String(chunk).includes('Luma is running')) { clearTimeout(timer); resolve(); } });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('test_server_exited')); });
  });
  const base = `http://127.0.0.1:${port}`;
  return { base, post: async (body, headers = {}) => {
    const response = await fetch(`${base}/api/word-meaning`, { method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  } };
}

test('word meanings HTTP route stays contextual, bounded, and separate from conversation state', async t => {
  const received = [];
  let result = definition, providerStatus = 200;
  const provider = http.createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    received.push({ path: request.url, body: JSON.parse(body) });
    response.writeHead(providerStatus, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(providerStatus === 200 ? { choices: [{ message: { content: JSON.stringify(result) } }] }
      : { error: 'private provider diagnostics' }));
  });
  const providerPort = await listen(provider);
  t.after(() => new Promise(resolve => { provider.closeAllConnections(); provider.close(resolve); }));
  const app = await startApp(t, `http://127.0.0.1:${providerPort}`);

  await t.test('uses the configured model and actual text across every scene and without scene metadata', async () => {
    for (const context of [{}, ...[['interview', 'interview-background'], ['coffee', 'coffee-order'], ['kitchen', 'breakfast-drink'], ['airport', 'ticket'], ['office', 'office-purpose']].map(([sceneId, taskId]) => ({ sceneId, taskId }))]) {
      const body = { text: input.text, start: input.start, end: input.end, ...context };
      const answer = await app.post({ ...body, completed: true });
      assert.equal(answer.status, 200);
      assert.deepEqual(answer.body, { ...definition, start: input.start, end: input.start + definition.term.length });
      assert.equal(answer.headers.get('cache-control'), 'no-store');
      assert.equal(received.at(-1).path, '/chat/completions');
      assert.equal(received.at(-1).body.model, 'word-test-model');
      assert.deepEqual(JSON.parse(received.at(-1).body.messages[1].content), { ...body, selected: 'responsible' });
    }
  });
  await t.test('rejects cross-origin, invalid input and 8 KB declared or streamed bodies before provider work', async () => {
    const before = received.length;
    for (const value of [null, { ...input, sceneId: '__proto__' }, { ...input, sceneId: 'coffee' }, { ...input, start: 2 }, { ...input, text: '' }, '{']) {
      assert.equal((await app.post(value)).status, 400);
    }
    assert.equal((await app.post(input, { Origin: 'https://unrelated.invalid' })).status, 403);
    assert.equal((await app.post({ ...input, padding: 'x'.repeat(8 * 1024) })).status, 413);
    const streamed = await new Promise((resolve, reject) => {
      const request = http.request(`${app.base}/api/word-meaning`, { method: 'POST', headers: {
        Origin: app.base, 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked',
      } }, response => {
        let body = '';
        response.on('data', chunk => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
      });
      request.on('error', reject);
      request.write('{"padding":"');
      request.write('x'.repeat(8 * 1024));
      request.end('"}');
    });
    assert.equal(streamed.status, 413);
    assert.deepEqual(streamed.body, { error: 'request_too_large' });
    assert.equal(received.length, before);
  });
  await t.test('provider failures never produce a fabricated definition', async () => {
    providerStatus = 401;
    const answer = await app.post(input);
    assert.equal(answer.status, 502);
    assert.deepEqual(answer.body, { error: 'word_meaning_unavailable' });
    providerStatus = 200; result = { ...definition, term: 'responsibility' };
    const invalid = await app.post(input);
    assert.equal(invalid.status, 502);
    assert.deepEqual(invalid.body, { error: 'word_meaning_invalid_response' });
    result = definition;
  });
  await t.test('private dictionary module stays private and intended frontend scripts are allowed', async () => {
    for (const file of ['word-meaning.js', 'word-meaning.test.js', 'server.js', '.env']) {
      assert.equal((await fetch(`${app.base}/${file}`)).status, 404);
    }
    const whitelist = fs.readFileSync(require.resolve('./server.js'), 'utf8').match(/const publicFiles = new Set\(\[([^]*?)\]\);/)[1];
    for (const name of ['word-lookup.js', 'word-pronunciation.js']) assert.ok(whitelist.includes(`'/${name}'`));
  });
  await t.test('lookup has its own 60 requests per minute bucket', async () => {
    let answer;
    for (let i = 0; i < 61; i++) { answer = await app.post(input); if (answer.status === 429) break; }
    assert.equal(answer.status, 429);
    const before = received.length;
    assert.equal((await app.post(input)).status, 429);
    assert.equal(received.length, before);
    const independent = await fetch(`${app.base}/api/conversation-help`, { method: 'POST', headers: { Origin: app.base, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(independent.status, 400, 'dictionary use does not consume the help bucket');
  });
});

test('missing dictionary configuration is explicit without contacting a provider', async t => {
  const app = await startApp(t, 'http://127.0.0.1:1', ' ');
  const answer = await app.post(input);
  assert.equal(answer.status, 503);
  assert.deepEqual(answer.body, { error: 'word_meaning_not_configured' });
});
