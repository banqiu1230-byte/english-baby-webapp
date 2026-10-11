const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const source = fs.readFileSync(require.resolve('./server.js'), 'utf8');
const attach = source.match(/^function attachDuplexProxy\([^]*?^\}$/m)[0];
const normalizeCoffeeState = source.match(/^function normalizeCoffeeState\([^]*?^\}$/m)[0];
const voiceDeclarations = ['ASR_COMMON_WORDS', 'ASR_SCENE_WORDS', 'DUPLEX_TASKS', 'SCENE_FACTS']
  .map(name => source.match(new RegExp(`^const ${name} = [^]*?^[\\]}];`, 'm'))[0]).join('\n');
const duplexAsr = source.match(/^function duplexAsr\([^]*?^\}$/m)[0];
function proxy(start = {}, { open = true } = {}) {
  const sockets = [], timers = [], instructionCalls = [], logs = [];
  const cancelledTimers = new Set();
  let timerId = 0, now = 0;
  class Socket extends EventEmitter {
    static OPEN = 1;
    constructor() { super(); this.readyState = 1; this.bufferedAmount = 0; this.sent = []; this.closed = 0; sockets.push(this); }
    send(message) { this.sent.push(JSON.parse(message)); (this.sentAt ||= []).push(now); if (this.tracksBufferedWrites) this.bufferedAmount += Buffer.byteLength(message); }
    close() { this.closed++; }
    terminate() { this.readyState = 3; } ping() {}
  }
  const context = vm.createContext({ Buffer, Breakfast: require('./breakfast'), Coffee: require('./coffee'), SceneMemory: require('./scene-memory'), WebSocket: Socket, crypto: {randomUUID:()=> 'test-id'},
    console:{log: (...args) => logs.push(args.join(' '))},process:{env:{DOUBAO_API_KEY:'test-only'}},DUPLEX_URL:'wss://test.invalid',
    Date: class extends Date { static now() { return now; } },
    duplexInstructions:(...args)=> {instructionCalls.push(args);return 'test';},cleanText: text=>text,
    setTimeout: (fn, delay = 0)=> {const id = ++timerId; const timer = () => { if (!cancelledTimers.has(id)) fn(); }; timer.id = id; timer.at = now + delay; timers.push(timer); return id;},
    clearTimeout: id=> { cancelledTimers.add(id); const index = timers.findIndex(timer => timer.id === id); if (index >= 0) timers.splice(index, 1); },setInterval:()=>1,clearInterval() {},
  });
  vm.runInContext(`${voiceDeclarations}\n${duplexAsr}\n${normalizeCoffeeState}\n${attach}`,context);
  const client = new Socket(); sockets.length = 0;
  context.attachDuplexProxy(client);
  client.emit('message', Buffer.from(JSON.stringify({type:'start',taskId:'milk',speechRate:'慢速',...start})), false);
  const upstream = sockets[0]; if (open) upstream.emit('open');
  const advance = milliseconds => {
    const until = now + milliseconds;
    while (timers.some(timer => timer.at <= until)) {
      timers.sort((a, b) => a.at - b.at);
      const timer = timers.shift(); now = timer.at; timer();
    }
    now = until;
  };
  const runNextTimer = (lateness = 0) => {
    timers.sort((a,b)=>a.at-b.at);
    const timer = timers.shift();
    if (!timer) return false;
    now = Math.max(now,timer.at) + lateness; timer(); return true;
  };
  return {client,upstream,sockets,timers,instructionCalls,logs,advance,runNextTimer,runTimers:()=>timers.splice(0).forEach(fn=>fn())};
}
test('proxy paces a reconnect burst at 640 bytes per 20 ms without reordering speech', () => {
  const {client,upstream,advance} = proxy();
  const input = Buffer.alloc(64000); for(let i=0;i<input.length;i++)input[i]=i%251;
  client.emit('message',input,true);
  upstream.emit('message',Buffer.from('{"type":"session.created"}'));
  const packets = () => upstream.sent.filter(e=>e.type==='input_audio_buffer.append');
  assert.equal(packets().length,1,'a reconnect cannot burst the entire queue upstream');
  advance(19); assert.equal(packets().length,1);
  advance(1); assert.equal(packets().length,2);
  advance(1980);
  assert.ok(packets().every(event=>Buffer.from(event.audio,'base64').length === 640));
  const output = Buffer.concat(upstream.sent.filter(e=>e.type==='input_audio_buffer.append').map(e=>Buffer.from(e.audio,'base64')));
  assert.ok(output.equals(input));
});
test('a full browser playback queue survives transient socket backpressure in order', () => {
  const {client,upstream,timers,advance} = proxy();
  upstream.emit('message',Buffer.from('{"type":"session.created"}'));
  upstream.bufferedAmount = 520000;
  const input = Buffer.alloc(16000 * 2 * 60);
  for (let i = 0; i < input.length; i++) input[i] = i % 251;
  for (let offset = 0; offset < input.length; offset += 3200) {
    client.emit('message',input.subarray(offset, offset + 3200),true);
  }
  assert.equal(timers.length,1,'only one retry is needed while the socket is backed up');
  assert.equal(client.sent.some(event=>event.type==='local.error'),false);
  assert.equal(upstream.sent.some(event=>event.type==='session.close'),false);
  advance(250); upstream.bufferedAmount = 0;
  advance(1000);
  const live = Buffer.alloc(640,7); client.emit('message',live,true);
  advance(60000);
  assert.equal(timers.length,0,'the queue also finishes when no more microphone frames arrive');
  const output = Buffer.concat(upstream.sent.filter(e=>e.type==='input_audio_buffer.append').map(e=>Buffer.from(e.audio,'base64')));
  assert.ok(output.equals(Buffer.concat([input,live])));
});

