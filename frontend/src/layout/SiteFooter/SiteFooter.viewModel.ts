import { useTerms } from '../../features/terms'

const YEAR = new Date().getFullYear()

export function useSiteFooterViewModel() {
  const { openTerms, welcomeOpen } = useTerms()
  // Hidden while the welcome popup is up: that popup has its own link to the terms.
  return { shown: !welcomeOpen, year: YEAR, openTerms }
}
