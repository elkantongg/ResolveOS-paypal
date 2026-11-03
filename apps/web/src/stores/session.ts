import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { ApiError, api, setCsrfToken } from '@/api/client';
import type { Me, PayPalStatus, User } from '@/api/types';

/**
 * Who is signed in. Switching between the demo buyer and merchant is a real sign-out and sign-in
 * on the server (a new session and CSRF token), so the UI never acts with someone else's rights.
 */
export const useSession = defineStore('session', () => {
  const me = ref<Me | null>(null);
  const loaded = ref(false);
  const accounts = ref<User[]>([]);
  const status = ref<PayPalStatus | null>(null);

  const user = computed(() => me.value?.user ?? null);
  const role = computed(() => me.value?.user.role ?? null);

  async function load(): Promise<void> {
    try {
      me.value = await api.get<Me>('/auth/me');
      setCsrfToken(me.value.csrfToken);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      me.value = null;
      setCsrfToken(null);
    } finally {
      loaded.value = true;
    }
  }

  async function loadAccounts(): Promise<void> {
    accounts.value = (await api.get<{ accounts: User[] }>('/auth/demo-accounts')).accounts;
  }

  async function loadStatus(): Promise<void> {
    status.value = await api.get<PayPalStatus>('/paypal/status');
  }

  async function signIn(userId: string): Promise<void> {
    const result = await api.post<{ user: User; csrfToken: string }>('/auth/login', { userId });
    setCsrfToken(result.csrfToken);
    await load();
  }

  async function signOut(): Promise<void> {
    await api.post('/auth/logout');
    me.value = null;
    setCsrfToken(null);
  }

  return { me, loaded, accounts, status, user, role, load, loadAccounts, loadStatus, signIn, signOut };
});
