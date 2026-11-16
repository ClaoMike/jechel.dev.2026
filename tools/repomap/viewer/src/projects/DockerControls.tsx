/**
 * Start, Stop and Reload in the top bar: the open project's docker compose, its state, and the output of the last
 * action (the log). Only when repomap serves your own repository and the project has a compose file.
 */
import { useEffect, useRef } from 'react'
import type { DockerAction } from '../../../src/shared/projects.ts'
import { Icon } from '../ui/icons.tsx'
import { useProjects } from './store.ts'

const LABEL: Record<DockerAction, string> = { start: 'Starting…', stop: 'Stopping…', reload: 'Reloading…' }

export function DockerControls() {
  const available = useProjects((s) => s.dockerAvailable)
  const docker = useProjects((s) => s.docker)
  const services = useProjects((s) => s.services)
  if (!available || !docker || !docker.compose) return null
  const { runDocker, setLogOpen } = useProjects.getState()
  const busy = docker.busy
  const up = services.filter((s) => s.state === 'running').length
  const state = !docker.available ? 'off' : busy ? 'busy' : up === 0 ? 'stopped' : up === services.length ? 'running' : 'partly'
  const text = {
    off: 'Docker is off',
    busy: busy ? LABEL[busy.action] : '',
    stopped: 'Stopped',
    running: 'Running',
    partly: `${up}/${services.length} running`,
  }[state]
  return (
    <div className="docker-controls" role="group" aria-label="Run the project with Docker" data-testid="docker-controls">
      <button
        type="button"
        className={`docker-state ${state}`}
        onClick={() => setLogOpen(true)}
        title={docker.problem ?? `${services.map((s) => `${s.name}: ${s.state}`).join(' · ')} — show the log`}
        data-testid="docker-state"
      >
        <span className="docker-dot" aria-hidden="true" />
        <span className="hide-md">{text}</span>
        <span className="sr-only">{`${text}. Show the log`}</span>
      </button>
      <div className="segmented">
        <button
          type="button"
          onClick={() => void runDocker('start')}
          disabled={!!busy || !docker.available}
          title="Start: build and run (docker compose up)"
          data-testid="docker-start"
        >
          <Icon name="play" size={14} /> <span className="hide-md">Start</span>
        </button>
        <button
          type="button"
          onClick={() => void runDocker('stop')}
          disabled={!!busy || !docker.available || up === 0}
          title="Stop (docker compose down: the data is kept)"
          data-testid="docker-stop"
        >
          <Icon name="stop" size={14} /> <span className="hide-md">Stop</span>
        </button>
        <button
          type="button"
          onClick={() => void runDocker('reload')}
          disabled={!!busy || !docker.available}
          title="Reload: rebuild and recreate everything"
          data-testid="docker-reload"
        >
          <Icon name="sync" size={14} /> <span className="hide-md">Reload</span>
        </button>
      </div>
      {docker.url && state === 'running' && (
        <a className="icon-button" href={docker.url} target="_blank" rel="noreferrer" title={`Open the site: ${docker.url}`} aria-label="Open the site" data-testid="docker-open">
          <Icon name="external" />
        </a>
      )}
    </div>
  )
}

/** The services and the output of the current (or last) action. */
export function DockerLog() {
  const open = useProjects((s) => s.logOpen)
  const docker = useProjects((s) => s.docker)
  const services = useProjects((s) => s.services)
  const log = useProjects((s) => s.log)
  const output = log.length ? log.join('\n') : (docker?.last?.output ?? '')
  // The newest output in view (the end of a build is what tells you how it went).
  const bottom = useRef<HTMLPreElement>(null)
  useEffect(() => {
    if (bottom.current) bottom.current.scrollTop = bottom.current.scrollHeight
  }, [output, open])
  if (!open || !docker) return null
  const close = () => useProjects.getState().setLogOpen(false)
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal docker-log" role="dialog" aria-modal="true" aria-label="Docker" onKeyDown={(e) => e.key === 'Escape' && close()} data-testid="docker-log">
        <header>
          <h2>Docker</h2>
          <button type="button" className="icon-button" onClick={close} aria-label="Close" autoFocus>
            <Icon name="close" />
          </button>
        </header>
        <div className="dialog-body">
          {docker.problem && <p className="docker-problem">{docker.problem}</p>}
          {services.length > 0 && (
            <ul className="docker-services">
              {services.map((s) => (
                <li key={s.name} className={s.state === 'running' ? 'running' : ''}>
                  <span className="docker-dot" aria-hidden="true" />
                  <strong>{s.name}</strong> {s.state}
                  {s.health ? ` (${s.health})` : ''}
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">
            {docker.busy
              ? LABEL[docker.busy.action]
              : docker.last
                ? `Last: ${docker.last.action}, ${docker.last.ok ? 'done' : 'failed'} at ${new Date(docker.last.at).toLocaleTimeString()}`
                : 'Nothing run yet.'}
            {docker.file ? ` · ${docker.file}` : ''}
          </p>
          {output && (
            <pre ref={bottom} className="docker-output" data-testid="docker-output">
              {output}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
