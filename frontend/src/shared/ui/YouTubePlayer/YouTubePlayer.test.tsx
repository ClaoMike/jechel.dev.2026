import { describe, expect, it } from 'vitest'
import { renderView } from '@/test/render'
import { YouTubePlayer } from './YouTubePlayer'

const SRC = 'https://www.youtube-nocookie.com/embed/abc123'

describe("YouTube's player", () => {
  it('embeds the given player with what YouTube needs: autoplay, full screen, picture in picture, its referrer', async () => {
    await renderView(<YouTubePlayer src={SRC} title="Building a lighthouse game" />)
    const player = document.querySelector('iframe')!
    expect(player.src).toBe(SRC)
    expect(player.title).toBe('Building a lighthouse game')
    expect(player.allowFullscreen).toBe(true)
    expect(player.referrerPolicy).toBe('strict-origin-when-cross-origin')
    expect(player.allow.split('; ')).toEqual(expect.arrayContaining(['autoplay', 'encrypted-media', 'picture-in-picture', 'web-share']))
  })

  it('loads at once by default, or only when scrolled near when lazy', async () => {
    const eager = await renderView(<YouTubePlayer src={SRC} title="Eager" />)
    expect(document.querySelector('iframe')!.hasAttribute('loading')).toBe(false)
    await eager.unmount()
    await renderView(<YouTubePlayer src={SRC} title="Lazy" lazy />)
    expect(document.querySelector('iframe')!.getAttribute('loading')).toBe('lazy')
  })
})
