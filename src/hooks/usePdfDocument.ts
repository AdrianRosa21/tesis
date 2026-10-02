import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { deletePdfFile, getPdfFile, savePdfFile } from '../utils/db';
import { extractNativeText } from '../utils/pdfText';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

// Escala de renderizado: a 3.0 el texto pequeño queda nítido para la IA.
const RENDER_SCALE = 3.0;

export interface PageSnapshot {
  pageNum: number;
  /** Imagen de la pagina en JPEG (base64). Solo se guarda la de la pagina actual. */
  canvasDataUrl: string | null;
  nativeText: string | null;
}

interface PdfDocumentCallbacks {
  /** Al empezar a cambiar de pagina: detener la voz, reiniciar la lectura, avisar. */
  onNavigate: (pageNum: number, totalPages: number) => void;
  onMessage: (message: string) => void;
  /** Llego un archivo nuevo o se restauro uno: hay que olvidar los analisis anteriores. */
  onDocumentReplaced: () => void;
}

export function usePdfDocument(callbacks: PdfDocumentCallbacks) {
  const callbacksRef = useRef(callbacks);
  const [fileName, setFileName] = useState('');
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [snapshot, setSnapshot] = useState<PageSnapshot | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderIdRef = useRef(0);
  const renderTaskRef = useRef<{ cancel: () => void; promise: Promise<unknown> } | null>(null);

  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  const goToPage = useCallback(async (doc: pdfjsLib.PDFDocumentProxy, pageNum: number) => {
    if (pageNum < 1 || pageNum > doc.numPages) return;

    const renderId = ++renderIdRef.current;

    setCurrentPage(pageNum);
    setSnapshot(null);
    localStorage.setItem('currentPage', pageNum.toString());
    callbacksRef.current.onNavigate(pageNum, doc.numPages);

    try {
      const page = await doc.getPage(pageNum);
      if (renderId !== renderIdRef.current) return;

      const nativeText = await extractNativeText(page);

      let dataUrl: string | null = null;
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (canvas && context) {
        if (renderTaskRef.current) {
          try { await renderTaskRef.current.cancel(); } catch { /* ignore cancellation errors */ }
        }

        const viewport = page.getViewport({ scale: RENDER_SCALE });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Fondo blanco forzado para evitar problemas de transparencia
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const renderTask = page.render({ canvasContext: context, viewport } as any);
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        renderTaskRef.current = null;

        // JPEG de alta calidad para evitar un base64 gigante con resolución 3x
        dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      }

      if (renderId !== renderIdRef.current) return;
      setSnapshot({ pageNum, canvasDataUrl: dataUrl, nativeText });
    } catch (error: unknown) {
      if (renderId !== renderIdRef.current) return;
      const err = error as Error;
      if (err?.name === 'RenderingCancelledException' || err?.message?.includes('cancelled')) return;
      console.error('Error real al renderizar:', err);
      callbacksRef.current.onMessage('Error al renderizar la página.');
    }
  }, []);

  /** Recupera el PDF guardado en el navegador. Devuelve true si habia uno. */
  const restoreSession = useCallback(async (): Promise<boolean> => {
    try {
      const savedBuffer = await getPdfFile('currentPdf');
      if (!savedBuffer) return false;

      const doc = await pdfjsLib.getDocument({ data: savedBuffer }).promise;
      callbacksRef.current.onDocumentReplaced();
      setPdfDoc(doc);
      setTotalPages(doc.numPages);

      const savedName = localStorage.getItem('fileName');
      const savedPage = localStorage.getItem('currentPage');
      if (savedName) setFileName(savedName);

      const pageToLoad = savedPage ? parseInt(savedPage, 10) : 1;
      setTimeout(() => goToPage(doc, pageToLoad), 100);

      callbacksRef.current.onMessage(
        `Sesión restaurada. Documento ${savedName || ''} cargado en la página ${pageToLoad}.`,
      );
      return true;
    } catch (err) {
      console.error('Error loading saved PDF', err);
      return false;
    }
  }, [goToPage]);

  const openFile = useCallback(async (file: File) => {
    const hasPdfExtension = file.name.toLowerCase().endsWith('.pdf');
    if (file.type !== 'application/pdf' && !hasPdfExtension) {
      callbacksRef.current.onMessage('El archivo seleccionado no es un PDF válido.');
      return;
    }

    callbacksRef.current.onDocumentReplaced();
    setFileName(file.name);
    callbacksRef.current.onMessage(`Archivo seleccionado: ${file.name}. Procesando PDF, por favor espera.`);
    setPdfDoc(null);
    setSnapshot(null);
    setCurrentPage(1);
    setTotalPages(0);

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
      callbacksRef.current.onMessage(
        'Ocurrió un error al procesar el PDF. Asegúrate de que no esté dañado o protegido con contraseña.',
      );
    }
  }, [goToPage]);

  /** Olvida el documento guardado (tecla J: volver al inicio). */
  const forgetDocument = useCallback(() => {
    deletePdfFile('currentPdf').catch(console.error);
    localStorage.removeItem('currentPage');
    localStorage.removeItem('fileName');
  }, []);

  /** Libera la imagen de la pagina actual una vez analizada, para no acumular memoria. */
  const releaseImage = useCallback((pageNum: number) => {
    setSnapshot(prev => (prev && prev.pageNum === pageNum ? { ...prev, canvasDataUrl: null } : prev));
  }, []);

  return {
    canvasRef,
    fileName,
    pdfDoc,
    currentPage,
    totalPages,
    snapshot,
    goToPage,
    restoreSession,
    openFile,
    forgetDocument,
    releaseImage,
  };
}
