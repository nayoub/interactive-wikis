<script setup lang="ts">
/**
 * Prototype controls for timeline navigation, in the header's user menu
 * like the other article-module prototypes: which prototype, which option
 * (A–E), which article, page direction and theme. Every control is a URL
 * parameter (replace, so no history entries), so each state has a direct link.
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CdxButton, CdxField, CdxIcon, CdxRadio, CdxToggleButtonGroup } from '@wikimedia/codex'
import { cdxIconDownTriangle, cdxIconUserAvatar, cdxIconUserAvatarOutline } from '@wikimedia/codex-icons'

import SettingsPopover from '@/components/settings/SettingsPopover.vue'
import UserSettingsPanel from '@/components/settings/UserSettingsPanel.vue'
import { protowikiConfig } from '@/appearance/config-store'
import type { ConfigTheme } from '@/config'
import { globalSkin } from '@/theme'
import { HUB } from '../host/hub'
import { ARTICLE_CHOICES, msg, VARIANTS } from './messages'

const props = defineProps<{ variant: string; article: string; dir: 'ltr' | 'rtl' }>()
const route = useRoute()
const router = useRouter()
const skin = computed(() => globalSkin.value)

function setQuery(patch: Record<string, string | null>) {
  const q: Record<string, string | string[] | null> = { ...(route.query as Record<string, string>) }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete q[k]
    else q[k] = v
  }
  void router.replace({ query: q as Record<string, string> })
}

const variant = computed({
  get: () => props.variant,
  // The selected event carries over (it stays in the query).
  set: (v: string) => setQuery({ variant: v }),
})
const article = computed({
  get: () => props.article,
  set: (v: string) => setQuery({ article: v, event: null, title: null }),
})
const direction = computed({
  get: () => props.dir,
  set: (v: string) => setQuery({ dir: v === 'rtl' ? 'rtl' : null }),
})
const theme = computed({
  get: () => protowikiConfig.value.theme,
  set: (v: ConfigTheme) => (protowikiConfig.value = { ...protowikiConfig.value, theme: v }),
})
const prototype = computed({
  get: () => 'timeline-navigation',
  set: (id: string) => {
    const entry = HUB.find((h) => h.id === id)
    if (entry && entry.path !== route.path) void router.push({ path: entry.path })
  },
})
const primary = computed(() => HUB.filter((h) => !h.group))
const earlier = computed(() => HUB.filter((h) => h.group === 'earlier'))
const dirButtons = [
  { value: 'ltr', label: 'LTR' },
  { value: 'rtl', label: 'RTL' },
]
const themeButtons = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Auto' },
]
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
          class="nm__caret"
          :icon="cdxIconDownTriangle"
          size="small"
        />
      </CdxButton>
    </template>

    <template #panel="{ open }">
      <div
        v-if="open"
        class="nm settings-panel"
        role="group"
        aria-label="Prototype menu"
      >
        <div class="nm__tag">
          Prototype
        </div>

        <CdxField
          :is-fieldset="true"
          class="nm__group"
        >
          <template #label>
            {{ msg.menuVariant }}
          </template>
          <span class="nm__subhead">{{ msg.menuPass2 }}</span>
          <CdxRadio
            v-for="v in VARIANTS.filter((x) => x.group === 'pass2')"
            :key="v.id"
            v-model="variant"
            name="nm-variant"
            :input-value="v.id"
          >
            {{ v.letter }} · {{ v.label }}
          </CdxRadio>
          <span class="nm__subhead">{{ msg.menuBaselines }}</span>
          <CdxRadio
            v-for="v in VARIANTS.filter((x) => x.group === 'baseline')"
            :key="v.id"
            v-model="variant"
            name="nm-variant"
            :input-value="v.id"
          >
            {{ v.letter }} · {{ v.label }}
          </CdxRadio>
        </CdxField>

        <CdxField
          :is-fieldset="true"
          class="nm__group"
        >
          <template #label>
            {{ msg.menuArticle }}
          </template>
          <CdxRadio
            v-for="a in ARTICLE_CHOICES"
            :key="a.id"
            v-model="article"
            name="nm-article"
            :input-value="a.id"
          >
            {{ a.label }}
          </CdxRadio>
        </CdxField>

        <CdxField
          :is-fieldset="true"
          class="nm__group"
        >
          <template #label>
            View
          </template>
          <div class="nm__row">
            <span
              class="nm__label"
              aria-hidden="true"
            >{{ msg.menuDirection }}</span>
            <CdxToggleButtonGroup
              v-model="direction"
              :buttons="dirButtons"
              :aria-label="msg.menuDirection"
            />
          </div>
          <div class="nm__row">
            <span
              class="nm__label"
              aria-hidden="true"
            >{{ msg.menuTheme }}</span>
            <CdxToggleButtonGroup
              v-model="theme"
              :buttons="themeButtons"
              :aria-label="msg.menuTheme"
            />
          </div>
        </CdxField>

        <CdxField
          :is-fieldset="true"
          class="nm__group"
        >
          <template #label>
            Other prototypes
          </template>
          <CdxRadio
            v-for="h in primary"
            :key="h.id"
            v-model="prototype"
            name="nm-prototype"
            :input-value="h.id"
          >
            {{
              h.label
            }}
          </CdxRadio>
          <span
            v-if="earlier.length"
            class="nm__subhead"
          >Earlier prototypes</span>
          <CdxRadio
            v-for="h in earlier"
            :key="h.id"
            v-model="prototype"
            name="nm-prototype"
            :input-value="h.id"
          >
            {{
              h.label
            }}
          </CdxRadio>
        </CdxField>
        <!-- ProtoWiki's own user settings (mock user, language, page lists), which this menu replaces in the header. -->
        <div class="nm__protowiki">
          <UserSettingsPanel :settings-open="open" />
        </div>
      </div>
    </template>
  </SettingsPopover>
</template>

<style scoped>
.nm {
  min-width: min(20rem, calc(100vw - var(--spacing-200)));
  max-height: calc(100vh - 120px);
  overflow-y: auto;
}
.nm__tag {
  color: var(--color-subtle);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.nm__group + .nm__group {
  margin-top: var(--spacing-50);
}
.nm__group :deep(.cdx-radio) {
  margin-bottom: var(--spacing-50);
}
.nm__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-50) var(--spacing-75);
  margin-bottom: var(--spacing-50);
}
.nm__label {
  min-width: 4.5em;
}
.nm__subhead {
  display: block;
  margin: var(--spacing-50) 0 var(--spacing-25);
  color: var(--color-subtle);
  font-size: var(--font-size-small);
}
.nm__protowiki {
  margin-top: var(--spacing-75);
  padding-top: var(--spacing-75);
  border-top: var(--border-width-base) solid var(--border-color-subtle);
}
.nm__caret {
  margin-inline-start: -4px;
}
</style>
