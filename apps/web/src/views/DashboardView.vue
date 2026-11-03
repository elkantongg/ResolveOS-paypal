
<script setup lang="ts">
import { ArrowRight, Inbox, Plus, RotateCcw, Search, ShoppingCart } from 'lucide-vue-next';
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import { api, errorMessage } from '@/api/client';
import type { AuditEvent, CaseStatus, CaseSummary, DashboardSummary } from '@/api/types';
import ErrorNotice from '@/components/ErrorNotice.vue';
import Skeleton from '@/components/Skeleton.vue';
import SourceBadge from '@/components/SourceBadge.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { describeEvent, money, STATUS_LABEL, timeAgo } from '@/lib/format';
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
onMounted(load);

let debounce: ReturnType<typeof setTimeout> | null = null;
watch([query, status], () => {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => loadCases().catch((e) => (error.value = errorMessage(e))), 250);
});

async function resetDemo() {
  if (!confirm('Reset the demo? This deletes every case and transaction record in this local database and signs everyone out. PayPal sandbox payments themselves are not touched.')) return;
  resetting.value = true;
  try {
    await api.post('/demo/reset');
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
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="eyebrow">{{ session.role === 'MERCHANT' ? 'Merchant workspace' : session.role === 'BUYER' ? 'Your cases' : 'All cases' }}</p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight">Welcome back, {{ greeting }}</h1>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn btn-ghost btn-sm" :disabled="resetting" @click="resetDemo"><RotateCcw class="size-3.5" /> Reset demo</button>
        <template v-if="session.role === 'BUYER'">
          <RouterLink to="/purchase" class="btn btn-secondary"><ShoppingCart class="size-4" /> Create sandbox transaction</RouterLink>
          <RouterLink to="/cases/new" class="btn btn-primary"><Plus class="size-4" /> Report a problem</RouterLink>
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
