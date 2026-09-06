const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('./server'), 'utf8');
const context = vm.createContext({Breakfast:require('./breakfast')});
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
