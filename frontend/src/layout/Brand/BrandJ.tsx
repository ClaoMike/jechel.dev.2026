import { strings } from '../../strings'

/**
 * The title's "j". In Vice, glass.css draws it (scripts/build_brand_j.py: Mr Dafoe's own j closes its
 * loop up) and shrinks the letter to nothing; the letter stays, so the heading still reads "jechel.dev".
 */
export function BrandJ() {
  return (
    <span className="brand-j">
      <span className="brand-j-letter">{strings.brandJ.j}</span>
    </span>
  )
}
