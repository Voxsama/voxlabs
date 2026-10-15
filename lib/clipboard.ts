// Browser-only: pick the best text from a paste.
import { looksBroken } from "./text";

function htmlToText(html: string): string {
  const withBreaks = html.replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, "$&\n");
  const text = new DOMParser().parseFromString(withBreaks, "text/html").body.textContent ?? "";
  return text.replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Plain text, unless it came through as "???" — then try the HTML copy of the clipboard,
 * which apps usually keep in UTF-8. `broken` = no usable copy exists.
 */
export function readPaste(dt: DataTransfer): { text: string; broken: boolean; fromHtml: boolean } {
  const plain = dt.getData("text/plain");
  if (!looksBroken(plain)) return { text: plain, broken: false, fromHtml: false };
  const html = dt.getData("text/html");
  const alt = html ? htmlToText(html) : "";
  if (alt && !looksBroken(alt)) return { text: alt, broken: false, fromHtml: true };
  return { text: plain, broken: true, fromHtml: false };
}

export const BROKEN_PASTE_MESSAGE =
  "The app you copied from sent this text as question marks (???), so nothing was pasted. " +
  "Copy it again from another app (for example open the file in Google Docs, Word or a browser), or paste it into Notepad/Text Editor first and copy from there.";
