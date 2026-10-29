import { useState } from 'react'
import { SKILL_USES, type AboutColors, type Skill } from '@/shared/api'
import { currentMonth, formatPeriod } from '@/shared/lib/format'
import { SKILL_USE_LABELS, splitBackground } from '../../../lib/legend'
import { ColorLegend } from '../../section/ColorLegend/ColorLegend'
import { SkillBar } from '../SkillBar/SkillBar'
import { axisYears, chartRange, formatExperience, monthIndex, monthsUsed } from '../../../lib/skills'
import { strings } from '@/shared/i18n'

export interface SkillsChartProps {
  skills: Skill[]
  colors: AboutColors['skills']
  /** "Now", for a stable picture (tests); otherwise when the chart first shows. */
  now?: Date
}

/**
 * A timeline: one row per skill, a bar for each period it was used, coloured by what it was
 * used for (split into bands when it was several things). Each row ends with the total
 * experience. Hovering or focusing a bar shows its details; the same details are in the
 * list's text for screen readers. The legend has only the uses that appear.
 */
export function SkillsChart({ skills, colors, now: fixedNow }: SkillsChartProps) {
  const [now] = useState(() => fixedNow ?? new Date())
  const range = chartRange(skills, now)
  const at = (month: number) => `${((month - range.from) / (range.to - range.from)) * 100}%`
  const ticks = axisYears(range).map((year) => ({ year, left: at(year * 12) }))
  const legend = SKILL_USES.filter((use) => skills.some((s) => s.periods.some((p) => p.uses.includes(use)))).map((use) => ({
    key: use,
    label: SKILL_USE_LABELS[use],
    color: colors[use],
  }))

  return (
    <figure className="skills-chart">
      <ColorLegend items={legend} />
      <ul aria-label={strings.skillsChart.skillsWhenHowEach}>
        {skills.map((skill, i) => (
          <li key={i} className="skill-row">
            <span className="skill-name">{skill.name}</span>
            <span className="skill-track">
              {ticks.map((tick) => (
                <span key={tick.year} className="skill-gridline" style={{ left: tick.left }} aria-hidden="true" />
              ))}
              <span className="skill-now" style={{ left: at(monthIndex(currentMonth(now)) + 1) }} aria-hidden="true" />
              {skill.periods.map((period, p) => {
                const left = at(monthIndex(period.start))
                const right = at(monthIndex(period.end ?? currentMonth(now)) + 1)
                return (
                  <SkillBar
                    key={p}
                    skill={skill.name}
                    uses={period.uses.map((use) => SKILL_USE_LABELS[use]).join(', ')}
                    when={formatPeriod(period.start, period.end, now)}
                    style={{
                      left,
                      width: `calc(${right} - ${left})`,
                      background: splitBackground(
                        period.uses.map((u) => colors[u]),
                        'bands',
                      ),
                    }}
                  />
                )
              })}
            </span>
            <span className="skill-value">{skill.periods.length > 0 ? formatExperience(monthsUsed(skill, now)) : ''}</span>
          </li>
        ))}
      </ul>
      <div className="skill-axis" aria-hidden="true">
        <span />
        <span className="skill-axis-ticks">
          {ticks.map((tick) => (
            <span key={tick.year} style={{ left: tick.left }}>
              {tick.year}
            </span>
          ))}
        </span>
        <span />
      </div>
    </figure>
  )
}
