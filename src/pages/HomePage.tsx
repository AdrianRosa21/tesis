import { useEffect, useRef } from 'react';

interface HomePageProps {
  onStart: () => void;
  onOpenTutorial: () => void;
  speak: (text: string) => void;
  stopSpeech: () => void;
}

export function HomePage({ onStart, onOpenTutorial, speak, stopSpeech }: HomePageProps) {
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    speak('Bienvenido a AURA. Esta aplicación tiene su propio lector de voz integrado y se controla con el teclado. Si tienes activado un lector de pantalla como NVDA, JAWS, VoiceOver o TalkBack, puedes desactivarlo ahora: a partir de aquí, AURA leerá todo el contenido por ti. Una excepción: cuando se abra la ventana para elegir tu archivo PDF, esa ventana es del sistema operativo, no de AURA, así que ahí sí necesitas tu lector de pantalla si lo desactivaste. Si es tu primera vez, presiona la tecla H para escuchar un tutorial completo, a tu propio ritmo, con todos los controles. Presiona Enter, la barra espaciadora o el botón Comenzar para continuar sin tutorial.');

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
      <p>
        AURA tiene su propio lector de voz integrado y se controla con el teclado.
        Si usas un lector de pantalla (NVDA, JAWS, VoiceOver, TalkBack), puedes
        desactivarlo ahora: para evitar que dos voces hablen al mismo tiempo,
        a partir de este punto AURA se encarga de leer todo el contenido.
      </p>
      <p>
        Excepción: la ventana para elegir tu archivo PDF es del sistema operativo,
        no de AURA. Si desactivaste tu lector de pantalla, actívalo solo mientras
        eliges el archivo.
      </p>
      <p>
        Si es tu primera vez, presiona la tecla H para escuchar un tutorial completo
        que explica todos los controles, a tu propio ritmo.
      </p>
      <p>Instrucción: Presiona Enter, la barra espaciadora o el botón Comenzar para continuar.</p>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          ref={btnRef}
          onClick={onStart}
        >
          Comenzar
        </button>
        <button onClick={onOpenTutorial}>
          Ver tutorial (H)
        </button>
      </div>
    </main>
  );
}
