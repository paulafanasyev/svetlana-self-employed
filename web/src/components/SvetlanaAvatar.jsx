import './SvetlanaAvatar.css';

const PHOTO = (import.meta.env.BASE_URL || '/') + 'svetlana-photo.jpg';

export function SvetlanaAvatar({ emotion = 'IDLE', size = 44, thinking = false, className = '' }) {
  const state = String(emotion || 'IDLE').toLowerCase();
  return (
    <span
      className={`sv-photo-avatar sv-photo-${state} ${thinking ? 'sv-photo-thinking' : ''} ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Светлана — ${emotion}`}
    >
      <img src={PHOTO} alt="" draggable="false" />
      <span className="sv-photo-status" aria-hidden="true" />
    </span>
  );
}
