<script setup lang="ts">
definePage({
  meta: {
    // title + description: left for the author (gallery copy is never AI-generated)
    category: 'prototype',
    platform: 'web',
  },
})

/**
 * Time ruler (B of timeline navigation), on its own page for sharing: no
 * variant or prototype switcher. Any article: `?title=<article>` (Frank Gehry
 * and Bilbao open their curated timelines; others start empty, made with
 * Edit → Insert → Timeline). Built from src/components/viz/navigate/.
 */
import TimelineNavigation from '@/components/viz/navigate/TimelineNavigation.vue'
</script>

<template>
  <TimelineNavigation standalone="ruler" />
</template>
