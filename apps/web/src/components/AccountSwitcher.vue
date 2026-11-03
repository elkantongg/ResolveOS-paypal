<script setup lang="ts">
import { ChevronDown, LogOut, ShoppingBag, Shield, Store } from 'lucide-vue-next';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { errorMessage } from '@/api/client';
import { useSession } from '@/stores/session';

/**
 * The demo's "switch person". Each choice is a real server sign-in with its own session, so a
 * buyer's approval can only ever come from the buyer's session.
 */
const session = useSession();
const router = useRouter();
const route = useRoute();
const open = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const root = ref<HTMLElement | null>(null);

async function toggle() {
  open.value = !open.value;
  if (open.value && !session.accounts.length) await session.loadAccounts().catch(() => undefined);
}

async function switchTo(userId: string) {
  busy.value = true;
  error.value = null;
  try {
    await session.signIn(userId);
    open.value = false;
    // Re-run the current page's data loading as the new person.
    await router.replace({ path: route.path, query: { ...route.query, as: userId.slice(0, 6) } });
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

async function signOut() {
  await session.signOut();
  open.value = false;
  await router.push('/signin');
}

function onDocClick(event: MouseEvent) {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false;
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false;
}
onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onKey);
});

const roleLabel = { BUYER: 'Buyer', MERCHANT: 'Merchant', OPERATOR: 'Demo operator' } as const;
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="flex items-center gap-2.5 rounded-xl border border-line bg-surface py-1.5 pl-1.5 pr-3 text-left transition hover:border-line-strong"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="toggle"
    >
      <span
        class="grid size-8 place-items-center rounded-lg"
        :class="session.role === 'MERCHANT' ? 'bg-merchant-soft text-merchant' : session.role === 'BUYER' ? 'bg-buyer-soft text-buyer' : 'bg-referee-soft text-referee'"
      >
        <Store v-if="session.role === 'MERCHANT'" class="size-4" />
        <ShoppingBag v-else-if="session.role === 'BUYER'" class="size-4" />
        <Shield v-else class="size-4" />
      </span>
      <span class="hidden leading-tight sm:block">
        <span class="block text-sm font-semibold">{{ session.user?.name }}</span>
        <span class="block text-xs text-muted">{{ session.role ? roleLabel[session.role] : '' }}{{ session.me?.merchant ? ` · ${session.me.merchant.businessName}` : '' }}</span>
      </span>
      <ChevronDown class="size-4 text-muted" />
    </button>

    <div
      v-if="open"
      role="menu"
      class="absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-lift)]"
    >
      <p class="eyebrow px-4 pb-1 pt-3">Switch demo person</p>
      <p class="px-4 pb-2 text-xs text-muted">Each is a separate signed-in session.</p>
      <button
        v-for="account in session.accounts"
        :key="account.id"
        role="menuitem"
        type="button"
        :disabled="busy || account.id === session.user?.id"
        class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-sunken disabled:cursor-default disabled:opacity-60"
        @click="switchTo(account.id)"
      >
        <span
          class="grid size-7 place-items-center rounded-lg"
          :class="account.role === 'MERCHANT' ? 'bg-merchant-soft text-merchant' : account.role === 'BUYER' ? 'bg-buyer-soft text-buyer' : 'bg-referee-soft text-referee'"
        >
          <Store v-if="account.role === 'MERCHANT'" class="size-3.5" />
          <ShoppingBag v-else-if="account.role === 'BUYER'" class="size-3.5" />
          <Shield v-else class="size-3.5" />
        </span>
        <span class="flex-1">
          <span class="block font-medium">{{ account.name }}</span>
          <span class="block text-xs text-muted">{{ roleLabel[account.role] }}</span>
        </span>
        <span v-if="account.id === session.user?.id" class="text-xs font-semibold text-primary">Current</span>
      </button>
      <p v-if="error" class="px-4 py-2 text-xs text-danger">{{ error }}</p>
      <button type="button" class="flex w-full items-center gap-2 border-t border-line px-4 py-2.5 text-sm text-ink-soft hover:bg-sunken" @click="signOut">
        <LogOut class="size-4" /> Sign out
      </button>
    </div>
  </div>
</template>
