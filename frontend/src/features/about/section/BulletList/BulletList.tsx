import { RichText } from '../../RichText'

/** Bullet points (with links), or nothing when there are none. */
export function BulletList({ bullets }: { bullets: string[] }) {
  if (bullets.length === 0) return null
  return (
    <ul className="bullets">
      {bullets.map((bullet, i) => (
        <li key={i}>
          <RichText text={bullet} />
        </li>
      ))}
    </ul>
  )
}
