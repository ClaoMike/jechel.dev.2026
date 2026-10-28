import { strings } from '../../strings'

/** Platforms the admin can switch on with one click; any other can be typed in. */
export const PLATFORM_PRESETS = [
  'iOS',
  strings.appOptions.android,
  strings.appOptions.web,
  strings.appOptions.windows,
  'macOS',
  strings.appOptions.linux,
  'PlayStation',
  strings.appOptions.xbox,
  strings.appOptions.nintendoSwitch,
  strings.appOptions.steamDeck,
]

/** Suggested while typing a link's store; anything else can be typed. */
export const STORE_SUGGESTIONS = [
  strings.appOptions.appStore,
  strings.appOptions.googlePlay,
  strings.appOptions.steam,
  strings.appOptions.playstationStore,
  strings.appOptions.microsoftStore,
  strings.appOptions.xboxStore,
  strings.appOptions.nintendoEshop,
  strings.appOptions.epicGamesStore,
  'itch.io',
  strings.appOptions.macAppStore,
  'GitHub',
  strings.appOptions.web2,
]

/** Same as the API's AppRules: a platform is added once, whatever its case. */
export const hasPlatform = (platforms: string[], platform: string) => platforms.some((p) => p.toLowerCase() === platform.trim().toLowerCase())
