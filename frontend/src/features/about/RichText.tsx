import type { ReactNode } from 'react'
import { parseRichText } from './textLinks'

/** Text with its [text](url) links as real links. External links open in a new tab. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {parseRichText(text).map((part, i) =>
        part.href === undefined ? (
          part.text
        ) : (
          <ExternalLink key={i} href={part.href}>
            {part.text}
          </ExternalLink>
        ),
      )}
    </>
  )
}

/** A link; one to another site opens in a new tab. Assumes `href` passed isSafeUrl. */
export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const external = !href.startsWith('/')
  return (
    <a className={className} href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>
      {children}
    </a>
  )
}
