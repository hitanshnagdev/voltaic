import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

export type ParsedPage = { pageNum: number; text: string };
export type ParsedPdf = { pageCount: number; pages: ParsedPage[] };

export async function parsePdf(buf: Buffer | Uint8Array): Promise<ParsedPdf> {
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { totalPages, text } = await extractText(doc, { mergePages: false });
  const pagesText = Array.isArray(text) ? text : [text];
  const pages: ParsedPage[] = pagesText.map((t, i) => ({
    pageNum: i + 1,
    text: (t ?? "").trim(),
  }));
  return { pageCount: totalPages, pages };
}
