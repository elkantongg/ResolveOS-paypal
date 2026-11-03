import { createRouter, createWebHistory } from 'vue-router';

import { useSession } from '@/stores/session';

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', name: 'landing', component: () => import('@/views/LandingView.vue'), meta: { public: true, bare: true } },
    { path: '/signin', name: 'signin', component: () => import('@/views/SignInView.vue'), meta: { public: true, bare: true } },
    { path: '/dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue') },
    { path: '/purchase', name: 'purchase', component: () => import('@/views/PurchaseView.vue') },
    { path: '/checkout/return', name: 'checkout-return', component: () => import('@/views/CheckoutReturnView.vue') },
    { path: '/checkout/cancel', name: 'checkout-cancel', component: () => import('@/views/CheckoutReturnView.vue'), meta: { cancelled: true } },
    { path: '/cases/new', name: 'case-new', component: () => import('@/views/NewCaseView.vue') },
    { path: '/cases/:id', name: 'case', component: () => import('@/views/CaseView.vue') },
    { path: '/cases/:id/negotiate', name: 'negotiate', component: () => import('@/views/NegotiationView.vue') },
    { path: '/cases/:id/settlement', name: 'settlement', component: () => import('@/views/SettlementView.vue') },
    { path: '/cases/:id/receipt', name: 'receipt', component: () => import('@/views/ReceiptView.vue') },
    { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue'), meta: { public: true } },
  ],
});

router.beforeEach(async (to) => {
  const session = useSession();
  if (!session.loaded) await session.load().catch(() => undefined);
  if (!to.meta.public && !session.user) {
    return { name: 'signin', query: { next: to.fullPath } };
  }
});

export default router;
