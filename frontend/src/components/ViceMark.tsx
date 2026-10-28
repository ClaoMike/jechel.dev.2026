import { strings } from '../strings'

/**
 * The Vice mark, in the neon sunset style (glass.css: .neon-text): "Vice" in brush script, filled
 * with a slowly moving sunset gradient over a still shadow layer. Small enough for the theme
 * switch. Decorative; label what holds it. A name: browsers' translators leave it alone.
 */
export function ViceMark() {
  return (
    <span className="vice-mark" aria-hidden="true" translate="no">
      <span className="vice-layer vice-shadow">{strings.viceMark.vice}</span>
      <span className="vice-layer neon-text">{strings.viceMark.vice}</span>
    </span>
  )
}
