/** Renders the assistant's Markdown (parsed into data first: no HTML from the model is ever injected). */
import { Fragment, useMemo, type ReactNode } from 'react'
import { parseMarkdown, type Inline } from './markdown.ts'

function inline(parts: Inline[]): ReactNode[] {
  return parts.map((part, k) => {
    switch (part.type) {
      case 'code':
        return <code key={k}>{part.text}</code>
      case 'bold':
        return <strong key={k}>{part.text}</strong>
      case 'italic':
        return <em key={k}>{part.text}</em>
      case 'link':
        return (
          <a key={k} href={part.href} target="_blank" rel="noreferrer noopener">
            {part.text}
          </a>
        )
      default:
        // Keep the line breaks of a paragraph.
        return (
          <Fragment key={k}>
            {part.text.split('\n').map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {line}
              </Fragment>
            ))}
          </Fragment>
        )
    }
  })
}

export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text])
  return (
    <div className="markdown">
      {blocks.map((block, k) => {
        switch (block.type) {
          case 'code':
            return (
              <pre key={k} className="md-code" data-lang={block.lang || undefined}>
                <code>{block.text}</code>
              </pre>
            )
          case 'heading': {
            const Tag = `h${Math.min(6, block.level + 2)}` as 'h3'
            return <Tag key={k}>{inline(block.content)}</Tag>
          }
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul'
            return (
              <List key={k}>
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </List>
            )
          }
          case 'quote':
            return <blockquote key={k}>{inline(block.content)}</blockquote>
          case 'rule':
            return <hr key={k} />
          default:
            return <p key={k}>{inline(block.content)}</p>
        }
      })}
    </div>
  )
}
