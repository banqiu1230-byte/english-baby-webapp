const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Interview = require('./interview.js');

test('interview missions form six detailed practices and one reusable full mock', () => {
  assert.deepEqual(Interview.missions.map(item => item.id), ['I01', 'I02', 'I03', 'I04', 'I05', 'I06', 'I07']);
  const allIds = Interview.tasks.map(item => item.id);
  assert.equal(new Set(allIds).size, allIds.length);
  assert.equal(allIds.length, 31);
  const authored = new Set();
  for (const mission of Interview.missions) {
    for (const key of ['title', 'goal', 'description', 'duration']) assert.ok(mission[key]?.trim(), `${mission.id}: ${key}`);
    assert.equal(new Set(mission.taskIds).size, mission.taskIds.length);
    assert.deepEqual(Interview.tasksFor(mission.id).map(item => item.id), mission.taskIds);
    assert.ok(Interview.tasksFor(mission.id).every(Boolean));
    if (mission.id !== 'I07') {
      assert.ok(mission.taskIds.length >= 4 && mission.taskIds.length <= 6);
      mission.taskIds.forEach(id => authored.add(id));
    }
  }
  assert.deepEqual([...authored], allIds);
  const full = Interview.getMission('I07');
  assert.ok(full.taskIds.length >= 12 && full.taskIds.length <= 16);
  assert.ok(full.taskIds.every(id => authored.has(id)), 'mock reuses learning targets rather than duplicating them');
  assert.equal(full.taskIds[0], 'interview-greeting');
  assert.deepEqual(full.taskIds.slice(-2), ['interview-closing-questions', 'interview-closing-goodbye']);
});

test('interview progress labels stay compact and reuse topic metadata across missions', () => {
  for (const item of Interview.tasks) {
    assert.match(item.progressLabel, /^[\u4e00-\u9fffA-Za-z]{2,5}$/, `${item.id}: compact readable progress label`);
  }
  for (const mission of Interview.missions) {
    const labels = Interview.tasksFor(mission.id).map(item => item.progressLabel);
    assert.equal(new Set(labels).size, labels.length, `${mission.id}: visible topics stay distinguishable`);
  }
  assert.deepEqual(Interview.tasksFor('I01').map(item => item.progressLabel), ['寒暄', '背景', '职责', '优势', '项目']);
  for (const item of Interview.tasksFor('I07')) {
    assert.equal(item, Interview.taskById(item.id), `${item.id}: the full mock uses the same topic metadata`);
  }
});

test('all interview steps expose speech prompts and honest progressive help', () => {
  for (const item of Interview.tasks) {
    assert.match(item.id, /^interview-[a-z-]+$/);
    assert.equal(item.speaker, 'Alex');
    assert.equal(item.interaction, 'speech');
    assert.equal(item.requiresAction, false);
    assert.equal(item.requiresSpeech, true);
    for (const field of ['label', 'prompt', 'targetId', 'rubric', 'hint']) assert.ok(item[field]?.trim(), `${item.id}: ${field}`);
    for (const field of ['meaning', 'starter', 'model']) assert.ok(item.support[field]?.trim(), `${item.id}: support.${field}`);
    assert.ok(item.keywords.length > 0);
    assert.deepEqual(Interview.learningDetails[item.id], [item.targetId, item.label, item.support.meaning, item.support.model, item.hint]);
    assert.ok(item.followup === null || typeof item.followup === 'string');
    // Scaffolds may ask for real facts but must not invent the user's CV.
    assert.doesNotMatch(item.support.model, /\b(?:six|6) years|Pinduoduo|Temu|\d+%|increased (?:sales|conversion) by/i);
  }
});

