<script setup lang="ts">
/**
 * Shell for "pick from the article, then curate": a sidebar on desktop, a
 * bottom sheet with a peek state on mobile. Knows nothing about timelines.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { CdxButton, CdxIcon } from '@wikimedia/codex'
import { cdxIconClose, cdxIconCollapse, cdxIconExpand } from '@wikimedia/codex-icons'

const props = defineProps<{
  skin: 'desktop' | 'mobile'
  title: string
  /** Running count, always visible. */
  count: number
  countLabel: string
  hint?: string
}>()

const expanded = defineModel<boolean>('expanded', { default: false })
const emit = defineEmits<{ close: [] }>()

function toggle() {
  if (props.skin === 'mobile') expanded.value = !expanded.value
}

// Desktop: a sticky sidebar that always fits the viewport, so its footer
// (Insert) is visible even before the page scrolls it into its stuck position.
const asideRef = ref<HTMLElement | null>(null)
const visibleHeight = ref<string | undefined>(undefined)
function measure() {
  if (props.skin !== 'desktop' || !asideRef.value) return (visibleHeight.value = undefined)
  const top = Math.max(0, asideRef.value.getBoundingClientRect().top)
  visibleHeight.value = `${window.innerHeight - top}px`
}
onMounted(() => {
  measure()
  window.addEventListener('scroll', measure, { passive: true })
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', measure)
  window.removeEventListener('resize', measure)
})
</script>

<template>
  <aside
    ref="asideRef"
    :style="{ height: visibleHeight }"
    class="cp"
    :class="[`cp--${skin}`, { 'cp--expanded': skin === 'desktop' || expanded }]"
    :aria-label="title"
  >
    <header class="cp__header">
      <button
        v-if="skin === 'mobile'"
        type="button"
        class="cp__peek"
        :aria-expanded="expanded"
        @click="toggle"
      >
        <span class="cp__heading">
          <span class="cp__title">{{ title }}</span>
          <span class="cp__count" aria-live="polite">{{ countLabel }}</span>
        </span>
        <small v-if="hint && !expanded" class="cp__hint">{{ hint }}</small>
        <CdxIcon class="cp__chevron" :icon="expanded ? cdxIconExpand : cdxIconCollapse" />
      </button>
      <template v-else>
        <span class="cp__heading">
          <span class="cp__title">{{ title }}</span>
          <span class="cp__count" aria-live="polite">{{ countLabel }}</span>
        </span>
        <CdxButton weight="quiet" aria-label="Close" @click="emit('close')">
          <CdxIcon :icon="cdxIconClose" />
        </CdxButton>
      </template>
    </header>
    <div v-show="skin === 'desktop' || expanded" class="cp__body">
      <slot />
    </div>
    <footer v-show="skin === 'desktop' || expanded" class="cp__footer">
      <slot name="footer" />
    </footer>
  </aside>
</template>

<style scoped>
.cp {
  display: flex;
  flex-direction: column;
  background: var(--background-color-base);
  color: var(--color-base);
  font-family: var(--font-family-base);
  z-index: 80;
}

.cp--desktop {
  position: sticky;
  top: 0;
  align-self: flex-start;
  flex: none;
  width: 380px;
  height: 100vh;
  border-inline-start: var(--border-width-base, 1px) solid var(--border-color-subtle);
  box-sizing: border-box;
}

.cp--mobile {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  max-height: 82vh;
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.18);
}
.cp--mobile.cp--expanded {
  height: 82vh;
}

.cp__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-50);
  padding: var(--spacing-75) var(--spacing-100);
  border-bottom: var(--border-width-base, 1px) solid var(--border-color-subtle);
}
.cp--mobile .cp__header {
  padding: 0;
}

.cp__peek {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  width: 100%;
  min-height: 64px;
  padding: var(--spacing-75) var(--spacing-100);
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.cp__peek::before {
  content: '';
  position: absolute;
  top: 6px;
  left: calc(50% - 18px);
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--border-color-subtle);
}
.cp__peek .cp__hint {
  grid-column: 1;
  color: var(--color-subtle);
}
.cp__chevron {
  grid-column: 2;
  grid-row: 1 / span 2;
}

.cp__heading {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-75);
}

/* Heading 4 */
.cp__title {
  font-size: var(--font-size-large);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-large);
}

/* Small */
.cp__count {
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  color: var(--color-progressive);
}

.cp__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.cp__footer {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-75);
  padding: var(--spacing-75) var(--spacing-100);
  border-top: var(--border-width-base, 1px) solid var(--border-color-subtle);
  background: var(--background-color-base);
}
.cp--mobile .cp__footer {
  padding-bottom: max(var(--spacing-75), env(safe-area-inset-bottom));
}
</style>
