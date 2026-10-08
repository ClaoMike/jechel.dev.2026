/** A section that isn't built yet. */
export function PlaceholderPage({ title, text }: { title: string; text: string }) {
  return (
    <section className="placeholder">
      <h2>{title}</h2>
      <p>{text}</p>
    </section>
  )
}
