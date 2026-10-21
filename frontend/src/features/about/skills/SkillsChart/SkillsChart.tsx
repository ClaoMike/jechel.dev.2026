import { ColorLegend } from '../../section/ColorLegend/ColorLegend'
import { SkillBar } from '../SkillBar/SkillBar'
import { useSkillsChartViewModel, type SkillsChartProps } from './SkillsChart.viewModel'

/**
 * A timeline: one row per skill, a bar for each period it was used, coloured by what it was
 * used for (split into bands when it was several things). Each row ends with the total
 * experience. Hovering or focusing a bar shows its details; the same details are in the
 * list's text for screen readers.
 */
export function SkillsChart(props: SkillsChartProps) {
  const vm = useSkillsChartViewModel(props)

  return (
    <figure className="skills-chart">
      <ColorLegend items={vm.legend} />
      <ul aria-label="Skills, with when and how each was used">
        {vm.rows.map((row) => (
          <li key={row.key} className="skill-row">
            <span className="skill-name">{row.name}</span>
            <span className="skill-track">
              {vm.ticks.map((tick) => (
                <span key={tick.year} className="skill-gridline" style={{ left: tick.left }} aria-hidden="true" />
              ))}
              <span className="skill-now" style={{ left: vm.nowLeft }} aria-hidden="true" />
              {row.bars.map(({ key, ...bar }) => (
                <SkillBar key={key} {...bar} />
              ))}
            </span>
            <span className="skill-value">{row.experience}</span>
          </li>
        ))}
      </ul>
      <div className="skill-axis" aria-hidden="true">
        <span />
        <span className="skill-axis-ticks">
          {vm.ticks.map((tick) => (
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
