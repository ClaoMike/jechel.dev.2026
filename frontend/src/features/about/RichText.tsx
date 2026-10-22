import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { isSitePage, parseRichText } from './textLinks'

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

/**
 * A link: to a page of this site, it moves there within the site (no reload); to a file of this site
 * (an uploaded paper), it opens it; to another site, it opens a new tab. Assumes `href` passed isSafeUrl.
 */
export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  if (isSitePage(href))
    return (
      <Link className={className} to={href}>
        {children}
      </Link>
    )
  const external = !href.startsWith('/')
  return (
    <a className={className} href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>
      {children}
    </a>
  )
}
