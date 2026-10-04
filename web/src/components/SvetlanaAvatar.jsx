/**
 * Светлана: единый говорящий аватар для всего приложения.
 * Портрет берётся из svetlana-face.jpg; live-режим включает эмоции,
 * моргание, движения головы и lip-sync по голосу.
 */
import { useEffect, useRef, useState } from 'react';
import { svetlanaVoice } from '../lib/svetlanaVoice.js';
import { loadFace, drawFace, createAnimator, toExpression } from '../lib/svetlanaFace.js';
import './SvetlanaAvatar.css';

const FACE = (import.meta.env?.BASE_URL || '/') + 'svetlana-face.jpg';
let facePromise = null;

function getFace() {
  if (!facePromise) {
    facePromise = loadFace(FACE).catch((error) => {
      facePromise = null;
      throw error;
    });
  }
  return facePromise;
}

function useLiveFace(canvasRef, size, enabled, expression, action, actionKey) {
  const [failed, setFailed] = useState(false);
  const animator = useRef(null);

  if (!animator.current) animator.current = createAnimator();

  useEffect(() => {
    animator.current.setExpression(expression);
  }, [expression]);

  useEffect(() => {
    if (action) animator.current.trigger(action);
  }, [action, actionKey]);

  useEffect(() => {
    if (!enabled) return undefined;

    let alive = true;
    let raf = 0;
    let face = null;
    let voice = svetlanaVoice.state;
    let speakingExpression = null;

    const canvas = canvasRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d');

    const frame = (now) => {
      raf = 0;
      if (!alive || !face) return;

      const nextExpression =
        voice.speaking && voice.emotion && voice.emotion !== 'calm'
          ? voice.emotion
          : null;

      if (nextExpression !== speakingExpression) {
        speakingExpression = nextExpression;
        animator.current.setExpression(nextExpression || expression);
      }

      drawFace(
        ctx,
        face,
        canvas.width,
        animator.current.frame(now, { open: voice.open, round: voice.round }),
        now,
      );

      if (!document.hidden) raf = requestAnimationFrame(frame);
    };

    const kick = () => {
      if (!raf && alive && !document.hidden) raf = requestAnimationFrame(frame);
    };

    const unsubscribe = svetlanaVoice.subscribe((state) => {
      voice = state;
      kick();
    });

    const onVisibility = () => {
      if (!document.hidden) kick();
    };

    document.addEventListener('visibilitychange', onVisibility);

    getFace()
      .then((loadedFace) => {
        if (!alive) return;
        face = loadedFace;
        kick();
      })
      .catch(() => {
        if (alive) setFailed(true);
      });

    return () => {
      alive = false;
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [canvasRef, size, enabled, expression]);

  return failed;
}

function VoiceToggle() {
  const [state, setState] = useState(svetlanaVoice.state);

  useEffect(
    () =>
      svetlanaVoice.subscribe((next) =>
        setState({
          enabled: next.enabled,
          supported: next.supported,
          speaking: next.speaking,
        }),
      ),
    [],
  );

  if (!state.supported) return null;

  return (
    <button
      type="button"
      className="sv-voice-toggle"
      onClick={() =>
        state.speaking
          ? svetlanaVoice.stop()
          : svetlanaVoice.setEnabled(!state.enabled)
      }
      aria-label={
        state.speaking
          ? 'Остановить речь'
          : state.enabled
            ? 'Выключить голос Светланы'
            : 'Включить голос Светланы'
      }
      title={state.speaking ? 'Остановить' : state.enabled ? 'Голос включён' : 'Голос выключен'}
    >
      {state.speaking ? '■' : state.enabled ? '🔊' : '🔇'}
    </button>
  );
}

function useSpeaking(enabled) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(
    () =>
      enabled
        ? svetlanaVoice.subscribe((state) => setSpeaking(state.speaking))
        : undefined,
    [enabled],
  );

  return speaking;
}

export function SvetlanaAvatar({
  emotion = 'IDLE',
  size = 44,
  thinking = false,
  className = '',
  live,
  voiceControls = true,
  action = null,
  actionKey = 0,
  fullHead = false,
}) {
  // Live is now the default everywhere. Pass live={false} only for an explicit
  // static image use-case.
  const isLive = live ?? true;
  const canvasRef = useRef(null);
  const [imageFailed, setImageFailed] = useState(false);
  const expression = thinking ? 'thinking' : toExpression(emotion);
  const liveFailed = useLiveFace(
    canvasRef,
    size,
    isLive,
    expression,
    action,
    actionKey,
  );
  const speaking = useSpeaking(isLive);
  const state = String(emotion || 'IDLE').toLowerCase();
  const failed = isLive ? liveFailed : imageFailed;

  const classNames = [
    'sv-photo-avatar',
    `sv-photo-${state}`,
    thinking && 'sv-photo-thinking',
    isLive && 'sv-live',
    speaking && 'sv-speaking',
    fullHead && 'sv-full-head',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={classNames}
      style={{ width: size, height: size }}
      role="img"
      aria-label={speaking ? 'Светлана говорит' : 'Светлана'}
    >
      {failed ? (
        <span
          className="sv-photo-fallback"
          style={{ fontSize: Math.round(size * 0.42) }}
        >
          С
        </span>
      ) : isLive ? (
        <canvas ref={canvasRef} className="sv-face-canvas" aria-hidden="true" />
      ) : (
        <img
          src={FACE}
          alt=""
          draggable="false"
          onError={() => setImageFailed(true)}
        />
      )}

      <span className="sv-photo-status" />
      {isLive && voiceControls && <VoiceToggle />}
    </span>
  );
}

export default SvetlanaAvatar;
