<script setup lang="ts">
/**
 * A prototype page for article modules: the prototype control strip, and the
 * article (or, at "Phone (390px)", the same route in a real 390px iframe with
 * `?embed=1`; the two documents share state through localStorage, so fixed
 * toolbars, bottom sheets and Minerva behave as on a phone).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { ModuleKind } from '../model/types'
import ArticleModules from './ArticleModules.vue'
import { loadArticle, type LoadedArticle } from './loadArticle'
import PrototypeControls from './PrototypeControls.vue'
import type { ModulesStore, PlacedModule } from './store'

const props = defineProps<{
  kinds: ModuleKind[]
  store: ModulesStore
  example: (article: LoadedArticle) => Partial<Record<ModuleKind, PlacedModule>>
}>()

const route = useRoute()
const router = useRouter()
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

const showFrame = computed(() => !embedded && !narrow.value && props.store.state.width === 'mobile')
// Through the router, so the app's base path (e.g. /interactive-wikis/ on Pages) is included.
const frameSrc = computed(() => router.resolve({ path: route.path, query: { embed: '1' } }).href)
const buildExample = async () => props.example(await loadArticle())
</script>

<template>
  <div class="tm" :class="{ 'tm--framed': showFrame }">
    <PrototypeControls v-if="!embedded" :narrow="narrow" :store="store" :example="buildExample" />
    <div v-if="showFrame" class="tm__stage">
      <iframe class="tm__device" :src="frameSrc" title="Phone-width preview (390px)" />
    </div>
    <ArticleModules
      v-else
      :kinds="kinds"
      :store="store"
      :force-skin="embedded ? 'mobile' : undefined"
    />
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
