const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const source = fs.readFileSync(require.resolve('./server.js'), 'utf8');
const attach = source.match(/^function attachDuplexProxy\([^]*?^\}$/m)[0];
function proxy() {
  const sockets = [], timers = [];
  class Socket extends EventEmitter {
    static OPEN = 1;
    constructor() { super(); this.readyState = 1; this.bufferedAmount = 0; this.sent = []; this.closed = 0; sockets.push(this); }
    send(message) { this.sent.push(JSON.parse(message)); }
    close() { this.closed++; }
    terminate() {} ping() {}
  }
  const context = vm.createContext({ Buffer, WebSocket: Socket, crypto: {randomUUID:()=> 'test-id'},
    console:{log(){}},process:{env:{DOUBAO_API_KEY:'test-only'}},DUPLEX_URL:'wss://test.invalid',DUPLEX_TASKS:{milk:'test'},ASR_HOTWORDS:[],
    duplexInstructions:()=> 'test',cleanText: text=>text,
    setTimeout: fn=> {timers.push(fn);return 1;},setInterval:()=>1,clearInterval() {},
  });
  vm.runInContext(attach,context);
  const client = new Socket(); sockets.length = 0;
  context.attachDuplexProxy(client);
  client.emit('message', Buffer.from('{"type":"start","taskId":"milk","speechRate":"慢速"}'), false);
  const upstream = sockets[0]; upstream.emit('open');
  return {client,upstream,timers};
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
