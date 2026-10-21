import { describe, expect, it } from 'vitest'
import { APPS, makeApp } from '../../test/fixtures/apps'
import { mediaFromLink, tileImage, youTubeEmbedUrl, youTubeIdIn, youTubeThumbnail, youTubeWatchUrl } from './media'

describe('app media', () => {
  it('finds the video id in every kind of YouTube link', () => {
    for (const link of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://m.youtube.com/live/dQw4w9WgXcQ/',
      'http://www.youtube-nocookie.com/watch?v=dQw4w9WgXcQ&t=10',
      '  https://youtu.be/dQw4w9WgXcQ  ',
    ])
      expect(youTubeIdIn(link), link).toBe('dQw4w9WgXcQ')
  })

  it('finds no id in other links or broken ones', () => {
    for (const link of ['https://vimeo.com/123', 'https://www.youtube.com/watch?v=short', 'not a link', 'ftp://youtu.be/dQw4w9WgXcQ', 'https://youtu.be/', 'https://evil.com/watch?v=dQw4w9WgXcQ']) expect(youTubeIdIn(link), link).toBeNull()
  })

  it('builds YouTube links', () => {
    expect(youTubeWatchUrl('abc')).toBe('https://www.youtube.com/watch?v=abc')
    expect(youTubeEmbedUrl('a b')).toBe('https://www.youtube-nocookie.com/embed/a%20b')
    expect(youTubeThumbnail('abc')).toBe('https://i.ytimg.com/vi/abc/hqdefault.jpg')
  })

  it('turns a pasted link into media, or says why it can not', () => {
    expect(mediaFromLink('https://youtu.be/dQw4w9WgXcQ')).toEqual({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', kind: 'youtube' })
    expect(mediaFromLink(' https://cdn.example.com/trailer.MP4?x=1 ')).toEqual({ url: 'https://cdn.example.com/trailer.MP4?x=1', kind: 'video' })
    expect(mediaFromLink('https://cdn.example.com/shot.png')).toEqual({ url: 'https://cdn.example.com/shot.png', kind: 'image' })
    expect(mediaFromLink('   ')).toBe('Paste a link first.')
    expect(mediaFromLink('/api/files/x.png')).toBe('That should be a link starting with https://.')
    expect(mediaFromLink('javascript:alert(1)')).toBe('That should be a link starting with https://.')
  })

  it("picks the tile's picture: the first image, else the first YouTube thumbnail, else none", () => {
    expect(tileImage(APPS[0])).toBe(APPS[0].media[0].url)
    expect(tileImage(makeApp(1, { media: [{ url: 'https://youtu.be/dQw4w9WgXcQ', kind: 'youtube' }, { url: '/x.png', kind: 'image' }] }))).toBe('/x.png')
    expect(tileImage(makeApp(1, { media: [{ url: '/v.mp4', kind: 'video' }, { url: 'https://youtu.be/dQw4w9WgXcQ', kind: 'youtube' }] }))).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
    expect(tileImage(makeApp(1, { media: [{ url: '/v.mp4', kind: 'video' }] }))).toBeUndefined()
  })
})
