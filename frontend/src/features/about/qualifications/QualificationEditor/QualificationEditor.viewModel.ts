import type { Qualification } from '../../../../services/api'

export interface QualificationEditorProps {
  index: number
  count: number
  item: Qualification
  errors: { title?: string; issuer?: string; obtained?: string; grade?: string }
  onChange: (item: Qualification) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}

/** One qualification's fields. */
export function useQualificationEditorViewModel({ index, item, onChange }: QualificationEditorProps) {
  const set = (patch: Partial<Qualification>) => onChange({ ...item, ...patch })
  return {
    legend: `Qualification ${index + 1}`,
    name: `qualification ${index + 1}`,
    obtained: item.obtained ?? '',
    setTitle: (title: string) => set({ title }),
    setIssuer: (issuer: string) => set({ issuer }),
    setObtained: (obtained: string) => set({ obtained }),
    setGrade: (grade: string) => set({ grade }),
  }
}
