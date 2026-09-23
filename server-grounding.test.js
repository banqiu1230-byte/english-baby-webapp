const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Coffee = require('./coffee');
const Breakfast = require('./breakfast');
const source = fs.readFileSync(require.resolve('./server'), 'utf8');

function instructions(taskId, world = Coffee.initial(), flowState = 'active') {
  const context = vm.createContext({ Coffee, Breakfast });
  const declarations = ['DUPLEX_TASKS', 'SCENE_FACTS'].map(name => source.match(new RegExp(`^const ${name} = \\{[^]*?^\\};`, 'm'))[0]);
  declarations.push(source.match(/^const ACTION_REQUIRED_TASKS = .*$/m)[0]);
  declarations.push(source.match(/^function duplexInstructions\([^]*?^\}$/m)[0]);
  vm.runInContext(declarations.join('\n'), context);
  return context.duplexInstructions(taskId, false, false, [], flowState, [], Breakfast.initial(), world);
}

function feedback(body, parsed = {}) {
  const responses = [], requests = [];
  const context = vm.createContext({ Coffee, Breakfast, AbortController, setTimeout, clearTimeout,
    process: { env: { DEEPSEEK_API_KEY: 'test-only' } }, console: { error() {} },
    readJson: async () => body,
    sendJson: (_response, status, payload) => responses.push({ status, payload }),
    fetch: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(parsed) } }] }) };
    },
  });
  vm.runInContext([
    source.match(/^const SCENE_GOALS = \{[^]*?^\};/m)[0],
    source.match(/^function cleanText\([^]*?^\}$/m)[0],
    source.match(/^async function handleLanguageFeedback\([^]*?^\}$/m)[0],
  ].join('\n'), context);
  return { run: () => context.handleLanguageFeedback({}, {}), responses, requests };
}

const groundTruth = text => text.match(/Scene ground truth: ([^]*?) Treat this as physical truth\./)?.[1];

test('coffee voice context names only the objects in the current artwork', () => {
  const order = instructions('coffee-order');
  assert.equal(groundTruth(order), 'the only visible task objects are two glass cups on the counter: a latte and an americano.');
  assert.match(order, /No physical menu or price list is visible or available/);
  assert.match(order, /cannot be ordered or promised here/);
  assert.doesNotMatch(groundTruth(order), /menu|prepared cup/);
  const size = groundTruth(instructions('coffee-size', { drink: 'latte', size: null, service: null }));
  assert.match(size, /two takeaway paper cups/);
  assert.doesNotMatch(size, /glass|latte|americano|menu/);
  const service = groundTruth(instructions('coffee-service', { drink: 'latte', size: 'small', service: null }));
  assert.match(service, /a reusable cup.*a paper takeaway cup/);
  const ready = groundTruth(instructions('coffee-thanks', { drink: 'americano', size: 'small', service: 'here' }));
  assert.match(ready, /one prepared americano in a reusable cup/);
  assert.doesNotMatch(ready, /latte|two.*cups/);
  const toGo = groundTruth(instructions('coffee-thanks', { drink: 'latte', size: 'large', service: 'to-go' }));
  assert.match(toGo, /one prepared paper takeaway cup/);
});

test('coffee context respects real orders and changes conversational approach after ambiguity', () => {
  const text = instructions('coffee-service', Coffee.missionInitial('C02'));
  assert.match(text, /Teaching targets and suggested orders are background only/);
  assert.match(text, /including for here when a suggested task says to go/);
  assert.match(text, /Accept an explicit change of mind/);
  assert.doesNotMatch(text, /never confirm a value that conflicts with Target/);
  assert.match(text, /Do not add a question to every reply/);
  assert.match(text, /Do not repeat an identical either-or question on successive turns/);
  assert.match(text, /A yes to that actual single-option question confirms that option/);
  assert.match(text, /apologize and correct that promise/);
});

test('yes confirms the actual single-option question without waiting for model scoring', async () => {
  const world = Coffee.advanceMission(Coffee.missionInitial('C01'), 'A latte.').world;
  const h = feedback({ sceneId: 'coffee', taskId: 'coffee-size', coffee: world,
    question: 'Would you like a small latte?', answer: 'Yes, please.' });
  await h.run();
  assert.equal(h.responses[0].status, 200);
  assert.equal(h.responses[0].payload.meaning_valid, true);
  assert.equal(h.responses[0].payload.choice, 'small');
  assert.equal(h.requests.length, 0);
});

