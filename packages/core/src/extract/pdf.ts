import { AppError, errorCodes } from "../errors/codes";

async function loadPdfjs() {
  const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return mod;
}

function normalizeExtracted(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function extractTextFromPdf(data: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;

  const texts: string[] = [];
  for (let page = 1; page <= doc.numPages; page += 1) {
    const pageDoc = await doc.getPage(page);
    const content = await pageDoc.getTextContent();
    for (const item of content.items as Array<{ str?: string }>) {
      if (item.str?.trim()) {
        texts.push(item.str.trim());
      }
    }
  }

  const text = normalizeExtracted(texts.join(" "));
  if (text.length < 120) {
    throw new AppError(
      errorCodes.PDF_OCR_NOT_SUPPORTED,
      "This PDF appears scanned or image-heavy. OCR is not supported yet.",
      400
    );
  }

  return { text, pages: doc.numPages };
}
