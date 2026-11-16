/** Projects (the Projects menu) and running them with Docker (Start, Stop, Reload): what the server and the viewer share. */

export interface ProjectInfo {
  id: string
  name: string
  root: string
  /** The one open now. */
  current: boolean
  /** Its folder is gone (moved or deleted). */
  missing: boolean
}

export interface ProjectsView {
  current: string
  projects: ProjectInfo[]
  /** Where new projects go unless you say otherwise (the folder holding the current one). */
  defaultParent: string
}

/** Start: build and run; Stop: take it down (the data is kept); Reload: rebuild and recreate every container. */
export type DockerAction = 'start' | 'stop' | 'reload'
export const DOCKER_ACTIONS: readonly DockerAction[] = ['start', 'stop', 'reload']

export interface DockerService {
  name: string
  /** As compose says it: running, exited, created, restarting… */
  state: string
  health?: string
}

export interface DockerStatus {
  /** The docker command answers (Docker is installed and running). */
  available: boolean
  /** The project has a compose file. */
  compose: boolean
  file?: string
  services: DockerService[]
  /** Every service of the project is running. */
  running: boolean
  url?: string
  busy?: { action: DockerAction; startedAt: string }
  last?: { action: DockerAction; ok: boolean; at: string; output: string }
  /** Why it can't run (no Docker, no compose file). */
  problem?: string
}

/** The `docker` server event: the status, and the newest output while an action runs. */
export interface DockerEvent {
  status: DockerStatus
  line?: string
}

/** The `project` server event: switching to another project (the viewer reloads once the server answers for it). */
export interface ProjectEvent {
  state: 'building' | 'switching' | 'failed'
  id: string
  name: string
  error?: string
}
