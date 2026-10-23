import { Link } from 'react-router'
import { BrandJ } from './BrandJ'

/**
 * The site's name, linking home. In Vice it's written in neon (glass.css): a still shadow layer under
 * the moving colours, and a drawn j (BrandJ). Screen readers get the name once, as plain text; the
 * drawn layers are decoration (and would read "j echel.dev"). A name: browsers' translators leave it alone.
 */
export function Brand() {
  return (
    <h1 className="brand" translate="no">
      <Link to="/" className="brand-link">
        <span className="visually-hidden">jechel.dev</span>
        <span className="brand-text" aria-hidden="true">
          <span className="brand-shadow">
            <BrandJ />
            echel<span className="brand-dot">.</span>dev
          </span>
          <span className="brand-fill">
            <BrandJ />
            echel<span className="brand-dot">.</span>dev
          </span>
        </span>
      </Link>
    </h1>
  )
}
