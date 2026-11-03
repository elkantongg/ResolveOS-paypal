<script setup lang="ts">
withDefaults(defineProps<{ lines?: number }>(), { lines: 3 });
</script>

<template>
  <div class="animate-pulse space-y-3" aria-hidden="true">
    <div v-for="i in lines" :key="i" class="h-4 rounded-md bg-sunken" :style="{ width: `${92 - ((i * 17) % 40)}%` }" />
  </div>
</template>
