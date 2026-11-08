
<script setup lang="ts">
import { Activity, AlertTriangle, ArrowRight, BarChart3, CheckCircle2, X, History, Clock3, FileStack, FolderOpen, Inbox, Plus, RotateCcw, Search, ShieldCheck, ShoppingCart, Sparkles, Timer, Wallet } from 'lucide-vue-next';
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
    <div class="dashboard-ambient" aria-hidden="true">
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

      <aside class="space-y-4">
        <section class="card dashboard-sidebar-card">
          <h2 class="flex items-center gap-2 font-bold"><BarChart3 class="size-5 text-primary" /> Last 14 days</h2>
          <p class="mt-1 text-xs text-muted">Cases opened and resolved, from the audit log</p>
          <div v-if="chart.days.length" class="mt-4">
            <svg class="dashboard-chart w-full" preserveAspectRatio="xMidYMid meet" viewBox="0 0 560 138" role="img" :aria-label="`Cases opened and resolved across ${chart.days.length} days`">
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
.dashboard-chart{display:block;height:auto;max-height:150px;overflow:hidden;contain:paint}
.dashboard-sidebar-card{overflow:hidden}
.dashboard-chart polyline{vector-effect:non-scaling-stroke}
.dashboard-chart-labels{overflow:hidden}
.dashboard-timeline{margin-left:7px;border-left:1px solid var(--color-line)}
.dashboard-timeline-dot{position:absolute;left:-6px;top:5px;width:11px;height:11px;border-radius:50%;background:#6293fa;box-shadow:0 0 0 4px #4286ff19}
.dashboard-timeline li:nth-child(3n) .dashboard-timeline-dot{background:#42d7b6}
.dashboard-measured{opacity:.85}
@media(max-width:1100px){.dashboard-feature-grid{grid-template-columns:1fr}.dashboard-attention{flex-wrap:wrap}.dashboard-content-grid{grid-template-columns:1fr}}
@media(max-width:620px){.dashboard-greeting{padding-block:17px}.dashboard-attention,.dashboard-ai-card{padding:16px}.dashboard-alert-icon{width:48px;height:48px}.dashboard-review-btn{width:100%}.dashboard-stats{gap:8px}.dashboard-stat{gap:8px;padding:10px;min-height:66px}.dashboard-stat-icon{width:32px;height:32px}.dashboard-stat-icon svg{width:17px;height:17px}.dashboard-stat p:last-child{font-size:17px}.dashboard-ai-metrics>div{padding-inline:6px}}
@media(prefers-reduced-motion:reduce){.dashboard-arrival{animation:none}}

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
</style>