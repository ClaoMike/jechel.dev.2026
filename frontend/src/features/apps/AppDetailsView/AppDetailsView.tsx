import type { ReactNode } from 'react'
import type { AppDetails } from '../../../services/api'
import { RichText } from '../../about/RichText'
import { useAppDetailsViewViewModel } from './AppDetailsView.viewModel'
import { StoreLinks } from '../AppFields/AppFields'
import { MediaCarousel } from '../MediaCarousel/MediaCarousel'

/**
 * Everything about an app under its title: the images and videos in a slider, the
 * description, what it runs on, and where to get it. Used in the popup and on What's new.
 */
export function AppDetailsView({ app, children }: { app: AppDetails; children?: ReactNode }) {
  const { id } = useAppDetailsViewViewModel()
  return (
    <div className="app-details">
      <MediaCarousel media={app.media} title={app.title} />
      {app.description && (
        <p className="app-description">
          <RichText text={app.description} />
        </p>
      )}
      {app.platforms.length > 0 && (
        <div className="app-platforms">
          <span className="app-platforms-label" id={`${id}-platforms`}>
            Runs on
          </span>
          <ul className="chips" aria-labelledby={`${id}-platforms`}>
            {app.platforms.map((platform) => (
              <li key={platform} className="chip">
                {platform}
              </li>
            ))}
          </ul>
        </div>
      )}
      <StoreLinks links={app.links} />
      {children}
    </div>
  )
}
