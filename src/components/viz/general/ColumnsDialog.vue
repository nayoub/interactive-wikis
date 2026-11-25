<script setup lang="ts">
/** "Adjust columns": the column editor, for the rare table the tool reads wrong. */
import { computed } from 'vue'
import { CdxDialog, CdxSelect } from '@wikimedia/codex'

import type { ParsedTable } from '../pick/tables'
import { proposeGeneralRoles, type GeneralRole } from '../pick/toItems'

const props = defineProps<{ table: ParsedTable | null; roles: GeneralRole[] }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ role: [col: number, role: GeneralRole] }>()

const LABEL: Record<GeneralRole, string> = {
  time: 'Time',
  category: 'Category',
  quantity: 'Quantity',
  ignore: 'Not used',
}
const items = (Object.keys(LABEL) as GeneralRole[]).map((r) => ({ value: r, label: LABEL[r] }))
const reasons = computed(() =>
  props.table ? proposeGeneralRoles(props.table).map((r) => r.reason) : [],
)
</script>

<template>
  <CdxDialog v-model:open="open" title="Adjust columns" :use-close-button="true" class="cd">
    <p class="cd__intro">
      What each column of the table is. The figure follows as you change them.
    </p>
    <ol v-if="table" class="cd__cols">
      <li v-for="(h, i) in table.headers" :key="i" class="cd__col">
        <div class="cd__head">
          <span>{{ h || `Column ${i + 1}` }}</span>
          <small>{{ reasons[i] }}</small>
        </div>
        <CdxSelect
          class="cd__role"
          :selected="roles[i]"
          :menu-items="items"
          :aria-label="`${h || `Column ${i + 1}`}: what it is`"
          @update:selected="emit('role', i, $event as GeneralRole)"
        />
      </li>
    </ol>
  </CdxDialog>
</template>

<style scoped>
.cd__intro {
  margin: 0 0 var(--spacing-75);
  color: var(--color-subtle);
}
.cd__cols {
  list-style: none;
  margin: 0;
  padding: 0;
}
.cd__col {
  display: flex;
  align-items: center;
  gap: var(--spacing-75);
  padding-block: var(--spacing-25);
}
.cd__head {
  flex: 1;
  min-width: 0;
}
.cd__head > * {
  display: block;
  overflow-wrap: anywhere;
}
.cd__head small {
  color: var(--color-subtle);
}
.cd__role {
  flex: none;
  width: 9.5em;
  min-width: 0;
}
.cd__role :deep(.cdx-select-vue__handle) {
  min-width: 0;
}
</style>
