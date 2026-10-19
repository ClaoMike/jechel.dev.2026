import { AddButton, ItemControls, TextField, type FieldErrors } from '../about/fields/fields'
import { BulletsEditor } from '../about/BulletsSection'
import { move, removeAt, replaceAt } from '../about/list'
import type { TermsBlock, TermsContent, TermsSection } from '../../services/api'

const newParagraph = (): TermsBlock => ({ kind: 'paragraph', text: '', items: [] })
const newBullets = (): TermsBlock => ({ kind: 'bullets', text: '', items: [''] })
const newSection = (): TermsSection => ({ heading: '', blocks: [newParagraph()] })

interface TermsEditorProps {
  value: TermsContent
  onChange: (value: TermsContent) => void
  /** API field errors, keyed like "sections[0].blocks[1].items[2]". */
  errors: FieldErrors
}

/** Edits the whole document: the title, the introduction, and sections of paragraphs and bullet lists. */
export function TermsEditor({ value, onChange, errors }: TermsEditorProps) {
  const setSections = (sections: TermsSection[]) => onChange({ ...value, sections })

  return (
    <div className="terms-editor">
      <TextField label="Title" value={value.title} onChange={(title) => onChange({ ...value, title })} error={errors.title} required />
      <TextField
        label="Introduction"
        hint="Optional. Shown before the sections."
        value={value.intro}
        onChange={(intro) => onChange({ ...value, intro })}
        error={errors.intro}
        multiline
        allowLinks
      />
      {errors.sections && <p className="field-error">{errors.sections}</p>}
      {value.sections.map((section, s) => (
        <SectionEditor
          key={s}
          number={s + 1}
          count={value.sections.length}
          value={section}
          onChange={(next) => setSections(replaceAt(value.sections, s, next))}
          onMove={(from, to) => setSections(move(value.sections, from, to))}
          onRemove={() => setSections(removeAt(value.sections, s))}
          errors={errors}
        />
      ))}
      <AddButton onClick={() => setSections([...value.sections, newSection()])}>Add section</AddButton>
    </div>
  )
}

interface SectionEditorProps {
  /** 1-based, as shown on the page. */
  number: number
  count: number
  value: TermsSection
  onChange: (value: TermsSection) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
  errors: FieldErrors
}

function SectionEditor({ number, count, value, onChange, onMove, onRemove, errors }: SectionEditorProps) {
  const key = `sections[${number - 1}]`
  const setBlocks = (blocks: TermsBlock[]) => onChange({ ...value, blocks })

  return (
    <fieldset className="editor-item terms-editor-section">
      <legend>Section {number}</legend>
      <div className="editor-item-toolbar">
        <ItemControls name={`section ${number}`} index={number - 1} count={count} onMove={onMove} onRemove={onRemove} />
      </div>
      <TextField label="Heading" value={value.heading} onChange={(heading) => onChange({ ...value, heading })} error={errors[`${key}.heading`]} required />
      <div className="editor-subitems">
        {errors[`${key}.blocks`] && <p className="field-error">{errors[`${key}.blocks`]}</p>}
        {value.blocks.map((block, b) => {
          const blockKey = `${key}.blocks[${b}]`
          const name = `${block.kind === 'paragraph' ? 'paragraph' : 'bullet list'} ${b + 1} of section ${number}`
          return (
            <div key={b} className="editor-subitem" role="group" aria-label={`${block.kind === 'paragraph' ? 'Paragraph' : 'Bullet list'} ${b + 1}`}>
              <div className="terms-editor-block-header">
                <span className="field-label">{block.kind === 'paragraph' ? 'Paragraph' : 'Bullet list'}</span>
                <ItemControls name={name} index={b} count={value.blocks.length} onMove={(from, to) => setBlocks(move(value.blocks, from, to))} onRemove={() => setBlocks(removeAt(value.blocks, b))} />
              </div>
              {block.kind === 'paragraph' ? (
                <TextField
                  label={`Text of paragraph ${b + 1}`}
                  value={block.text}
                  onChange={(text) => setBlocks(replaceAt(value.blocks, b, { ...block, text }))}
                  error={errors[`${blockKey}.text`] ?? errors[`${blockKey}.kind`]}
                  multiline
                  allowLinks
                />
              ) : (
                <BulletsEditor
                  itemName="bullet point"
                  value={block.items}
                  onChange={(items) => setBlocks(replaceAt(value.blocks, b, { ...block, items }))}
                  errorFor={(i) => errors[`${blockKey}.items[${i}]`]}
                  listError={errors[`${blockKey}.items`] ?? errors[`${blockKey}.kind`]}
                />
              )}
            </div>
          )
        })}
      </div>
      <div className="terms-editor-add">
        <AddButton onClick={() => setBlocks([...value.blocks, newParagraph()])}>Add paragraph</AddButton>
        <AddButton onClick={() => setBlocks([...value.blocks, newBullets()])}>Add bullet list</AddButton>
      </div>
    </fieldset>
  )
}
