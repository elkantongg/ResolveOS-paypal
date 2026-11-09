
<script setup lang="ts">
import { Activity, ArrowRight, BarChart3, CheckCircle2, X, History, Clock3, FileStack, FolderOpen, Inbox, Plus, RotateCcw, Search, ShoppingCart, Sparkles, Timer, Wallet, Target, Layers, Zap, ChevronDown } from 'lucide-vue-next';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import { api, errorMessage } from '@/api/client';
import type { AuditEvent, CaseStatus, CaseSummary, DashboardSummary } from '@/api/types';
import ErrorNotice from '@/components/ErrorNotice.vue';
import Skeleton from '@/components/Skeleton.vue';
import SourceBadge from '@/components/SourceBadge.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { describeEvent, duration, money, STATUS_LABEL, timeAgo } from '@/lib/format';
import { useSession } from '@/stores/session';

/** Every number here is computed by the API from stored records; nothing is hard-coded. */
const session = useSession();
const router = useRouter();
const summary = ref<DashboardSummary | null>(null);
const cases = ref<CaseSummary[] | null>(null);
const allCases = ref<CaseSummary[]>([]);
const activity = ref<(AuditEvent & { reference: string; title: string })[]>([]);
const error = ref<string | null>(null);
const historyOpen = ref(false);
const historySearch = ref('');
const historyLoading = ref(false);
const historyError = ref<string | null>(null);
const allActivity = ref<(AuditEvent & { reference: string; title: string })[]>([]);
const filteredHistory = computed(() => allActivity.value.filter((event) =>
  `${event.reference} ${event.title} ${describeEvent(event)}`.toLowerCase().includes(historySearch.value.toLowerCase().trim())
));
async function openHistory() {
  historyOpen.value = true;
  historyLoading.value = true;
  historyError.value = null;
  document.body.style.overflow = 'hidden';
  try {
    const result = await api.get<{ activity: (AuditEvent & { reference: string; title: string })[] }>('/dashboard/activity');
    allActivity.value = result.activity;
  } catch (e) {
    historyError.value = errorMessage(e);
  } finally {
    historyLoading.value = false;
  }
}
function closeHistory() {
  historyOpen.value = false;
  document.body.style.overflow = '';
}
function handleHistoryKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && historyOpen.value) closeHistory();
}
onMounted(() => window.addEventListener('keydown', handleHistoryKeydown));
onBeforeUnmount(() => {
  document.body.style.overflow = '';
  window.removeEventListener('keydown', handleHistoryKeydown);
  if (debounce) clearTimeout(debounce);
  if (refreshHandle) clearInterval(refreshHandle);
});
const query = ref('');
const status = ref<'ALL' | CaseStatus>('ALL');
const resetting = ref(false);
const arrivingFromDemo = ref(typeof window !== 'undefined' && window.sessionStorage.getItem('resolveos-dashboard-entrance') === '1');

async function loadCases() {
  const params = new URLSearchParams({ status: status.value });
  if (query.value.trim()) params.set('q', query.value.trim());
  cases.value = (await api.get<{ cases: CaseSummary[] }>(`/cases?${params}`)).cases;
}
async function loadPriorityCases() {
  allCases.value = (await api.get<{ cases: CaseSummary[] }>('/cases?status=ALL')).cases;
}
let refreshHandle: ReturnType<typeof setInterval> | null = null;
let isRefreshing = false;
async function refreshDashboard() {
  if (isRefreshing || document.visibilityState !== 'visible') return;
  isRefreshing = true;
  try {
    const [nextSummary, nextActivity] = await Promise.all([
      api.get<DashboardSummary>('/dashboard/summary'),
      api.get<{ activity: (AuditEvent & { reference: string; title: string })[] }>('/dashboard/activity'),
      loadCases(),
      loadPriorityCases(),
    ]);
    summary.value = nextSummary;
    activity.value = nextActivity.activity;
  } catch { /* preserve last valid data during a temporary outage */ }
  finally { isRefreshing = false; }
}

async function load() {
  error.value = null;
  try {
    const [s, a] = await Promise.all([
      api.get<DashboardSummary>('/dashboard/summary'),
      api.get<{ activity: (AuditEvent & { reference: string; title: string })[] }>('/dashboard/activity'),
      loadCases(),
      loadPriorityCases(),
    ]);
    summary.value = s;
    activity.value = a.activity;
  } catch (e) {
    error.value = errorMessage(e);
  }
}
onMounted(() => {
  if (arrivingFromDemo.value) window.sessionStorage.removeItem('resolveos-dashboard-entrance');
  void load();
  refreshHandle = setInterval(() => { if (!historyOpen.value) void refreshDashboard(); }, 15000);
});

let debounce: ReturnType<typeof setTimeout> | null = null;
watch([query, status], () => {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => loadCases().catch((e) => (error.value = errorMessage(e))), 250);
});

async function resetDemo() {
  if (!confirm('Reset the demo? This deletes every case and transaction record in this local database and signs everyone out. PayPal sandbox payments themselves are not touched.')) return;
  resetting.value = true;
  try {
    await api.post('/demo/reset', { confirm: 'RESET' });
    await session.signOut().catch(() => undefined);
    await router.push('/signin');
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    resetting.value = false;
  }
}

const refundTotal = computed(() => summary.value?.refundedTotals.find((t) => t.currency === 'USD')?.totalMinor ?? 0);
const chart = computed(() => {
  // The audit API may omit days with no events. Render a complete 14-day axis
  // without inventing activity: absent days are explicitly zero.
  const recorded = new Map((summary.value?.activity ?? []).map((day) => [day.day.slice(0, 10), day]));
  const now = new Date();
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (13 - i));
    const key = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    const actual = recorded.get(key);
    return { day: key, opened: actual?.opened ?? 0, resolved: actual?.resolved ?? 0 };
  });
  const peak = Math.max(1, ...days.map((day) => Math.max(day.opened, day.resolved)));
  return { days, peak };
});
const greeting = computed(() => (session.role === 'MERCHANT' ? session.me?.merchant?.businessName ?? 'Merchant' : session.user?.name.split(' ')[0]));
/* Explainable ranking based on real case status, money and recency.
   No deadlines or agent capabilities are fabricated. Human approval is never automated. */
