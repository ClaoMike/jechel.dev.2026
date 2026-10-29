/** A licence's text: its code in bold (when it has one), then what it's for. */
export function LicenceLabel({ code, name }: { code: string; name: string }) {
  return (
    <>
      {code && <strong className="licence-code">{code}</strong>}
      {name}
    </>
  )
}
