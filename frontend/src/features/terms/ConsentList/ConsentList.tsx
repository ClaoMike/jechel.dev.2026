export interface Consent {
  text: string
  ticked: boolean
  setTicked: (ticked: boolean) => void
}

/** What a visitor confirms before using the site: a checkbox each. */
export function ConsentList({ consents }: { consents: Consent[] }) {
  return (
    <fieldset className="terms-consents">
      <legend className="visually-hidden">{consents.length === 1 ? 'Confirm this' : 'Confirm each of these'}</legend>
      {consents.map((consent) => (
        <label key={consent.text} className="terms-consent">
          <input type="checkbox" checked={consent.ticked} onChange={(event) => consent.setTicked(event.target.checked)} />
          <span>{consent.text}</span>
        </label>
      ))}
    </fieldset>
  )
}