test('interview help offers readable filled examples and precise replaceable phrases', () => {
  const conciseIds = new Set(['interview-greeting', 'interview-closing-goodbye']);
  const plans = new Set();
  for (const item of Interview.tasks) {
    const support = Interview.supportFor(item.id);
    assert.equal(support, item.support, `${item.id}: shared help contract`);
    assert.equal(Interview.supportFor(item), support);
    assert.equal(support.responseMode, conciseIds.has(item.id) ? 'concise' : 'structured');
    assert.match(support.meaning, /[\u4e00-\u9fff]/, `${item.id}: Chinese meaning`);
    assert.equal(support.answerStarter, support.starter, `${item.id}: all starter paths share one example`);
    for (const [textKey, highlightsKey] of [['answerStarter', 'answerStarterHighlights'], ['model', 'modelHighlights']]) {
      const text = support[textKey], highlights = support[highlightsKey];
      assert.doesNotMatch(text, /[\[\]_…]|\.\.\./, `${item.id}: ${textKey} can be read without filling blanks`);
      assert.ok(Array.isArray(highlights), `${item.id}: ${highlightsKey} is explicit`);
      assert.equal(new Set(highlights).size, highlights.length, `${item.id}: distinct replaceable phrases`);
      const ranges = highlights.map(phrase => {
        assert.ok(phrase.trim(), `${item.id}: nonempty highlight`);
        const start = text.indexOf(phrase);
        assert.ok(start >= 0, `${item.id}: ${phrase} exactly matches its example`);
        return [start, start + phrase.length];
      }).sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < ranges.length; i += 1) {
        assert.ok(ranges[i][0] >= ranges[i - 1][1], `${item.id}: highlights do not overlap`);
      }
    }
    if (support.responseMode === 'concise') {
      assert.deepEqual(support.answerPlan, [], `${item.id}: no unnecessary answer outline`);
      continue;
    }
    assert.ok(support.answerPlan.length >= 2 && support.answerPlan.length <= 3, `${item.id}: short plan`);
    assert.equal(new Set(support.answerPlan).size, support.answerPlan.length);
    for (const point of support.answerPlan) assert.match(point, /[\u4e00-\u9fff]/, `${item.id}: understandable answer step`);
    const plan = support.answerPlan.join(' ');
    assert.ok(!plans.has(plan), `${item.id}: task-specific plan, not repeated generic advice`);
    plans.add(plan);
    assert.match(support.answerStarter, /^[A-Za-z].*[.!?]$/, `${item.id}: complete spoken start`);
    assert.ok(support.answerStarterHighlights.length > 0, `${item.id}: editable start is marked`);
    assert.ok(support.modelHighlights.length > 0, `${item.id}: editable full example is marked`);
    assert.match(item.hint, /虚构示例供跟读；紫色内容可换成你的经历/, `${item.id}: example is not the learner's biography`);
    assert.doesNotMatch(item.hint, /方括号|填空/);
    assert.ok(support.answerStarter.length < 125, `${item.id}: one manageable start`);
    assert.notEqual(support.answerStarter, support.model, `${item.id}: full model remains separate`);
    assert.doesNotMatch(`${plan} ${support.answerStarter} ${support.model}`, /\b(?:six|6) years|Pinduoduo|Temu|\d+%|increased (?:sales|conversion) by/i);
  }
  assert.equal(plans.size, 29);
  const mockProblem = Interview.tasksFor('I07').find(item => item.id === 'interview-case-problem');
  assert.equal(Interview.supportFor(mockProblem), Interview.taskById('interview-case-problem').support);
});

test('answer scaffolds support honest limits and focus on the actual question', () => {
  const plan = id => Interview.supportFor(`interview-${id}`).answerPlan.join(' ');
  assert.match(plan('ownership'), /亲自负责/);
  assert.match(plan('ownership'), /别人负责/);
  assert.match(plan('case-discovery'), /没做调研/);
  assert.match(plan('case-evidence'), /尚未上线或未测量/);
  assert.match(plan('case-evidence'), /不要补造数字/);
  assert.match(plan('collab-partners'), /没有正式团队/);
  assert.match(plan('collab-disagreement'), /假设/);
  assert.match(plan('ai-use'), /没用过也完全可以/);
  assert.match(Interview.supportFor('interview-ai-use').answerStarter, /would try/);
  assert.match(plan('ai-quality'), /实际操作/);
  assert.match(plan('ai-boundaries'), /不要提供真实机密/);
  assert.match(plan('closing-questions'), /没有问题/);
  assert.match(Interview.supportFor('interview-closing-questions').answerStarter, /\?$/);
  assert.match(Interview.instructionsFor('interview-ownership'), /not factual content about the learner or a checklist to complete/);
  assert.match(Interview.instructionsFor('interview-ownership'), /fictional mobile-shopping refund project/);
  assert.match(Interview.instructionsFor('interview-ownership'), /do not treat any example detail as their experience/);
  assert.doesNotMatch(Interview.instructionsFor('interview-ownership'), /Bracketed text/);
});

