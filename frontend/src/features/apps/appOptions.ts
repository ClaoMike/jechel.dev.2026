/** Platforms the admin can switch on with one click; any other can be typed in. */
export const PLATFORM_PRESETS = ['iOS', 'Android', 'Web', 'Windows', 'macOS', 'Linux', 'PlayStation', 'Xbox', 'Nintendo Switch', 'Steam Deck']

/** Suggested while typing a link's store; anything else can be typed. */
export const STORE_SUGGESTIONS = [
  'App Store',
  'Google Play',
  'Steam',
  'PlayStation Store',
  'Microsoft Store',
  'Xbox Store',
  'Nintendo eShop',
  'Epic Games Store',
  'itch.io',
  'Mac App Store',
  'GitHub',
  'the web',
]

/** Same as the API's AppRules: a platform is added once, whatever its case. */
export const hasPlatform = (platforms: string[], platform: string) => platforms.some((p) => p.toLowerCase() === platform.trim().toLowerCase())
