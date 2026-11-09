import { onBeforeUnmount, ref } from 'vue';

import type { AuditEvent } from '@/api/types';

/**
 * Live audit events for one case over Server-Sent Events. The screen animates only what the
 * server recorded; on reconnect or refresh the full history is read back from the API.
 */
export function useCaseEvents(caseId: string, onEvent: (event: AuditEvent) => void, onReconnect?: () => void) {
  const connected = ref(false);
  let source: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let connectedBefore = false;

  function connect() {
    source = new EventSource(`/api/cases/${caseId}/events`, { withCredentials: true });
    source.addEventListener('ready', () => {
      connected.value = true;
      if (connectedBefore) onReconnect?.(); // events sent during the gap were missed
      connectedBefore = true;
    });
    source.addEventListener('audit', (message) => {
      try {
        onEvent(JSON.parse((message as MessageEvent).data) as AuditEvent);
      } catch {
        /* ignore malformed frames */
      }
    });
    source.onerror = () => {
      connected.value = false;
      source?.close();
      retry = setTimeout(connect, 3000);
    };
  }

  connect();
  onBeforeUnmount(() => {
    if (retry) clearTimeout(retry);
    source?.close();
  });
  return { connected };
}
