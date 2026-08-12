import { useEffect, useRef } from 'react';

interface HomePageProps {
  onStart: () => void;
  speak: (text: string) => void;
  stopSpeech: () => void;
}

export function HomePage({ onStart, speak, stopSpeech }: HomePageProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const welcomedRef = useRef(false);

  useEffect(() => {
    if (!welcomedRef.current) {
      welcomedRef.current = true;
      speak('Bienvenido. Esta aplicación te permite cargar un documento PDF y escuchar su contenido. Presiona Enter, la barra espaciadora o el botón Comenzar para continuar.');
    }
    
    // Auto focus button
    if (btnRef.current) {
      btnRef.current.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onStart();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      stopSpeech();
    };
  }, [speak, stopSpeech, onStart]);

  return (
    <main>
      <h1>Lector de PDF Accesible</h1>
      <p>Esta aplicación te permite cargar un documento PDF y escuchar su contenido.</p>
      <p>Instrucción: Presiona Enter, la barra espaciadora o el botón Comenzar para continuar.</p>
      <button 
        ref={btnRef}
        onClick={onStart}
      >
        Comenzar
      </button>
    </main>
  );
}
