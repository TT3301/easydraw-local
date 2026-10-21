import { useCallback, useEffect, type RefObject } from "react";

const overlaySelector = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], .dropdown-menu, .popover';
const commandSelector = 'button, [role="button"], input[type="button"], input[type="radio"], input[type="checkbox"]';

export const isTextEntryTarget = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest('input:not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="slider"], [role="spinbutton"]'));

const hasOverlay = () => [...document.querySelectorAll<HTMLElement>(overlaySelector)]
  .some(element => element.getClientRects().length > 0);

export function useWorkspaceInteraction(rootRef: RefObject<HTMLDivElement | null>, canvasRef: RefObject<HTMLDivElement | null>) {
  const canHandleShortcut = useCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
      !(event.target instanceof Element) || !rootRef.current?.contains(event.target) || hasOverlay()) return false;
    if (isTextEntryTarget(event.target)) {
      return event.key === "Escape" && Boolean(canvasRef.current?.querySelector(".easydraw")?.contains(event.target));
    }
    // Keyboard navigation keeps the native Space/Enter activation of controls.
    return !([" ", "Enter"].includes(event.key) && event.target.closest(commandSelector));
  }, [rootRef, canvasRef]);

  useEffect(() => {
    let pending: { source: HTMLElement; target: HTMLElement; overlay: boolean } | null = null;
    let frame: number | null = null;
    let pointerInput = false;
    const canvas = () => canvasRef.current?.querySelector<HTMLElement>(".easydraw") ?? null;
    const settle = () => {
      frame = null;
      if (!pending || !document.hasFocus()) return;
      if (hasOverlay()) { pending.overlay = true; return; }
      const request = pending;
      pending = null;
      const active = document.activeElement;
      if (isTextEntryTarget(active)) return;
      if (!request.overlay && active !== request.source && active !== document.body && active !== canvas()) return;
      if (!request.overlay && request.target === request.source) return;
      const target = request.target.isConnected ? request.target : canvas();
      target?.focus({ preventScroll: true });
    };
    const schedule = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      // Check autofocus and overlays after React finishes the command.
      frame = requestAnimationFrame(settle);
    };
    const click = (event: MouseEvent) => {
      const source = event.target instanceof Element ? event.target.closest<HTMLElement>(commandSelector) : null;
      const editor = canvas();
      if (!editor) return;
      if (source && rootRef.current && (rootRef.current.contains(source) || source.closest(overlaySelector)) && !pending?.overlay) {
        pending = { source, target: event.detail > 0 || (event.isTrusted && pointerInput) ? editor : source, overlay: false };
      } else if (pending?.overlay && (event.detail > 0 || (event.isTrusted && pointerInput))) pending.target = editor;
      if (pending) schedule();
    };
    const keydown = (event: KeyboardEvent) => {
      pointerInput = false;
      if (event.isComposing || event.keyCode === 229) return;
      if (pending?.overlay && !hasOverlay()) pending = null;
      if (event.key === "Tab") {
        if (pending?.overlay) pending.target = pending.source;
        else pending = null;
        return;
      }
      if (pending?.overlay && event.key !== "Escape") pending.target = pending.source;
      if (!["Escape", "Enter"].includes(event.key)) return;
      const source = event.target instanceof HTMLElement ? event.target : null;
      const editor = canvas();
      if (!pending && source && editor && (rootRef.current?.contains(source) || source.closest(overlaySelector)) && (hasOverlay() || isTextEntryTarget(source))) {
        pending = { source, target: editor, overlay: hasOverlay() };
      }
      if (pending) schedule();
    };
    const pointerdown = () => { pointerInput = true; };
    const pointerup = () => { if (pending?.overlay) schedule(); };
    // React's click handler must commit before focus settles, but the next key need not wait for a frame.
    const finishClick = () => queueMicrotask(() => {
      if (frame !== null) cancelAnimationFrame(frame);
      settle();
    });
    document.addEventListener("pointerdown", pointerdown, true);
    document.addEventListener("pointerup", pointerup, true);
    document.addEventListener("click", click, true);
    document.addEventListener("click", finishClick);
    document.addEventListener("keydown", keydown, true);
    window.addEventListener("focus", schedule);
    return () => {
      document.removeEventListener("click", click, true);
      document.removeEventListener("click", finishClick);
      document.removeEventListener("pointerdown", pointerdown, true);
      document.removeEventListener("pointerup", pointerup, true);
      document.removeEventListener("keydown", keydown, true);
      window.removeEventListener("focus", schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [rootRef, canvasRef]);

  return canHandleShortcut;
}
