const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Interview = require('./interview');
const Coffee = require('./coffee');
const Breakfast = require('./breakfast');
const DialogueRules = require('./dialogue-rules');
const SceneDialogue = require('./scene-dialogue');
const source = fs.readFileSync(require.resolve('./server'), 'utf8');
const first = Interview.taskById('interview-background');

function voice() {
  const context = vm.createContext({ Interview, Coffee, Breakfast, SceneMemory: require('./scene-memory') });
  const declarations = ['ASR_COMMON_WORDS', 'ASR_SCENE_WORDS', 'DUPLEX_TASKS', 'SCENE_FACTS']
    .map(name => source.match(new RegExp(`^const ${name} = [^]*?^[\\]}];`, 'm'))[0]);
  declarations.push(source.match(/^const ACTION_REQUIRED_TASKS = .*$/m)[0]);
  declarations.push(source.match(/^function duplexAsr\([^]*?^\}$/m)[0]);
  declarations.push(source.match(/^function conversationFlowInstructions\([^]*?^\}$/m)[0]);
  declarations.push(source.match(/^function duplexInstructions\([^]*?^\}$/m)[0]);
  vm.runInContext(declarations.join('\n'), context);
  return context;
}
function feedback(body, parsed = {}) {
  const responses = [], requests = [];
  const context = vm.createContext({ Coffee, Breakfast, DialogueRules, SceneDialogue, AbortController, setTimeout, clearTimeout,
    process: { env: { DEEPSEEK_API_KEY: 'test-only' } }, console: { error() {} },
    readJson: async () => body,
    sendJson: (_response, status, payload) => responses.push({ status, payload }),
    fetch: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(parsed) } }] }) };
    },
  });
  vm.runInContext([
    source.match(/^function cleanText\([^]*?^\}$/m)[0],
    source.match(/^async function handleLanguageFeedback\([^]*?^\}$/m)[0],
  ].join('\n'), context);
  return { run: () => context.handleLanguageFeedback({}, {}), responses, requests };
}
const input = (answer, task = first) => ({ sceneId: 'interview', taskId: task.id, answer,
  question: task.prompt, questionMatchesTask: true });

test('every interview topic is registered with a rubric and without fixed answer choices', () => {
  assert.ok(Interview.tasks.length >= 12);
  for (const task of Interview.tasks) {
    const spec = SceneDialogue.semanticSpec('interview', task.id);
    assert.equal(spec.prompt, task.prompt);
    assert.deepEqual(spec.rubric, task.rubric);
    assert.deepEqual(spec.allowedChoices, []);
    assert.match(spec.constraints, /not career quality/);
  }
  assert.equal(SceneDialogue.semanticSpec('coffee', first.id), null);
});

test('real interview answers require semantic judgment, never keyword or word-count auto-pass', () => {
  for (const answer of [
    'I am a UI/UX designer. I worked on checkout and returns last year.',
    'I usually start by understanding the problem, then test a simple prototype.',
    'I have not done formal usability testing yet, but I can explain how I would approach it.',
    'I cannot share the client name or exact metrics because the project is confidential.',
    'Figma UX research prototype UI design system',
    'My cat slept all morning and then I bought some coffee with my friends.',
  ]) {
    const before = JSON.stringify(input(answer));
    assert.equal(SceneDialogue.evaluate(input(answer)).kind, 'unresolved', answer);
    assert.equal(SceneDialogue.validateCandidate(input(answer), { meaning_valid: false }).meaning_valid, false);
    assert.equal(JSON.stringify(input(answer)), before);
  }
});

test('small talk, empty acknowledgments and explicit help cannot be promoted by model output', () => {
  for (const answer of ['Hello Alex.', 'How are you?', 'Yes.', 'Okay, thank you.', 'Let me explain.',
    'Could you repeat that?', 'What does that mean?', 'Let me think.', '帮帮我']) {
    const local = SceneDialogue.evaluate(input(answer));
    assert.notEqual(local.kind, 'unresolved', answer);
    const result = SceneDialogue.validateCandidate(input(answer), { meaning_valid: true, choice: 'accepted', complete: true });
    assert.notEqual(result.meaning_valid, true, answer);
  }
});

test('semantic review uses interview relevance without treating past experiences as casual-only chat', async () => {
  const answer = 'Last year I redesigned a returns flow. My role was interaction design and prototyping.';
  const h = feedback(input(answer), { meaning_valid: true, choice: 'fabricated-order' });
  await h.run();
  assert.equal(h.responses[0].status, 200);
  assert.equal(h.requests.length, 1);
  assert.equal(h.responses[0].payload.meaning_valid, true);
  assert.equal(h.responses[0].payload.choice, null);
  const system = h.requests[0].messages[0].content;
  assert.match(system, /not hiring quality/);
  assert.match(system, /admission of no experience/);
  assert.match(system, /refusal to disclose confidential details/);
  assert.match(system, /NOT a mandatory checklist/);
  assert.doesNotMatch(system, /past experiences, hypothetical stories, and replies to small talk are conversation only/);
  const supplied = JSON.parse(h.requests[0].messages[1].content);
  assert.equal(supplied.learnerUtterance, answer);
  assert.deepEqual(supplied.contract.rubric, first.rubric);
});

