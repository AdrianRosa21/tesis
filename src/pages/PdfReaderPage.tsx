import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import Tesseract from 'tesseract.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { savePdfFile, getPdfFile, deletePdfFile } from '../utils/db';

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
  extractedText: string;
  ocrText: string;
  imageDescriptions: string;
  isProcessingOCR: boolean;
  isProcessingDescription: boolean;
  canvasDataUrl: string | null;
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
  
  const [status, setStatus] = useState<string>('Página de lectura de PDF abierta. Presiona la letra F para seleccionar un archivo, o usa el botón Seleccionar PDF.');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [descriptionModal, setDescriptionModal] = useState<string | null>(null);
  const [readingText, setReadingText] = useState<string>('');
  const [pageInputValue, setPageInputValue] = useState<string>('1');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLHeadingElement>(null);
  const visualCanvasRef = useRef<HTMLCanvasElement>(null);
  const hasInitialized = useRef<boolean>(false);
  const renderIdRef = useRef<number>(0);
  
  // Ref para cancelar renderizados anteriores de PDF.js si ocurren superposiciones
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

  // Load a specific page text data, caching the result
  const loadPageData = useCallback(async (doc: pdfjsLib.PDFDocumentProxy, pageNum: number, canvasDataUrl: string | null) => {
    if (pageCache[pageNum]) return pageCache[pageNum];

    setIsProcessing(true);
    let extractedText = '';
    
    try {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      extractedText = textContent.items.map((item: any) => item.str).join(' ').trim();
    } catch (error) {
      console.error(error);
      extractedText = "Error al extraer el texto de esta página.";
    }

    const newPageData: PageData = {
      pageNum,
      extractedText,
      ocrText: '',
      imageDescriptions: '',
      isProcessingOCR: false,
      isProcessingDescription: false,
      canvasDataUrl
    };

    setPageCache(prev => ({ ...prev, [pageNum]: newPageData }));
    setIsProcessing(false);

    // If text is suspiciously short, run OCR automatically
    if (extractedText.length < 50 && canvasDataUrl) {
      runOCR(pageNum, canvasDataUrl, extractedText);
    }

    return newPageData;
  }, [pageCache]);

  const runOCR = async (pageNum: number, dataUrl: string, existingText: string) => {
    setPageCache(prev => ({ ...prev, [pageNum]: { ...prev[pageNum], isProcessingOCR: true } }));
    updateStatus(`La página ${pageNum} parece estar escaneada. Iniciando reconocimiento de texto.`);
    
    try {
      const result = await Tesseract.recognize(dataUrl, 'spa+eng');
      let ocrResult = result.data.text.trim();
      
      if (ocrResult && existingText.length > 0 && ocrResult.includes(existingText)) {
        ocrResult = ocrResult.replace(existingText, '').trim();
      } else if (existingText && existingText.length > 0 && existingText.includes(ocrResult)) {
        ocrResult = '';
      }

      setPageCache(prev => ({
        ...prev,
        [pageNum]: { 
          ...prev[pageNum], 
          isProcessingOCR: false, 
          ocrText: ocrResult || "No se encontró texto adicional."
        }
      }));
      updateStatus(`Reconocimiento de texto de la página ${pageNum} completado.`);
    } catch (error) {
      console.error(error);
      setPageCache(prev => ({
        ...prev,
        [pageNum]: { ...prev[pageNum], isProcessingOCR: false, ocrText: "Error durante el reconocimiento OCR." }
      }));
    }
  };

  const describeImages = async () => {
    const currentPageData = pageCache[currentPage];
    if (!currentPageData || !currentPageData.canvasDataUrl) return;

    if (currentPageData.imageDescriptions && !currentPageData.imageDescriptions.includes("Error")) {
      setDescriptionModal(currentPageData.imageDescriptions);
      speak(`Descripción visual: ${currentPageData.imageDescriptions}`);
      return;
    }

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      const msg = 'La descripción visual mediante inteligencia artificial no está configurada.';
      setDescriptionModal(msg);
      speak(msg);
      return;
    }

    setPageCache(prev => ({ ...prev, [currentPage]: { ...prev[currentPage], isProcessingDescription: true } }));
    updateStatus('Solicitando descripción visual, por favor espera.');

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
      const base64Data = currentPageData.canvasDataUrl.split(',')[1];
      
      const result = await model.generateContent([
        "Describe brevemente esta imagen de forma útil para una persona ciega. Identifica si es una fotografía, gráfico, diagrama, tabla o texto. Sé objetivo y directo. No inventes detalles.",
        { inlineData: { data: base64Data, mimeType: "image/png" } }
      ]);
      
      const description = result.response.text();
      setPageCache(prev => ({
        ...prev,
        [currentPage]: { ...prev[currentPage], isProcessingDescription: false, imageDescriptions: description }
      }));
      setDescriptionModal(description);
      speak(`Descripción visual lista: ${description}`);
    } catch (error) {
      console.error(error);
      const err = "Error al generar la descripción visual.";
      setPageCache(prev => ({
        ...prev,
        [currentPage]: { ...prev[currentPage], isProcessingDescription: false, imageDescriptions: err }
      }));
      setDescriptionModal(err);
      speak(err);
    }
  };

  // Render Visual PDF and prepare data cache
  const goToPage = async (doc: pdfjsLib.PDFDocumentProxy, pageNum: number) => {
    if (pageNum < 1 || pageNum > doc.numPages) return;
    
    const currentRenderId = ++renderIdRef.current;

    stopSpeech();
    setReadingText('');
    setCurrentPage(pageNum);
    setPageInputValue(pageNum.toString());
    localStorage.setItem('currentPage', pageNum.toString());
    setDescriptionModal(null);
    const msg = `Página ${pageNum} de ${doc.numPages}`;
    
    if (headerRef.current) {
      headerRef.current.focus();
    }
    updateStatus(msg);

    try {
      const page = await doc.getPage(pageNum);
      
      // Si otra llamada a goToPage ocurrió mientras esperábamos el getPage, abortamos esta
      if (currentRenderId !== renderIdRef.current) return;
      
      // Attempt to render the page to visualCanvas
      let dataUrl: string | null = null;
      if (visualCanvasRef.current) {
        const canvas = visualCanvasRef.current;
        const context = canvas.getContext('2d');
        if (context) {
          // Si hay un renderizado en progreso, lo cancelamos para evitar el error de "multiple render()"
          if (renderTaskRef.current) {
            try {
              await renderTaskRef.current.cancel();
            } catch (e) {
              // Ignore cancellation errors
            }
          }
          
          // Adjust scale based on container width or just a standard size
          const viewport = page.getViewport({ scale: 1.5 });
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          const renderContext = { canvasContext: context, viewport };
          const renderTask = page.render(renderContext as any);
          renderTaskRef.current = renderTask;
          
          await renderTask.promise;
          renderTaskRef.current = null;
          
          dataUrl = canvas.toDataURL('image/png');
        }
      }

      await loadPageData(doc, pageNum, dataUrl);
    } catch (error: any) {
      // Si la llamada no es la más reciente (fue cancelada por otra superpuesta), la ignoramos completamente
      if (currentRenderId !== renderIdRef.current) {
        return; 
      }
      
      // Si fue cancelada explícitamente pero por alguna razón es la última llamada (poco probable), la ignoramos
      if (error?.name === 'RenderingCancelledException' || error?.message?.includes('cancelled')) {
        return; 
      }
      
      console.error("Error real al renderizar:", error);
      updateStatus("Error al renderizar la página.");
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      updateStatus('El archivo seleccionado no es un PDF válido.');
      return;
    }

    setFileName(file.name);
    updateStatus(`Archivo seleccionado: ${file.name}. Procesando PDF, por favor espera.`);
    setIsProcessing(true);
    setPdfDoc(null);
    setPageCache({});
    setCurrentPage(1);
    setTotalPages(0);
    setDescriptionModal(null);
    stopSpeech();

    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // Creamos una copia del buffer para guardarlo en IndexedDB,
      // ya que pdfjsLib.getDocument puede "desvincular" (detach) el ArrayBuffer original
      // al pasarlo al Web Worker, causando un DataCloneError.
      await savePdfFile('currentPdf', arrayBuffer.slice(0));
      localStorage.setItem('fileName', file.name);
      localStorage.setItem('currentPage', '1');

      const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      
      // Need to wait slightly for canvas ref to mount if it was hidden
      setTimeout(() => goToPage(doc, 1), 100);
    } catch (error) {
      console.error(error);
      updateStatus('Ocurrió un error al procesar el PDF. Asegúrate de que no esté dañado o protegido con contraseña.');
      setIsProcessing(false);
    }
  };

  const handleRead = () => {
    const data = pageCache[currentPage];
    if (!data) {
      speak('La página no está lista para ser leída.');
      return;
    }
    
    const parts = [`Página ${currentPage}.`];
    
    if (data.extractedText) parts.push(data.extractedText);
    else parts.push("No se encontró texto seleccionable.");

    if (data.ocrText) parts.push(`Texto reconocido visualmente: ${data.ocrText}`);
    
    parts.push(`Fin de la página ${currentPage}.`);
    
    const fullText = parts.join(' ');
    setReadingText(fullText);
    speak(fullText);
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
        // Restaurar el valor correcto si el usuario introduce algo fuera de rango
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
        e.preventDefault(); // Prevent page scroll when pressing space
        handlePauseResume();
      } 
      else if (key.toLowerCase() === 'g') {
        stopSpeech();
      } 
      else if (key.toLowerCase() === 'h') {
        describeImages();
      } 
      else if (key.toLowerCase() === 'j') {
        stopSpeech();
        deletePdfFile('currentPdf').catch(console.error);
        localStorage.removeItem('currentPage');
        localStorage.removeItem('fileName');
        onBack();
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
              onClick={() => { if (!currentData?.canvasDataUrl || currentData.isProcessingDescription) return; describeImages(); }} 
              aria-disabled={(!currentData?.canvasDataUrl || currentData.isProcessingDescription) ? 'true' : 'false'}
              style={{ opacity: (!currentData?.canvasDataUrl || currentData.isProcessingDescription) ? 0.5 : 1, cursor: (!currentData?.canvasDataUrl || currentData.isProcessingDescription) ? 'not-allowed' : 'pointer' }}
            >
              Describir imágenes de esta página (H)
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

      {descriptionModal && (
        <div 
          role="region" 
          aria-label="Descripción de imágenes" 
          style={{ 
            backgroundColor: 'var(--btn-bg)', 
            padding: '1rem', 
            borderRadius: '4px', 
            marginBottom: '1rem',
            border: '2px solid var(--text-color)' 
          }}
        >
          <h2 style={{ fontSize: '1.2rem', marginTop: 0 }}>Descripción visual de la página:</h2>
          <p>{descriptionModal}</p>
        </div>
      )}

      {readingText && (isSpeaking || isPaused) && (
        <div 
          className="reading-box" 
          aria-hidden="true"
          style={{ 
            backgroundColor: 'var(--bg-color)', 
            padding: '1rem', 
            borderRadius: '4px', 
            marginBottom: '1rem',
            border: '2px solid var(--focus-color)',
            fontSize: '1.5rem',
            lineHeight: '1.8'
          }}
        >
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
        aria-hidden="true" // Hide from screen readers since it's an image. Screen readers use the buttons.
      >
        <canvas ref={visualCanvasRef} style={{ maxWidth: '100%', height: 'auto', boxShadow: '0 4px 8px rgba(0,0,0,0.2)' }} />
      </div>
    </main>
  );
}
