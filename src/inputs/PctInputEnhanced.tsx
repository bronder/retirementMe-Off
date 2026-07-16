import { useEditableNumber } from '../hooks/useEditableNumber';

/** Percent input that stores values in the 0..1 range but displays them
 *  in the 0..100 range (e.g. 0.045 → "4.50%"). The toInput/fromInput pair
 *  keeps the displayed and stored numbers reconciled. The bound clamping
 *  on the numeric value (e.g. min: 0, max: 1) translates to a percentage
 *  clamp in the notice string. */
export function PctInputEnhanced({ value, onChange, min, max }: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const { display, handleChange, handleBlur, notice } = useEditableNumber({
    value,
    onCommit: onChange,
    toInput: (v) => (v * 100).toFixed(2),
    fromInput: (v) => v / 100,
    min,
    max,
    formatValue: (v) => `${(v * 100).toFixed(2)}%`,
  });
  return (
    <>
      <div className="input-wrapper">
        <input
          type="number"
          value={display}
          step={0.1}
          min={min !== undefined ? +(min * 100).toFixed(2) : undefined}
          max={max !== undefined ? +(max * 100).toFixed(2) : undefined}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
        />
        <span className="unit-suffix">%</span>
      </div>
      {notice && <div className="input-snapback">{notice}</div>}
    </>
  );
}
