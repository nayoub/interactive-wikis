<script setup lang="ts">
definePage({
  meta: {
    // title + description: left for the author (gallery copy is never AI-generated)
    category: 'prototype',
    platform: 'web',
  },
})

/**
 * Election module for the Visual Editor — 2025 German federal election only.
 * Insert → Visual: pick the results table, check what each column is, choose a
 * form that fits (seat diagram, with earlier elections, or bars), order and
 * group the parties. Earlier elections (2021, 2017) come from their own
 * snapshotted articles. The timeline and map are offered too, so the three
 * modules can be placed together. Built from the shared kit in src/components/viz/.
 */
import { electionExample } from '@/components/viz/host/examples'
import type { ArticleSource } from '@/components/viz/host/loadArticle'
import ModulesPrototype from '@/components/viz/host/ModulesPrototype.vue'
import { createStore } from '@/components/viz/host/store'

const source: ArticleSource = {
  slug: 'german-federal-election-2025',
  title: '2025 German federal election',
  defaultSection: { id: 'Results', title: 'Results' },
  previous: [
    { slug: 'german-federal-election-2021', title: '2021 German federal election' },
    { slug: 'german-federal-election-2017', title: '2017 German federal election' },
  ],
}
const store = createStore('protowiki-election-module:v1')
</script>

<template>
  <ModulesPrototype
    :kinds="['visual', 'timeline', 'map']"
    :store="store"
    :source="source"
    :example="electionExample"
  />
</template>
