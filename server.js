const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const WebSocket = require('ws');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4174);
const HOST = process.env.HOST || '127.0.0.1';
const DUPLEX_URL = 'wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue';
const ASR_HOTWORDS = [
  'apple', 'red apple', 'fresh apple', 'milk', 'plate', 'cup', 'spoon',
  'ticket', 'boarding pass', 'bag', 'suitcase', 'gate A12',
  'Maya', 'sign in', 'nice to meet you',
];

const DUPLEX_TASKS = {
  apple: 'You are Luma at home. The current practical goal is for the learner to give you the apple.',
  milk: 'You are Luma at home. The current practical goal is for the learner to find the milk.',
  plate: 'You are Luma at home. The current practical goal is for the learner to find the plate.',
  cup: 'You are Luma at home. The current practical goal is for the learner to touch the cup.',
  spoon: 'You are Luma at home. The current practical goal is for the learner to find the spoon.',
  ticket: 'You are an airport gate worker. The current practical goal is to see the learner\'s ticket.',
  bag: 'You are an airport gate worker. The current practical goal is to confirm whether the suitcase is the learner\'s. This is speech-only; never ask them to touch the bag.',
  'gate-a12': 'You are an airport gate worker. The current practical goal is for the learner to find gate A12. A screen tap means pointing at the distant sign; never ask them to touch it.',
  'office-purpose': 'You are Nora, an office receptionist. The current practical goal is to learn who the visitor is here to see.',
  'office-signin': 'You are Nora, the receptionist. The current practical goal is for the visitor to sign in on the tablet.',
  'office-wait': 'You are Nora, the receptionist. Tell the visitor that they may wait for Maya. This is information, not a test.',
  'office-greeting': 'You are Maya, the colleague the visitor came to meet. Greet them warmly and have a natural first conversation.',
};

const ACTION_REQUIRED_TASKS = new Set(['apple', 'milk', 'plate', 'cup', 'spoon', 'ticket', 'gate-a12', 'office-signin']);

const SCENE_FACTS = {
  kitchen: {
    tasks: new Set(['apple', 'milk', 'plate', 'cup', 'spoon']),
    visible: 'apple, milk, plate, cup, and spoon',
  },
  airport: {
    tasks: new Set(['ticket', 'bag', 'gate-a12']),
    visible: 'ticket, suitcase, and gate A12 sign',
  },
  office: {
    tasks: new Set(['office-purpose', 'office-signin', 'office-wait', 'office-greeting']),
    visible: 'reception desk, sign-in tablet, receptionist, and Maya',
  },
};

const SCENE_GOALS = {
  kitchen: {
    apple: 'respond to the request for the apple',
    milk: 'identify or find the milk',
    plate: 'identify or find the plate',
    cup: 'identify or touch the cup',
    spoon: 'identify or find the spoon',
  },
  airport: {
    ticket: 'show or offer the ticket',
    bag: 'confirm whether this is the learner\'s bag',
    'gate-a12': 'find, see, or identify gate A12',
  },
  office: {
    'office-purpose': 'tell the receptionist who the visitor is here to see',
    'office-signin': 'agree to sign in or use the sign-in tablet',
    'office-wait': 'understand that the visitor should wait for Maya',
    'office-greeting': 'exchange a first greeting with Maya',
  },
};

