/* Word audio has no dialogue turn: it never uses the character voice service. */
(function (root) {
  'use strict';
  function create({ canPlay = () => true, onStart = () => {}, onEnd = () => {},
    host = root, timeoutMs = 12000, echoTailMs = 180 } = {}) {
    let active = null, captureUntil = 0;
    const now = () => host.Date?.now?.() ?? Date.now();
    function finish(entry, result, cancel = false) {
      if (active !== entry) return;
      active = null;
      host.clearTimeout(entry.timer);
      entry.utterance.onend = null;
      entry.utterance.onerror = null;
      // Keep only the short speaker tail out of the microphone. This deadline
      // is independent of onend, which some browser voices never deliver.
      captureUntil = now() + echoTailMs;
      if (cancel) { try { host.speechSynthesis.cancel(); } catch {} }
      try { onEnd(result); } finally { entry.resolve(result); }
    }
    function stop() {
      if (active) finish(active, { ok: false, error: 'cancelled' }, true);
    }
    function available() {
      return Boolean(host.speechSynthesis && host.SpeechSynthesisUtterance);
    }
    // Start voice discovery early; this does not play or queue any audio.
    try { host.speechSynthesis?.getVoices(); } catch {}
    function play(value) {
      const text = String(value || '').trim();
      if (!text || text.length > 120) return Promise.resolve({ ok: false, error: 'invalid_text' });
      if (!available()) return Promise.resolve({ ok: false, error: 'unavailable' });
      // Never queue pronunciation behind a real reply or somebody else's
      // speech. A second explicit click can retry after the conversation ends.
      if (active || !canPlay() || host.speechSynthesis.speaking || host.speechSynthesis.pending)
        return Promise.resolve({ ok: false, error: 'busy' });
      let voices;
      try { voices = host.speechSynthesis.getVoices(); } catch { voices = []; }
      const english = voices.filter(item => /^en(?:[-_]|$)/i.test(item.lang) && item.localService !== false);
      // macOS lists novelty voices before ordinary voices. Prefer a familiar
      // system reader, then the system's English default, before list order.
      const voice = ['Samantha', 'Daniel', 'Alex']
        .map(name => english.find(item => new RegExp(`\\b${name}\\b`, 'i').test(item.name)))
        .find(Boolean) || english.find(item => item.default) || english[0];
      if (!voice) return Promise.resolve({ ok: false, error: 'voice_unavailable' });
      return new Promise(resolve => {
        let utterance;
        try { utterance = new host.SpeechSynthesisUtterance(text); }
        catch { resolve({ ok: false, error: 'unavailable' }); return; }
        utterance.voice = voice;
        utterance.lang = voice.lang || 'en-US';
        utterance.rate = .82;
        const entry = { utterance, resolve, timer: null };
        active = entry;
        utterance.onend = () => finish(entry, { ok: true });
        utterance.onerror = () => finish(entry, { ok: false, error: 'playback_failed' });
        entry.timer = host.setTimeout(() => finish(entry, { ok: false, error: 'timeout' }, true), timeoutMs);
        try { onStart(); host.speechSynthesis.speak(utterance); }
        catch { finish(entry, { ok: false, error: 'playback_failed' }, true); }
      });
    }
    return { play, stop, available, isActive: () => Boolean(active),
      isCaptureBlocked: () => Boolean(active) || now() < captureUntil };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LumaWordPronunciation = api;
})(typeof globalThis === 'object' ? globalThis : this);
