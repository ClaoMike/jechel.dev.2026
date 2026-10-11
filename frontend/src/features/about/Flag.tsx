import { flagName, flagUrl } from './flags'

/** A small flag, or nothing for no flag. Decorative: the label beside it says what it is. */
export function Flag({ code }: { code: string }) {
  const url = code ? flagUrl(code) : undefined
  if (!url) return null
  return <img className="flag" src={url} alt="" title={flagName(code)} width={20} height={15} />
}
