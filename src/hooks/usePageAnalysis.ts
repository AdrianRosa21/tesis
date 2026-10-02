import { useCallback, useState } from 'react';
import { analyzePageStructure, type AnalysisResult } from '../utils/ai';

/** Guarda el analisis de cada pagina del documento abierto y avisa si hay uno en curso. */
export function usePageAnalysis() {
  const [analyses, setAnalyses] = useState<Record<number, AnalysisResult>>({});
  const [processingPage, setProcessingPage] = useState<number | null>(null);

  const analyze = useCallback(async (
    pageNum: number,
    imageDataUrl: string,
    nativeText: string | null,
  ): Promise<AnalysisResult> => {
    setProcessingPage(pageNum);
    try {
      const result = await analyzePageStructure(imageDataUrl, nativeText);
      setAnalyses(prev => ({ ...prev, [pageNum]: result }));
      return result;
    } finally {
      setProcessingPage(null);
    }
  }, []);

  const reset = useCallback(() => {
    setAnalyses({});
    setProcessingPage(null);
  }, []);

  return { analyses, isProcessing: processingPage !== null, analyze, reset };
}
