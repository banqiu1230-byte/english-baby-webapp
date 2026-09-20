/* The breakfast story owns world state; the voice runtime owns conversation. */
const Breakfast = (() => {
  const tasks = [
    { id: 'breakfast-drink', interaction: 'speech', requiresAction: false, requiresSpeech: true,
      prompt: 'Do you want milk or water?', hint: '告诉 Luma 想喝什么。说 Milk 或 Water 就可以。',
      label: '选一杯喜欢的饮料', view: 'fridge', choices: ['milk', 'water'] },
    { id: 'breakfast-cup', interaction: 'speech', requiresAction: false, requiresSpeech: true,
      prompt: 'Can I have the cup, please?', hint: '直接回应 Luma。说 Here 或 Here you are，杯子就会递过去。',
      label: '回应她的请求', view: 'table', choices: ['place'] },
    { id: 'breakfast-more', interaction: 'speech', requiresAction: false, requiresSpeech: true,
      prompt: 'Do you want more to drink?', hint: '想再来一点就说 Yes；够了可以说 No 或 Enough。',
      label: '告诉她要多少', view: 'table', choices: ['more', 'enough'] },
  ];
  const initial = () => ({ drink: null, cupPlaced: false, amount: null });
  const isTask = id => tasks.some(task => task.id === id);
  const promptFor = (id, world = {}) => id === 'breakfast-more' && ['milk', 'water'].includes(world.drink)
    ? `Do you want more ${world.drink}?` : tasks.find(task => task.id === id)?.prompt;
  const normalize = text => String(text || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z\p{Script=Han}]+/gu, ' ').trim();
  const spokenAnswer = text => normalize(text)
    .replace(/^(?:(?:uh huh|uh|um|erm|hmm|well|oh)\s+)+/, '')
    .replace(/(?:\s+(?:uh|um|erm|hmm))+$/, '');
  function choiceFromText(taskId, text, question = '') {
    const raw = String(text || ''), clean = spokenAnswer(text), asked = normalize(question);
    // A request for meaning or a new question is conversation, not a decision.
    if (/[?？]|什么意思|怎么说|不懂|不明白|解释|what.*mean|how.*say/i.test(raw)
      || /\b(?:dont know|do not know|not sure|dont understand|do not understand|help me|repeat|say (?:it |that )?again)\b/.test(clean)) return null;
    if (taskId === 'breakfast-drink') {
      const match = clean.match(/^(?:(?:i want|i would like|id like|ill have|i choose|can i have) )?(milk|water)(?: please)?$/);
      if (match) return match[1];
      if (/^(?:我要|我想喝|想喝|喝)?牛奶$/.test(clean)) return 'milk';
      if (/^(?:我要|我想喝|想喝|喝)?水$/.test(clean)) return 'water';
    }
    if (taskId === 'breakfast-more') {
      if (/^(?:more|more please|a little more(?: please)?|再来一点|再来点|还要)$/.test(clean)) return 'more';
      if (/^(?:enough|thats enough|no more|够了|不要了|不用了)$/.test(clean)) return 'enough';
      // Yes/no belongs to the question actually asked, never just the task ID.
      if (/\bmore\b|再来|还要/.test(asked)) {
        if (/^(?:yes|yes please|yeah|yep|好|好的|要)$/.test(clean)) return 'more';
        if (/^(?:no|no thanks|no thank you|不了|不要|不用)$/.test(clean)) return 'enough';
      }
    }
    if (taskId === 'breakfast-cup') {
      if (/^(?:(?:yes|sure|of course) )?(?:here|here you are|here you go|a cup|the cup|cup)(?: please)?$/.test(clean)) return 'place';
      // Agreement is a valid response to this request. It is not an answer to
      // an unrelated yes/no question or merely "I can hear you".
      if (/^(?:can|could|may) i (?:have|get) (?:the |a )?cup(?: please)?$/.test(asked)
        && /^(?:yes|yeah|yep|sure|okay|ok|of course)(?: (?:please|hear you))?$/.test(clean)) return 'place';
      if (/^(?:给你|杯子|给你杯子)$/.test(clean)) return 'place';
    }
    return null;
  }
  function apply(world, taskId, choice) {
    if (taskId === 'breakfast-drink' && ['milk', 'water'].includes(choice) && !world.drink)
      return { ...world, drink: choice };
    if (taskId === 'breakfast-cup' && choice === 'place' && world.drink && !world.cupPlaced)
      return { ...world, cupPlaced: true };
    if (taskId === 'breakfast-more' && ['more', 'enough'].includes(choice) && world.cupPlaced && !world.amount)
      return { ...world, amount: choice };
    return world;
  }
  const facts = world => `Chosen drink: ${world.drink || 'not chosen'}. Cup offered after the learner's response: ${Boolean(world.cupPlaced)}. Amount: ${world.amount || (world.cupPlaced ? 'a little, waiting for more/enough' : 'not poured')}.`;
  const acknowledgment = (taskId, world) => taskId === 'breakfast-drink'
    ? `Okay. ${world.drink === 'water' ? 'Water' : 'Milk'} for you.`
    : taskId === 'breakfast-cup' ? 'Thank you.' : world.amount === 'more' ? 'A little more. Here you go.' : 'Okay. Here you go.';
  return { tasks, initial, isTask, promptFor, choiceFromText, apply, facts, acknowledgment };
})();
if (typeof module !== 'undefined') module.exports = Breakfast;
