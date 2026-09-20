/**
 * Emotion engine (§12). Emotions are a deterministic function of
 *   context + task state + risk + result + confidence
 * — never random, never decorative. Each state also selects voice style and
 * a micro-interaction cue the avatar renders.
 */

export const EMOTIONS = {
  IDLE: { label: 'Спокойствие', voice: 'ровный, тёплый', cue: 'мягкий вдох, взгляд в камеру' },
  LISTENING: { label: 'Внимание', voice: 'тише, слушаю', cue: 'лёгкий наклон головы' },
  THINKING: { label: 'Размышление', voice: 'чуть медленнее', cue: 'взгляд вверх-вправо, пауза' },
  FOCUSED: { label: 'Сосредоточенность', voice: 'чёткий, по делу', cue: 'прямой взгляд, собранность' },
  EXPLAINING: { label: 'Объяснение', voice: 'размеренный, с акцентами', cue: 'жесты руками, контакт глазами' },
  HAPPY: { label: 'Радость', voice: 'тёплый, с улыбкой', cue: 'улыбка, приподнятые брови' },
  SUCCESS: { label: 'Успех', voice: 'уверенный, энергичный', cue: 'кивок, лёгкая улыбка' },
  CONCERNED: { label: 'Озабоченность', voice: 'мягче, заботливый', cue: 'сдвинутые брови, наклон вперёд' },
  WARNING: { label: 'Предупреждение', voice: 'твёрже, серьёзнее', cue: 'прямой взгляд, брови напряжены' },
  WAITING: { label: 'Ожидание', voice: 'приглушённый', cue: 'небольшая пауза, открытая поза' },
};

/**
 * @param {object} state
 * @param {'user'|'assistant'} state.role
 * @param {number} state.turnIndex
 * @param {Array} state.actions  tool records for this turn
 * @param {boolean} state.hasCitations
 * @param {boolean} state.askingQuestion
 * @param {number} state.confidence  0..1 of the final answer
 * @param {string|null} state.pendingRisk  'high' when a sensitive action awaits approval
 */
export function computeEmotion(state = {}) {
  const { actions = [], hasCitations = false, askingQuestion = false, confidence = 1, pendingRisk = null } = state;

  if (state.role === 'user') return 'LISTENING';

  const verified = actions.filter((a) => a.status === 'succeeded' && a.verified);
  const failed = actions.filter((a) => a.status === 'failed' || a.status === 'not_proven');
  const blocked = actions.filter((a) => a.status === 'blocked');
  const unverified = actions.filter((a) => a.status === 'succeeded' && !a.verified);

  // A sensitive action awaiting user confirmation is an invitation, not an
  // alarm: Светлана waits openly so the user feels safe approving. WARNING is
  // reserved below for ungated risk/failure, where there is no approval gate.
  const awaitingApproval = blocked.length > 0 || pendingRisk === 'high';
  if (awaitingApproval || askingQuestion) return 'WAITING';

  if (failed.length > 1) return 'WARNING';
  if (failed.length === 1) return 'CONCERNED';
  if (verified.length && unverified.length) return 'CONCERNED';
  if (verified.length) return confidence > 0.8 ? 'SUCCESS' : 'HAPPY';
  if (hasCitations) return 'EXPLAINING';
  if (actions.some((a) => a.status === 'running')) return 'THINKING';
  if (confidence < 0.5) return 'CONCERNED';
  return 'IDLE';
}

/** Voice + cue for the avatar, derived from the emotion (not stored separately). */
export function emotionProfile(emotion) {
  return EMOTIONS[emotion] ?? EMOTIONS.IDLE;
}
