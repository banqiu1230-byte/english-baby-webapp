const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./test-support/voice-harness.cjs');

// A provider can finish the next turn while the previous audible reply is
// draining. Its terminal event belongs to the same queue as its ASR/text.
for (const terminal of ['response.output_audio.done', 'response.done']) {
  test(`${terminal}: an in-flight next reply survives the previous audible turn`, async () => {
    const h = harness();
    h.load('finishDuplexTurnWhenAudioEnds', 'looksLikeReasoningLeak', 'asksForCompletedAction');
    const ready = h.c.connectDuplexSession();
    const send = event => h.s.duplexSocket.onmessage({ data: JSON.stringify(event) });
    await send({ type: 'session.created' }); await ready;
    const first = h.c.beginExpectedResponse('say');
    first.responseId = 'reply-A'; first.questionId = 'question-A';
    const startedAt = h.now();
    Object.assign(h.s, {
      duplexSpeaking: true, duplexOutputDone: true, duplexAcceptAudio: false,
      duplexPlayerContext: { get currentTime() { return 10 + (h.now() - startedAt) / 1000; } },
      duplexNextPlayTime: 12,
    });
    h.c.finishDuplexTurnWhenAudioEnds();
    const reply = 'Yes, I can explain that word.';
    for (const event of [
      { type: 'conversation.item.input_audio_transcription.started', item_id: 'question-B' },
      { type: 'conversation.item.input_audio_transcription.completed', item_id: 'question-B', transcript: 'What does that word mean?' },
      { type: 'response.output_text.done', response_id: 'reply-B', question_id: 'question-B', text: reply },
      { type: terminal, response_id: 'reply-B', question_id: 'question-B' },
    ]) await send(event);
    assert.equal(h.s.expectedResponse, first, 'the first audible line keeps its floor until playback ends');
    assert.equal(h.s.ignoredResponseIds.has('reply-B'), false, 'a queued next reply is not a stale response');
    assert.equal(h.s.ignoredQuestionIds.has('question-B'), false, 'the queued learner item must remain eligible for its reply');
    await h.advance(2160);
    assert.equal(h.s.deferredVoiceEvents.length, 0, 'all matching events drain together');
    assert.ok(h.s.dialogueHistory.some(message => message.speaker === 'user' && message.text === 'What does that word mean?' && message.final));
    assert.ok(h.s.dialogueHistory.some(message => message.speaker === 'luma' && message.text === reply),
      'the actual finished reply appears without waiting for a ten-second timeout');
    assert.equal(h.c.isConversationTurnPending(), false, 'the completed second reply releases the microphone floor');
  });
}

test('three consecutive queued replies keep their audio when response.done precedes audio.done', async () => {
  const h = harness();
  h.load('finishDuplexTurnWhenAudioEnds', 'finishDuplexAudioOutput',
    'looksLikeReasoningLeak', 'asksForCompletedAction', 'publishDuplexSubtitle', 'releaseDuplexAudioGate');
  const audio = [];
  h.c.beginCharacterCaptionReveal = text => h.c.showUnplayedCharacterLine(text);
  h.c.queueDuplexAudio = pcm => {
    audio.push(pcm);
    h.s.duplexNextPlayTime = Math.max(h.s.duplexNextPlayTime, h.s.duplexPlayerContext.currentTime) + .2;
  };
  const ready = h.c.connectDuplexSession();
  const send = event => h.s.duplexSocket.onmessage({ data: JSON.stringify(event) });
  await send({ type: 'session.created' }); await ready;
  const first = h.c.beginExpectedResponse('say');
  first.responseId = 'reply-A'; first.questionId = 'question-A';
  const startedAt = h.now();
  Object.assign(h.s, {
    duplexSpeaking: true, duplexOutputDone: true, duplexAcceptAudio: false,
    duplexPlayerContext: { get currentTime() { return 10 + (h.now() - startedAt) / 1000; } },
    duplexNextPlayTime: 12,
  });
  h.c.finishDuplexTurnWhenAudioEnds();
  for (const [index, name] of ['B', 'C', 'D'].entries()) {
    const current = h.s.expectedResponse;
    const ids = { response_id: `reply-${name}`, question_id: `question-${name}` };
    for (const event of [
      { type: 'conversation.item.input_audio_transcription.started', item_id: ids.question_id },
      { type: 'conversation.item.input_audio_transcription.completed', item_id: ids.question_id, transcript: `Please explain detail ${name}.` },
      { type: 'response.output_text.done', ...ids, text: `Here is explanation ${name}.` },
      { type: 'response.output_audio.started', ...ids },
      { type: 'response.output_audio.delta', ...ids, audio: `audio-${name}-1` },
      { type: 'response.output_audio.delta', ...ids, audio: `audio-${name}-2` },
      { type: 'response.done', ...ids },
      { type: 'response.output_audio.done', ...ids },
    ]) await send(event);
    assert.equal(h.s.expectedResponse, current, 'a queued terminal cannot retire the preceding audible reply');
    assert.equal(h.s.ignoredResponseIds.has(ids.response_id), false, `reply ${name} remains eligible`);
    await h.advance(index === 0 ? 2160 : 561);
    assert.equal(h.s.deferredVoiceEvents.length, 0, `reply ${name} drains in event order`);
    assert.equal(h.s.expectedResponse?.responseId, ids.response_id, `reply ${name} now owns its audio`);
    assert.equal(h.s.duplexSpeaking, true, 'audio may continue after its provider terminal event');
    assert.deepEqual(audio.slice(-2), [`audio-${name}-1`, `audio-${name}-2`]);
    assert.equal(h.s.dialogueHistory.filter(message => message.speaker === 'user').length, index + 1);
    assert.equal(h.s.dialogueHistory.filter(message => message.speaker === 'luma').length, index + 1);
    // A duplicate from the previous turn must not cancel the newly playing one.
    await send({ type: 'response.done', response_id: current.responseId, question_id: current.questionId });
    assert.equal(h.s.expectedResponse?.responseId, ids.response_id);
  }
  await h.advance(561);
  assert.equal(h.s.deferredVoiceEvents.length, 0);
  assert.equal(h.c.isConversationTurnPending(), false);
  assert.deepEqual(audio, ['audio-B-1', 'audio-B-2', 'audio-C-1', 'audio-C-2', 'audio-D-1', 'audio-D-2']);
  assert.equal(h.effects.some(effect => effect.type === 'toast'), false, 'normal overlapping turns need no timeout recovery');
});
