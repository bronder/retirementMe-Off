import type { ReactNode } from 'react';

/** Yellow callout for risky or unusual assumption combinations. The
 *  dismiss button only renders if onDismiss is passed (so non-dismissable
 *  callouts are also supported). Returns null when children is falsy
 *  so callers can pass a conditional message without a wrapper. */
export function ContextWarning({ children, onDismiss }: {
  children: ReactNode;
  onDismiss?: () => void;
}) {
  if (!children) return null;
  return (
    <div className="context-warning">
      <span className="cw-icon">⚠️</span>
      <div className="cw-body">{children}</div>
      {onDismiss && (
        <button className="cw-dismiss" title="Dismiss" onClick={onDismiss}>✕</button>
      )}
    </div>
  );
}
