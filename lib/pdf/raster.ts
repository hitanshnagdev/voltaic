import "server-only";

export type RasterPage = { pageNum: number; png: Buffer };

/**
 * Default raster widths per document type, in pixels.
 *
 * The default of 1568px works well for letter-size pages (≈ 185 DPI on an
 * 8.5×11 page) — the size most spec and submittal PDFs use. Drawing PDFs
 * are architectural format (typically 30×42 inch ARCH E or 36×48 ARCH F),
 * where 1568px collapses to ≈ 37 DPI — too coarse to read panel-schedule
 * cells or symbol callouts. We bump drawings to a higher density so the
 * downstream drawing parser (when it ships) has legible inputs.
 *
 * 2400px is a deliberate compromise: enough to roughly double the symbol
 * legibility on architectural sheets without quadrupling token costs.
 * The drawing-parser PR can raise this further once we have eval data
 * about extraction accuracy vs. cost.
 *
 * Specs and submittals stay at the default — a behavior-preserving
 * change for everything we ingest today.
 */
export const RASTER_WIDTH_BY_DOC_TYPE: Record<string, number> = {
  drawing: 2400,
  spec: 1568,
  submittal: 1568,
  other: 1568,
};

export const DEFAULT_RASTER_WIDTH_PX = 1568;

/**
 * Return the configured raster width for a document type, or the default
 * if the type is null/unknown. Pure function; safe to import from tests.
 */
export function targetWidthForDocType(
  docType: string | null | undefined,
): number {
  if (docType == null) return DEFAULT_RASTER_WIDTH_PX;
  return RASTER_WIDTH_BY_DOC_TYPE[docType] ?? DEFAULT_RASTER_WIDTH_PX;
}

export async function rasterPdf(
  buf: Buffer | Uint8Array,
  opts: { targetWidthPx?: number } = {},
): Promise<RasterPage[]> {
  // Dynamic imports: pdfjs touches worker globals at module load; deferring
  // keeps route registration clean and lets this module import safely
  // anywhere else.
  const { createCanvas } = await import("canvas");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const targetWidth = opts.targetWidthPx ?? DEFAULT_RASTER_WIDTH_PX;

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buf),
    // @ts-expect-error disableWorker is valid at runtime but not in types
    disableWorker: true,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;
  const out: RasterPage[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = targetWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    const ctx = canvas.getContext("2d");
    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise;
    const png = canvas.toBuffer("image/png");
    out.push({ pageNum: i, png });
    page.cleanup();
  }
  await doc.cleanup();
  return out;
}
