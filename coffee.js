/* A spoken coffee order: decisions advance the world, never a screen tap. */
const Coffee = (() => {
  const tasks = [
    { id: 'coffee-order', interaction: 'speech', speaker: 'Mia', requiresAction: false, requiresSpeech: true,
      prompt: 'Would you like a latte or an americano?', label: '选一杯想喝的咖啡',
      hint: '拿铁可以说 Latte，美式可以说 Americano。', choices: ['latte', 'americano'] },
    { id: 'coffee-size', interaction: 'speech', speaker: 'Mia', requiresAction: false, requiresSpeech: true,
      prompt: 'Would you like a small or a large coffee?', label: '告诉店员要多大杯',
      hint: '小杯可以说 Small，大杯可以说 Large。', choices: ['small', 'large'] },
    { id: 'coffee-service', interaction: 'speech', speaker: 'Mia', requiresAction: false, requiresSpeech: true,
      prompt: 'Is that for here or to go?', label: '在这里喝，还是带走',
      hint: '在这里喝可以说 For here，带走可以说 To go。', choices: ['here', 'to-go'] },
    { id: 'coffee-thanks', interaction: 'speech', speaker: 'Mia', requiresAction: false, requiresSpeech: true,
      prompt: 'Here’s your coffee. Enjoy!', label: '接过咖啡，回应一句谢谢',
      hint: '说 Thanks 或 Thank you 就可以。', choices: ['thanks'] },
  ];

  /*
   * C01-C04 are story missions. `tasks` above deliberately remains the small,
   * backwards-compatible conversation-step catalog used by the current UI.
   * Mission state keeps the legacy order fields at the top level so existing
   * visuals can read it without guessing or duplicating facts.
   */
  const missions = [
    {
      id: 'C01', contentVersion: 1, title: '第一次进店，给自己买一杯', kind: 'personal-order',
      mode: 'guided', taskIds: ['coffee-order', 'coffee-size', 'coffee-service', 'coffee-thanks'],
      interaction: 'speech', requiresSpeech: true, requiresAction: false, paymentRequired: false,
      scaffold: { subtitles: true, meaning: true, keywords: true, example: true },
      defaultVariantId: 'C01-free-choice',
      variants: [{ id: 'C01-free-choice', target: null, initialOrder: null, delivered: null }],
    },
    {
      id: 'C02', contentVersion: 1, title: '替朋友带一杯', kind: 'target-order',
      mode: 'supported', taskIds: ['coffee-order', 'coffee-size', 'coffee-service', 'coffee-thanks'],
      interaction: 'speech', requiresSpeech: true, requiresAction: false, paymentRequired: false,
      scaffold: { subtitles: true, meaning: true, keywords: true, example: true },
      defaultVariantId: 'C02-small-latte-to-go',
      variants: [{ id: 'C02-small-latte-to-go', target: { drink: 'latte', size: 'small', service: 'to-go' }, initialOrder: null, delivered: null }],
    },
    {
      id: 'C03', contentVersion: 1, title: '发现杯型不对', kind: 'delivery-repair',
      mode: 'supported', taskIds: ['coffee-size', 'coffee-thanks'],
      interaction: 'speech', requiresSpeech: true, requiresAction: false, paymentRequired: false,
      scaffold: { subtitles: true, meaning: true, keywords: true, example: true },
      defaultVariantId: 'C03-wrong-large',
      variants: [{
        id: 'C03-wrong-large',
        target: { drink: 'latte', size: 'small', service: 'to-go' },
        initialOrder: { drink: 'latte', size: 'small', service: 'to-go' },
        delivered: { drink: 'latte', size: 'large', service: 'to-go' },
      }],
    },
    {
      id: 'C04', contentVersion: 1, title: '独立点一单', kind: 'target-order',
      mode: 'independent', taskIds: ['coffee-order', 'coffee-size', 'coffee-service', 'coffee-thanks'],
      interaction: 'speech', requiresSpeech: true, requiresAction: false, paymentRequired: false,
      scaffold: { subtitles: false, meaning: false, keywords: false, example: false },
      defaultVariantId: 'C04-large-americano-here',
      variants: [
        { id: 'C04-large-americano-here', target: { drink: 'americano', size: 'large', service: 'here' }, initialOrder: null, delivered: null },
        { id: 'C04-large-americano-to-go', target: { drink: 'americano', size: 'large', service: 'to-go' }, initialOrder: null, delivered: null },
        { id: 'C04-small-americano-here', target: { drink: 'americano', size: 'small', service: 'here' }, initialOrder: null, delivered: null },
        { id: 'C04-large-latte-to-go', target: { drink: 'latte', size: 'large', service: 'to-go' }, initialOrder: null, delivered: null },
      ],
    },
  ];
  const ORDER_FIELDS = ['drink', 'size', 'service'];
  const ORDER_VALUES = {
    drink: new Set(['latte', 'americano']),
    size: new Set(['small', 'large']),
    service: new Set(['here', 'to-go']),
  };
  const initial = () => ({ drink: null, size: null, service: null, received: false });
  const isTask = id => tasks.some(task => task.id === id);
  function normalizeWorld(value = {}) {
    const drink = ['latte', 'americano'].includes(value?.drink) ? value.drink : null;
    const size = drink && ['small', 'large'].includes(value?.size) ? value.size : null;
    const service = size && ['here', 'to-go'].includes(value?.service) ? value.service : null;
    return { drink, size, service, received: Boolean(service && value?.received === true) };
  }
  function promptFor(taskId, world = {}) {
    const order = normalizeWorld(world);
    if (taskId === 'coffee-size') return `Would you like a small or a large ${order.drink || 'coffee'}?`;
    if (taskId === 'coffee-thanks') {
      const drink = [order.size, order.drink || 'coffee'].filter(Boolean).join(' ');
      const service = order.service === 'to-go' ? ' to go' : order.service === 'here' ? ' for here' : '';
      return `Here’s your ${drink}${service}. Enjoy!`;
    }
    return tasks.find(task => task.id === taskId)?.prompt;
  }
  const normalize = text => String(text || '').toLowerCase().replace(/[’']/g, '')
    .replace(/[^a-z\p{Script=Han}]+/gu, ' ').trim();
  function isNonDecision(text) {
    const raw = String(text || ''), clean = normalize(text);
    // An explicit polite order is a decision even when written as a question.
    if (/^(?:can|could) i (?:have|get) (?:a |an )?(?:latte|americano|(?:small|large)(?: (?:coffee|latte|americano))?)(?: please)?$/.test(clean)) return false;
    return !clean || /[?？]|什么意思|怎么说|怎么回答|不知道|不确定|不懂|不明白|不会说|说不出来|解释|再说|等一下|帮帮我|也许|可能|不要|不想|不喝/.test(raw)
      || /^(?:yes|yeah|yep|okay|ok|sure|好|好的|嗯|可以)(?: please)?$/.test(clean)
      || /\b(?:maybe|perhaps|not|no|dont|cannot|cant|uncertain|unsure|help|wait|repeat|again|continue)\b/.test(clean)
      || /\b(?:do not|does not|i think|what.*mean|how.*say)\b/.test(clean)
      || /^(?:what|which|where|why|how|is|are|do|does|can|could|would|should)\b/.test(clean);
  }
  function apply(world, taskId, choice) {
    const order = normalizeWorld(world);
    if (taskId === 'coffee-order' && !order.drink && ['latte', 'americano'].includes(choice))
      return { ...order, drink: choice };
    if (taskId === 'coffee-size' && order.drink && !order.size && ['small', 'large'].includes(choice))
      return { ...order, size: choice };
    if (taskId === 'coffee-service' && order.size && !order.service && ['here', 'to-go'].includes(choice))
      return { ...order, service: choice };
    if (taskId === 'coffee-thanks' && order.service && !order.received && choice === 'thanks')
      return { ...order, received: true };
    return world;
  }
  function choiceFromText(taskId, text, world = initial(), question = '') {
    const confirmed = confirmationChoice(taskId, text, question, world);
    if (confirmed) return confirmed;
    if (!isTask(taskId) || isNonDecision(text)) return null;
    const clean = normalize(text).replace(/^(?:can|could) i (?:have|get) /, ''), order = normalizeWorld(world);
    // Open choices require a named option. Yes only confirms a specific offer
    // that was actually asked; it never chooses between two alternatives.
    let choice = null;
    if (taskId === 'coffee-order') {
      const match = clean.match(/^(?:(?:i want|i would like|id like|ill have|i choose) )?(?:a |an )?(latte|americano)(?: coffee)?(?: please| thanks)?$/);
      if (match) choice = match[1];
      if (/^(?:我要|我想要|我想喝|来一杯|一杯)?拿铁$/.test(clean)) choice = 'latte';
      if (/^(?:我要|我想要|我想喝|来一杯|一杯)?美式(?:咖啡)?$/.test(clean)) choice = 'americano';
    } else if (taskId === 'coffee-size') {
      const match = clean.match(/^(?:(?:i want|i would like|id like|ill have) )?(?:a )?(small|large)(?: (?:one|cup|coffee|latte|americano))?(?: please| thanks)?$/);
      if (match && (!/\b(?:latte|americano)\b/.test(clean) || clean.includes(order.drink))) choice = match[1];
      if (/^(?:我要|我想要|来一杯)?小杯$/.test(clean)) choice = 'small';
      if (/^(?:我要|我想要|来一杯)?大杯$/.test(clean)) choice = 'large';
    } else if (taskId === 'coffee-service') {
      if (/^(?:for here|here|ill drink it here|i will drink it here)(?: please| thanks)?$/.test(clean)
        || /^(?:堂食|在这里喝|这里喝)$/.test(clean)) choice = 'here';
      if (/^(?:to go|takeaway|take away|takeout|for takeout)(?: please| thanks)?$/.test(clean)
        || /^(?:带走|打包|我要带走|帮我打包)$/.test(clean)) choice = 'to-go';
    } else if (taskId === 'coffee-thanks') {
      if (/^(?:thanks(?: a lot| so much)?|thank you(?: very much| so much)?|谢谢|谢谢你)$/.test(clean)) choice = 'thanks';
    }
    // Recognition alone cannot complete a later step or rewrite a resolved choice.
    return choice && apply(world, taskId, choice) !== world ? choice : null;
  }
  function acknowledgment(taskId, world = {}) {
    const order = normalizeWorld(world);
    if (taskId === 'coffee-order' && order.drink) return `Okay. ${order.drink === 'latte' ? 'A latte' : 'An americano'}.`;
    if (taskId === 'coffee-size' && order.size) return `Okay. A ${order.size} ${order.drink}.`;
    if (taskId === 'coffee-service' && order.service) return order.service === 'here'
      ? 'For here. Make yourself comfortable.' : 'To go. I’ll have that ready for you.';
    if (taskId === 'coffee-thanks' && order.received) return 'You’re welcome. Have a nice day!';
    return 'Okay.';
  }
  function facts(world = {}) {
    const order = normalizeWorld(world);
    return `Chosen coffee: ${order.drink || 'not chosen'}. Size: ${order.size || 'not chosen'}. Service: ${order.service || 'not chosen'}. Coffee ready to offer: ${Boolean(order.service)}. Received and thanked: ${order.received}.`;
  }

  function confirmationOption(taskId, question, world = {}) {
    // Match a complete, direct offer in the last sentence, not a word mentioned
    // in an explanation, hypothetical, negative question, or earlier turn.
    const last = String(question || '').trim().split(/[.!。！]/).filter(s => s.trim()).at(-1) || '';
    const clean = normalize(last);
    const order = normalizeWorld(world);
    if (taskId === 'coffee-order' && !world.drink) {
      return clean.match(/^(?:would you like|would you prefer|do you want|shall i make you|do you mean) (?:a |an )?(latte|americano)$/)?.[1] || null;
    }
    if (taskId === 'coffee-size' && order.drink && !world.size) {
      const match = clean.match(/^(?:would you like|would you prefer|do you want|do you mean) (?:a )?(small|large)(?: (?:cup|coffee|latte|americano))?$/);
      if (match && (!/\b(?:latte|americano)\b/.test(clean) || clean.includes(order.drink))) return match[1];
    }
    if (taskId === 'coffee-service' && order.size && !world.service) {
      if (/^(?:is (?:that|it|your order)|do you want (?:it|that)) (?:for )?here$/.test(clean)) return 'here';
      if (/^(?:is (?:that|it|your order)|do you want (?:it|that)) to go$/.test(clean)) return 'to-go';
    }
    return null;
  }

  function confirmationChoice(taskId, text, question, world = {}) {
    if (!/^(?:yes|yeah|yep|sure|okay|ok|是的|对|对的|好|好的|可以)(?: please| thanks| thank you)?$/.test(normalize(text))) return null;
    if (world.stage === 'repair' || world.stage === 'complete') return null;
    return confirmationOption(taskId, question, world);
  }

  const unavailableDrinks = /\b(?:cappuccino|espresso|mocha|flat white|tea|juice|hot chocolate)\b|卡布奇诺|浓缩咖啡|摩卡|馥芮白|果汁|热巧克力/;

  function isConversationOnly(text, question = '') {
    const clean = normalize(text), asked = normalize(question);
    if (/\b(?:lets (?:just )?(?:talk|chat)|i (?:just )?want to (?:talk|chat)|not ready to order|dont want to order)\b|聊聊天|聊点别的|先不点|不想点单|自由聊/.test(clean)) return true;
    if (/\b(?:i would like|id like|ill have|i want (?:a |an |small|large|latte|americano)|(?:can|could|may) i (?:have|get|order)|make (?:it|that)|change (?:it|that|my order))\b|我要|我想要|我想点|改成|换成/.test(clean)) return false;
    if (/\b(?:yesterday|last (?:week|night|time)|used to|i (?:usually|often|always) (?:drink|have)|i (?:drank|had)|my (?:mother|father|friend|sister|brother) (?:likes|drinks|wants))\b|昨天|上周|以前|我经常|我平时/.test(clean)) return true;
    if (/\b(?:favou?rite|usually|often|do you like|what do you (?:like|prefer)|tell me about|where are you from|how are you)\b/.test(asked)) return true;
    const directOrderQuestion = /\b(?:would you like|would you prefer|do you want|what can i get|what would you like|what (?:drink|size)|for here or to go)\b/.test(asked);
    return !directOrderQuestion && /^(?:i (?:like|love|prefer)|my favou?rite)|^我喜欢/.test(clean);
  }

  function reminderOrder(text) {
    const clean = normalize(text);
    // A rhetorical reminder affirms the guest's choice. A denial ("I didn't
    // say small") does not. Keep this narrow so ordinary stories stay chat.
    if (/\b(?:yesterday|last (?:week|night|time)|used to|usually|often)\b|昨天|上周|上次|以前|经常|平时/.test(clean)) return null;
    const english = clean.match(/^(?:(?:i|we) (?:have |had )?(?:already )?(?:said|told you|asked for|ordered)|(?:didnt|did not) (?:i|we) (?:already )?(?:say|tell you|ask for|order))\s+(.+)$/);
    const chinese = clean.match(/^(?:(?:我|我们)?不是(?:已经)?|(?:我|我们)(?:已经|早就)?)(?:说过|说了|告诉过你|告诉你|点过|点的)(.+)$/);
    let mentioned = english?.[1] || chinese?.[1];
    if (!mentioned) return null;
    if (chinese) mentioned = mentioned.replace(/(?:了吗|了么|吗|么|嘛|了)$/, '').replace(/^(?:我要|要|是)/, '');
    const original = extractOrder(text);
    const interpretation = original.kind === 'question' ? extractOrder(`I ordered ${mentioned}`) : original;
    if (interpretation.help || interpretation.ambiguousFields.length || !Object.keys(interpretation.slots).length) return null;
    // "I said small or large" is still ambiguous, despite the correction cue.
    if (/\bor\b|还是|或者/.test(mentioned)) return null;
    return interpretation;
  }

  function orderReminderReply(text, world = {}) {
    const state = normalizeMissionWorld(world);
    if (!state || state.stage === 'repair') return '';
    const reminder = reminderOrder(text);
    const entries = reminder && Object.entries(reminder.slots);
    if (!entries?.length || entries.some(([field, value]) => state[field] !== value)) return '';
    const facts = entries.map(([field, value]) => field === 'service'
      ? value === 'here' ? 'for here' : 'to go'
      : field === 'size' ? `a ${value} cup` : value).join(', ');
    return `You're right, ${facts}. Sorry, I've got that noted.`;
  }

  function conversationReply(text, world = {}, { question = '' } = {}) {
    const reminder = orderReminderReply(text, world);
    if (reminder) return reminder;
    const clean = normalize(text);
    const step = nextMissionStep(world);
    if (!step || ['repair', 'handover', 'complete'].includes(step.phase)) return '';
    const interpretation = extractOrder(text);
    // A clear supported choice wins over an aside: "No cappuccino, a latte."
    if (unavailableDrinks.test(clean) && !interpretation.slots.drink) {
      const named = clean.match(unavailableDrinks)?.[0];
      const limit = /^(?:i (?:like|love|prefer)|我喜欢)/.test(clean)
        ? `You like ${named}. We have latte and americano here.`
        : `Sorry, ${named} isn't available here. We have latte and americano.`;
      return world.drink || confirmationOption(step.taskId, question, world)
        ? limit : `${limit} Would you like a latte?`;
    }
    if (/\bmenu\b|菜单|价目表/.test(clean)) {
      return "We don't have a menu here. We have latte and americano.";
    }
    if (/^(?:i know|i understand|知道了|我知道)$/.test(clean)) return 'Of course. Take your time.';
    const affirmative = /^(?:yes|yeah|yep|sure|okay|ok|i know|i understand|是的|对|对的|好|好的|嗯|可以|知道了|我知道)(?: please| thanks| thank you)?$/.test(clean);
    const negative = /^(?:no|nope|not really|no thank you|no thanks|不要|不是|不|不想要)$/.test(clean);
    if (!affirmative && !negative) return '';
    if (confirmationChoice(step.taskId, text, question, world)) return '';
    const previous = confirmationOption(step.taskId, question, world);
    if (negative && /would you prefer|do you want it to go/i.test(question)) return 'No problem. Take your time.';
    if (step.field === 'drink') return previous === 'latte'
      ? 'Would you prefer an americano?' : 'Would you like a latte?';
    if (step.field === 'size') return previous === 'small'
      ? `Would you prefer a large ${world.drink || 'coffee'}?` : `Would you like a small ${world.drink || 'coffee'}?`;
    return previous === 'here' ? 'Do you want it to go?' : 'Is that for here?';
  }

  function replyViolatesScene(text) {
    return String(text || '').split(/[.!?。！？]+/).some(sentence => {
      const clean = normalize(sentence);
      const menuClaim = /\b(?:show|bring|give|hand|look|see|read|point)\b.*\bmenu\b|\bmenu (?:is|right|over|here|there)\b|(?:给你|看看|这[里是]|那[里是]|拿|递).*菜单/.test(clean)
        && !/\b(?:no menu|isnt a menu|is not a menu|dont have a menu|cannot show|cant show)\b|没有菜单|不显示菜单/.test(clean);
      const unavailableClaim = unavailableDrinks.test(clean)
        && /\b(?:we have|we serve|we offer|i can (?:make|get|offer)|ill (?:make|get|prepare)|i will (?:make|get|prepare)|here is your|heres your|your .+ is ready|coming right up|okay|got it)\b|给你(?:做|准备)|(?:有|提供|这是你的).*卡布奇诺/.test(clean)
        && !/\b(?:dont have|do not have|dont serve|cannot|cant|not available|isnt available|is not available|isnt one of)\b|没有|不提供/.test(clean);
      return menuClaim || unavailableClaim;
    });
  }

  function getMission(missionId) {
    return missions.find(mission => mission.id === missionId);
  }

  function getVariant(mission, variantId) {
    if (!mission) return undefined;
    return mission.variants.find(variant => variant.id === (variantId || mission.defaultVariantId));
  }

  function cleanOrder(value = {}) {
    return Object.fromEntries(ORDER_FIELDS.map(field => [field, ORDER_VALUES[field].has(value?.[field]) ? value[field] : null]));
  }

  function copyOrder(value) {
    if (!value) return null;
    const order = cleanOrder(value);
    return ORDER_FIELDS.every(field => order[field]) ? order : null;
  }

  const sameOrder = (left, right) => Boolean(left && right && ORDER_FIELDS.every(field => left[field] === right[field]));

  function missionSpec(missionId = 'C01', variantId) {
    const mission = getMission(missionId);
    const variant = getVariant(mission, variantId);
    return mission && variant ? { mission, variant } : null;
  }

  function repairState(mission, variant, resolved = false) {
    if (mission.kind !== 'delivery-repair') return { required: false, resolved: true, field: null, expected: null, actual: null };
    const target = cleanOrder(variant.target), originalDelivery = cleanOrder(variant.delivered);
    const field = ORDER_FIELDS.find(key => target[key] !== originalDelivery[key]) || null;
    return { required: Boolean(field && !resolved), resolved: resolved || !field, field,
      expected: field ? target[field] : null, actual: field ? originalDelivery[field] : null };
  }

  function missionInitial(missionId = 'C01', variantId) {
    const spec = missionSpec(missionId, variantId);
    if (!spec) return null;
    const { mission, variant } = spec;
    const order = cleanOrder(variant.initialOrder);
    const target = copyOrder(variant.target);
    const delivered = copyOrder(variant.delivered);
    const repair = repairState(mission, variant, false);
    return {
      schemaVersion: 1,
      contentVersion: mission.contentVersion,
      missionId: mission.id,
      variantId: variant.id,
      mode: mission.mode,
      scaffold: { ...mission.scaffold },
      ...order,
      received: false,
      target,
      delivered,
      repair,
      stage: mission.kind === 'delivery-repair' && repair.required ? 'repair' : 'order',
      revision: 0,
      appliedEventIds: [],
    };
  }

  function rawComparison(world, mission, target, delivered) {
    const order = cleanOrder(world);
    const missing = ORDER_FIELDS.filter(field => !order[field]);
    const mismatches = target ? ORDER_FIELDS
      .filter(field => order[field] && order[field] !== target[field])
      .map(field => ({ field, expected: target[field], actual: order[field] })) : [];
    const targetMatches = target ? missing.length === 0 && mismatches.length === 0 : null;
    // The brief is learning context, not a condition of service. Fulfil the
    // guest's actual order even when it differs from the suggested order.
    const ready = missing.length === 0;
    const deliveryReference = ready ? order : null;
    const deliveryMissing = deliveryReference && !delivered
      ? [...ORDER_FIELDS]
      : deliveryReference ? ORDER_FIELDS.filter(field => !delivered[field]) : [];
    const deliveryMismatches = deliveryReference && delivered ? ORDER_FIELDS
      .filter(field => delivered[field] && delivered[field] !== deliveryReference[field])
      .map(field => ({ field, expected: deliveryReference[field], actual: delivered[field] })) : [];
    const deliveryMatches = Boolean(deliveryReference && delivered && deliveryMissing.length === 0 && deliveryMismatches.length === 0);
    return {
      missing,
      mismatches,
      targetRequired: mission.kind === 'delivery-repair',
      targetMatches,
      orderReady: ready,
      deliveryMissing,
      deliveryMismatches,
      deliveryMatches,
      repairRequired: mission.kind === 'delivery-repair' && deliveryMismatches.length > 0,
    };
  }

  function normalizeMissionWorld(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const spec = missionSpec(value?.missionId || 'C01', value?.variantId);
    if (!spec) return null;
    const { mission, variant } = spec;
    const base = missionInitial(mission.id, variant.id);
    const target = copyOrder(variant.target);
    const acceptedAsDelivered = mission.kind === 'delivery-repair' && value?.acceptedAsDelivered === true
      && sameOrder(copyOrder(value.delivered), variant.delivered);
    const suppliedOrder = mission.kind === 'delivery-repair'
      ? cleanOrder(acceptedAsDelivered ? value.delivered : variant.initialOrder) : cleanOrder(value);
    const order = suppliedOrder;
    const savedDelivery = copyOrder(value?.delivered);
    const resolved = mission.kind === 'delivery-repair' && value?.repair?.resolved === true && sameOrder(savedDelivery, target);
    let delivered = mission.kind === 'delivery-repair'
      ? copyOrder(resolved ? target : variant.delivered)
      : null;
    let comparison = rawComparison(order, mission, target, delivered);
    if (mission.kind !== 'delivery-repair' && comparison.orderReady) {
      delivered = copyOrder(order);
      comparison = rawComparison(order, mission, target, delivered);
    }
    const canReceive = comparison.orderReady && comparison.deliveryMatches && !comparison.repairRequired;
    const received = Boolean(canReceive && value?.received === true);
    const stage = comparison.repairRequired ? 'repair' : !comparison.orderReady ? 'order' : received ? 'complete' : 'handover';
    const revision = Number.isSafeInteger(value?.revision) && value.revision >= 0 ? value.revision : 0;
    const appliedEventIds = Array.isArray(value?.appliedEventIds)
      ? [...new Set(value.appliedEventIds.filter(id => typeof id === 'string' && id.trim()).map(id => id.trim()))]
      : [];
    return {
      ...base,
      ...order,
      ...(acceptedAsDelivered ? { acceptedAsDelivered: true } : {}),
      received,
      target,
      delivered,
      repair: repairState(mission, variant, !comparison.repairRequired),
      stage,
      revision,
      appliedEventIds,
    };
  }

  function compareOrder(world = {}) {
    const state = normalizeMissionWorld(world);
    if (!state) return null;
    const mission = getMission(state.missionId);
    return rawComparison(state, mission, state.target, state.delivered);
  }

  function supportIntent(clean) {
    if (/\b(?:say|tell) (?:it|that|this) again\b|\b(?:repeat|again please|come again)\b|再说一遍|再说一次|重复一下|没听清/.test(clean)) return 'repeat';
    if (/\bwhat (?:does|do|is|are)\b.*\bmean|\bwhat do you mean\b|什么意思|什么叫|听不懂|没听懂|不明白/.test(clean)) return 'meaning';
    if (/\bhow (?:do|can|should) i say\b|\bwhat should i say\b|怎么说|怎么回答|不会说|说不出来/.test(clean)) return 'example';
    if (/\b(?:help|wait|hold on|one moment)\b|帮帮我|帮我一下|等一下|稍等/.test(clean)) return 'help';
    if (/\b(?:i dont know|i do not know|not sure|unsure)\b|不知道|不确定/.test(clean)) return 'uncertain';
    return null;
  }

  function collectOrderCandidates(clean) {
    const candidates = { drink: [], size: [], service: [] };
    const add = (field, value, expression) => {
      for (const match of clean.matchAll(expression)) {
        const clauseStart = clean.lastIndexOf('|', match.index) + 1;
        const nextSeparator = clean.indexOf('|', match.index);
        const clauseEnd = nextSeparator < 0 ? clean.length : nextSeparator;
        const prefix = clean.slice(clauseStart, match.index);
        const suffix = clean.slice(match.index + match[0].length, clauseEnd);
        const negativeMarks = [...prefix.matchAll(/\b(?:dont|do not)\s+(?:want|need)\b|\b(?:not|without)\b|不是|不要|不想要|不需要|别要/g)];
        const resetMarks = [...prefix.matchAll(/\b(?:but|actually|instead|i want|i would like|id like|make that|make it)\b|但是|不过|改成|换成|我要|我想要|其实/g)];
        const lastNegative = negativeMarks.at(-1)?.index ?? -1;
        const lastReset = resetMarks.at(-1)?.index ?? -1;
        const rejectedAfterValue = /^\s*(?:(?:is|was)\s+not|(?:isnt|wasnt))\s+(?:what\s+i\s+(?:want|ordered|asked for)|the\s+(?:one|drink|size)\s+i\s+(?:want|ordered|asked for))\b|^\s*不是(?:我|我们)?(?:想要|要|点|订|选)的/.test(suffix);
        const negated = lastNegative > lastReset || rejectedAfterValue;
        const intended = /\b(?:i|we)\s+(?:ordered|asked for|wanted|want|would like|need)(?:\s+(?:a|an|the))?\s*$/.test(prefix)
          || /(?:我|我们)?(?:点|要|想要|订|选)(?:的)?是(?:一杯|一个|个)?\s*$/.test(prefix);
        const observed = /\b(?:but|however)?\s*(?:this|it|that)(?:\s+one)?\s+(?:is|was)\s*$/.test(prefix)
          || /(?:但|但是|不过)?\s*(?:这|这个|它|拿到的|收到的|给我的|给的)(?:杯)?(?:是)?\s*$/.test(prefix);
        candidates[field].push({ value, index: match.index, negated, role: intended ? 'intended' : observed ? 'observed' : null });
      }
    };
    add('drink', 'latte', /\b(?:cafe latte|caffe latte|latte)\b|拿铁/g);
    add('drink', 'americano', /\b(?:americano|american coffee)\b|美式(?:咖啡)?/g);
    add('size', 'small', /\b(?:small|smaller|smallest|little)\b|小杯/g);
    add('size', 'large', /\b(?:large|larger|largest|big|bigger|biggest)\b|大杯/g);
    add('service', 'here', /\b(?:for here|dine in|drink it here|have it here|stay here|here)\b|堂食|(?:在|留在|坐在)?(?:这|这里|店里)喝/g);
    add('service', 'to-go', /\b(?:to go|takeaway|take away|takeout|take out|take it with me)\b|带走|打包|外带/g);
    return candidates;
  }

  function extractOrder(text) {
    const raw = String(text || '').trim();
    const clean = normalize(raw);
    const candidateText = raw.toLowerCase().replace(/[’']/g, '')
      .replace(/[,.!?;:，。！？；：]+/g, ' | ')
      .replace(/[^a-z\p{Script=Han}|]+/gu, ' ').trim();
    const language = /\p{Script=Han}/u.test(raw) ? 'zh' : 'en';
    const help = supportIntent(clean);
    const empty = { slots: {}, explicitCorrection: false, repairIntent: false, gratitude: false,
      help, ambiguousFields: [], intendedSlots: {}, observedSlots: {}, language, kind: help ? 'help' : 'empty' };
    if (!clean || help) return empty;
    const politeOrderQuestion = /^(?:(?:hi|hello|hey|good morning|good afternoon|good evening)(?: mia)? )?(?:can|could|may) i (?:have|get|order)\b/.test(clean);
    // A conversational tail does not turn a clear choice into a question.
    const choiceWithTag = /^(?:for here|to go|small|large|(?:a |an )?(?:latte|americano))[,， ]+(?:you know|okay|ok|please)[?？.!。！]*$/i.test(raw);
    const informationQuestion = !politeOrderQuestion && !choiceWithTag && (/[?？]/.test(raw)
      || /^(?:what|which|where|why|how|is|are|do|does|can|could|would|should)\b/.test(clean)
      || /(?:吗|是不是|是什么)$/.test(clean));
    if (informationQuestion) return { ...empty, kind: 'question' };
    if (/^(?:yes|yeah|yep|okay|ok|sure|好|好的|嗯|可以)(?: please)?$/.test(clean)) return { ...empty, kind: 'ambiguous' };
    const gratitude = !/^(?:no thanks|不用谢|不 谢谢)$/.test(clean)
      && /\b(?:thanks|thank you)(?: very much| so much| a lot)?\b|^(?:you too|have a (?:nice|good|lovely) day)$|谢谢(?:你)?/.test(clean);
    let explicitCorrection = /\b(?:actually|sorry|instead|rather|change|changed|make (?:that|it)|i mean|i said|correction|no|not|dont|do not|should be|ordered|asked for)\b|改成|改为|换成|不是|不要|不想要|不对|说错|应该是|其实|还是|我点的是|我要换|(?:^|\s)不(?:\s|$)/.test(clean);
    let repairIntent = explicitCorrection
      || /\b(?:wrong|mistake|isnt right|is not right|thats not right|not what i ordered)\b|错了|不对|不是我点的/.test(clean);
    const candidates = collectOrderCandidates(candidateText);
    const describesIntendedAndObserved = ORDER_FIELDS.some(field =>
      candidates[field].some(candidate => !candidate.negated && candidate.role === 'intended')
      && candidates[field].some(candidate => !candidate.negated && candidate.role === 'observed'));
    if (describesIntendedAndObserved) {
      explicitCorrection = true;
      repairIntent = true;
    }
    const slots = {}, intendedSlots = {}, observedSlots = {}, ambiguousFields = [];
    for (const field of ORDER_FIELDS) {
      const positive = candidates[field].filter(candidate => !candidate.negated).sort((a, b) => a.index - b.index);
      const intended = positive.filter(candidate => candidate.role === 'intended');
      const observed = positive.filter(candidate => candidate.role === 'observed');
      const distinct = [...new Set(positive.map(candidate => candidate.value))];
      if (intended.length) intendedSlots[field] = intended.at(-1).value;
      if (observed.length) observedSlots[field] = observed.at(-1).value;
      if (distinct.length > 1 && !explicitCorrection) ambiguousFields.push(field);
      else if (intended.length) slots[field] = intended.at(-1).value;
      else if (positive.length) slots[field] = positive.at(-1).value;
    }
    const hasRejectedChoice = ORDER_FIELDS.some(field => candidates[field].some(candidate => candidate.negated));
    const kind = ambiguousFields.length ? 'ambiguous' : Object.keys(slots).length ? 'order'
      : gratitude ? 'gratitude' : hasRejectedChoice ? 'negated' : 'empty';
    return { slots, explicitCorrection, repairIntent, gratitude, help: null, ambiguousFields,
      intendedSlots, observedSlots, language, kind };
  }

  function orderPhrase(order = {}) {
    const article = order.size ? `a ${order.size}` : 'a';
    const drink = order.drink || 'coffee';
    const service = order.service === 'to-go' ? ' to go' : order.service === 'here' ? ' for here' : '';
    return `${article} ${drink}${service}`;
  }

  function nextMissionStep(world = {}) {
    const state = normalizeMissionWorld(world);
    if (!state) return null;
    const comparison = compareOrder(state);
    if (state.stage === 'complete') return { taskId: null, phase: 'complete', field: null };
    if (state.stage === 'repair') return { taskId: 'coffee-size', phase: 'repair', field: state.repair.field };
    if (state.stage === 'handover') return { taskId: 'coffee-thanks', phase: 'handover', field: null };
    const field = comparison.missing[0];
    const taskIds = { drink: 'coffee-order', size: 'coffee-size', service: 'coffee-service' };
    return { taskId: taskIds[field], phase: 'collect', field };
  }

  function nextPrompt(world = {}) {
    const state = normalizeMissionWorld(world);
    if (!state) return undefined;
    const mission = getMission(state.missionId), comparison = compareOrder(state);
    if (state.stage === 'complete') return 'You’re welcome. Have a nice day!';
    if (state.stage === 'repair') return `Here’s your ${orderPhrase(state.delivered).replace(/^a /, '')}. Is everything okay?`;
    if (state.stage === 'handover') return `Here’s your ${orderPhrase(state.delivered).replace(/^a /, '')}. Enjoy!`;
    if (comparison.missing.length) {
      const field = comparison.missing[0];
      if (field === 'drink') return mission.mode === 'independent' ? 'What can I get for you?' : 'Would you like a latte or an americano?';
      if (field === 'size') return `Would you like a small or a large ${state.drink || 'coffee'}?`;
      return 'Is that for here or to go?';
    }
    return 'Take your time.';
  }

  function missionResult(world, details = {}) {
    if (!world) return { accepted: false, handled: false, reason: 'unknown-mission', help: null,
      changedFields: [], corrections: [], ...details, world: null, comparison: null, nextStep: null, prompt: undefined };
    const comparison = compareOrder(world);
    const step = nextMissionStep(world);
    return { accepted: false, handled: false, reason: 'no-decision', help: null, changedFields: [], corrections: [],
      ...details, world, comparison, nextStep: step,
      prompt: Object.prototype.hasOwnProperty.call(details, 'prompt') ? details.prompt : nextPrompt(world) };
  }

  function eventIdsWith(state, eventId) {
    if (typeof eventId !== 'string' || !eventId.trim()) return state.appliedEventIds;
    return [...state.appliedEventIds, eventId.trim()];
  }

  function advanceMission(world, text, options = {}) {
    const state = normalizeMissionWorld(world);
    if (!state) return missionResult(null, { reason: 'unknown-mission' });
    const eventId = typeof options.eventId === 'string' ? options.eventId.trim() : '';
    if (eventId && state.appliedEventIds.includes(eventId)) return missionResult(state, { handled: true, reason: 'replayed-event' });
    if (Number.isSafeInteger(options.expectedRevision) && options.expectedRevision !== state.revision)
      return missionResult(state, { handled: true, reason: 'stale-state' });
    const reminder = orderReminderReply(text, state);
    if (reminder) return missionResult(state, { handled: true, reason: 'order-reminder', prompt: reminder });
    if (isConversationOnly(text, options.question)) return missionResult(state, { handled: true, reason: 'conversation', prompt: '' });
    const confirmed = confirmationChoice(nextMissionStep(state)?.taskId, text, options.question, state);
    // A reminder during an actual wrong-cup delivery must correct that delivery,
    // including rhetorical "Didn't I say small?", instead of merely apologizing.
    const interpretation = (state.stage === 'repair' && reminderOrder(text)) || extractOrder(confirmed || text);
    if (interpretation.help) return missionResult(state, { handled: true, reason: 'help', help: interpretation.help, interpretation });
    if (interpretation.ambiguousFields.length) return missionResult(state, { handled: true, reason: 'ambiguous', interpretation });
    if (state.stage === 'complete') return missionResult(state, { handled: true, reason: 'already-complete', interpretation });
    const conversationalReply = !confirmed && conversationReply(text, state, options);
    if (conversationalReply) return missionResult(state, { handled: true, reason: 'conversation-repair', interpretation, prompt: conversationalReply });

    if (state.stage === 'repair') {
      const acceptsVisibleCup = /^(?:ill keep (?:it|this one)|i will keep (?:it|this one)|(?:this|that|it|large) is (?:fine|okay|ok)|thats (?:fine|okay|ok)|就这杯吧|大杯也可以|这样也可以)$/.test(normalize(text))
        || (/^(?:yes|yes please|是的|可以)$/.test(normalize(text)) && /is everything (?:okay|ok)$/.test(normalize(options.question)));
      if (acceptsVisibleCup) {
        const next = normalizeMissionWorld({ ...state, acceptedAsDelivered: true,
          revision: state.revision + 1, appliedEventIds: eventIdsWith(state, eventId) });
        // Accepting the delivered cup is a valid service outcome, not evidence
        // that the learner practised correcting a wrong size.
        return missionResult(next, { accepted: true, handled: true, reason: 'delivery-accepted', changedFields: [], interpretation });
      }
      const comparison = compareOrder(state);
      const needed = comparison.deliveryMismatches;
      const identifiesEveryRepair = needed.length > 0 && needed.every(item => interpretation.slots[item.field] === item.expected);
      const contradictsTarget = Object.entries(interpretation.slots).some(([field, value]) => state.target?.[field] !== value);
      const contradictsDelivery = Object.entries(interpretation.observedSlots)
        .some(([field, value]) => state.delivered?.[field] !== value);
      if (!identifiesEveryRepair || contradictsTarget || contradictsDelivery) return missionResult(state, {
        handled: interpretation.repairIntent || Object.keys(interpretation.slots).length > 0,
        reason: interpretation.repairIntent ? 'repair-needs-correct-value' : 'repair-not-resolved', interpretation,
        ...(interpretation.repairIntent ? { prompt: state.repair.field === 'size' ? 'What size did you order?'
          : state.repair.field === 'drink' ? 'What did you order?'
          : 'Was it for here or to go?' } : {}),
      });
      const next = normalizeMissionWorld({ ...state, delivered: state.target, repair: { ...state.repair, resolved: true },
        revision: state.revision + 1, appliedEventIds: eventIdsWith(state, eventId) });
      return missionResult(next, { accepted: true, handled: true, reason: 'delivery-repaired',
        changedFields: needed.map(item => `delivered.${item.field}`), interpretation });
    }

    if (state.stage === 'handover' && interpretation.gratitude && Object.keys(interpretation.slots).length === 0) {
      const next = normalizeMissionWorld({ ...state, received: true, revision: state.revision + 1,
        appliedEventIds: eventIdsWith(state, eventId) });
      return missionResult(next, { accepted: true, handled: true, reason: 'mission-complete', changedFields: ['received'], interpretation });
    }

    const entries = Object.entries(interpretation.slots);
    if (!entries.length) return missionResult(state, { handled: interpretation.gratitude || interpretation.kind !== 'empty',
      reason: interpretation.gratitude ? 'not-ready' : interpretation.kind === 'question' ? 'question' : 'no-decision', interpretation });
    const explicitlyAllowed = new Set(Array.isArray(options.allowCorrectionFields) ? options.allowCorrectionFields : []);
    const conflicts = entries.filter(([field, value]) => state[field] && state[field] !== value);
    const blocked = conflicts.filter(([field]) => !interpretation.explicitCorrection
      && !explicitlyAllowed.has(field));
    if (blocked.length) return missionResult(state, { handled: true, reason: 'correction-needs-signal',
      pendingCorrections: blocked.map(([field, value]) => ({ field, from: state[field], to: value })), interpretation });
    const changedFields = entries.filter(([field, value]) => state[field] !== value).map(([field]) => field);
    if (!changedFields.length) return missionResult(state, { handled: true, reason: 'already-confirmed', interpretation });
    const corrections = conflicts.map(([field, value]) => ({ field, from: state[field], to: value }));
    const update = Object.fromEntries(entries);
    const next = normalizeMissionWorld({ ...state, ...update, received: false,
      revision: state.revision + 1, appliedEventIds: eventIdsWith(state, eventId) });
    const nextStep = nextMissionStep(next);
    const partialAcknowledgment = nextStep?.taskId === nextMissionStep(state)?.taskId
      ? `Got it: ${changedFields.map(field => next[field] === 'here' ? 'for here' : next[field] === 'to-go' ? 'to go' : next[field]).join(', ')}. ${nextPrompt(next)}` : '';
    return missionResult(next, { accepted: true, handled: true, reason: corrections.length ? 'order-corrected' : 'order-updated',
      changedFields, corrections, interpretation, ...(partialAcknowledgment ? { prompt: partialAcknowledgment } : {}) });
  }

  function missionComplete(world = {}) {
    const state = normalizeMissionWorld(world), comparison = state && compareOrder(state);
    return Boolean(state?.received && comparison?.orderReady && comparison?.deliveryMatches && !comparison?.repairRequired);
  }

  function missionFacts(world = {}) {
    const state = normalizeMissionWorld(world);
    if (!state) return 'Unknown coffee mission.';
    const comparison = compareOrder(state);
    const values = order => order ? `${order.size} ${order.drink} ${order.service}` : 'none';
    return `Mode: ${state.mode}. Confirmed order: ${values(state)}. Delivered: ${values(state.delivered)}. Stage: ${state.stage}. Missing: ${comparison.missing.join(', ') || 'none'}. Repair required: ${comparison.repairRequired}. Complete: ${missionComplete(state)}.`;
  }

  // The character may explain an option, but must not claim it was chosen
  // before the mission engine has committed it. This is deliberately an
  // assertion check, not another interpreter for learner answers.
  function replyContradictsOrder(text, world = {}) {
    world ||= {};
    const sentences = String(text || '').replace(/[’']/g, '').split(/(?<=[.!?。！？])\s*/u);
    const isConfirmation = value => /\b(?:okay|ok|got it|understood|noted|confirmed|all right|alright)\b/.test(value)
      || /好的|好[，,]|明白了|知道了|记下了|收到|已确认|确认了|没问题/.test(value);
    let precedingConfirmation = false;
    for (const [index, sentence] of sentences.entries()) {
      const clean = sentence.toLowerCase().trim();
      if (!clean) continue;
      const question = /[?？]/.test(clean)
        || /^(?:would|could|can|do|did|does|is|are|was|were|what|which|why|how)\b/.test(clean)
        || /(?:吗|呢|是不是|要不要|还是)/.test(clean);
      const explanation = /\b(?:means?|meaning|example|for instance|you (?:can|could|should) say|say|repeat after me|word|translat\w*)\b/.test(clean)
        || /意思|翻译|比如|例如|可以说|你说|跟我说|这个词|读作|怎么说/.test(clean);
      const notChosen = /\b(?:havent|hasnt|have not|has not|didnt|did not|not yet)\b/.test(clean)
        || /还没|尚未|没有(?:选|点|确认)|不是(?:说|已经|你)/.test(clean);
      if (question || explanation || notChosen) { precedingConfirmation = false; continue; }

      const confirmation = isConfirmation(clean);
      const followingConfirmation = /^(?:okay|ok|got it|understood|noted|confirmed|好的|明白了|记下了)[.!。！]*$/i.test(sentences[index + 1]?.trim() || '');
      const orderAssertion = /\b(?:you (?:chose|chosen|picked|selected|ordered|want|wanted)|(?:you have|youve) (?:chosen|picked|selected|ordered)|your order|ill (?:make|get|prepare)|i will (?:make|get|prepare))\b/.test(clean)
        || /你(?:已经)?(?:选|点|要)的是|给你(?:做|准备|换成)|就(?:选|做|定)(?:成|为)?|已经(?:给你)?(?:选|点|改|换|确认)|已(?:选|点|改|换|确认)/.test(clean);
      const handover = /\b(?:heres|here is|here are) your\b|\byour .+ is ready\b/.test(clean)
        || /你的.*(?:好了|做好了)|这是你的|给你.*(?:咖啡|拿铁|美式)/.test(clean);
      const assertsChoice = confirmation || precedingConfirmation || followingConfirmation || orderAssertion || handover;
      precedingConfirmation = confirmation;
      if (!assertsChoice) continue;

      const candidateText = clean
        .replace(/\b(?:heres|here is|here are) your\b|\bhere you (?:are|go)\b/g, ' ')
        .replace(/[,;:，；：]+/g, ' | ')
        .replace(/[^a-z\p{Script=Han}|]+/gu, ' ').trim();
      const candidates = collectOrderCandidates(candidateText);
      // An intentional wrong delivery in C03 is part of the scene. Describe
      // the visible delivery accurately without rewriting the requested order.
      const facts = handover && Object.hasOwn(world, 'delivered') ? world.delivered || {} : world;
      for (const field of ORDER_FIELDS) {
        if (candidates[field].some(candidate => !candidate.negated && candidate.value !== facts?.[field])) return true;
      }
    }
    return false;
  }

  return {
    tasks, initial, isTask, normalizeWorld, promptFor, isNonDecision, choiceFromText, apply, acknowledgment, facts,
    missions, getMission, missionInitial, normalizeMissionWorld, extractOrder, compareOrder, nextMissionStep,
    nextPrompt, advanceMission, applyMissionTurn: advanceMission, missionComplete, missionFacts, replyContradictsOrder,
    confirmationChoice, conversationReply, orderReminderReply, replyViolatesScene, isConversationOnly,
  };
})();
if (typeof module !== 'undefined') module.exports = Coffee;
