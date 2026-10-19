import { describe, expect, it } from 'vitest'
import { formatLink, parseRichText, plainText } from './textLinks'

describe('links in text', () => {
  it('splits text into plain parts and links', () => {
    expect(parseRichText('BSc at [Uni](https://uni.ac.uk), 2022')).toEqual([{ text: 'BSc at ' }, { text: 'Uni', href: 'https://uni.ac.uk' }, { text: ', 2022' }])
    expect(parseRichText('[a](/x)[b](/y)')).toEqual([{ text: 'a', href: '/x' }, { text: 'b', href: '/y' }])
    expect(parseRichText('no links')).toEqual([{ text: 'no links' }])
    expect(parseRichText('')).toEqual([])
  })

  it('keeps a URL with one level of parentheses', () => {
    expect(parseRichText('[Mercury](https://en.wikipedia.org/wiki/Mercury_(planet))')).toEqual([{ text: 'Mercury', href: 'https://en.wikipedia.org/wiki/Mercury_(planet)' }])
  })

  it('leaves an unsafe link as the text that was typed', () => {
    expect(parseRichText('see [this](javascript:alert(1)) now')).toEqual([{ text: 'see [this](javascript:alert(1)) now' }])
    expect(parseRichText('[x](//evil.com)')).toEqual([{ text: '[x](//evil.com)' }])
  })

  it('gives the text without link syntax', () => {
    expect(plainText('Fast tries for [autocomplete](https://example.com)')).toBe('Fast tries for autocomplete')
    expect(plainText('[bad](javascript:x)')).toBe('[bad](javascript:x)')
  })

  it('writes a link, dropping brackets from its text and falling back to the URL', () => {
    expect(formatLink('The [best] uni', ' https://uni.ac.uk ')).toBe('[The best uni](https://uni.ac.uk)')
    expect(formatLink('  ', 'https://x.dev')).toBe('[https://x.dev](https://x.dev)')
  })
})
