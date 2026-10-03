import { useEffect, useRef, useState } from 'react';
import type { SpeechApi } from '../hooks/useSpeech';
import { usePauseKey } from '../hooks/usePauseKey';
import { useRateKeys } from '../hooks/useRateKeys';
import { isTypingTarget, useWindowKeydown } from '../hooks/useWindowKeydown';
import { formatRate } from '../utils/speechRate';

interface TutorialPageProps {
  onExit: () => void;
  speech: SpeechApi;
}

interface TutorialStep {
  title: string;
  text: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Cómo se usa este tutorial',
    text: 'Te voy a explicar, paso a paso y a tu propio ritmo, cómo usar AURA. Usa la flecha derecha o la flecha hacia abajo para escuchar el siguiente paso, y la flecha izquierda o la flecha hacia arriba para volver al paso anterior. Presiona la tecla V en cualquier momento para repetir el paso actual desde el inicio. La barra espaciadora pausa o continúa. Con la tecla más y la tecla menos cambias la velocidad de la voz. Cuando quieras salir, presiona Escape.',
  },
  {
    title: 'Seleccionar un documento',
    text: 'Presiona la tecla R, o el botón Seleccionar PDF, para abrir la ventana donde eliges el archivo PDF que quieres leer. Esa ventana es del sistema operativo, no de AURA: si desactivaste tu lector de pantalla, actívalo solo mientras eliges el archivo.',
  },
  {
    title: 'Analizar una página',
    text: 'Cuando el documento ya está cargado, presiona la tecla F para que AURA analice la página actual con inteligencia artificial y empiece a leerla. El análisis puede tardar unos segundos, sobre todo si la página tiene tablas, gráficas o imágenes. En pantalla verás qué detectó en la página y cuánto tardó.',
  },
  {
    title: 'Moverte dentro de una página',
    text: 'Cuando AURA termina de analizar una página, la divide en partes: oraciones, títulos, tablas o descripciones de imágenes. Usa la flecha hacia abajo para escuchar la siguiente parte, y la flecha hacia arriba para escuchar la parte anterior.',
  },
  {
    title: 'Repetir lo que estás escuchando',
    text: 'Si se te escapó algo, presiona la tecla V para que AURA repita la parte actual desde el principio, sin avanzar ni retroceder.',
  },
  {
    title: 'Pausar y continuar',
    text: 'Presiona la barra espaciadora para pausar la lectura en cualquier momento, y vuelve a presionarla para continuar exactamente donde te quedaste. La pausa es inmediata.',
  },
  {
    title: 'Velocidad de la voz',
    text: 'Presiona la tecla más, la del signo de suma, para leer más rápido, y la tecla menos, la del guion, para leer más lento. También sirven las teclas más y menos del teclado numérico. Cada pulsación cambia la velocidad en cero punto cero cinco, y la voz se adapta al instante. Si dejas la tecla presionada, la velocidad sigue cambiando poco a poco. Cuando dejas de pulsar, AURA te dice la velocidad en que quedó, y la recuerda la próxima vez. Prueba ahora mismo con este paso.',
  },
  {
    title: 'Idiomas',
    text: 'Si una página está en inglés, AURA cambia sola a una voz en inglés. Usa la voz en inglés de tu navegador si la tiene, y si no, usa una voz estadounidense que genera el servidor, para que nunca lea el inglés con acento español. En la pantalla del lector puedes ver cuál voz está usando. Las descripciones de imágenes, gráficas y tablas se leen en español.',
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
    text: 'Puedes volver a escuchar este tutorial cuando quieras presionando la tecla H, tanto desde la pantalla principal como desde el lector de PDF. Esto termina el tutorial. Presiona Escape para salir y empezar a usar AURA.',
  },
];

function spokenStep(index: number): string {
  const step = TUTORIAL_STEPS[index];
  return `Paso ${index + 1} de ${TUTORIAL_STEPS.length}. ${step.title}. ${step.text}`;
}

export function TutorialPage({ onExit, speech }: TutorialPageProps) {
  const { speak, stop: stopSpeech, pause, resume, isSpeaking, isPaused, rate, adjustRate, announce } = speech;
  const [stepIndex, setStepIndex] = useState(0);
  const headerRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headerRef.current?.focus();
    return () => stopSpeech();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    speak(spokenStep(stepIndex), { lang: 'es' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  const pauseKey = usePauseKey(() => {
    if (isPaused) resume();
    else if (isSpeaking) pause();
  });
  const rateKeys = useRateKeys({
    onAdjust: adjustRate,
    onSettle: () => announce(`Velocidad ${formatRate(rate)}`),
  });

  useWindowKeydown((event) => {
    if (isTypingTarget(document.activeElement)) return;
    if (pauseKey.handleKeyDown(event) || rateKeys.handleKeyDown(event)) return;

    const key = event.key;

    if (key === 'Escape') {
      event.preventDefault();
      onExit();
    } else if (key === 'ArrowDown' || key === 'ArrowRight') {
      event.preventDefault();
      if (stepIndex < TUTORIAL_STEPS.length - 1) {
        setStepIndex(stepIndex + 1);
      } else {
        speak('Ya escuchaste el último paso. Presiona Escape para salir del tutorial.', { lang: 'es' });
      }
    } else if (key === 'ArrowUp' || key === 'ArrowLeft') {
      event.preventDefault();
      if (stepIndex > 0) {
        setStepIndex(stepIndex - 1);
      } else {
        speak('Este es el primer paso del tutorial.', { lang: 'es' });
      }
    } else if (key.toLowerCase() === 'v') {
      event.preventDefault();
      speak(spokenStep(stepIndex), { lang: 'es' });
    }
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
        <p style={{ margin: '0.5rem 0 0 0' }}>
          <strong>Velocidad de lectura:</strong> {formatRate(rate)}×
        </p>
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
        <button onClick={() => speak(spokenStep(stepIndex), { lang: 'es' })}>
          Repetir paso (V)
        </button>
        <button onClick={onExit}>
          Salir del tutorial (Escape)
        </button>
      </div>
    </main>
  );
}
