/** "Load example" and "Reset", shared by the prototype menu and URL parameters. */
import type { ModuleKind } from '../model/types'
import type { ModulesStore, PlacedModule } from './store'

export async function loadExample(
  store: ModulesStore,
  example: () => Promise<Partial<Record<ModuleKind, PlacedModule>>>,
) {
  const state = store.state
  const modules = await example()
  // The general tool's example comes as `visuals` (any number), the others' as one module per kind.
  const { visuals, ...perKind } = modules as typeof modules & { visuals?: typeof state.visuals }
  state.modules = perKind
  state.visuals = visuals ?? []
  state.vdraft = null
  state.draft = null
  state.panelOpen = false
  state.mode = 'read'
  state.fromExample = true
  const first = (Object.keys(modules) as ModuleKind[])[0]
  if (first) store.signal(first)
}

export function resetPrototype(store: ModulesStore) {
  store.reset()
}