const rank = (item: CaseSummary) => {
  const statusWeight: Record<CaseStatus, number> = {
    ESCALATED: 108, AWAITING_APPROVAL: 100, NO_AGREEMENT: 94,
    PAYMENT_PROCESSING: 66, OPEN: 47, IN_NEGOTIATION: 34, RESOLVED: -1000,
  };
  const ageHours = Math.max(0, (Date.now() - new Date(item.updatedAt).getTime()) / 3_600_000);
  const amountWeight = Math.min(22, Math.log10(1 + item.amountMinor / 100) * 8);
  const ageWeight = Math.min(14, ageHours / 24 * 3);
  return statusWeight[item.status] + amountWeight + ageWeight;
};
const activeCases = computed(() => allCases.value.filter((item) => item.status !== 'RESOLVED'));
const priorityCase = computed(() => [...activeCases.value].sort((a,b) => rank(b) - rank(a) || a.reference.localeCompare(b.reference))[0] ?? null);
const priorityHeadline = computed(() => {
  const item = priorityCase.value;
  if (!item) return 'You’re all caught up';
  if (item.status === 'AWAITING_APPROVAL') return `Review ${item.reference} now`;
  if (item.status === 'ESCALATED') return `Review escalated case ${item.reference}`;
  if (item.status === 'NO_AGREEMENT') return `Review unresolved case ${item.reference}`;
  if (item.status === 'PAYMENT_PROCESSING') return `Check payment status · ${item.reference}`;
  if (item.status === 'IN_NEGOTIATION') return `Track negotiation · ${item.reference}`;
  return `Review new case ${item.reference}`;
});
const priorityDescription = computed(() => {
  const item = priorityCase.value;
  if (!item) return 'No active disputes require a next step.';
  const phrases: Record<CaseStatus, string> = {
    AWAITING_APPROVAL: 'A settlement proposal is awaiting review',
    ESCALATED: 'Human review is required',
    NO_AGREEMENT: 'Negotiation ended without agreement',
    PAYMENT_PROCESSING: 'Refund processing needs monitoring',
    IN_NEGOTIATION: 'AI-assisted negotiation is underway',
    OPEN: 'The dispute needs initial review',
    RESOLVED: 'Resolved',
  };
  return `${phrases[item.status]} · ${money(item.amountMinor, item.currency)} case value`;
});
const priorityRationale = computed(() => {
  const item = priorityCase.value;
  if (!item) return 'When a case needs attention, its recommended next step will appear here.';
  const inputs: string[] = [];
  if (['AWAITING_APPROVAL','ESCALATED','NO_AGREEMENT'].includes(item.status)) inputs.push('action required at this dispute stage');
  else inputs.push('current dispute stage');
  if (item.amountMinor >= 10_000) inputs.push('financial exposure');
  inputs.push('time since last update');
  return `Prioritized using ${inputs.join(', ')}. No deadline has been assumed.`;
});
const resolutionRate = computed(() => {
  const total = summary.value?.totalCases ?? 0;
  return total ? Math.round((summary.value?.resolved ?? 0) / total * 100) : 0;
});
const statTiles = computed(() => summary.value ? [
  { label: 'Total cases', value: String(summary.value.totalCases), icon: FileStack, tone: 'indigo' },
  { label: 'Open', value: String(summary.value.openCases), icon: FolderOpen, tone: 'blue' },
  { label: 'Awaiting approval', value: String(summary.value.awaitingApproval), icon: Clock3, tone: 'violet' },
  { label: 'Resolved (Closed)', value: String(summary.value.resolved), icon: CheckCircle2, tone: 'green' },
  { label: 'Refunded via PayPal', value: money(refundTotal.value, 'USD'), icon: Wallet, tone: 'cyan' },
] : []);
const graphPlot = computed(() => {
  const days = chart.value.days;
  const n = days.length;
  const y = (count: number) => 110 - (count / chart.value.peak) * 90;
  const x = (i: number) => n < 2 ? 280 : 26 + (i / (n - 1)) * 508;
  return {
    opened: days.map((day, i) => `${x(i).toFixed(1)},${y(day.opened).toFixed(1)}`).join(' '),
    resolved: days.map((day, i) => `${x(i).toFixed(1)},${y(day.resolved).toFixed(1)}`).join(' '),
    ticks: [0, 1, 2, 3, 4].map((i) => ({ value: (chart.value.peak * i) / 4, y: y(chart.value.peak * i) })),
  };
});

</script>

