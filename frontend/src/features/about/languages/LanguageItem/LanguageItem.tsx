import type { LanguageView } from '../LanguagesSection/LanguagesSection.viewModel'

/** A language: its name, its level as steps (decoration), and as a word. */
export function LanguageItem({ language }: { language: LanguageView }) {
  return (
    <li className="language">
      <span className="language-name">{language.name}</span>
      <span className="language-steps" aria-hidden="true">
        {language.steps.map((on, s) => (
          <span key={s} className={on ? 'language-step language-step-on' : 'language-step'} />
        ))}
      </span>
      <span className="language-level">{language.level}</span>
    </li>
  )
}
