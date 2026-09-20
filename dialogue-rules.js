const DialogueRules = (() => {
  const taskPatterns = {
    apple: /^(?:(?:it s|it is|that s|that is|this is|i found|i have|here is) )?(?:(?:the|an|a) )?apple$|^here (?:you are|it is)$/,
    milk: /^(?:(?:it s|it is|this is|i found|here is) )?(?:the )?milk$|^(?:the )?milk is here$/,
    plate: /^(?:(?:it s|it is|this is|i found|here is) )?(?:(?:a|the) )?plate$/,
    cup: /^(?:(?:it s|it is|this is|i touched|here is) )?(?:(?:a|the) )?cup$/,
    spoon: /^(?:(?:it s|it is|this is|i found|here is) )?(?:(?:a|the) )?spoon$/,
    ticket: /^(?:(?:here is|this is) )?(?:(?:my|the|a) )?ticket$|^here (?:you are|it is)$/,
    bag: /^(?:yes|yeah|yep|no|nope|mine|(?:yes |yeah |yep )?(?:(?:it s|it is|that s|that is|this is) (?:mine|my bag))|(?:no |nope )?(?:(?:it s|it is|that s|that is|this is) not (?:mine|my bag)|(?:it|that|this) isn t (?:mine|my bag)))$/,
    'gate-a12': /^(?:(?:i found|i see|it is|it s|here is) )?(?:gate )?(?:a12|a 12|12|twelve)$/,
    'office-purpose': /^(?:(?:i m|i am) )?(?:here to (?:see|meet) )?maya$/,
    'office-signin': /^(?:(?:my name is|i am|i m) [a-z][a-z .'-]{0,40}|[a-z][a-z'-]{1,24})$/,
    'office-greeting': /^(?:hi|hello|hi maya|hello maya|nice to meet you|nice to meet you too|you too)$/,
  };

  const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // Ignore speech hesitation at the edges, never words that negate the answer.
  const spokenAnswer = (value) => normalize(value)
    .replace(/^(?:(?:uh huh|uh|um|erm|hmm|well|oh)\s+)+/, '')
    .replace(/(?:\s+(?:uh|um|erm|hmm))+$/, '')
    .replace(/(?: please| thank you| thanks)$/, '');
  const uncertainOrNegative = (value) => {
    const raw = String(value || '');
    const clean = normalize(raw);
    return /[?？]/.test(raw)
      || /\b(no(?:t)?|never|cannot|can t|couldn t|don t|doesn t|didn t|haven t|hasn t)\b/.test(clean)
      || /^(where|what|why|how|which|who|is|are|am|do|does|did|can|could|would|should)\b/.test(clean);
  };
  const matchesTask = (taskId, text) => {
    const pattern = taskPatterns[taskId];
    if (!pattern || supportIntent(text) || /\p{Script=Han}/u.test(String(text || ''))) return false;
    let answer = spokenAnswer(text);
    // ASR sometimes retains a discarded filler before a clear ownership answer.
    // This exception is deliberately restricted to the bag confirmation.
    if (taskId === 'bag') answer = answer.replace(/^nothing (?=(?:yes|no) )/, '');
    if (!['bag', 'office-greeting'].includes(taskId) && uncertainOrNegative(text)) return false;
    if (taskId === 'bag' && /[?？]/.test(String(text || ''))) return false;
    if (taskId === 'office-signin') {
      const name = answer.replace(/^(?:my name is|i am|i m) /, '');
      if (/\b(?:hello|hi|hey|yes|yeah|yep|no|nope|okay|ok|sure|thanks|thank|happy|fine|ready|here|tired|sorry|help|please|good|wait|nothing|unknown|maybe|perhaps|unsure|uh|um|erm|hmm|well|oh)\b/.test(name)) return false;
    }
    return pattern.test(answer);
  };

  // These are explicit conversation controls, never successful task answers.
  const supportIntent = value => {
    const raw = String(value || '').trim().replace(/[。！？!?.,]+$/g, '');
    const clean = spokenAnswer(raw);
    if (/^(?:等一下|等一会|等会儿?|让我想想|我想一下|慢点我想想)$/.test(raw)
      || /^(?:请)?(?:稍等(?:一下)?|等我一下|给我一点时间|让我想一想|我再想想)$/.test(raw)
      || /^(?:wait|wait a moment|hold on|one moment|let me think|give me a moment|just a second)(?: please)?$/.test(clean)) return 'wait';
    if (/^(?:继续|好了继续|可以继续了|我准备好了)$/.test(raw)
      || /^(?:continue|go on|i am ready|i m ready)$/.test(clean)) return 'continue';
    if (/^(?:再说一遍|再说一次|没听清|请再说一遍|慢一点|说慢一点)$/.test(raw)
      || /^(?:(?:你)?(?:能|可以|能不能|可不可以)?(?:请)?(?:再|重新)说(?:一遍|一次|慢一点|慢点)|(?:你)?(?:能|可以|能不能|可不可以)?(?:请)?说(?:慢一点|慢点))(?:吗)?$/.test(raw)
      || /^(?:again|repeat|say (?:it |that )?again|(?:can|could|would) you (?:say (?:it |that )?again|repeat (?:it|that)|speak (?:more )?slowly|say (?:it |that )?(?:more )?slowly)|speak (?:more )?slowly|say (?:it |that )?slower)(?: please)?$/.test(clean)) return 'replay';
    if (/^(?:我)?(?:不会说|说不出来|不知道怎么说|不知道怎么回答|怎么说|怎么回答|帮帮我)$/.test(raw)
      || /^(?:我)?(?:还是)?(?:不知道|不清楚)怎么(?:说|回答)(?:才好)?$/.test(raw)
      || /^(?:(?:你)?(?:能|可以|能不能|可不可以)?(?:请)?(?:告诉|教)我怎么(?:说|回答)|(?:请)?帮(?:帮)?我(?:一下)?)$/.test(raw)
      || /^(?:help|help me|i don t know what to say|i am not sure what to say|how (?:do|can|should) i (?:say|answer)(?: (?:it|that|this))?|(?:can|could|would) you (?:tell|show) me (?:how to say (?:it|that|this)|what to say|how to answer))(?: please)?$/.test(clean)) return 'example';
    if (/^(?:这个|这句|这句话)?(?:什么意思|是什么意思)$/.test(raw)
      || /^(?:我)?(?:不懂|没懂|听不懂|不明白|不知道)$/.test(raw)
      || /^(?:(?:我)?(?:还是|有点|真的|完全)?(?:没听懂|听不懂|没明白|不明白|不懂)|(?:这个|这句|这句话)?我(?:还是|有点)?(?:没听懂|听不懂|没明白|不明白|不懂))$/.test(raw)
      || /^(?:(?:你)?(?:能|可以|能不能|可不可以)?(?:请)?(?:翻译|解释)(?:一下|这个|这句|这句话)?(?:吗)?)$/.test(raw)
      || /^(?:i (?:still )?don t (?:understand|know)|what does .+ mean|what do you mean|(?:can|could|would) you explain (?:it|that|this|.+))(?: please)?$/.test(clean)) return 'meaning';
    return '';
  };
  const requirementsMet = ({ needsAction, actionDone, needsSpeech, speechDone }) => (
    (!needsAction || actionDone) && (!needsSpeech || speechDone) && (actionDone || speechDone)
  );

  const isQuestion = (value) => /\?\s*$/.test(String(value || '').trim());

  const transitionDwell = (value, { normal = 2600, afterQuestion = 12000 } = {}) => (
    isQuestion(value) ? afterQuestion : normal
  );

  const transitionReplyReplacement = ({ text, stage, hasMoreTasks, taskAcknowledgment = '' }) => {
    const reply = String(text || '').trim();
    if (!reply || !['task-complete', 'complete'].includes(stage)) return '';
    const broadTopicQuestion = /\b(?:what do you want to talk about|what should we talk about|anything else(?: you want)? to talk about)\b/i.test(reply);
    const prematureEnding = /\b(?:that(?:'|’)s all(?: for now)?|we(?:'|’)re (?:all )?done|finished for (?:now|today)|done for (?:now|today))\b/i.test(reply);
    if (stage === 'task-complete' && hasMoreTasks && prematureEnding) return 'Good. Let’s keep going.';
    if (broadTopicQuestion) return stage === 'complete'
      ? 'Nice work. We finished this scene.'
      : 'Okay. Let’s keep going.';
    if (stage === 'task-complete' && hasMoreTasks && isQuestion(reply))
      return String(taskAcknowledgment || '').trim() || 'Okay. Let’s keep going.';
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
    supportIntent,
    requirementsMet,
    isQuestion,
    transitionDwell,
    transitionReplyReplacement,
    gentleRecast,
  };
})();

if (typeof module !== 'undefined') module.exports = DialogueRules;
