/** http(s) addresses in plain text. Trailing punctuation (a full stop after a link) isn't part of them. */
const URL_PATTERN = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'}]/g

/** Splits text into plain parts and links. */
export function linkify(text: string): { text: string; href?: string }[] {
  const parts: { text: string; href?: string }[] = []
  let last = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) })
    parts.push({ text: match[0], href: match[0] })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}
