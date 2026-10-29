/** What the page asks of the browser itself, in one object so tests can stand in for it (a real reload would end the test). */
export const browser = {
  reload: () => window.location.reload(),
}
