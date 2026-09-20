/**
 * Светлана — визуальная идентичность (§11).
 *
 * Оригинальный векторный портрет: тёплый, профессиональный, уверенный
 * персонаж продукта. Выражение лица детерминированно связано с эмоцией
 * из emotion engine (§12) — никаких случайных состояний.
 *
 * Это стилизованная иллюстрация (не фотография), и интерфейс не выдаёт её
 * за реальное фото.
 */

// Параметры выражения по эмоциям: брови, рот, веки.
const EXPRESSIONS = {
  IDLE:      { brow: 0,  mouth: 2,  eyes: 1, glow: '#8b5cf6' },
  LISTENING: { brow: -1, mouth: 4,  eyes: 1, glow: '#8b5cf6' },
  THINKING:  { brow: 2,  mouth: -2, eyes: 0, glow: '#a78bfa' },
  FOCUSED:   { brow: 1,  mouth: 0,  eyes: 1, glow: '#7c3aed' },
  EXPLAINING:{ brow: 0,  mouth: 6,  eyes: 1, glow: '#8b5cf6' },
  HAPPY:     { brow: -2, mouth: 12, eyes: 2, glow: '#10b981' },
  SUCCESS:   { brow: -2, mouth: 14, eyes: 2, glow: '#10b981' },
  CONCERNED: { brow: 4,  mouth: -6, eyes: 1, glow: '#f59e0b' },
  WARNING:   { brow: 5,  mouth: -8, eyes: 1, glow: '#ef4444' },
  WAITING:   { brow: 0,  mouth: 0,  eyes: 0, glow: '#c4b5fd' },
};

