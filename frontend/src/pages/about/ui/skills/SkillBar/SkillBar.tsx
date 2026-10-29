import type { CSSProperties } from 'react'

export interface SkillBarProps {
  skill: string
  /** "Work, Personal". */
  uses: string
  /** "Mar 2020 – now (4 years)". */
  when: string
  /** Where it sits on the track, and its colour bands. */
  style: CSSProperties
}

/** One period of a skill on the chart; hovering or focusing it shows the details. */
export function SkillBar({ skill, uses, when, style }: SkillBarProps) {
  return (
    <span className="skill-bar" style={style} tabIndex={0}>
      <span className="skill-tooltip" role="tooltip">
        <strong>{skill}</strong> {uses}
        <br />
        {when}
      </span>
      <span className="visually-hidden">
        : {uses}, {when}
      </span>
    </span>
  )
}