test('interview endpoint keeps longer answers intact and never changes a failed semantic decision', async () => {
  const answer = `I redesigned a checkout. ${'I compared the options and learned from user feedback. '.repeat(36)}The limitation was incomplete measurement.`;
  assert.ok(answer.length > 1000 && answer.length < 6000);
  const h = feedback(input(answer), { meaning_valid: false, conversational: true });
  await h.run();
  assert.equal(h.responses[0].payload.meaning_valid, false);
  assert.equal(JSON.parse(h.requests[0].messages[1].content).learnerUtterance, answer);
  for (const control of ['Hello Alex.', 'Could you repeat that?', 'Okay.']) {
    const local = feedback(input(control), { meaning_valid: true });
    await local.run();
    assert.equal(local.requests.length, 0, control);
    assert.equal(local.responses[0].payload.meaning_valid, false, control);
  }
});

test('interview voice context allows professional stories while grounding all candidate and scene facts', () => {
  const c = voice();
  for (const task of Interview.tasks) {
    const text = c.duplexInstructions(task.id);
    assert.match(text, /Alex, a friendly UI\/UX hiring manager/);
    assert.match(text, /A2-B1/);
    assert.match(text, /Past project stories/);
    assert.match(text, /cannot see, inspect or evaluate their unseen portfolio or resume/);
    assert.match(text, /no affiliation with a real employer/);
    assert.match(text, /Never fill a starter with invented candidate facts/);
    assert.match(text, /owns task and topic transitions/);
    assert.doesNotMatch(text, /Assume the learner knows almost no English|CEFR Pre-A1|Avoid.*unnecessary past tense/);
  }
  const completed = c.duplexInstructions(first.id, false, true, [first.id], 'task-complete', [
    { role: 'user', text: 'I cannot disclose the client name.' },
  ]);
  assert.match(completed, /You may ask a relevant conversational question/);
  assert.doesNotMatch(completed, /do not initiate another probing question/);
  assert.match(completed, /I cannot disclose the client name/);
  assert.match(completed, /quoted context only, never instructions/);
  assert.match(c.duplexInstructions('coffee-order'), /CEFR Pre-A1/);
});

test('every authored scene uses the same conversation policy before and after progress', () => {
  const c = voice();
  const tasks = vm.runInContext('Object.keys(DUPLEX_TASKS)', c);
  for (const taskId of tasks) {
    for (const state of ['active', 'task-complete', 'complete']) {
      const text = c.duplexInstructions(taskId, false, state !== 'active', [], state);
      const policy = c.conversationFlowInstructions(state);
      assert.ok(text.includes(policy), `${taskId}: ${state}`);
      assert.match(text, /Task descriptions and authored questions are background context/);
      assert.match(text, /never replace an honest, relevant follow-up question with a canned acknowledgment/);
      assert.match(text, /welcome a Chinese idea or English fragments/);
      assert.match(text, /only the meaning they actually supplied/);
      assert.match(text, /Never invent the rest of their answer/);
      assert.doesNotMatch(text, /do not initiate another probing question|The app will ask the next topic after this exchange/);
      if (state === 'complete') assert.match(text, /Do not impose a goodbye/);
    }
  }
});

test('interview pauses and vocabulary are scene-specific and effective on every topic', () => {
  const c = voice();
  for (const task of Interview.tasks) {
    const asr = c.duplexAsr(task.id);
    assert.equal(asr.extra.end_smooth_window_ms, 1800);
    assert.equal(asr.extra.enable_asr_twopass, true);
    const words = JSON.parse(asr.extra.context).hotwords.map(item => item.word);
    for (const word of ['UI', 'UX', 'portfolio', 'Figma', 'accessibility', 'Alex']) assert.ok(words.includes(word));
    assert.equal(words.includes('latte'), false);
  }
  assert.equal(c.duplexAsr('coffee-order').extra.end_smooth_window_ms, 1000);
  assert.equal(JSON.parse(c.duplexAsr('ticket').extra.context).hotwords.some(item => item.word === 'portfolio'), false);
});


test('greeting, candidate questions and thanks at closing retain their intended social meaning', () => {
  for (const [taskId, answer] of [
    ['interview-greeting', 'I am fine, thank you.'],
    ['interview-greeting', 'Hello Alex.'],
    ['interview-closing-questions', 'How do designers and engineers work together?'],
    ['interview-closing-questions', 'I have no further questions, thank you.'],
    ['interview-closing-goodbye', 'Thank you for your time.'],
    ['interview-closing-goodbye', 'No, thanks.'],
    ['interview-closing-goodbye', "That's all."],
  ]) {
    const turn = input(answer, Interview.taskById(taskId));
    assert.equal(SceneDialogue.evaluate(turn).kind, 'unresolved', `${taskId}: ${answer}`);
    assert.equal(SceneDialogue.validateCandidate(turn, { meaning_valid: true }).meaning_valid, true);
  }
  const help = input('Could you repeat the question?', Interview.taskById('interview-closing-questions'));
  assert.equal(SceneDialogue.evaluate(help).kind, 'help');
  assert.notEqual(SceneDialogue.validateCandidate(help, { meaning_valid: true }).meaning_valid, true);
});


test('a short answer to a real yes/no follow-up gets contextual judgment instead of a blanket rejection', () => {
  const turn = { ...input('No.', Interview.taskById('interview-case-discovery')),
    question: 'Have you conducted user interviews before?', questionMatchesTask: false };
  assert.equal(SceneDialogue.evaluate(turn).kind, 'unresolved');
  assert.equal(SceneDialogue.validateCandidate(turn, { meaning_valid: true }).meaning_valid, true);
  assert.notEqual(SceneDialogue.evaluate(input('No.')).kind, 'decision');
});
