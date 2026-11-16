/**
 * Flags for the citizenship / residence labels, from the flag-icons package (MIT). Only the
 * URLs are in the bundle (`?no-inline`: Vite would otherwise inline the small ones as data
 * URLs); each flag's SVG is downloaded when it's shown.
 */
const files = import.meta.glob<string>('/node_modules/flag-icons/flags/4x3/*.svg', { eager: true, query: '?no-inline', import: 'default' })

/** "RO" → its flag's URL. Two-letter codes only (countries, and EU). */
const FLAG_URLS = new Map(
  Object.entries(files).flatMap(([path, url]) => {
    const code = /\/([a-z]{2})\.svg$/.exec(path)?.[1]
    return code ? [[code.toUpperCase(), url] as const] : []
  }),
)

const regionNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' })

/** The flag's URL, or undefined for no flag or an unknown code. */
export function flagUrl(code: string): string | undefined {
  return FLAG_URLS.get(code.toUpperCase())
}

/** "RO" → "Romania", "EU" → "European Union", "GB" → "United Kingdom". */
export function flagName(code: string): string {
  return regionNames.of(code.toUpperCase()) ?? code.toUpperCase()
}

/** Every flag to choose from, by name. */
export const FLAG_CHOICES: { code: string; name: string }[] = [...FLAG_URLS.keys()]
  .map((code) => ({ code, name: flagName(code) }))
  .filter(({ code, name }) => name !== code) // codes without a name are flag-icons extras, not places
  .sort((a, b) => a.name.localeCompare(b.name))

/** "Romanian citizenship" → "RO", "EU citizenship" → "EU", "UK Settled Status" → "GB"; otherwise "". Same words as the API's AboutJson.GuessFlag. */
export function guessFlag(text: string): string {
  const words = text.toLowerCase().split(/[\s,.()\-/]+/)
  for (const [flag, names] of FLAG_WORDS) if (words.some((w) => names.includes(w))) return flag
  return ''
}

const FLAG_WORDS: [string, string[]][] = [
  ['EU', ['eu', 'european']],
  ['GB', ['uk', 'british', 'britain', 'england', 'english']],
  ['RO', ['romania', 'romanian']],
  ['DK', ['denmark', 'danish']],
  ['US', ['us', 'usa', 'american']],
]
