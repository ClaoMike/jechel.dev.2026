import type { AppDetails, AppMedia } from '../../services/api'
import { isSafeUrl } from '../about/format'

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']

/**
 * The 11-character id in a YouTube video link (watch?v=, youtu.be/, /shorts/, /embed/, /live/),
 * or null. Same rules as the API's YouTubeLinks.
 */
export function youTubeIdIn(link: string): string | null {
  let url: URL
  try {
    url = new URL(link.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase()
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.replace(/^\/+|\/+$/g, '')
  else if (YOUTUBE_HOSTS.includes(host)) id = url.pathname === '/watch' ? url.searchParams.get('v') : (/^\/(?:shorts|embed|live)\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null)
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
}

export const youTubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`

/** YouTube's privacy-enhanced player: no cookies until the video is played. */
export const youTubeEmbedUrl = (id: string) => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`

export const youTubeThumbnail = (id: string) => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`

/**
 * A pasted link as media: a YouTube video, a video file (by its extension) or otherwise an
 * image. A string says why it can't be used.
 */
export function mediaFromLink(link: string): AppMedia | string {
  const url = link.trim()
  if (!url) return 'Paste a link first.'
  const id = youTubeIdIn(url)
  if (id) return { url: youTubeWatchUrl(id), kind: 'youtube' }
  if (!/^https?:\/\//i.test(url) || !isSafeUrl(url)) return 'That should be a link starting with https://.'
  return { url, kind: VIDEO_EXTENSION.test(new URL(url).pathname) ? 'video' : 'image' }
}

/** The extensions of the videos an app can have (the API checks the file itself): MP4, MOV and WebM. */
const VIDEO_EXTENSION = /\.(mp4|m4v|webm|mov)$/i

/** Whether a file to upload is a video (its larger limit applies): by its type, or its name when the browser gives no type. */
export const isVideoFile = (file: File) => file.type.startsWith('video/') || VIDEO_EXTENSION.test(file.name)

/** The picture on an app's tile: its first image, or else its first YouTube video's thumbnail. */
export function tileImage(app: AppDetails): string | undefined {
  const image = app.media.find((m) => m.kind === 'image')
  if (image) return image.url
  const youTube = app.media.map((m) => (m.kind === 'youtube' ? youTubeIdIn(m.url) : null)).find((id) => id)
  return youTube ? youTubeThumbnail(youTube) : undefined
}
