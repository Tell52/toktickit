export function accessFailure(error: any): string | null {
  const code = error?.error?.code ?? error?.code;
  if (error?.status === 401 || code === 'UNAUTHENTICATED') return 'Your session has ended. Please sign in again.';
  if (code === 'PASSWORD_CHANGE_REQUIRED') return 'Change your password before continuing.';
  if (error?.status === 403 || code === 'FORBIDDEN') return 'You do not have permission to access this ticket.';
  if (error?.status === 404 || code === 'NOT_FOUND') return 'Ticket not found.';
  return null;
}
export const gateMessages: Record<string, string> = {
  NO_COMPLETED_ACTION: 'Complete at least one action in this resolution cycle.',
  UNFINISHED_ACTIONS: 'Complete or cancel all unfinished actions in this resolution cycle.',
  FOLLOW_UP_REQUIRED: 'Clear required follow-up on active actions in this resolution cycle.',
};
