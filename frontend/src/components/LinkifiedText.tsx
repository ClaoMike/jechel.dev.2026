import { linkify } from '../utils/linkify'

/** Text whose web addresses become links (opening in a new tab), e.g. a YouTube description. */
export function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((part, i) =>
        part.href ? (
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer">
            {part.text}
          </a>
        ) : (
          part.text
        ),
      )}
    </>
  )
}
