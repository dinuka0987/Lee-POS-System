import { useEffect } from 'react';

export function useDialog(identity: string) {
  useEffect(() => {
    if (!identity) return;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const previous = document.activeElement;
    const controls = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]',
        ),
      ).filter((element) => element.getClientRects().length > 0);
    if (!dialog.contains(document.activeElement)) controls()[0]?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        dialog
          .querySelector<HTMLButtonElement>('button[aria-label^="Close"]:not([disabled])')
          ?.click();
      if (event.key !== 'Tab') return;
      const fields = controls();
      const first = fields[0];
      const last = fields.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handle);
    return () => {
      document.removeEventListener('keydown', handle);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [identity]);
}
