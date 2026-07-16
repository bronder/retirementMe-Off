import { useEffect, useRef, useState } from 'react';
import { decideSnapBack, parseNum } from '../format';

/**
 * Local "draft" state for a controlled number input. Keeps the field editable
 * even when the user clears it to retype — the raw string is held locally
 * and a number is only propagated to the store when parseable. On blur, an
 * empty/invalid field snaps back to the last valid value and bounds are
 * enforced, with a visible notice describing what changed.
 *
 * `toInput` / `fromInput` convert between the store's number and the input's
 * display string (e.g. percentages multiply by 100). `formatValue` is used in
 * the notice string (e.g. "Restored to 65 yrs"), defaulting to `toInput`
 * when omitted.
 */

type UseEditableNumberOptions = {
  value: number;
  onCommit: (v: number) => void;
  toInput?: (v: number) => string;
  fromInput?: (v: number) => number;
  min?: number;
  max?: number;
  formatValue?: (v: number) => string;
};

const NOTICE_TIMEOUT_MS = 5000;

export function useEditableNumber({
  value,
  onCommit,
  toInput = String,
  fromInput = (v: number) => v,
  min,
  max,
  formatValue,
}: UseEditableNumberOptions) {
  const [draft, setDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Mirror the latest `value` into a ref so handleBlur sees the freshest
  // committed value even when blur fires within the same tick as a keystroke
  // (before React has flushed the store update into the prop).
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);

  // If the store value changes externally (scenario switch, undo), drop the
  // draft so the field reflects the new value.
  useEffect(() => { setDraft(null); }, [value]);

  // Auto-dismiss the notice after a short window. Re-armed on every notice
  // change (only one notice is visible at a time, so this is safe).
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [notice]);

  const display = draft ?? toInput(value);

  const handleChange = (raw: string) => {
    // Any new keystroke invalidates a previously-shown notice.
    setDraft(raw);
    setNotice(null);
    const v = parseNum(raw);
    if (!Number.isNaN(v)) onCommit(fromInput(v));
  };

  const handleBlur = () => {
    const snap = decideSnapBack(draft, valueRef.current, fromInput, min, max);
    const fmt = formatValue ?? toInput;
    switch (snap.kind) {
      case 'restored':
        setDraft(null);
        setNotice(`Restored to ${fmt(snap.restoredTo)}`);
        return;
      case 'clamped-low':
        onCommit(snap.clampedTo);
        setDraft(null);
        setNotice(`Minimum is ${fmt(snap.clampedTo)}`);
        return;
      case 'clamped-high':
        onCommit(snap.clampedTo);
        setDraft(null);
        setNotice(`Maximum is ${fmt(snap.clampedTo)}`);
        return;
      case 'ok':
        setDraft(null);
        return;
    }
  };

  return {
    display,
    handleChange,
    handleBlur,
    notice,
    dismissNotice: () => setNotice(null),
  };
}
