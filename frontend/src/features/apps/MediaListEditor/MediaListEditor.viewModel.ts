import { useRef, useState, type KeyboardEvent } from 'react'
import { useDragSort } from '../../../components/useDragSort'
import { api, failureOf, type AppMedia } from '../../../services/api'
import { formatMegabytes } from '../../about/format'
import { move, removeAt } from '../../about/list'
import { APP_IMAGE_MAX_BYTES, APP_VIDEO_MAX_BYTES } from '../../about/uploadLimits'
import { mediaFromLink } from '../media'

const noun = (item: AppMedia) => ({ image: 'image', video: 'video', youtube: 'YouTube video' })[item.kind]
const LABELS = { image: 'Image', video: 'Video', youtube: 'YouTube' }

/** Keys that stay the same when the list is reordered: the link, and which repeat of it this is. */
function stableKeys(items: AppMedia[]): string[] {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const n = seen.get(item.url) ?? 0
    seen.set(item.url, n + 1)
    return `${item.url}#${n}`
  })
}

export interface MediaListEditorProps {
  value: AppMedia[]
  update: (change: (current: AppMedia[]) => AppMedia[]) => void
  error?: string
}

/**
 * The list in its shown order (dragging reorders it), uploads (several at once, straight away; the
 * list is saved with the app) and adding from a link.
 */
export function useMediaListEditorViewModel({ value, update }: MediaListEditorProps) {
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const sort = useDragSort(value.length, (from, to) => update((current) => move(current, from, to)))
  const keys = stableKeys(value)

  // Uploads go through the API service directly: their progress isn't the store's to keep.
  async function upload(files: File[]) {
    const failed: string[] = []
    for (const [i, file] of files.entries()) {
      const max = file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mov') ? APP_VIDEO_MAX_BYTES : APP_IMAGE_MAX_BYTES
      if (file.size > max) {
        failed.push(`${file.name} is ${formatMegabytes(file.size)}; the limit is ${formatMegabytes(max)}.`)
        continue
      }
      const label = files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : 'Uploading…'
      setProgress(`${label} 0%`)
      try {
        const uploaded = await api.files.uploadAppMedia(file, (fraction) => setProgress(`${label} ${Math.floor(fraction * 100)}%`))
        // Appends to the latest list: other changes may have happened while this uploaded.
        update((current) => [...current, { url: uploaded.url, kind: uploaded.kind }])
      } catch (e) {
        const { status, validationErrors } = failureOf(e)
        const reason = validationErrors?.file?.[0]
        failed.push(`${file.name}: ${reason || (status === 401 ? 'your session has ended. Sign in again, then upload.' : "couldn't upload. Please try again.")}`)
      }
    }
    setProgress(null)
    setProblems(failed)
    if (input.current) input.current.value = ''
  }

  function addLink() {
    const media = mediaFromLink(link)
    if (typeof media === 'string') {
      setLinkError(media)
      return
    }
    update((current) => [...current, media])
    setLink('')
    setLinkError(null)
  }

  return {
    inputRef: input,
    sort,
    items: sort.order.map((index, position) => {
      const item = value[index]
      return { key: keys[index], position, item, name: `${noun(item)} ${position + 1}`, label: `${position + 1}. ${LABELS[item.kind]}`, remove: () => update((current) => removeAt(current, index)) }
    }),
    progress,
    problems,
    pickFiles: () => input.current?.click(),
    upload: (files: File[]) => void upload(files),
    link,
    linkError,
    setLink: (next: string) => {
      setLink(next)
      setLinkError(null)
    },
    addLink,
    // Enter adds the link instead of submitting the app's form.
    onLinkKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        addLink()
      }
    },
  }
}
