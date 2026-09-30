const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const catalog = require('./world-catalog');
const Coffee = require('./coffee');

test('every place belongs to a real region, with valid artwork and authored map coordinates', () => {
  assert.equal(new Set(catalog.regions.map(r => r.id)).size, catalog.regions.length);
  assert.equal(new Set(catalog.places.map(p => p.id)).size, catalog.places.length);
  assert.equal(new Set(catalog.places.map(p => p.nodeId)).size, catalog.places.length);
  for (const region of catalog.regions) assert.ok(existsSync(resolve(__dirname, region.image)), region.image);
  for (const place of catalog.places) {
    assert.ok(catalog.region(place.regionId), place.id);
    assert.ok(existsSync(resolve(__dirname, `assets/optimized/${place.thumbnail}-thumb-220.jpg`)));
    for (const coordinates of [place.position, place.smallPosition, place.shortPosition].filter(Boolean)) {
      assert.equal(coordinates.length, 2);
      assert.ok(coordinates.every(n => Number.isFinite(n) && n >= 0 && n <= 1), place.id);
    }
    assert.equal(place.available, place.events.length > 0);
  }
});

test('coffee event entries point at existing authored missions', () => {
  for (const event of catalog.place('coffee').events) assert.equal(Coffee.getMission(event.missionId).id, event.missionId);
});

test('location status preserves an unfinished event even after an earlier visit', () => {
  const profile = { sessions: [
    { id: 'done', sceneId: 'airport', scope: 'life-event', completedAt: '2026-01-01T00:00:00Z' },
    { id: 'pending', sceneId: 'airport', scope: 'life-event' },
  ], checkpoints: [{ sessionId: 'pending', sceneId: 'airport' }] };
  const before = JSON.stringify(profile);
  assert.equal(catalog.stateFor(catalog.place('airport'), profile), 'pending');
  assert.equal(catalog.stateFor(catalog.place('airport'), profile, { kind: 'resume', sceneId: 'airport' }), 'current');
  assert.equal(JSON.stringify(profile), before);
});

test('short reviews and superseded sessions do not mark a world place as visited', () => {
  const profile = { sessions: [
    { id: 'review', sceneId: 'airport', scope: 'target-practice', completedAt: '2026-01-01T00:00:00Z' },
    { id: 'old', sceneId: 'airport', scope: 'life-event', supersededAt: '2026-01-01T00:00:00Z' },
  ] };
  assert.equal(catalog.stateFor(catalog.place('airport'), profile), 'new');
});

test('one coffee event is a visit, all four are a fully experienced place', () => {
  const sessions = catalog.place('coffee').events.map(e => ({ id: e.id, missionId: e.missionId, sceneId: 'coffee', scope: 'life-event', completedAt: '2026-01-01T00:00:00Z' }));
  assert.equal(catalog.stateFor(catalog.place('coffee'), { sessions: sessions.slice(0, 1) }), 'visited');
  assert.equal(catalog.stateFor(catalog.place('coffee'), { sessions }), 'complete');
  assert.equal(catalog.stateFor(catalog.place('street'), { sessions }), 'future');
});
