import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { savePdfFile, getPdfFile, deletePdfFile } from '../utils/db';
import { analyzePageStructure, type PageElement } from '../utils/ai';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

interface HighlightState {
  start: number;
  length: number;
}

interface PdfReaderPageProps {
  onBack: () => void;
  speak: (text: string) => void;
  pauseSpeech: () => void;
  resumeSpeech: () => void;
  stopSpeech: () => void;
  isSpeaking: boolean;
  isPaused: boolean;
  highlight: HighlightState | null;
}

interface PageData {
  pageNum: number;
  elements: PageElement[] | null;
  canvasDataUrl: string | null;
  isProcessing: boolean;
}

export function PdfReaderPage({
  onBack,
  speak,
  pauseSpeech,
  resumeSpeech,
  stopSpeech,
  isSpeaking,
  isPaused,
  highlight
}: PdfReaderPageProps) {
  const [fileName, setFileName] = useState<string>('');
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [pageCache, setPageCache] = useState<Record<number, PageData>>({});
  
  const [status, setStatus] = useState<string>('Página de lectura de PDF abierta. Presiona la letra R para seleccionar un archivo, o usa el botón Seleccionar PDF.');
  
  const [currentElementIndex, setCurrentElementIndex] = useState<number>(0);
  const [readingText, setReadingText] = useState<string>('');
  const [pageInputValue, setPageInputValue] = useState<string>('1');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLHeadingElement>(null);
  const visualCanvasRef = useRef<HTMLCanvasElement>(null);
  const hasInitialized = useRef<boolean>(false);
  const renderIdRef = useRef<number>(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    const initSavedPdf = async () => {
      if (hasInitialized.current) return;
      hasInitialized.current = true;
      
      try {
        const savedBuffer = await getPdfFile('currentPdf');
        if (savedBuffer) {
          const doc = await pdfjsLib.getDocument({ data: savedBuffer }).promise;
          setPdfDoc(doc);
          setTotalPages(doc.numPages);
          
          const savedPage = localStorage.getItem('currentPage');
          const savedName = localStorage.getItem('fileName');
          
          if (savedName) setFileName(savedName);
          
          const pageToLoad = savedPage ? parseInt(savedPage, 10) : 1;
          setTimeout(() => goToPage(doc, pageToLoad), 100);
          
          const msg = `Sesión restaurada. Documento ${savedName || ''} cargado en la página ${pageToLoad}.`;
          setStatus(msg);
          speak(msg);
          return;
        }
      } catch (err) {
        console.error("Error loading saved PDF", err);
      }
      speak(status);
    };

    initSavedPdf();
    return () => stopSpeech();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateStatus = useCallback((newStatus: string) => {
    setStatus(newStatus);
    speak(newStatus);
  }, [speak]);

  async function goToPage(doc: pdfjsLib.PDFDocumentProxy, pageNum: number) {
    if (pageNum < 1 || pageNum > doc.numPages) return;
    
    const currentRenderId = ++renderIdRef.current;

    stopSpeech();
    setReadingText('');
    setCurrentElementIndex(0);
    setCurrentPage(pageNum);
    setPageInputValue(pageNum.toString());
    localStorage.setItem('currentPage', pageNum.toString());
    const msg = `Página ${pageNum} de ${doc.numPages}`;
    
    if (headerRef.current) {
      headerRef.current.focus();
    }
    updateStatus(msg);

    try {
      const page = await doc.getPage(pageNum);
      if (currentRenderId !== renderIdRef.current) return;
      
      let dataUrl: string | null = null;
      if (visualCanvasRef.current) {
        const canvas = visualCanvasRef.current;
        const context = canvas.getContext('2d');
        if (context) {
          if (renderTaskRef.current) {
            try { await renderTaskRef.current.cancel(); } catch { /* ignore cancellation errors */ }
          }
          
          const viewport = page.getViewport({ scale: 1.5 });
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          const renderContext = { canvasContext: context, viewport };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const renderTask = page.render(renderContext as any);
          renderTaskRef.current = renderTask;
          
          await renderTask.promise;
          renderTaskRef.current = null;
          
          dataUrl = canvas.toDataURL('image/png');
        }
      }

      setPageCache(prev => ({
        ...prev,
        [pageNum]: {
          pageNum,
          elements: prev[pageNum]?.elements || null,
          canvasDataUrl: dataUrl,
          isProcessing: false
        }
      }));

    } catch (error: unknown) {
      if (currentRenderId !== renderIdRef.current) return; 
      const err = error as Error;
      if (err?.name === 'RenderingCancelledException' || err?.message?.includes('cancelled')) return; 
      console.error("Error real al renderizar:", err);
      updateStatus("Error al renderizar la página.");
    }
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      updateStatus('El archivo seleccionado no es un PDF válido.');
      return;
    }

    setFileName(file.name);
    updateStatus(`Archivo seleccionado: ${file.name}. Procesando PDF, por favor espera.`);
    setPdfDoc(null);
    setPageCache({});
    setCurrentPage(1);
    setTotalPages(0);
    stopSpeech();

    try {
      const arrayBuffer = await file.arrayBuffer();
      await savePdfFile('currentPdf', arrayBuffer.slice(0));
      localStorage.setItem('fileName', file.name);
      localStorage.setItem('currentPage', '1');

      const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      
      setTimeout(() => goToPage(doc, 1), 100);
    } catch (error) {
      console.error(error);
      updateStatus('Ocurrió un error al procesar el PDF. Asegúrate de que no esté dañado o protegido con contraseña.');
    }
  };

  const readElement = (elements: PageElement[], index: number) => {
    if (index < 0 || index >= elements.length) return;
    
    const el = elements[index];
    let prefix = '';
    const typeLower = el.type.toLowerCase();
    
    // Ignorar prefijo para párrafos normales para que la lectura sea natural
    if (!['párrafo', 'parrafo', 'texto', 'paragraph'].includes(typeLower)) {
      // Capitalizar la primera letra del tipo
      const capitalizedType = el.type.charAt(0).toUpperCase() + el.type.slice(1);
      prefix = `${capitalizedType}: `;
    }
    
    const textToSpeak = `${prefix}${el.content}`;
    setReadingText(textToSpeak);
    speak(textToSpeak);
  };

  const handleRead = async () => {
    const data = pageCache[currentPage];
    if (!data || !data.canvasDataUrl) return;

    if (data.elements) {
      setCurrentElementIndex(0);
      readElement(data.elements, 0);
    } else {
      updateStatus("Analizando estructura de la página con inteligencia artificial, por favor espera unos segundos.");
      setPageCache(prev => ({ ...prev, [currentPage]: { ...prev[currentPage], isProcessing: true } }));
      
      try {
        const elements = await analyzePageStructure(data.canvasDataUrl, pdfDoc!, currentPage);
        setPageCache(prev => ({ 
          ...prev, 
          [currentPage]: { ...prev[currentPage], elements, isProcessing: false } 
        }));
        
        setCurrentElementIndex(0);
        readElement(elements, 0);
      } catch (e) {
        console.error(e);
        updateStatus("Error al analizar la página con inteligencia artificial. Revisa tu clave API o conexión.");
        setPageCache(prev => ({ ...prev, [currentPage]: { ...prev[currentPage], isProcessing: false } }));
      }
    }
  };

  const handlePauseResume = () => {
    if (isPaused) resumeSpeech();
    else if (isSpeaking) pauseSpeech();
  };

  const handlePrevPage = () => { if (pdfDoc) goToPage(pdfDoc, currentPage - 1); };
  const handleNextPage = () => { if (pdfDoc) goToPage(pdfDoc, currentPage + 1); };

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInputValue(e.target.value);
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const val = parseInt(pageInputValue, 10);
      if (!isNaN(val) && pdfDoc && val >= 1 && val <= totalPages) {
        goToPage(pdfDoc, val);
      } else {
        setPageInputValue(currentPage.toString());
        speak(`Página no válida. El documento tiene ${totalPages} páginas.`);
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) return;

      const key = e.key;
      
      if (key.toLowerCase() === 'f') {
        if (pdfDoc) {
          handleRead();
        }
      } 
      else if (key.toLowerCase() === 'r') {
        fileInputRef.current?.click();
      }
      else if (key === ' ') {
        e.preventDefault(); 
        handlePauseResume();
      } 
      else if (key.toLowerCase() === 'g') {
        stopSpeech();
      } 
      else if (key.toLowerCase() === 'j') {
        stopSpeech();
        deletePdfFile('currentPdf').catch(console.error);
        localStorage.removeItem('currentPage');
        localStorage.removeItem('fileName');
        onBack();
      } 
      else if (key === 'ArrowDown') {
        e.preventDefault();
        const data = pageCache[currentPage];
        if (data?.elements) {
          if (currentElementIndex < data.elements.length - 1) {
            const nextIdx = currentElementIndex + 1;
            setCurrentElementIndex(nextIdx);
            readElement(data.elements, nextIdx);
          } else {
            speak("Fin de la página.");
          }
        }
      }
      else if (key === 'ArrowUp') {
        e.preventDefault();
        const data = pageCache[currentPage];
        if (data?.elements) {
          if (currentElementIndex > 0) {
            const prevIdx = currentElementIndex - 1;
            setCurrentElementIndex(prevIdx);
            readElement(data.elements, prevIdx);
          } else {
            speak("Inicio de la página.");
          }
        }
      }
      else if (key.toLowerCase() === 'v') {
        e.preventDefault();
        const data = pageCache[currentPage];
        if (data?.elements && currentElementIndex >= 0 && currentElementIndex < data.elements.length) {
          readElement(data.elements, currentElementIndex);
        }
      }
      else if (key === 'ArrowRight') {
        e.preventDefault();
        handleNextPage();
      } 
      else if (key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevPage();
      } 
      else if (key === 'Home') {
        e.preventDefault();
        if (pdfDoc) goToPage(pdfDoc, 1);
      } 
      else if (key === 'End') {
        e.preventDefault();
        if (pdfDoc) goToPage(pdfDoc, totalPages);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const currentData = pageCache[currentPage];
  const isProcessing = currentData?.isProcessing || false;
  const currentElement = currentData?.elements?.[currentElementIndex];

  return (
    <main style={{ maxWidth: '1000px', padding: '1rem', margin: '0 auto' }}>
      <h1 ref={headerRef} tabIndex={-1} style={{ outline: 'none', margin: '0 0 1rem 0' }}>
        Lector de PDF
      </h1>
      
      <div aria-live="polite" className="visually-hidden">
        {status}
      </div>

      <div className="status-box" aria-hidden="true" style={{ marginBottom: '1rem', padding: '0.5rem' }}>
        <p style={{ margin: 0 }}><strong>Estado:</strong> {status}</p>
        {fileName && <p style={{ margin: 0 }}><strong>Archivo:</strong> {fileName}</p>}
        {totalPages > 0 && <p style={{ margin: 0 }}><strong>Página {currentPage} de {totalPages}</strong></p>}
      </div>

      <div className="controls" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input
          type="file"
          accept="application/pdf"
          ref={fileInputRef}
          onChange={handleFileChange}
          aria-label="Seleccionar archivo PDF"
          id="file-upload"
          style={{ display: 'none' }}
        />
        <button 
          onClick={() => { if (isProcessing) return; fileInputRef.current?.click(); }} 
          aria-disabled={isProcessing ? 'true' : 'false'}
          style={{ opacity: isProcessing ? 0.5 : 1, cursor: isProcessing ? 'not-allowed' : 'pointer' }}
        >
          Seleccionar PDF (R)
        </button>

        {totalPages > 0 && (
          <>
            <button 
              onClick={() => { if (currentPage <= 1) return; handlePrevPage(); }} 
              aria-disabled={currentPage <= 1 ? 'true' : 'false'}
              style={{ opacity: currentPage <= 1 ? 0.5 : 1, cursor: currentPage <= 1 ? 'not-allowed' : 'pointer' }}
            >
              Página anterior (Flecha Izq)
            </button>
            <button 
              onClick={() => { if (currentPage >= totalPages) return; handleNextPage(); }} 
              aria-disabled={currentPage >= totalPages ? 'true' : 'false'}
              style={{ opacity: currentPage >= totalPages ? 0.5 : 1, cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer' }}
            >
              Página siguiente (Flecha Der)
            </button>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
              Ir a página:
              <input 
                type="number" 
                min={1} 
                max={totalPages} 
                value={pageInputValue} 
                onChange={handlePageInputChange}
                onKeyDown={handlePageInputKeyDown}
                style={{ fontSize: '1.25rem', padding: '0.5rem', width: '80px' }}
                aria-label="Ir a la página. Escribe el número y presiona Enter o Espacio."
              />
            </label>
            
            <button 
              onClick={() => { if (!currentData || isProcessing) return; handleRead(); }} 
              aria-disabled={(!currentData || isProcessing) ? 'true' : 'false'}
              style={{ opacity: (!currentData || isProcessing) ? 0.5 : 1, cursor: (!currentData || isProcessing) ? 'not-allowed' : 'pointer' }}
            >
              Leer página actual (F)
            </button>
            <button 
              onClick={() => { if (!isSpeaking && !isPaused) return; handlePauseResume(); }} 
              aria-disabled={(!isSpeaking && !isPaused) ? 'true' : 'false'}
              style={{ opacity: (!isSpeaking && !isPaused) ? 0.5 : 1, cursor: (!isSpeaking && !isPaused) ? 'not-allowed' : 'pointer' }}
            >
              {isPaused ? 'Continuar (Espacio)' : 'Pausar (Espacio)'}
            </button>
            <button onClick={stopSpeech}>
              Detener (G)
            </button>
            <button 
              onClick={() => {
                const data = pageCache[currentPage];
                if (data?.elements && currentElementIndex >= 0 && currentElementIndex < data.elements.length) {
                  readElement(data.elements, currentElementIndex);
                }
              }}
            >
              Repetir línea (V)
            </button>
          </>
        )}
        
        <button onClick={() => { 
          stopSpeech(); 
          deletePdfFile('currentPdf').catch(console.error);
          localStorage.removeItem('currentPage');
          localStorage.removeItem('fileName');
          onBack(); 
        }}>
          Volver al inicio (J)
        </button>
      </div>

      {readingText && (isSpeaking || isPaused) && currentElement && (
        <div 
          className="reading-box" 
          aria-hidden="true"
          style={{ 
            backgroundColor: 'var(--bg-color)', 
            padding: '1rem', 
            borderRadius: '4px', 
            marginBottom: '1rem',
            border: '2px solid var(--focus-color)',
            fontSize: currentElement.type.toLowerCase().includes('título') || currentElement.type.toLowerCase().includes('titulo') ? '2rem' : '1.5rem',
            fontWeight: currentElement.type.toLowerCase().includes('título') || currentElement.type.toLowerCase().includes('titulo') ? 'bold' : 'normal',
            lineHeight: '1.8'
          }}
        >
          {currentElement.type.toLowerCase().includes('imagen') && <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🖼️ Imagen: </span>}
          {currentElement.type.toLowerCase().includes('tabla') && <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>📊 Tabla: </span>}
          
          {highlight ? (
            <>
              {readingText.substring(0, highlight.start)}
              <mark className="highlight-word" style={{ backgroundColor: 'yellow', color: 'black', borderRadius: '2px' }}>
                {readingText.substring(highlight.start, highlight.start + highlight.length)}
              </mark>
              {readingText.substring(highlight.start + highlight.length)}
            </>
          ) : (
            <>{readingText}</>
          )}
        </div>
      )}

      {/* Visual PDF Viewer Container */}
      <div 
        style={{ 
          border: '1px solid var(--text-color)', 
          backgroundColor: '#eaeaea',
          display: pdfDoc ? 'flex' : 'none', 
          justifyContent: 'center',
          overflow: 'auto',
          padding: '1rem',
          maxHeight: '70vh'
        }}
        aria-hidden="true" 
      >
        <canvas ref={visualCanvasRef} style={{ maxWidth: '100%', height: 'auto', boxShadow: '0 4px 8px rgba(0,0,0,0.2)' }} />
      </div>
    </main>
  );
}
