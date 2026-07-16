import { useEditableNumber } from '../hooks/useEditableNumber';

/** Number input with a unit suffix (e.g. "yrs") and bound clamping.
 *  Snap-back notice ("Restored to 65 yrs" / "Maximum is 100 yrs") is
 *  rendered below the input by the useEditableNumber hook via .input-snapback. */
export function AgeInput({ value, onChange, unit = 'yrs', min, max }: {
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  min?: number;
  max?: number;
}) {
  const { display, handleChange, handleBlur, notice } = useEditableNumber({
    value,
    onCommit: onChange,
    min,
    max,
    formatValue: (v) => `${v} ${unit}`,
  });
  return (
    <>
      <div className="input-wrapper">
        <input
          type="number"
          value={display}
          min={min}
          max={max}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
        />
        <span className="unit-suffix">{unit}</span>
      </div>
      {notice && <div className="input-snapback">{notice}</div>}
    </>
  );
}
