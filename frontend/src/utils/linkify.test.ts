import { describe, expect, it } from 'vitest'
import { linkify } from './linkify'

describe('linkify', () => {
  it('turns web addresses into links, leaving punctuation after them', () => {
    expect(linkify('Code: https://github.com/x/y. Chapters (see https://example.com/a?b=1)!')).toEqual([
      { text: 'Code: ' },
      { text: 'https://github.com/x/y', href: 'https://github.com/x/y' },
      { text: '. Chapters (see ' },
      { text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' },
      { text: ')!' },
    ])
  })

  it('leaves text without links alone, and never links other schemes', () => {
    expect(linkify('No links here')).toEqual([{ text: 'No links here' }])
    expect(linkify('javascript:alert(1)')).toEqual([{ text: 'javascript:alert(1)' }])
  })
})
