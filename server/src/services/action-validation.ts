import { ActionStatus, ActionTaken } from '@prisma/client';
import { ApiError, invalid } from './api-error.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid(value: unknown, field: string) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) invalid(field, 'A UUID is required.');
  return value.toLowerCase();
}
export function version(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2_147_483_647) invalid(field, 'A positive integer version is required.');
  return value;
}
export function ticketIdentity(value: string): { id: number } | { ticketNumber: string } {
  if (/^\d+$/.test(value)) return { id: version(Number(value), 'id') };
  if (!/^[a-z][a-z0-9_-]{0,127}$/i.test(value)) invalid('id', 'A positive Ticket ID or Ticket number is required.');
  return { ticketNumber: value };
}
export function pagination(query: Record<string, unknown>) {
  if (Object.keys(query).some(key => !['page', 'pageSize'].includes(key))) invalid('query', 'Unsupported query parameter.');
  const number = (key: string, fallback: number) => {
    const value = query[key];
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) invalid(key, 'A positive integer is required.');
    return version(Number(value), key);
  };
  const page = number('page', 1), pageSize = number('pageSize', 20);
  if (pageSize > 50) invalid('pageSize', 'Maximum page size is 50.');
  const skip = (page - 1) * pageSize;
  if (skip > 2_147_483_647) invalid('page', 'Page is out of range.');
  return { page, pageSize, skip };
}

export function parseActionAt(value: unknown): Date {
  if (typeof value !== 'string') invalid('actionAt', 'Use an ISO datetime with an explicit offset.');
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/i.exec(value);
  if (!parts) invalid('actionAt', 'Use an ISO datetime with an explicit offset.');
  const [, year, month, date, hour, minute, second, offset] = parts;
  const lastDay = new Date(0);
  lastDay.setUTCFullYear(Number(year), Number(month), 0);
  const result = new Date(value);
  if (Number(year) < 1 || Number(month) < 1 || Number(month) > 12 || Number(date) < 1 || Number(date) > lastDay.getUTCDate() ||
      Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 ||
      (offset.toUpperCase() !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59)) || !Number.isFinite(result.getTime())) {
    invalid('actionAt', 'Use a valid calendar date and offset.');
  }
  return result;
}
export function validateActionDate(actionAt: Date, ticketCreatedAt: Date, now: Date) {
  if (actionAt < ticketCreatedAt || actionAt > now) invalid('actionAt', 'Action time must be between Ticket creation and server time.');
}
function text(value: unknown, field: string, max: number, required = false): string | null {
  if (!required && value === null) return null;
  if (typeof value !== 'string') invalid(field, 'Text is required.');
  const result = value.trim();
  if (Array.from(result).length > max || result.includes('\0') || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(result)) invalid(field, `Use valid text of at most ${max} characters.`);
  if (required && !result) invalid(field, 'This field is required.');
  return result || null;
}
type Mutable = Pick<ActionTaken, 'actionAt' | 'description' | 'result' | 'assigneeId' | 'followUpRequired' | 'followUpNote' | 'attachmentNotes' | 'status' | 'cancellationReason'>;
export type ActionInput = Partial<Mutable> & { expectedTicketVersion: number; expectedVersion?: number };
const contentFields = ['actionAt', 'description', 'result', 'assigneeId', 'followUpRequired', 'followUpNote', 'attachmentNotes'];
export function parseActionInput(body: unknown, patch = false): ActionInput {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) invalid('body', 'A JSON object is required.');
  const record = body as Record<string, unknown>;
  const allowed = [...contentFields, 'expectedTicketVersion', ...(patch ? ['expectedVersion', 'status', 'cancellationReason'] : [])];
  for (const key of Object.keys(record)) if (!allowed.includes(key)) invalid('body', 'This request contains unsupported fields.');
  const input: ActionInput = { expectedTicketVersion: version(record.expectedTicketVersion, 'expectedTicketVersion') };
  if (patch) input.expectedVersion = version(record.expectedVersion, 'expectedVersion');
  if (!patch || 'description' in record) input.description = text(record.description, 'description', 2000, true)!;
  if ('actionAt' in record) input.actionAt = parseActionAt(record.actionAt);
  if ('assigneeId' in record) input.assigneeId = uuid(record.assigneeId, 'assigneeId');
  if ('followUpRequired' in record) {
    if (typeof record.followUpRequired !== 'boolean') invalid('followUpRequired', 'Use true or false.');
    input.followUpRequired = record.followUpRequired;
  }
  for (const key of ['result', 'followUpNote', 'attachmentNotes', 'cancellationReason'] as const) {
    if (key in record) input[key] = text(record[key], key, key === 'result' ? 2000 : 1000);
  }
  if ('status' in record) {
    if (!Object.values(ActionStatus).includes(record.status as ActionStatus)) invalid('status', 'Invalid action status.');
    input.status = record.status as ActionStatus;
  }
  if (patch && Object.keys(input).length === 2) invalid('body', 'Supply at least one changed field.');
  return input;
}

export function mergeAction(current: ActionTaken, input: ActionInput, now: Date, ticketCreatedAt: Date): Mutable {
  if (current.status === 'CANCELLED') throw new ApiError(409, 'ACTION_NOT_EDITABLE', 'Cancelled actions are read-only.');
  if (input.status === current.status) invalid('status', 'Choose a different status.');
  if (current.status === 'COMPLETED' && (input.status !== undefined || input.assigneeId !== undefined)) throw new ApiError(409, 'ACTION_NOT_EDITABLE', 'Completed action status and assignee are fixed.');
  const transitions: Record<ActionStatus, ActionStatus[]> = { PLANNED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'], IN_PROGRESS: ['COMPLETED', 'CANCELLED'], COMPLETED: [], CANCELLED: [] };
  if (input.status && !transitions[current.status].includes(input.status)) throw new ApiError(409, 'INVALID_TRANSITION', 'This action transition is not allowed.');
  if ('cancellationReason' in input && input.status !== 'CANCELLED') invalid('cancellationReason', 'Provide a reason only when cancelling an action.');
  const { expectedTicketVersion, expectedVersion, ...changes } = input;
  const merged: Mutable = {
    actionAt: current.actionAt, description: current.description, result: current.result,
    assigneeId: current.assigneeId, followUpRequired: current.followUpRequired, followUpNote: current.followUpNote,
    attachmentNotes: current.attachmentNotes, status: current.status, cancellationReason: current.cancellationReason, ...changes,
  };
  if (input.followUpRequired === false && (input.followUpNote === undefined || input.followUpNote === null)) merged.followUpNote = null;
  validateFinalAction(merged, ticketCreatedAt, now);
  if (Object.entries(merged).every(([key, value]) => value instanceof Date ? value.getTime() === current.actionAt.getTime() : value === current[key as keyof ActionTaken])) invalid('body', 'Supply at least one changed field.');
  return merged;
}
export function validateFinalAction(action: Mutable, ticketCreatedAt: Date, now: Date) {
  validateActionDate(action.actionAt, ticketCreatedAt, now);
  if (action.followUpRequired && !action.followUpNote) invalid('followUpNote', 'Required when follow-up is needed.');
  if (!action.followUpRequired && action.followUpNote) invalid('followUpNote', 'Clear the note when follow-up is not needed.');
  if (action.status === 'COMPLETED' && !action.result) invalid('result', 'Result is required for completion.');
  if (action.status === 'CANCELLED' && !action.cancellationReason) invalid('cancellationReason', 'A cancellation reason is required.');
}