test('input mute and unmute follow the documented lifecycle without losing a partial final frame', () => {
  const {client,upstream,advance} = proxy();
  upstream.emit('message',Buffer.from('{"type":"session.created"}'));
  assert.equal(upstream.sent.at(-1).type,'input_audio_mute.commit','a newly connected session has no microphone stream yet');
  client.emit('message',Buffer.from('{"type":"input_audio_unmute.commit"}'),false);
  assert.equal(upstream.sent.at(-1).type,'input_audio_unmute.commit');
  const input = Buffer.alloc(700,8);
  client.emit('message',input,true);
  client.emit('message',Buffer.from('{"type":"input_audio_mute.commit"}'),false);
  assert.equal(upstream.sent.at(-1).type,'input_audio_buffer.append','mute waits for queued captured speech');
  advance(20);
  assert.equal(upstream.sent.at(-1).type,'input_audio_mute.commit');
  const output = Buffer.concat(upstream.sent.filter(e=>e.type==='input_audio_buffer.append').map(e=>Buffer.from(e.audio,'base64')));
  assert.ok(output.subarray(0,input.length).equals(input));
  assert.ok(output.subarray(input.length).every(byte=>byte===0),'only the partial final frame is padded');
  const mutedCount = upstream.sent.filter(e=>e.type==='input_audio_mute.commit').length;
  client.emit('message',Buffer.from('{"type":"input_audio_mute.commit"}'),false);
  assert.equal(upstream.sent.filter(e=>e.type==='input_audio_mute.commit').length,mutedCount,'mute notifications are deduplicated');
  advance(20); client.emit('message',Buffer.alloc(640),true);
  assert.equal(upstream.sent.at(-2).type,'input_audio_unmute.commit','resumed microphone PCM unmutes before any audio');
});