test('yes to either-or and no to one option never invent an order', async () => {
  for (const [question, answer] of [['Would you like a latte or an americano?', 'Yes.'], ['Would you like a latte?', 'No.']]) {
    const h = feedback({ sceneId: 'coffee', taskId: 'coffee-order', coffee: Coffee.missionInitial('C01'),
      question, answer }, { meaning_valid: true, choice: 'latte' });
    await h.run();
    assert.equal(h.responses[0].payload.meaning_valid, false);
    assert.equal(h.responses[0].payload.choice, null);
    assert.equal(h.requests.length, 0);
  }
});

test('an absent menu or unsupported drink cannot be scored as a latte', async () => {
  for (const answer of ['I like cappuccino.', "I don't see the menu.", 'The menu please.']) {
    const h = feedback({ sceneId: 'coffee', taskId: 'coffee-order', coffee: Coffee.missionInitial('C01'),
      question: 'Would you like a latte or an americano?', answer }, { meaning_valid: true, choice: 'latte' });
    await h.run();
    assert.equal(h.responses[0].payload.meaning_valid, false, answer);
    assert.equal(h.responses[0].payload.choice, null, answer);
    assert.equal(h.requests.length, 0, answer);
  }
});

test('available service choice is accepted even when the practice suggestion differs', async () => {
  const world = Coffee.advanceMission(Coffee.missionInitial('C02'), 'A small latte.').world;
  const h = feedback({ sceneId: 'coffee', taskId: 'coffee-service', coffee: world,
    question: 'Is that for here or to go?', answer: 'For here.' });
  await h.run();
  assert.equal(h.responses[0].payload.meaning_valid, true);
  assert.equal(h.responses[0].payload.choice, 'here');
  assert.equal(h.requests.length, 0);
});


test('coffee feedback keeps preferences and past experiences out of the current order', async () => {
  const cases = [
    ['What coffee do you usually drink?', 'Latte.'],
    ['What is your favorite coffee?', 'I like latte.'],
    ['How was your morning?', 'I had a small latte yesterday.'],
    ['Would you like a latte or an americano?', "Let's just talk."],
  ];
  for (const [question, answer] of cases) {
    const h = feedback({ sceneId: 'coffee', taskId: 'coffee-order', coffee: Coffee.missionInitial('C01'),
      question, answer }, { meaning_valid: true, choice: 'latte' });
    await h.run();
    assert.equal(h.responses[0].status, 200, answer);
    assert.equal(h.responses[0].payload.meaning_valid, false, answer);
    assert.equal(h.responses[0].payload.choice, null, answer);
    assert.equal(h.requests.length, 0, answer);
  }
});

test('an explicit new order resumes service after small talk', async () => {
  for (const [question, answer] of [
    ['What coffee do you usually drink?', 'Can I have a latte, please?'],
    ['Would you like a latte or an americano?', 'Latte.'],
  ]) {
    const h = feedback({ sceneId: 'coffee', taskId: 'coffee-order', coffee: Coffee.missionInitial('C01'), question, answer });
    await h.run();
    assert.equal(h.responses[0].payload.meaning_valid, true, answer);
    assert.equal(h.responses[0].payload.choice, 'latte', answer);
    assert.equal(h.requests.length, 0, answer);
  }
});

test('task transition and completion instructions preserve the open conversation', () => {
  for (const state of ['active', 'task-complete', 'complete']) {
    const text = instructions('coffee-thanks', { drink: 'latte', size: 'small', service: 'here', received: true }, state);
    assert.match(text, /latest conversational meaning takes priority/);
    assert.match(text, /past experience, hypothetical story, or answer to a small-talk question does not place or change an order/);
    assert.match(text, /through an explicit speech request/);
    assert.match(text, /Do not generate or repeat that fixed acknowledgment yourself/);
    assert.doesNotMatch(text, /Give one short final acknowledgment and do not open a new topic/);
    assert.doesNotMatch(text, /Use the current task acknowledgment above, then stop/);
    assert.doesNotMatch(text, /Do not ask any question/);
    if (state === 'complete') assert.match(text, /Completion is not a command to end the conversation/);
    if (state === 'task-complete') assert.match(text, /conversation remains open/);
  }
});
