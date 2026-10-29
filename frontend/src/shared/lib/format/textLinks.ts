import { isSafeUrl } from './format'

/** A piece of text, or a link. */
export type TextPart = { text: string; href?: undefined } | { text: string; href: string }

/**
 * [text](url), as in Markdown. The URL may contain one level of parentheses, for links like
 * https://en.wikipedia.org/wiki/Mercury_(planet). Same syntax as the API's AboutRules.LinksIn.
 */
const LINK = /\[([^[\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g

/**
 * Splits text into plain parts and links. A link whose URL isn't safe (see isSafeUrl) stays
 * plain text, exactly as typed, so it can never become a javascript: link.
 */
export function parseRichText(text: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const match of text.matchAll(LINK)) {
    const [whole, label, url] = match
    if (!isSafeUrl(url)) continue
    if (match.index > last) parts.push({ text: text.slice(last, match.index) })
    parts.push({ text: label, href: url })
    last = match.index + whole.length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return mergePlain(parts)
}

/** The text without link syntax: "[Uni](https://…)" → "Uni". For labels and sorting. */
export function plainText(text: string): string {
  return parseRichText(text)
    .map((part) => part.text)
    .join('')
}

/** "[label](url)", with brackets in the label removed so the syntax stays intact. */
export function formatLink(label: string, url: string): string {
  return `[${label.replace(/[[\]]/g, '').trim() || url}](${url.trim()})`
}

function mergePlain(parts: TextPart[]): TextPart[] {
  const merged: TextPart[] = []
  for (const part of parts) {
    const previous = merged.at(-1)
    if (previous && previous.href === undefined && part.href === undefined) previous.text += part.text
    else merged.push({ ...part })
  }
  return merged
}

/** A page of this site (e.g. "/contact"), not a file the API serves ("/api/files/…") or another site. */
export const isSitePage = (href: string) => href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/api/')