test('small timer jitter does not accumulate across a minute of realtime audio', () => {
  const {client,upstream,runNextTimer} = proxy();
  client.emit('message',Buffer.alloc(16000*2*60),true);
  upstream.emit('message',Buffer.from('{"type":"session.created"}'));
  while (runNextTimer(3)) {}
  const times = upstream.sent.flatMap((event,index)=>event.type === 'input_audio_buffer.append' ? [upstream.sentAt[index]] : []);
  assert.equal(times.length,3000);
  assert.ok(times.at(-1)-times[0] <= 60000,'3 ms scheduling jitter must not add nine seconds of queue latency');
  assert.ok(times.slice(1).every((at,index)=>at-times[index] >= 10),'scheduled frames never become a synchronous reconnect burst');
});
test('closing a backed-up session cancels its pending audio drain', () => {
  const {client,upstream,runTimers} = proxy();
  upstream.emit('message',Buffer.from('{"type":"session.created"}'));
  upstream.bufferedAmount = 520000;
  client.emit('message',Buffer.alloc(3200),true);
  client.emit('close');
  upstream.bufferedAmount = 0;
  runTimers();
  assert.equal(upstream.sent.some(event=>event.type==='input_audio_buffer.append'),false);
  assert.equal(upstream.closed,1);
});
test('audio buffering remains bounded during a sustained upstream stall', () => {
  const {client,upstream} = proxy();
  upstream.emit('message',Buffer.from('{"type":"session.created"}'));
  upstream.bufferedAmount = 520000;
  client.emit('message',Buffer.alloc(16000 * 2 * 60),true);
  assert.equal(client.sent.some(event=>event.type==='local.error'),false);
  client.emit('message',Buffer.alloc(2),true);
  assert.equal(client.sent.at(-1).message,'audio_buffer_full');
  assert.equal(upstream.sent.at(-1).type,'session.close');
});
test('close fallback closes the captured upstream socket after clearing current state', () => {
  const {client,upstream,timers} = proxy();client.emit('close');timers.forEach(fn=>fn());
  assert.equal(upstream.closed,1);
});
test('speech rate preference changes the upstream synthesis configuration', () => {
  const {client,upstream}=proxy();
  assert.ok(upstream.sent[0].session.audio.output.speed<0);
  client.emit('message',Buffer.from('{"type":"task.update","speechRate":"正常"}'),false);
  assert.equal(upstream.sent.at(-1).session.audio.output.speed,0);
});
test('breakfast choices reach dialogue context and invalid world values are sanitized', () => {
  const {client,instructionCalls}=proxy();
  client.emit('message',Buffer.from(JSON.stringify({type:'task.update',breakfast:{drink:'water',cupPlaced:true,amount:'enough'}})),false);
  assert.deepEqual(JSON.parse(JSON.stringify(instructionCalls.at(-1)[6])),{drink:'water',cupPlaced:true,amount:'enough'});
  client.emit('message',Buffer.from(JSON.stringify({type:'task.update',breakfast:{drink:'coffee',cupPlaced:false,amount:'overflow'}})),false);
  assert.deepEqual(JSON.parse(JSON.stringify(instructionCalls.at(-1)[6])),{drink:null,cupPlaced:false,amount:null});
});

test('coffee choices reach dialogue context without out-of-order or invalid values', () => {
  const {client,instructionCalls}=proxy();
  client.emit('message',Buffer.from(JSON.stringify({type:'task.update',coffee:{drink:'latte',size:'small',service:'to-go',received:false}})),false);
  assert.deepEqual(JSON.parse(JSON.stringify(instructionCalls.at(-1)[7])),{drink:'latte',size:'small',service:'to-go',received:false});
  client.emit('message',Buffer.from(JSON.stringify({type:'task.update',speechRate:'正常'})),false);
  assert.equal(instructionCalls.at(-1)[7].service,'to-go');
  client.emit('message',Buffer.from(JSON.stringify({type:'task.update',coffee:{drink:'milk',size:'large',service:'here',received:true}})),false);
  assert.deepEqual(JSON.parse(JSON.stringify(instructionCalls.at(-1)[7])),{drink:null,size:null,service:null,received:false});
});

