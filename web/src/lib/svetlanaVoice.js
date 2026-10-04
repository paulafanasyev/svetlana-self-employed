import { API_BASE, getAccessToken } from '../api.js';
import { visemeFor, speakableText, chunkText, pickVoice } from './visemes.js';
import { emotionFromText } from './svetlanaFace.js';

const W = typeof window !== 'undefined';
const S = W && 'speechSynthesis' in window ? window.speechSynthesis : null;
const AC = W && (window.AudioContext || window.webkitAudioContext);

const listeners = new Set();
const state = {
  enabled: true,
  speaking: false,
  open: 0,
  round: 0,
  emotion: 'calm',
  supported: Boolean(S || AC),
  mode: null,
};

let token = 0;
let raf = 0;
let audio = null;
let ctx = null;
let target = () => ({ open: 0, round: 0 });
let browserVoice = null;

const emit = () => listeners.forEach((listener) => listener(state));

const loop = () => {
  raf = 0;
  const t = target();
  const k = t.open > state.open ? 0.6 : 0.35;

  state.open += (t.open - state.open) * k;
  state.round += (t.round - state.round) * 0.3;
  emit();

  if (state.speaking || state.open > 0.01) {
    raf = requestAnimationFrame(loop);
  } else {
    state.open = 0;
  }
};

const startLoop = () => {
  if (!raf && W) {
    raf = requestAnimationFrame(loop);
  }
};

const getCtx = () => {
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
};

const clean = (text) => speakableText(text);

async function serverTts(parts, id) {
  const audioContext = getCtx();
  if (!audioContext) throw new Error('no audio context');

  for (const text of parts) {
    if (id !== token) return;

    const headers = { 'content-type': 'application/json' };
    const accessToken = getAccessToken?.();
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;

    const response = await fetch(API_BASE + '/tts', {
      method: 'POST',
      headers,
      body: JSON.stringify({ text }),
    });

    if (!response.ok) throw new Error(`tts ${response.status}`);

    const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;

    const samples = new Float32Array(512);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    audio = source;

    const startedAt = audioContext.currentTime;
    target = () => {
      analyser.getFloatTimeDomainData(samples);

      let energy = 0;
      for (const sample of samples) energy += sample * sample;

      const amplitude = Math.min(
        1,
        Math.max(0, (Math.sqrt(energy / samples.length) - 0.015) * 7),
      );

      const position = Math.min(
        text.length - 1,
        Math.max(
          0,
          Math.floor(
            ((audioContext.currentTime - startedAt) / buffer.duration) * text.length,
          ),
        ),
      );

      const viseme = visemeFor(text[position] || ' ');
      return {
        open: amplitude * (0.65 + 0.35 * Math.max(viseme.open, 0.3)),
        round: viseme.round,
      };
    };

    state.speaking = true;
    state.mode = 'server';
    startLoop();

    await new Promise((resolve) => {
      source.onended = resolve;
      source.start();
    });

    audio = null;
  }

  finish(id);
}

if (S) {
  const loadVoices = () => {
    browserVoice = pickVoice(S.getVoices());
  };
  loadVoices();
  S.addEventListener?.('voiceschanged', loadVoices);
}

function browser(parts, id) {
  const text = parts.shift();
  if (id !== token) return;
  if (!text) return finish(id);

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ru-RU';
  if (browserVoice) utterance.voice = browserVoice;
  utterance.pitch = 1.08;

  utterance.onstart = () => {
    const startedAt = performance.now();

    target = () => {
      const position = Math.min(
        text.length - 1,
        Math.floor(((performance.now() - startedAt) / 1000) * 14),
      );
      const viseme = visemeFor(text[position] || ' ');
      return {
        open: viseme.open * (0.85 + 0.15 * Math.sin(performance.now() / 55)),
        round: viseme.round,
      };
    };

    state.speaking = true;
    state.mode = 'browser';
    startLoop();
    emit();
  };

  utterance.onend = () => browser(parts, id);
  utterance.onerror = () => browser(parts, id);
  S.speak(utterance);
}

function finish(id) {
  if (id !== token) return;
  target = () => ({ open: 0, round: 0 });
  state.speaking = false;
  startLoop();
  emit();
}

export const svetlanaVoice = {
  get state() {
    return state;
  },

  subscribe(fn) {
    listeners.add(fn);
    fn(state);
    return () => listeners.delete(fn);
  },

  unlock() {
    getCtx();
  },

  setEnabled(on) {
    state.enabled = Boolean(on);

    try {
      localStorage.setItem('sv_voice_enabled', on ? '1' : '0');
    } catch {}

    if (on) this.unlock();
    else this.stop();

    emit();
  },

  speak(text) {
    if (!state.enabled) return false;

    const cleanText = clean(text);
    if (!cleanText) return false;

    this.stop();
    state.emotion = emotionFromText(cleanText);

    const id = ++token;

    (async () => {
      try {
        await serverTts(chunkText(cleanText, 280), id);
      } catch {
        if (S && id === token) browser(chunkText(cleanText), id);
        else finish(id);
      }
    })();

    return true;
  },

  stop() {
    token += 1;

    if (audio) {
      try {
        audio.stop();
      } catch {}
      audio = null;
    }

    if (S) S.cancel();
    finish(token);
  },
};

if (W) {
  try {
    if (localStorage.getItem('sv_voice_enabled') === '0') state.enabled = false;
  } catch {}
}
