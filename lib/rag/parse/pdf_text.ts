/**
 * Thin wrapper over `unpdf` that returns per-page text for a PDF.
 *
 * We always ask for `mergePages: false` — the parser downstream uses page
 * breaks to compute `pageNum` for each paragraph, which is what the
 * evidence pins point at.
 *
 * Not all PDFs yield useful text this way — scanned drawings and
 * image-only submittals return empty strings. The caller decides whether
 * to fall back to OCR (lib/rag/parse/ocr.ts, future PR).
 */
import { extractText } from "unpdf";

export type PdfTextResult = {
  /** One entry per page. Empty string if the page yielded no text. */
  pages: string[];
  totalPages: number;
  /**
   * How much of the document came back empty. Useful signal for routing to
   * OCR ("> 0.5 and we know this PDF needs Textract").
   */
  emptyPageRatio: number;
};

export async function extractPdfText(
  input: Uint8Array | ArrayBuffer,
): Promise<PdfTextResult> {
  // Node's Buffer is a subclass of Uint8Array, so this covers both.
  const bytes =
    input instanceof Uint8Array ? input : new Uint8Array(input);

  const { text, totalPages } = await extractText(bytes, {
    mergePages: false,
  });

  // unpdf returns `text` as `string[]` when mergePages=false.
  const pages = Array.isArray(text) ? text : [text];
  const emptyPages = pages.filter((p) => !p.trim()).length;
  const emptyPageRatio = pages.length ? emptyPages / pages.length : 0;

  return { pages, totalPages, emptyPageRatio };
}
