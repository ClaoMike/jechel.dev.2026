import { describe, expect, it } from 'vitest'
import { makeApps } from '../../test/server'
import { mediaFromLink, tileImage, youTubeIdIn } from './media'

describe('youTubeIdIn', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=42', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/@CiresariiStudio', null],
    ['https://evil.example/watch?v=dQw4w9WgXcQ', null],
    ['not a link', null],
  ])('%s → %s', (link, id) => {
    expect(youTubeIdIn(link)).toBe(id)
  })
})

describe('mediaFromLink', () => {
  it('knows YouTube, video files and images', () => {
    expect(mediaFromLink(' https://youtu.be/dQw4w9WgXcQ ')).toEqual({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', kind: 'youtube' })
    expect(mediaFromLink('https://cdn.example.com/trailer.MP4?x=1')).toEqual({ url: 'https://cdn.example.com/trailer.MP4?x=1', kind: 'video' })
    expect(mediaFromLink('https://cdn.example.com/shot.png')).toEqual({ url: 'https://cdn.example.com/shot.png', kind: 'image' })
  })

  it('says why a link cannot be used', () => {
    expect(mediaFromLink('')).toBe('Paste a link first.')
    expect(mediaFromLink('javascript:alert(1)')).toBe('That should be a link starting with https://.')
    expect(mediaFromLink('/api/files/x')).toBe('That should be a link starting with https://.')
  })
})

describe('tileImage', () => {
  it('is the first image, or else the first YouTube thumbnail', () => {
    const [app] = makeApps(1)
    expect(tileImage(app)).toBe(app.media[1].url)
    expect(tileImage({ ...app, media: [{ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', kind: 'youtube' }] })).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
    expect(tileImage({ ...app, media: [] })).toBeUndefined()
  })
})
