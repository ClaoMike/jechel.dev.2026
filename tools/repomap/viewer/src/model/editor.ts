/** What the code panel shows right now (the assistant attaches it as context). */
import { create } from 'zustand'

export interface EditorState {
  /** The open file, or null when the code panel is closed. */
  file: string | null
  cursorLine: number | null
  selection: { from: number; to: number; text: string } | null
}

export const useEditor = create<EditorState>(() => ({ file: null, cursorLine: null, selection: null }))
