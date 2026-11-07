
<script setup lang="ts">
import { Activity, AlertTriangle, ArrowRight, BarChart3, CheckCircle2, Clock3, FileStack, FolderOpen, Inbox, Plus, RotateCcw, Search, ShieldCheck, ShoppingCart, Sparkles, Timer, Wallet } from 'lucide-vue-next';
import { computed, onMounted, ref, watch } from 'vue';
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
const activity = ref<(AuditEvent & { reference: string; title: string })[]>([]);
const error = ref<string | null>(null);
const query = ref('');
const status = ref<'ALL' | CaseStatus>('ALL');
const resetting = ref(false);
const arrivingFromDemo = ref(typeof window !== 'undefined' && window.sessionStorage.getItem('resolveos-dashboard-entrance') === '1');

async function loadCases() {
  const params = new URLSearchParams({ status: status.value });
  if (query.value.trim()) params.set('q', query.value.trim());
  cases.value = (await api.get<{ cases: CaseSummary[] }>(`/cases?${params}`)).cases;
}

async function load() {
  error.value = null;
  try {
    const [s, a] = await Promise.all([
      api.get<DashboardSummary>('/dashboard/summary'),
      api.get<{ activity: (AuditEvent & { reference: string; title: string })[] }>('/dashboard/activity'),
      loadCases(),
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
  const days = summary.value?.activity ?? [];
  const peak = Math.max(1, ...days.map((d) => Math.max(d.opened, d.resolved)));
  return { days, peak };
});
const greeting = computed(() => (session.role === 'MERCHANT' ? session.me?.merchant?.businessName ?? 'Merchant' : session.user?.name.split(' ')[0]));
const priorityCase = computed(() => {
  const list = cases.value ?? [];
  const order: Record<CaseStatus, number> = {
    AWAITING_APPROVAL: 0, ESCALATED: 1, NO_AGREEMENT: 2,
    PAYMENT_PROCESSING: 3, IN_NEGOTIATION: 4, OPEN: 5, RESOLVED: 6,
  };
  return [...list].filter((item) => item.status !== 'RESOLVED')
    .sort((a, b) => order[a.status] - order[b.status])[0] ?? null;
});
const priorityHeadline = computed(() => {
  if (!priorityCase.value) return 'Your cases are up to date';
  if (priorityCase.value.status === 'AWAITING_APPROVAL') return 'A settlement needs your approval';
  if (priorityCase.value.status === 'NO_AGREEMENT') return 'A dispute needs your attention';
  if (priorityCase.value.status === 'ESCALATED') return 'A dispute needs human review';
  if (priorityCase.value.status === 'PAYMENT_PROCESSING') return 'A refund is being processed';
  if (priorityCase.value.status === 'IN_NEGOTIATION') return 'Your AI agents are negotiating';
  return 'A case is ready for review';
});
const priorityDescription = computed(() => {
  const item = priorityCase.value;
  if (!item) return 'No unresolved cases to review right now.';
  if (item.status === 'NO_AGREEMENT') return `${item.reference} ended without an agreement. Review the outcome and available next steps.`;
  if (item.status === 'AWAITING_APPROVAL') return `${item.reference} has a proposed settlement awaiting review. Check the terms before approving.`;
  if (item.status === 'ESCALATED') return `${item.reference} requires a person to review the dispute.`;
  return `${item.reference} · ${item.title} · ${STATUS_LABEL[item.status]}`;
});
const statTiles = computed(() => summary.value ? [
  { label: 'Total cases', value: String(summary.value.totalCases), icon: FileStack, tone: 'indigo' },
  { label: 'Open', value: String(summary.value.openCases), icon: FolderOpen, tone: 'blue' },
  { label: 'Awaiting approval', value: String(summary.value.awaitingApproval), icon: Clock3, tone: 'violet' },
  { label: 'Resolved', value: String(summary.value.resolved), icon: CheckCircle2, tone: 'green' },
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

    <div class="dashboard-feature-grid grid gap-4 lg:grid-cols-[1.52fr_1fr]">
      <section class="dashboard-attention card" aria-label="Case attention">
        <div class="dashboard-alert-icon"><AlertTriangle class="size-8" /></div>
        <div class="dashboard-attention-copy">
          <h2 class="text-lg font-bold tracking-tight">{{ priorityHeadline }}</h2>
          <p class="mt-1 text-sm text-muted">{{ priorityDescription }}</p>
        </div>
        <RouterLink v-if="priorityCase" :to="`/cases/${priorityCase.id}`" class="btn dashboard-review-btn">
          Review case <ArrowRight class="size-4" />
        </RouterLink>
        <div class="dashboard-light-arc" aria-hidden="true" />
      </section>
      <section class="card dashboard-ai-card" aria-label="AI resolution insight">
        <div class="flex items-start gap-3">
          <Sparkles class="mt-0.5 size-6 shrink-0 text-accent" />
          <div>
            <h2 class="font-bold">AI resolution insight</h2>
            <p class="text-xs text-muted">AI suggests, people approve, PayPal executes.</p>
          </div>
        </div>
        <div v-if="summary" class="dashboard-ai-metrics mt-4 grid grid-cols-3">
          <div><Activity class="size-4 text-primary" /><strong class="tabular">{{ summary.measured.agentTurns }}</strong><span>Agent turns</span></div>
          <div><Timer class="size-4 text-accent" /><strong class="tabular">{{ duration(summary.measured.medianNegotiationSeconds) }}</strong><span>Median negotiation</span></div>
          <div><ShieldCheck class="size-4 text-accent" /><strong class="tabular">{{ summary.measured.guardrailRejections }}</strong><span>Guardrail rejections</span></div>
        </div>
        <div v-else class="mt-4"><Skeleton :lines="2" /></div>
      </section>
    </div>

    <div class="dashboard-stats grid grid-cols-2 gap-3 lg:grid-cols-5">
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
      <section class="card dashboard-cases overflow-hidden">
        <div class="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <h2 class="mr-auto flex items-center gap-2.5 font-bold"><FolderOpen class="size-5 text-primary" /> Cases</h2>
          <label class="relative">
            <span class="sr-only">Search cases</span>
            <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input v-model="query" class="input !h-9 w-56 pl-9" placeholder="Search title or RA-…" />
          </label>
          <select v-model="status" class="input !h-9 !w-auto" aria-label="Filter by status">
            <option value="ALL">All statuses</option>
            <option v-for="(label, key) in STATUS_LABEL" :key="key" :value="key">{{ label }}</option>
          </select>
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
              <tr v-for="item in cases" :key="item.id">
                <td><RouterLink class="font-semibold text-primary hover:underline" :to="`/cases/${item.id}`">{{ item.reference }}</RouterLink></td>
                <td><RouterLink class="font-medium hover:text-primary" :to="`/cases/${item.id}`">{{ item.title }}</RouterLink><div class="mt-1 sm:hidden"><SourceBadge :source="item.sourceType" :capture-id="item.sourceType === 'PAYPAL_SANDBOX' ? 'yes' : null" /></div></td>
                <td class="text-ink-soft">{{ session.role === 'BUYER' ? item.merchantName : session.role === 'MERCHANT' ? item.buyerName : item.buyerName + ' ↔ ' + item.merchantName }}</td>
                <td class="font-semibold tabular">{{ money(item.amountMinor, item.currency) }}</td>
                <td><div class="flex flex-wrap items-center gap-2"><SourceBadge :source="item.sourceType" :capture-id="item.sourceType === 'PAYPAL_SANDBOX' ? 'yes' : null" /><StatusBadge :status="item.status" /></div></td>
                <td class="whitespace-nowrap text-muted">{{ timeAgo(item.updatedAt) }}</td>
                <td><RouterLink :to="`/cases/${item.id}`" :aria-label="`Open ${item.reference}`" class="inline-flex rounded p-1 text-muted hover:text-primary"><ArrowRight class="size-4" /></RouterLink></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <aside class="space-y-4">
        <section class="card dashboard-sidebar-card">
          <h2 class="flex items-center gap-2 font-bold"><BarChart3 class="size-5 text-primary" /> Last 14 days</h2>
          <p class="mt-1 text-xs text-muted">Cases opened and resolved, from the audit log</p>
          <div v-if="chart.days.length" class="mt-4">
            <svg class="dashboard-chart w-full" viewBox="0 0 560 138" role="img" :aria-label="`Cases opened and resolved across ${chart.days.length} days`">
              <g v-for="tick in graphPlot.ticks" :key="tick.y">
                <line x1="26" :y1="tick.y" x2="534" :y2="tick.y" stroke="var(--color-line)" stroke-width="1" />
              </g>
              <polyline :points="graphPlot.opened" fill="none" stroke="#6293fa" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
              <polyline :points="graphPlot.resolved" fill="none" stroke="#42d7b6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
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
          <h2 class="mb-4 flex items-center gap-2 font-bold"><Activity class="size-5 text-primary" /> Latest activity</h2>
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
    <section v-if="summary" class="dashboard-measured mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted" aria-label="Measured impact">
      <p class="inline-flex items-center gap-1.5"><Timer class="size-3.5" /> Measured from the audit log</p>
      <p>Median complaint → resolution <strong class="text-ink">{{ duration(summary.measured.medianResolutionSeconds) }}</strong> ({{ summary.measured.resolvedCasesMeasured }} resolved)</p>
      <p>PayPal dispute inquiry window: up to {{ summary.measured.paypalInquiryWindowDays }} days (maximum, not average).</p>
    </section>
  </div>
</template>
      </div>
    </div>

    <ErrorNotice v-if="error" :message="error" @retry="load" />

    <div class="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <template v-if="summary">
        <div
          v-for="tile in [
            { label: 'Total cases', value: summary.totalCases },
            { label: 'Open', value: summary.openCases },
            { label: 'Awaiting approval', value: summary.awaitingApproval },
            { label: 'Resolved', value: summary.resolved },
          ]" :key="tile.label" class="card px-5 py-4"
        >
          <p class="text-xs font-medium text-muted">{{ tile.label }}</p>
          <p class="mt-1 text-3xl font-semibold tracking-tight tabular">{{ tile.value }}</p>
        </div>
        <div class="card col-span-2 px-5 py-4 lg:col-span-1">
          <p class="text-xs font-medium text-muted">Refunded via PayPal</p>
          <p class="mt-1 text-3xl font-semibold tracking-tight text-ok tabular">{{ money(refundTotal, 'USD') }}</p>
          <p class="text-[11px] text-muted">PayPal-confirmed only</p>
        </div>
      </template>
      <div v-for="i in 5" v-else :key="i" class="card px-5 py-4"><Skeleton :lines="2" /></div>
    </div>

    <section v-if="summary" class="card flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4" aria-label="Measured impact">
      <p class="flex items-center gap-2 text-sm font-semibold"><Timer class="size-4 text-accent" /> Measured from the audit log</p>
      <p class="text-sm"><span class="text-muted">Median complaint → resolution </span><span class="font-semibold tabular">{{ duration(summary.measured.medianResolutionSeconds) }}</span><span class="text-xs text-muted"> ({{ summary.measured.resolvedCasesMeasured }} resolved)</span></p>
      <p class="text-sm"><span class="text-muted">Median agent negotiation </span><span class="font-semibold tabular">{{ duration(summary.measured.medianNegotiationSeconds) }}</span></p>
      <p class="text-sm"><span class="text-muted">Agent turns </span><span class="font-semibold tabular">{{ summary.measured.agentTurns }}</span><span class="text-muted"> · guardrail rejections </span><span class="font-semibold tabular">{{ summary.measured.guardrailRejections }}</span></p>
      <p class="text-xs text-muted">Observed in this app only. For context, PayPal’s dispute inquiry stage can last up to {{ summary.measured.paypalInquiryWindowDays }} days (a maximum, not an average).</p>
    </section>

    <div class="grid gap-6 xl:grid-cols-[1fr_360px]">
      <section class="card overflow-hidden">
        <div class="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <p class="mr-auto font-semibold">Cases</p>
          <label class="relative">
            <span class="sr-only">Search cases</span>
            <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input v-model="query" class="input !h-9 w-56 pl-9" placeholder="Search title or RA-…" />
          </label>
          <select v-model="status" class="input !h-9 !w-auto" aria-label="Filter by status">
            <option value="ALL">All statuses</option>
            <option v-for="(label, key) in STATUS_LABEL" :key="key" :value="key">{{ label }}</option>
          </select>
        </div>
        <div v-if="cases === null" class="p-5"><Skeleton :lines="5" /></div>
        <div v-else-if="!cases.length" class="px-6 py-16 text-center">
          <Inbox class="mx-auto mb-3 size-9 text-faint" />
          <p class="font-semibold">No cases here</p>
          <p class="mt-1 text-sm text-muted">{{ query || status !== 'ALL' ? 'Try another search or filter.' : 'When a buyer reports a problem, it appears here.' }}</p>
        </div>
        <ul v-else class="divide-y divide-line">
          <li v-for="item in cases" :key="item.id">
            <RouterLink :to="`/cases/${item.id}`" class="group grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 transition hover:bg-sunken/60 sm:grid-cols-[1fr_auto_auto_auto]">
              <div class="min-w-0">
                <p class="flex items-center gap-2 truncate font-medium">
                  <span class="mono text-muted">{{ item.reference }}</span> {{ item.title }}
                </p>
                <p class="truncate text-xs text-muted">{{ item.buyerName }} ↔ {{ item.merchantName }} · updated {{ timeAgo(item.updatedAt) }}</p>
              </div>
              <SourceBadge :source="item.sourceType" :capture-id="item.sourceType === 'PAYPAL_SANDBOX' ? 'yes' : null" class="hidden sm:inline-flex" />
              <span class="hidden text-right text-sm font-semibold tabular sm:block">{{ money(item.amountMinor, item.currency) }}</span>
              <span class="flex items-center gap-2"><StatusBadge :status="item.status" /><ArrowRight class="size-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-primary" /></span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <div class="space-y-6">
        <section class="card p-5">
          <p class="font-semibold">Last 14 days</p>
          <p class="mb-4 text-xs text-muted">Cases opened and resolved, from the audit log</p>
          <div v-if="chart.days.length" class="flex h-28 items-end gap-1.5" role="img" :aria-label="`Activity over ${chart.days.length} days`">
            <div v-for="day in chart.days" :key="day.day" class="flex flex-1 items-end gap-0.5" :title="`${day.day}: ${day.opened} opened, ${day.resolved} resolved`">
              <span class="flex-1 rounded-t bg-primary/70" :style="{ height: `${(day.opened / chart.peak) * 100}%`, minHeight: day.opened ? '4px' : '0' }" />
              <span class="flex-1 rounded-t bg-accent-bright" :style="{ height: `${(day.resolved / chart.peak) * 100}%`, minHeight: day.resolved ? '4px' : '0' }" />
            </div>
          </div>
          <p v-else class="py-8 text-center text-sm text-muted">No activity yet.</p>
          <p class="mt-3 flex gap-4 text-xs text-muted">
            <span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-sm bg-primary/70" /> Opened</span>
            <span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-sm bg-accent-bright" /> Resolved</span>
          </p>
        </section>

        <section class="card p-5">
          <p class="mb-3 font-semibold">Latest activity</p>
          <p v-if="!activity.length" class="text-sm text-muted">Nothing yet.</p>
          <ol class="space-y-3">
            <li v-for="event in activity.slice(0, 8)" :key="event.id" class="text-sm">
              <p class="text-ink-soft"><span class="mono text-muted">{{ event.reference }}</span> {{ describeEvent(event) }}</p>
              <p class="text-xs text-muted">{{ timeAgo(event.createdAt) }}</p>
            </li>
          </ol>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-arrival{animation:dashboard-arrival .9s cubic-bezier(.17,.75,.25,1) both}
@keyframes dashboard-arrival{from{opacity:0;transform:translateY(24px);filter:blur(6px)}to{opacity:1;transform:translateY(0);filter:blur(0)}}
.resolve-dashboard{--dash-blue:#69a4ff}
.dashboard-greeting{padding-block:30px 24px}
.dashboard-attention,.dashboard-ai-card{position:relative;min-height:118px;overflow:hidden;padding:17px 21px}
.dashboard-attention{display:flex;align-items:center;gap:18px;border-color:#498eefba;background:linear-gradient(112deg,var(--color-surface),var(--color-surface) 58%,color-mix(in srgb,var(--color-primary) 13%,var(--color-surface)));box-shadow:inset 0 1px 0 #63a9ff10}
.dashboard-alert-icon{display:grid;place-items:center;flex:none;width:60px;height:60px;border-radius:17px;color:#46d6f1;background:#11a2d318;box-shadow:inset 0 0 20px #15b8e51b,0 0 20px #2383d323}
.dashboard-attention-copy{z-index:1;min-width:0;flex:1}
.dashboard-attention-copy p{max-width:490px}
.dashboard-review-btn{z-index:1;flex:none;background:#77e6f9;color:#08203f;box-shadow:0 0 16px #39c9f933;font-weight:700}
.dashboard-review-btn:hover{background:#a1f5ff}
.dashboard-light-arc{position:absolute;right:20%;top:-70%;width:160px;height:290px;transform:rotate(42deg);border-right:5px solid #3fc6fa60;border-radius:50%;filter:drop-shadow(0 0 12px #2dbeff);pointer-events:none}
.dashboard-ai-card{padding:17px 19px}
.dashboard-ai-metrics>div{display:grid;grid-template-columns:auto 1fr;column-gap:8px;row-gap:2px;align-items:center;min-width:0;padding-inline:12px;border-right:1px solid var(--color-line)}
.dashboard-ai-metrics>div:first-child{padding-left:0}
.dashboard-ai-metrics>div:last-child{border-right:0;padding-right:0}
.dashboard-ai-metrics strong{font-size:14px;white-space:nowrap}
.dashboard-ai-metrics span{grid-column:1/-1;font-size:10px;color:var(--color-muted)}
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
.dashboard-chart{height:120px;overflow:visible}
.dashboard-timeline{margin-left:7px;border-left:1px solid var(--color-line)}
.dashboard-timeline-dot{position:absolute;left:-6px;top:5px;width:11px;height:11px;border-radius:50%;background:#6293fa;box-shadow:0 0 0 4px #4286ff19}
.dashboard-timeline li:nth-child(3n) .dashboard-timeline-dot{background:#42d7b6}
.dashboard-measured{opacity:.85}
@media(max-width:1100px){.dashboard-feature-grid{grid-template-columns:1fr}.dashboard-attention{flex-wrap:wrap}.dashboard-content-grid{grid-template-columns:1fr}}
@media(max-width:620px){.dashboard-greeting{padding-block:17px}.dashboard-attention,.dashboard-ai-card{padding:16px}.dashboard-alert-icon{width:48px;height:48px}.dashboard-review-btn{width:100%}.dashboard-stats{gap:8px}.dashboard-stat{gap:8px;padding:10px;min-height:66px}.dashboard-stat-icon{width:32px;height:32px}.dashboard-stat-icon svg{width:17px;height:17px}.dashboard-stat p:last-child{font-size:17px}.dashboard-ai-metrics>div{padding-inline:6px}}
@media(prefers-reduced-motion:reduce){.dashboard-arrival{animation:none}}
</style>