const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./test-support/voice-harness.cjs');

test('pending, text-only, and interrupted prompts never become a heard-question quote', () => {
  const h = harness();
  h.load('clearCharacterCaptionReveal');
  h.s.activeQuestion = 'Would you like milk?';
  assert.equal(h.c.captureUserTurnContext().heardQuestion, null);
  h.s.dialogueHistory = [{ speaker: 'luma', text: 'Would you like milk?' }];
  h.s.streamingLumaIndex = 0;
  h.s.captionCharacters = Array.from(h.s.activeQuestion);
  h.s.captionAudioStart = 0;
  h.c.clearCharacterCaptionReveal({ complete: true });
  assert.equal(h.c.captureUserTurnContext().heardQuestion, null);
  h.s.streamingLumaIndex = 0;
  h.s.captionCharacters = Array.from(h.s.activeQuestion);
  h.s.captionAudioStart = 12;
  h.c.clearCharacterCaptionReveal();
  assert.equal(h.c.captureUserTurnContext().heardQuestion, null);
});

test('a completed spoken question is captured exactly and cannot label a different pending question', () => {
  const h = harness();
  h.load('clearCharacterCaptionReveal');
  h.s.activeQuestion = 'Would you like a latte?';
  h.s.dialogueHistory = [{ speaker: 'luma', text: 'Would you' }];
  h.s.streamingLumaIndex = 0;
  h.s.captionCharacters = Array.from(h.s.activeQuestion);
  h.s.captionAudioStart = 12;
  h.s.expectedResponse = { kind: 'say', updatesQuestion: true };
  h.c.clearCharacterCaptionReveal({ complete: true });
  assert.equal(h.c.captureUserTurnContext().heardQuestion, 'Would you like a latte?');
  h.s.activeQuestion = 'What size would you like?';
  assert.equal(h.c.captureUserTurnContext().heardQuestion, null);
});
