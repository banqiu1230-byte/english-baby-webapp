const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewExpression, cleanInput, cleanResult } = require('./expression-review');

const input = { utterance: 'I want go home.', heardQuestion: 'What would you like to do?', sceneId: 'coffee' };
const natural = { status: 'natural', expression: 'Small, please.', explanation: '简短回答很自然，不需要补成完整句。' };
const options = result => ({ apiKey: 'test-only', fetchImpl: async () => ({ ok: true,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(result) } }] }) }) });
const hasCode = (code, statusCode) => error => error.code === code && error.statusCode === statusCode;

test('reviews grammar in a separate untrusted JSON message without task targets', async () => {
  let sent;
  const result = await reviewExpression({ ...input, extra: 'must be removed' }, { apiKey: 'test-only', baseUrl: 'https://example.invalid/v1/', model: 'review-model',
    fetchImpl: async (url, request) => {
      sent = JSON.parse(request.body);
      assert.equal(url, 'https://example.invalid/v1/chat/completions');
      assert.ok(request.signal instanceof AbortSignal);
      return options({ status: 'suggestion', issue: 'grammar', expression: 'I want to go home.', explanation: 'want 后接动词时加 to，意思保持不变。', extra: 'discard' }).fetchImpl();
    } });
  assert.equal(sent.model, 'review-model');
  assert.deepEqual(JSON.parse(sent.messages[1].content), input);
  assert.match(sent.messages[0].content, /untrusted JSON/);
  assert.match(sent.messages[0].content, /never a target answer/);
  assert.match(sent.messages[0].content, /single word is natural/);
  assert.deepEqual(result, { status: 'suggestion', issue: 'grammar', expression: 'I want to go home.', explanation: 'want 后接动词时加 to，意思保持不变。' });
});

test('natural status preserves the original short reply instead of forcing a full sentence', async () => {
  const result = await reviewExpression({ ...input, utterance: '  Yes.\n', heardQuestion: 'Would you like a small or large latte?' },
    options({ ...natural, expression: 'I would like a small latte.' }));
  assert.equal(result.status, 'natural');
  assert.equal(result.expression, 'Yes.');
});

test('a valid unsupported drink remains valid English, not a different order', async () => {
  const result = await reviewExpression({ ...input, utterance: 'I like cappuccino.' }, options({ ...natural, expression: 'I like cappuccino.' }));
  assert.equal(result.expression, 'I like cappuccino.');
});

test('clear changed choices, names or numbers are not accepted as expression improvements', async () => {
  for (const [before, after] of [
    ['I want large latte for here.', 'I want a small latte to go.'],
    ['I like cappuccino.', 'I like a latte.'],
    ['My name is Alice.', 'My name is Maya.'],
    ["I'm here to see John Smith.", "I'm here to see John."],
    ['Gate A12 please.', 'Gate A13, please.'],
  ]) {
    const result = await reviewExpression({ ...input, utterance: before }, options({ status: 'suggestion', issue: 'grammar', expression: after, explanation: '这样更自然。' }));
    assert.equal(result.status, 'unclear', before);
    assert.equal(result.expression, '');
  }
});

test('safe grammar improvements preserve the named drink, size, person and number', async () => {
  const original = 'I want small latte to go.';
  const result = await reviewExpression({ ...input, utterance: original }, options({ status: 'suggestion', issue: 'grammar', expression: 'I want a small latte to go.', explanation: '在单数饮品前补上 a，保留你的订单选择。' }));
  assert.equal(result.status, 'suggestion');
  assert.equal(result.expression, 'I want a small latte to go.');
});

test('uncertain recognition does not fabricate a replacement expression', async () => {
  const result = await reviewExpression({ ...input, utterance: 'America?' }, options({ status: 'unclear', expression: 'An americano.', explanation: '可能是识别有误，请先核对你说的词。' }));
  assert.equal(result.expression, '');
  const chinese = await reviewExpression({ ...input, utterance: '回去' }, { apiKey: 'test-only', fetchImpl: async () => assert.fail('should not send non-English-only text') });
  assert.equal(chinese.status, 'unclear');
});

