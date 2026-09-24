const test = require('node:test');
const assert = require('node:assert/strict');
const Coffee = require('./coffee');
const { frameFor, orderLabel } = require('./scene-visuals');
const fs = require('node:fs');
const vm = require('node:vm');

test('each coffee decision has its own picture and the final vessel follows here/to-go', () => {
  for (const service of ['here', 'to-go']) {
    let world = Coffee.initial();
    const images = [];
    for (const [id, choice] of [['coffee-order', 'americano'], ['coffee-size', 'large'], ['coffee-service', service], ['coffee-thanks', 'thanks']]) {
      images.push(frameFor('coffee', id, world).image);
      world = Coffee.apply(world, id, choice);
      assert.ok(frameFor('coffee', id, world).selected);
    }
    assert.equal(new Set(images).size, 4);
    assert.match(images[3], service === 'here' ? /ready-here-americano-large/ : /ready-togo/);
    if (service === 'here') assert.match(frameFor('coffee', 'coffee-thanks', {...world, drink:'latte'}).image, /ready-here/);
    assert.equal(orderLabel(world), `大杯 · 美式 · ${service === 'here' ? '堂食' : '带走'}`);
    assert.equal(frameFor('coffee', 'coffee-thanks', world).caption, '你的咖啡好了 · 享受这一杯');
  }
});

test('americano handover shows one delivered drink in the actual cup size, never the two-drink choice shot', () => {
  for (const size of ['small', 'large']) {
    const world = { drink:'latte', size:'large', service:'to-go',
      delivered:{ drink:'americano', size, service:'here' } };
    for (const received of [false, true]) {
      const frame = frameFor('coffee', 'coffee-thanks', {...world, received});
      assert.equal(frame.image, `./assets/coffee/ready-here-americano-${size}.webp`);
      assert.equal(frame.points.length, 1);
      assert.equal(frame.points[0].label, 'americano');
      assert.equal(frame.answerCue, false);
      assert.ok(fs.existsSync(require('node:path').join(__dirname, frame.image)));
    }
  }
});

test('a new order cannot show a choice or final result from a previous session', () => {
  const initial = Coffee.initial();
  assert.equal(orderLabel(initial), '');
  assert.equal(frameFor('coffee', 'coffee-order', initial).selected, null);
  assert.equal(frameFor('airport', 'ticket', initial), null);
});

test('breakfast cues keep milk/water distinct and follow the offered cup', () => {
  const unselected = frameFor('kitchen', 'breakfast-drink', {});
  assert.deepEqual(unselected.points.map(p => p.key), ['milk', 'water']);
  assert.equal(frameFor('kitchen', 'breakfast-drink', {drink:'water'}).selected, 'water');
  const before = frameFor('kitchen', 'breakfast-cup', {drink:'water'});
  const after = frameFor('kitchen', 'breakfast-cup', {drink:'water',cupPlaced:true});
  assert.notEqual(before.points[0].x, after.points[0].x);
  assert.equal(frameFor('kitchen', 'breakfast-more', {drink:'water',cupPlaced:true}).points[0].label, 'water');
});

test('a line during an image change cannot read old prop cues or restore an obsolete frame', async () => {
  const requests = new Map(), support = [];
  const node = () => ({ children: [], style: {}, dataset: {}, hidden: false, classList: {toggle(){},add(){},remove(){}},
    replaceChildren(...children){this.children = children;}, append(child){this.children.push(child);},
    addEventListener(){}, querySelector(){return node();}, getBoundingClientRect(){return {width:390,height:844};} });
  const layer = node(), card = node(), scene = node(), image = node(), blur = node();
  Object.assign(image, {src:'old.webp',complete:true,naturalWidth:941,naturalHeight:1672,getAttribute(){return this.src;}});
  const world = {sceneStarted:true,selectedScene:'kitchen',breakfast:{},stage:'active',subtitlesHidden:false};
  let taskId = 'breakfast-drink';
  const context = vm.createContext({ console, module:{exports:{}}, document:{querySelector:id=>id === '#visualCues'?layer:card, createElement:node}, window:{addEventListener(){}},
    Image: class {set src(value){ requests.set(value,this); }},
    LumaExperience:{noteHelp:(...args)=>support.push(args)} });
  vm.runInContext(fs.readFileSync(require.resolve('./scene-visuals'),'utf8'),context);
  const api = context.module.exports;
  api.bind({state:()=>world,task:()=>({id:taskId}),scene,image,blur});
  api.render(); requests.get('./assets/breakfast/fridge.webp').onload(); await Promise.resolve();
  assert.equal(layer.children.length,2); assert.equal(support[0][1],'visual-word-cue');
  taskId = 'breakfast-cup'; api.render();
  assert.doesNotThrow(()=>api.speech('Can I have the cup, please?'));
  assert.equal(layer.hidden,true);
  api.clear(); requests.get('./assets/breakfast/table.webp').onload(); await Promise.resolve();
  assert.equal(image.src,'./assets/breakfast/fridge.webp'); assert.equal(layer.hidden,true);
});

test('keeping the delivered large cup is never described as a small-cup replacement', () => {
  const kept = Coffee.advanceMission(Coffee.missionInitial('C03'), 'Large is fine.').world;
  const frame = frameFor('coffee', 'coffee-size', kept);
  assert.equal(frame.selected, 'large');
  assert.match(frame.caption, /保留.*大杯/);
  assert.doesNotMatch(frame.caption, /换好|小杯/);
});
