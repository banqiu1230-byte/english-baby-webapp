const DialogueRules = (() => {
  const taskPatterns = {
    apple: /^(?:(?:it s|it is|that s|that is|this is|i found|i have|here is) )?(?:(?:the|an|a) )?apple$|^here (?:you are|it is)$/,
    milk: /^(?:(?:it s|it is|this is|i found|here is) )?(?:the )?milk$|^(?:the )?milk is here$/,
    plate: /^(?:(?:it s|it is|this is|i found|here is) )?(?:(?:a|the) )?plate$/,
    cup: /^(?:(?:it s|it is|this is|i touched|here is) )?(?:(?:a|the) )?cup$/,
    spoon: /^(?:(?:it s|it is|this is|i found|here is) )?(?:(?:a|the) )?spoon$/,
    ticket: /^(?:(?:here is|this is) )?(?:(?:my|the|a) )?ticket$|^here (?:you are|it is)$/,
    bag: /^(?:yes|no|mine|it s mine|it is mine|that s my bag|that is my bag|yes it is mine|no it is not mine|no it isn t mine|it is not my bag)$/,
    'gate-a12': /^(?:(?:i found|i see|it is|it s|here is) )?(?:gate )?(?:a12|a 12|12|twelve)$/,
    'office-purpose': /^(?:(?:i m|i am) )?(?:here to (?:see|meet) )?maya$/,
    'office-signin': /^(?:i signed in|i am signing in|i will sign in|sign in)$/,
    'office-greeting': /^(?:hi|hello|hi maya|hello maya|nice to meet you|nice to meet you too|you too)$/,
  };

  const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const uncertainOrNegative = (value) => {
    const raw = String(value || '');
    const clean = normalize(raw);
    return /\?/.test(raw)
      || /\b(no(?:t)?|never|cannot|can t|couldn t|don t|doesn t|didn t|haven t|hasn t)\b/.test(clean)
      || /^(where|what|why|how|which|who|is|are|am|do|does|did|can|could|would|should)\b/.test(clean);
  };
  const matchesTask = (taskId, text) => {
    const pattern = taskPatterns[taskId];
    if (!pattern) return false;
    if (!['bag', 'office-greeting'].includes(taskId) && uncertainOrNegative(text)) return false;
    return pattern.test(normalize(text));
  };
  const requirementsMet = ({ needsAction, actionDone, needsSpeech, speechDone }) => (
    (!needsAction || actionDone) && (!needsSpeech || speechDone) && (actionDone || speechDone)
  );

  const isQuestion = (value) => /\?\s*$/.test(String(value || '').trim());

  const transitionDwell = (value, { normal = 2600, afterQuestion = 12000 } = {}) => (
    isQuestion(value) ? afterQuestion : normal
  );

  const transitionReplyReplacement = ({ text, stage, hasMoreTasks }) => {
    const reply = String(text || '').trim();
    if (!reply || !['task-complete', 'complete'].includes(stage)) return '';
    const broadTopicQuestion = /\b(?:what do you want to talk about|what should we talk about|anything else(?: you want)? to talk about)\b/i.test(reply);
    const prematureEnding = /\b(?:that(?:'|’)s all(?: for now)?|we(?:'|’)re (?:all )?done|finished for (?:now|today)|done for (?:now|today))\b/i.test(reply);
    if (stage === 'task-complete' && hasMoreTasks && prematureEnding) return 'Good. Let’s keep going.';
    if (broadTopicQuestion) return stage === 'complete'
      ? 'Nice work. We finished this scene.'
      : 'Okay. Let’s keep going.';
    return '';
  };

  const gentleRecast = (value) => {
    const source = String(value || '').trim();
    if (!source) return '';
    let recast = source
      .replace(/\bon your hand\b/gi, 'in your hand')
      .replace(/^i find the\b/i, 'I found the');
    if (recast === source) return '';
    if (!/[.!?]$/.test(recast)) recast += '.';
    return recast;
  };

  return {
    normalize,
    matchesTask,
    requirementsMet,
    isQuestion,
    transitionDwell,
    transitionReplyReplacement,
    gentleRecast,
  };
})();

if (typeof module !== 'undefined') module.exports = DialogueRules;
