<script setup lang="ts">
import { LayoutDashboard, Moon, Settings, ShoppingCart, Sun } from 'lucide-vue-next';
import { computed, onMounted } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

import AccountSwitcher from '@/components/AccountSwitcher.vue';
import Logo from '@/components/Logo.vue';
import { useThemePreference } from '@/lib/useThemePreference';
import { useSession } from '@/stores/session';

const route = useRoute();
const session = useSession();
const { currentTheme, toggleTheme } = useThemePreference();
const bare = computed(() => Boolean(route.meta.bare));

onMounted(() => {
  session.loadStatus().catch(() => undefined);
});
</script>

<template>
  <a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">Skip to content</a>
  <template v-if="bare || !session.user">
    <RouterView />
  </template>
  <template v-else>
    <header class="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
      <div class="mx-auto flex h-16 max-w-[1440px] items-center gap-6 px-4 sm:px-6">
        <RouterLink to="/dashboard" aria-label="ResolveOS dashboard"><Logo /></RouterLink>
        <nav class="hidden items-center gap-1 md:flex" aria-label="Main">
          <RouterLink to="/dashboard" class="btn btn-sm btn-ghost" active-class="!bg-sunken !text-ink">
            <LayoutDashboard class="size-4" /> Dashboard
          </RouterLink>
          <RouterLink v-if="session.role === 'BUYER'" to="/purchase" class="btn btn-sm btn-ghost" active-class="!bg-sunken !text-ink">
            <ShoppingCart class="size-4" /> Sandbox purchase
          </RouterLink>
          <RouterLink to="/settings" class="btn btn-sm btn-ghost" active-class="!bg-sunken !text-ink">
            <Settings class="size-4" /> Settings
          </RouterLink>
        </nav>
        <div class="ml-auto flex items-center gap-3">
          <span
            class="hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset lg:inline-flex"
            :class="session.status?.connected ? 'bg-ok-soft text-ok ring-ok-line' : 'bg-warn-soft text-warn ring-warn-line'"
            :title="session.status?.problem ?? 'PayPal sandbox connected'"
          >
            <span class="size-1.5 rounded-full bg-current" />
            {{ session.status?.adapter === 'mock' ? 'Mock PayPal (automated tests)' : `PayPal sandbox ${session.status?.connected ? 'connected' : 'not connected'}` }}
          </span>
          <button type="button" class="btn btn-secondary btn-sm" :aria-label="currentTheme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'" @click="toggleTheme"><Moon v-if="currentTheme === 'light'" class="size-4" /><Sun v-else class="size-4" /></button>
          <AccountSwitcher />
        </div>
      </div>
    </header>
    <nav class="sticky top-16 z-20 flex gap-1 overflow-x-auto border-b border-line bg-surface/90 px-3 py-2 backdrop-blur-md md:hidden" aria-label="Main (mobile)">
      <RouterLink to="/dashboard" class="btn btn-sm btn-ghost" active-class="!bg-sunken !text-ink"><LayoutDashboard class="size-4" /> Dashboard</RouterLink>
      <RouterLink v-if="session.role === 'BUYER'" to="/purchase" class="btn btn-sm btn-ghost" active-class="!bg-sunken !text-ink"><ShoppingCart class="size-4" /> Purchase</RouterLink>
      <RouterLink to="/settings" class="btn btn-sm btn-ghost" active-class="!bg-sunken !text-ink"><Settings class="size-4" /> Settings</RouterLink>
    </nav>
    <main id="main" class="mx-auto max-w-[1440px] px-4 py-8 sm:px-6">
      <RouterView :key="route.fullPath" />
    </main>
  </template>
</template>
