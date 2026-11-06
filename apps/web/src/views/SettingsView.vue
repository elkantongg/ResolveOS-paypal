
<script setup lang="ts">
import { BadgeCheck, CircleAlert, Cpu, CreditCard, Webhook } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';

import { errorMessage } from '@/api/client';
import ErrorNotice from '@/components/ErrorNotice.vue';
import { useSession } from '@/stores/session';

/** Integration readiness. Never shows a secret: only whether each piece is configured and working. */
const session = useSession();
const error = ref<string | null>(null);
const checking = ref(false);

async function check() {
  checking.value = true;
  error.value = null;
  try {
    await session.loadStatus();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    checking.value = false;
  }
}
onMounted(check);
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-5">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Settings &amp; integrations</h1>
        <p class="mt-1 text-sm text-muted">Configured in <span class="mono">.env</span> on the server. Secrets are never sent to the browser.</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="checking" @click="check">{{ checking ? 'Checking…' : 'Check again' }}</button>
    </div>
    <ErrorNotice v-if="error" :message="error" />

    <ul v-if="session.status" class="space-y-3">
      <li class="card flex items-start gap-4 p-5">
        <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><CreditCard class="size-5" /></span>
        <div class="flex-1">
          <p class="flex items-center gap-2 font-semibold">PayPal <span class="rounded-md bg-sunken px-1.5 py-px text-xs font-medium text-muted">Sandbox</span></p>
          <p class="text-sm text-muted">Orders, captures and refunds via PayPal’s REST APIs. Test money only; live payments are out of scope.</p>
          <p v-if="session.status.problem" class="mt-1 text-sm text-danger">{{ session.status.problem }}</p>
        </div>
        <span :class="session.status.connected ? 'text-ok' : 'text-danger'" class="flex items-center gap-1 text-sm font-semibold">
          <BadgeCheck v-if="session.status.connected" class="size-4" /><CircleAlert v-else class="size-4" />
          {{ session.status.connected ? 'Connected' : 'Not connected' }}
        </span>
      </li>
      <li class="card flex items-start gap-4 p-5">
        <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-merchant-soft text-merchant"><Webhook class="size-5" /></span>
        <div class="flex-1">
          <p class="font-semibold">PayPal webhooks</p>
          <p class="text-sm text-muted">Signature-verified events (refund completed / pending / failed) update payment state. Needs a public HTTPS URL and <span class="mono">PAYPAL_WEBHOOK_ID</span>; without it, refunds are still confirmed from PayPal’s API responses.</p>
        </div>
        <span :class="session.status.webhookConfigured ? 'text-ok' : 'text-warn'" class="text-sm font-semibold">{{ session.status.webhookConfigured ? 'Configured' : 'Optional · not set' }}</span>
      </li>
      <li class="card flex items-start gap-4 p-5">
        <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-referee-soft text-referee"><Cpu class="size-5" /></span>
        <div class="flex-1">
          <p class="font-semibold">AI provider</p>
          <p class="text-sm text-muted">Any OpenAI-compatible API (Groq by default). Agents return schema-checked JSON; the server enforces every limit. Without a key, only the labelled deterministic demo negotiator runs.</p>
        </div>
        <span :class="session.status.aiConfigured ? 'text-ok' : 'text-warn'" class="text-sm font-semibold">{{ session.status.aiConfigured ? 'Live AI ready' : 'Demo engine only' }}</span>
      </li>
    </ul>

    <section class="card p-5 text-sm text-ink-soft">
      <p class="mb-2 font-semibold text-ink">Trust principles</p>
      <ul class="list-disc space-y-1 pl-5">
        <li>Agents can only propose. They have no access to payments or approvals.</li>
        <li>A refund runs only after the buyer and the merchant each approve the exact same terms.</li>
        <li>Amounts, currency and limits are checked by the server, never trusted from the model.</li>
        <li>Only a PayPal-confirmed refund is ever shown as successful.</li>
        <li>ResolveOS is independent of PayPal and does not replace PayPal’s Resolution Center.</li>
      </ul>
    </section>
  </div>
</template>
