import { type RefObject, useLayoutEffect, useState } from 'react';

/**
 * Positions a popover so it is never cut off by the viewport edge — and,
 * crucially, so it is not clipped by an ancestor with `overflow: hidden`.
 *
 * The popover is rendered via a portal to `document.body` and uses
 * `position: fixed`, so it escapes any clipping ancestor (e.g. the Expenses
 * section's `.income-group { overflow: hidden }`). Its coordinates are
 * computed from the trigger button's on-screen rect.
 *
 * When the popover opens it measures how much vertical room exists above and
 * below the trigger, then:
 *   - opens DOWNWARD when there's at least as much room below as above,
 *   - opens UPWARD when there's more room above,
 *   - caps the popover's max-height to the available space in the chosen
 *     direction (minus a small margin) so it scrolls internally only as a last
 *     resort.
 *
 * `wrapperRef` must point to the element that contains the trigger button (the
 * `.menu-wrapper`). Returns a `style` object (fixed top/left/width/maxHeight)
 * to spread onto the portaled popover, plus a `placement` string and a `ready`
 * flag that is false until the first measurement has been applied — the caller
 * should hide the popover (e.g. visibility: hidden) while `ready` is false so
 * the never-positioned first frame is invisible.
 *
 * Usage:
 *   const wrapperRef = useRef<HTMLDivElement>(null);
 *   const { style, placement, ready } = usePopoverPosition(wrapperRef, open);
 *   <div className="menu-wrapper" ref={wrapperRef}>… trigger …</div>
 *   {open && createPortal(
 *     <div className={`menu-dropdown ${placement === 'above' ? 'open-above' : ''}`} style={style}>…</div>,
 *     document.body,
 *   )}
 */
export function usePopoverPosition(
  wrapperRef: RefObject<HTMLElement>,
  open: boolean,
  gap = 6,
): { style: React.CSSProperties; placement: 'below' | 'above'; ready: boolean } {
  // Start hidden (visibility: hidden) so the first render — before
  // useLayoutEffect has measured — never paints the dropdown in the wrong place
  // (the base .menu-dropdown CSS uses absolute positioning that resolves
  // against document.body once portaled, which is far off-screen).
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });
  const [placement, setPlacement] = useState<'below' | 'above'>('below');
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      // Reset so the next open starts from a hidden state until re-measured.
      setReady(false);
      setStyle({ visibility: 'hidden' });
      return;
    }
    const recompute = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const btn = wrapper.querySelector('button');
      if (!btn) return;
      const r = (btn as HTMLElement).getBoundingClientRect();
      const vh = window.innerHeight;
      const spaceBelow = vh - r.bottom;
      const spaceAbove = r.top;
      const above = spaceAbove > spaceBelow;
      setPlacement(above ? 'above' : 'below');
      const avail = (above ? spaceAbove : spaceBelow) - gap;
      // position: fixed coordinates are relative to the viewport, so we can
      // use the button's rect directly.
      //
      // Vertical anchoring: when opening DOWNWARD, set `top` so the menu sits
      // just below the button. When opening UPWARD, set `bottom` (relative to
      // the viewport, via position: fixed) so the menu grows upward from just
      // above the button — this lets the content size itself naturally and
      // stick to the button instead of being yanked to the viewport top.
      const desiredWidth = Math.max(r.width, 280);
      const left = Math.max(8, Math.min(r.right - desiredWidth, window.innerWidth - desiredWidth - 8));
      setStyle({
        position: 'fixed',
        // Downward: top = button bottom + gap. Upward: anchor via bottom
        // (viewport-relative) = viewport height − button top + gap, and clear
        // `top` so the bottom anchor wins.
        ...(above
          ? { top: 'auto', bottom: Math.round(vh - r.top + gap) }
          : { top: Math.round(r.bottom + gap), bottom: 'auto' }),
        left: Math.round(left),
        width: Math.round(desiredWidth),
        maxHeight: Math.max(160, Math.round(avail)),
        overflowY: 'auto',
        // Explicitly neutralize the .menu-dropdown base CSS (which uses
        // absolute positioning anchored to top:100%/right:0) now that the
        // popover is portaled to document.body and positioned with fixed coords.
        right: 'auto',
        marginTop: 0,
        marginBottom: 0,
        visibility: 'visible',
      });
      setReady(true);
    };
    recompute();
    // Recompute on any scroll (capture phase so nested scroll containers also
    // trigger) and resize, since either can move the trigger on-screen.
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
    };
  }, [wrapperRef, open, gap]);

  return { style, placement, ready };
}
