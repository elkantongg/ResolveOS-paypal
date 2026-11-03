<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next';

defineProps<{ message: string; title?: string }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <div role="alert" class="flex items-start gap-3 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger">
    <AlertTriangle class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <p v-if="title" class="font-semibold">{{ title }}</p>
      <p class="text-pretty">{{ message }}</p>
    </div>
    <button v-if="$attrs.onRetry" type="button" class="btn btn-sm btn-danger" @click="$emit('retry')">Retry</button>
  </div>
</template>
