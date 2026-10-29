/** Terms and conditions. */

import { get, http } from '../http'

/** The terms and conditions. Free text may contain [text](https://…) links. */
export interface TermsContent {
  title: string
  /** Shown before the sections; may be empty. */
  intro: string
  /** Numbered 1, 2, 3… in this order. */
  sections: TermsSection[]
}

export interface TermsSection {
  heading: string
  /** Paragraphs and bullet lists, in order. */
  blocks: TermsBlock[]
}

export const TERMS_BLOCK_KINDS = ['paragraph', 'bullets'] as const
export type TermsBlockKind = (typeof TERMS_BLOCK_KINDS)[number]

/** A paragraph (`text`) or a bullet list (`items`); the API empties the other one. */
export interface TermsBlock {
  kind: TermsBlockKind
  text: string
  items: string[]
}

export interface TermsDocument extends TermsContent {
  /** ISO 8601 timestamp of the last change, or null for the default terms (never saved). */
  updatedAt: string | null
}

export const termsEndpoints = {
  /** Public. The default terms (updatedAt null) until the admin first saves them. */
  get(signal?: AbortSignal): Promise<TermsDocument> {
    return get<TermsDocument>('/api/terms', { signal })
  },

  /**
   * Admin only. Replaces the terms; resolves with them as stored (trimmed), with the new date.
   * Rejects with validationErrors keyed by path, e.g. "sections[0].blocks[1].items[2]".
   */
  async update(content: TermsContent): Promise<TermsDocument> {
    const response = await http.put<TermsDocument>('/api/terms', content)
    return response.data
  },
}
