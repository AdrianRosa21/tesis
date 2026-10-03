import { useState, useEffect, useCallback, useRef } from 'react';
import {
  type SpeechLang,
  detectLanguage,
  fallbackLanguageTag,
  pickVoice,
} from '../utils/language';
import { RATE_STEP, clampRate, loadRate, saveRate } from '../utils/speechRate';
import { cleanForServerVoice, serverVoice } from '../utils/serverVoice';
import {
  type EnglishVoiceSource,
  chooseEnglishSource,
  describeEnglishSource,
  loadVoicePreference,
} from '../utils/voiceSource';

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
  /** De dónde sale la voz que lee en inglés (para mostrarlo en pantalla). */
  englishVoice: string;
  /** Idioma y voz con que se leyó la última frase (para ver de inmediato si sonó la voz equivocada). */
  lastVoice: string;
}

const MAX_RETRIES = 2;
// Espera antes de repetir la frase actual con la velocidad nueva, para no
// cancelar y reiniciar la voz en cada pulsacion cuando se cambia rapido.
const RESTART_DELAY_MS = 150;

function currentEnglishSource(synth: SpeechSynthesis | undefined): EnglishVoiceSource {
  if (!synth) return { kind: 'none' };
  return chooseEnglishSource(synth.getVoices(), serverVoice.available, loadVoicePreference(), navigator.language);
}

export function useSpeech(): SpeechApi {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [highlight, setHighlight] = useState<HighlightState | null>(null);
  const [rate, setRateState] = useState<number>(() => loadRate());
  const synth = window.speechSynthesis;
  const [englishSource, setEnglishSource] = useState<EnglishVoiceSource>(() => currentEnglishSource(synth));
  const [lastVoice, setLastVoice] = useState('');
  const onEndCallbackRef = useRef<(() => void) | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const rateRef = useRef<number>(rate);
  const restartCurrentRef = useRef<(() => void) | null>(null);
  const restartTimerRef = useRef<number | null>(null);

  // Voz del servidor (audio): una sola pieza de audio que se reutiliza frase por frase.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakIdRef = useRef(0);
  const serverActiveRef = useRef(false);
  const serverPausedRef = useRef(false);
  const pendingStartRef = useRef<(() => void) | null>(null);

  const refreshEnglishSource = useCallback(() => {
    setEnglishSource(currentEnglishSource(synth));
  }, [synth]);

  useEffect(() => {
    if (!synth) return;
    // El navegador carga sus voces despues de abrir la pagina; el servidor se consulta una vez.
    void serverVoice.check().then(refreshEnglishSource);
    synth.addEventListener?.('voiceschanged', refreshEnglishSource);
    return () => synth.removeEventListener?.('voiceschanged', refreshEnglishSource);
  }, [synth, refreshEnglishSource]);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const stopServerAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }
    serverActiveRef.current = false;
    serverPausedRef.current = false;
    pendingStartRef.current = null;
  }, []);

  const stop = useCallback(() => {
    speakIdRef.current += 1; // lo que siga en vuelo (descargas, eventos) queda cancelado
    stopServerAudio();
    if (synth) {
      clearRestartTimer();
      restartCurrentRef.current = null;
      currentUtteranceRef.current = null;
      synth.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
      setHighlight(null);
    }
  }, [synth, clearRestartTimer, stopServerAudio]);

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
    const speakId = speakIdRef.current;

    onEndCallbackRef.current = options.onEnd ?? null;
    const lang: SpeechLang = options.lang ?? detectLanguage(text) ?? 'es';

    // El ingles se lee con la voz del servidor cuando el navegador no tiene ninguna voz en ingles.
    let useServer = lang === 'en' && currentEnglishSource(synth).kind === 'server';
    if (lang === 'en' && !serverVoice.available) void serverVoice.check().then(refreshEnglishSource);

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

    // Lee una frase con el audio del servidor. Si algo falla, esa misma frase (y las siguientes)
    // se leen con la voz del navegador: nunca se queda en silencio.
    const playChunkWithServer = (chunkObj: { text: string; startIndex: number }) => {
      serverActiveRef.current = true;
      setLastVoice('inglés · voz del servidor (Piper)');
      setIsSpeaking(true);
      setIsPaused(serverPausedRef.current);
      // El audio no avisa palabra por palabra: se resalta la frase completa.
      setHighlight({ start: chunkObj.startIndex, length: chunkObj.text.length });

      let settled = false;
      const fallBack = () => {
        if (settled || speakIdRef.current !== speakId) return;
        settled = true;
        serverVoice.markFailed();
        useServer = false;
        stopServerAudio();
        refreshEnglishSource();
        speakChunk();
      };

      const next = chunks[currentChunkIndex + 1];
      if (next) serverVoice.prefetch(cleanForServerVoice(next.text));

      serverVoice
        .getAudioUrl(cleanForServerVoice(chunkObj.text))
        .then((url) => {
          if (settled || speakIdRef.current !== speakId) return;
          const audio = (audioRef.current ??= new Audio());
          audio.onended = () => {
            if (settled || speakIdRef.current !== speakId) return;
            settled = true;
            currentChunkIndex++;
            speakChunk();
          };
          audio.onerror = fallBack;
          audio.src = url;
          audio.preservesPitch = true;
          audio.playbackRate = rateRef.current;
          const start = () => { audio.play().catch(fallBack); };
          if (serverPausedRef.current) pendingStartRef.current = start;
          else start();
        })
        .catch(fallBack);
    };

    const speakChunk = (retryCount = 0) => {
      if (currentChunkIndex >= chunks.length) {
        restartCurrentRef.current = null;
        serverActiveRef.current = false;
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

      if (useServer) {
        playChunkWithServer(chunkObj);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunkText);
      utterance.rate = rateRef.current;
      applyVoice(utterance, lang);
      setLastVoice(`${lang === 'en' ? 'inglés' : 'español'} · ${utterance.voice?.name ?? 'voz predeterminada del navegador'}`);
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
  }, [synth, stop, applyVoice, stopServerAudio, refreshEnglishSource]);

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

    if (serverActiveRef.current && audioRef.current) {
      // El audio cambia de velocidad al instante, sin reiniciar la frase.
      audioRef.current.playbackRate = next;
    } else if (synth && restartCurrentRef.current && currentUtteranceRef.current && !synth.paused) {
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
    if (serverActiveRef.current) {
      serverPausedRef.current = true;
      audioRef.current?.pause();
      setIsPaused(true);
      return;
    }
    if (synth) {
      synth.pause();
      setIsPaused(true);
    }
  }, [synth]);

  const resume = useCallback(() => {
    if (serverActiveRef.current && serverPausedRef.current) {
      serverPausedRef.current = false;
      setIsPaused(false);
      const start = pendingStartRef.current;
      pendingStartRef.current = null;
      if (start) start();
      else void audioRef.current?.play().catch(() => undefined);
      return;
    }
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
    englishVoice: describeEnglishSource(englishSource),
    lastVoice,
  };
}
