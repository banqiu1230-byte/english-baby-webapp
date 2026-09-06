const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const source = fs.readFileSync(require.resolve('./server.js'), 'utf8');
const attach = source.match(/^function attachDuplexProxy\([^]*?^\}$/m)[0];
function proxy() {
  const sockets = [], timers = [], instructionCalls = [];
  class Socket extends EventEmitter {
    static OPEN = 1;
    constructor() { super(); this.readyState = 1; this.bufferedAmount = 0; this.sent = []; this.closed = 0; sockets.push(this); }
    send(message) { this.sent.push(JSON.parse(message)); }
    close() { this.closed++; }
    terminate() {} ping() {}
  }
  const context = vm.createContext({ Buffer, Breakfast: require('./breakfast'), WebSocket: Socket, crypto: {randomUUID:()=> 'test-id'},
    console:{log(){}},process:{env:{DOUBAO_API_KEY:'test-only'}},DUPLEX_URL:'wss://test.invalid',DUPLEX_TASKS:{milk:'test'},ASR_HOTWORDS:[],
    duplexInstructions:(...args)=> {instructionCalls.push(args);return 'test';},cleanText: text=>text,
    setTimeout: fn=> {timers.push(fn);return 1;},setInterval:()=>1,clearInterval() {},
  });
  vm.runInContext(attach,context);
  const client = new Socket(); sockets.length = 0;
  context.attachDuplexProxy(client);
  client.emit('message', Buffer.from('{"type":"start","taskId":"milk","speechRate":"慢速"}'), false);
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
