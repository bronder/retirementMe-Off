import { useState, useRef, useEffect, useMemo } from 'react';
import { runProjection, getReadinessSummary } from '../engine';
import { formatCurrency, formatPercent } from '../format';
import type { WizardScenarioData } from '../store';
import { useEditableNumber } from '../hooks/useEditableNumber';
import { AgeInput } from './AgeInput';
import { FieldGroup } from './FieldGroup';

/**
 * Scenario wizard — a 3-step guided creator that builds a personalized scenario
 * from scratch in ~30 seconds. Offered alongside the instant "Start blank"
 * (sample) and "Duplicate" paths so a new user can get a projection reflecting
 * their own life without hand-editing someone else's sample data.
 *
 * The modal pattern mirrors the AI chat panel (the only other role="dialog" in
 * the app): centered, scrimmed, focus-trapped, Escape-to-close.
 */

export interface ScenarioWizardProps {
  /** Called with the wizard's answers when the user finishes. */
  onCreate: (data: WizardScenarioData) => void;
  /** Close without creating. */
  onCancel: () => void;
}

/** Lifestyle tiers for step 3. Amounts are annual retirement spending in
 *  today's dollars, derived from the BLS Consumer Expenditure Survey bands
 *  already used by the COMMON_EXPENSES templates. */
const LIFESTYLE_TIERS = [
  { id: 'modest', label: 'Modest', hint: '~$40K/yr', amount: 40000, blurb: 'Essentials with careful budgeting' },
  { id: 'comfortable', label: 'Comfortable', hint: '~$60K/yr', amount: 60000, blurb: 'Comfortable everyday spending' },
  { id: 'generous', label: 'Generous', hint: '~$90K/yr', amount: 90000, blurb: 'Travel, dining out, few compromises' },
] as const;

const TOTAL_STEPS = 3;

