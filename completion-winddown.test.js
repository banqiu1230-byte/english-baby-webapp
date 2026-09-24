const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./test-support/voice-harness.cjs');

// Replay the actual completion scheduler with a controlled clock. This checks
// turn ownership and the visible review outcome; it does not use a microphone.
function completedScene() {
  let h;
  h = harness({
    showReview() {
      h.effects.push({ type: 'review' });
      h.s.sceneStarted = false;
      h.c.experience.classList.remove('is-active');
    },
  });
  h.load('clearReviewTransition', 'latestFollowupText', 'scheduleReview');
  Object.assign(h.s, {
    selectedScene: 'coffee', stage: 'complete', completed: true,
    dialogueHistory: [
      { speaker: 'user', text: 'Thanks.', final: true },
      { speaker: 'luma', text: 'Enjoy your coffee. Take care!', final: true },
    ],
  });
  return h;
}

const reviews = h => h.effects.filter(effect => effect.type === 'review').length;

test('a completed conversation moves to review once after five quiet seconds', async () => {
  const h = completedScene();
  h.c.scheduleReview();
  await h.advance(4999);
  assert.equal(reviews(h), 0);
  await h.advance(181);
  assert.equal(reviews(h), 1);
  await h.advance(10000);
  assert.equal(reviews(h), 1, 'a settled conversation must not open review twice');
});

test('unfinished steps and a departed scene cannot auto-open review', async () => {
  for (const stage of ['active', 'task-complete']) {
    const h = completedScene();
    h.s.stage = stage;
    h.c.scheduleReview();
    await h.advance(10000);
    assert.equal(reviews(h), 0, stage);
    assert.equal(h.s.reviewTimer, null, stage);
  }
  for (const leave of [h => h.c.experience.classList.remove('is-active'), h => { h.s.sceneStarted = false; }]) {
    const h = completedScene();
    h.c.scheduleReview();
    await h.advance(2000);
    leave(h);
    await h.advance(10000);
    assert.equal(reviews(h), 0);
    assert.equal(h.s.reviewTimer, null);
  }
});

test('pending speech, recognition, reply and playback each postpone the full quiet interval', async () => {
  const pendingStates = [
    ['local speech', { localSpeechActive: true }],
    ['learner turn', { userTurnActive: true }],
    ['transcription', { userTranscriptPending: true }],
    ['unsettled transcript', { activeVoiceTurn: { id: 'in-flight' } }],
    ['NPC reply', { awaitingModelReply: true }],
    ['prompt', { awaitingPrompt: true }],
    ['response stream', { expectedResponse: { kind: 'user' } }],
    ['audio stream', { duplexAcceptAudio: true }],
    ['scheduled audio', { duplexPlayerContext: { currentTime: 0 }, duplexNextPlayTime: 10 }],
    ['deferred event', { deferredVoiceEvents: [{ type: 'asr' }] }],
  ];
  for (const [label, fields] of pendingStates) {
    const h = completedScene();
    const original = Object.fromEntries(Object.keys(fields).map(key => [key, h.s[key]]));
    Object.assign(h.s, fields);
    h.c.scheduleReview();
    await h.advance(12000);
    assert.equal(reviews(h), 0, label);
    Object.assign(h.s, original);
    await h.advance(4999);
    assert.equal(reviews(h), 0, `${label}: do not count the busy interval as quiet`);
    await h.advance(300);
    assert.equal(reviews(h), 1, `${label}: completion resumes after the turn settles`);
  }
});

test('speaking again near the end of the countdown starts a fresh quiet interval', async () => {
  const h = completedScene();
  h.c.scheduleReview();
  await h.advance(4200);
  h.s.localSpeechActive = true;
  await h.advance(800);
  assert.equal(reviews(h), 0);
  h.s.localSpeechActive = false;
  h.s.dialogueHistory.push({ speaker: 'user', text: 'You too.', final: true },
    { speaker: 'luma', text: 'See you next time.', final: true });
  await h.advance(4999);
  assert.equal(reviews(h), 0);
  await h.advance(300);
  assert.equal(reviews(h), 1);
});

test('an unanswered NPC question keeps the conversation open, then closes after the reply', async () => {
  const h = completedScene();
  h.s.dialogueHistory.at(-1).text = 'Are you enjoying your day?';
  h.c.scheduleReview();
  await h.advance(30000);
  assert.equal(reviews(h), 0, 'the user should have time to answer the actual question');
  h.s.dialogueHistory.push({ speaker: 'user', text: 'Yes, thanks.', final: true },
    { speaker: 'luma', text: 'Glad to hear it. Take care!', final: true });
  await h.advance(4999);
  assert.equal(reviews(h), 0);
  await h.advance(300);
  assert.equal(reviews(h), 1);
});

test('continuous back-and-forth is not interrupted even though the task is complete', async () => {
  const h = completedScene();
  h.c.scheduleReview();
  for (let index = 0; index < 5; index += 1) {
    await h.advance(2400);
    h.s.localSpeechActive = true;
    await h.advance(600);
    h.s.localSpeechActive = false;
    h.s.awaitingModelReply = true;
    await h.advance(600);
    h.s.awaitingModelReply = false;
    h.s.dialogueHistory.push({ speaker: 'user', text: 'I like this place.', final: true },
      { speaker: 'luma', text: 'Happy to have you here.', final: true });
    assert.equal(reviews(h), 0, `conversation turn ${index + 1}`);
  }
  await h.advance(5300);
  assert.equal(reviews(h), 1);
});
