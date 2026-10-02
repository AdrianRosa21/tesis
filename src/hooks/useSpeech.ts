import { useState, useEffect, useCallback, useRef } from 'react';
import {
  type SpeechLang,
  detectLanguage,
  fallbackLanguageTag,
  pickVoice,
} from '../utils/language';
import { RATE_STEP, clampRate, loadRate, saveRate } from '../utils/speechRate';

export interface HighlightState {
  start: number;
  length: number;
}

export interface SpeakOptions {
  /** Idioma de la voz. Si no se indica, se detecta a partir del texto. */
  lang?: SpeechLang;
  onEnd?: () => void;
}

export interface SpeechApi {
  speak: (text: string, options?: SpeakOptions) => void;
  /** Dice un aviso corto sin interrumpir la lectura en curso (queda en cola). */
  announce: (text: string, lang?: SpeechLang) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  rate: number;
  setRate: (rate: number) => number;
  adjustRate: (steps: number) => number;
  isSpeaking: boolean;
  isPaused: boolean;
  highlight: HighlightState | null;
}

const MAX_RETRIES = 2;
// Espera antes de repetir la frase actual con la velocidad nueva, para no
// cancelar y reiniciar la voz en cada pulsacion cuando se cambia rapido.
const RESTART_DELAY_MS = 150;

export function useSpeech(): SpeechApi {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [highlight, setHighlight] = useState<HighlightState | null>(null);
  const [rate, setRateState] = useState<number>(() => loadRate());
  const synth = window.speechSynthesis;
  const onEndCallbackRef = useRef<(() => void) | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const rateRef = useRef<number>(rate);
  const restartCurrentRef = useRef<(() => void) | null>(null);
  const restartTimerRef = useRef<number | null>(null);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    if (synth) {
      clearRestartTimer();
      restartCurrentRef.current = null;
      currentUtteranceRef.current = null;
      synth.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
      setHighlight(null);
    }
  }, [synth, clearRestartTimer]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      stop();
    };
  }, [stop]);

  const applyVoice = useCallback((utterance: SpeechSynthesisUtterance, lang: SpeechLang) => {
    const voice = pickVoice(synth.getVoices(), lang, navigator.language);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = fallbackLanguageTag(lang);
    }
  }, [synth]);

  const speak = useCallback((text: string, options: SpeakOptions = {}) => {
    if (!synth) return;

    stop();

    onEndCallbackRef.current = options.onEnd ?? null;
    const lang: SpeechLang = options.lang ?? detectLanguage(text) ?? 'es';

    // Identify chunks and their global start index
    const chunks: { text: string; startIndex: number }[] = [];
    const regex = /[^.!?\n]+[.!?\n]+|[^.!?\n]+/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      chunks.push({ text: match[0], startIndex: match.index });
    }

    if (chunks.length === 0) {
      chunks.push({ text, startIndex: 0 });
    }

    let currentChunkIndex = 0;

    const speakChunk = (retryCount = 0) => {
      if (currentChunkIndex >= chunks.length) {
        restartCurrentRef.current = null;
        setIsSpeaking(false);
        setIsPaused(false);
        setHighlight(null);
        if (onEndCallbackRef.current) {
          onEndCallbackRef.current();
        }
        return;
      }

      const chunkObj = chunks[currentChunkIndex];
      const chunkText = chunkObj.text;

      if (!chunkText.trim()) {
        currentChunkIndex++;
        speakChunk();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunkText);
      utterance.rate = rateRef.current;
      applyVoice(utterance, lang);
      currentUtteranceRef.current = utterance;

      utterance.onboundary = (event) => {
        if (currentUtteranceRef.current !== utterance) return;
        if (event.name === 'word') {
          const globalStart = chunkObj.startIndex + event.charIndex;

          let length = event.charLength;
          if (!length) {
            // fallback: guess word length by finding the next space/punctuation
            const remaining = text.slice(globalStart);
            const wordMatch = remaining.match(/^[^\s]+/);
            length = wordMatch ? wordMatch[0].length : 1;
          }

          setHighlight({ start: globalStart, length });
        }
      };

      utterance.onend = () => {
        if (currentUtteranceRef.current !== utterance) return;
        currentChunkIndex++;
        speakChunk();
      };

      utterance.onerror = (event) => {
        if (currentUtteranceRef.current !== utterance) return;

        if (event.error === 'canceled' || event.error === 'interrupted') {
          setIsSpeaking(false);
          setIsPaused(false);
          setHighlight(null);
          return;
        }

        // Bug conocido de Chrome: el motor de sintesis a veces no esta listo
        // justo al cargar la pagina y la primera llamada falla en silencio.
        // Reintentar resuelve el caso sin que el usuario note nada.
        if (retryCount < MAX_RETRIES) {
          setTimeout(() => {
            if (currentUtteranceRef.current !== utterance) return;
            speakChunk(retryCount + 1);
          }, 250);
          return;
        }

        console.error("SpeechSynthesisError", event);
        setIsSpeaking(false);
        setIsPaused(false);
        setHighlight(null);
      };

      synth.speak(utterance);
      setIsSpeaking(true);
      setIsPaused(false);
    };

    // Repite solo la frase en curso con la velocidad nueva (el resto del texto
    // la toma sola porque cada frase lee la velocidad al crearse).
    restartCurrentRef.current = () => {
      currentUtteranceRef.current = null;
      synth.cancel();
      speakChunk();
    };

    speakChunk();
  }, [synth, stop, applyVoice]);

  const announce = useCallback((text: string, lang: SpeechLang = 'es') => {
    if (!synth) return;
    const utterance = new SpeechSynthesisUtterance(text);
    applyVoice(utterance, lang);
    synth.speak(utterance);
  }, [synth, applyVoice]);

  const setRate = useCallback((value: number): number => {
    const next = clampRate(value);
    if (next === rateRef.current) return next;

    rateRef.current = next;
    setRateState(next);
    saveRate(next);

    if (synth && restartCurrentRef.current && currentUtteranceRef.current && !synth.paused) {
      clearRestartTimer();
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null;
        restartCurrentRef.current?.();
      }, RESTART_DELAY_MS);
    }
    return next;
  }, [synth, clearRestartTimer]);

  const adjustRate = useCallback((steps: number): number => {
    return setRate(rateRef.current + steps * RATE_STEP);
  }, [setRate]);

  const pause = useCallback(() => {
    if (synth) {
      synth.pause();
      setIsPaused(true);
    }
  }, [synth]);

  const resume = useCallback(() => {
    if (synth) {
      synth.resume();
      setIsPaused(false);
    }
  }, [synth]);

  return {
    speak,
    announce,
    pause,
    resume,
    stop,
    rate,
    setRate,
    adjustRate,
    isSpeaking,
    isPaused,
    highlight,
  };
}
