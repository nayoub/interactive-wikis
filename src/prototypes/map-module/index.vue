<script setup lang="ts">
definePage({
  meta: {
    // title + description: left for the author (gallery copy is never AI-generated)
    category: 'prototype',
    platform: 'web',
  },
})

/**
 * Map module for the Visual Editor — Frank Gehry only. The timeline's sibling:
 * the same Pick and Curate, a different renderer, the same style tokens. The
 * page offers both modules so they can be compared side by side and linked.
 * Built from the shared article-modules kit in src/components/viz/.
 */
import { bothExamples } from '@/components/viz/host/examples'
import ModulesPrototype from '@/components/viz/host/ModulesPrototype.vue'
import { createStore } from '@/components/viz/host/store'

const store = createStore('protowiki-map-module:v1')
</script>

<template>
  <ModulesPrototype :kinds="['map', 'timeline']" :store="store" :example="bothExamples" />
</template>
