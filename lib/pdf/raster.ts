import "server-only";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export type RasterPage = { pageNum: number; png: Buffer };

/**
 * pdfjs needs to look up two kinds of binary assets at render time:
 *   1. Standard font data (Foxit-derived .pfb files for Helvetica, Courier,
 *      Times, Symbol, ZapfDingbats) — used as fallback when a PDF
 *      references a font but doesn't embed glyphs for it.
 *   2. cmap files (.bcmap) — used to decode CJK character encodings.
 *
 * In a browser these are fetched from a CDN. In Node serverless they have
 * to be local file:// URLs. pdfjs-dist ships both directories at the
 * package root; resolve them via createRequire so the path works whether
 * the package lives in node_modules/pdfjs-dist or wherever Vercel's
 * bundler relocates it inside the function bundle.
 *
 * Without these URLs, pdfjs can't find any font and renders every glyph
 * as a solid black rectangle. Sonnet vision sees black boxes, returns
 * null for every numeric field, the AIC rule never fires.
 */
const requireFromHere = createRequire(import.meta.url);
const pdfjsRoot = dirname(
  requireFromHere.resolve("pdfjs-dist/package.json"),
);
const STANDARD_FONT_DATA_URL = pathToFileURL(
  join(pdfjsRoot, "standard_fonts/"),
).toString();
const CMAP_URL = pathToFileURL(join(pdfjsRoot, "cmaps/")).toString();

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

  // pdfjs-dist v5 uses Path2D when rendering vector paths (almost every
  // real PDF). Path2D is a browser global; Node doesn't provide it, and
  // node-canvas v3 exports DOMMatrix/DOMPoint but not Path2D. pdfjs's
  // own polyfill block in pdf.mjs reads `globalThis.Path2D` first, falls
  // back to `canvas.Path2D` if missing, and warns + crashes when both
  // are absent — the production failure we hit on Vercel.
  //
  // The fix: install `path2d` (a pure-JS server-side Path2D) and stash
  // it on globalThis *before* importing pdfjs so its module-init can
  // pick it up. Idempotent across cold/warm starts.
  if (typeof (globalThis as { Path2D?: unknown }).Path2D === "undefined") {
    const path2d = await import("path2d");
    (globalThis as { Path2D?: unknown }).Path2D = path2d.Path2D;
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const targetWidth = opts.targetWidthPx ?? DEFAULT_RASTER_WIDTH_PX;

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buf),
    // @ts-expect-error disableWorker is valid at runtime but not in types
    disableWorker: true,
    // useSystemFonts: false — Vercel's serverless runtime has no installed
    // OS fonts and no fontconfig, so anything that depends on system fonts
    // fails silently and pdfjs renders text as solid black rectangles.
    // Provide pdfjs-dist's bundled standard fonts and cmaps instead.
    useSystemFonts: false,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    isEvalSupported: false,
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
