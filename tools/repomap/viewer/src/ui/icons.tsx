export type IconName =
  | 'menu' | 'search' | 'close' | 'fit' | 'sun' | 'moon' | 'help' | 'open' | 'chevron' | 'copy'
  | 'external' | 'up' | 'down' | 'link' | 'warn' | 'reset' | 'layers' | 'code' | 'wrap' | 'lock' | 'git' | 'branch' | 'tag' | 'commit' | 'pr' | 'user' | 'clock' | 'file' | 'focus'
  | 'caret' | 'edit' | 'check' | 'sparkle' | 'gear' | 'send' | 'stop' | 'plus' | 'sync' | 'push' | 'pull' | 'merge' | 'stash' | 'more' | 'trash'

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    menu: <path d="M3 5h14M3 10h14M3 15h14" />,
    search: <><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2 17 17" /></>,
    close: <path d="M5 5l10 10M15 5 5 15" />,
    fit: <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />,
    sun: <><circle cx="10" cy="10" r="3.4" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></>,
    moon: <path d="M15.5 12.4A6.2 6.2 0 0 1 7.6 4.5a6.2 6.2 0 1 0 7.9 7.9z" />,
    help: <><circle cx="10" cy="10" r="7" /><path d="M8 8a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.3v.4M10 14.2v.1" /></>,
    open: <path d="M3 6.5V15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-6L8.2 5H4a1 1 0 0 0-1 1.5z" />,
    chevron: <path d="M7.5 5l5 5-5 5" />,
    copy: <><rect x="7" y="7" width="9" height="9" rx="1.5" /><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" /></>,
    external: <path d="M11 4h5v5M16 4l-7 7M14 12v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3" />,
    up: <path d="M10 15V5M5.5 9.5 10 5l4.5 4.5" />,
    down: <path d="M10 5v10M5.5 10.5 10 15l4.5-4.5" />,
    link: <path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-.8.8M11.5 8.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l.8-.8" />,
    warn: <><path d="M10 3.5 17 16H3z" /><path d="M10 8.5v3.2M10 13.8v.1" /></>,
    reset: <path d="M4.5 9A5.5 5.5 0 1 1 6 13.6M4.5 4.5V9H9" />,
    layers: <path d="M10 3 17 6.8 10 10.6 3 6.8zM3 10.2l7 3.8 7-3.8M3 13.6l7 3.8 7-3.8" />,
    code: <path d="M7 6 3 10l4 4M13 6l4 4-4 4M11.5 4.5l-3 11" />,
    wrap: <path d="M3 5h14M3 10h11a3 3 0 0 1 0 6h-3M12.5 14l-2 2 2 2M3 15h4" />,
    lock: <><rect x="4.5" y="9" width="11" height="8" rx="1.5" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></>,
    git: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="15" r="2" /><circle cx="14" cy="8" r="2" /><path d="M6 7v6M14 10c0 3-4 3-7.2 4" /></>,
    branch: <><circle cx="6" cy="4.5" r="1.8" /><circle cx="6" cy="15.5" r="1.8" /><circle cx="14" cy="6.5" r="1.8" /><path d="M6 6.3v7.4M14 8.3c0 3.5-8 2.5-8 5.4" /></>,
    tag: <><path d="M3.5 10.2V4.5a1 1 0 0 1 1-1h5.7l6.3 6.3a1 1 0 0 1 0 1.4l-5.3 5.3a1 1 0 0 1-1.4 0z" /><circle cx="7.3" cy="7.3" r="1.2" /></>,
    commit: <><circle cx="10" cy="10" r="3" /><path d="M2.5 10h4.5M13 10h4.5" /></>,
    pr: <><circle cx="5.5" cy="4.5" r="1.8" /><circle cx="5.5" cy="15.5" r="1.8" /><circle cx="14.5" cy="15.5" r="1.8" /><path d="M5.5 6.3v7.4M14.5 13.7V8a2.5 2.5 0 0 0-2.5-2.5H9M10.5 3.8 8.8 5.5l1.7 1.7" /></>,
    user: <><circle cx="10" cy="7" r="3.2" /><path d="M3.8 17a6.2 6.2 0 0 1 12.4 0" /></>,
    clock: <><circle cx="10" cy="10" r="7" /><path d="M10 6v4.3l2.8 1.7" /></>,
    file: <><path d="M5 2.8h6.5L15.5 7v10a.8.8 0 0 1-.8.8H5a.8.8 0 0 1-.8-.8V3.6a.8.8 0 0 1 .8-.8z" /><path d="M11.3 2.8V7h4.2" /></>,
    focus: <><circle cx="10" cy="10" r="5.2" /><circle cx="10" cy="10" r="1.3" fill="currentColor" /><path d="M10 2.2v2.6M10 15.2v2.6M2.2 10h2.6M15.2 10h2.6" /></>,
    caret: <path d="M5.5 8l4.5 4.5L14.5 8" />,
    sparkle: <><path d="M10 2.8l1.6 4.4 4.4 1.6-4.4 1.6L10 14.8l-1.6-4.4L4 8.8l4.4-1.6z" /><path d="M15.5 13.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></>,
    gear: <><circle cx="10" cy="10" r="2.6" /><path d="M10 2.5v2.1M10 15.4v2.1M2.5 10h2.1M15.4 10h2.1M4.7 4.7l1.5 1.5M13.8 13.8l1.5 1.5M4.7 15.3l1.5-1.5M13.8 6.2l1.5-1.5" /></>,
    send: <path d="M3.5 10 16.5 4l-4.2 12.5-2.6-5.2zM9.7 11.3l6.8-7.3" />,
    stop: <rect x="5" y="5" width="10" height="10" rx="1.5" fill="currentColor" />,
    edit: <path d="M12.8 3.7a1.7 1.7 0 0 1 2.4 0l1.1 1.1a1.7 1.7 0 0 1 0 2.4L7.6 15.9 3.5 16.5l.6-4.1zM11.3 5.2l3.5 3.5" />,
    check: <path d="M4 10.5l3.8 3.8L16 6" />,
    plus: <path d="M10 4v12M4 10h12" />,
    sync: <><path d="M15.8 8A6 6 0 0 0 4.6 6.4M4.2 12a6 6 0 0 0 11.2 1.6" /><path d="M4.4 3.2v3.4h3.4M15.6 16.8v-3.4h-3.4" /></>,
    push: <><path d="M10 13V3.5M6 7.5l4-4 4 4" /><path d="M4 12.5v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3" /></>,
    pull: <><path d="M10 3.5V13M6 9l4 4 4-4" /><path d="M4 12.5v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3" /></>,
    merge: <><circle cx="6" cy="4.5" r="1.8" /><circle cx="6" cy="15.5" r="1.8" /><circle cx="14.5" cy="10" r="1.8" /><path d="M6 6.3v7.4M6 6.3c0 3 3.5 3.7 6.7 3.7" /></>,
    stash: <><rect x="3.5" y="8" width="13" height="8" rx="1.5" /><path d="M5.5 8V5.5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1V8M8 11.5h4" /></>,
    more: <><circle cx="4.5" cy="10" r="1.2" fill="currentColor" /><circle cx="10" cy="10" r="1.2" fill="currentColor" /><circle cx="15.5" cy="10" r="1.2" fill="currentColor" /></>,
    trash: <><path d="M4 5.5h12M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5.5 5.5l.8 10.6a1 1 0 0 0 1 .9h5.4a1 1 0 0 0 1-.9l.8-10.6" /></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}