test('unknown tasks do not acquire a fake interview identity; mission fallback is deterministic', () => {
  assert.equal(Interview.isTask('coffee-order'), false);
  assert.equal(Interview.taskById('interview-fake'), null);
  assert.equal(Interview.instructionsFor('interview-fake'), '');
  for (const value of [null, undefined, 'coffee-order', 'interview-fake', {}, { id: 'interview-fake' }]) {
    assert.equal(Interview.supportFor(value), null);
  }
  assert.equal(Interview.getMission('not-a-mission').id, 'I01');
  assert.equal(Interview.getMission().id, 'I01');
  assert.equal(Interview.tasksFor()[0].id, 'interview-greeting');
});

test('routing separates explicit assistance and interview controls from substantive open answers', () => {
  const controls = {
    empty: ['', '   '],
    repeat: ['Could you repeat that?', 'Repeat, please.', 'Sorry, could you repeat the question?', '没听清', '请重复一下'],
    slower: ['Could you speak more slowly?', 'Slow down, please.', '说慢一点'],
    clarify: ['What does constraint mean?', 'What does personal response before what means?',
      'What does personally responsible for means?', 'What means responsible for?',
      'What is the meaning of responsible for?', 'What do you mean by success?', "I don't understand the question.", '解释一下', '这是什么意思'],
    help: ['Could you give me an example?', 'Could you please help me answer?', 'Give me a hint.', 'How can I say this?', '给我一个提示'],
    pause: ['Let me think.', 'Can we take a short break?', '等一下'],
    skip: ['Could we skip this question?', 'Move on to the next question.', '下一题'],
    stop: ['Could we stop here?', 'End the interview.', '结束练习'],
  };
  for (const [expected, utterances] of Object.entries(controls)) {
    for (const utterance of utterances) assert.equal(Interview.classifyTurn(utterance), expected, utterance);
  }
  for (const text of [
    'How do designers and engineers work together?',
    'Could you tell me about the role?',
    'Can you share an example of a team challenge?',
    "I don't know the impact because we haven't measured it yet.",
    'I would ask users to explain their problem before deciding.',
    'We decided to stop the experiment after checking the feedback.',
    'Let me think. I would begin with the biggest risk.',
    'I asked my colleague to slow down and explain her concern.',
    'No, I have no questions.',
    'Thanks for your time.',
    '这个项目还没有上线，所以我暂时没有结果数据。',
  ]) assert.equal(Interview.classifyTurn(text), 'answer', text);
});

test('interview guidance allows uncertainty and does not turn rubrics into answer gates', () => {
  const rules = Interview.instructionsFor('interview-case-evidence');
  for (const required of [
    'one question at a time', 'Do not demand a model answer', 'a minimum length',
    'at most one', 'Never repeat the same question in a loop',
    'Skipping or stopping is allowed', 'must not be recorded as demonstrated skill',
    'Do not invent candidate credentials', 'Do not claim to see a portfolio',
    'Do not force a number',
  ]) assert.ok(rules.toLowerCase().includes(required.toLowerCase()), required);
  assert.match(Interview.taskById('interview-case-evidence').support.model, /not measured the impact yet/);
  assert.match(Interview.taskById('interview-judgment-framing').rubric, /Clarifying questions are valid/);
  assert.match(Interview.taskById('interview-ai-use').rubric, /non-use/);
});

test('candidate questions and the closing retain natural conversation semantics', () => {
  const questions = Interview.instructionsFor('interview-closing-questions');
  assert.match(questions, /question IS the answer/);
  assert.match(questions, /Respond to it naturally/);
  assert.match(questions, /having no questions is also valid/);
  const closing = Interview.instructionsFor('interview-closing-goodbye');
  assert.match(closing, /without starting a new question/);
  assert.match(closing, /Do not promise real hiring next steps/);
  assert.equal(Interview.taskById('interview-closing-goodbye').followup, null);
});

test('interview browser and CommonJS exports share the same catalog without DOM dependencies', () => {
  const browser = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('./dialogue-rules.js'), 'utf8'), browser);
  vm.runInNewContext(fs.readFileSync(require.resolve('./interview.js'), 'utf8'), browser);
  assert.ok(browser.Interview);
  assert.equal(browser.Interview.tasks.length, Interview.tasks.length);
  assert.deepEqual(Array.from(browser.Interview.getMission('I07').taskIds), Interview.getMission('I07').taskIds);
  assert.equal(browser.Interview.classifyTurn('Could you repeat that?'), 'repeat');
  assert.deepEqual(JSON.parse(JSON.stringify(browser.Interview.supportFor('interview-ownership'))), Interview.supportFor('interview-ownership'));
  assert.equal(browser.Interview.supportFor(browser.Interview.taskById('interview-greeting')).responseMode, 'concise');
});
