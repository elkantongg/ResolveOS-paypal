<script setup lang="ts">
import { Scale, ShoppingBag, Store } from 'lucide-vue-next';

withDefaults(defineProps<{ agent: 'BUYER' | 'MERCHANT' | 'REFEREE'; size?: 'sm' | 'md' | 'lg'; active?: boolean }>(), {
  size: 'md',
  active: false,
});
</script>

<template>
  <span
    class="relative inline-grid shrink-0 place-items-center rounded-xl ring-1 ring-inset"
    :class="[
      size === 'sm' ? 'size-8' : size === 'lg' ? 'size-12' : 'size-10',
      agent === 'BUYER'
        ? 'bg-buyer-soft text-buyer ring-primary-line'
        : agent === 'MERCHANT'
          ? 'bg-merchant-soft text-merchant ring-accent-line'
          : 'bg-referee-soft text-referee ring-line',
    ]"
    :aria-label="agent === 'BUYER' ? 'Buyer agent' : agent === 'MERCHANT' ? 'Merchant agent' : 'Orchestrator'"
  >
    <ShoppingBag v-if="agent === 'BUYER'" :class="size === 'lg' ? 'size-6' : 'size-[18px]'" />
    <Store v-else-if="agent === 'MERCHANT'" :class="size === 'lg' ? 'size-6' : 'size-[18px]'" />
    <Scale v-else :class="size === 'lg' ? 'size-6' : 'size-[18px]'" />
    <span
      v-if="active"
      class="absolute -right-1 -top-1 size-3 rounded-full ring-2 ring-white"
      :class="agent === 'MERCHANT' ? 'bg-merchant' : 'bg-buyer'"
    >
      <span class="absolute inset-0 animate-ping rounded-full" :class="agent === 'MERCHANT' ? 'bg-merchant' : 'bg-buyer'" />
    </span>
  </span>
</template>
