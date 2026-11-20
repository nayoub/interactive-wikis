<script setup lang="ts">
definePage({
  meta: {
    // title + description: left for the author (gallery copy is never AI-generated)
    category: 'prototype',
    platform: 'web',
  },
})

/**
 * The general visual tool, on Bilbao: one Insert → Visual, one pick mode
 * (dates, places, tables, images), one curate panel and one frame; forms
 * offered by rule (src/components/viz/general/form-rules.json). San Sebastián is
 * snapshotted for the Compare operator on the population chart.
 */
import { generalExample } from '@/components/viz/general/example'
import type { ArticleSource, LoadedArticle } from '@/components/viz/host/loadArticle'
import ModulesPrototype from '@/components/viz/host/ModulesPrototype.vue'
import { createStore } from '@/components/viz/host/store'

const source: ArticleSource = {
  slug: 'bilbao',
  title: 'Bilbao',
  defaultSection: { id: 'History', title: 'History' },
  general: true,
  compare: [{ slug: 'san-sebastian', title: 'San Sebastián' }],
}
const store = createStore('protowiki-visual:v1')
const top = (sectionId: string, sectionTitle: string) => ({
  kind: 'sectionTop' as const,
  sectionId,
  sectionTitle,
})
const example = (a: LoadedArticle) =>
  generalExample(
    a,
    {
      timeline: top('History', 'History'),
      map: top('Geography', 'Geography'),
      'table-t2': top('Demographics', 'Demographics'),
      'table-t1': top('Climate', 'Climate'),
      image: top('Cityscape', 'Cityscape'),
    },
    {
      // Placed by looking at the photo; names from its caption and the article.
      image: 'Bilbao_-_Zubizuri_07',
      points: [
        { x: 0.15, y: 0.3, label: 'Isozaki Atea', sentence: 'Isozaki' },
        { x: 0.6, y: 0.5, label: 'Zubizuri footbridge', sentence: 'Zubizuri' },
        { x: 0.45, y: 0.86, label: 'Estuary of Bilbao', sentence: 'estuary' },
      ],
    },
  )
</script>

<template>
  <ModulesPrototype
    host="general"
    :kinds="['timeline']"
    :store="store"
    :source="source"
    :example="example"
  />
</template>
