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
function proxy(start = {}) {
  const sockets = [], timers = [], instructionCalls = [];
  class Socket extends EventEmitter {
    static OPEN = 1;
    constructor() { super(); this.readyState = 1; this.bufferedAmount = 0; this.sent = []; this.closed = 0; sockets.push(this); }
    send(message) { this.sent.push(JSON.parse(message)); }
    close() { this.closed++; }
    terminate() {} ping() {}
  }
  const context = vm.createContext({ Buffer, Breakfast: require('./breakfast'), Coffee: require('./coffee'), SceneMemory: require('./scene-memory'), WebSocket: Socket, crypto: {randomUUID:()=> 'test-id'},
    console:{log(){}},process:{env:{DOUBAO_API_KEY:'test-only'}},DUPLEX_URL:'wss://test.invalid',
    duplexInstructions:(...args)=> {instructionCalls.push(args);return 'test';},cleanText: text=>text,
    setTimeout: fn=> {timers.push(fn);return 1;},setInterval:()=>1,clearInterval() {},
  });
  vm.runInContext(`${voiceDeclarations}\n${duplexAsr}\n${normalizeCoffeeState}\n${attach}`,context);
  const client = new Socket(); sockets.length = 0;
  context.attachDuplexProxy(client);
  client.emit('message', Buffer.from(JSON.stringify({type:'start',taskId:'milk',speechRate:'慢速',...start})), false);
  const upstream = sockets[0]; upstream.emit('open');
  return {client,upstream,timers,instructionCalls};
}
test('proxy forwards a reconnect burst in order without a one-frame timer backlog', () => {
  const {client,upstream} = proxy();
  const input = Buffer.alloc(64000); for(let i=0;i<input.length;i++)input[i]=i%251;
  client.emit('message',input,true);
  upstream.emit('message',Buffer.from('{"type":"session.created"}'));
  const output = Buffer.concat(upstream.sent.filter(e=>e.type==='input_audio_buffer.append').map(e=>Buffer.from(e.audio,'base64')));
  assert.deepEqual(output,input);
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