export function ScenarioWizard({ onCreate, onCancel }: ScenarioWizardProps) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('My Plan');
  const [currentAge, setCurrentAge] = useState(40);
  const [retirementAge, setRetirementAge] = useState(65);
  const [endAge, setEndAge] = useState(95);
  const [currentSavings, setCurrentSavings] = useState(50000);
  const [annualSalary, setAnnualSalary] = useState(75000);
  const [lifestyle, setLifestyle] = useState<(typeof LIFESTYLE_TIERS)[number]>(LIFESTYLE_TIERS[1]);

  const panelRef = useRef<HTMLDivElement>(null);

  // Focus the panel on open, and focus-trap + Escape-to-close — copied from
  // the AiChat panel pattern (the only other role="dialog" in the app).
  useEffect(() => {
    panelRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  // Live preview: run the real engine against the wizard's assembled answers.
  // Recomputes on every edit so the preview reflects what the user just typed.
  // The scenario built here mirrors what addScenarioFromData will persist, so
  // the numbers the user sees in the wizard are exactly what they'll get.
  const preview = useMemo(() => {
    // Guard against impossible timelines so the preview never shows nonsense.
    if (retirementAge <= currentAge || endAge <= retirementAge) return null;
    const scenario = {
      id: 'preview',
      name,
      assumptions: {
        currentAge,
        retirementAge,
        endAge,
        inflationRate: 0.03,
        socialSecurityCola: 0.025,
        retirementTaxRate: 0.15,
        safeWithdrawalRate: 0.04,
        preRetirementReturn: 0.07,
        postRetirementReturn: 0.05,
      },
      accounts: currentSavings > 0
        ? [{ id: 'a', name: 'Savings', type: 'taxable_brokerage' as const, balance: currentSavings, annualReturn: 0.07, annualContribution: 0, employerMatch: 0 }]
        : [],
      properties: [],
      incomeSources: [
        ...(annualSalary > 0
          ? [{ id: 's', name: 'Salary', type: 'salary' as const, annualAmount: annualSalary, startAge: currentAge, endAge: retirementAge - 1, cola: true, taxable: true }]
          : []),
        { id: 'ss', name: 'Social Security', type: 'social_security' as const, annualAmount: 30000, startAge: 67, endAge: null, cola: true, taxable: false },
      ],
      expenses: [{ id: 'e', name: 'Living expenses', category: 'other' as const, annualAmount: lifestyle.amount, preRetirement: false, postRetirement: true, startAge: null, endAge: null }],
      events: [],
    };
    const result = runProjection(scenario);
    const readiness = getReadinessSummary(result, retirementAge, 0.04);
    return { result, readiness };
  }, [name, currentAge, retirementAge, endAge, currentSavings, annualSalary, lifestyle]);

  const canAdvance =
    step === 1
      ? retirementAge > currentAge && endAge > retirementAge
      : step === 2
        ? true // savings can be 0
        : annualSalary > 0; // step 3: need some income to project

  const handleFinish = () => {
    onCreate({
      name: name.trim() || 'My Plan',
      currentAge,
      retirementAge,
      endAge,
      currentSavings,
      annualSalary,
      retirementExpenses: lifestyle.amount,
    });
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        ref={panelRef}
        className="wizard-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Create a scenario"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wizard-header">
          <div>
            <h2 className="wizard-title">✨ Create your scenario</h2>
            <p className="wizard-subtitle">Answer a few questions — we'll build a plan and show your outlook instantly.</p>
          </div>
          <button className="wizard-close" onClick={onCancel} aria-label="Close wizard">✕</button>
        </div>

        <div className="wizard-progress" aria-hidden="true">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <span key={i} className={`wizard-progress-dot${i + 1 <= step ? ' active' : ''}`} />
          ))}
          <span className="wizard-progress-label">Step {step} of {TOTAL_STEPS}</span>
        </div>

        <div className="wizard-body">
          {step === 1 && (
            <div className="wizard-step">
              <FieldGroup label="What should we call this plan?" helpText="You can rename it any time.">
                <input
                  type="text"
                  className="wizard-text-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                />
              </FieldGroup>
              <div className="wizard-field-row">
                <FieldGroup label="Your current age">
                  <AgeInput value={currentAge} onChange={setCurrentAge} min={18} max={85} />
                </FieldGroup>
                <FieldGroup label="Retire at age">
                  <AgeInput value={retirementAge} onChange={setRetirementAge} min={currentAge + 1} max={90} />
                </FieldGroup>
                <FieldGroup label="Plan through age" helpText="How long the projection runs.">
                  <AgeInput value={endAge} onChange={setEndAge} min={retirementAge + 1} max={110} />
                </FieldGroup>
              </div>
              {retirementAge <= currentAge && (
                <div className="wizard-validation">Retirement age must be later than your current age.</div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="wizard-step">
              <FieldGroup
                label="How much have you saved for retirement?"
                helpText="Total across all accounts — 401(k), IRA, savings, investments. We'll start with one combined account you can split up later."
              >
                <CurrencyInput value={currentSavings} onChange={setCurrentSavings} />
              </FieldGroup>
              <p className="wizard-hint">Don't worry about getting this exact — you'll refine every number in the editor afterward.</p>
            </div>
          )}

          {step === 3 && (
            <div className="wizard-step">
              <FieldGroup
                label="What's your current annual salary?"
                helpText="Before taxes. This funds your savings until you retire."
              >
                <CurrencyInput value={annualSalary} onChange={setAnnualSalary} />
              </FieldGroup>
              <div className="wizard-lifestyle-group">
                <label className="wizard-lifestyle-label">In retirement, you'd like to live…</label>
                <div className="wizard-lifestyle-options">
                  {LIFESTYLE_TIERS.map((tier) => (
                    <button
                      key={tier.id}
                      type="button"
                      className={`wizard-lifestyle-option${lifestyle.id === tier.id ? ' selected' : ''}`}
                      onClick={() => setLifestyle(tier)}
                      aria-pressed={lifestyle.id === tier.id}
                    >
                      <span className="wizard-lifestyle-name">{tier.label}</span>
                      <span className="wizard-lifestyle-hint">{tier.hint}</span>
                      <span className="wizard-lifestyle-blurb">{tier.blurb}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Live preview — shown from step 2 onward, once there's enough to
            project. Reactive to every field so the user sees their outlook
            change as they answer. */}
        {step >= 2 && preview && (
          <div className={`wizard-preview ${preview.result.success ? 'ok' : 'risk'}`}>
            {preview.result.success ? (
              <>At this rate you'd have <strong>{formatCurrency(preview.readiness.nestEggAtRetirementReal, { compact: true })}</strong> at {retirementAge} (today's dollars) — <strong>on track</strong>.</>
            ) : (
              <>At this rate your savings would run out around age <strong>{preview.result.depletionAge}</strong> — <strong>review needed</strong>.</>
            )}
            <span className="wizard-preview-detail">
              {formatPercent(preview.readiness.neededWithdrawalRate)} withdrawal rate
            </span>
          </div>
        )}

        <div className="wizard-footer">
          <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
          <div className="wizard-footer-right">
            {step > 1 && (
              <button className="btn btn-sm" onClick={() => setStep(step - 1)}>Back</button>
            )}
            {step < TOTAL_STEPS ? (
              <button className="btn btn-primary" onClick={() => setStep(step + 1)} disabled={!canAdvance}>
                Continue
              </button>
            ) : (
              <button className="btn btn-primary" onClick={handleFinish} disabled={!canAdvance}>
                ✓ Create plan
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Inline currency field for the wizard — same .input-wrapper / .unit-suffix
 *  structure as AgeInput, built on the same useEditableNumber hook so it gets
 *  clamping + the snap-back notice for free. */
function CurrencyInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { display, handleChange, handleBlur, notice } = useEditableNumber({
    value,
    onCommit: onChange,
    min: 0,
    formatValue: (v) => formatCurrency(v),
  });
  return (
    <>
      <div className="input-wrapper">
        <span className="unit-prefix" aria-hidden="true">$</span>
        <input
          type="number"
          value={display}
          min={0}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
        />
      </div>
      {notice && <div className="input-snapback">{notice}</div>}
    </>
  );
}