test('the voice proxy ignores removed text-answer events', () => {
  const {client,upstream}=proxy();
  upstream.emit('message',Buffer.from('{"type":"session.created"}'));
  client.emit('message',Buffer.from('{"type":"user.text","text":"A latte, please."}'),false);
  assert.equal(upstream.sent.some(event=>event.type==='conversation.item.create'),false);
});


test('first session sends effective scene-specific ASR hints in the documented extension', () => {
  const { upstream } = proxy({ taskId: 'coffee-order' });
  const event = upstream.sent[0];
  assert.equal(event.session.model, '1.2.6.1');
  assert.equal(event.session.asr, undefined, 'session.asr is not a Seeduplex field');
  assert.equal(event.extension.asr.extra.enable_asr_twopass, true);
  const hints = JSON.parse(event.extension.asr.extra.context);
  const words = hints.hotwords.map(item => item.word);
  for (const word of ['hello', 'yes', 'a latte please', 'americano', 'small', 'to go']) assert.ok(words.includes(word), word);
  assert.equal(words.includes('gate A12'), false, 'unrelated scenes must not compete with a short first reply');
  assert.equal(hints.correct_words, undefined, 'do not rewrite genuine Chinese into guessed English');
  assert.equal(event.extension.asr.language, undefined, 'do not invent an English-only protocol switch');
});

test('task updates and fresh reconnects apply the active scene vocabulary', () => {
  const { client, upstream } = proxy({ taskId: 'coffee-order' });
  client.emit('message', Buffer.from(JSON.stringify({type:'task.update', taskId:'ticket'})), false);
  const update = upstream.sent.at(-1);
  assert.equal(update.type, 'session.update');
  assert.equal(update.session.asr, undefined);
  const words = JSON.parse(update.extension.asr.extra.context).hotwords.map(item => item.word);
  assert.ok(words.includes('boarding pass'));
  assert.equal(words.includes('latte'), false);
  const reconnected = proxy({taskId:'ticket',history:[{role:'assistant',text:'May I see your ticket?'}]});
  assert.deepEqual(reconnected.upstream.sent[0].extension.asr, update.extension.asr);
});

test('Chinese help transcripts are forwarded intact with English vocabulary hints enabled', () => {
  const { client, upstream } = proxy({taskId:'coffee-order'});
  const event = {type:'conversation.item.input_audio_transcription.completed', item_id:'help-1', transcript:'这句话是什么意思？'};
  upstream.emit('message', Buffer.from(JSON.stringify(event)));
  assert.deepEqual(client.sent.at(-1), event);
});

test('a concurrent learner question cannot relabel the current reply audio', () => {
  const { client, upstream } = proxy();
  const incoming = event => upstream.emit('message', Buffer.from(JSON.stringify(event)));
  incoming({ type: 'session.created' });
  incoming({ type: 'response.output_audio.started', response_id: 'reply-1', question_id: 'question-1' });
  incoming({ type: 'conversation.item.input_audio_transcription.completed', response_id: 'reply-1', question_id: 'question-2', transcript: 'Private learner example.' });
  incoming({ type: 'response.output_audio.delta', audio: 'AAABAA==' });
  assert.equal(client.sent.at(-1).response_id, 'reply-1');
  assert.equal(client.sent.at(-1).question_id, 'question-1');
  incoming({ type: 'response.output_audio.delta', response_id: 'reply-2', question_id: 'question-2', audio: 'AAABAA==' });
  assert.equal(client.sent.at(-1).response_id, 'reply-2', 'explicit packet ownership is never overwritten');
  assert.equal(client.sent.at(-1).question_id, 'question-2');
});

test('old completion events cannot clear the newer audio correlation', () => {
  const { client, upstream } = proxy();
  const incoming = event => upstream.emit('message', Buffer.from(JSON.stringify(event)));
  incoming({ type: 'session.created' });
  incoming({ type: 'response.output_audio.started', response_id: 'old', question_id: 'old-question' });
  incoming({ type: 'response.output_audio.started', response_id: 'new' });
  incoming({ type: 'response.done', response_id: 'old' });
  incoming({ type: 'response.output_audio.done', question_id: 'old-question' });
  incoming({ type: 'response.output_audio.delta', audio: 'AAABAA==' });
  assert.equal(client.sent.at(-1).response_id, 'new');
  assert.equal(client.sent.at(-1).question_id, '', 'a new reply never inherits an old question');
});

