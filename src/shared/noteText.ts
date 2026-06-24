/**
 * Note title = the first non-empty line of the note's plain text (macOS Notes behaviour).
 * Trimmed and length-capped so a runaway first line can't bloat the list/DB.
 */
export function deriveTitle(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed) return trimmed.slice(0, 200)
  }
  return ''
}

/** One-line snippet for the notes list: the text after the title line, collapsed. */
export function deriveSnippet(text: string): string {
  const lines = text.split('\n').map((l) => l.trim())
  const firstIdx = lines.findIndex((l) => l)
  if (firstIdx === -1) return ''
  const rest = lines.slice(firstIdx + 1).filter(Boolean)
  return rest.join(' ').slice(0, 200)
}
