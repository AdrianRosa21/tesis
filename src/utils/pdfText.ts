import type { PDFPageProxy } from 'pdfjs-dist';

/** Texto nativo de la pagina (si el PDF lo trae). Se manda a la IA solo como ayuda. */
export async function extractNativeText(page: PDFPageProxy): Promise<string | null> {
  try {
    const textContent = await page.getTextContent();
    return textContent.items
      .map(item => {
        if (!('str' in item)) return '';
        return `${item.str}${item.hasEOL ? '\n' : ' '}`;
      })
      .join('')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim() || null;
  } catch (error) {
    console.warn('No fue posible extraer la capa de texto del PDF.', error);
    return null;
  }
}
