/**
 * Серверный голос Светланы.
 * Piper — локальный русский голос; Yandex — опциональный fallback.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { pcm16ToWav } from './wav.js';

const env = (k, d = '') => (process.env[k] ?? d).trim();
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const abs = (p) => p ? resolve(ROOT, p) : '';
const CACHE = join(config.STORAGE_DIR, 'tts-cache');
const TIMEOUT = Number(env('TTS_TIMEOUT_MS', '30000')) || 30000;

const providers = {
  piper: {
    available() {
      const bin = abs(env('PIPER_BIN', './vendor/piper/piper'));
      const model = abs(env('PIPER_MODEL', './vendor/voices/ru_RU-irina-medium.onnx'));
      return existsSync(bin) && existsSync(model) ? { bin, model } : null;
    },
    voiceId() {
      return 'piper:' + env('PIPER_MODEL', 'irina') + ':' + env('PIPER_LENGTH_SCALE', '1');
    },
    async synth(text) {
      const p = this.available();
      if (!p) throw new Error('piper unavailable');
      let rate = 22050;
      try {
        rate = JSON.parse(readFileSync(p.model + '.json', 'utf8'))?.audio?.sample_rate || rate;
      } catch {}
      const args = [
        '--model', p.model,
        '--output_raw',
        '--length_scale', env('PIPER_LENGTH_SCALE', '1'),
        '--sentence_silence', '0.15',
      ];
      const pcm = await new Promise((resolvePcm, rejectPcm) => {
        const child = spawn(p.bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
        const out = [];
        const err = [];
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          rejectPcm(new Error('piper timeout'));
        }, TIMEOUT);
        child.stdout.on('data', (d) => out.push(d));
        child.stderr.on('data', (d) => err.push(d));
        child.on('error', (e) => {
          clearTimeout(timer);
          rejectPcm(e);
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          const buf = Buffer.concat(out);
          if (code === 0 && buf.length) resolvePcm(buf);
          else rejectPcm(new Error('piper exit ' + code + ': ' + Buffer.concat(err).toString('utf8').slice(-300)));
        });
        child.stdin.end(String(text).replace(/\n/g, ' ') + '\n');
      });
      return pcm16ToWav(pcm, rate);
    },
  },

  yandex: {
    available() {
      return Boolean(env('YANDEX_TTS_API_KEY'));
    },
    voiceId() {
      return 'yandex:' + env('YANDEX_TTS_VOICE', 'alena') + ':' + env('YANDEX_TTS_EMOTION', 'good');
    },
    async synth(text) {
      const rate = 48000;
      const body = new URLSearchParams({
        text,
        lang: 'ru-RU',
        voice: env('YANDEX_TTS_VOICE', 'alena'),
        format: 'lpcm',
        sampleRateHertz: String(rate),
      });
      if (env('YANDEX_TTS_EMOTION', 'good')) body.set('emotion', env('YANDEX_TTS_EMOTION', 'good'));
      if (env('YANDEX_FOLDER_ID')) body.set('folderId', env('YANDEX_FOLDER_ID'));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT);
      try {
        const res = await fetch('https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize', {
          method: 'POST',
          body,
          signal: controller.signal,
          headers: { authorization: 'Api-Key ' + env('YANDEX_TTS_API_KEY') },
        });
        if (!res.ok) throw new Error('yandex tts HTTP ' + res.status);
        return pcm16ToWav(Buffer.from(await res.arrayBuffer()), rate);
      } finally {
        clearTimeout(timer);
      }
    },
  },
};

function order() {
  return env('TTS_PROVIDER', 'piper,yandex')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter((x) => providers[x]);
}

export function ttsStatus() {
  const ready = order().filter((x) => providers[x].available());
  return { available: ready.length > 0, provider: ready[0] ?? null };
}

export async function synthesize(text) {
  const errors = [];
  for (const name of order()) {
    const provider = providers[name];
    if (!provider.available()) continue;
    const key = createHash('sha256')
      .update(provider.voiceId() + '\n' + text)
      .digest('hex');
    const file = join(CACHE, key + '.wav');
    if (existsSync(file)) return { audio: readFileSync(file), provider: name, cached: true };
    try {
      const audio = await provider.synth(text);
      try {
        mkdirSync(CACHE, { recursive: true });
        writeFileSync(file, audio);
      } catch {}
      return { audio, provider: name, cached: false };
    } catch (err) {
      errors.push(name + ': ' + err.message);
    }
  }
  const e = new Error(errors.length ? errors.join('; ') : 'no tts provider configured');
  e.code = 'tts_unavailable';
  throw e;
}