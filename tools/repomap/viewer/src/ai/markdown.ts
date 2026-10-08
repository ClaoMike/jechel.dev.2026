/**
 * The Markdown the assistant writes, as plain data for React to render (never HTML strings): code
 * fences, headings, lists, quotes, rules, paragraphs; inline code, bold, italic and http(s) links.
 * Pure. A fence still being streamed is shown as code up to where the text has got.
 */

export type Inline = { type: 'text' | 'code' | 'bold' | 'italic'; text: string } | { type: 'link'; text: string; href: string }

export type Block =
  | { type: 'code'; lang: string; text: string }
  | { type: 'heading'; level: number; content: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'quote'; content: Inline[] }
  | { type: 'rule' }
  | { type: 'paragraph'; content: Inline[] }

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const fence = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/.exec(line)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !new RegExp(`^\\s*${fence[1]}\\s*$`).test(lines[i])) body.push(lines[i++])
      i++
      blocks.push({ type: 'code', lang: fence[2].toLowerCase(), text: body.join('\n') })
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, content: parseInline(heading[2]) })
      i++
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: 'rule' })
      i++
      continue
    }
    const bullet = /^\s*([-*+]|\d+[.)])\s+/
    if (bullet.test(line)) {
      const ordered = /^\s*\d/.test(line)
      const items: Inline[][] = []
      while (i < lines.length && bullet.test(lines[i])) {
        let item = lines[i].replace(bullet, '')
        i++
        // Continuation lines (indented) belong to the item.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !bullet.test(lines[i])) item += ` ${lines[i++].trim()}`
        items.push(parseInline(item))
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }
    if (/^\s*>/.test(line)) {
      const quoted: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) quoted.push(lines[i++].replace(/^\s*>\s?/, ''))
      blocks.push({ type: 'quote', content: parseInline(quoted.join(' ')) })
      continue
    }
    const paragraph: string[] = []
    while (i < lines.length && lines[i].trim() && !/^\s*(```|~~~)/.test(lines[i]) && !/^#{1,6}\s/.test(lines[i]) && !bullet.test(lines[i]) && !/^\s*>/.test(lines[i])) {
      paragraph.push(lines[i++].trim())
    }
    blocks.push({ type: 'paragraph', content: parseInline(paragraph.join('\n')) })
  }
  return blocks
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  const pattern = /(`+)([\s\S]+?)\1|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\*([^*\s][^*]*?)\*|(?<![\w])_([^_\s][^_]*?)_(?![\w])|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push({ type: 'text', text: text.slice(last, match.index) })
    if (match[2] !== undefined) out.push({ type: 'code', text: match[2].trim() })
    else if (match[3] !== undefined || match[4] !== undefined) out.push({ type: 'bold', text: match[3] ?? match[4] })
    else if (match[5] !== undefined || match[6] !== undefined) out.push({ type: 'italic', text: match[5] ?? match[6] })
    else out.push({ type: 'link', text: match[7], href: match[8] })
    last = match.index + match[0].length
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out
}
