/**
 * The Vice mark, in the neon sunset style (glass.css: .neon-text): "Vice" in brush script, filled
 * with a slowly moving sunset gradient over a still shadow layer. Small enough for the theme
 * switch. Decorative; label what holds it.
 */
export function ViceMark() {
  return (
    <span className="vice-mark" aria-hidden="true">
      <span className="vice-layer vice-shadow">Vice</span>
      <span className="vice-layer neon-text">Vice</span>
    </span>
  )
}
