<script setup lang="ts">
import { ArrowRight, Shield, ShoppingBag, Store } from 'lucide-vue-next';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { errorMessage } from '@/api/client';
import ErrorNotice from '@/components/ErrorNotice.vue';
import Logo from '@/components/Logo.vue';
import WelcomeCinematic from '@/components/WelcomeCinematic.vue';
import Skeleton from '@/components/Skeleton.vue';
import { useSession } from '@/stores/session';

const session = useSession();
const router = useRouter();
const route = useRoute();
const error = ref<string | null>(null);
const busy = ref<string | null>(null);
const welcomeMode = ref<'welcome' | 'launch' | null>(route.query.welcome === '1' ? 'welcome' : null);
const chosenName = ref('');
let welcomeTimeout: ReturnType<typeof setTimeout> | null = null;
let launchTimeout: ReturnType<typeof setTimeout> | null = null;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

onMounted(() => {
  session.loadAccounts().catch((e) => (error.value = errorMessage(e)));
  if (welcomeMode.value === 'welcome') {
    // Keep the existing demo sign-in flow; this is purely an arrival animation.
    welcomeTimeout = setTimeout(() => {
      welcomeMode.value = null;
      welcomeTimeout = null;
    }, reducedMotion() ? 120 : 1750);
  }
});
onBeforeUnmount(() => {
  if (welcomeTimeout) clearTimeout(welcomeTimeout);
  if (launchTimeout) clearTimeout(launchTimeout);
});

async function choose(id: string) {
  busy.value = id;
  error.value = null;
  try {
    await session.signIn(id);
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : '/dashboard';
    chosenName.value = session.accounts.find((account) => account.id === id)?.name ?? session.user?.name ?? '';
    welcomeMode.value = 'launch';
    await new Promise<void>((resolve) => {
      launchTimeout = setTimeout(() => {
        launchTimeout = null;
        resolve();
      }, reducedMotion() ? 120 : 1500);
    });
    await router.push(next);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = null;
  }
}

const roleCopy = {
  BUYER: { label: 'Buyer', text: 'Makes sandbox purchases, reports problems, approves settlements.' },
  MERCHANT: { label: 'Merchant', text: 'Northline Studio. Sets refund limits, approves settlements.' },
  OPERATOR: { label: 'Demo operator', text: 'Can watch every case. Cannot approve or move money.' },
} as const;
</script>

<template>
  <div class="grid min-h-screen place-items-center px-4 py-12">
    <WelcomeCinematic v-if="welcomeMode" :key="welcomeMode" :mode="welcomeMode" :name="chosenName" />
    <div class="w-full max-w-lg">
      <RouterLink to="/" class="mb-8 inline-block"><Logo /></RouterLink>
      <h1 class="text-2xl font-semibold tracking-tight">Choose a demo person</h1>
      <p class="mt-1 text-sm text-muted text-pretty">
        Each person is a separate server session, so a buyer’s approval can only come from the buyer. Payments run in the PayPal sandbox with test money.
      </p>
      <ErrorNotice v-if="error" :message="error" class="mt-5" />
      <div class="mt-6 space-y-3">
        <div v-if="!session.accounts.length && !error" class="card p-5"><Skeleton :lines="4" /></div>
        <button
          v-for="account in session.accounts"
          :key="account.id"
          type="button"
          class="card group flex w-full items-center gap-4 px-5 py-4 text-left transition hover:-translate-y-px hover:border-line-strong hover:shadow-[var(--shadow-lift)]"
          :disabled="busy !== null"
          @click="choose(account.id)"
        >
          <span
            class="grid size-11 shrink-0 place-items-center rounded-xl"
            :class="account.role === 'MERCHANT' ? 'bg-merchant-soft text-merchant' : account.role === 'BUYER' ? 'bg-buyer-soft text-buyer' : 'bg-referee-soft text-referee'"
          >
            <Store v-if="account.role === 'MERCHANT'" class="size-5" />
            <ShoppingBag v-else-if="account.role === 'BUYER'" class="size-5" />
            <Shield v-else class="size-5" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block font-semibold">{{ account.name }} <span class="ml-1 text-xs font-medium text-muted">{{ roleCopy[account.role].label }}</span></span>
            <span class="block text-sm text-muted">{{ roleCopy[account.role].text }}</span>
          </span>
          <ArrowRight class="size-5 text-faint transition group-hover:translate-x-0.5 group-hover:text-primary" />
        </button>
      </div>
    </div>
  </div>
</template>
