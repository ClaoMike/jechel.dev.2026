/**
 * The Projects menu and Docker (Start, Stop, Reload): what the server says about them, kept up to date by its `project`
 * and `docker` events. Switching project: the server builds the other project's map, then serves it on the same
 * address; the page reloads once it does.
 */
import { create } from 'zustand'
import { WRITE_HEADER } from '../../../src/shared/git-actions.ts'
import type { DockerAction, DockerEvent, DockerService, DockerStatus, ProjectEvent, ProjectInfo, ProjectsView } from '../../../src/shared/projects.ts'
import { onServerEvent } from '../model/events.ts'
import { serverInfo } from '../model/server.ts'
import { useViewer } from '../model/store.ts'

const KEEP_LINES = 400

export type ProjectDialog = 'open' | 'create' | null

interface State {
  available: boolean
  dockerAvailable: boolean
  view: ProjectsView | null
  /** A switch under way (the page reloads when it's done). */
  switching: ProjectEvent | null
  docker: DockerStatus | null
  /** The services as last listed (kept while an action runs). */
  services: DockerService[]
  /** The output of the current (or last) Docker action. */
  log: string[]
  logOpen: boolean
  dialog: ProjectDialog
}

interface Actions {
  init(): Promise<void>
  refresh(): Promise<void>
  open(id: string): Promise<void>
  add(path: string, name: string): Promise<string | null>
  create(name: string, parent: string): Promise<string | null>
  runDocker(action: DockerAction): Promise<void>
  setDialog(dialog: ProjectDialog): void
  setLogOpen(open: boolean): void
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { [WRITE_HEADER]: '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  const data = (await response.json().catch(() => ({ error: `HTTP ${response.status}` }))) as T & { error?: string }
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
  return data
}

/** Waits for the server to answer for the project, then reloads the page on it (a fresh board, history and chat). */
async function reloadWhenServing(id: string): Promise<void> {
  for (let attempt = 0; attempt < 600; attempt++) {
    await new Promise((r) => setTimeout(r, 500))
    try {
      const view = await request<ProjectsView>('api/projects')
      if (view.current === id) {
        // Where you were belongs to the other project.
        history.replaceState(history.state, '', window.location.pathname + window.location.search)
        window.location.reload()
        return
      }
    } catch {
      // The server is restarting.
    }
  }
}

export const useProjects = create<State & Actions>((set, get) => ({
  available: false,
  dockerAvailable: false,
  view: null,
  switching: null,
  docker: null,
  services: [],
  log: [],
  logOpen: false,
  dialog: null,

  async init() {
    const info = await serverInfo()
    set({ available: !!info.projects, dockerAvailable: !!info.docker })
    if (!info.projects && !info.docker) return
    onServerEvent('project', (data) => {
      const event = data as ProjectEvent
      if (event.state === 'failed') {
        set({ switching: null })
        useViewer.getState().notify(`Could not open ${event.name}: ${event.error ?? 'failed'}`)
        return
      }
      set({ switching: event })
      if (event.state === 'switching') void reloadWhenServing(event.id)
    })
    onServerEvent('docker', (data) => {
      const { status, line } = data as DockerEvent
      const previous = get().docker
      set({
        docker: status,
        services: status.busy ? get().services : status.services,
        log: line ? [...get().log, line].slice(-KEEP_LINES) : get().log,
      })
      // An action ended: say how.
      if (previous?.busy && !status.busy && status.last) {
        const done = { start: 'started', stop: 'stopped', reload: 'reloaded' }[status.last.action]
        useViewer.getState().notify(status.last.ok ? `The project ${done}` : `Docker could not ${status.last.action} the project (see the log)`)
        if (!status.last.ok) set({ logOpen: true })
      }
    })
    await get().refresh()
  },

  async refresh() {
    const [view, docker] = await Promise.all([
      get().available ? request<ProjectsView>('api/projects').catch(() => null) : null,
      get().dockerAvailable ? request<DockerStatus>('api/docker').catch(() => null) : null,
    ])
    set({ view, docker, services: docker?.services ?? [] })
  },

  async open(id) {
    const project = get().view?.projects.find((p) => p.id === id)
    if (!project || project.current) return
    try {
      set({ switching: { state: 'building', id, name: project.name } })
      await request('api/projects/open', { id })
    } catch (error) {
      set({ switching: null })
      useViewer.getState().notify(`Could not open ${project.name}: ${(error as Error).message}`)
    }
  },

  async add(path, name) {
    try {
      const project = await request<ProjectInfo>('api/projects/add', { path, name })
      await get().refresh()
      await get().open(project.id)
      return null
    } catch (error) {
      return (error as Error).message
    }
  },

  async create(name, parent) {
    try {
      const project = await request<ProjectInfo>('api/projects/create', { name, parent })
      useViewer.getState().notify(`${project.name} created in ${project.root}`)
      await get().refresh()
      await get().open(project.id)
      return null
    } catch (error) {
      return (error as Error).message
    }
  },

  async runDocker(action) {
    try {
      set({ log: [] })
      const status = await request<DockerStatus>('api/docker', { action })
      set({ docker: { ...status, services: get().services } })
    } catch (error) {
      useViewer.getState().notify(`Docker: ${(error as Error).message}`)
    }
  },

  setDialog(dialog) {
    set({ dialog })
  },

  setLogOpen(open) {
    set({ logOpen: open })
  },
}))
