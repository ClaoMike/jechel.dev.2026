import { useState } from 'react'
import { SKILL_USES, type AboutColors, type Skill } from '../../../../services/api'
import { currentMonth, formatPeriod } from '../../format'
import { SKILL_USE_LABELS, splitBackground } from '../../legend'
import { axisYears, chartRange, formatExperience, monthIndex, monthsUsed } from '../skills'

export interface SkillsChartProps {
  skills: Skill[]
  colors: AboutColors['skills']
  /** "Now", for a stable picture (tests); otherwise when the chart first shows. */
  now?: Date
}

/** Everything placed on the chart: the legend (only the uses that appear), a row per skill with its bars, the year ticks and "now". */
export function useSkillsChartViewModel({ skills, colors, now: fixedNow }: SkillsChartProps) {
  const [now] = useState(() => fixedNow ?? new Date())
  const range = chartRange(skills, now)
  const at = (month: number) => `${((month - range.from) / (range.to - range.from)) * 100}%`
  const years = axisYears(range)
  const ticks = years.map((year) => ({ year, left: at(year * 12) }))

  return {
    legend: SKILL_USES.filter((use) => skills.some((s) => s.periods.some((p) => p.uses.includes(use)))).map((use) => ({ key: use, label: SKILL_USE_LABELS[use], color: colors[use] })),
    ticks,
    nowLeft: at(monthIndex(currentMonth(now)) + 1),
    rows: skills.map((skill, i) => ({
      key: i,
      name: skill.name,
      experience: skill.periods.length > 0 ? formatExperience(monthsUsed(skill, now)) : '',
      bars: skill.periods.map((period, p) => {
        const left = at(monthIndex(period.start))
        const right = at(monthIndex(period.end ?? currentMonth(now)) + 1)
        return {
          key: p,
          skill: skill.name,
          uses: period.uses.map((use) => SKILL_USE_LABELS[use]).join(', '),
          when: formatPeriod(period.start, period.end, now),
          style: { left, width: `calc(${right} - ${left})`, background: splitBackground(period.uses.map((u) => colors[u]), 'bands') },
        }
      }),
    })),
  }
}
