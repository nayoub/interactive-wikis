/** The forms that fit what was picked, from form-rules.json. No form is named in code here. */
import { componentsOf, type FormId, type Item } from '../model/visual'
import table from './form-rules.json'

type FormEntry = FormId | { form: FormId; when?: { measure?: string } }

export function formsFor(items: Item[]): FormId[] {
  const have = [...componentsOf(items)]
    .filter((k) => k !== 'parent')
    .sort()
    .join('+')
  const rule = (table.rules as { components: string[]; forms: FormEntry[] }[]).find(
    (r) => [...r.components].sort().join('+') === have,
  )
  if (!rule) return []
  return rule.forms.flatMap((f) => {
    if (typeof f === 'string') return [f]
    const m = f.when?.measure
    if (m && !items.every((i) => new RegExp(m, 'i').test(i.components.quantity?.measure ?? '')))
      return []
    return [f.form]
  })
}
