export const PDF_CONTENT_TYPE = "application/pdf";
export const LOCAL_FILE_PDF_UPLOAD_MESSAGE =
  "Local PDF files need to be uploaded from articlepod.com/app after you sign in.";

export function readDocumentContentType() {
  return document.contentType || "";
}

export function isPdfContentType(input) {
  return String(input || "")
    .toLowerCase()
    .includes(PDF_CONTENT_TYPE);
}

export function isFileUrl(input) {
  return /^file:/i.test(String(input || "").trim());
}

export function isHttpUrl(input) {
  return /^https?:/i.test(String(input || "").trim());
}

export function looksLikePdfUrl(input) {
  try {
    const parsed = new URL(String(input || "").trim());
    return parsed.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return String(input || "")
      .trim()
      .toLowerCase()
      .includes(".pdf");
  }
}

export async function detectCaptureTarget(chromeApi, tab) {
  if (!tab?.id || !tab.url) {
    return {
      mode: "missing-tab",
      contentType: "",
    };
  }

  if (isFileUrl(tab.url)) {
    return {
      mode: "local-file",
      contentType: "",
    };
  }

  if (!isHttpUrl(tab.url)) {
    return {
      mode: "unsupported",
      contentType: "",
    };
  }

  let contentType = "";
  try {
    const results = await chromeApi.scripting.executeScript({
      target: { tabId: tab.id },
      func: readDocumentContentType,
    });
    contentType = String(results?.[0]?.result || "")
      .trim()
      .toLowerCase();
  } catch {
    contentType = "";
  }

  return {
    mode:
      isPdfContentType(contentType) || looksLikePdfUrl(tab.url)
        ? "remote-pdf"
        : "html-page",
    contentType,
  };
}

function decodeFileName(value) {
  if (typeof value !== "string") {
    return "";
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function sanitizeFileName(input) {
  const collapsed = decodeFileName(input)
    .replace(/[?#].*$/, "")
    .replace(/[/\\]+/g, "-")
    .trim();
  return collapsed || "browser-capture.pdf";
}

export function inferPdfFileName(tabUrl, contentDisposition = "") {
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    const decoded = sanitizeFileName(utf8Match[1]);
    return decoded.toLowerCase().endsWith(".pdf") ? decoded : `${decoded}.pdf`;
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) {
    const decoded = sanitizeFileName(quotedMatch[1]);
    return decoded.toLowerCase().endsWith(".pdf") ? decoded : `${decoded}.pdf`;
  }

  try {
    const parsed = new URL(tabUrl);
    const tail = parsed.pathname.split("/").pop() || "";
    const decoded = sanitizeFileName(tail);
    return decoded.toLowerCase().endsWith(".pdf") ? decoded : `${decoded}.pdf`;
  } catch {
    return "browser-capture.pdf";
  }
}

export async function uploadRemotePdfCapture(input) {
  const {
    fetchImpl = globalThis.fetch,
    tabUrl,
    serverUrl,
    extensionToken,
    importance = "LOW",
    tags = "",
  } = input;

  const sourceResponse = await fetchImpl(tabUrl, {
    credentials: "include",
  });
  if (!sourceResponse.ok) {
    throw new Error(
      `Could not read this PDF from the current tab (${sourceResponse.status}).`,
    );
  }

  const bytes = await sourceResponse.arrayBuffer();
  const contentDisposition =
    sourceResponse.headers.get("content-disposition") || "";
  const file = new File([bytes], inferPdfFileName(tabUrl, contentDisposition), {
    type: PDF_CONTENT_TYPE,
  });
  const formData = new FormData();
  formData.set("file", file);
  formData.set("importance", importance);
  if (tags) {
    formData.set("tags", tags);
  }

  return await fetchImpl(`${serverUrl}/api/items/pdf`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${extensionToken}`,
    },
    body: formData,
  });
}