export function SvetlanaAvatar({ emotion = 'IDLE', size = 44, thinking = false, className = '' }) {
  const e = EXPRESSIONS[emotion] ?? EXPRESSIONS.IDLE;
  const mouthD = `M86 ${132 + e.mouth * 0.55} Q100 ${144 + e.mouth} 114 ${132 + e.mouth * 0.55}`;
  const browY = 78 - e.brow;

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={`Светлана — ${emotion}`}
      className={className}
    >
      <defs>
        <linearGradient id="sv-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ede9fe" />
          <stop offset="100%" stopColor="#ddd6fe" />
        </linearGradient>
        <linearGradient id="sv-hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5b2a1e" />
          <stop offset="55%" stopColor="#7c3a26" />
          <stop offset="100%" stopColor="#5b2a1e" />
        </linearGradient>
        <linearGradient id="sv-hair2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.12" />
        </linearGradient>
        <linearGradient id="sv-blazer" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6d28d9" />
          <stop offset="100%" stopColor="#4c1d95" />
        </linearGradient>
        <linearGradient id="sv-skin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f7dcc3" />
          <stop offset="100%" stopColor="#eec3a0" />
        </linearGradient>
        <radialGradient id="sv-glow" cx="0.5" cy="0.42" r="0.62">
          <stop offset="0%" stopColor={e.glow} stopOpacity="0.28" />
          <stop offset="100%" stopColor={e.glow} stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="100" cy="100" r="100" fill="url(#sv-bg)" />
      <circle cx="100" cy="84" r="66" fill="url(#sv-glow)" />

      {/* Плечи / жилет */}
      <path d="M40 200 Q46 146 100 138 Q154 146 160 200 Z" fill="url(#sv-blazer)" />
      <path d="M82 140 Q100 156 118 140 L112 176 Q100 184 88 176 Z" fill="#f8fafc" />
      <path d="M100 140 L100 178" stroke="#c7d2fe" strokeWidth="1.4" />

      {/* Шея */}
      <path d="M86 118 h28 v22 q0 12 -14 12 q-14 0 -14 -12 Z" fill="url(#sv-skin)" />
      <path d="M86 126 q14 8 28 0 v6 q-14 8 -28 0 Z" fill="#000" opacity="0.05" />

      {/* Волосы: задний слой */}
      <path d="M38 96 Q34 46 100 34 Q166 46 162 96 Q164 132 150 158 L138 150 Q146 122 140 92 Q136 58 100 54 Q64 58 60 92 Q54 122 62 150 L50 158 Q36 132 38 96 Z" fill="url(#sv-hair)" />
      {/* Пряди с фиолетовым отливом */}
      <path d="M44 92 Q44 52 100 42 Q156 52 156 92 Q158 128 146 152" fill="none" stroke="url(#sv-hair2)" strokeWidth="7" strokeLinecap="round" />

      {/* Лицо */}
      <path d="M100 50 Q138 54 142 92 Q142 130 118 146 Q100 154 82 146 Q58 130 58 92 Q62 54 100 50 Z" fill="url(#sv-skin)" />

      {/* Лёгкий румянец */}
      <ellipse cx="76" cy="112" rx="9" ry="6" fill="#e8a98c" opacity="0.35" />
      <ellipse cx="124" cy="112" rx="9" ry="6" fill="#e8a98c" opacity="0.35" />

      {/* Брови */}
      <path d={`M70 ${browY} q12 -5 22 -1`} stroke="#4a2418" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d={`M108 ${browY - 1} q11 -4 22 1`} stroke="#4a2418" strokeWidth="3" fill="none" strokeLinecap="round" />

      {/* Глаза */}
      {e.eyes === 2 ? (
        <>
          <path d="M70 94 q12 -8 24 0 q-12 6 -24 0 Z" fill="#3b2a20" />
          <path d="M106 94 q12 -8 24 0 q-12 6 -24 0 Z" fill="#3b2a20" />
        </>
      ) : (
        <>
          <ellipse cx="82" cy="93" rx="12" ry={e.eyes === 0 ? 5 : 7.5} fill="#fff" stroke="#3b2a20" strokeWidth="1.6" />
          <ellipse cx="118" cy="93" rx="12" ry={e.eyes === 0 ? 5 : 7.5} fill="#fff" stroke="#3b2a20" strokeWidth="1.6" />
          <circle cx="83" cy="93" r="4" fill="#3b2a20" />
          <circle cx="119" cy="93" r="4" fill="#3b2a20" />
          <circle cx="84.5" cy="91.5" r="1.4" fill="#fff" />
          <circle cx="120.5" cy="91.5" r="1.4" fill="#fff" />
        </>
      )}

      {/* Нос */}
      <path d="M100 104 q4 10 -2 14 q-2 2 4 2" stroke="#c98f6d" strokeWidth="2.4" fill="none" strokeLinecap="round" />

      {/* Рот — форма зависит от эмоции */}
      <path d={mouthD} stroke="#9c4a3a" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      {e.mouth >= 8 && (
        <path d={`M88 ${136 + e.mouth * 0.5} Q100 ${148 + e.mouth} 112 ${136 + e.mouth * 0.5} Q100 ${142 + e.mouth * 0.7} 88 ${136 + e.mouth * 0.5} Z`} fill="#7c2d20" opacity="0.5" />
      )}

      {/* Передние пряди волос */}
      <path d="M58 92 Q56 60 100 50 Q144 60 142 92 Q130 74 116 72 Q128 60 124 44 Q112 66 96 70 Q108 56 100 42 Q88 62 84 78 Q70 74 58 92 Z" fill="url(#sv-hair)" />
      <path d="M140 96 Q148 74 138 54" stroke="#5b2a1e" strokeWidth="6" fill="none" strokeLinecap="round" />

      {/* Серьга-капля (фирменный акцент) */}
      <path d="M60 116 q-4 8 0 12 q4 -4 0 -12 Z" fill="#8b5cf6" />
      <path d="M140 116 q4 8 0 12 q-4 -4 0 -12 Z" fill="#8b5cf6" />

      {thinking && (
        <circle cx="150" cy="56" r="9" fill="#fff" stroke="#a78bfa" strokeWidth="2">
          <animate attributeName="r" values="7;11;7" dur="1.6s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  );
}