<template>
  <div class="resolve-dashboard space-y-5" :class="{ 'dashboard-arrival': arrivingFromDemo }">
    <div class="dashboard-ambient dashboard-ambient--neon" aria-hidden="true">
      <span class="dashboard-glow dashboard-glow--one" />
      <span class="dashboard-glow dashboard-glow--two" />
      <span class="dashboard-glow dashboard-glow--three" />
    </div>
    <header class="dashboard-greeting flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-bold tracking-tight sm:text-[29px]">Welcome back, {{ greeting }}</h1>
      <div class="flex flex-wrap gap-2.5">
        <button v-if="session.role === 'OPERATOR'" type="button" class="btn btn-ghost btn-sm" :disabled="resetting" @click="resetDemo"><RotateCcw class="size-3.5" /> Reset demo</button>
        <template v-if="session.role === 'BUYER'">
          <RouterLink to="/purchase" class="btn btn-secondary"><ShoppingCart class="size-4" /> Create sandbox transaction</RouterLink>
          <RouterLink to="/cases/new" class="btn btn-primary"><Plus class="size-4" /> Report a problem</RouterLink>
        </template>
      </div>
    </header>

    <ErrorNotice v-if="error" :message="error" @retry="load" />

    <div class="dashboard-feature-grid grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      <section class="dashboard-action-centre dashboard-action-centre--neon" aria-label="Action Centre">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <span class="dashboard-action-emblem"><Zap class="size-6" /></span>
            <div>
              <h2 class="text-xl font-bold tracking-tight">Action Centre</h2>
              <p class="text-sm text-muted">Your next step in dispute resolution</p>
            </div>
          </div>
          <span class="dashboard-agent-label"><Sparkles class="size-3.5" /> Smart priority</span>
        </div>
        <RouterLink
          v-if="summary && priorityCase"
          :to="`/cases/${priorityCase.id}`"
          class="dashboard-next-step dashboard-next-step--interactive mt-4"
          :aria-label="`${priorityHeadline}. Open case ${priorityCase.reference}`"
        >
          <span class="dashboard-next-icon" aria-hidden="true"><Layers class="size-7" /></span>
          <div class="min-w-0 flex-1">
            <p class="dashboard-next-eyebrow"><Sparkles class="size-3.5" /> Recommended next step</p>
            <h3 class="mt-1 text-[22px] font-bold leading-tight tracking-tight">{{ priorityHeadline }}</h3>
            <p class="mt-1 text-sm text-ink-soft">{{ priorityDescription }}</p>
            <p class="mt-2 text-xs italic text-muted">{{ priorityRationale }}</p>
          </div>
          <span class="btn dashboard-review-btn" aria-hidden="true">Review case <ArrowRight class="size-4" /></span>
        </RouterLink>
        <div v-else-if="summary" class="dashboard-next-step dashboard-next-step--empty mt-4">
          <span class="dashboard-next-icon" aria-hidden="true"><CheckCircle2 class="size-7" /></span>
          <div class="min-w-0 flex-1">
            <h3 class="mt-1 text-[22px] font-bold leading-tight tracking-tight">{{ priorityHeadline }}</h3>
            <p class="mt-1 text-sm text-ink-soft">{{ priorityDescription }}</p>
          </div>
        </div>
        <div v-else class="mt-5"><Skeleton :lines="3" /></div>
        <div class="dashboard-next-glow" aria-hidden="true" />
      </section>
      <section class="card dashboard-overview-card dashboard-overview-card--neon" aria-label="Resolution Overview">
        <div class="flex items-center gap-3">
          <span class="dashboard-overview-icon"><Target class="size-6" /></span>
          <div><h2 class="text-lg font-bold">Resolution Overview</h2><p class="text-sm text-muted">How your disputes are progressing</p></div>
        </div>
        <div v-if="summary" class="dashboard-overview-body mt-5">
          <div class="dashboard-resolution-ring" :style="{ '--progress': `${resolutionRate}%` }"><div><strong>{{ resolutionRate }}%</strong><small>Resolution rate</small></div></div>
          <div class="dashboard-overview-list">
            <div><Timer class="size-4 text-primary" /><span>Median time to resolution</span><strong>{{ duration(summary.measured.medianResolutionSeconds) }}</strong></div>
            <div><Layers class="size-4 text-primary" /><span>Active cases (in progress)</span><strong>{{ activeCases.length }}</strong></div>
            <div><CheckCircle2 class="size-4 text-ok" /><span>Closed cases (resolved)</span><strong>{{ summary.resolved }}</strong></div>
          </div>
        </div>
        <div v-else class="mt-5"><Skeleton :lines="3" /></div>
      </section>
    </div>

    <div class="dashboard-stats dashboard-stats--neon grid grid-cols-2 gap-3 lg:grid-cols-5">
      <template v-if="summary">
        <div v-for="tile in statTiles" :key="tile.label" class="card dashboard-stat" :class="'dashboard-stat--' + tile.tone">
          <div class="dashboard-stat-icon"><component :is="tile.icon" class="size-5" /></div>
          <div class="min-w-0">
            <p class="text-xs text-muted">{{ tile.label }}</p>
            <p class="mt-0.5 text-xl font-bold tabular" :class="{ 'text-ok': tile.label === 'Refunded via PayPal' }">{{ tile.value }}</p>
          </div>
        </div>
      </template>
      <div v-for="i in 5" v-else :key="i" class="card dashboard-stat"><Skeleton :lines="2" /></div>
    </div>

    <div class="dashboard-content-grid grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.48fr)]">
      <section class="card dashboard-cases dashboard-panel--neon overflow-hidden">
        <div class="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <h2 class="mr-auto flex items-center gap-2.5 font-bold"><FolderOpen class="size-5 text-primary" /> Cases</h2>
          <label class="relative">
            <span class="sr-only">Search cases</span>
            <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input v-model="query" class="input !h-9 w-56 pl-9" placeholder="Search title or RA-…" />
          </label>
          <div class="dashboard-status-control">
            <select v-model="status" class="dashboard-status-select input !h-9" aria-label="Filter by status">
              <option value="ALL">All statuses</option>
              <option v-for="(label, key) in STATUS_LABEL" :key="key" :value="key">{{ label }}</option>
            </select>
            <ChevronDown class="dashboard-status-chevron size-4" aria-hidden="true" />
          </div>
        </div>
        <div v-if="cases === null" class="p-5"><Skeleton :lines="5" /></div>
        <div v-else-if="!cases.length" class="px-6 py-16 text-center">
          <Inbox class="mx-auto mb-3 size-9 text-faint" />
          <p class="font-semibold">No cases here</p>
          <p class="mt-1 text-sm text-muted">{{ query || status !== 'ALL' ? 'Try another search or filter.' : 'When a buyer reports a problem, it appears here.' }}</p>
        </div>
        <div v-else class="overflow-x-auto">
          <table class="dashboard-case-table w-full min-w-[700px] text-left">
            <thead><tr>
              <th>Case ID</th><th>Dispute title</th><th>Counterparty</th><th>Amount</th><th>Status</th><th>Last update</th><th><span class="sr-only">Open</span></th>
            </tr></thead>
            <tbody>
              <tr v-for="item in cases" :key="item.id" tabindex="0" role="link" :aria-label="`Open case ${item.reference}: ${item.title}`"
                class="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                @click="router.push(`/cases/${item.id}`)"
                @keydown.enter.prevent="router.push(`/cases/${item.id}`)"
                @keydown.space.prevent="router.push(`/cases/${item.id}`)">
                <td><span class="font-semibold text-primary">{{ item.reference }}</span></td>
                <td><span class="font-medium">{{ item.title }}</span><div class="mt-1 sm:hidden"><SourceBadge :source="item.sourceType" :capture-id="item.sourceType === 'PAYPAL_SANDBOX' ? 'yes' : null" /></div></td>
                <td class="text-ink-soft">{{ session.role === 'BUYER' ? item.merchantName : session.role === 'MERCHANT' ? item.buyerName : item.buyerName + ' ↔ ' + item.merchantName }}</td>
                <td class="font-semibold tabular">{{ money(item.amountMinor, item.currency) }}</td>
                <td><div class="flex flex-wrap items-center gap-2"><SourceBadge :source="item.sourceType" :capture-id="item.sourceType === 'PAYPAL_SANDBOX' ? 'yes' : null" /><StatusBadge :status="item.status" /></div></td>
                <td class="whitespace-nowrap text-muted">{{ timeAgo(item.updatedAt) }}</td>
                <td><span class="inline-flex rounded p-1 text-muted" aria-hidden="true"><ArrowRight class="size-4" /></span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <aside class="dashboard-sidebar space-y-4">
        <section class="card dashboard-sidebar-card dashboard-panel--neon">
          <h2 class="flex items-center gap-2 font-bold"><BarChart3 class="size-5 text-primary" /> Last 14 days</h2>
          <p class="mt-1 text-xs text-muted">Cases opened and resolved, from the audit log</p>
          <div v-if="chart.days.length" class="mt-4">
            <svg class="dashboard-chart dashboard-chart--neon w-full" preserveAspectRatio="xMidYMid meet" viewBox="0 0 560 138" role="img" :aria-label="`Cases opened and resolved across ${chart.days.length} days`">
              <defs><linearGradient id="resolveos-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#23e6c3" stop-opacity=".26"/><stop offset="100%" stop-color="#23e6c3" stop-opacity="0"/></linearGradient><filter id="resolveos-chart-glow" x="-25%" y="-50%" width="150%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter></defs>
              <g v-for="tick in graphPlot.ticks" :key="tick.y">
                <line x1="26" :y1="tick.y" x2="534" :y2="tick.y" stroke="var(--color-line)" stroke-width="1" />
              </g>
              <polygon :points="`26,110 ${graphPlot.resolved} 534,110`" fill="url(#resolveos-chart-fill)" stroke="none" />
              <polyline :points="graphPlot.opened" fill="none" stroke="#6293fa" stroke-opacity=".3" stroke-width="6" filter="url(#resolveos-chart-glow)" />
              <polyline :points="graphPlot.opened" fill="none" stroke="#6293fa" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
              <polyline :points="graphPlot.resolved" fill="none" stroke="#42d7b6" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
              <g v-for="(day, i) in chart.days" :key="day.day">
                <circle :cx="chart.days.length < 2 ? 280 : 26 + i / (chart.days.length - 1) * 508" :cy="110 - day.opened / chart.peak * 90" r="3.2" fill="#6293fa"><title>{{ day.day }}: {{ day.opened }} opened</title></circle>
                <circle :cx="chart.days.length < 2 ? 280 : 26 + i / (chart.days.length - 1) * 508" :cy="110 - day.resolved / chart.peak * 90" r="3.2" fill="#42d7b6"><title>{{ day.day }}: {{ day.resolved }} resolved</title></circle>
              </g>
            </svg>
            <div class="dashboard-chart-labels flex justify-between gap-1 text-[10px] text-muted">
              <span v-for="(day, i) in chart.days.filter((_, i) => i % Math.max(1, Math.ceil(chart.days.length / 6)) === 0 || i === chart.days.length - 1)" :key="day.day">{{ day.day.slice(5) }}</span>
            </div>
          </div>
          <p v-else class="py-8 text-center text-sm text-muted">No activity yet.</p>
          <p class="mt-3 flex gap-4 text-xs text-muted">
            <span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-full bg-[#6293fa]" /> Opened</span>
            <span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-full bg-[#42d7b6]" /> Resolved</span>
          </p>
        </section>
        <section class="card dashboard-sidebar-card">
          <div class="mb-4 flex items-center justify-between gap-3">
            <h2 class="flex items-center gap-2 font-bold"><Activity class="size-5 text-primary" /> Latest activity</h2>
            <button type="button" class="dashboard-history-trigger" @click="openHistory"><History class="size-4" /> View history <ArrowRight class="size-3.5" /></button>
          </div>
          <p v-if="!activity.length" class="text-sm text-muted">Nothing yet.</p>
          <ol class="dashboard-timeline space-y-4">
            <li v-for="event in activity.slice(0, 8)" :key="event.id" class="relative pl-7 text-sm">
              <span class="dashboard-timeline-dot" />
              <p class="text-ink-soft"><span class="mono text-muted">{{ event.reference }}</span> {{ describeEvent(event) }}</p>
              <p class="mt-0.5 text-xs text-muted">{{ timeAgo(event.createdAt) }}</p>
            </li>
          </ol>
        </section>
      </aside>
    </div>
    <Teleport to="body">
      <div v-if="historyOpen" class="dashboard-history-backdrop" @click.self="closeHistory">
        <section class="dashboard-history-dialog" role="dialog" aria-modal="true" aria-label="Activity history">
          <div class="dashboard-history-header">
            <div><p class="dashboard-history-eyebrow">AUDIT LOG</p><h2>Activity history</h2><p class="text-sm text-muted">Recorded events visible to your demo account.</p></div>
            <button type="button" class="dashboard-history-close" aria-label="Close activity history" @click="closeHistory"><X class="size-5" /></button>
          </div>
          <label class="dashboard-history-search">
            <Search class="size-4 text-muted" />
            <input v-model="historySearch" type="search" placeholder="Search events or cases…" aria-label="Search activity history" />
          </label>
          <div class="dashboard-history-list">
            <div v-if="historyLoading" class="p-5"><Skeleton :lines="5" /></div>
            <ErrorNotice v-else-if="historyError" :message="historyError" @retry="openHistory" />
            <p v-else-if="!filteredHistory.length" class="px-5 py-10 text-center text-sm text-muted">{{ historySearch ? 'No matching activity.' : 'No activity recorded yet.' }}</p>
            <ol v-else class="dashboard-history-events">
              <li v-for="event in filteredHistory" :key="event.id">
                <span class="dashboard-history-event-dot" />
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2"><span class="mono font-semibold text-primary">{{ event.reference }}</span><span class="text-xs text-muted">{{ event.actorType }}</span></div>
                  <p class="mt-1 text-sm text-ink-soft">{{ describeEvent(event) }}</p>
                  <p class="mt-1 text-xs text-muted">{{ timeAgo(event.createdAt) }} · {{ new Date(event.createdAt).toLocaleString() }}</p>
                </div>
              </li>
            </ol>
          </div>
          <footer class="dashboard-history-footer"><span>{{ filteredHistory.length }} events shown</span><button type="button" class="btn btn-secondary btn-sm" @click="closeHistory">Close</button></footer>
        </section>
      </div>
    </Teleport>
    <section v-if="summary" class="dashboard-measured mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted" aria-label="Measured impact">
      <p class="inline-flex items-center gap-1.5"><Timer class="size-3.5" /> Measured from the audit log</p>
      <p>Median complaint → resolution <strong class="text-ink">{{ duration(summary.measured.medianResolutionSeconds) }}</strong> ({{ summary.measured.resolvedCasesMeasured }} resolved)</p>
      <p>PayPal dispute inquiry window: up to {{ summary.measured.paypalInquiryWindowDays }} days (maximum, not average).</p>
    </section>
  </div>
</template>

<style scoped>
.dashboard-arrival{animation:dashboard-arrival .9s cubic-bezier(.17,.75,.25,1) both}
@keyframes dashboard-arrival{from{opacity:0;transform:translateY(24px);filter:blur(6px)}to{opacity:1;transform:translateY(0);filter:blur(0)}}
.resolve-dashboard{--dash-blue:#69a4ff}
.dashboard-greeting{padding-block:30px 24px}
.dashboard-action-centre{position:relative;overflow:hidden;isolation:isolate;min-height:235px;padding:10px 15px 12px 8px}
.dashboard-action-emblem,.dashboard-overview-icon{display:grid;place-items:center;flex:none;width:51px;height:51px;border-radius:50%;background:#0d7ab32b;color:#62dfff;box-shadow:0 0 24px #137cda18}
.dashboard-agent-label{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border:1px solid #36d7c982;border-radius:99px;background:#08a7a415;color:#5cfee3;font-size:11px;font-weight:650;white-space:nowrap}
.dashboard-next-step{position:relative;display:flex;align-items:center;gap:18px;z-index:1;min-height:138px;padding:12px 6px}
.dashboard-next-icon{display:grid;place-items:center;flex:none;width:76px;height:76px;border:1px solid #988cffb0;border-radius:50%;background:radial-gradient(circle,#544eff66,#2635b520 65%,transparent 75%);color:#c3c1ff;box-shadow:0 0 24px #785bff85,inset 0 0 20px #7662ff4d;animation:next-orb-breathe 6s ease-in-out infinite}
.dashboard-next-eyebrow{display:inline-flex;align-items:center;gap:6px;width:max-content;max-width:100%;padding:4px 10px;border:1px solid #a98cff82;border-radius:99px;background:#6f54de27;color:#d4c5ff;font-size:11px;font-weight:650}
.dashboard-next-glow{position:absolute;right:8%;bottom:-80px;width:60%;height:150px;border-radius:50%;transform:rotate(-9deg);background:radial-gradient(ellipse,#7c4eff42,#364dd51b 44%,transparent 75%);filter:blur(22px);z-index:0;pointer-events:none}
.dashboard-review-btn{z-index:1;flex:none;background:#77e6f9;color:#08203f;box-shadow:0 0 16px #39c9f933;font-weight:700}
.dashboard-review-btn:hover{background:#a1f5ff}
@keyframes next-orb-breathe{0%,100%{box-shadow:0 0 20px #785bff65,inset 0 0 18px #7662ff44}50%{box-shadow:0 0 38px #785bffaa,inset 0 0 26px #7662ff65}}
.dashboard-overview-card{padding:17px 19px}
.dashboard-overview-body{display:flex;align-items:center;gap:20px}
.dashboard-resolution-ring{flex:none;width:128px;height:128px;padding:13px;border-radius:50%;background:conic-gradient(#7c93ff var(--progress),#293956 var(--progress) 100%);transform:rotate(-90deg)}
.dashboard-resolution-ring>div{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;border-radius:50%;background:var(--color-surface);transform:rotate(90deg)}
.dashboard-resolution-ring strong{font-size:24px;font-weight:750}
.dashboard-resolution-ring small{font-size:10px;color:var(--color-muted)}
.dashboard-overview-list{flex:1;min-width:0}
.dashboard-overview-list>div{display:flex;align-items:center;gap:9px;padding:10px 0;border-bottom:1px solid var(--color-line);font-size:11px}
.dashboard-overview-list>div:last-child{border-bottom:0}
.dashboard-overview-list span{flex:1;color:var(--color-muted)}
.dashboard-overview-list strong{white-space:nowrap;font-size:13px}
.dashboard-stat{display:flex;align-items:center;gap:13px;min-width:0;min-height:70px;padding:12px 15px}
.dashboard-stat-icon{display:grid;place-items:center;width:43px;height:43px;flex:none;border-radius:50%;background:#4178dd1a;color:#679afd}
.dashboard-stat--violet .dashboard-stat-icon{background:#8969ff1b;color:#a18bff}
.dashboard-stat--green .dashboard-stat-icon{background:#17ac7723;color:#42d6a6}
.dashboard-stat--cyan .dashboard-stat-icon{background:#1eb4d71b;color:#38bddd}
.dashboard-cases{min-height:380px}
.dashboard-case-table{border-collapse:collapse;font-size:12px}
.dashboard-case-table th{padding:12px 15px;text-transform:uppercase;font-size:10px;color:var(--color-muted);font-weight:650;white-space:nowrap;border-bottom:1px solid var(--color-line)}
.dashboard-case-table td{padding:16px 15px;border-bottom:1px solid var(--color-line);vertical-align:middle}
.dashboard-case-table tbody tr:hover{background:color-mix(in srgb,var(--color-primary) 5%,transparent)}
.dashboard-sidebar-card{padding:17px 19px}
.dashboard-chart{display:block;height:auto;max-height:150px;overflow:hidden;contain:paint}
.dashboard-sidebar-card{overflow:hidden}
.dashboard-chart polyline{vector-effect:non-scaling-stroke}
.dashboard-chart-labels{overflow:hidden}
.dashboard-timeline{margin-left:7px;border-left:1px solid var(--color-line)}
.dashboard-timeline-dot{position:absolute;left:-6px;top:5px;width:11px;height:11px;border-radius:50%;background:#6293fa;box-shadow:0 0 0 4px #4286ff19}
.dashboard-timeline li:nth-child(3n) .dashboard-timeline-dot{background:#42d7b6}
.dashboard-measured{opacity:.85}
@media(max-width:1100px){.dashboard-feature-grid{grid-template-columns:1fr}.dashboard-content-grid{grid-template-columns:1fr}}
@media(max-width:760px){.dashboard-next-step{flex-wrap:wrap}.dashboard-next-step .dashboard-review-btn{margin-left:94px}.dashboard-overview-body{flex-wrap:wrap}}
@media(max-width:620px){.dashboard-greeting{padding-block:17px}.dashboard-action-centre,.dashboard-overview-card{padding:15px}.dashboard-alert-icon{width:48px;height:48px}.dashboard-review-btn{width:100%}.dashboard-stats{gap:8px}.dashboard-stat{gap:8px;padding:10px;min-height:66px}.dashboard-stat-icon{width:32px;height:32px}.dashboard-stat-icon svg{width:17px;height:17px}.dashboard-stat p:last-child{font-size:17px}.dashboard-next-icon{width:58px;height:58px}.dashboard-next-step .dashboard-review-btn{margin-left:0;width:100%}}
@media(prefers-reduced-motion:reduce){.dashboard-arrival,.dashboard-next-icon{animation:none}}

/* Quiet, continuous ambient lighting behind content; no visible wave geometry. */
.resolve-dashboard{position:relative;isolation:isolate}
.resolve-dashboard> :not(.dashboard-ambient){position:relative;z-index:1}
.dashboard-ambient{
  position:absolute!important;inset:-30px -20px 0;z-index:0!important;
  pointer-events:none;overflow:hidden;border-radius:22px;background:transparent
}
.dashboard-glow{
  position:absolute;display:block;border-radius:50%;
  filter:blur(95px);opacity:.2;will-change:transform,opacity;
  background:radial-gradient(circle,#458efa9e 0%,#2869d94a 35%,transparent 70%);
  animation:dashboard-glow-drift 24s ease-in-out infinite alternate
}
.dashboard-glow--one{width:540px;height:540px;top:-170px;right:-100px}
.dashboard-glow--two{
  width:490px;height:490px;bottom:-180px;left:-100px;opacity:.14;
  background:radial-gradient(circle,#3a6feb85 0%,#3057d639 40%,transparent 72%);
  animation-duration:29s;animation-delay:-12s
}
.dashboard-glow--three{
  width:420px;height:420px;top:32%;left:37%;opacity:.12;
  background:radial-gradient(circle,#22b6d56e 0%,#278cbb2e 42%,transparent 70%);
  animation-duration:33s;animation-delay:-21s
}
@keyframes dashboard-glow-drift{
  0%{transform:translate3d(-6%,3%,0) scale(.93)}
  50%{transform:translate3d(9%,-8%,0) scale(1.11)}
  100%{transform:translate3d(-2%,10%,0) scale(.98)}
}
:global(html[data-theme='light']) .dashboard-glow{opacity:.09}
.resolve-dashboard .card{transition:border-color .26s ease,box-shadow .3s ease,transform .3s cubic-bezier(.2,.7,.25,1)}
@media(hover:hover){
 .resolve-dashboard .card:hover{border-color:color-mix(in srgb,var(--color-primary) 34%,var(--color-line));box-shadow:0 9px 28px #317ff11a,0 0 0 1px #317ff112;transform:translateY(-2px)}
 .resolve-dashboard .btn:hover:not(:disabled),.resolve-dashboard .dashboard-history-trigger:hover{transform:translateY(-2px);box-shadow:0 6px 22px #4c9afb28}
 .resolve-dashboard .dashboard-stat:hover .dashboard-stat-icon{transform:rotate(-7deg) scale(1.1)}
 .resolve-dashboard .dashboard-case-table tbody tr{transition:background-color .22s}
}
.resolve-dashboard .dashboard-stat-icon{transition:transform .3s ease}
.resolve-dashboard .btn{transition:transform .25s ease,box-shadow .25s ease,background-color .25s ease}
.dashboard-history-trigger{display:inline-flex;align-items:center;gap:6px;padding:7px 9px;border:1px solid var(--color-line);border-radius:9px;font-size:11px;font-weight:650;color:var(--color-primary);transition:transform .22s,box-shadow .22s,border-color .22s}
.dashboard-history-trigger:hover{border-color:var(--color-primary)}
.dashboard-history-backdrop{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;padding:18px;background:#020816b8;backdrop-filter:blur(8px)}
.dashboard-history-dialog{display:flex;flex-direction:column;width:min(100%,730px);max-height:min(85vh,850px);overflow:hidden;color:var(--color-ink);background:var(--color-surface);border:1px solid var(--color-line-strong);border-radius:20px;box-shadow:0 25px 90px #0007;animation:dashboard-history-enter .3s cubic-bezier(.2,.8,.2,1) both}
@keyframes dashboard-history-enter{from{opacity:0;transform:translateY(15px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
.dashboard-history-header{display:flex;align-items:start;justify-content:space-between;gap:20px;padding:23px 25px 16px}
.dashboard-history-eyebrow{font-size:10px;font-weight:700;letter-spacing:.18em;color:var(--color-primary);margin-bottom:6px}
.dashboard-history-header h2{font-size:24px;font-weight:750;letter-spacing:-.04em;margin-bottom:4px}
.dashboard-history-close{display:grid;place-items:center;width:34px;height:34px;flex:none;border:1px solid var(--color-line);border-radius:10px;color:var(--color-muted)}
.dashboard-history-close:hover{color:var(--color-ink);background:var(--color-sunken)}
.dashboard-history-search{display:flex;align-items:center;gap:10px;margin:0 25px 14px;padding:10px 12px;background:var(--color-sunken);border:1px solid var(--color-line);border-radius:10px}
.dashboard-history-search input{width:100%;outline:0;background:transparent;color:var(--color-ink);font-size:13px}
.dashboard-history-list{min-height:120px;overflow-y:auto;overscroll-behavior:contain;padding:4px 25px}
.dashboard-history-events{margin-left:7px;border-left:1px solid var(--color-line)}
.dashboard-history-events li{position:relative;padding:8px 0 17px 22px}
.dashboard-history-event-dot{position:absolute;left:-5px;top:13px;width:9px;height:9px;border-radius:50%;background:#69a4ff;box-shadow:0 0 0 4px #69a4ff24}
.dashboard-history-events li:nth-child(3n) .dashboard-history-event-dot{background:#49d9b8}
.dashboard-history-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 25px;border-top:1px solid var(--color-line);color:var(--color-muted);font-size:12px}
@media(prefers-reduced-motion:reduce){.dashboard-glow,.dashboard-history-dialog{animation:none!important}.resolve-dashboard .card,.resolve-dashboard .btn,.resolve-dashboard .dashboard-stat-icon{transition:none!important}}

/* Approved neon visual system — styling only; all values remain API-driven. */
.resolve-dashboard {
  --neon-cyan: #40e4f6;
  --neon-blue: #549eff;
  --neon-violet: #8e68ff;
  --neon-border: #3767aa;
  padding-bottom: 20px;
}
.resolve-dashboard .dashboard-greeting {padding-block: 18px 14px}
.resolve-dashboard .dashboard-greeting h1 {font-size:clamp(27px,2.35vw,36px);line-height:1.15;letter-spacing:-.035em}
.dashboard-ambient--neon{
  /* Fixed to the viewport rather than clipped to the dashboard's rounded container. */
  position:fixed!important;inset:0!important;
  width:100vw;height:100vh;border-radius:0!important;
  background:
    radial-gradient(ellipse 50% 46% at 52% 17%,#1645a13b,transparent 85%),
    radial-gradient(ellipse 50% 48% at 50% 90%,#123b9833,transparent 90%);
  overflow:hidden;
}
.dashboard-ambient--neon .dashboard-glow{filter:blur(115px);opacity:.23}
.dashboard-ambient--neon .dashboard-glow--one{width:590px;height:480px;top:-110px;right:15%;background:radial-gradient(ellipse,#2869e66a,transparent 72%)}
.dashboard-ambient--neon .dashboard-glow--two{width:620px;height:500px;left:14%;bottom:-180px;background:radial-gradient(ellipse,#294de679,transparent 70%);opacity:.2}
.dashboard-ambient--neon .dashboard-glow--three{width:480px;height:390px;top:37%;left:29%;background:radial-gradient(ellipse,#1d78b85f,transparent 72%);opacity:.18}
.dashboard-action-centre--neon{
  min-height:232px;
  padding:8px 12px 12px 13px;
  overflow:visible;
}
.dashboard-action-centre--neon .dashboard-action-emblem {
  width:56px;height:56px;
  background:radial-gradient(circle at 35% 30%,#0b9ab76b,#03528f5b 62%,#0a3f74a8);
  color:#5df2ff;
  box-shadow:0 0 24px #009dff4c,0 0 46px #0273cb20,inset 0 0 14px #05c5e927
}
.dashboard-action-centre--neon .dashboard-agent-label {
  padding:7px 15px;border-color:#15c8b58c;color:#5bffdf;
  background:#014d4945;box-shadow:0 0 15px #06b9ac22
}
.dashboard-action-centre--neon .dashboard-next-step{
  min-height:136px;
  display:grid;
  grid-template-columns:56px minmax(0,1fr) auto;
  align-items:center;
  column-gap:13px;
  padding:15px 4px 14px 0;
  margin-top:14px;
  isolation:isolate
}
.dashboard-action-centre--neon .dashboard-next-step::before{
  content:"";position:absolute;z-index:-1;left:24%;right:10%;bottom:-5px;height:38px;
  background:radial-gradient(ellipse at 50% 110%,#8452ff65,#6957ed29 44%,transparent 73%);
  filter:blur(16px);pointer-events:none
}
.dashboard-action-centre--neon .dashboard-next-step::after{
  content:"";position:absolute;z-index:-1;left:24%;right:12%;bottom:4px;height:80px;
  border-bottom:1.5px solid #9166ffbf;border-radius:0 0 90% 50%;
  transform:rotate(-4deg);filter:drop-shadow(0 0 7px #9855ff);
  pointer-events:none
}
.dashboard-action-centre--neon .dashboard-next-icon{
  width:56px;height:56px;border-color:#aa8cff;
  background:radial-gradient(circle at 40% 36%,#5059e4a3,#162665d6 60%,#091b42 100%);
  box-shadow:0 0 18px #7255ffab,0 0 48px #6b45ff7a,inset 0 0 20px #715aff55;
  color:#b8beff
}
.dashboard-action-centre--neon .dashboard-next-eyebrow{
  background:#553c9577;border-color:#ae8cff;box-shadow:0 0 12px #9363fd6e;
  color:#e7d8ff
}
.dashboard-action-centre--neon .dashboard-next-step h3{
  font-size:clamp(23px,2.1vw,30px);letter-spacing:-.035em
}
.dashboard-action-centre--neon .dashboard-review-btn{
  padding-inline:22px;min-height:44px;border:1px solid #85f2ff;
  background:linear-gradient(110deg,#48e9fb,#67bfff);
  box-shadow:0 0 22px #1ee4f874,0 0 42px #25a2f82e;
  color:#051c37;font-size:13px
}
.dashboard-action-centre--neon .dashboard-review-btn:hover{box-shadow:0 0 32px #25e8ffc7,0 0 54px #387cff65}
.dashboard-action-centre--neon .dashboard-next-glow{
  height:120px;bottom:-27px;right:0%;width:76%;opacity:.68;
  background:radial-gradient(ellipse at 55% 100%,#8f57ff3f,#3844bb18 47%,transparent 80%);
  filter:blur(26px)
}
.dashboard-overview-card--neon{
  border:1px solid #4065b2c7;
  background:linear-gradient(145deg,#102a5194,#111d397d 72%,#0b21418c);
  box-shadow:0 3px 20px #256bef1b,inset 0 0 21px #1d58bb1a;
  padding:18px 21px;min-height:230px
}
.dashboard-overview-card--neon .dashboard-overview-icon{
  background:#018dba40;color:#4ce7ef;box-shadow:0 0 15px #04a9df45
}
.dashboard-overview-card--neon .dashboard-overview-body{gap:21px}
.dashboard-overview-card--neon .dashboard-resolution-ring{
  width:134px;height:134px;
  background:conic-gradient(#59c4ff 0%,#6b8dff calc(var(--progress) * .65),#9476ff var(--progress),#253b5f var(--progress) 100%);
  box-shadow:0 0 18px #507eff38
}
.dashboard-overview-card--neon .dashboard-overview-list>div{font-size:12px}
.dashboard-overview-card--neon .dashboard-overview-list strong{font-size:14px}
.dashboard-stats--neon{gap:12px}
.dashboard-stats--neon .dashboard-stat{
  min-height:83px;padding:13px 17px;
  border:1px solid #5c73cbaa;
  border-radius:13px;
  background:linear-gradient(145deg,#10274b,#101c35 63%,#13264a);
  box-shadow:0 0 15px #304cd327,inset 0 1px 0 #b3c3ff0d
}
.dashboard-stats--neon .dashboard-stat-icon{
  width:49px;height:49px;background:#176ac04b;color:#58caff;
  box-shadow:0 0 19px #1376fd30
}
.dashboard-stats--neon .dashboard-stat--violet .dashboard-stat-icon{background:#5930ad69;color:#d29dff;box-shadow:0 0 20px #8957ff30}
.dashboard-stats--neon .dashboard-stat--green .dashboard-stat-icon{background:#027f6669;color:#40f1bd;box-shadow:0 0 20px #05d7ad35}
.dashboard-stats--neon .dashboard-stat--cyan .dashboard-stat-icon{background:#036e8d64;color:#22ebf8}
.dashboard-stats--neon .dashboard-stat p:last-child{font-size:22px;letter-spacing:-.02em}
.dashboard-panel--neon{
  border:1px solid #3b6bbb9e;
  border-radius:14px;
  background:linear-gradient(153deg,#0f2545ef,#101e39ef 68%,#0d254bee);
  box-shadow:0 0 16px #1160df1b,inset 0 0 30px #1164dc0d;
}
.dashboard-cases.dashboard-panel--neon{min-height:350px}
.dashboard-cases.dashboard-panel--neon h2,.dashboard-sidebar-card.dashboard-panel--neon h2{font-size:16px}
.dashboard-cases.dashboard-panel--neon .dashboard-case-table th{
  color:#c2d1e9;font-size:10px;border-bottom-color:#30496d
}
.dashboard-cases.dashboard-panel--neon .dashboard-case-table td{border-bottom-color:#294263}
.dashboard-cases.dashboard-panel--neon .dashboard-case-table tbody tr:hover{background:#3b83ff18}
.dashboard-sidebar-card.dashboard-panel--neon{padding:18px 21px}
.dashboard-sidebar-card.dashboard-panel--neon .dashboard-chart--neon{max-height:155px;filter:drop-shadow(0 0 4px #2a8cfb30)}
.dashboard-panel--neon .dashboard-timeline-dot{box-shadow:0 0 0 4px #3784ff26,0 0 13px #529bff}
.dashboard-panel--neon .dashboard-timeline li:nth-child(3n) .dashboard-timeline-dot{box-shadow:0 0 0 4px #37e2b426,0 0 13px #35e0ba}
.dashboard-sidebar-card.dashboard-panel--neon .dashboard-history-trigger{border-color:#3d68a3;color:#8fc9ff}
:global(html[data-theme='light']) .dashboard-ambient--neon{background:radial-gradient(ellipse at 50% 25%,#649cfb1b,transparent 75%)}
:global(html[data-theme='light']) .dashboard-stats--neon .dashboard-stat,
:global(html[data-theme='light']) .dashboard-panel--neon,
:global(html[data-theme='light']) .dashboard-overview-card--neon{
  background:var(--color-surface);border-color:#8caadb;box-shadow:0 0 20px #3779cc12
}
:global(html[data-theme='light']) .dashboard-stats--neon .dashboard-stat{color:var(--color-ink)}
@media(max-width:1100px){.dashboard-action-centre--neon{min-height:0}.dashboard-overview-card--neon{min-height:0}}
@media(max-width:760px){.dashboard-action-centre--neon .dashboard-next-step{flex-wrap:wrap;gap:12px}.dashboard-action-centre--neon .dashboard-review-btn{margin-left:102px}}
@media(max-width:620px){
 .dashboard-ambient--neon{inset:0!important}
 .dashboard-action-centre--neon .dashboard-next-step{padding:12px 0;gap:12px}
 .dashboard-action-centre--neon .dashboard-next-icon{width:56px;height:56px}
 .dashboard-action-centre--neon .dashboard-review-btn{margin-left:0;width:100%}
 .dashboard-stats--neon .dashboard-stat{padding:10px;min-height:75px}
 .dashboard-stats--neon .dashboard-stat-icon{width:35px;height:35px}
 .dashboard-stats--neon .dashboard-stat p:last-child{font-size:18px}
 .dashboard-overview-card--neon .dashboard-resolution-ring{width:116px;height:116px}
}

 
/* Stable native-select placement with a predictable centered chevron. */
.dashboard-status-control{position:relative;display:flex;align-items:center;flex:none;min-width:170px}
.dashboard-status-select{
  display:block;width:100%;min-width:170px;min-height:36px;
  padding:0 39px 0 14px!important;
  line-height:36px;appearance:none!important;-webkit-appearance:none!important;
  background-image:none!important;cursor:pointer
}
.dashboard-status-chevron{
  position:absolute;right:12px;top:50%;transform:translateY(-50%);
  pointer-events:none;color:var(--color-muted)
}
/* The chart must always occupy the available panel width. */
.dashboard-chart--neon{width:100%;height:150px;max-height:150px}
@media(max-width:620px){.dashboard-status-control{min-width:150px}.dashboard-status-select{min-width:150px}}
/* Align the priority content with the Action Centre header, not a separate indent. */
.dashboard-action-centre--neon > .flex:first-child{min-height:56px;align-items:center}
.dashboard-action-centre--neon .dashboard-next-step > .min-w-0{align-self:center}
.dashboard-action-centre--neon .dashboard-review-btn{align-self:center;justify-self:end;white-space:nowrap}
@media(max-width:760px){
 .dashboard-action-centre--neon .dashboard-next-step{grid-template-columns:56px minmax(0,1fr);row-gap:16px}
 .dashboard-action-centre--neon .dashboard-review-btn{grid-column:2;justify-self:start;margin-left:0!important}
}
@media(max-width:620px){
 .dashboard-action-centre--neon .dashboard-next-step{grid-template-columns:48px minmax(0,1fr);column-gap:12px;padding:12px 0}
 .dashboard-action-centre--neon .dashboard-next-icon{width:48px;height:48px}
 .dashboard-action-centre--neon .dashboard-review-btn{grid-column:1/-1;width:100%}
}

/* The recommendation is one semantic link, not an inert row with a tiny target. */
.dashboard-action-centre--neon .dashboard-next-step--interactive {
  color:inherit;text-decoration:none;cursor:pointer;border:1px solid transparent;
  border-radius:15px;padding:12px 10px 12px 6px;
  transition:background-color .2s ease,border-color .2s ease,box-shadow .2s ease;
}
.dashboard-action-centre--neon .dashboard-next-step--interactive:hover {
  background:#557dff0d;border-color:#7b93e746;box-shadow:inset 0 0 18px #557dff0d;
}
.dashboard-action-centre--neon .dashboard-next-step--interactive:focus-visible {
  outline:2px solid #76e8ff;outline-offset:3px;background:#557dff12;
}
.dashboard-action-centre--neon .dashboard-next-step--interactive:hover .dashboard-review-btn,
.dashboard-action-centre--neon .dashboard-next-step--interactive:focus-visible .dashboard-review-btn {
  background:#a1f5ff;box-shadow:0 0 28px #25e8ff85;
}
.dashboard-action-centre--neon .dashboard-next-step--empty .dashboard-next-icon {
  color:#40d9b2;border-color:#31ba9a;background:#123a39;
  box-shadow:0 0 20px #20ad8b38;animation:none;
}
@media(prefers-reduced-motion:reduce){
  .dashboard-action-centre--neon .dashboard-next-step--interactive{transition:none}
}
</style>