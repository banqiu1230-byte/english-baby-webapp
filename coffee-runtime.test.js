const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./test-support/voice-harness.cjs');
const Coffee = require('./coffee');

function coffeeHarness() {
  const goal = {}, evidence = [], checkpoints = [], pictures = [];
  const h = harness({ currentGoalRecord: () => goal,
    goalRecord: () => goal,
    markGoalSpokenFor: (_taskId, text) => h.effects.push({ type: 'scored', text }),
    speak: text => { h.effects.push({ type: 'spoken', text }); return Promise.resolve(true); },
    LumaExperience: { noteAnswer: (...args) => evidence.push(args), checkpoint: () => checkpoints.push(true) },
    LumaVisuals: { render: () => pictures.push(true) } });
  h.s.selectedScene = 'coffee'; h.s.coffee = Coffee.initial(); h.s.taskIndex = 0;
  h.task.id = 'coffee-order'; h.task.requiresAction = false;
  h.load('coffeeTaskForChangedField', 'recordCoffeeMissionEvidence', 'commitCoffeeChoice', 'applyDynamicFeedback');
  return { ...h, goal, evidence, checkpoints, pictures };
}
test('coffee client rejects a typed choice without mutating progress or evidence', () => {
  const h = coffeeHarness();
  assert.equal(h.c.commitCoffeeChoice('latte', {source:'text', utterance:'Latte, please.'}), false);
  assert.equal(h.s.coffee.drink, null); assert.equal(h.s.speechDone, false);
  assert.equal(h.goal.meaningAccepted, undefined);
  assert.equal(h.effects.filter(e => e.type === 'scored').length, 0);
  assert.equal(h.evidence.length, 0); assert.equal(h.pictures.length, 0); assert.equal(h.checkpoints.length, 0);
});
test('coffee accepts actual voice but rejects click, empty, wrong scene and skipped-step progression', () => {
  const h = coffeeHarness();
  assert.equal(h.c.commitCoffeeChoice('latte', {source:'tap',utterance:'latte'}), false);
  assert.equal(h.c.commitCoffeeChoice('latte', {source:'voice',utterance:''}), false);
  h.task.id = 'coffee-size';
  assert.equal(h.c.commitCoffeeChoice('large', {source:'voice',utterance:'Large.'}), false);
  h.task.id = 'coffee-order'; h.s.selectedScene = 'kitchen';
  assert.equal(h.c.commitCoffeeChoice('latte', {source:'voice',utterance:'Latte.'}), false);
  h.s.selectedScene = 'coffee';
  assert.equal(h.c.commitCoffeeChoice('latte', {source:'voice',utterance:'Latte.'}), true);
  assert.equal(h.s.coffee.drink, 'latte'); assert.equal(h.s.speechDone, true);
  assert.equal(h.goal.meaningAccepted, true);
  assert.equal(h.effects.filter(e => e.type === 'scored').length, 1);
  assert.equal(h.pictures.length, 1); assert.equal(h.checkpoints.length, 1);
});

test('a resolved coffee step does not publish the next question before the task changes', () => {
  const h = coffeeHarness();
  h.s.currentSpeech = 'Would you like a latte or an americano?';
  h.s.activeQuestion = h.s.currentSpeech;
  assert.equal(h.c.commitCoffeeChoice('americano', { source: 'voice', utterance: 'Americano.' }), true);
  assert.equal(h.s.coffee.drink, 'americano');
  assert.equal(h.s.currentSpeech, 'Would you like a latte or an americano?');
  assert.equal(h.s.activeQuestion, 'Would you like a latte or an americano?');
});
test('coffee feedback cannot mutate a restarted practice, edited answer or impossible choice', () => {
  const h = coffeeHarness(), message = {id:4,speaker:'user',text:'Latte.',revision:1,final:true};
  h.s.dialogueHistory = [message];
  const context = {messageId:4,revision:1,answer:'Latte.',practiceSession:h.s.practiceSession,sceneId:'coffee',taskId:'coffee-order',taskIndex:h.s.taskIndex,source:'voice',question:'Would you like a latte or an americano?'};
  h.c.applyDynamicFeedback({meaning_valid:true,choice:'latte'}, {...context,practiceSession:context.practiceSession - 1});
  h.c.applyDynamicFeedback({meaning_valid:true,choice:'latte'}, {...context,revision:0});
  h.c.applyDynamicFeedback({meaning_valid:true,choice:'large'}, context);
  assert.equal(h.s.coffee.drink, null); assert.equal(h.evidence.at(-1)[1], 'unconfirmed');
  h.c.applyDynamicFeedback({meaning_valid:true,choice:'latte'}, context);
  assert.equal(h.s.coffee.drink, 'latte'); assert.equal(h.evidence.at(-1)[1], 'success');
});

