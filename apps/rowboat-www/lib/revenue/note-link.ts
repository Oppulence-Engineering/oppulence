const NOTE_HASH_PREFIX = "#note=";

/**
 * A note link has to open the notes tab. Revenue defaults to commitments, and
 * copying only the pathname dropped `?tab=notes`, so the hash arrived on the
 * wrong screen and nothing read it.
 */
export function workspaceNoteHref(
  location: Pick<Location, "origin" | "pathname" | "search">,
  noteId: string,
): string {
  const params = new URLSearchParams(location.search);
  params.set("tab", "notes");
  return `${location.origin}${location.pathname}?${params.toString()}#note=${encodeURIComponent(noteId)}`;
}

/** The note id carried in `#note=`. Empty or malformed hashes do not open a draft. */
export function noteIdFromHash(hash: string): string | null {
  if (!hash.startsWith(NOTE_HASH_PREFIX)) return null;
  const encoded = hash.slice(NOTE_HASH_PREFIX.length);
  if (!encoded) return null;
  try {
    const noteId = decodeURIComponent(encoded);
    return noteId.trim() ? noteId : null;
  } catch {
    return null;
  }
}
