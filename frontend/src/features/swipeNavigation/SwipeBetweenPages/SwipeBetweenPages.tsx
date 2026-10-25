/** The swipes, in the order they're tried out (see useSwipeNavigation). */
const RULES = [
  { title: 'Left: the next page', text: 'In the tab bar’s order: What’s new? → Apps → YouTube → About Me → Contact → System.' },
  { title: 'Right: the previous one', text: 'And nothing past either end.' },
  { title: 'On System’s pages, between them', text: 'Engagement to Feature Testing, then each feature here in turn, stopping at either end.' },
  { title: 'Not from the screen’s edge', text: 'Those are the browser’s: Safari’s swipe back and forward still work.' },
  { title: 'Not on what moves sideways itself', text: 'A carousel, a wide table, the tab bar, a text box: the swipe is theirs. Nor a slow drag, or while zoomed in.' },
]

/**
 * Swipe between pages (in Feature Testing): on a touchscreen, a swipe sideways goes to the next or previous page. For
 * now only the signed-in admin has it; this page says how it works, with something to try the exceptions on.
 */
export function SwipeBetweenPages() {
  return (
    <div className="swipe-between-pages">
      <section aria-labelledby="swipe-how-title">
        <h4 id="swipe-how-title">How it works</h4>
        <p className="muted">On a phone or tablet, swipe sideways anywhere on a page. Only you have it for now; visitors get it once it leaves Feature Testing.</p>
        <ul className="swipe-rules">
          {RULES.map((rule) => (
            <li key={rule.title}>
              <strong>{rule.title}</strong>
              <p className="muted">{rule.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="swipe-try-title">
        <h4 id="swipe-try-title">Try it</h4>
        <p className="muted">A swipe here goes back to Work with me. On these two, it doesn’t:</p>
        <div className="swipe-strip" role="region" aria-label="A strip that scrolls sideways" tabIndex={0}>
          {['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'].map((word) => (
            <span key={word} className="swipe-strip-item">
              {word}
            </span>
          ))}
        </div>
        <div className="field">
          <label htmlFor="swipe-try-text">A text box</label>
          <input id="swipe-try-text" type="text" placeholder="Swipe in here" />
        </div>
      </section>
    </div>
  )
}