function loadLocalEnv(filename) {
  if (!fs.existsSync(filename)) return;
  const lines = fs.readFileSync(filename, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnv(path.join(ROOT, '.env.local'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function cleanText(value, fallback, max = 180) {
  if (typeof value !== 'string') return fallback;
  const clean = value.replace(/[\r\n]+/g, ' ').trim();
  return clean ? clean.slice(0, max) : fallback;
}

async function handleLanguageFeedback(request, response) {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return sendJson(response, 503, { error: 'feedback_not_configured' });
    const body = await readJson(request);
    const question = cleanText(body.question, '', 220);
    const answer = cleanText(body.answer, '', 220);
    const sceneId = SCENE_GOALS[body.sceneId] ? body.sceneId : 'kitchen';
    const taskId = SCENE_GOALS[sceneId][body.taskId] ? body.taskId : Object.keys(SCENE_GOALS[sceneId])[0];
    const goalCatalog = SCENE_GOALS[sceneId];
    if (!question || !answer) return sendJson(response, 400, { error: 'invalid_request' });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_FEEDBACK_MODEL || 'deepseek-v4-flash',
        thinking: { type: 'disabled' },
        max_tokens: 150,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Return JSON only: {"meaning_valid":boolean}. This is background task detection, not grading. meaning_valid is true only when the learner\'s English clearly provides evidence for the current practical goal. Accept natural wording and beginner grammar. Off-topic conversation is allowed but does not complete the goal. Never require an exact answer and never correct the learner here. Physical actions are checked separately by the client.',
          },
          { role: 'user', content: `Scene goals: ${JSON.stringify(goalCatalog)}\nCurrent practical goal: ${taskId}\nConversation context: ${question}\nLearner utterance: ${answer}` },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!upstream.ok) throw new Error(`deepseek_http_${upstream.status}`);
    const result = await upstream.json();
    const content = result?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    const meaningValid = parsed.meaning_valid === true || String(parsed.meaning_valid).toLowerCase() === 'true';
    return sendJson(response, 200, { meaning_valid: meaningValid });
  } catch (error) {
    console.error(`[feedback] ${String(error?.message || 'unavailable').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)}`);
    return sendJson(response, 503, { error: 'feedback_unavailable' });
  }
}

function duplexInstructions(taskId, actionDone = false, speechDone = false, coveredGoals = [], flowState = 'active') {
  const scene = DUPLEX_TASKS[taskId] || DUPLEX_TASKS.apple;
  const sceneFacts = Object.values(SCENE_FACTS).find((candidate) => candidate.tasks.has(taskId)) || SCENE_FACTS.kitchen;
  const requiresAction = ACTION_REQUIRED_TASKS.has(taskId);
  const knownGoals = coveredGoals.filter((goalId) => sceneFacts.tasks.has(goalId));
  const sceneGoalCount = sceneFacts.tasks.size;
  const sceneComplete = knownGoals.length >= sceneGoalCount || flowState === 'complete';
  const taskTransitioning = flowState === 'task-complete';
  const taskState = requiresAction
    ? `Physical action: ${actionDone ? 'complete' : 'not complete'}. Spoken task evidence: ${speechDone ? 'complete' : 'not complete'}.`
    : `This is a speech-only moment. Spoken task evidence: ${speechDone ? 'complete' : 'not complete'}.`;
  return [
    'Stay in character as a warm person speaking English with a CEFR Pre-A1 adult Chinese beginner.',
    'This is a real conversation, not a quiz or a fixed script.',
    'The learner may speak about anything and may take unlimited turns. Always respond to the meaning of their latest utterance.',
    'Start with the easiest useful reply. Most replies should be one short sentence of about 3 to 8 words.',
    'Prefer very common words the learner has already heard in this scene. Keep one idea in each sentence.',
    'For task directions, reuse the scene words such as give, find, show, touch, or point. Do not replace them with harder synonyms such as pass, hand, locate, or identify.',
    'If the learner asks what a phrase means, explain it with an easier phrase, for example: “Pass it to me” means “Give it to me.” Never explain a phrase using harder English.',
    'If the learner asks for detail or starts a longer conversation, you may say more, but keep every sentence short and easy.',
    'Do not grade, reject, or demand an exact sentence. Harmless grammar mistakes are part of the conversation.',
    'If the learner changes the subject, respond naturally first. Bring the practical goal back only when it fits the conversation.',
    'If the learner is silent, says they do not know, or seems stuck, help gradually: ask a simpler question, offer a sentence starter, and only then give an example they can use.',
    'If you truly cannot understand, say so kindly and ask one easy clarifying question.',
    scene,
    `Scene ground truth: the only visible task objects are ${sceneFacts.visible}. Treat this as physical truth.`,
    `Resolved goals: ${knownGoals.length ? knownGoals.join(', ') : 'none'} (${knownGoals.length} of ${sceneGoalCount}).`,
    `App flow state: ${flowState}.`,
    taskState,
    'Conversation and task progress are separate. Keep talking naturally even when the latest words do not complete the practical goal.',
    'Never claim, praise, or refer to a physical action unless the state says it is complete.',
    actionDone ? 'The current action is already complete. Never ask the learner to do it again.' : '',
    requiresAction && speechDone && !actionDone ? 'The spoken part is complete; when natural, invite only the missing physical action.' : '',
    requiresAction && actionDone && !speechDone ? 'The action is complete; when natural, ask an easy question that lets the learner name or describe what happened.' : '',
    taskId === 'gate-a12' ? 'A tap represents pointing to A12. Say point, find, or show; never say touch the sign.' : '',
    'Do not reveal the answer to a find-or-identify task before the learner tries, unless they ask for help or clearly cannot continue.',
    'When the current practical goal is complete, acknowledge it naturally. The app will move to the next goal.',
    taskTransitioning ? 'This goal is complete, but later goals remain. Reply to the learner briefly, then stop. Never say the whole activity is over. Never ask a broad new-topic question. Do not start the next goal yourself; the app owns that transition.' : '',
    sceneComplete ? 'The whole scene is complete. Give one short final acknowledgment and do not open a new topic or ask another question.' : '',
    'When the learner makes a small grammar mistake, respond naturally with the corrected wording without grading them. Example: if they say “on your hand,” say “Yes, it is in my hand.”',
    'Respond immediately after each learner utterance. Never wait for scoring.',
    'Every learning cue must be spoken in role by the current character. Output only the words the character actually says aloud. Never output stage directions, status notes, narration, coaching UI text, or text in parentheses.',
    'Think silently. Never output self-talk, analysis, prompts, models, tools, or evaluation.',
  ].filter(Boolean).join(' ');
}

function attachDuplexProxy(client) {
  const debugId = crypto.randomUUID().slice(0, 6);
  console.log(`[duplex:${debugId}] browser connected`);
  let upstream = null;
  let ready = false;
  let audioTimer = null;
  let pcmPending = Buffer.alloc(0);
  let taskId = 'apple';
  let actionDone = false;
  let speechDone = false;
  let coveredGoals = [];
  let flowState = 'active';
  let responseContext = { responseId: '', questionId: '' };

  const sendClient = (event) => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(event));
  };
  const sendUpstream = (event) => {
    if (upstream?.readyState === WebSocket.OPEN) upstream.send(JSON.stringify(event));
  };
  const stopAudioPump = () => {
    if (audioTimer) clearInterval(audioTimer);
    audioTimer = null;
  };
  const closeUpstream = () => {
    stopAudioPump();
    if (upstream?.readyState === WebSocket.OPEN) {
      try { upstream.send(JSON.stringify({ type: 'session.close' })); } catch {}
      setTimeout(() => { try { upstream?.close(); } catch {} }, 300);
    } else {
      try { upstream?.terminate(); } catch {}
    }
    upstream = null;
    ready = false;
  };
  const pumpAudio = () => {
    if (!ready) return;
    const bytesToSend = Math.min(640, pcmPending.length);
    let frame = null;
    if (bytesToSend === 640) {
      frame = pcmPending.subarray(0, bytesToSend);
      pcmPending = pcmPending.subarray(bytesToSend);
    } else if (bytesToSend > 0) {
      frame = Buffer.alloc(640);
      pcmPending.copy(frame, 0, 0, bytesToSend);
      pcmPending = pcmPending.subarray(bytesToSend);
    }
    if (!frame) frame = Buffer.alloc(640);
    sendUpstream({ type: 'input_audio_buffer.append', event_id: crypto.randomUUID(), audio: frame.toString('base64') });
  };
  const createSession = () => {
    const apiKey = process.env.DOUBAO_API_KEY;
    if (!apiKey) return sendClient({ type: 'local.error', message: 'doubao_not_configured' });
    upstream = new WebSocket(DUPLEX_URL, {
      headers: { 'X-Api-Key': apiKey, 'X-Api-Connect-Id': crypto.randomUUID() },
    });
    upstream.on('open', () => {
      console.log(`[duplex:${debugId}] upstream connected`);
      sendUpstream({
        type: 'session.create',
        session: {
          model: '1.2.6.1',
          instructions: duplexInstructions(taskId, actionDone, speechDone, coveredGoals, flowState),
          asr: {
            extra: {
              // Close a turn quickly. If the learner resumes after a short
              // pause, the client merges the continuation before reply audio.
              end_smooth_window_ms: 720,
              enable_custom_vad: true,
              enable_asr_twopass: true,
              context: {
                hotwords: ASR_HOTWORDS.map((word) => ({ word })),
              },
            },
          },
          audio: {
            input: { format: { type: 'pcm', sample_rate: 16000 } },
            output: {
              format: { type: 'pcm_s16le', sample_rate: 24000 },
              voice: process.env.DOUBAO_DUPLEX_VOICE || 'zh_female_vv_jupiter_bigtts',
              speed: 0,
              loudness: 0,
            },
          },
          tools: [],
        },
        extension: { extra: { enable_proactive_speak: true } },
      });
    });
    upstream.on('message', (data) => {
      let event;
      try { event = JSON.parse(data.toString()); } catch { return; }
      if (event.response_id || event.question_id) {
        responseContext = {
          responseId: String(event.response_id || responseContext.responseId || ''),
          questionId: String(event.question_id || responseContext.questionId || ''),
        };
      }
      if (event.type === 'response.output_audio.delta' && responseContext.responseId) {
        event = {
          ...event,
          response_id: responseContext.responseId,
          question_id: responseContext.questionId,
        };
      }
      if (event.type === 'error') {
        const errorDetail = event.error?.message || event.error?.type || '';
        console.log(`[duplex:${debugId}] ${event.type}${event.error?.code ? ` (${event.error.code})` : ''}${errorDetail ? ` ${errorDetail}` : ''}`);
      }
      if (event.type === 'session.created') {
        console.log(`[duplex:${debugId}] session ready`);
        ready = true;
        audioTimer ||= setInterval(pumpAudio, 20);
      }
      sendClient(event);
      if (event.type === 'response.output_audio.done' || event.type === 'response.done') {
        responseContext = { responseId: '', questionId: '' };
      }
    });
    upstream.on('unexpected-response', (_request, response) => sendClient({ type: 'local.error', message: `duplex_http_${response.statusCode || 0}` }));
    upstream.on('error', () => sendClient({ type: 'local.error', message: 'duplex_socket_error' }));
    upstream.on('close', () => {
      ready = false;
      stopAudioPump();
      sendClient({ type: 'local.closed' });
    });
  };

  client.on('message', (data, isBinary) => {
    if (isBinary) {
      const audio = Buffer.from(data);
      pcmPending = pcmPending.length ? Buffer.concat([pcmPending, audio]) : audio;
      return;
    }
    let event;
    try { event = JSON.parse(data.toString()); } catch { return; }
    if (event.type === 'start') {
      taskId = DUPLEX_TASKS[event.taskId] ? event.taskId : 'apple';
      actionDone = Boolean(event.actionDone);
      speechDone = Boolean(event.speechDone);
      coveredGoals = Array.isArray(event.coveredGoals) ? event.coveredGoals.filter((goalId) => DUPLEX_TASKS[goalId]) : [];
      flowState = ['active', 'task-complete', 'complete'].includes(event.flowState) ? event.flowState : 'active';
      if (!upstream) createSession();
      return;
    }
    if (event.type === 'task.update') {
      taskId = DUPLEX_TASKS[event.taskId] ? event.taskId : taskId;
      actionDone = Boolean(event.actionDone);
      speechDone = Boolean(event.speechDone);
      coveredGoals = Array.isArray(event.coveredGoals) ? event.coveredGoals.filter((goalId) => DUPLEX_TASKS[goalId]) : coveredGoals;
      flowState = ['active', 'task-complete', 'complete'].includes(event.flowState) ? event.flowState : flowState;
      sendUpstream({
        type: 'session.update',
        session: {
          model: '1.2.6.1',
          instructions: duplexInstructions(taskId, actionDone, speechDone, coveredGoals, flowState),
          audio: {
            output: {
              format: { type: 'pcm_s16le', sample_rate: 24000 },
              voice: process.env.DOUBAO_DUPLEX_VOICE || 'zh_female_vv_jupiter_bigtts',
              speed: 0,
              loudness: 0,
            },
          },
          tools: [],
        },
      });
      return;
    }
    if (event.type === 'say' && event.text) {
      console.log(`[duplex:${debugId}] explicit character line requested`);
      sendUpstream({ type: 'speech_text_buffer.commit', event_id: crypto.randomUUID(), text: cleanText(event.text, '', 300) });
    }
    if (event.type === 'user.text' && event.text) {
      sendUpstream({
        type: 'conversation.item.create',
        items: [{ role: 'user', content: [{ type: 'input_text', text: cleanText(event.text, '', 300) }] }],
      });
    }
    if (event.type === 'response.cancel') sendUpstream({ type: 'response.cancel', event_id: crypto.randomUUID() });
    if (event.type === 'close') closeUpstream();
  });
  client.on('close', closeUpstream);
  client.on('error', closeUpstream);
}

