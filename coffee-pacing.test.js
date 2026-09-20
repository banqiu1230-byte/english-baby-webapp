const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./test-support/voice-harness.cjs');
const Coffee = require('./coffee');

// Use the app's scheduler and transcript handlers with a deterministic clock.
// These assertions exercise the interval the learner actually sees between
// an audible confirmation (or their "yes") and the next coffee question.
function transitionHarness() {
  const tasks = Coffee.tasks.map(task => ({ ...task }));
  const h = harness({
    TASK_ADVANCE_DWELL_MS: 1600,
    currentSceneConfig: () => ({ tasks }),
  });
  Object.assign(h.task, tasks[0], { requiresAction: false });
  Object.assign(h.s, {
    selectedScene: 'coffee', coffeeMissionId: 'C01', taskIndex: 0,
    coffee: Coffee.advanceMission(Coffee.missionInitial('C01'), 'Americano.').world,
    coveredGoals: new Set(['coffee-order']), stage: 'task-complete',
    speechDone: true, localSpeechActive: true,
    dialogueHistory: [
      { id: 1, speaker: 'user', text: 'Americano.', taskId: 'coffee-order', final: true },
      { id: 2, speaker: 'luma', text: 'Okay. An americano.', taskId: 'coffee-order' },
    ],
    messageSerial: 2,
  });
  h.load('latestFollowupText', 'clearTaskAdvance', 'scheduleTaskAdvance');
  let starts = 0;
  h.c.startTask = index => { assert.equal(index, 1); starts += 1; h.s.stage = 'active'; };
  return { h, started: () => starts };
}

test('coffee: next question waits for the acknowledgment to finish, then leaves a readable pause', async () => {
  const { h, started } = transitionHarness();
  h.c.scheduleTaskAdvance(1);
  await h.advance(2200);
  assert.equal(started(), 0, 'the next question cannot overlap the audible acknowledgment');

  h.s.localSpeechActive = false; // the acknowledgment has audibly ended
  await h.advance(1300);
  assert.equal(started(), 0, 'a pause shorter than 1.3 seconds still feels rushed');
  await h.advance(600);
  assert.equal(started(), 1, 'the next question should appear within about two seconds');
});

test('coffee: a completed-step yes gets one status and a pause before the next question', async () => {
  const { h, started } = transitionHarness();
  h.s.localSpeechActive = false;
  h.c.scheduleTaskAdvance(1);
  await h.advance(500);
  const turn = h.c.acceptTranscriptEvent({ item_id: 'courtesy-yes' }, { allowStart: true });
  h.c.finalizeLearnerTranscript('yes', { turn });

  assert.equal(h.s.dialogueHistory.at(-1).status, '已听到 · 继续下一步');
  assert.equal(h.s.expectedResponse, null, 'yes must not start an extra model reply');
  assert.equal(h.c.isConversationTurnPending(), false);
  await h.advance(1200);
  assert.equal(started(), 0, 'yes should not be followed by an abrupt task switch');
  await h.advance(800);
  assert.equal(started(), 1, 'ordinary politeness must not create a long stall');
});
