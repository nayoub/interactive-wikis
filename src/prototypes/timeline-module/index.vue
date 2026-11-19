<script setup lang="ts">
definePage({
  meta: {
    // title + description: left for the author (gallery copy is never AI-generated)
    category: 'prototype',
    platform: 'web',
  },
})

/**
 * Timeline module for the Visual Editor — Frank Gehry only.
 *
 * Phone width is a real 390px viewport: the page loads itself in an iframe
 * (`?embed=1`) and the two documents share state through localStorage, so
 * fixed toolbars, bottom sheets and Minerva behave as on a phone.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import PrototypeControls from './PrototypeControls.vue'
import TimelineArticle from './TimelineArticle.vue'
import { state } from './store'

const route = useRoute()
const embedded = route.query.embed === '1'

const narrow = ref(false)
let mql: MediaQueryList | null = null
const onChange = () => (narrow.value = !!mql?.matches)
onMounted(() => {
  mql = window.matchMedia('(max-width: 639px)')
  onChange()
  mql.addEventListener('change', onChange)
})
onBeforeUnmount(() => mql?.removeEventListener('change', onChange))

const showFrame = computed(() => !embedded && !narrow.value && state.width === 'mobile')
const frameSrc = computed(() => `${route.path}?embed=1`)
</script>

<template>
  <div class="tm" :class="{ 'tm--framed': showFrame }">
    <PrototypeControls v-if="!embedded" :narrow="narrow" />
    <div v-if="showFrame" class="tm__stage">
      <iframe class="tm__device" :src="frameSrc" title="Phone-width preview (390px)" />
    </div>
    <TimelineArticle v-else :force-skin="embedded ? 'mobile' : undefined" />
  </div>
</template>

<style scoped>
.tm--framed {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.tm__stage {
  flex: 1;
  min-height: 0;
  display: flex;
  justify-content: center;
  padding: var(--spacing-150) var(--spacing-100);
  background: var(--background-color-neutral);
}
.tm__device {
  width: 390px;
  height: min(844px, 100%);
  border: 0;
  border-radius: 24px;
  background: var(--background-color-base);
  box-shadow:
    0 0 0 10px var(--color-base),
    0 12px 40px rgba(0, 0, 0, 0.3);
}
</style>
