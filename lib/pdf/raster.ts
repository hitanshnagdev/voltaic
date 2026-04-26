import "server-only";

export type RasterPage = { pageNum: number; png: Buffer };

/**
 * Bump this when raster behavior changes in a way that affects what
 * downstream LLM steps see (font config, target width, page selection,
 * any pdfjs option). Vision-extraction caches that include this token
 * in their key auto-invalidate on the bump, preventing cached black-
 * box results from a prior renderer ever being served as the answer
 * for a later, correct renderer.
 *
 * History:
 *   v1 — initial 1568px raster (PR #20)
 *   v2 — added bundled fonts + cmaps URLs (PRs #24-#26). Did not
 *        actually fix rendering on Vercel because pdfjs-dist's
 *        node_utils_fetchData calls fs.readFile(url) with a string
 *        like "file:///..." which Node interprets as a literal path
 *        and fails with ENOENT. The "redacted/obscured" extraction
 *        notes from production confirmed this — vision was reading
 *        glyph-as-box renders.
 *   v3 — custom BinaryDataFactory that converts file:// URLs to
 *        real filesystem paths via fileURLToPath before calling fs.
 *        This is the first version that actually loads pdfjs's
 *        bundled standard fonts on a Vercel/Linux runtime where
 *        fontconfig has no fallback.
 */
export const RASTER_RENDERER_VERSION = "v3";

/**
 * Resolve pdfjs-dist's bundled font + cmap directories as file:// URLs.
 *
 * pdfjs's renderer needs standard fonts to substitute for any glyphs
 * the PDF doesn't embed. Without them on a Node runtime that has no
 * fontconfig (Vercel/Linux serverless), every glyph renders as a
 * solid black rectangle. Vision sees boxes, returns null fields, the
 * rule never fires.
 *
 * Path resolution: process.cwd() is a runtime call the Turbopack
 * bundler doesn't shim, and `serverExternalPackages` ensures the
 * pdfjs-dist package ships intact at /var/task/node_modules/pdfjs-dist
 * on Vercel. We avoid createRequire(import.meta.url).resolve() because
 * Turbopack rewrites that into a numeric module ID at runtime.
 */
async function resolveBundledAssetUrls(): Promise<{
  standardFontDataUrl: string;
  cMapUrl: string;
}> {
  const { join } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const root = join(process.cwd(), "node_modules", "pdfjs-dist");
  return {
    standardFontDataUrl: pathToFileURL(
      join(root, "standard_fonts/"),
    ).toString(),
    cMapUrl: pathToFileURL(join(root, "cmaps/")).toString(),
  };
}

/**
 * Custom BinaryDataFactory that fixes pdfjs-dist v5's broken Node font
 * loader.
 *
 * The bug: pdfjs-dist's NodeBinaryDataFactory calls
 *   fs.promises.readFile(url)
 * where `url` is a string like "file:///var/task/node_modules/.../Foxit.pfb"
 * built by concatenating standardFontDataUrl + filename. Node's
 * fs.readFile, when given a string, treats it as a literal filesystem
 * path — so it tries to open a file named "file:///..." and fails
 * with ENOENT. pdfjs catches the error, wraps it as "Unable to load
 * font data at: ...", and falls through to glyph-as-box rendering.
 *
 * Verified in a one-liner:
 *   await fs.readFile("file:///valid/path/file.pfb")    // ENOENT
 *   await fs.readFile(new URL("file:///.../file.pfb"))  // works
 *   await fs.readFile("/valid/path/file.pfb")           // works
 *
 * Workaround: pass our own BinaryDataFactory class that mirrors
 * BaseBinaryDataFactory's interface but routes file:// URLs through
 * fileURLToPath() before fs.readFile. Wraps the bug without depending
 * on pdfjs internals beyond the documented constructor + fetch shape.
 *
 * Symptom this resolves: production extraction_notes saying images
 * are "heavily redacted/obscured with black blocks" or rendered in
 * an "unreadable encoded font" — exactly what bare-glyph rendering
 * produces when font data is missing.
 */
class FsBinaryDataFactory {
  cMapUrl: string | null;
  standardFontDataUrl: string | null;
  wasmUrl: string | null;
  constructor(opts: {
    cMapUrl?: string | null;
    standardFontDataUrl?: string | null;
    wasmUrl?: string | null;
  }) {
    this.cMapUrl = opts.cMapUrl ?? null;
    this.standardFontDataUrl = opts.standardFontDataUrl ?? null;
    this.wasmUrl = opts.wasmUrl ?? null;
  }
  async fetch({
    kind,
    filename,
  }: {
    kind: "cMapUrl" | "standardFontDataUrl" | "wasmUrl";
    filename: string;
  }): Promise<Uint8Array> {
    const baseUrl = this[kind];
    if (!baseUrl) {
      throw new Error(`Ensure that the \`${kind}\` API parameter is provided.`);
    }
    const url = `${baseUrl}${filename}`;
    const fs = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const filePath = url.startsWith("file://") ? fileURLToPath(url) : url;
    const data = await fs.readFile(filePath);
    return new Uint8Array(data);
  }
}

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

  const { standardFontDataUrl, cMapUrl } = await resolveBundledAssetUrls();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buf),
    disableWorker: true,
    useSystemFonts: false,
    standardFontDataUrl,
    cMapUrl,
    cMapPacked: true,
    isEvalSupported: false,
    // pdfjs accepts a custom BinaryDataFactory. Pass our own that
    // routes file:// URLs through fileURLToPath before fs.readFile —
    // pdfjs's bundled NodeBinaryDataFactory passes URL *strings* to
    // fs.readFile which Node treats as literal paths and fails.
    BinaryDataFactory: FsBinaryDataFactory,
  } as Parameters<typeof pdfjs.getDocument>[0]);
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
