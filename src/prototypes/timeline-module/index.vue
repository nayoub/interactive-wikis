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
 * Built from the shared article-modules kit in src/components/viz/.
 */
import { timelineExample } from '@/components/viz/host/examples'
import ModulesPrototype from '@/components/viz/host/ModulesPrototype.vue'
import { createStore } from '@/components/viz/host/store'

const store = createStore('protowiki-timeline-module:v1')
</script>

<template>
  <ModulesPrototype :kinds="['timeline']" :store="store" :example="timelineExample" />
</template>
