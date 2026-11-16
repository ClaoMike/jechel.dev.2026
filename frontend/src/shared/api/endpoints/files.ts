/** Uploads (admin only): photos, papers, and the apps' images and videos. */

import { post } from '../http'

export interface UploadedFile {
  /** Where the file is served from: put it in photoUrl or links.resumeUrl. */
  url: string
  fileName: string
}

export interface UploadedMedia extends UploadedFile {
  kind: 'image' | 'video'
}

/** Called as an upload goes, with the share sent so far, 0 to 1. */
export type UploadProgress = (fraction: number) => void

function upload(path: string, file: File, onProgress?: UploadProgress): Promise<UploadedFile> {
  const form = new FormData()
  form.append('file', file)
  return post<UploadedFile>(path, form, {
    onUploadProgress: onProgress && ((event) => event.total && onProgress(event.loaded / event.total)),
  })
}

export const filesEndpoints = {
  /** Admin only. A JPEG, PNG, WebP or GIF up to 15 MB; stored as a small WebP without metadata. Rejects with validationErrors.file. */
  uploadPhoto(file: File, onProgress?: UploadProgress): Promise<UploadedFile> {
    return upload('/api/files/photo', file, onProgress)
  },

  /** Admin only. An academic paper, as a PDF up to 200 MB. Rejects with validationErrors.file. */
  uploadPaper(file: File, onProgress?: UploadProgress): Promise<UploadedFile> {
    return upload('/api/files/paper', file, onProgress)
  },

  /** Admin only. An image (JPEG, PNG, WebP or GIF up to 15 MB; stored as a WebP up to 1920 px) or a video (MP4, MOV or WebM up to 200 MB). */
  uploadAppMedia(file: File, onProgress?: UploadProgress): Promise<UploadedMedia> {
    return upload('/api/files/app-media', file, onProgress) as Promise<UploadedMedia>
  },
}
