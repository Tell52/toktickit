const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
export type ActionStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export interface ActionTaken {
  id: string; ticketId: number; ticketNumber: string; resolutionCycle: number;
  actionAt: string; description: string; result: string | null;
  performedBy: { id: string; name: string }; assignee: { id: string; name: string; isActive: boolean };
  status: ActionStatus; followUpRequired: boolean; followUpNote: string | null;
  attachmentNotes: string | null; cancellationReason: string | null;
  version: number; createdAt: string; updatedAt: string;
}
export interface Paging { page: number; pageSize: number; totalCount: number }
export interface ActionsResponse { actions: ActionTaken[]; pagination: Paging; ticketVersion: number; resolutionCycle: number }
export interface Revision { revision: number; createdAt: string; actor: { id: string; name: string }; snapshot: Record<string, string | boolean | number | null> }
export interface ActionWrite {
  expectedTicketVersion: number; expectedVersion?: number; actionAt?: string;
  description?: string; result?: string | null; assigneeId?: string;
  followUpRequired?: boolean; followUpNote?: string | null; attachmentNotes?: string | null;
  status?: ActionStatus; cancellationReason?: string;
}
export class ActionsError extends Error {
  constructor(public status: number, public code: string, public fields: string[] = []) { super(code); }
}
async function call<T>(path: string, method = 'GET', body?: ActionWrite, key?: string): Promise<T> {
  const headers = new Headers();
  if (body) headers.set('Content-Type', 'application/json');
  if (method !== 'GET') {
    const csrf = localStorage.getItem('csrfToken');
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }
  if (key) headers.set('Idempotency-Key', key);
  const response = await fetch(`${API_URL}${path}`, { method, headers, credentials: 'include', cache: 'no-store', ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ActionsError(response.status, data?.error?.code ?? 'REQUEST_FAILED', Object.keys(data?.error?.details?.fields ?? {}));
  }
  return response.json();
}
const ticketPath = (id: string | number) => encodeURIComponent(String(id));
export const getActions = (id: string | number, page = 1) => call<ActionsResponse>(`/api/tickets/${ticketPath(id)}/actions?page=${page}&pageSize=20`);
export const createAction = (id: string | number, body: ActionWrite, key: string) => call<{ action: ActionTaken; ticketVersion: number }>(`/api/staff/tickets/${ticketPath(id)}/actions`, 'POST', body, key);
export const updateAction = (id: string | number, actionId: string, body: ActionWrite) => call<{ action: ActionTaken; ticketVersion: number }>(`/api/staff/tickets/${ticketPath(id)}/actions/${encodeURIComponent(actionId)}`, 'PATCH', body);
export const getActionRevisions = (id: string | number, actionId: string, page = 1) => call<{ revisions: Revision[]; pagination: Paging }>(`/api/staff/tickets/${ticketPath(id)}/actions/${encodeURIComponent(actionId)}/revisions?page=${page}&pageSize=20`);
