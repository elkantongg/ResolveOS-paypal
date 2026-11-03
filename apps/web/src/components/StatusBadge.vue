<script setup lang="ts">
import type { CaseStatus } from '@/api/types';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/format';

import Badge from './Badge.vue';

defineProps<{ status: CaseStatus }>();
</script>

<template>
  <Badge :tone="STATUS_TONE[status]" dot>{{ STATUS_LABEL[status] }}</Badge>
</template>
