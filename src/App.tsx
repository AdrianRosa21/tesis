import { useState, useEffect, useCallback, useRef } from 'react';
import { HomePage } from './pages/HomePage';
import { PdfReaderPage } from './pages/PdfReaderPage';
import { TutorialPage } from './pages/TutorialPage';
import { useSpeech } from './hooks/useSpeech';
import { getPdfFile } from './utils/db';

type Page = 'home' | 'reader' | 'tutorial';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const pageBeforeTutorialRef = useRef<'home' | 'reader'>('home');
  const speech = useSpeech();
  const { speak, stop } = speech;

  const handleStart = useCallback(() => {
    stop();
    setCurrentPage('reader');
  }, [stop]);

  const handleBack = useCallback(() => {
    stop();
    setCurrentPage('home');
  }, [stop]);

  const handleOpenTutorial = useCallback(() => {
    if (currentPage === 'home' || currentPage === 'reader') {
      pageBeforeTutorialRef.current = currentPage;
    }
    stop();
    setCurrentPage('tutorial');
  }, [currentPage, stop]);

  const handleExitTutorial = useCallback(() => {
    stop();
    setCurrentPage(pageBeforeTutorialRef.current);
  }, [stop]);

  useEffect(() => {
    const checkSavedSession = async () => {
      try {
        const savedBuffer = await getPdfFile('currentPdf');
        if (savedBuffer) {
          setCurrentPage('reader');
        }
      } catch (e) {
        console.error(e);
      }
    };
    checkSavedSession();
  }, []);

  useEffect(() => {
    let isKeyboardNav = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        isKeyboardNav = true;
      }

      if (e.key.toLowerCase() === 'h' && currentPage !== 'tutorial') {
        const active = document.activeElement?.tagName;
        if (active === 'INPUT' || active === 'TEXTAREA' || active === 'SELECT') return;
        e.preventDefault();
        handleOpenTutorial();
      }
    };

    const handleMouseDown = () => {
      isKeyboardNav = false;
    };

    const handleFocus = (e: FocusEvent) => {
      if (!isKeyboardNav) return;
      
      const target = e.target as HTMLElement;
      if (!target) return;

      let text = '';
      if (target.tagName === 'BUTTON') {
        const rawText = target.textContent?.trim() || '';
        const isDisabled = target.getAttribute('aria-disabled') === 'true';
        const disabledText = isDisabled ? '. Deshabilitado.' : '';
        
        text = `Botón: ${rawText}${disabledText}`;
        if (rawText.includes('(F)')) {
          text = `Botón: ${rawText.replace('(F)', '')}${disabledText} Presiona la tecla F.`;
        } else if (rawText.includes('(R)')) {
          text = `Botón: ${rawText.replace('(R)', '')}${disabledText} Presiona la tecla R.`;
        } else if (rawText.includes('(J)')) {
          text = `Botón: ${rawText.replace('(J)', '')}${disabledText} Presiona la tecla J.`;
        } else if (rawText.includes('(Espacio)')) {
          text = `Botón: ${rawText.replace('(Espacio)', '')}${disabledText} Presiona la barra espaciadora.`;
        } else if (rawText.includes('(G)')) {
          text = `Botón: ${rawText.replace('(G)', '')}${disabledText} Presiona la tecla G.`;
        } else if (rawText.includes('(H)')) {
          text = `Botón: ${rawText.replace('(H)', '')}${disabledText} Presiona la tecla H.`;
        } else if (rawText.includes('(Flecha Izq)')) {
          text = `Botón: ${rawText.replace('(Flecha Izq)', '')}${disabledText} Presiona la flecha izquierda.`;
        } else if (rawText.includes('(Flecha Der)')) {
          text = `Botón: ${rawText.replace('(Flecha Der)', '')}${disabledText} Presiona la flecha derecha.`;
        } else if (rawText === 'Comenzar') {
          text = `Botón: Comenzar${disabledText} Presiona Enter o la barra espaciadora.`;
        }
      } else if (target.tagName === 'INPUT') {
        const input = target as HTMLInputElement;
        const label = input.getAttribute('aria-label') || 'Entrada de datos';
        const isDisabled = input.getAttribute('aria-disabled') === 'true';
        const disabledText = isDisabled ? '. Deshabilitado.' : '';
        text = `Campo: ${label}${disabledText} Valor actual: ${input.value}. Digita un número para cambiar de página.`;
      } else if (target.tagName === 'H1' || target.tagName === 'H2') {
        text = `Título: ${target.textContent?.trim()}`;
      }

      if (text) {
        speak(text, { lang: 'es' });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('focusin', handleFocus);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('focusin', handleFocus);
    };
  }, [speak, currentPage, handleOpenTutorial]);

  return (
    <>
      {currentPage === 'home' && (
        <HomePage
          onStart={handleStart}
          onOpenTutorial={handleOpenTutorial}
          speech={speech}
        />
      )}
      {currentPage === 'reader' && (
        <PdfReaderPage
          onBack={handleBack}
          onOpenTutorial={handleOpenTutorial}
          speech={speech}
        />
      )}
      {currentPage === 'tutorial' && (
        <TutorialPage
          onExit={handleExitTutorial}
          speech={speech}
        />
      )}
    </>
  );
}

export default App;
