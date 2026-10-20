import { ReactNode, useEffect, useId, useRef } from 'react';
import './TicketWorkflow.css';

// Inline confirmations stay in the detail page; keyboard focus stays in them.
export default function WorkflowDialog({ title, busy, onDismiss, children, returnFocusId }: {
  title: string; busy: boolean; onDismiss: () => void; children: ReactNode; returnFocusId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    const host = ref.current?.parentElement;
    ref.current?.querySelector<HTMLElement>('textarea,button')?.focus();
    return () => {
      // React must re-enable/reinsert the initiating control before focusing it.
      requestAnimationFrame(() => {
        if (!host?.isConnected || dialog?.isConnected) return;
        const target = (returnFocusId ? document.getElementById(returnFocusId) : trigger) as HTMLElement | null;
        if (target?.isConnected) {
          if (target.matches(':disabled')) target.closest<HTMLElement>('.ticket-workflow')?.focus();
          else target.focus();
        }
      });
    };
  }, []);
  return <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className="workflow-dialog" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); if (!busy) dismiss.current(); }
    if (event.key !== 'Tab') return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled),a[href],input:not(:disabled)') ?? []);
    const first = items[0], last = items[items.length - 1];
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}>
    <h3 id={id}>{title}</h3>{children}
  </div>;
}
