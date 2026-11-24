<script setup lang="ts">
definePage({
  meta: {
    // title + description: left for the author (gallery copy is never AI-generated)
    category: 'prototype',
    platform: 'web',
  },
})

/**
 * Timeline navigation: five explorations of chronology as a way to navigate
 * an existing article (Frank Gehry, Bilbao, and an edge-case test fixture).
 * Variant, article, selected event and direction are URL parameters:
 *   /timeline-navigation?variant=contents|ruler|trail|parallel|milestones&article=frank-gehry|bilbao|test-fixture
 * Built from src/components/viz/navigate/.
 */
import TimelineNavigation from '@/components/viz/navigate/TimelineNavigation.vue'
</script>

<template>
  <TimelineNavigation />
</template>
