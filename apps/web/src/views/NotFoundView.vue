
<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="grid min-h-[60vh] place-items-center text-center">
    <div>
      <p class="mono text-muted">404</p>
      <h1 class="mt-2 text-2xl font-semibold">This page does not exist</h1>
      <RouterLink to="/dashboard" class="btn btn-primary mt-6">Go to dashboard</RouterLink>
    </div>
  </div>
</template>
