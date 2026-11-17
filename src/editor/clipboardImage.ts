// Reading a picture off a paste event (ticket 38). The clipboard hands the webview a File per picture
// (Snipping Tool, "Copy image" in a browser, another screenshot); we take the first one.
import { isPng } from "../core/png";

/** The first picture on the clipboard, or null when there is none (text only, files that are not pictures). */
export function imageOnClipboard(data: Pick<DataTransfer, "items" | "files"> | null | undefined): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  for (const file of Array.from(data.files ?? [])) if (file.type.startsWith("image/")) return file;
  return null;
}

function bytesOf(file: Blob): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer().then((b) => new Uint8Array(b));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * The picture as PNG bytes. A PNG is taken exactly as it is (never re-encoded); another format the
 * browser can decode (JPEG, BMP, WebP from a "Copy image") is re-encoded losslessly to PNG at its own size.
 */
export async function pictureAsPng(file: Blob): Promise<Uint8Array> {
  const bytes = await bytesOf(file);
  if (isPng(bytes)) return bytes;
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("The picture could not be converted");
    return bytesOf(png);
  } finally {
    bitmap.close();
  }
}
