type ClipboardNavigator = {
  clipboard?: {
    writeText?: (text: string) => Promise<void>;
  };
};

type CopyTextarea = {
  value: string;
  setAttribute: (name: string, value: string) => void;
  style: {
    position: string;
    opacity: string;
  };
  focus: () => void;
  select: () => void;
};

type CopyDocument = {
  body: {
    appendChild: (node: CopyTextarea) => void;
    removeChild: (node: CopyTextarea) => void;
  };
  createElement: (tagName: string) => CopyTextarea;
  execCommand?: (command: string) => boolean;
};

type CopyTextOptions = {
  navigatorObject?: ClipboardNavigator;
  documentObject?: CopyDocument;
};

export async function copyText(text: string, options: CopyTextOptions = {}): Promise<boolean> {
  const navigatorObject =
    options.navigatorObject ?? (typeof navigator !== "undefined" ? (navigator as ClipboardNavigator) : undefined);
  const documentObject =
    options.documentObject ?? (typeof document !== "undefined" ? (document as unknown as CopyDocument) : undefined);

  if (navigatorObject?.clipboard?.writeText) {
    try {
      await navigatorObject.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to the hidden textarea path when Clipboard API access fails.
    }
  }

  if (!documentObject?.body || !documentObject.createElement || !documentObject.execCommand) {
    return false;
  }

  try {
    const textarea = documentObject.createElement("textarea");
    let appended = false;
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    documentObject.body.appendChild(textarea);
    appended = true;

    try {
      textarea.focus();
      textarea.select();
      return documentObject.execCommand("copy");
    } finally {
      if (appended) {
        documentObject.body.removeChild(textarea);
      }
    }
  } catch {
    return false;
  }
}
