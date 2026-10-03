import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import type { SpeechApi } from '../hooks/useSpeech';
import { usePdfDocument } from '../hooks/usePdfDocument';
import { usePageAnalysis } from '../hooks/usePageAnalysis';
import { useReadingNavigation } from '../hooks/useReadingNavigation';
import { usePauseKey } from '../hooks/usePauseKey';
import { useRateKeys } from '../hooks/useRateKeys';
import { isTypingTarget, useWindowKeydown } from '../hooks/useWindowKeydown';
import { formatRate } from '../utils/speechRate';
import { AnalysisDetail } from '../components/AnalysisDetail';
import { PdfViewer } from '../components/PdfViewer';
import { ReaderControls } from '../components/ReaderControls';
import { ReaderStatusBox } from '../components/ReaderStatusBox';
import { ReadingBox } from '../components/ReadingBox';

interface PdfReaderPageProps {
  onBack: () => void;
  onOpenTutorial: () => void;
  speech: SpeechApi;
}

const INITIAL_STATUS =
  'Página de lectura de PDF abierta. Presiona la letra R para seleccionar un archivo, o usa el botón Seleccionar PDF.';

export function PdfReaderPage({ onBack, onOpenTutorial, speech }: PdfReaderPageProps) {
  const {
    speak, stop: stopSpeech, pause, resume, isSpeaking, isPaused, highlight, rate, adjustRate, announce, englishVoice,
  } = speech;

  const [status, setStatus] = useState(INITIAL_STATUS);
  const [pageInputValue, setPageInputValue] = useState('1');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLHeadingElement>(null);
  const hasInitialized = useRef(false);

  const updateStatus = useCallback((message: string) => {
    setStatus(message);
    speak(message, { lang: 'es' });
  }, [speak]);

  const analysis = usePageAnalysis();
  const reading = useReadingNavigation(speech);

  const pdf = usePdfDocument({
    onNavigate: (pageNum, totalPages) => {
      stopSpeech();
      reading.reset();
      setPageInputValue(pageNum.toString());
      headerRef.current?.focus();
      updateStatus(`Página ${pageNum} de ${totalPages}`);
    },
    onMessage: updateStatus,
    onDocumentReplaced: analysis.reset,
  });

  const { currentPage, totalPages, pdfDoc, snapshot } = pdf;
  const pageAnalysis = analysis.analyses[currentPage];
  const elements = pageAnalysis?.elements;
  const currentElement = elements?.[reading.index];
  const isProcessing = analysis.isProcessing;
  const pageIsRendered = snapshot?.pageNum === currentPage;

  useEffect(() => {
    const init = async () => {
      if (hasInitialized.current) return;
      hasInitialized.current = true;

      const restored = await pdf.restoreSession();
      if (!restored) speak(INITIAL_STATUS, { lang: 'es' });
    };

    init();
    return () => stopSpeech();
    // Solo al montar: restaurar la sesion guardada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goTo = (pageNum: number) => {
    if (pdfDoc) pdf.goToPage(pdfDoc, pageNum);
  };

  const handleRead = async () => {
    if (isProcessing) return;

    if (elements) {
      reading.start(elements);
      return;
    }

    if (!pageIsRendered || !snapshot?.canvasDataUrl) {
      updateStatus('La pagina todavia se esta preparando. Intenta de nuevo en un momento.');
      return;
    }

    updateStatus('Analizando estructura de la página con inteligencia artificial, por favor espera unos segundos.');
    stopSpeech();
    speak('Analizando la página con inteligencia artificial. Por favor, espera...', { lang: 'es' });

    try {
      const result = await analysis.analyze(currentPage, snapshot.canvasDataUrl, snapshot.nativeText);
      pdf.releaseImage(currentPage);
      setStatus(`Análisis completado. Se encontraron ${result.elements.length} elementos en la página ${currentPage}.`);
      reading.start(result.elements);
    } catch (error) {
      console.error(error);
      updateStatus(error instanceof Error ? error.message : 'No fue posible analizar la página con AURA.');
    }
  };

  const handlePauseResume = () => {
    if (isPaused) resume();
    else if (isSpeaking) pause();
  };

  const handleBack = () => {
    stopSpeech();
    pdf.forgetDocument();
    onBack();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    stopSpeech();
    pdf.openFile(file);
  };

  const handlePageInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    const value = parseInt(pageInputValue, 10);
    if (!isNaN(value) && pdfDoc && value >= 1 && value <= totalPages) {
      goTo(value);
    } else {
      setPageInputValue(currentPage.toString());
      speak(`Página no válida. El documento tiene ${totalPages} páginas.`, { lang: 'es' });
    }
  };

  const pauseKey = usePauseKey(handlePauseResume);
  const rateKeys = useRateKeys({
    onAdjust: adjustRate,
    onSettle: () => announce(`Velocidad ${formatRate(rate)}`),
  });

  useWindowKeydown((event) => {
    if (isTypingTarget(document.activeElement)) return;
    if (pauseKey.handleKeyDown(event) || rateKeys.handleKeyDown(event)) return;

    const key = event.key;
    const lower = key.toLowerCase();

    if (lower === 'f') {
      if (pdfDoc && !isProcessing) handleRead();
    } else if (lower === 'r') {
      if (!isProcessing) fileInputRef.current?.click();
    } else if (lower === 'g') {
      stopSpeech();
    } else if (lower === 'j') {
      handleBack();
    } else if (key === 'ArrowDown') {
      event.preventDefault();
      if (elements) reading.next(elements);
    } else if (key === 'ArrowUp') {
      event.preventDefault();
      if (elements) reading.previous(elements);
    } else if (lower === 'v') {
      event.preventDefault();
      if (elements) reading.repeat(elements);
    } else if (key === 'ArrowRight') {
      event.preventDefault();
      if (!isProcessing) goTo(currentPage + 1);
    } else if (key === 'ArrowLeft') {
      event.preventDefault();
      if (!isProcessing) goTo(currentPage - 1);
    } else if (key === 'Home') {
      event.preventDefault();
      if (pdfDoc && !isProcessing) goTo(1);
    } else if (key === 'End') {
      event.preventDefault();
      if (pdfDoc && !isProcessing) goTo(totalPages);
    }
  });

  return (
    <main style={{ maxWidth: '1000px', padding: '1rem', margin: '0 auto' }}>
      <h1 ref={headerRef} tabIndex={-1} style={{ outline: 'none', margin: '0 0 1rem 0' }}>
        Lector de PDF
      </h1>

      {/* AURA lee este texto con su propia voz (speak()). Se oculta del lector
          de pantalla nativo (aria-hidden) para que no hablen dos voces a la
          vez sobre el mismo estado. */}
      <div aria-live="polite" aria-hidden="true" className="visually-hidden">
        {status}
      </div>

      <ReaderStatusBox
        status={status}
        fileName={pdf.fileName}
        currentPage={currentPage}
        totalPages={totalPages}
        rate={rate}
        englishVoice={englishVoice}
      />

      <AnalysisDetail meta={pageAnalysis?.meta ?? null} />

      <ReaderControls
        fileInputRef={fileInputRef}
        onFileChange={handleFileChange}
        isProcessing={isProcessing}
        currentPage={currentPage}
        totalPages={totalPages}
        pageInputValue={pageInputValue}
        onPageInputChange={(event) => setPageInputValue(event.target.value)}
        onPageInputKeyDown={handlePageInputKeyDown}
        canRead={pageIsRendered || Boolean(elements)}
        canRepeat={Boolean(elements)}
        isSpeaking={isSpeaking}
        isPaused={isPaused}
        onSelectFile={() => fileInputRef.current?.click()}
        onPrevious={() => goTo(currentPage - 1)}
        onNext={() => goTo(currentPage + 1)}
        onRead={handleRead}
        onPauseResume={handlePauseResume}
        onStop={stopSpeech}
        onRepeat={() => elements && reading.repeat(elements)}
        onBack={handleBack}
        onOpenTutorial={onOpenTutorial}
      />

      {reading.readingText && currentElement && (
        <ReadingBox element={currentElement} text={reading.readingText} highlight={highlight} />
      )}

      <PdfViewer canvasRef={pdf.canvasRef} visible={Boolean(pdfDoc)} />
    </main>
  );
}
