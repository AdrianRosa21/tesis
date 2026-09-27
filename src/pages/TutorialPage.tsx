import { useEffect, useRef, useState } from 'react';

interface TutorialPageProps {
  onExit: () => void;
  speak: (text: string) => void;
  pauseSpeech: () => void;
  resumeSpeech: () => void;
  stopSpeech: () => void;
  isSpeaking: boolean;
  isPaused: boolean;
}

interface TutorialStep {
  title: string;
  text: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Cómo se usa este tutorial',
    text: 'Te voy a explicar, paso a paso y a tu propio ritmo, cómo usar AURA. Usa la flecha derecha o la flecha hacia abajo para escuchar el siguiente paso, y la flecha izquierda o la flecha hacia arriba para volver al paso anterior. Presiona la tecla V en cualquier momento para repetir el paso actual desde el inicio. Usa la barra espaciadora para pausar o continuar. Cuando quieras salir, presiona Escape o la tecla H.',
  },
  {
    title: 'Seleccionar un documento',
    text: 'Presiona la tecla R, o el botón Seleccionar PDF, para abrir la ventana donde eliges el archivo PDF que quieres leer. Esa ventana es del sistema operativo, no de AURA: si desactivaste tu lector de pantalla, actívalo solo mientras eliges el archivo.',
  },
  {
    title: 'Analizar una página',
    text: 'Cuando el documento ya está cargado, presiona la tecla F para que AURA analice la página actual con inteligencia artificial y empiece a leerla. El análisis puede tardar unos segundos, sobre todo si la página tiene tablas, gráficas o imágenes.',
  },
  {
    title: 'Moverte dentro de una página',
    text: 'Cuando AURA termina de analizar una página, la divide en partes: párrafos, títulos, tablas o descripciones de imágenes. Usa la flecha hacia abajo para escuchar la siguiente parte, y la flecha hacia arriba para escuchar la parte anterior.',
  },
  {
    title: 'Repetir lo que estás escuchando',
    text: 'Si se te escapó algo, presiona la tecla V para que AURA repita la parte actual desde el principio, sin avanzar ni retroceder.',
  },
  {
    title: 'Pausar y continuar',
    text: 'Presiona la barra espaciadora para pausar la lectura en cualquier momento, y vuelve a presionarla para continuar exactamente donde te quedaste.',
  },
  {
    title: 'Detener la lectura',
    text: 'Presiona la tecla G si quieres que AURA deje de hablar por completo, por ejemplo si ya escuchaste lo que necesitabas.',
  },
  {
    title: 'Cambiar de página',
    text: 'Usa la flecha derecha para ir a la página siguiente, y la flecha izquierda para ir a la página anterior. También puedes escribir un número de página en el campo de texto y presionar Enter o espacio. Las teclas Inicio y Fin te llevan directamente a la primera o a la última página del documento.',
  },
  {
    title: 'Volver al inicio',
    text: 'Presiona la tecla J cuando quieras cerrar el documento actual y volver a la pantalla principal para elegir otro archivo. Ojo: esto borra el documento guardado en tu navegador, así que la próxima vez vas a tener que seleccionar uno de nuevo.',
  },
  {
    title: 'Repetir este tutorial',
    text: 'Puedes volver a escuchar este tutorial cuando quieras presionando la tecla H, tanto desde la pantalla principal como desde el lector de PDF. Esto termina el tutorial. Presiona Escape o la tecla H para salir y empezar a usar AURA.',
  },
];

export function TutorialPage({
  onExit,
  speak,
  pauseSpeech,
  resumeSpeech,
  stopSpeech,
  isSpeaking,
  isPaused,
}: TutorialPageProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const headerRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (headerRef.current) {
      headerRef.current.focus();
    }
    return () => stopSpeech();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const step = TUTORIAL_STEPS[stepIndex];
    speak(`Paso ${stepIndex + 1} de ${TUTORIAL_STEPS.length}. ${step.title}. ${step.text}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) return;

      const key = e.key;

      if (key === 'Escape' || key.toLowerCase() === 'h') {
        e.preventDefault();
        onExit();
      } else if (key === 'ArrowDown' || key === 'ArrowRight') {
        e.preventDefault();
        if (stepIndex < TUTORIAL_STEPS.length - 1) {
          setStepIndex(stepIndex + 1);
        } else {
          stopSpeech();
          speak('Ya escuchaste el último paso. Presiona Escape o la tecla H para salir del tutorial.');
        }
      } else if (key === 'ArrowUp' || key === 'ArrowLeft') {
        e.preventDefault();
        if (stepIndex > 0) {
          setStepIndex(stepIndex - 1);
        } else {
          stopSpeech();
          speak('Este es el primer paso del tutorial.');
        }
      } else if (key.toLowerCase() === 'v') {
        e.preventDefault();
        const step = TUTORIAL_STEPS[stepIndex];
        speak(`Paso ${stepIndex + 1} de ${TUTORIAL_STEPS.length}. ${step.title}. ${step.text}`);
      } else if (key === ' ') {
        e.preventDefault();
        if (isPaused) resumeSpeech();
        else if (isSpeaking) pauseSpeech();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const step = TUTORIAL_STEPS[stepIndex];

  return (
    <main style={{ maxWidth: '700px', padding: '1rem', margin: '0 auto' }}>
      <h1 ref={headerRef} tabIndex={-1} style={{ outline: 'none', margin: '0 0 1rem 0' }}>
        Tutorial de AURA
      </h1>

      {/* AURA lee este contenido con su propia voz; se oculta del lector de
          pantalla nativo para que no hablen dos voces sobre el mismo paso. */}
      <div aria-hidden="true" className="status-box" style={{ marginBottom: '1rem', padding: '1rem' }}>
        <p style={{ margin: '0 0 0.5rem 0' }}>
          <strong>Paso {stepIndex + 1} de {TUTORIAL_STEPS.length}: {step.title}</strong>
        </p>
        <p style={{ margin: 0, lineHeight: '1.6' }}>{step.text}</p>
      </div>

      <div className="controls" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => stepIndex > 0 && setStepIndex(stepIndex - 1)}
          disabled={stepIndex === 0}
          aria-disabled={stepIndex === 0 ? 'true' : 'false'}
        >
          Paso anterior (Flecha Izq)
        </button>
        <button
          onClick={() => stepIndex < TUTORIAL_STEPS.length - 1 && setStepIndex(stepIndex + 1)}
          disabled={stepIndex === TUTORIAL_STEPS.length - 1}
          aria-disabled={stepIndex === TUTORIAL_STEPS.length - 1 ? 'true' : 'false'}
        >
          Paso siguiente (Flecha Der)
        </button>
        <button onClick={() => speak(`Paso ${stepIndex + 1} de ${TUTORIAL_STEPS.length}. ${step.title}. ${step.text}`)}>
          Repetir paso (V)
        </button>
        <button onClick={onExit}>
          Salir del tutorial (H)
        </button>
      </div>
    </main>
  );
}
