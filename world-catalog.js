/* World navigation metadata. Visiting the map never changes learning records. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./interview'));
  else root.LumaWorldCatalog = factory(typeof Interview === 'undefined' ? root.Interview : Interview);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Interview) {
  'use strict';
  const regions = [
    { id: 'district', name: '生活街区', description: '从家出发，遇见熟悉的人', image: './assets/adventure/world-life-map-v1.png', alt: '有家与咖啡店的生活街区' },
    { id: 'work', name: '职场', description: '认识同事，为下一次面试做准备', image: './assets/adventure/world-life-map-v1.png', alt: '同城工作街区，连接初次见面与设计师面试' },
    { id: 'airport', name: '机场', description: '带上行李，准备下一次出发', image: './assets/adventure/world-airport-map-v1.png', alt: '连接航站楼、飞机与前广场的机场地图' },
  ];
  const places = [
    { id: 'coffee', nodeId: 'coffee', regionId: 'district', name: '街角咖啡店', thumbnail: 'coffee', available: true,
      position: [.47, .41], smallPosition: [.47, .40], shortPosition: [.72, .47],
      events: [
        { id: 'C01', missionId: 'C01', title: '第一次自己点咖啡' },
        { id: 'C02', missionId: 'C02', title: '替朋友点对那一杯' },
        { id: 'C03', missionId: 'C03', title: '拿到的咖啡，好像不太对' },
        { id: 'C04', missionId: 'C04', title: '独立挑战' },
      ] },
    { id: 'kitchen', nodeId: 'kitchen', regionId: 'district', name: '家中早餐', thumbnail: 'breakfast', available: true,
      position: [.22, .27], shortPosition: [.23, .31], events: [{ id: 'breakfast', title: '一起准备早餐' }] },
    { id: 'office', nodeId: 'office', regionId: 'work', name: '初次见面', thumbnail: 'office', available: true,
      position: [.28, .32], shortPosition: [.25, .38], events: [{ id: 'meet-colleague', title: '第一次拜访新同事' }] },
    { id: 'interview', nodeId: 'interview', regionId: 'work', name: '设计师面试', thumbnail: 'office', thumbnailImage: './assets/interview/room.png', available: true, eventLabel: '项练习',
      position: [.70, .49], shortPosition: [.75, .38],
      events: (Interview?.missions || []).map(m => ({ id: m.id, missionId: m.id, title: m.title, duration: m.duration })) },
    { id: 'street', nodeId: 'future', regionId: 'district', name: '城市生活', thumbnail: 'street', available: false,
      position: [.23, .56], smallPosition: [.23, .51], shortPosition: [.23, .47], events: [] },
    { id: 'airport', nodeId: 'airport', regionId: 'airport', name: '机场出行', thumbnail: 'airport', available: true,
      position: [.5, .4], shortPosition: [.5, .39], events: [{ id: 'find-gate', title: '找到正确的登机口' }] },
  ];
  const labels = { future: '即将开放', current: '进行中', pending: '待继续', complete: '全部体验', visited: '已体验', entered: '曾到访', new: '未到访' };
  function stateFor(place, profile = {}, next = null) {
    if (!place.available) return 'future';
    const sessions = (profile.sessions || []).filter(s => s.sceneId === place.id && s.scope !== 'target-practice' && !s.supersededAt);
    const complete = sessions.filter(s => s.scope === 'life-event' && s.completedAt && Date.parse(s.completedAt) <= Date.now());
    if (next?.kind === 'resume' && next.sceneId === place.id) return 'current';
    if ((profile.checkpoints || []).some(c => c.sceneId === place.id && sessions.some(s => s.id === c.sessionId && !s.completedAt))) return 'pending';
    const allDone = place.events.length && place.events.every(event => complete.some(s => !event.missionId || s.missionId === event.missionId));
    return allDone ? 'complete' : complete.length ? 'visited' : sessions.length ? 'entered' : 'new';
  }
  return { regions, places, labels, stateFor, place: id => places.find(p => p.id === id || p.nodeId === id), region: id => regions.find(r => r.id === id) };
});
