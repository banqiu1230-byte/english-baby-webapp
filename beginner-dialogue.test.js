const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('./server'), 'utf8');
const context = vm.createContext({Breakfast:require('./breakfast'), Coffee:require('./coffee')});
const declarations = ['DUPLEX_TASKS','SCENE_FACTS'].map(name => source.match(new RegExp(`^const ${name} = \\{[^]*?^\\};`, 'm'))[0]);
declarations.push(source.match(/^const ACTION_REQUIRED_TASKS = .*$/m)[0]);
declarations.push(source.match(/^function duplexInstructions\([^]*?^\}$/m)[0]);
vm.runInContext(declarations.join('\n'),context);
test('beginner dialogue prioritizes complete meaning, not clipped word counts', () => {
  const instructions = context.duplexInstructions('breakfast-drink');
  assert.ok(instructions.includes('Do you want milk or water?'));
  assert.ok(instructions.includes('Simple means clear meaning'));
  assert.ok(!instructions.includes('one sentence of 2 to 6'));
  assert.ok(instructions.includes('Accept a single word'));
  assert.ok(instructions.includes('unlimited turns'));
});
test('confusion is answered with a Chinese explanation, without invented physical progress', () => {
  const instructions = context.duplexInstructions('breakfast-more',false,false,[],'active',[],{drink:'water',cupPlaced:true,amount:null});
  assert.ok(instructions.includes('explain the actual question in one short Chinese sentence'));
  assert.ok(instructions.includes('Do not merely repeat the same unexplained English'));
  assert.ok(instructions.includes('Do you want more water?'));
  assert.ok(instructions.includes('Chosen drink: water'));
  assert.ok(instructions.includes('Never claim, praise, or refer to a physical action unless the state says it is complete'));
});

test('coffee conversation uses the selected order and leaves transitions to the app', () => {
  const instructions = context.duplexInstructions('coffee-thanks', false, false,
    ['coffee-order', 'coffee-size', 'coffee-service'], 'active', [], undefined,
    { drink: 'latte', size: 'small', service: 'to-go', received: false });
  assert.ok(instructions.includes('Here’s your small latte to go. Enjoy!'));
  assert.ok(instructions.includes('Received and thanked: false'));
  assert.ok(instructions.includes('Never require a tap, drag, text input, or button choice'));
  assert.ok(instructions.includes('No payment, price, or purchase step'));
});

test('coffee transition confirms the resolved step without opening the next question', () => {
  const selected = context.Coffee.advanceMission(context.Coffee.missionInitial('C01'), 'Americano.').world;
  const instructions = context.duplexInstructions('coffee-order', false, true,
    ['coffee-order'], 'task-complete', [], undefined, selected);
  assert.ok(instructions.includes('Current task line: Okay. An americano.'));
  assert.ok(instructions.includes('Do not start the next practical goal yourself'));
  assert.ok(instructions.includes('If the learner asks a question or keeps chatting, answer them naturally'));
  assert.ok(instructions.includes('A bare yes after an either-or question does not choose an option'));
  assert.ok(instructions.includes('A yes to that actual single-option question confirms that option'));
});
