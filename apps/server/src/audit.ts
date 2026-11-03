import { EventEmitter } from 'node:events';

import type { Tx } from './db/index.js';
import { auditEvents } from './db/schema.js';

/**
 * Every meaningful change is recorded as an audit event in the same database transaction as the
 * change. After the transaction commits, the event is also published to live listeners (the
 * negotiation room's Server-Sent Events), so what the screen animates is always something the
 * backend actually recorded. On refresh, the same history is read back from the table.
 */

export type ActorType = 'USER' | 'AGENT' | 'SYSTEM' | 'PAYPAL';

export interface AuditInput {
  caseId: string | null;
  actorType: ActorType;
  actorUserId?: string | null;
  action: string;
  details?: Record<string, unknown>;
}

export interface AuditRecord {
  id: string;
  caseId: string | null;
  actorType: ActorType;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
}

const bus = new EventEmitter();
bus.setMaxListeners(200);

export async function audit(tx: Tx, input: AuditInput): Promise<AuditRecord> {
  const [row] = await tx
    .insert(auditEvents)
    .values({
      caseId: input.caseId,
      actorType: input.actorType,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      details: input.details ?? {},
    })
    .returning();
  if (!row) throw new Error('audit insert returned nothing');
  return {
    id: row.id,
    caseId: row.caseId,
    actorType: row.actorType,
    action: row.action,
    details: row.details as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Publish already-committed records to live listeners. */
export function publish(records: AuditRecord[]): void {
  for (const record of records) {
    if (record.caseId) bus.emit(`case:${record.caseId}`, record);
    bus.emit('all', record);
  }
}

export function subscribe(caseId: string, listener: (record: AuditRecord) => void): () => void {
  const channel = `case:${caseId}`;
  bus.on(channel, listener);
  return () => bus.off(channel, listener);
}