test('an upstream handshake or session-ready stall fails within ten seconds and permits a fresh start', () => {
  for (const open of [false, true]) {
    const { client, sockets, advance } = proxy({}, { open });
    advance(9999);
    assert.equal(client.sent.some(event => event.type === 'local.error'), false);
    advance(1);
    assert.equal(client.sent.at(-1).message, 'duplex_ready_timeout');
    client.emit('message', Buffer.from('{"type":"start","taskId":"milk"}'), false);
    assert.equal(sockets.length, 2, 'a timed-out socket is not retained as the active upstream');
    sockets[1].emit('open');
    sockets[1].emit('message', Buffer.from('{"type":"session.created"}'));
    advance(15000);
    assert.equal(client.sent.at(-1).type, 'session.created', 'the ready event cancels its deadline');
  }
});

test('an upstream protocol close or socket close retires state and remains reconnectable', () => {
  for (const type of ['session.closed', 'socket.close']) {
    const { client, upstream, sockets, advance } = proxy();
    upstream.emit('message', Buffer.from('{"type":"session.created"}'));
    if (type === 'session.closed') upstream.emit('message', Buffer.from('{"type":"session.closed"}'));
    else upstream.emit('close');
    assert.equal(client.sent.at(-1).type, 'local.closed');
    client.emit('message', Buffer.from('{"type":"start","taskId":"milk"}'), false);
    assert.equal(sockets.length, 2);
    sockets[1].emit('open');
    sockets[1].emit('message', Buffer.from('{"type":"session.created"}'));
    upstream.emit('close');
    advance(15000);
    assert.equal(client.sent.at(-1).type, 'session.created', 'late old-socket events cannot retire the new session');
  }
});

test('permanent upstream audio backpressure ends promptly instead of retrying forever', () => {
  const { client, upstream, advance, timers } = proxy();
  upstream.emit('message', Buffer.from('{"type":"session.created"}'));
  upstream.bufferedAmount = 520000;
  client.emit('message', Buffer.alloc(3200), true);
  advance(7999);
  assert.equal(client.sent.some(event => event.type === 'local.error'), false);
  advance(1);
  assert.equal(client.sent.at(-1).message, 'audio_transport_stalled');
  advance(3000);
  assert.equal(timers.length, 0, 'the failed connection has no retry loop left behind');
  assert.equal(upstream.sent.some(event => event.type === 'input_audio_buffer.append'), false);
});

test('transport logs provide timestamped protocol latency without transcript or character text', () => {
  const { client, upstream, advance, logs } = proxy();
  const incoming = event => upstream.emit('message', Buffer.from(JSON.stringify(event)));
  incoming({ type: 'session.created' });
  client.emit('message', Buffer.from('{"type":"say","text":"PRIVATE_CHARACTER_TEXT"}'), false);
  advance(300);
  incoming({ type: 'response.output_audio.started', response_id: 'reply-1' });
  advance(40);
  incoming({ type: 'response.output_audio.delta', audio: 'AAABAA==' });
  incoming({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'PRIVATE_LEARNER_TEXT' });
  incoming({ type: 'error', error: { code: 55000000, message: 'PRIVATE_PROVIDER_CONTENT' } });
  assert.ok(logs.every(line => /^\d{4}-\d{2}-\d{2}T/.test(line)));
  assert.ok(logs.some(line => line.includes('"wait_ms":300')));
  assert.ok(logs.some(line => line.includes('"packet_wait_ms":40')));
  assert.ok(logs.some(line => line.includes('"code":"55000000"')));
  assert.doesNotMatch(logs.join('\n'), /PRIVATE_|AAABAA==|test-only/);
});
