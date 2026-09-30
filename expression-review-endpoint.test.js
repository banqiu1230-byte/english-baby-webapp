const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const ROOT = __dirname;
const example = { utterance: 'I want go home.', heardQuestion: 'What would you like to do?', sceneId: 'coffee' };
const suggestion = { status: 'suggestion', issue: 'grammar', expression: 'I want to go home.', explanation: 'want 后接动词时加 to，保留你的意思。' };

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

async function startApp(t, providerUrl, key = 'endpoint-test-only') {
  const reservation = http.createServer();
  const port = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, HOST: '127.0.0.1', PORT: String(port), NODE_OPTIONS: '',
    // Truthy test values prevent the local .env loader from inserting real keys.
    DEEPSEEK_API_KEY: key, DEEPSEEK_BASE_URL: providerUrl,
    DEEPSEEK_MODEL: 'fallback-test-model', DEEPSEEK_FEEDBACK_MODEL: 'endpoint-test-model',
    DOUBAO_API_KEY: 'endpoint-test-only-no-speech',
  } });
  t.after(async () => {
    if (child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  });
  child.stderr.resume();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('test_server_start_timeout')), 5000);
    child.stdout.on('data', chunk => {
      if (String(chunk).includes('Luma is running')) { clearTimeout(timer); resolve(); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('test_server_exited')); });
  });
  const base = `http://127.0.0.1:${port}`;
  async function post(body, extraHeaders = {}) {
    const response = await fetch(`${base}/api/expression-review`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base, ...extraHeaders },
      body: typeof body === 'string' ? body : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  return { base, post };
}

test('expression review HTTP route uses a local mock provider and preserves error boundaries', async t => {
  const received = [];
  let providerResult = suggestion, providerStatus = 200;
  const provider = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    received.push({ path: request.url, body: JSON.parse(body) });
    response.writeHead(providerStatus, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(providerStatus === 200
      ? { choices: [{ message: { content: JSON.stringify(providerResult) } }] }
      : { error: 'private provider diagnostics must not reach the browser' }));
  });
  const providerPort = await listen(provider);
  t.after(() => new Promise(resolve => { provider.closeAllConnections(); provider.close(resolve); }));
  const app = await startApp(t, `http://127.0.0.1:${providerPort}`);

  await t.test('returns a bounded result, uses existing model precedence and drops unknown input', async () => {
    const result = await app.post({ ...example, target: 'a large latte', secret: 'do not forward' });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, suggestion);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal(received.length, 1);
    assert.equal(received[0].path, '/chat/completions');
    assert.equal(received[0].body.model, 'endpoint-test-model');
    assert.deepEqual(JSON.parse(received[0].body.messages[1].content), example);
  });

  await t.test('rejects cross-origin, invalid JSON and invalid input without calling the provider', async () => {
    const before = received.length;
    assert.deepEqual((await app.post(example, { Origin: 'https://unrelated.invalid' })).body, { error: 'forbidden' });
    assert.equal((await app.post(example, { Origin: 'https://unrelated.invalid' })).status, 403);
    assert.deepEqual((await app.post('{')).body, { error: 'invalid_request' });
    assert.equal((await app.post({ ...example, utterance: '' })).status, 400);
    assert.equal(received.length, before);
  });

  await t.test('rejects an oversized body before provider work', async () => {
    const before = received.length;
    const result = await app.post({ ...example, padding: 'x'.repeat(64 * 1024) });
    assert.equal(result.status, 413);
    assert.deepEqual(result.body, { error: 'request_too_large' });
    assert.equal(received.length, before);
  });

  await t.test('rejects oversized chunked bodies too', async () => {
    const before = received.length;
    const result = await new Promise((resolve, reject) => {
      const request = http.request(`${app.base}/api/expression-review`, { method: 'POST', headers: {
        Origin: app.base, 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked',
      } }, response => {
        let body = '';
        response.on('data', chunk => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
      });
      request.on('error', reject);
      request.write('{"padding":"');
      request.write('x'.repeat(64 * 1024));
      request.end('"}');
    });
    assert.equal(result.status, 413);
    assert.deepEqual(result.body, { error: 'request_too_large' });
    assert.equal(received.length, before);
  });

  await t.test('provider failures expose only stable error codes', async () => {
    providerStatus = 401;
    const failed = await app.post(example);
    assert.equal(failed.status, 502);
    assert.deepEqual(failed.body, { error: 'expression_review_unavailable' });
    providerStatus = 200; providerResult = { status: 'mastered', expression: 'bad' };
    const malformed = await app.post(example);
    assert.equal(malformed.status, 502);
    assert.deepEqual(malformed.body, { error: 'expression_review_invalid_response' });
    providerResult = suggestion;
  });

  await t.test('private server modules cannot be downloaded; only intended browser additions are whitelisted', async () => {
    for (const file of ['expression-review.js', 'expression-review.test.js', 'server.js', '.env']) {
      const response = await fetch(`${app.base}/${file}`);
      assert.equal(response.status, 404, file);
      assert.deepEqual(await response.json(), { error: 'not_found' });
    }
    const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    const whitelist = serverSource.match(/const publicFiles = new Set\(\[([^]*?)\]\);/)[1];
    for (const file of ['life-experience.js', 'navigation-ui.js', 'world-map.js']) {
      assert.ok(whitelist.includes(`'/${file}'`), file);
      if (fs.existsSync(path.join(ROOT, file))) {
        const response = await fetch(`${app.base}/${file}`);
        assert.equal(response.status, 200, file);
        assert.match(response.headers.get('content-type'), /javascript/);
        await response.text();
      }
    }
  });

  await t.test('enforces 30 requests per minute before any further provider calls', async () => {
    let limited;
    for (let i = 0; i < 31; i += 1) {
      limited = await app.post(example);
      if (limited.status === 429) break;
    }
    assert.equal(limited.status, 429);
    assert.deepEqual(limited.body, { error: 'too_many_requests' });
    const before = received.length;
    assert.equal((await app.post(example)).status, 429);
    assert.equal(received.length, before);
  });
});

test('expression review route explicitly reports missing configuration without provider work', async t => {
  // A space bypasses local .env replacement but is intentionally not a usable key.
  const app = await startApp(t, 'http://127.0.0.1:1', ' ');
  const result = await app.post(example);
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { error: 'expression_review_not_configured' });
});
