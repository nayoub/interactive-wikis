<script setup lang="ts">
/**
 * The prototype's controls, in the menu that opens from the user icon in the
 * header (desktop and phone): which prototype, Load example / Reset, the view
 * (width, plain list), and the options that apply to this prototype. Read and
 * Edit are the article's own tabs. Codex components only; keyboard accessible.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  CdxButton,
  CdxField,
  CdxIcon,
  CdxRadio,
  CdxToggleButtonGroup,
  CdxToggleSwitch,
} from '@wikimedia/codex'
import {
  cdxIconDownTriangle,
  cdxIconUserAvatar,
  cdxIconUserAvatarOutline,
} from '@wikimedia/codex-icons'

import SettingsPopover from '@/components/settings/SettingsPopover.vue'
import type { ModuleKind } from '../model/types'
import { HUB, hub, type HubId } from './hub'
import { loadExample, resetPrototype } from './prototypeActions'
import type { ModulesStore, PlacedModule } from './store'

const props = defineProps<{
  current: HubId
  kinds: ModuleKind[]
  store: ModulesStore
  example: () => Promise<Partial<Record<ModuleKind, PlacedModule>>>
  /** Header style of the trigger. */
  skin: 'desktop' | 'mobile'
}>()
const state = props.store.state
const router = useRouter()

// ── Prototype ──────────────────────────────────────────────────────────────
const prototype = computed({
  get: () => props.current,
  set: (id: HubId) => {
    const entry = HUB.find((h) => h.id === id)
    if (!entry || id === props.current) return
    // Width and plain list carry over (they live in the hub); module options do not.
    const query: Record<string, string> = {}
    if (hub.width === 'mobile') query.width = 'phone'
    if (hub.fallback) query.plain = '1'
    const target = router.resolve({ path: entry.path, query }).href
    // Inside the phone frame, switch the whole page, not just the frame.
    if (window.top && window.top !== window) window.top.location.href = target
    else void router.push({ path: entry.path, query })
  },
})
const loading = ref(false)
async function onLoadExample(close: () => void) {
  loading.value = true
  try {
    await loadExample(props.store, props.example)
    close()
  } finally {
    loading.value = false
  }
}
function onReset(close: () => void) {
  resetPrototype(props.store)
  close()
}

// ── View ───────────────────────────────────────────────────────────────────
const widthButtons = [
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Phone (390px)' },
]
const width = computed({ get: () => hub.width, set: (v) => (hub.width = v) })
const fallback = computed({ get: () => hub.fallback, set: (v) => (hub.fallback = v) })

// ── Options for this prototype ─────────────────────────────────────────────
const spacingButtons = [
  { value: 'proportional', label: 'Proportional' },
  { value: 'even', label: 'Even' },
]
const spacing = computed({ get: () => state.spacing, set: (v) => (state.spacing = v) })
const monochrome = computed({ get: () => state.monochrome, set: (v) => (state.monochrome = v) })
/** The map's own "Shade by date", on the placed map (and the draft, if the map is open). */
const shade = computed({
  get: () => !!state.modules.map?.data.options.shadeByDate,
  set: (v: boolean) => {
    const placed = state.modules.map
    if (placed) {
      state.modules = {
        ...state.modules,
        map: {
          ...placed,
          data: { ...placed.data, options: { ...placed.data.options, shadeByDate: v } },
        },
      }
    }
    if (state.draft?.kind === 'map') state.draft.options.shadeByDate = v
  },
})
const has = (k: ModuleKind) => props.kinds.includes(k)
const hasOptions = computed(() => has('timeline') || has('visual') || has('map'))
</script>

<template>
  <SettingsPopover>
    <template #default="{ toggle, open }">
      <CdxButton
        weight="quiet"
        :size="skin === 'mobile' ? 'large' : 'medium'"
        aria-label="Prototype menu"
        aria-haspopup="dialog"
        :aria-expanded="open"
        @click="toggle"
      >
        <CdxIcon
          :icon="skin === 'mobile' ? cdxIconUserAvatarOutline : cdxIconUserAvatar"
          :size="skin === 'mobile' ? 'medium' : undefined"
        />
        <CdxIcon
          v-if="skin === 'desktop'"
          class="pm__caret"
          :icon="cdxIconDownTriangle"
          size="small"
        />
      </CdxButton>
    </template>

    <template #panel="{ open, close }">
      <div v-if="open" class="pm settings-panel" role="group" aria-label="Prototype menu">
        <div class="pm__tag">Prototype</div>

        <CdxField :is-fieldset="true" class="pm__group">
          <template #label>Prototype</template>
          <CdxRadio
            v-for="h in HUB"
            :key="h.id"
            v-model="prototype"
            name="pm-prototype"
            :input-value="h.id"
            >{{ h.label }}</CdxRadio
          >
          <div class="pm__actions">
            <CdxButton :disabled="loading" @click="onLoadExample(close)">Load example</CdxButton>
            <CdxButton action="destructive" weight="quiet" @click="onReset(close)">Reset</CdxButton>
          </div>
        </CdxField>

        <CdxField :is-fieldset="true" class="pm__group">
          <template #label>View</template>
          <div class="pm__row">
            <span class="pm__label" aria-hidden="true">Width</span>
            <CdxToggleButtonGroup v-model="width" :buttons="widthButtons" aria-label="Width" />
          </div>
          <CdxToggleSwitch v-model="fallback" align-switch>Plain list</CdxToggleSwitch>
          <small v-if="width === 'mobile'" class="pm__hint">Esc returns to Desktop.</small>
        </CdxField>

        <CdxField v-if="hasOptions" :is-fieldset="true" class="pm__group">
          <template #label>Options for this prototype</template>
          <div v-if="has('timeline')" class="pm__row">
            <span class="pm__label" aria-hidden="true">Spacing</span>
            <CdxToggleButtonGroup
              v-model="spacing"
              :buttons="spacingButtons"
              aria-label="Timeline spacing"
            />
          </div>
          <CdxToggleSwitch v-if="has('visual')" v-model="monochrome" align-switch
            >Monochrome</CdxToggleSwitch
          >
          <CdxToggleSwitch
            v-if="has('map')"
            v-model="shade"
            :disabled="!state.modules.map && state.draft?.kind !== 'map'"
            align-switch
            >Shade by date</CdxToggleSwitch
          >
        </CdxField>
      </div>
    </template>
  </SettingsPopover>
</template>

<style scoped>
.pm {
  min-width: min(20rem, calc(100vw - var(--spacing-200)));
}
.pm__tag {
  color: var(--color-subtle);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.pm__group + .pm__group {
  margin-top: var(--spacing-50);
}
.pm__group :deep(.cdx-radio),
.pm__group :deep(.cdx-toggle-switch) {
  margin-bottom: var(--spacing-50);
}
.pm__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-50);
  margin-top: var(--spacing-25);
}
.pm__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-50) var(--spacing-75);
  margin-bottom: var(--spacing-50);
}
.pm__label {
  min-width: 4.5em;
  color: var(--color-base);
}
.pm__hint {
  color: var(--color-subtle);
}
.pm__caret {
  margin-inline-start: -4px;
}
</style>
