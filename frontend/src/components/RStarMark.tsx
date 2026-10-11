/**
 * The R★ mark, in the neon Vice City style (glass.css: .neon-text): a brush-script R and a star,
 * filled with a slowly moving sunset gradient over a still shadow layer. Decorative; label what
 * holds it.
 */
export function RStarMark() {
  return (
    <span className="rstar-mark" aria-hidden="true">
      <span className="rstar-layer rstar-shadow">
        <span className="rstar-r">R</span>
        <span className="rstar-star" />
      </span>
      <span className="rstar-layer">
        <span className="neon-text rstar-r">R</span>
        <span className="neon-fill rstar-star" />
      </span>
    </span>
  )
}
