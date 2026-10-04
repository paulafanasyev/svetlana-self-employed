/** 16-bit PCM mono → WAV (без зависимостей). */
export function pcm16ToWav(pcm, sampleRate) {
  const data = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** Чистим текст перед синтезом: без ссылок, разметки, эмодзи, служебных статусов. */
export function cleanForTts(text, max = 2000) {
  return String(text || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/Статус:\s*NOT PROVEN\.?/gi, 'Статус: не подтверждено.')
    .replace(/Статус:\s*FAILED\.?/gi, 'Статус: не выполнено.')
    .replace(/\bVERIFIED\b/g, 'подтверждено')
    .replace(/[*_#>`~|<>]/g, ' ')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\uFE0F]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}