test('noticing the C03 error keeps the delivery wrong and asks for the missing repair fact', () => {
  const h = coffeeHarness();
  h.s.coffee = Coffee.missionInitial('C03');
  h.s.coffeeMissionId = 'C03';
  h.task.id = 'coffee-size';
  const message = { id: 7, speaker: 'user', text: 'No, this is wrong.', revision: 1, final: true };
  h.s.dialogueHistory = [message];
  const context = { messageId: 7, revision: 1, answer: message.text, practiceSession: h.s.practiceSession,
    sceneId: 'coffee', taskId: 'coffee-size', taskIndex: h.s.taskIndex, source: 'voice', question: 'Is everything okay?' };
  const missionResult = Coffee.advanceMission(h.s.coffee, message.text);
  h.c.applyDynamicFeedback({ meaning_valid: false, missionResult }, context);
  assert.equal(h.s.coffee.delivered.size, 'large');
  assert.equal(h.evidence.at(-1)[1], 'unconfirmed');
  assert.deepEqual(h.effects.find(effect => effect.type === 'spoken'), { type: 'spoken', text: 'What size did you order?' });
});

test('a coffee side question stays in the conversation instead of replaying the task prompt', () => {
  const h = coffeeHarness();
  h.s.coffee = Coffee.advanceMission(h.s.coffee, 'Americano.').world;
  h.task.id = 'coffee-size';
  h.s.taskIndex = 1;
  const message = { id: 8, speaker: 'user', text: '这问题你问过了吗？', revision: 1, final: true };
  h.s.dialogueHistory = [message];
  const context = { messageId: 8, revision: 1, answer: message.text, practiceSession: h.s.practiceSession,
    sceneId: 'coffee', taskId: 'coffee-size', taskIndex: 1, source: 'voice', question: 'Would you like a small or a large americano?' };
  const missionResult = Coffee.advanceMission(h.s.coffee, message.text);
  h.c.applyDynamicFeedback({ meaning_valid: false, missionResult }, context);
  assert.equal(h.s.coffee.size, null);
  assert.equal(message.status, '继续当前对话');
  assert.equal(h.effects.some(effect => effect.type === 'spoken'), false);
});

test('a coffee help result never cancels the natural reply to repeat the task prompt', () => {
  for (const utterance of ['我还是没听懂', '我不知道怎么说才好', 'What does americano mean?']) {
    const h = coffeeHarness();
    const message = { id: 9, speaker: 'user', text: utterance, revision: 1, final: true };
    h.s.dialogueHistory = [message];
    const context = { messageId: 9, revision: 1, answer: utterance, practiceSession: h.s.practiceSession,
      sceneId: 'coffee', taskId: 'coffee-order', taskIndex: h.s.taskIndex, source: 'voice',
      question: 'Would you like a latte or an americano?' };
    const missionResult = Coffee.advanceMission(h.s.coffee, utterance);
    assert.equal(missionResult.reason, 'help', utterance);
    h.c.applyDynamicFeedback({ meaning_valid: false, missionResult }, context);
    assert.equal(h.s.coffee.drink, null, utterance);
    assert.equal(message.status, '继续当前对话', utterance);
    assert.equal(h.effects.some(effect => effect.type === 'spoken'), false, utterance);
  }
});

test('a clear next-step answer spoken during the previous acknowledgment is rebound once', () => {
  const tasks = Coffee.tasks.map(task => ({ ...task }));
  const h = harness({
    currentSceneConfig: () => ({ tasks }),
    requestLanguageFeedback: (question, answer, context) => h.effects.push({ type: 'rebound', question, answer, context }),
  });
  h.load('coffeeTaskForChangedField', 'stageTransitionUtterance', 'consumeTransitionUtterance');
  h.s.selectedScene = 'coffee';
  h.s.coffee = Coffee.advanceMission(Coffee.missionInitial('C01'), 'Americano.').world;
  h.s.coffeeMissionId = 'C01';
  h.s.taskIndex = 0;
  h.s.stage = 'task-complete';
  h.s.coveredGoals = new Set(['coffee-order']);
  h.task.id = 'coffee-order';
  h.task.requiresAction = false;

  const turn = h.c.acceptTranscriptEvent({ item_id: 'early-size' }, { allowStart: true });
  h.c.finalizeLearnerTranscript('Large.', { turn });
  const message = h.s.dialogueHistory[0];
  assert.equal(message.text, 'Large.');
  assert.equal(message.taskId, 'coffee-order');
  assert.equal(message.status, '已听到 · 下一步出现后确认');
  assert.equal(h.s.pendingTransitionUtterance.taskId, 'coffee-size');
  assert.equal(h.s.expectedResponse, null, 'the obsolete transition response must not keep advancement busy');
  assert.equal(h.effects.some(effect => effect.type === 'feedback' || effect.type === 'rebound'), false);

  h.task.id = 'coffee-size';
  h.s.taskIndex = 1;
  h.s.stage = 'active';
  h.s.activeQuestion = 'Would you like a small or a large americano?';
  assert.equal(h.c.consumeTransitionUtterance(), true);
  assert.equal(message.taskId, 'coffee-size');
  assert.equal(message.status, '已接到下一步 · 正在确认');
  assert.equal(h.effects.filter(effect => effect.type === 'rebound').length, 1);
  const rebound = h.effects.find(effect => effect.type === 'rebound');
  assert.equal(rebound.question, 'Would you like a small or a large americano?');
  assert.equal(rebound.answer, 'Large.');
  assert.equal(rebound.context.taskId, 'coffee-size');
  assert.equal(rebound.context.messageId, message.id);
  assert.equal(rebound.context.final, true);
  assert.equal(h.c.consumeTransitionUtterance(), false);
  assert.equal(h.effects.filter(effect => effect.type === 'rebound').length, 1);
});

