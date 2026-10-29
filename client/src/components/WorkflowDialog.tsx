import { ReactNode, useEffect, useId, useRef } from 'react';
import './TicketWorkflow.css';

// The native modal keeps confirmation focus and outside interaction contained.
export default function WorkflowDialog({ title, busy, onDismiss, children, returnFocusId }: {
  title: string; busy: boolean; onDismiss: () => void; children: ReactNode; returnFocusId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    const host = ref.current?.parentElement;
    // Native modal dialogs put the rest of the document outside the focus and
    // interaction tree, including pointer clicks and screen-reader navigation.
    if (dialog?.showModal) dialog.showModal();
    else dialog?.setAttribute('open', ''); // jsdom component-test fallback
    ref.current?.querySelector<HTMLElement>('textarea,button')?.focus();
    return () => {
      if (dialog?.close) dialog.close();
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
  return <dialog ref={ref} tabIndex={-1} aria-modal="true" aria-labelledby={id} aria-busy={busy} className="workflow-dialog" onCancel={event => { event.preventDefault(); if (!busy) dismiss.current(); }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) dismiss.current(); }
    if (event.key !== 'Tab') return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? []);
    const first = items[0], last = items[items.length - 1];
    if (!first) { event.preventDefault(); ref.current?.focus(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}>
    <h3 id={id}>{title}</h3>{children}
  </dialog>;
}
