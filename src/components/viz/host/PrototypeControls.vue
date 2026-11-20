<script setup lang="ts">
/** Prototype-only controls. Deliberately not product UI: dashed, labelled, outside the page. */
import { computed, ref } from 'vue'
import { CdxButton, CdxIcon, CdxToggleButtonGroup, CdxToggleSwitch } from '@wikimedia/codex'
import { cdxIconClose, cdxIconSettings } from '@wikimedia/codex-icons'

import type { ModuleKind } from '../model/types'
import type { ModulesStore, PlacedModule } from './store'

const props = defineProps<{
  narrow: boolean
  store: ModulesStore
  /** Which modules the page offers (controls that only matter to one kind show only with it). */
  kinds: ModuleKind[]
  /** Builds the example modules ("Load example"). */
  example: () => Promise<Partial<Record<ModuleKind, PlacedModule>>>
}>()
const state = props.store.state

const modeButtons = [
  { value: 'read', label: 'Read' },
  { value: 'edit', label: 'Edit' },
]
const spacingButtons = [
  { value: 'proportional', label: 'Proportional' },
  { value: 'even', label: 'Even' },
]
const widthButtons = [
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Phone (390px)' },
]

const mode = computed({
  get: () => state.mode,
  set: (v) => {
    state.mode = v
    if (v === 'read') state.panelOpen = false
  },
})
const spacing = computed({ get: () => state.spacing, set: (v) => (state.spacing = v) })
const width = computed({ get: () => state.width, set: (v) => (state.width = v) })
const fallback = computed({ get: () => state.fallback, set: (v) => (state.fallback = v) })
const monochrome = computed({ get: () => state.monochrome, set: (v) => (state.monochrome = v) })

const loading = ref(false)
async function loadExample() {
  loading.value = true
  try {
    const modules = await props.example()
    state.modules = modules
    state.draft = null
    state.panelOpen = false
    state.mode = 'read'
    const first = (Object.keys(modules) as ModuleKind[])[0]
    if (first) props.store.signal(first)
  } finally {
    loading.value = false
  }
}

const open = ref(false)
const expanded = computed(() => !props.narrow || open.value)
</script>

<template>
  <div
    v-show="!(narrow && state.panelOpen && state.mode === 'edit')"
    class="pc"
    :class="{ 'pc--narrow': narrow, 'pc--open': expanded }"
  >
    <button
      v-if="narrow"
      type="button"
      class="pc__toggle"
      :aria-expanded="open"
      @click="open = !open"
    >
      <CdxIcon :icon="open ? cdxIconClose : cdxIconSettings" size="small" />
      <span>Prototype</span>
    </button>
    <div v-show="expanded" class="pc__bar" role="toolbar" aria-label="Prototype controls">
      <small class="pc__label">Prototype controls</small>
      <CdxToggleButtonGroup v-model="mode" :buttons="modeButtons" />
      <CdxButton :disabled="loading" @click="loadExample">Load example</CdxButton>
      <CdxButton weight="quiet" action="destructive" @click="store.reset()">Reset</CdxButton>
      <span v-if="kinds.includes('timeline')" class="pc__group">
        <small>Spacing</small>
        <CdxToggleButtonGroup v-model="spacing" :buttons="spacingButtons" />
      </span>
      <CdxToggleSwitch v-model="fallback">Plain list</CdxToggleSwitch>
      <CdxToggleSwitch v-if="kinds.includes('visual')" v-model="monochrome"
        >Monochrome</CdxToggleSwitch
      >
      <span v-if="!narrow" class="pc__group">
        <small>Width</small>
        <CdxToggleButtonGroup v-model="width" :buttons="widthButtons" />
      </span>
    </div>
  </div>
</template>

<style scoped>
.pc {
  position: relative;
  z-index: 200;
  font-family: var(--font-family-base);
}
.pc__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-50) var(--spacing-100);
  padding: var(--spacing-50) var(--spacing-100);
  background: var(--background-color-neutral);
  border-bottom: 2px dashed var(--border-color-base);
}
.pc__label {
  color: var(--color-subtle);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.pc__group {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-50);
}
.pc__group small {
  color: var(--color-subtle);
}
.pc__bar :deep(.cdx-toggle-switch) {
  margin: 0;
}

/* Phone-sized real viewport: a pill that opens a floating sheet of controls. */
.pc--narrow {
  position: fixed;
  left: var(--spacing-75);
  bottom: var(--spacing-75);
}
.pc--narrow .pc__bar {
  position: absolute;
  left: 0;
  bottom: calc(100% + var(--spacing-50));
  width: calc(100vw - 2 * var(--spacing-75));
  border: 2px dashed var(--border-color-base);
  border-radius: var(--border-radius-base, 2px);
  box-shadow: var(--box-shadow-large, 0 4px 16px rgba(0, 0, 0, 0.25));
}
.pc__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-25);
  padding: var(--spacing-25) var(--spacing-75);
  border: 2px dashed var(--border-color-base);
  border-radius: 999px;
  background: var(--background-color-neutral);
  color: var(--color-base);
  font: inherit;
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  cursor: pointer;
  box-shadow: var(--box-shadow-medium);
}
</style>