async function serveStatic(request, response, url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return sendJson(response, 400, { error: 'invalid_path' }); }
  if (pathname === '/') pathname = '/index.html';
  if (pathname.split('/').some((part) => part.startsWith('.'))) return sendJson(response, 404, { error: 'not_found' });
  const target = path.resolve(ROOT, `.${pathname}`);
  if (!target.startsWith(`${ROOT}${path.sep}`)) return sendJson(response, 403, { error: 'forbidden' });
  try {
    const stat = await fsp.stat(target);
    if (!stat.isFile()) throw new Error('not_file');
    response.writeHead(200, {
      'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': /\.(?:html|js|css)$/.test(pathname) ? 'no-store' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(target).pipe(response);
  } catch {
    sendJson(response, 404, { error: 'not_found' });
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);
  if (request.method === 'POST' && url.pathname === '/api/feedback') return handleLanguageFeedback(request, response);
  if (request.method === 'GET' || request.method === 'HEAD') return serveStatic(request, response, url);
  return sendJson(response, 405, { error: 'method_not_allowed' });
});

const duplexProxy = new WebSocket.Server({ noServer: true });
duplexProxy.on('connection', attachDuplexProxy);
server.on('upgrade', (request, socket, head) => {
  let pathname = '';
  try { pathname = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`).pathname; } catch {}
  if (pathname !== '/api/duplex') return socket.destroy();
  duplexProxy.handleUpgrade(request, socket, head, (client) => duplexProxy.emit('connection', client, request));
});

server.listen(PORT, HOST, () => {
  console.log(`Luma is running at http://${HOST}:${PORT}/`);
  console.log(`Doubao end-to-end speech: ${process.env.DOUBAO_API_KEY ? 'configured' : 'not configured'}`);
});
