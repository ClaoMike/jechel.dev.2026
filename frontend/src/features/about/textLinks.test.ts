import { describe, expect, it } from 'vitest'
import { formatLink, parseRichText, plainText } from './textLinks'

describe('parseRichText', () => {
  it('splits text into plain parts and links', () => {
    expect(parseRichText('BSc at [The University of Manchester](https://www.manchester.ac.uk), 2019')).toEqual([
      { text: 'BSc at ' },
      { text: 'The University of Manchester', href: 'https://www.manchester.ac.uk' },
      { text: ', 2019' },
    ])
  })

  it('keeps one level of parentheses in a URL', () => {
    expect(parseRichText('[Mercury](https://en.wikipedia.org/wiki/Mercury_(planet))')).toEqual([{ text: 'Mercury', href: 'https://en.wikipedia.org/wiki/Mercury_(planet)' }])
  })

  it('allows paths on this site', () => {
    expect(parseRichText('[CV](/resume.pdf)')).toEqual([{ text: 'CV', href: '/resume.pdf' }])
  })

  it.each(['[Click](javascript:alert(1))', '[x](data:text/html,hi)', '[x](//evil.example)'])('leaves an unsafe link as plain text: %s', (text) => {
    expect(parseRichText(text)).toEqual([{ text }])
  })

  it('leaves brackets that are not links alone', () => {
    expect(parseRichText('Grade [A] (first class)')).toEqual([{ text: 'Grade [A] (first class)' }])
  })

  it('handles empty text', () => {
    expect(parseRichText('')).toEqual([])
  })
})

describe('plainText', () => {
  it('drops the link syntax', () => {
    expect(plainText('At [Uni](https://uni.example) in 2019')).toBe('At Uni in 2019')
  })
})

describe('formatLink', () => {
  it('writes [label](url), without brackets that would break it', () => {
    expect(formatLink(' My [best] work ', ' https://x.example ')).toBe('[My best work](https://x.example)')
  })

  it('uses the URL when there is no label', () => {
    expect(formatLink('', 'https://x.example')).toBe('[https://x.example](https://x.example)')
  })
})