test('rejects empty, oversized and invalid inputs before making a paid request', async () => {
  for (const value of [null, [], { ...input, utterance: '' }, { ...input, utterance: 'a'.repeat(601) },
    { ...input, heardQuestion: 'a'.repeat(601) }, { ...input, sceneId: 'unknown' }, { ...input, utterance: {} }]) {
    await assert.rejects(reviewExpression(value, { apiKey: 'test-only', fetchImpl: () => assert.fail('invalid input was sent') }), hasCode('invalid_request', 400));
  }
  assert.deepEqual(cleanInput({ ...input, heardQuestion: undefined, utterance: ' Small\u0000please. ' }), { ...input, utterance: 'Small please.', heardQuestion: '' });
});

test('missing key is explicit and never returns fabricated feedback', async () => {
  await assert.rejects(reviewExpression(input), hasCode('expression_review_not_configured', 503));
});

test('rejects malformed or oversized model output and strips unknown fields', async () => {
  for (const value of [null, [], { ...natural, status: 'mastered' }, { ...natural, expression: {} },
    { ...natural, expression: 'a'.repeat(601) }, { ...natural, explanation: '' }, { ...natural, explanation: '好'.repeat(241) },
    { ...natural, explanation: 'A good sentence.' }]) {
    await assert.rejects(reviewExpression(input, options(value)), hasCode('expression_review_invalid_response', 502));
  }
  const result = cleanResult({ ...natural, unknown: '<script>unsafe()</script>' }, { ...input, utterance: 'Small.' });
  assert.deepEqual(Object.keys(result), ['status', 'issue', 'expression', 'explanation']);
});

test('provider errors and non-JSON responses do not expose upstream content or credentials', async () => {
  for (const fetchImpl of [async () => { throw new Error('Bearer secret'); }, async () => ({ ok: false, status: 401 })]) {
    await assert.rejects(reviewExpression(input, { apiKey: 'secret', fetchImpl }), hasCode('expression_review_unavailable', 502));
  }
  await assert.rejects(reviewExpression(input, { apiKey: 'test-only', fetchImpl: async () => ({ ok: true,
    json: async () => ({ choices: [{ message: { content: '```json\n{}\n```' } }] }) }) }), hasCode('expression_review_invalid_response', 502));
});

test('aborts a slow provider and exposes a stable timeout error', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  const pending = reviewExpression(input, { apiKey: 'test-only', fetchImpl: async (_url, request) => {
    signal = request.signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } });
  const checked = assert.rejects(pending, hasCode('expression_review_timeout', 504));
  t.mock.timers.tick(8000);
  await checked;
  assert.equal(signal.aborted, true);
});


test('style-only, missing classification and punctuation changes never become error cards', async () => {
  for (const issue of [null, undefined, 'style', 'politeness']) {
    const result = cleanResult({ status: 'suggestion', issue, expression: 'For here, please.', explanation: '加 please 更礼貌。' }, { ...input, utterance: 'For here.' });
    assert.equal(result.status, ['style', 'politeness'].includes(issue) ? 'natural' : 'unclear'); assert.equal(result.issue, null);
    assert.equal(result.expression, ['style', 'politeness'].includes(issue) ? 'For here.' : '');
  }
  const punctuation = cleanResult({ status: 'suggestion', issue: 'grammar', expression: 'Small, please!', explanation: '改变标点。' }, { ...input, utterance: 'Small please.' });
  assert.equal(punctuation.status, 'natural');
});

test('clear word-choice errors can be identified without changing facts', () => {
  const result = cleanResult({ status: 'suggestion', issue: 'word-choice', expression: 'I am thirsty.', explanation: '表达口渴用 thirsty。' }, { ...input, utterance: 'I am thirst.' });
  assert.equal(result.status, 'suggestion'); assert.equal(result.issue, 'word-choice');
});
