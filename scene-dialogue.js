/* Pure turn coordination. Scene adapters own facts; the runtime owns delivery. */
const SceneDialogue = (() => {
  const coffee = typeof module !== 'undefined' && module.exports ? require('./coffee') : Coffee;
  const breakfast = typeof module !== 'undefined' && module.exports ? require('./breakfast') : Breakfast;
  const rules = typeof module !== 'undefined' && module.exports ? require('./dialogue-rules') : DialogueRules;
  const conversation = () => ({ kind: 'conversation', feedback: { conversational: true } });
  const unresolved = () => ({ kind: 'unresolved', feedback: { meaning_valid: false, choice: null } });
  const ignored = reason => ({ kind: 'ignored', feedback: { discarded: true, reason, meaning_valid: false, choice: null } });
  const validMeaning = candidate => candidate?.meaning_valid === true || String(candidate?.meaning_valid).toLowerCase() === 'true';
  const coffeeFields = { drink: 'coffee-order', size: 'coffee-size', 'delivered.size': 'coffee-size',
    service: 'coffee-service', received: 'coffee-thanks' };
  const coffeeOptions = input => ({ eventId: input.eventId, expectedRevision: input.expectedRevision, question: input.question });
  const breakfastNext = world => !world.drink ? 'breakfast-drink' : !world.cupPlaced ? 'breakfast-cup' : !world.amount ? 'breakfast-more' : null;
  function coffeeResult(result, taskId) {
    if (['stale-state', 'replayed-event'].includes(result.reason)) return ignored(result.reason);
    const conversational = ['conversation', 'question', 'not-ready'].includes(result.reason)
      || (result.reason === 'no-decision' && result.interpretation?.kind !== 'ambiguous')
      || (result.reason === 'repair-not-resolved' && !Object.keys(result.interpretation?.slots || {}).length);
    const field = Object.keys(coffeeFields).find(key => coffeeFields[key] === taskId && !key.includes('.'));
    const choice = result.accepted && (field === 'received' ? result.world.received && 'thanks'
      : result.interpretation?.slots?.[field]);
    return { kind: result.accepted ? 'decision' : result.reason === 'help' ? 'help' : conversational ? 'conversation' : 'clarify',
      feedback: { meaning_valid: result.accepted, ...(choice ? { choice } : {}), missionResult: result },
      changedTaskIds: [...new Set((result.changedFields || []).map(field => coffeeFields[field]).filter(Boolean))],
      nextTaskId: result.nextStep?.taskId || null };
  }
  const defaults = {
    coffee: {
      tasks: coffee.tasks, fields: coffeeFields, worldKey: 'coffee', promptFor: coffee.promptFor,
      isConversationOnly: coffee.isConversationOnly,
      constraints: 'Only latte/americano, small/large, here/to-go are available. Respect actual choices, including keeping a delivered cup. A teaching target never overrides an order. No menu, payment, or unsupported item may be invented.',
      facts: world => world?.missionId ? coffee.missionFacts(world) : coffee.facts(world || {}),
      evaluate(input) {
        if (!input.world?.missionId) {
          const choice = coffee.choiceFromText(input.taskId, input.answer, input.world || {}, input.question);
          if (choice) return { kind: 'decision', feedback: { meaning_valid: true, choice }, changedTaskIds: [input.taskId] };
          if (coffee.isNonDecision(input.answer) || coffee.conversationReply(input.answer, input.world || {}, { question: input.question }))
            return { kind: 'clarify', feedback: { meaning_valid: false, choice: null } };
          return unresolved();
        }
        if (coffee.nextMissionStep(input.world)?.taskId !== input.taskId) return { kind: 'clarify', feedback: { meaning_valid: false, choice: null } };
        const result = coffee.advanceMission(input.world, input.answer, coffeeOptions(input));
        if (!result.accepted && rules.isSmallTalk(input.answer)) return conversation();
        if (result.accepted || result.handled) return coffeeResult(result, input.taskId);
        const requestsOrder = /\b(?:i want|i would like|i['’]d like|i['’]ll have|(?:can|could|may) i (?:have|get|order))\b|我要|我想要|我想点/i.test(input.answer);
        return requestsOrder ? unresolved() : conversation();
      },
      validateCandidate(input, candidate) {
        if (input.world?.missionId) {
          if (coffee.nextMissionStep(input.world)?.taskId !== input.taskId) return { meaning_valid: false, choice: null };
          const intent = coffee.extractOrder(input.answer);
          const result = coffee.advanceMission(input.world, candidate.choice, { ...coffeeOptions(input),
            ...(intent.explicitCorrection || intent.explicitRequest ? { allowCorrectionFields: ['drink', 'size', 'service'] } : {}) });
          return result.accepted ? { meaning_valid: true, choice: candidate.choice, missionResult: result } : { meaning_valid: false, choice: null };
        }
        const world = input.world || coffee.initial();
        return { meaning_valid: coffee.apply(world, input.taskId, candidate.choice) !== world, choice: candidate.choice };
      },
    },
    kitchen: {
      tasks: breakfast.tasks, worldKey: 'breakfast', promptFor: breakfast.promptFor,
      fields: { drink: 'breakfast-drink', cupPlaced: 'breakfast-cup', amount: 'breakfast-more' },
      constraints: 'Only milk/water, offering the cup, and more/enough are supported. Respect the actual question and existing world prerequisites. Chat, preferences, and past events never change breakfast facts.',
      facts: world => breakfast.facts(world || breakfast.initial()),
      evaluate(input) {
        const choice = breakfast.choiceFromText(input.taskId, input.answer, input.question);
        if (!choice) return unresolved();
        if (!input.world) return { kind: 'decision', feedback: { meaning_valid: true, choice }, changedTaskIds: [input.taskId] };
        const world = input.world || breakfast.initial(), next = breakfast.apply(world, input.taskId, choice);
        return next === world ? conversation() : { kind: 'decision', feedback: { meaning_valid: true, choice },
          changedTaskIds: [input.taskId], nextTaskId: breakfastNext(next) };
      },
      validateCandidate(input, candidate) {
        if (!input.world) return { meaning_valid: true, choice: candidate.choice };
        const world = input.world || breakfast.initial();
        const accepted = breakfast.apply(world, input.taskId, candidate.choice) !== world;
        return { meaning_valid: accepted, choice: accepted ? candidate.choice : null };
      },
    },
  };
  const conversationalTasks = {
    airport: [
      { id: 'ticket', interaction: 'speech', requiresAction: false, prompt: 'May I see your ticket?', hint: '直接说 Here you are；不用点击登机牌。' },
      { id: 'bag', interaction: 'speech', requiresAction: false, prompt: 'Is this your bag?', hint: '直接回答 Luma，不需要点击行李箱。' },
      { id: 'gate-a12', interaction: 'speech', requiresAction: false, prompt: 'Which gate are you going to?', hint: '说 A12 就可以；不用在画面里找按钮。' },
    ],
    office: [
      { id: 'office-purpose', interaction: 'speech', requiresAction: false, speaker: '前台', prompt: 'Who are you here to see?', hint: '告诉前台你来见谁；不需要照着固定句子说。' },
      { id: 'office-signin', interaction: 'speech', requiresAction: false, speaker: '前台', prompt: 'What is your name, please?', hint: '告诉前台你的名字，例如 My name is Li。' },
      { id: 'office-wait', interaction: 'none', requiresAction: false, requiresSpeech: false, autoAdvance: true, speaker: '前台', prompt: 'You can wait here for Maya.', hint: '这一句只需要听懂，情境会自己继续。' },
      { id: 'office-greeting', interaction: 'speech', requiresAction: false, speaker: 'Maya', prompt: "Hi, I'm Maya. Nice to meet you.", hint: '自然回应 Maya 的问候即可，不设唯一答案。' },
    ],
  };
  for (const [sceneId, tasks] of Object.entries(conversationalTasks)) defaults[sceneId] = {
    tasks,
    constraints: 'Only an answer to the actual practical question provides task evidence. Follow other conversation freely. Never invent people, visible objects, or physical actions.',
    facts: () => sceneId === 'airport' ? 'The itinerary names gate A12; no gate sign is readable in the static image.'
      : 'Nora is the receptionist and Maya the colleague. The image remains at reception and does not show Maya arriving.',
    evaluate(input) {
      return input.questionMatchesTask && rules.matchesTask(input.taskId, input.answer)
        ? { kind: 'decision', feedback: { meaning_valid: true }, changedTaskIds: [input.taskId] } : unresolved();
    },
    validateCandidate: () => ({ meaning_valid: true, choice: null }),
  };

  function create(adapters = {}) {
    const registry = { ...defaults, ...adapters };
    const adapterFor = input => {
      const adapter = registry[input.sceneId];
      return adapter?.tasks?.some(task => task.id === input.taskId) ? adapter : null;
    };
    function evaluate(input = {}) {
      const adapter = adapterFor(input);
      let result;
      if (!adapter) result = unresolved();
      else if (Number.isSafeInteger(input.expectedRevision) && Number.isSafeInteger(input.world?.revision)
        && input.expectedRevision !== input.world.revision) result = ignored('stale-state');
      else if (rules.supportIntent(input.answer)) result = { kind: 'help', feedback: { conversational: true } };
      else if ((adapter.isConversationOnly || rules.isConversationOnly)(input.answer, input.question)) result = conversation();
      else {
        result = adapter.evaluate(input);
        if (result.kind === 'unresolved' && rules.isSmallTalk(input.answer) && !rules.matchesTask(input.taskId, input.answer)) result = conversation();
      }
      return { changedTaskIds: [], nextTaskId: null, baseRevision: input.world?.revision ?? null, ...result };
    }
    function semanticSpec(sceneId, taskId, world) {
      const adapter = adapterFor({ sceneId, taskId }), task = adapter?.tasks.find(item => item.id === taskId);
      return task ? { sceneId, taskId, goal: task.label || task.prompt || task.id,
        prompt: adapter.promptFor?.(taskId, world) || task.prompt || '',
        allowedChoices: Array.isArray(task.choices) ? [...task.choices] : [],
        constraints: adapter.constraints || '', facts: adapter.facts?.(world) || '' } : null;
    }
    function validateCandidate(input = {}, candidate = {}) {
      const adapter = adapterFor(input), local = evaluate(input);
      if (local.feedback.discarded) return local.feedback;
      if (!adapter || !validMeaning(candidate)) return { meaning_valid: false, choice: null };
      // Model output proposes meaning only. It cannot bypass local safeguards,
      // replace world state, finish a scene, or reinterpret a conversation turn.
      if (local.kind !== 'unresolved') return local.feedback;
      const allowed = semanticSpec(input.sceneId, input.taskId).allowedChoices;
      if (allowed.length && !allowed.includes(candidate.choice)) return { meaning_valid: false, choice: null };
      const result = adapter.validateCandidate(input, { meaning_valid: true, choice: candidate.choice });
      return result.meaning_valid ? result : { ...result, choice: null };
    }
    return { evaluate, semanticSpec, validateCandidate,
      taskForField: (sceneId, field) => registry[sceneId]?.fields?.[field] || null,
      worldKey: sceneId => registry[sceneId]?.worldKey || null,
      tasksFor: sceneId => (registry[sceneId]?.tasks || []).map(task => ({ ...task })),
      isCurrentTurn, create };
  }
  function isCurrentTurn({ message, context = {}, sceneId, taskId, taskIndex, practiceSession, stage, allowCompleted = false } = {}) {
    return Boolean(message && message.speaker === 'user' && message.final
      && message.revision === context.revision && message.text === context.answer
      && context.practiceSession === practiceSession && context.sceneId === sceneId
      && context.taskId === taskId && context.taskIndex === taskIndex
      && (stage === 'active' || (allowCompleted && ['task-complete', 'complete'].includes(stage))));
  }
  return create();
})();
if (typeof module !== 'undefined') module.exports = SceneDialogue;
