import type { ReactNode } from 'react'
import type { AppDetails } from '../../../services/api'
import { RichText } from '../../about/RichText'
import { MediaCarousel } from '../MediaCarousel/MediaCarousel'
import { PlatformChips } from '../PlatformChips/PlatformChips'
import { StoreLinks } from '../StoreLinks/StoreLinks'

/**
 * Everything about an app under its title: the images and videos in a slider, the
 * description, what it runs on, and where to get it. Used in the popup and on What's new.
 */
export function AppDetailsView({ app, children }: { app: AppDetails; children?: ReactNode }) {
  return (
    <div className="app-details">
      <MediaCarousel media={app.media} title={app.title} />
      {app.description && (
        <p className="app-description">
          <RichText text={app.description} />
        </p>
      )}
      <PlatformChips platforms={app.platforms} />
      <StoreLinks links={app.links} />
      {children}
    </div>
  )
}