test('a confirmed coffee step cancels a runaway provider reply immediately', () => {
  const h = coffeeHarness();
  h.s.coffee = Coffee.missionInitial('C04', 'C04-large-americano-here');
  h.s.coffeeMissionId = 'C04';
  h.c.beginExpectedResponse('user');
  h.s.expectedResponse.responseId = 'runaway';
  Object.assign(h.s, { duplexSpeaking: true, duplexAcceptAudio: true, awaitingModelReply: true });
  const result = Coffee.advanceMission(h.s.coffee, 'Americano.');
  assert.equal(h.c.commitCoffeeChoice('americano', {
    source: 'voice', utterance: 'Americano.', missionFeedback: result,
  }), true);
  assert.equal(h.s.coffee.drink, 'americano');
  assert.equal(h.s.expectedResponse, null);
  assert.equal(h.s.duplexSpeaking, false);
  assert.equal(h.s.duplexAcceptAudio, false);
  assert.equal(h.c.isConversationTurnPending(), false);
});

test('a partly matching target order keeps correct facts and labels only the conflict', () => {
  const h = coffeeHarness();
  h.s.coffee = Coffee.missionInitial('C04', 'C04-large-latte-to-go');
  h.s.coffeeMissionId = 'C04';
  const message = { id: 21, speaker: 'user', text: 'A large latte for here.', revision: 1, final: true };
  h.s.dialogueHistory = [message];
  const context = { messageId: 21, revision: 1, answer: message.text, practiceSession: h.s.practiceSession,
    sceneId: 'coffee', taskId: 'coffee-order', taskIndex: 0, source: 'voice', question: 'What can I get for you?' };
  const missionResult = Coffee.advanceMission(h.s.coffee, message.text);
  h.c.applyDynamicFeedback({ meaning_valid: true, missionResult }, context);
  assert.deepEqual([h.s.coffee.drink, h.s.coffee.size, h.s.coffee.service], ['latte', 'large', null]);
  assert.equal(message.taskAccepted, true);
  assert.equal(message.status, '已确认 2 项 · 堂食或带走再试一次');
});

test('saying for here against a to-go target stays on service and is never confirmed', () => {
  const h = coffeeHarness();
  h.s.coffee = Coffee.advanceMission(
    Coffee.missionInitial('C04', 'C04-large-americano-to-go'),
    'A large americano.',
  ).world;
  h.s.coffeeMissionId = 'C04';
  h.s.taskIndex = 2;
  h.task.id = 'coffee-service';
  const message = { id: 22, speaker: 'user', text: 'For here.', revision: 1, final: true };
  h.s.dialogueHistory = [message];
  const context = { messageId: 22, revision: 1, answer: message.text, practiceSession: h.s.practiceSession,
    sceneId: 'coffee', taskId: 'coffee-service', taskIndex: 2, source: 'voice',
    question: 'Is that for here or to go?' };
  const missionResult = Coffee.advanceMission(h.s.coffee, message.text);
  h.c.applyDynamicFeedback({ meaning_valid: false, missionResult }, context);
  assert.equal(h.s.coffee.service, null);
  assert.equal(Coffee.nextMissionStep(h.s.coffee).taskId, 'coffee-service');
  assert.equal(message.taskAccepted, false);
  assert.equal(message.status, '堂食或带走与任务不一致 · 再试一次');
  assert.deepEqual(h.effects.find(effect => effect.type === 'spoken'), {
    type: 'spoken', text: 'Please check the order. Is it for here or to go?',
  });
});

test('resume reconciliation never marks a conflicting target field complete', () => {
  const h = coffeeHarness();
  h.load('resolvedCoffeeTaskIds');
  const stale = { ...Coffee.missionInitial('C04', 'C04-large-americano-here'),
    drink: 'americano', size: 'large', service: 'to-go' };
  assert.deepEqual([...h.c.resolvedCoffeeTaskIds(stale)], ['coffee-order', 'coffee-size']);
});
