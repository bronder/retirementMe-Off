import { createContext, useContext, useId, type ReactNode } from 'react';

/** The DOM id of the control inside the current FieldGroup, so the group's
 *  <label htmlFor> points at it. Inputs that render inside a FieldGroup
 *  (AgeInput, PctInputEnhanced, the wizard's CurrencyInput) consume this —
 *  previously the label and control were siblings with no association, so
 *  every assisted-input field was unnamed for screen readers (10 unnamed
 *  inputs on the Assumptions tab alone). */
const FieldControlIdContext = createContext<string | null>(null);

export function useFieldControlId(): string | undefined {
  return useContext(FieldControlIdContext) ?? undefined;
}

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
  const controlId = useId();
  return (
    <div className={`form-group-enhanced ${highImpact ? 'field-high-impact' : ''}`}>
      <label htmlFor={controlId}>{label}</label>
      <FieldControlIdContext.Provider value={controlId}>
        {children}
      </FieldControlIdContext.Provider>
      {helpText && <div className="help-text">{helpText}</div>}
      {validation && <div className={`validation-msg ${validation.includes('must') || validation.includes('cannot') ? 'error' : ''}`}>{validation}</div>}
    </div>
  );
}
