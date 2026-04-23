import "server-only";

export type RasterPage = { pageNum: number; png: Buffer };

export async function rasterPdf(
  buf: Buffer | Uint8Array,
  opts: { targetWidthPx?: number } = {},
): Promise<RasterPage[]> {
  // Dynamic imports: pdfjs touches worker globals at module load; deferring
  // keeps route registration clean and lets this module import safely
  // anywhere else.
  const { createCanvas } = await import("canvas");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const targetWidth = opts.targetWidthPx ?? 1568;

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
