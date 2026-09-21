import { useState } from 'react';
import './SvetlanaAvatar.css';

const PHOTO = (import.meta.env.BASE_URL || '/') + 'svetlana-photo.jpg';

function FallbackAvatar({ size }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id="svf-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#eaf3ec" />
          <stop offset="100%" stopColor="#d5e6d9" />
        </linearGradient>
        <linearGradient id="svf-hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a2a1f" />
          <stop offset="100%" stopColor="#24140f" />
        </linearGradient>
        <linearGradient id="svf-skin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f8dcc7" />
          <stop offset="100%" stopColor="#e7b894" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="100" fill="url(#svf-bg)" />
      <path d="M34 190 Q39 135 100 132 Q161 135 166 190 L166 200 L34 200 Z" fill="#225b3c" />
      <rect x="86" y="122" width="28" height="25" rx="12" fill="url(#svf-skin)" />
      <path d="M37 95 Q31 44 100 30 Q169 44 163 95 Q166 143 146 159 L135 147 Q145 121 138 86 Q133 53 100 50 Q67 53 62 86 Q55 121 65 147 L53 159 Q34 141 37 95 Z" fill="url(#svf-hair)" />
      <path d="M58 92 Q56 55 100 48 Q144 55 142 92 Q129 73 114 71 Q127 57 122 42 Q111 62 96 68 Q106 55 99 42 Q86 61 82 77 Q69 73 58 92 Z" fill="url(#svf-hair)" />
      <path d="M100 51 Q134 54 139 91 Q139 126 118 143 Q100 152 82 143 Q61 126 61 91 Q66 54 100 51 Z" fill="url(#svf-skin)" />
      <path d="M69 88 Q78 83 88 87" stroke="#4a2a1f" strokeWidth="3" strokeLinecap="round" />
      <path d="M112 87 Q122 83 131 88" stroke="#4a2a1f" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="82" cy="96" rx="11" ry="8" fill="#fff" />
      <ellipse cx="118" cy="96" rx="11" ry="8" fill="#fff" />
      <circle cx="82" cy="96" r="4.5" fill="#4a7fa1" />
      <circle cx="118" cy="96" r="4.5" fill="#4a7fa1" />
      <circle cx="83.2" cy="94.4" r="1.4" fill="#fff" />
      <circle cx="119.2" cy="94.4" r="1.4" fill="#fff" />
      <path d="M100 104 Q104 114 99 117 Q97 119 104 120" stroke="#c58d6b" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M87 130 Q100 140 113 130" stroke="#9e4b43" strokeWidth="3.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function SvetlanaAvatar({ emotion = 'IDLE', size = 44, thinking = false, className = '' }) {
  const [failed, setFailed] = useState(false);
  const state = String(emotion || 'IDLE').toLowerCase();
  return (
    <span
      className={'sv-photo-avatar sv-photo-' + state + (thinking ? ' sv-photo-thinking' : '') + (failed ? ' is-fallback' : '') + ' ' + className}
      style={{ width: size, height: size }}
      role="img"
      aria-label={'Светлана — ' + emotion}
    >
      {failed ? <FallbackAvatar size={size} /> : <img src={PHOTO} alt="" draggable="false" onError={() => setFailed(true)} />}
      <span className="sv-photo-status" aria-hidden="true" />
    </span>
  );
}
