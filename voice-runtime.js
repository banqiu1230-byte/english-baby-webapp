/* Shared, side-effect-free voice primitives. One provider item owns one turn. */
const VoiceRuntime = (() => {
  class TranscriptLedger {
    constructor() { this.serial = 0; this.items = new Map(); }
    create(context) {
      return { id: ++this.serial, itemId: '', context: { ...context }, text: '',
        final: false, revision: 0, messageId: null, confirmed: false };
    }
    bind(itemId, context, candidate = null) {
      if (itemId && this.items.has(itemId)) return this.items.get(itemId);
      const turn = candidate && !candidate.itemId && !candidate.final ? candidate : this.create(context);
      turn.itemId = itemId;
      if (itemId) this.items.set(itemId, turn);
      // Finished items remain tombstones for the duration of a practice.
      return turn;
    }
    update(turn, text, final = false) {
      if (!turn || turn.final) return false;
      const clean = String(text || '').trim();
      if (turn.text !== clean || final) turn.revision += 1;
      turn.text = clean;
      turn.final = final;
      return true;
    }
    reset() { this.items.clear(); }
  }

  const words = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  function isSpeechText(text) {
    const clean = String(text || '').trim();
    return /[\p{L}\p{N}]/u.test(clean)
      && !/^\s*[\[(]?(?:noise|music|silence|inaudible|laughter|背景音|噪音|音乐)[\])]?\s*$/iu.test(clean);
  }
  function isPlaybackEcho(text, spoken) {
    const clean = words(text), reference = words(spoken);
    // Never suppress short learner answers, even when the character used them.
    if (!clean || clean.split(' ').length < 3 || !reference) return false;
    return ` ${reference} `.includes(` ${clean} `);
  }

  // Keeps fractional sample position across callbacks (44.1/48 kHz phones).
  class PcmResampler {
    constructor(inputRate, outputRate = 16000) {
      this.ratio = inputRate / outputRate; this.remaining = this.ratio;
      this.sum = 0; this.weight = 0;
    }
    push(input) {
      const output = [];
      for (const sample of input) {
        let available = 1;
        while (available > 1e-8) {
          const take = Math.min(available, this.remaining);
          this.sum += sample * take; this.weight += take;
          this.remaining -= take; available -= take;
          if (this.remaining < 1e-8) {
            const value = Math.max(-1, Math.min(1, this.sum / this.weight));
            output.push(Math.round(value * (value < 0 ? 32768 : 32767)));
            this.sum = 0; this.weight = 0; this.remaining = this.ratio;
          }
        }
      }
      return Int16Array.from(output);
    }
  }

  class PcmBuffer {
    constructor(maxBytes = 16000 * 2 * 12) { this.maxBytes = maxBytes; this.chunks = []; this.bytes = 0; }
    push(pcm) {
      if (this.bytes + pcm.byteLength > this.maxBytes) return false;
      this.chunks.push(pcm); this.bytes += pcm.byteLength; return true;
    }
    take() { const chunks = this.chunks; this.chunks = []; this.bytes = 0; return chunks; }
    clear() { this.take(); }
  }
  return { TranscriptLedger, PcmResampler, PcmBuffer, isSpeechText, isPlaybackEcho };
})();
if (typeof module !== 'undefined') module.exports = VoiceRuntime;
