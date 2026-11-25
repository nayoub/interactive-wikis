<script setup lang="ts">
/**
 * A linked name exactly as the article links it: same href, same classes
 * ('new' = red link because the target page does not exist; 'mw-redirect';
 * 'external text'), opening where the article's own links open. Clicking it
 * follows the link, never navigates locally.
 */
import type { LinkRef } from './occurrences'

defineProps<{ link: LinkRef }>()
</script>

<template>
  <a
    class="tn-wl"
    :class="link.className"
    :href="link.href"
    :title="link.title"
    target="_blank"
    rel="noopener"
  ><slot>{{ link.text }}</slot></a>
</template>
