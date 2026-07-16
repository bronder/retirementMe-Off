import type { ReactNode } from 'react';

/** Label + form control + optional help text + optional validation message.
 *  The validation prop also flips an `.error` modifier when its text contains
 *  the words "must" / "cannot" so we can render it red instead of yellow. */
export function FieldGroup({
  label,
  helpText,
  children,
  validation,
  highImpact,
}: {
  label: string;
  helpText?: string;
  children: ReactNode;
  validation?: string;
  highImpact?: boolean;
}) {
  return (
    <div className={`form-group-enhanced ${highImpact ? 'field-high-impact' : ''}`}>
      <label>{label}</label>
      {children}
      {helpText && <div className="help-text">{helpText}</div>}
      {validation && <div className={`validation-msg ${validation.includes('must') || validation.includes('cannot') ? 'error' : ''}`}>{validation}</div>}
    </div>
  );
}
