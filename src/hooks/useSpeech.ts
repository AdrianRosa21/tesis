import { useState, useEffect, useCallback, useRef } from 'react';

export interface HighlightState {
  start: number;
  length: number;
}

interface UseSpeechResult {
  speak: (text: string, onEnd?: () => void) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  isSpeaking: boolean;
  isPaused: boolean;
  highlight: HighlightState | null;
}

export function useSpeech(): UseSpeechResult {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [highlight, setHighlight] = useState<HighlightState | null>(null);
  const synth = window.speechSynthesis;
  const onEndCallbackRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    if (synth) {
      synth.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
      setHighlight(null);
    }
  }, [synth]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      stop();
    };
  }, [stop]);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!synth) return;

    stop();

    if (onEnd) {
      onEndCallbackRef.current = onEnd;
    } else {
      onEndCallbackRef.current = null;
    }

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

    const speakChunk = () => {
      if (currentChunkIndex >= chunks.length) {
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
      
      utterance.onboundary = (event) => {
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
        currentChunkIndex++;
        speakChunk();
      };

      utterance.onerror = (e) => {
        console.error("SpeechSynthesisError", e);
        setIsSpeaking(false);
        setIsPaused(false);
        setHighlight(null);
      };

      synth.speak(utterance);
      setIsSpeaking(true);
      setIsPaused(false);
    };

    speakChunk();
  }, [synth, stop]);

  const pause = useCallback(() => {
    if (synth && synth.speaking && !synth.paused) {
      synth.pause();
      setIsPaused(true);
    }
  }, [synth]);

  const resume = useCallback(() => {
    if (synth && synth.paused) {
      synth.resume();
      setIsPaused(false);
    }
  }, [synth]);

  return {
    speak,
    pause,
    resume,
    stop,
    isSpeaking,
    isPaused,
    highlight
  };
}
