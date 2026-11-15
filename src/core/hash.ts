/** SHA-256 of `bytes` as lowercase hex: the "content hash" of a Library PNG (undo history is tied to it) and the key of its history file. */
export async function contentHash(bytes: Uint8Array): Promise<string> {
  // `slice` hands subtle a plain ArrayBuffer view (also across jsdom/Node realms).
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
