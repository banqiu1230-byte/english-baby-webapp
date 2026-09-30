const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const input = { sceneId: 'interview', taskId: 'interview-background', question: 'What was your personal contribution?', history: [] };
const scaffold = { meaning: '对方想知道你亲自做了什么。', answerPlan: ['先选一件你负责的事', '补一句你实际做了什么'],
  answerStarter: 'My part was [your actual contribution].', model: '' };
async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; }

async function startApp(t, providerUrl, key = 'test-only-no-live-key') {
  const reservation = http.createServer();
  const port = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['server.js'], { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, HOST: '127.0.0.1', PORT: String(port), NODE_OPTIONS: '', DEEPSEEK_API_KEY: key,
    DEEPSEEK_BASE_URL: providerUrl, DEEPSEEK_MODEL: 'fallback-model', DEEPSEEK_FEEDBACK_MODEL: 'help-test-model', DOUBAO_API_KEY: 'test-only-no-speech',
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
    const response = await fetch(`${base}/api/conversation-help`, { method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  } };
}

test('conversation help HTTP route stays bounded, contextual and separate from task control', async t => {
  const received = [];
  let result = scaffold, providerStatus = 200;
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

  await t.test('uses actual question and configured model for every scene', async () => {
    for (const [sceneId, taskId] of [['interview', 'interview-background'], ['coffee', 'coffee-order'], ['kitchen', 'breakfast-drink'], ['airport', 'ticket'], ['office', 'office-purpose']]) {
      const answer = await app.post({ ...input, sceneId, taskId, target: 'untrusted target' });
      assert.equal(answer.status, 200);
      assert.equal(answer.body.answerStarter, scaffold.answerStarter);
      assert.match(answer.body.note, /真实情况/);
      assert.equal(answer.headers.get('cache-control'), 'no-store');
      assert.equal(received.at(-1).body.model, 'help-test-model');
      assert.deepEqual(JSON.parse(received.at(-1).body.messages[1].content), { ...input, sceneId, taskId });
    }
  });
  await t.test('rejects unrelated scene/task, origin, malformed and oversized requests before provider work', async () => {
    const before = received.length;
    for (const value of [null, { ...input, sceneId: '__proto__' }, { ...input, sceneId: 'coffee' }, { ...input, question: '' }, '{']) {
      assert.equal((await app.post(value)).status, 400);
    }
    assert.equal((await app.post(input, { Origin: 'https://unrelated.invalid' })).status, 403);
    assert.equal((await app.post({ ...input, padding: 'x'.repeat(64 * 1024) })).status, 413);
    assert.equal(received.length, before);
  });
  await t.test('provider failures never become character speech or completion data', async () => {
    providerStatus = 401;
    const answer = await app.post(input);
    assert.equal(answer.status, 502);
    assert.deepEqual(answer.body, { error: 'conversation_help_unavailable' });
  });
  await t.test('invalid generated answers are rejected and the private module stays private', async () => {
    providerStatus = 200; result = { ...scaffold, answerStarter: 'I led the team and improved conversion by 20%.' };
    const answer = await app.post(input);
    assert.equal(answer.status, 502);
    assert.deepEqual(answer.body, { error: 'conversation_help_invalid_response' });
    assert.equal((await fetch(`${app.base}/conversation-help.js`)).status, 404);
    result = scaffold;
  });
  await t.test('uses its own bounded request bucket', async () => {
    let answer;
    for (let i = 0; i < 31; i++) { answer = await app.post(input); if (answer.status === 429) break; }
    assert.equal(answer.status, 429);
    const before = received.length;
    assert.equal((await app.post(input)).status, 429);
    assert.equal(received.length, before);
  });
});

test('missing help configuration is explicit without contacting a provider', async t => {
  const app = await startApp(t, 'http://127.0.0.1:1', ' ');
  const result = await app.post(input);
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { error: 'conversation_help_not_configured' });
});
