import { useState, useMemo, useRef, useEffect } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { usePlanStore } from './store';
import { runProjection, getReadinessSummary } from './engine';
import { ACCOUNT_TAX_TREATMENT } from './types';
import type { AccountType, IncomeType, ExpenseCategory, EventType, PropertyType } from './types';
import { formatCurrency, formatPercent, formatAge } from './format';
import { exportMarkdown } from './markdown';
import { AiChat } from './AiChat';

const ACCOUNT_TYPES: AccountType[] = [
  'checking_savings',
  'taxable_brokerage',
  'traditional_401k',
  'roth_401k',
  'traditional_ira',
  'roth_ira',
  'hsa',
  'pension',
  'other',
];

const INCOME_TYPES: IncomeType[] = [
  'salary',
  'social_security',
  'pension',
  'part_time',
  'self_employment',
  'rental',
  'annuity',
  'dividends',
  'other',
];

const COMMON_EXPENSES: { name: string; icon: string; category: ExpenseCategory; annualAmount: number; preRetirement: boolean; postRetirement: boolean; startAge: number | null; endAge: number | null }[] = [
  // Based on BLS Consumer Expenditure Survey national averages (sorted alphabetically)
  { name: 'Clothing & Apparel', icon: '👕', category: 'other', annualAmount: 1833, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Dining Out', icon: '🍕', category: 'food', annualAmount: 3639, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Entertainment', icon: '🎬', category: 'entertainment', annualAmount: 3458, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Food & Groceries', icon: '🍽️', category: 'food', annualAmount: 9985, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Gifts & Donations', icon: '🎁', category: 'other', annualAmount: 2551, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Healthcare (Medicare)', icon: '💊', category: 'healthcare', annualAmount: 4392, preRetirement: false, postRetirement: true, startAge: 65, endAge: null },
  { name: 'Healthcare (pre-Medicare)', icon: '🏥', category: 'healthcare', annualAmount: 6194, preRetirement: true, postRetirement: true, startAge: null, endAge: 64 },
  { name: 'Home Insurance', icon: '🏡', category: 'insurance', annualAmount: 1716, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Home Maintenance & Repairs', icon: '🔧', category: 'housing', annualAmount: 2208, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Life Insurance', icon: '📋', category: 'insurance', annualAmount: 680, preRetirement: true, postRetirement: false, startAge: null, endAge: null },
  { name: 'Miscellaneous', icon: '📦', category: 'other', annualAmount: 1820, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Mortgage / Rent', icon: '🏠', category: 'housing', annualAmount: 22032, preRetirement: true, postRetirement: false, startAge: null, endAge: null },
  { name: 'Personal Care', icon: '🧴', category: 'other', annualAmount: 1010, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Pet Expenses', icon: '🐾', category: 'other', annualAmount: 1464, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Phone & Internet', icon: '📱', category: 'utilities', annualAmount: 1680, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Subscriptions (streaming, etc.)', icon: '📺', category: 'entertainment', annualAmount: 1272, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Travel & Vacations', icon: '✈️', category: 'travel', annualAmount: 4500, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Utilities (gas, electric, water)', icon: '💡', category: 'utilities', annualAmount: 4725, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Vehicle Insurance', icon: '🛡️', category: 'insurance', annualAmount: 1905, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Vehicle Payment & Gas', icon: '🚗', category: 'transportation', annualAmount: 12285, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
];

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'housing',
  'food',
  'transportation',
  'healthcare',
  'insurance',
  'utilities',
  'entertainment',
  'travel',
  'debt_payment',
  'taxes',
  'other',
];

const EVENT_TYPES: EventType[] = [
  'home_purchase',
  'home_sale',
  'large_purchase',
  'windfall',
  'other',
];

const prettify = (s: string): string =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Read CSS variable values for theme-aware chart styling */
function useThemeColors() {
  const [colors, setColors] = useState<Record<string, string>>({
    panel: '#ffffff',
    border: '#e6e2da',
    textDim: '#6e6a60',
    text: '#1c1b19',
    chart: '#0d9488',
    chart2: '#0e7490',
    chart3: '#7c3aed',
    chart4: '#ca8a04',
    green: '#15803d',
    red: '#dc2626',
    yellow: '#b45309',
  });

  useEffect(() => {
    const readColors = () => {
      const style = getComputedStyle(document.documentElement);
      setColors({
        panel: style.getPropertyValue('--panel').trim() || '#ffffff',
        border: style.getPropertyValue('--border').trim() || '#e6e2da',
        textDim: style.getPropertyValue('--text-dim').trim() || '#6e6a60',
        text: style.getPropertyValue('--text').trim() || '#1c1b19',
        chart: style.getPropertyValue('--chart').trim() || '#0d9488',
        chart2: style.getPropertyValue('--chart-2').trim() || '#0e7490',
        chart3: style.getPropertyValue('--chart-3').trim() || '#7c3aed',
        chart4: style.getPropertyValue('--chart-4').trim() || '#ca8a04',
        green: style.getPropertyValue('--green').trim() || '#15803d',
        red: style.getPropertyValue('--red').trim() || '#dc2626',
        yellow: style.getPropertyValue('--yellow').trim() || '#b45309',
      });
    };
    readColors();
    // Re-read when theme attribute changes
    const observer = new MutationObserver(readColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return colors;
}

type Tab = 'inputs' | 'results' | 'compare';
type InputSection = 'overview' | 'assumptions' | 'accounts' | 'properties' | 'expenses' | 'income' | 'events';
type Theme = 'dark' | 'light' | 'sepia' | 'nord';

/** Theme picker config. Short labels for the popover, swatch for visual. */
const THEMES: { id: Theme; label: string; icon: string; swatch: string }[] = [
  { id: 'light', label: 'Light', icon: '☀', swatch: '#f7f6f3' },
  { id: 'dark',  label: 'Dark',  icon: '☾', swatch: '#1a1816' },
  { id: 'sepia', label: 'Sepia', icon: '☕', swatch: '#f4ecd8' },
  { id: 'nord',  label: 'Nord',  icon: '❄', swatch: '#2e3440' },
];

/* Compact popover theme picker — matches the Menu button styling. */
function ThemePicker({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="theme-picker" ref={ref}>
      <button
        type="button"
        className={`btn btn-sm theme-picker-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`Theme: ${current.label}`}
      >
        <span className="theme-picker-swatch" style={{ background: current.swatch }} />
        <span className="theme-picker-label">{current.label}</span>
        <span className="theme-picker-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="theme-picker-menu" role="listbox">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={t.id === theme}
              className={`theme-picker-item${t.id === theme ? ' active' : ''}`}
              onClick={() => {
                setTheme(t.id);
                setOpen(false);
              }}
            >
              <span className="theme-picker-swatch" style={{ background: t.swatch }} />
              <span className="theme-picker-item-label">{t.label}</span>
              {t.id === theme && (
                <span className="theme-picker-check" aria-hidden="true">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const store = usePlanStore();
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('retirement-tab') as Tab) || 'inputs');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('retirement-theme') as Theme) || 'light');
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('retirement-theme', theme);
  }, [theme]);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Ensure we have a valid active scenario after mount/hydration.
  const activeScenario = useMemo(() => {
    const s = store.plan.scenarios.find((s) => s.id === store.activeScenarioId);
    return s ?? store.plan.scenarios[0];
  }, [store.plan, store.activeScenarioId]);

  // Run projection for active scenario.
  const activeResult = useMemo(
    () => (activeScenario ? runProjection(activeScenario) : null),
    [activeScenario],
  );

  // Run projections for ALL scenarios (for comparison view).
  const allResults = useMemo(
    () => store.plan.scenarios.map((s) => runProjection(s)),
    [store.plan.scenarios],
  );

  const readiness = activeResult && activeScenario
    ? getReadinessSummary(activeResult, activeScenario.assumptions.retirementAge, activeScenario.assumptions.safeWithdrawalRate)
    : null;

  if (!activeScenario || !activeResult || !readiness) return null;

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(store.plan, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${store.plan.name.replace(/[^a-z0-9]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMarkdown = () => {
    const md = exportMarkdown(store.plan, allResults);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${store.plan.name.replace(/[^a-z0-9]/gi, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const plan = JSON.parse(ev.target?.result as string);
        store.loadPlan(plan);
      } catch {
        alert('Invalid plan file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <h1><img src="./images/retirementmeoff-dark.png" alt="retirementMe-Off" style={{ height: '96px', width: 'auto', verticalAlign: 'middle' }} /></h1>
        <div className="header-actions">
          <ThemePicker theme={theme} setTheme={setTheme} />
          <div className="menu-wrapper" ref={menuRef}>
            <button className="btn btn-sm" onClick={() => setMenuOpen(!menuOpen)}>☰ Menu</button>
            {menuOpen && (
              <div className="menu-dropdown">
                <button className="menu-item" onClick={() => { fileInputRef.current?.click(); setMenuOpen(false); }}>
                  📥 Import Plan
                </button>
                <button className="menu-item" onClick={() => { handleExport(); setMenuOpen(false); }}>
                  📄 Export JSON
                </button>
                <button className="menu-item" onClick={() => { handleExportMarkdown(); setMenuOpen(false); }}>
                  📝 Export Markdown
                </button>
                <div className="menu-divider" />
                <ResetPlanMenuItem onReset={() => { store.resetPlan(); setMenuOpen(false); }} />
              </div>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
        </div>
      </div>

      {/* Scenario bar */}
      <div className="scenario-bar">
        {store.plan.scenarios.map((s) => (
          <ScenarioTab
            key={s.id}
            scenario={s}
            isActive={s.id === activeScenario.id}
            canDelete={store.plan.scenarios.length > 1}
            onSelect={() => store.setActiveScenario(s.id)}
            onDelete={() => store.deleteScenario(s.id)}
          />
        ))}
        <button className="btn btn-sm" onClick={() => store.addScenario()}>+ Add Scenario</button>
      </div>

      {/* Tabs */}
      <div className="tab-bar mb-16">
        <button className={`tab ${tab === 'inputs' ? 'active' : ''}`} onClick={() => setTab('inputs')}>Inputs</button>
        <button className={`tab ${tab === 'results' ? 'active' : ''}`} onClick={() => setTab('results')}>Results & Charts</button>
        <button className={`tab ${tab === 'compare' ? 'active' : ''}`} onClick={() => setTab('compare')}>Compare Scenarios</button>
      </div>

      {/* Planner hero — single contextual banner directly under the header,
          spanning the full content width. Content adapts per active tab so
          the graphic stays useful rather than decorative. Dense input
          sub-sections (Accounts, Expenses…) use the compact variant. */}
      {tab === 'inputs' && (
        <PlannerHero
          compact
          title={activeScenario.name}
          subtitle="Track your path to retirement with flexible scenarios."
          stats={[
            { label: 'Retire at', value: String(activeScenario.assumptions.retirementAge) },
            { label: 'Plan through', value: String(activeScenario.assumptions.endAge) },
            { label: 'Withdrawal rate', value: formatPercent(activeScenario.assumptions.safeWithdrawalRate) },
          ]}
        />
      )}

      {tab === 'results' && (
        <PlannerHero
          title={activeScenario.name}
          subtitle="Your retirement path at a glance, with assumptions, savings, and income working together."
          stats={[
            { label: 'Retire at', value: String(activeScenario.assumptions.retirementAge) },
            {
              label: 'Monthly available',
              value: formatCurrency((readiness.firstYearIncome + readiness.firstYearWithdrawal) / 12, { compact: true }),
              unit: '/mo',
            },
            {
              label: 'Plan confidence',
              value: readiness.onTrack ? 'On track' : 'Needs review',
              tone: readiness.onTrack ? 'good' : 'warn',
            },
          ]}
        />
      )}

      {tab === 'compare' && (
        <PlannerHero
          title="Compare Scenarios"
          subtitle="See how different assumptions, timelines, and savings rates shape your outcomes side by side."
          stats={[
            { label: 'Scenarios', value: String(allResults.length) },
            {
              label: 'Sustainable',
              value: `${allResults.filter((r) => r.success).length} of ${allResults.length}`,
              tone: allResults.every((r) => r.success) ? 'good' : 'warn',
            },
            {
              label: 'Best final assets',
              value: formatCurrency(Math.max(...allResults.map((r) => r.finalAssetsReal)), { compact: true }),
            },
          ]}
        />
      )}

      {tab === 'inputs' && (
        <InputsView
          scenario={activeScenario}
          store={store}
        />
      )}

      {tab === 'results' && (
        <ResultsView
          scenario={activeScenario}
          result={activeResult}
          readiness={readiness}
        />
      )}

      {tab === 'compare' && (
        <CompareView results={allResults} />
      )}

      {/* AI Chat Assistant */}
      <AiChat />
    </div>
  );
}

/* ============ RESET PLAN MENU ITEM ============ */

/** Menu item with two-step inline confirmation (no browser confirm() dialog) */
function ResetPlanMenuItem({ onReset }: { onReset: () => void }) {
  const [armed, setArmed] = useState(false);

  if (armed) {
    return (
      <div className="reset-confirm-group">
        <span className="reset-confirm-label">⚠ Erase all data?</span>
        <div className="reset-confirm-buttons">
          <button className="menu-item danger" onClick={() => { setArmed(false); onReset(); }}>
            ✓ Yes, reset
          </button>
          <button className="menu-item" onClick={() => setArmed(false)}>
            ✕ Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button className="menu-item danger" onClick={() => setArmed(true)}>
      🗑 Reset Plan
    </button>
  );
}

/* ============ INLINE CONFIRM DELETE ============ */

/**
 * Two-step inline delete confirmation.
 * First click reveals ✓ (confirm) and ✕ (cancel) buttons.
 * Eliminates the need for blocking browser `confirm()` dialogs.
 */
function ConfirmDelete({ onConfirm, title }: { onConfirm: () => void; title: string }) {
  const [armed, setArmed] = useState(false);

  if (armed) {
    return (
      <span className="confirm-delete-group">
        <button
          className="confirm-delete-btn confirm-delete-yes"
          title="Confirm delete"
          onClick={(e) => { e.stopPropagation(); onConfirm(); }}
        >
          ✓
        </button>
        <button
          className="confirm-delete-btn confirm-delete-no"
          title="Cancel"
          onClick={(e) => { e.stopPropagation(); setArmed(false); }}
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <button
      className="delete-btn"
      title={title}
      onClick={(e) => { e.stopPropagation(); setArmed(true); }}
    >
      🗑
    </button>
  );
}

/* ============ SCENARIO TAB ============ */

function ScenarioTab({ scenario, isActive, canDelete, onSelect, onDelete }: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  isActive: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [armed, setArmed] = useState(false);

  return (
    <button
      className={`scenario-tab ${isActive ? 'active' : ''} ${armed ? 'confirming' : ''}`}
      onClick={() => { if (!armed) onSelect(); }}
    >
      {armed ? (
        <>
          <span className="scenario-confirm-label">Delete?</span>
          <span
            className="scenario-tab-close"
            role="button"
            tabIndex={-1}
            title="Confirm delete"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            ✓
          </span>
          <span
            className="scenario-tab-close"
            role="button"
            tabIndex={-1}
            title="Cancel"
            onClick={(e) => { e.stopPropagation(); setArmed(false); }}
          >
            ✕
          </span>
        </>
      ) : (
        <>
          <span className="scenario-tab-name">{scenario.name}</span>
          {canDelete && (
            <span
              className="scenario-tab-close"
              role="button"
              tabIndex={-1}
              title="Delete scenario"
              onClick={(e) => { e.stopPropagation(); setArmed(true); }}
            >
              ×
            </span>
          )}
        </>
      )}
    </button>
  );
}

/* ============ INPUTS VIEW ============ */

function InputsView({ scenario, store }: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
}) {
  const [section, setSection] = useState<InputSection>(
    () => (localStorage.getItem('retirement-input-section') as InputSection) || 'assumptions'
  );

  // Remember active input section
  useEffect(() => {
    localStorage.setItem('retirement-input-section', section);
  }, [section]);

  const navItems: { id: InputSection; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'assumptions', label: 'Assumptions', icon: '⚙️' },
    { id: 'income', label: 'Income Sources', icon: '💵' },
    { id: 'accounts', label: 'Accounts & Savings', icon: '🏦' },
    { id: 'properties', label: 'Homes & Property', icon: '🏠' },
    { id: 'expenses', label: 'Expenses', icon: '📋' },
    { id: 'events', label: 'Life Events', icon: '📅' },
  ];

  const resourceGroups: { label: string; links: { icon: string; name: string; url: string }[] }[] = [
    {
      label: 'Calculators',
      links: [
        { icon: '🏦', name: 'SSA Retirement Estimator', url: 'https://www.ssa.gov/benefits/retirement/estimator.html' },
        { icon: '📅', name: 'SSA Benefit Calculator', url: 'https://www.ssa.gov/OACT/quickcalc/' },
        { icon: '💰', name: 'Fidelity Retirement Score', url: 'https://www.fidelity.com/calculators-tools/retirement-score' },
        { icon: '📊', name: 'Vanguard Retirement Nest Egg', url: 'https://retirementplans.vanguard.com/VGApp/pe/pubeducation/calculators/RetirementNestEggCalc.jsf' },
        { icon: '🧮', name: 'AARP Retirement Calculator', url: 'https://www.aarp.org/work/retirement-calculator/' },
        { icon: '📈', name: 'Bankrate 401k Calculator', url: 'https://www.bankrate.com/retirement/401-k-calculator/' },
      ],
    },
    {
      label: 'Social Security',
      links: [
        { icon: '💳', name: 'my Social Security Account', url: 'https://www.ssa.gov/myaccount/' },
        { icon: '📋', name: 'SSA Benefit Formulas', url: 'https://www.ssa.gov/oact/cola/Benefits.html' },
        { icon: '⏰', name: 'SS Claiming Age Guide', url: 'https://www.ssa.gov/benefits/retirement/planner/agereduction.html' },
        { icon: '👥', name: 'Spousal Benefits', url: 'https://www.ssa.gov/oact/quickcalc/spouse.html' },
      ],
    },
    {
      label: 'Taxes',
      links: [
        { icon: '🧾', name: 'IRS Tax Bracket Calculator', url: 'https://www.irs.gov/help/ita/whats-my-tax-bracket' },
        { icon: '📕', name: 'IRS Pub 590-B (IRA Withdrawals)', url: 'https://www.irs.gov/publications/p590b' },
        { icon: '🏢', name: 'IRS Pub 560 (401k Limits)', url: 'https://www.irs.gov/publications/p560' },
        { icon: '💲', name: 'RMD Calculator (IRS)', url: 'https://www.irs.gov/retirement-plans/required-minimum-distribution-calculators' },
      ],
    },
    {
      label: 'Medicare & Healthcare',
      links: [
        { icon: '🏥', name: 'Medicare.gov Official Site', url: 'https://www.medicare.gov/' },
        { icon: '🩺', name: 'Medicare Eligibility Tool', url: 'https://www.medicare.gov/eligibilitypremiumcalc/' },
        { icon: '💊', name: 'Plan Finder (Drug Coverage)', url: 'https://www.medicare.gov/plan-compare/' },
        { icon: '📚', name: 'Medicare & You Handbook', url: 'https://www.medicare.gov/medicare-and-you' },
      ],
    },
    {
      label: 'Investing & Education',
      links: [
        { icon: '🎓', name: 'Investor.gov (SEC)', url: 'https://www.investor.gov/' },
        { icon: '📖', name: 'Compound Interest Calc', url: 'https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator' },
        { icon: '⚖️', name: 'FINRA Broker Check', url: 'https://brokercheck.finra.org/' },
        { icon: '🔒', name: 'SIPC Protection Info', url: 'https://www.sipc.org/for-investors/what-sipc-protects' },
      ],
    },
  ];

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(resourceGroups.map((g) => g.label))
  );

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return (
    <div className="inputs-layout">
      <aside className="inputs-sidebar">
        <ul className="inputs-nav">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                className={`inputs-nav-item ${section === item.id ? 'active' : ''}`}
                onClick={() => setSection(item.id)}
              >
                <span className="inputs-nav-icon">{item.icon}</span>
                {item.label}
              </button>
            </li>
          ))}
        </ul>

        {/* Resources section */}
        <div className="sidebar-divider" />
        <div className="sidebar-resources-label">🔗 Resources</div>
        {resourceGroups.map((group) => {
          const isCollapsed = collapsedGroups.has(group.label);
          return (
            <div key={group.label} className="resource-group">
              <button
                className={`resource-group-toggle ${isCollapsed ? 'collapsed' : ''}`}
                onClick={() => toggleGroup(group.label)}
              >
                <span>{group.label}</span>
                <span className="toggle-arrow">▼</span>
              </button>
              <div className={`resource-group-links ${isCollapsed ? 'collapsed' : ''}`}>
                {group.links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="resource-link"
                    title={link.name}
                  >
                    <span className="resource-icon">{link.icon}</span>
                    <span className="resource-name">{link.name}</span>
                    <span className="resource-ext">↗</span>
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </aside>
      <div className="inputs-content">
        {section === 'overview' && <OverviewPanel scenario={scenario} store={store} />}
        {section === 'assumptions' && <AssumptionsPanel scenario={scenario} store={store} />}
        {section === 'accounts' && <AccountsPanel scenario={scenario} store={store} />}
        {section === 'properties' && <PropertiesPanel scenario={scenario} store={store} />}
        {section === 'expenses' && <ExpensesPanel scenario={scenario} store={store} />}
        {section === 'income' && <IncomePanel scenario={scenario} store={store} />}
        {section === 'events' && <EventsPanel scenario={scenario} store={store} />}
      </div>
    </div>
  );
}

function AgeInput({ value, onChange, unit = 'yrs' }: { value: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <div className="input-wrapper">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(+e.target.value)}
      />
      <span className="unit-suffix">{unit}</span>
    </div>
  );
}

function PctInputEnhanced({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="input-wrapper">
      <input
        type="number"
        value={+(value * 100).toFixed(2)}
        step={0.1}
        onChange={(e) => onChange(+e.target.value / 100)}
      />
      <span className="unit-suffix">%</span>
    </div>
  );
}

function FieldGroup({ label, helpText, children, validation, highImpact }: {
  label: string;
  helpText?: string;
  children: React.ReactNode;
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

/** Contextual guidance callout for risky or unusual assumption combinations */
function ContextWarning({ children, onDismiss }: { children: React.ReactNode; onDismiss?: () => void }) {
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

/* ============ PLANNER HERO ============ */

interface PlannerHeroStat {
  label: string;
  value: string;
  unit?: string;
  tone?: 'good' | 'bad' | 'warn';
}

/**
 * Context banner shown above the main card on overview/results pages.
 * Image sits on the right and fades into the panel; text + stats stay
 * on the left so the page remains finance-first and readable.
 */
function PlannerHero({ title, subtitle, stats, compact }: {
  title: string;
  subtitle: string;
  stats: PlannerHeroStat[];
  compact?: boolean;
}) {
  const toneColor = (tone?: PlannerHeroStat['tone']) =>
    tone === 'good'
      ? 'var(--green)'
      : tone === 'bad'
        ? 'var(--red)'
        : tone === 'warn'
          ? 'var(--yellow)'
          : undefined;

  return (
    <section className={`planner-hero ${compact ? 'planner-hero--compact' : ''}`}>
      <div className="planner-hero__content">
        <h1 className="planner-hero__title">{title}</h1>
        <p className="planner-hero__subtitle">{subtitle}</p>
        <div className="planner-hero__stats">
          {stats.map((stat) => (
            <div className="planner-hero__stat" key={stat.label}>
              <span className="planner-hero__stat-label">{stat.label}</span>
              <span
                className="planner-hero__stat-value"
                style={toneColor(stat.tone) ? { color: toneColor(stat.tone) } : undefined}
              >
                {stat.value}
                {stat.unit && <span className="planner-hero__stat-unit">{stat.unit}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============ OVERVIEW PANEL ============ */

function OverviewPanel({ scenario, store }: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
}) {
  void store;
  const tc = useThemeColors();
  const result = useMemo(() => runProjection(scenario), [scenario]);
  const readiness = useMemo(
    () => getReadinessSummary(result, scenario.assumptions.retirementAge, scenario.assumptions.safeWithdrawalRate),
    [result, scenario.assumptions.retirementAge, scenario.assumptions.safeWithdrawalRate],
  );

  const currentNetWorth = scenario.accounts.reduce((s, a) => s + a.balance, 0);
  const totalContributions = scenario.accounts.reduce((s, a) => s + a.annualContribution + a.employerMatch, 0);

  const checks = [
    { label: 'Has at least 1 account', pass: scenario.accounts.length > 0, weight: 8 },
    { label: 'Account balances > $0', pass: scenario.accounts.some(a => a.balance > 0), weight: 7 },
    { label: 'Has retirement contributions', pass: scenario.accounts.some(a => a.annualContribution > 0), weight: 8 },
    { label: `Well-balanced accounts (${Math.min(scenario.accounts.length, 5)}/5)`, pass: scenario.accounts.length >= 5, weight: 12, partial: Math.min(12, Math.round((Math.min(scenario.accounts.length, 5) / 5) * 12)) },
    { label: 'Has expenses defined', pass: scenario.expenses.length > 0, weight: 8 },
    { label: 'Has post-retirement expenses', pass: scenario.expenses.some(e => e.postRetirement), weight: 5 },
    { label: `Covers ${Math.min(10, scenario.expenses.length)}/10+ common categories`, pass: scenario.expenses.length >= 10, weight: 12, partial: Math.min(12, Math.round((Math.min(scenario.expenses.length, 10) / 10) * 12)) },
    { label: 'Has income sources', pass: scenario.incomeSources.length > 0, weight: 10 },
    { label: 'Has Social Security or pension', pass: scenario.incomeSources.some(i => i.type === 'social_security' || i.type === 'pension'), weight: 10 },
    { label: 'Current age < retirement age', pass: scenario.assumptions.currentAge < scenario.assumptions.retirementAge, weight: 5 },
    { label: 'Retirement age < end age', pass: scenario.assumptions.retirementAge < scenario.assumptions.endAge, weight: 5 },
    { label: 'Realistic withdrawal rate (3-5%)', pass: scenario.assumptions.safeWithdrawalRate >= 0.03 && scenario.assumptions.safeWithdrawalRate <= 0.05, weight: 5 },
    { label: 'Realistic pre-retirement return (5-10%)', pass: scenario.assumptions.preRetirementReturn >= 0.05 && scenario.assumptions.preRetirementReturn <= 0.10, weight: 5 },
  ];
  const wellnessScore = checks.reduce((sum, c) => {
    const earned = 'partial' in c && (c as { partial?: number }).partial !== undefined
      ? Math.max((c as { partial?: number }).partial!, c.pass ? c.weight : 0)
      : (c.pass ? c.weight : 0);
    return sum + earned;
  }, 0);
  const wellnessColor = wellnessScore >= 80 ? 'var(--green)' : wellnessScore >= 50 ? 'var(--yellow)' : 'var(--red)';
  const wellnessLabel = wellnessScore >= 80 ? 'Well Populated' : wellnessScore >= 50 ? 'Needs Attention' : 'Incomplete';
  const gaugeDeg = Math.min(180, (wellnessScore / 100) * 180);

  const miniChartData = result.years.map((y) => ({ age: y.age, netWorth: Math.round(y.realAssets) }));

  return (
    <div>
      <div className="summary-grid">
        <div className="summary-card">
          <div className="label">Current Net Worth</div>
          <div className="value">{formatCurrency(currentNetWorth, { compact: true })}</div>
          <div className="sub">{scenario.accounts.length} {scenario.accounts.length === 1 ? 'account' : 'accounts'}</div>
        </div>
        <div className="summary-card">
          <div className="label">Projected at Retirement</div>
          <div className="value">{formatCurrency(readiness.nestEggAtRetirement, { compact: true })}</div>
          <div className="sub">{formatCurrency(readiness.nestEggAtRetirementReal, { compact: true })} in today's $</div>
        </div>
        <div className="summary-card">
          <div className="label">Annual Savings Rate</div>
          <div className="value">{formatCurrency(totalContributions, { compact: true })}</div>
          <div className="sub">{totalContributions > 0 && currentNetWorth > 0 ? `${formatPercent(totalContributions / currentNetWorth)} of net worth` : '—'}</div>
        </div>
        <div className="summary-card">
          <div className="label">Plan Outcome</div>
          <div className={`value ${result.success ? 'value-good' : 'value-bad'}`}>{result.success ? '✓ On Track' : '✗ At Risk'}</div>
          <div className="sub">{result.success ? `Lasts to age ${scenario.assumptions.endAge}` : `Depleted at age ${formatAge(result.depletionAge)}`}</div>
        </div>
      </div>

      <div className="overview-wellness-grid">
        <div className="panel overview-gauge-card">
          <h3 className="overview-section-title">📋 Data Completeness</h3>
          <div className="overview-gauge-container">
            <div className="overview-gauge" style={{ background: `conic-gradient(from 270deg, ${wellnessColor} 0deg ${gaugeDeg}deg, var(--bg-subtle) ${gaugeDeg}deg 180deg, transparent 180deg)` }}>
              <div className="overview-gauge-inner">
                <span className="overview-gauge-score" style={{ color: wellnessColor }}>{wellnessScore}%</span>
                <span className="overview-gauge-label">{wellnessLabel}</span>
              </div>
            </div>
          </div>
          <div className="overview-gauge-hint">Higher = more complete and realistic data</div>
        </div>
        <div className="panel overview-checks-card">
          <h3 className="overview-section-title">✅ Checklist</h3>
          <div className="overview-checks-list">
            {checks.map((c, i) => (
              <div key={i} className="overview-check-item">
                <span className={`overview-check-icon ${c.pass ? 'pass' : 'fail'}`}>{c.pass ? '✓' : '○'}</span>
                <span className={`overview-check-label ${c.pass ? '' : 'incomplete'}`}>{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="chart-container">
        <h3>📈 Projected Net Worth (Today's Dollars)</h3>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={miniChartData}>
            <defs>
              <linearGradient id="overviewGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={tc.chart} stopOpacity={0.3} />
                <stop offset="100%" stopColor={tc.chart} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={tc.border} />
            <XAxis dataKey="age" stroke={tc.textDim} />
            <YAxis stroke={tc.textDim} tickFormatter={(v) => formatCurrency(v, { compact: true })} />
            <Tooltip contentStyle={{ background: tc.panel, border: `1px solid ${tc.border}`, borderRadius: 8 }} formatter={(v: number) => formatCurrency(v)} labelFormatter={(l) => `Age ${l}`} labelStyle={{ color: tc.text }} itemStyle={{ color: tc.text }} />
            <Area type="monotone" dataKey="netWorth" stroke={tc.chart} strokeWidth={2} fill="url(#overviewGradient)" />
            <ReferenceLine x={scenario.assumptions.retirementAge} stroke={tc.yellow} strokeDasharray="5 5" label={{ value: 'Retire', fill: tc.yellow, fontSize: 11 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="summary-strip">
        <div className="summary-strip-item"><span className="label">Years to Retirement</span><span className="value">{Math.max(0, scenario.assumptions.retirementAge - scenario.assumptions.currentAge)}</span></div>
        <div className="summary-strip-item"><span className="label">Years in Retirement</span><span className="value">{scenario.assumptions.endAge - scenario.assumptions.retirementAge}</span></div>
        <div className="summary-strip-item"><span className="label">Monthly Expenses (Ret.)</span><span className="value">{formatCurrency(readiness.firstYearExpenses / 12, { compact: true })}</span></div>
        <div className="summary-strip-item"><span className="label">Monthly Income (Ret.)</span><span className="value">{formatCurrency(readiness.firstYearIncome / 12, { compact: true })}</span></div>
        <div className="summary-strip-item"><span className="label">Life Events</span><span className="value">{scenario.events.length}</span></div>
      </div>
    </div>
  );
}

function AssumptionsPanel({ scenario, store }: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
}) {
  const a = scenario.assumptions;
  const upd = (patch: Partial<typeof a>) => store.updateAssumptions(scenario.id, patch);

  // Track which warnings have been dismissed
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<number>>(new Set());
  const dismissWarning = (i: number) => {
    setDismissedWarnings((prev) => new Set(prev).add(i));
  };

  // --- Contextual validation ---
  const warnings: React.ReactNode[] = [];

  if (a.currentAge >= a.retirementAge) {
    warnings.push(<>Retirement age must be <strong>after</strong> your current age. Currently, retirement is set to {a.retirementAge} but you are already {a.currentAge}.</>);
  }
  if (a.retirementAge >= a.endAge) {
    warnings.push(<>Plan end age must be <strong>after</strong> retirement age. Currently both are set to {a.retirementAge}–{a.endAge}.</>);
  }
  if (a.postRetirementReturn > a.preRetirementReturn + 0.001) {
    warnings.push(<>Post-retirement return ({formatPercent(a.postRetirementReturn)}) is <strong>higher</strong> than pre-retirement ({formatPercent(a.preRetirementReturn)}). This is unusual — retirees typically shift to a more conservative portfolio. Consider lowering it unless you have a specific reason.</>);
  }
  if (a.safeWithdrawalRate > 0.05) {
    warnings.push(<>A withdrawal rate of <strong>{formatPercent(a.safeWithdrawalRate)}</strong> is above the commonly recommended 4%. Higher rates increase the risk of running out of money, especially in early retirement.</>);
  }
  if (a.safeWithdrawalRate < 0.025 && a.safeWithdrawalRate > 0) {
    warnings.push(<>A withdrawal rate of <strong>{formatPercent(a.safeWithdrawalRate)}</strong> is quite conservative. You may be able to spend more — but a lower rate provides greater safety margin.</>);
  }

  // Reset dismissed warnings when scenario changes
  useEffect(() => {
    setDismissedWarnings(new Set());
  }, [scenario.id]);

  // Years until retirement
  const yearsToRetirement = a.retirementAge - a.currentAge;
  const yearsInRetirement = a.endAge - a.retirementAge;

  return (
    <div className="panel mb-16">
      <div className="panel-header">
        <h2>⚙️ Assumptions — <input
          type="text"
          value={scenario.name}
          onChange={(e) => store.renameScenario(scenario.id, e.target.value)}
          style={{ display: 'inline-block', width: '200px', fontSize: '16px', fontWeight: 600 }}
        /></h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={() => store.duplicateScenario(scenario.id)}>Duplicate</button>
          {store.plan.scenarios.length > 1 && (
            <button className="btn btn-sm btn-danger" onClick={() => store.deleteScenario(scenario.id)}>Delete</button>
          )}
        </div>
      </div>

      {/* Contextual warnings */}
      {warnings.map((w, i) => (
        !dismissedWarnings.has(i) && (
          <ContextWarning key={i} onDismiss={() => dismissWarning(i)}>{w}</ContextWarning>
        )
      ))}

      {/* Compact summary banner */}
      <div className="assumptions-summary-banner">
        <span className="asm-summary-item"><strong>Retire at {a.retirementAge}</strong></span>
        <span className="asm-summary-sep">·</span>
        <span className="asm-summary-item">Plan through <strong>{a.endAge}</strong></span>
        <span className="asm-summary-sep">·</span>
        <span className="asm-summary-item"><strong>{formatPercent(a.inflationRate)}</strong> inflation</span>
        <span className="asm-summary-sep">·</span>
        <span className="asm-summary-item"><strong>{formatPercent(a.safeWithdrawalRate)}</strong> withdrawal</span>
        <span className="asm-summary-sep">·</span>
        <span className="asm-summary-item">{yearsToRetirement > 0 ? `${yearsToRetirement} yrs to save` : 'At retirement'}</span>
        <span className="asm-summary-sep">·</span>
        <span className="asm-summary-item">{yearsInRetirement} yrs in retirement</span>
      </div>

      {/* Timeline section */}
      <div className="form-section">
        <div className="form-section-title">🗓️ Timeline</div>
        <div className="form-row-3">
          <FieldGroup label="Current Age">
            <AgeInput value={a.currentAge} onChange={(v) => upd({ currentAge: v })} />
          </FieldGroup>
          <FieldGroup
            label="Retirement Age"
            helpText={`${yearsToRetirement > 0 ? yearsToRetirement : 0} years left to save`}
            highImpact
          >
            <AgeInput value={a.retirementAge} onChange={(v) => upd({ retirementAge: v })} />
          </FieldGroup>
          <FieldGroup
            label="Plan End Age"
            helpText={`${yearsInRetirement} years of retirement`}
            highImpact
          >
            <AgeInput value={a.endAge} onChange={(v) => upd({ endAge: v })} />
          </FieldGroup>
        </div>
      </div>

      {/* Spouse section */}
      <div className="form-section">
        <div className="form-section-title">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            👥 Spouse
            <label className="spouse-toggle">
              <input
                type="checkbox"
                checked={a.spouse?.enabled ?? false}
                onChange={(e) => upd({ spouse: { ...(a.spouse ?? { enabled: false, currentAge: 40, retirementAge: 65, endAge: 95 }), enabled: e.target.checked } })}
              />
              <span className="spouse-toggle-label">{a.spouse?.enabled ? 'Enabled' : 'Disabled'}</span>
            </label>
          </span>
        </div>
        {a.spouse?.enabled ? (
          <>
            <div className="form-section-help">
              Plan for a couple. The projection extends to cover the <strong>longer-lived partner</strong>'s lifespan.
              Add your spouse's Social Security as a separate income source on the Retirement Income tab.
            </div>
            <div className="form-row-3">
              <FieldGroup
                label="Spouse Current Age"
                helpText="Your spouse's age today."
              >
                <AgeInput value={a.spouse.currentAge} onChange={(v) => upd({ spouse: { ...a.spouse!, currentAge: v } })} />
              </FieldGroup>
              <FieldGroup
                label="Spouse Retirement Age"
                helpText="When your spouse stops working."
              >
                <AgeInput value={a.spouse.retirementAge} onChange={(v) => upd({ spouse: { ...a.spouse!, retirementAge: v } })} />
              </FieldGroup>
              <FieldGroup
                label="Spouse Plan End Age"
                helpText="If higher than yours, the plan extends to cover your spouse's full lifespan."
                highImpact
              >
                <AgeInput value={a.spouse.endAge} onChange={(v) => upd({ spouse: { ...a.spouse!, endAge: v } })} />
              </FieldGroup>
            </div>
          </>
        ) : (
          <div className="form-section-help">
            Enable spouse planning to model a joint retirement — the plan extends to cover the longer-lived partner.
          </div>
        )}
      </div>

      {/* Inflation & Tax section */}
      <div className="form-section">
        <div className="form-section-title">📊 Inflation & Tax</div>
        <div className="form-section-help">How the cost of living rises over time, and how much of your retirement withdrawals go to taxes.</div>
        <div className="form-row-3">
          <FieldGroup
            label="Inflation Rate"
            helpText="Annual rise in cost of living. All expenses and income (with COLA) grow at this rate. Historical US average ≈ 3%."
          >
            <PctInputEnhanced value={a.inflationRate} onChange={(v) => upd({ inflationRate: v })} />
          </FieldGroup>
          <FieldGroup
            label="Social Security COLA"
            helpText="Annual increase for Social Security benefits. Typically tracks inflation. Use 2.5–3% for a reasonable estimate."
          >
            <PctInputEnhanced value={a.socialSecurityCola} onChange={(v) => upd({ socialSecurityCola: v })} />
          </FieldGroup>
          <FieldGroup
            label="Retirement Tax Rate"
            helpText="Effective tax rate on taxable withdrawals (traditional 401k/IRA, pensions). Roth withdrawals are tax-free. 10–20% is typical."
          >
            <PctInputEnhanced value={a.retirementTaxRate} onChange={(v) => upd({ retirementTaxRate: v })} />
          </FieldGroup>
        </div>
      </div>

      {/* Investment section */}
      <div className="form-section">
        <div className="form-section-title">📈 Investment Returns & Withdrawals</div>
        <div className="form-section-help">
          <strong>High impact.</strong> These rates drive the core projection. The return rates below are used as <strong>fallbacks</strong> —
          if you set a specific return rate on an individual account (Accounts tab), that rate is used instead.
        </div>
        <div className="form-row-3">
          <FieldGroup
            label="Safe Withdrawal Rate"
            helpText="Annual withdrawal as a percentage of savings. The “4% rule” is a common starting point; 3.5% is more conservative."
            highImpact
          >
            <PctInputEnhanced value={a.safeWithdrawalRate} onChange={(v) => upd({ safeWithdrawalRate: v })} />
          </FieldGroup>
          <FieldGroup
            label="Pre-Retirement Return"
            helpText="Fallback annual return while saving. A growth-oriented portfolio (mostly stocks) historically averages 7–10%."
            highImpact
          >
            <PctInputEnhanced value={a.preRetirementReturn} onChange={(v) => upd({ preRetirementReturn: v })} />
          </FieldGroup>
          <FieldGroup
            label="Post-Retirement Return"
            helpText="Fallback annual return after retiring. Usually lower (more bonds/cash) to reduce volatility. 4–6% is common."
            highImpact
          >
            <PctInputEnhanced value={a.postRetirementReturn} onChange={(v) => upd({ postRetirementReturn: v })} />
          </FieldGroup>
        </div>
      </div>
    </div>
  );
}

const ACCOUNT_GROUP_META: { types: AccountType[]; label: string; icon: string; hint: string }[] = [
  { types: ['checking_savings'], label: 'Cash & Liquid', icon: '💵', hint: 'Checking and savings — easily accessible, low return' },
  { types: ['taxable_brokerage'], label: 'Taxable Investments', icon: '📈', hint: 'Brokerage accounts — taxed on gains each year' },
  { types: ['traditional_401k', 'roth_401k', 'traditional_ira', 'roth_ira', 'hsa'], label: 'Tax-Advantaged', icon: '🛡️', hint: '401k, IRA, HSA — tax-deferred or tax-free growth' },
  { types: ['pension', 'other'], label: 'Other', icon: '📦', hint: 'Pensions and other account types' },
];

function AccountCard({ acct, scenario, store }: {
  acct: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0]['accounts'][0];
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
}) {
  const is401k = acct.type === 'traditional_401k' || acct.type === 'roth_401k';
  const taxTreatment = ACCOUNT_TAX_TREATMENT[acct.type];
  const taxLabel = taxTreatment === 'tax_free' ? 'Tax-Free' : taxTreatment === 'tax_deferred' ? 'Tax-Deferred' : 'Taxable';
  const taxColor = taxTreatment === 'tax_free' ? 'var(--green)' : taxTreatment === 'tax_deferred' ? 'var(--chart)' : 'var(--text-dim)';
  const totalContrib = acct.annualContribution + acct.employerMatch;

  return (
    <div className="acct-card">
      <div className="acct-card-header">
        <div className="acct-card-header-left">
          <span className="acct-card-icon">{acct.type === 'checking_savings' ? '💵' : acct.type === 'taxable_brokerage' ? '📈' : acct.type.includes('roth') ? '🌿' : acct.type === 'hsa' ? '🏥' : acct.type === 'pension' ? '🏢' : '🏦'}</span>
          <div className="acct-card-title-area">
            <input
              type="text"
              className="acct-card-name"
              value={acct.name}
              onChange={(e) => store.updateAccount(scenario.id, acct.id, { name: e.target.value })}
            />
            <div className="acct-card-meta">
              <select className="table-select acct-type-select" value={acct.type} onChange={(e) => store.updateAccount(scenario.id, acct.id, { type: e.target.value as AccountType })}>
                {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{prettify(t)}</option>)}
              </select>
              <span className="acct-tax-badge" style={{ color: taxColor, borderColor: taxColor }}>{taxLabel}</span>
            </div>
          </div>
        </div>
        <ConfirmDelete title="Delete account" onConfirm={() => store.deleteAccount(scenario.id, acct.id)} />
      </div>
      <div className="acct-card-body">
        <div className="acct-card-field">
          <label>Balance</label>
          <CurrencyCellInput value={acct.balance} onChange={(v) => store.updateAccount(scenario.id, acct.id, { balance: v })} />
        </div>
        <div className="acct-card-field">
          <label>Return Rate</label>
          <PctCellInput value={acct.annualReturn} onChange={(v) => store.updateAccount(scenario.id, acct.id, { annualReturn: v })} />
        </div>
        <div className="acct-card-field">
          <label>Annual Contribution</label>
          <CurrencyCellInput value={acct.annualContribution} onChange={(v) => store.updateAccount(scenario.id, acct.id, { annualContribution: v })} />
        </div>
        {is401k && (
          <div className="acct-card-field acct-card-match">
            <label>Employer Match</label>
            <CurrencyCellInput value={acct.employerMatch} onChange={(v) => store.updateAccount(scenario.id, acct.id, { employerMatch: v })} />
          </div>
        )}
      </div>
      {totalContrib > 0 && (
        <div className="acct-card-insight">
          <span className="acct-insight-label">Total annual savings:</span>
          <span className="acct-insight-value">{formatCurrency(totalContrib)}</span>
          {acct.employerMatch > 0 && <span className="acct-insight-sub">({formatCurrency(acct.employerMatch)} from employer)</span>}
        </div>
      )}
    </div>
  );
}

function AccountsPanel({ scenario, store }: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
}) {
  const totalBalance = scenario.accounts.reduce((s, a) => s + a.balance, 0);
  const totalContrib = scenario.accounts.reduce((s, a) => s + a.annualContribution + a.employerMatch, 0);
  const totalMatch = scenario.accounts.reduce((s, a) => s + a.employerMatch, 0);

  // Group accounts by category
  const groups = ACCOUNT_GROUP_META.map((g) => ({
    ...g,
    accounts: scenario.accounts.filter((a) => g.types.includes(a.type)),
  }));
  // Note: do NOT filter out empty groups — the "+ Add" button lives on each group header

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>🏦 Accounts & Savings</h2>
      </div>
      <p className="section-help">
        Track all your savings and investment accounts. Enter the <strong>current balance</strong>, expected <strong>annual return</strong>,
        and your <strong>yearly contribution</strong>. Employer match is only shown for 401(k) accounts.
      </p>

      {/* Summary strip */}
      <div className="summary-strip">
        <div className="summary-strip-item">
          <span className="label">Total Balance</span>
          <span className="value">{formatCurrency(totalBalance, { compact: true })}</span>
        </div>
        <div className="summary-strip-item">
          <span className="label">Annual Savings</span>
          <span className="value">{formatCurrency(totalContrib, { compact: true })}</span>
          {totalMatch > 0 && <span className="muted" style={{ fontSize: 11 }}>incl. {formatCurrency(totalMatch, { compact: true })} match</span>}
        </div>
        <div className="summary-strip-item">
          <span className="label">Accounts</span>
          <span className="value">{scenario.accounts.length}</span>
        </div>
        {totalBalance > 0 && (
          <div className="summary-strip-item">
            <span className="label">Savings Rate</span>
            <span className="value">{formatPercent(totalContrib / totalBalance)}</span>
            <span className="muted" style={{ fontSize: 11 }}>of balance/yr</span>
          </div>
        )}
      </div>

      {/* Allocation bar */}
      {totalBalance > 0 && (
        <div className="acct-allocation">
          <div className="acct-allocation-label">Allocation by Account Type</div>
          <div className="acct-allocation-bar">
            {groups.map((g, i) => {
              const groupTotal = g.accounts.reduce((s, a) => s + a.balance, 0);
              const pct = (groupTotal / totalBalance) * 100;
              const colors = ['var(--chart)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'];
              return (
                <div
                  key={g.label}
                  className="acct-allocation-segment"
                  style={{ width: `${pct}%`, background: colors[i % colors.length] }}
                  title={`${g.label}: ${formatCurrency(groupTotal)} (${pct.toFixed(0)}%)`}
                />
              );
            })}
          </div>
          <div className="acct-allocation-legend">
            {groups.map((g, i) => {
              const groupTotal = g.accounts.reduce((s, a) => s + a.balance, 0);
              const pct = (groupTotal / totalBalance) * 100;
              const colors = ['var(--chart)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'];
              return (
                <div key={g.label} className="acct-allocation-legend-item">
                  <span className="acct-allocation-dot" style={{ background: colors[i % colors.length] }} />
                  <span>{g.icon} {g.label}</span>
                  <span className="muted" style={{ fontSize: 11 }}>{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Account groups */}
      {groups.map((g) => {
        const groupTotal = g.accounts.reduce((s, a) => s + a.balance, 0);
        const groupContrib = g.accounts.reduce((s, a) => s + a.annualContribution + a.employerMatch, 0);
        return (
          <div key={g.label} className="acct-group">
            <div className="acct-group-header">
              <span className="acct-group-icon">{g.icon}</span>
              <span className="acct-group-label">{g.label}</span>
              <span className="acct-group-count">{g.accounts.length}</span>
              <span className="acct-group-total">{formatCurrency(groupTotal, { compact: true })}</span>
              {groupContrib > 0 && <span className="acct-group-contrib">+{formatCurrency(groupContrib, { compact: true })}/yr</span>}
              <button className="btn btn-sm acct-group-add" onClick={() => store.addAccount(scenario.id, {
                name: 'New ' + g.label.replace(/ &.*/, ''), type: g.types[0], balance: 0, annualReturn: g.types[0] === 'checking_savings' ? 0.02 : 0.07, annualContribution: 0, employerMatch: 0,
              })}>+ Add</button>
            </div>
            <div className="acct-group-hint muted">{g.hint}</div>
            <div className="acct-group-cards">
              {g.accounts.map((acct) => (
                <AccountCard key={acct.id} acct={acct} scenario={scenario} store={store} />
              ))}
            </div>
          </div>
        );
      })}

      {scenario.accounts.length === 0 && (
        <p className="muted" style={{ padding: '8px 0' }}>No accounts added yet. Click "Add Account" to start tracking your savings and investments.</p>
      )}
    </div>
  );
}

const PROPERTY_TYPES: PropertyType[] = ['primary_residence', 'vacation', 'investment', 'land', 'other'];

/** Helper: compute estimated annual mortgage payment for a future purchase */
function computeAnnualMortgage(principal: number, annualRate: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0;
  const r = annualRate / 12;
  const n = years * 12;
  const monthly = principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
  return monthly * 12;
}

const PLAN_ACTION_LABELS: { value: string; label: string; icon: string }[] = [
  { value: 'keep', label: 'Keep it', icon: '🏠' },
  { value: 'sell', label: 'Sell it', icon: '🏡' },
  { value: 'sell_and_buy', label: 'Sell and buy another', icon: '🔄' },
  { value: 'undecided', label: 'Not sure yet', icon: '🤔' },
];

function PropertyCard({ prop, scenario, store }: {
  prop: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0]['properties'] extends (infer T)[] | undefined ? T : never;
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
}) {
  const equity = prop.currentValue - prop.mortgageBalance;
  const annualHousing = prop.annualPropertyTax + prop.annualInsurance;
  const loanAmount = (prop.purchasePrice ?? 0) - (prop.downPayment ?? 0);
  const estMortgage = computeAnnualMortgage(loanAmount, prop.mortgageRate ?? 0.065, prop.mortgageTerm ?? 30);
  const payoffYears = prop.mortgageYearsLeft ?? (prop.mortgageBalance > 0 ? 30 : 0);
  const planAction = prop.planAction ?? 'undecided';
  const showSaleFields = planAction === 'sell' || planAction === 'sell_and_buy';
  const showBuyFields = planAction === 'sell_and_buy';

  // Build retirement impact summary sentence
  let impactSentence = '';
  if (planAction === 'keep') {
    impactSentence = `You'll have ~${formatCurrency(equity, { compact: true })} in equity and pay ~${formatCurrency(annualHousing + (prop.mortgagePayment ?? 0), { compact: true })}/yr in housing costs during retirement.`;
  } else if (planAction === 'sell' || planAction === 'sell_and_buy') {
    const proceeds = prop.saleProceeds ?? equity;
    if (planAction === 'sell') {
      impactSentence = `Selling at age ${prop.saleAge ?? '?'} frees up ~${formatCurrency(proceeds, { compact: true })} and eliminates ${formatCurrency(annualHousing + (prop.mortgagePayment ?? 0), { compact: true })}/yr in housing costs.`;
    } else {
      impactSentence = `Selling at age ${prop.saleAge ?? '?'} frees up ~${formatCurrency(proceeds, { compact: true })}, then buying at age ${prop.purchaseAge ?? '?'} adds ~${formatCurrency(estMortgage, { compact: true })}/yr in mortgage costs.`;
    }
  } else {
    impactSentence = `This property represents ~${formatCurrency(equity, { compact: true })} in equity. Choose a plan above to see the retirement impact.`;
  }

  return (
    <div className="prop-card">
      {/* === Step 1: Property header + basics === */}
      <div className="prop-card-header">
        <span className="prop-icon">{prop.type === 'land' ? '🌳' : '🏠'}</span>
        <input type="text" className="prop-name-input" value={prop.name} placeholder="e.g. Family Home" onChange={(e) => store.updateProperty(scenario.id, prop.id, { name: e.target.value })} />
        <select className="table-select" value={prop.type} onChange={(e) => store.updateProperty(scenario.id, prop.id, { type: e.target.value as PropertyType })} style={{ width: 'auto', minWidth: 140 }}>
          {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{prettify(t)}</option>)}
        </select>
        <ConfirmDelete title="Delete property" onConfirm={() => store.deleteProperty(scenario.id, prop.id)} />
      </div>

      {/* === Step 1: Current property (compact) === */}
      <div className="prop-step">
        <div className="prop-step-label">① Current Property</div>
        <div className="prop-zone-grid">
          <div className="prop-field">
            <label>Current market value</label>
            <CurrencyCellInput value={prop.currentValue} onChange={(v) => store.updateProperty(scenario.id, prop.id, { currentValue: v })} />
            <a href={`https://www.zillow.com/homes/${encodeURIComponent(prop.name || '')}_rb/`} target="_blank" rel="noopener noreferrer" className="prop-zillow-link">🔍 Check Zillow</a>
          </div>
          <div className="prop-field">
            <label>Remaining mortgage balance</label>
            <CurrencyCellInput value={prop.mortgageBalance} onChange={(v) => store.updateProperty(scenario.id, prop.id, { mortgageBalance: v })} />
          </div>
          <div className="prop-field">
            <label>Annual mortgage payment (P+I)</label>
            <CurrencyCellInput value={prop.mortgagePayment ?? 0} onChange={(v) => store.updateProperty(scenario.id, prop.id, { mortgagePayment: v })} />
          </div>
          <div className="prop-field">
            <label>Years remaining</label>
            <input type="number" value={prop.mortgageYearsLeft ?? ''} placeholder="—" onChange={(e) => store.updateProperty(scenario.id, prop.id, { mortgageYearsLeft: +e.target.value || undefined })} />
          </div>
          <div className="prop-field">
            <label>Property tax /yr</label>
            <CurrencyCellInput value={prop.annualPropertyTax} onChange={(v) => store.updateProperty(scenario.id, prop.id, { annualPropertyTax: v })} />
          </div>
          <div className="prop-field">
            <label>Home insurance /yr</label>
            <CurrencyCellInput value={prop.annualInsurance} onChange={(v) => store.updateProperty(scenario.id, prop.id, { annualInsurance: v })} />
          </div>
          <div className="prop-field">
            <label>Expected annual home value growth</label>
            <PctCellInput value={prop.annualAppreciation} onChange={(v) => store.updateProperty(scenario.id, prop.id, { annualAppreciation: v })} />
          </div>
        </div>
      </div>

      {/* === Quick metrics (calculated, not editable) === */}
      <div className="prop-quick-metrics">
        <div className="prop-quick-metric">
          <span className="prop-quick-label">Equity</span>
          <span className="prop-quick-value" style={{ color: equity >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatCurrency(equity, { compact: true })}</span>
        </div>
        <div className="prop-quick-metric">
          <span className="prop-quick-label">Housing cost/yr</span>
          <span className="prop-quick-value">{formatCurrency(annualHousing + (prop.mortgagePayment ?? 0), { compact: true })}</span>
        </div>
        {payoffYears > 0 && (
          <div className="prop-quick-metric">
            <span className="prop-quick-label">Mortgage payoff</span>
            <span className="prop-quick-value">~{payoffYears} yrs</span>
          </div>
        )}
      </div>

      {/* === Step 2: Plan decision (moved UP) === */}
      <div className="prop-step prop-step-decision">
        <div className="prop-step-label">② What's your plan for this property?</div>
        <div className="prop-plan-grid">
          {PLAN_ACTION_LABELS.map((opt) => (
            <button
              key={opt.value}
              className={`prop-plan-option ${planAction === opt.value ? 'active' : ''}`}
              onClick={() => {
                const action = opt.value as 'keep' | 'sell' | 'sell_and_buy' | 'undecided';
                const updates: Record<string, unknown> = { planAction: action };
                if ((action === 'sell' || action === 'sell_and_buy') && !prop.saleAge) {
                  updates.saleAge = scenario.assumptions.retirementAge;
                  updates.saleProceeds = equity;
                }
                if (action === 'sell_and_buy' && !prop.purchaseAge) {
                  updates.purchaseAge = scenario.assumptions.retirementAge;
                }
                store.updateProperty(scenario.id, prop.id, updates);
              }}
            >
              <span className="prop-plan-icon">{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* === Step 3: Conditional details (progressive disclosure) === */}
      {planAction === 'keep' && (
        <div className="prop-step prop-step-conditional">
          <div className="prop-step-label">③ Keep Through Retirement</div>
          <p className="prop-plan-note">Housing costs (mortgage if remaining, tax, insurance) will continue as expenses in your retirement projection. Your equity stays illiquid unless you sell later.</p>
        </div>
      )}

      {planAction === 'undecided' && (
        <div className="prop-step prop-step-conditional">
          <div className="prop-step-label">③ Exploration Mode</div>
          <p className="prop-plan-note">Choose a plan above to model how this property affects your retirement. You can change your selection anytime — the projection updates instantly.</p>
        </div>
      )}

      {showSaleFields && (
        <div className="prop-step prop-step-conditional">
          <div className="prop-step-label">③ Sale Details</div>
          <div className="prop-zone-grid">
            <div className="prop-field">
              <label>Sell at age</label>
              <input type="number" value={prop.saleAge ?? ''} placeholder="—" onChange={(e) => { const val = +e.target.value || null; store.updateProperty(scenario.id, prop.id, { saleAge: val, saleProceeds: val ? equity : (prop.saleProceeds ?? 0) }); }} />
            </div>
            <div className="prop-field">
              <label>Net proceeds after mortgage payoff</label>
              <CurrencyCellInput value={prop.saleProceeds ?? 0} onChange={(v) => store.updateProperty(scenario.id, prop.id, { saleProceeds: v })} />
            </div>
          </div>
        </div>
      )}

      {showBuyFields && (
        <div className="prop-step prop-step-conditional">
          <div className="prop-step-label">④ New Home Purchase</div>
          <div className="prop-zone-grid">
            <div className="prop-field">
              <label>Buy at age</label>
              <input type="number" value={prop.purchaseAge ?? ''} placeholder="—" onChange={(e) => store.updateProperty(scenario.id, prop.id, { purchaseAge: +e.target.value || null })} />
            </div>
            <div className="prop-field">
              <label>Purchase price</label>
              <CurrencyCellInput value={prop.purchasePrice ?? 0} onChange={(v) => store.updateProperty(scenario.id, prop.id, { purchasePrice: v })} />
            </div>
            <div className="prop-field">
              <label>Down payment</label>
              <CurrencyCellInput value={prop.downPayment ?? 0} onChange={(v) => store.updateProperty(scenario.id, prop.id, { downPayment: v })} />
            </div>
            <div className="prop-field">
              <label>New mortgage rate</label>
              <PctCellInput value={prop.mortgageRate ?? 0.065} onChange={(v) => store.updateProperty(scenario.id, prop.id, { mortgageRate: v })} />
            </div>
            <div className="prop-field">
              <label>Mortgage term (years)</label>
              <input type="number" value={prop.mortgageTerm ?? 30} onChange={(e) => store.updateProperty(scenario.id, prop.id, { mortgageTerm: +e.target.value })} />
            </div>
          </div>
          {estMortgage > 0 && (
            <div className="prop-quick-metrics prop-quick-metrics-inline">
              <span className="prop-quick-label">Estimated payment:</span>
              <span className="prop-quick-value" style={{ fontSize: 'var(--text-sm)' }}>{formatCurrency(estMortgage)}/yr</span>
              <span className="prop-metric-sub">({formatCurrency(estMortgage / 12)}/mo)</span>
            </div>
          )}
        </div>
      )}

      {/* === Step Final: Retirement Impact (always visible) === */}
      <div className="prop-step prop-step-impact">
        <div className="prop-step-label">📊 Retirement Impact</div>
        <div className="prop-impact-grid">
          <div className="prop-impact-item">
            <span className="prop-impact-icon">🏠</span>
            <div>
              <div className="prop-impact-value">{formatCurrency(equity, { compact: true })}</div>
              <div className="prop-impact-label">Equity available</div>
            </div>
          </div>
          <div className="prop-impact-item">
            <span className="prop-impact-icon">💰</span>
            <div>
              <div className="prop-impact-value">{formatCurrency(annualHousing + (prop.mortgagePayment ?? 0), { compact: true })}/yr</div>
              <div className="prop-impact-label">Housing cost in retirement</div>
            </div>
          </div>
          {showSaleFields && (prop.saleProceeds ?? 0) > 0 && (
            <div className="prop-impact-item">
              <span className="prop-impact-icon">💵</span>
              <div>
                <div className="prop-impact-value" style={{ color: 'var(--green)' }}>{formatCurrency(prop.saleProceeds ?? 0, { compact: true })}</div>
                <div className="prop-impact-label">Cash from sale at age {prop.saleAge}</div>
              </div>
            </div>
          )}
          {showBuyFields && estMortgage > 0 && (
            <div className="prop-impact-item">
              <span className="prop-impact-icon">🔑</span>
              <div>
                <div className="prop-impact-value">{formatCurrency(estMortgage, { compact: true })}/yr</div>
                <div className="prop-impact-label">New mortgage at age {prop.purchaseAge}</div>
              </div>
            </div>
          )}
        </div>
        <p className="prop-impact-summary">{impactSentence}</p>
      </div>
    </div>
  );
}

function PropertiesPanel({ scenario, store }: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
}) {
  const properties = scenario.properties ?? [];
  const totalValue = properties.reduce((s, p) => s + p.currentValue, 0);
  const totalMortgage = properties.reduce((s, p) => s + p.mortgageBalance, 0);
  const totalEquity = totalValue - totalMortgage;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>🏠 Homes & Property</h2>
        <button className="btn btn-sm" onClick={() => store.addProperty(scenario.id, {
          name: 'New Property', type: 'primary_residence', currentValue: 0, mortgageBalance: 0, annualAppreciation: 0.03, annualPropertyTax: 0, annualInsurance: 0,
        })}>+ Add Property</button>
      </div>
      <p className="section-help">
        Track properties you own and model future purchases or sales. Property tax and insurance are automatically included in your retirement expenses.
        Your home equity and any sale proceeds are factored into your retirement plan.
      </p>
      <div className="summary-strip">
        <div className="summary-strip-item">
          <span className="label">Total Property Value</span>
          <span className="value">{formatCurrency(totalValue, { compact: true })}</span>
        </div>
        <div className="summary-strip-item">
          <span className="label">Total Mortgages</span>
          <span className="value" style={{ color: 'var(--red)' }}>{formatCurrency(totalMortgage, { compact: true })}</span>
        </div>
        <div className="summary-strip-item">
          <span className="label">Total Equity</span>
          <span className="value" style={{ color: totalEquity >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatCurrency(totalEquity, { compact: true })}</span>
        </div>
        <div className="summary-strip-item">
          <span className="label">Properties</span>
          <span className="value">{properties.length}</span>
        </div>
      </div>
      {properties.length === 0 ? (
        <p className="muted" style={{ padding: '8px 0' }}>No properties added yet. Click "Add Property" to include your home or other real estate in your plan.</p>
      ) : (
        <div className="prop-card-list">
          {properties.map((prop) => (
            <PropertyCard key={prop.id} prop={prop} scenario={scenario} store={store} />
          ))}
        </div>
      )}
    </div>
  );
}

const CATEGORY_ICONS: Record<string, string> = {
  housing: '🏠',
  food: '🍽️',
  transportation: '🚗',
  healthcare: '🏥',
  insurance: '🛡️',
  utilities: '💡',
  entertainment: '🎬',
  travel: '✈️',
  debt_payment: '💳',
  taxes: '🧾',
  other: '📦',
};

function getExpensePhase(exp: { preRetirement: boolean; postRetirement: boolean }): { label: string; cls: string } {
  if (exp.preRetirement && exp.postRetirement) return { label: 'Continues through retirement', cls: 'exp-phase-both' };
  if (exp.preRetirement && !exp.postRetirement) return { label: 'Ends at retirement', cls: 'exp-phase-pre' };
  if (!exp.preRetirement && exp.postRetirement) return { label: 'Starts in retirement', cls: 'exp-phase-post' };
  return { label: 'Inactive', cls: 'exp-phase-none' };
}

function ExpenseRow({ exp, scenario, store }: {
  exp: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0]['expenses'][0];
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
}) {
  const phase = getExpensePhase(exp);
  const monthly = Math.round(exp.annualAmount / 12);

  return (
    <div className="income-row exp-row">
      <div className="income-row-main">
        <span className="income-row-icon">{CATEGORY_ICONS[exp.category] ?? '📦'}</span>
        <input
          type="text"
          className="income-row-name"
          value={exp.name}
          onChange={(e) => store.updateExpense(scenario.id, exp.id, { name: e.target.value })}
        />
        <select
          className="table-select income-row-type"
          value={exp.category}
          onChange={(e) => store.updateExpense(scenario.id, exp.id, { category: e.target.value as ExpenseCategory })}
        >
          {EXPENSE_CATEGORIES.map((t) => <option key={t} value={t}>{prettify(t)}</option>)}
        </select>
      </div>
      <div className="income-row-details">
        <div className="income-row-amount">
          <CurrencyCellInput value={monthly} onChange={(v) => store.updateExpense(scenario.id, exp.id, { annualAmount: v * 12 })} />
          <span className="income-row-amount-unit">/mo</span>
        </div>
        <div className="income-row-flags">
          <button
            className={`income-flag ${exp.preRetirement ? 'active' : ''}`}
            title="Applies before retirement"
            onClick={() => store.updateExpense(scenario.id, exp.id, { preRetirement: !exp.preRetirement })}
          >💼 Before</button>
          <button
            className={`income-flag ${exp.postRetirement ? 'active' : ''}`}
            title="Applies after retirement"
            onClick={() => store.updateExpense(scenario.id, exp.id, { postRetirement: !exp.postRetirement })}
          >🏖️ After</button>
        </div>
        <ConfirmDelete title="Delete expense" onConfirm={() => store.deleteExpense(scenario.id, exp.id)} />
      </div>
      <div className="income-row-summary">
        <span className={`income-phase-badge ${phase.cls}`}>{phase.label}</span>
      </div>
    </div>
  );
}

function ExpensesPanel({ scenario, store }: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
}) {
  const preRetTotal = scenario.expenses.filter(e => e.preRetirement).reduce((s, e) => s + e.annualAmount, 0) / 12;
  const postRetTotal = scenario.expenses.filter(e => e.postRetirement).reduce((s, e) => s + e.annualAmount, 0) / 12;

  // Group by category
  const groups = EXPENSE_CATEGORIES.map((cat) => ({
    category: cat,
    icon: CATEGORY_ICONS[cat] ?? '📦',
    expenses: scenario.expenses.filter((e) => e.category === cat),
  })).filter((g) => g.expenses.length > 0);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>📋 Expenses</h2>
        <button className="btn btn-sm" onClick={() => store.addExpense(scenario.id, {
          name: 'New Expense', category: 'other', annualAmount: 0, preRetirement: false, postRetirement: true, startAge: null, endAge: null,
        })}>+ Add Expense</button>
      </div>
      <p className="section-help">
        Enter your monthly costs for each category. Toggle <strong>Before</strong> and/or <strong>After</strong> to control
        when each expense applies in your retirement plan.
      </p>

      {/* Quick add common expenses */}
      <details className="quick-add-section">
        <summary className="quick-add-label">⚡ Quick Add Common Expenses <span className="quick-add-toggle"></span></summary>
        <div className="quick-add-grid">
          {COMMON_EXPENSES.map((ce) => (
            <button key={ce.name} className="quick-add-btn" onClick={() => store.addExpense(scenario.id, { ...ce })}>
              <span className="quick-add-icon">{ce.icon}</span>
              <span>{ce.name}</span>
              <span className="quick-add-amount">{formatCurrency(ce.annualAmount / 12, { compact: true })}/mo</span>
            </button>
          ))}
        </div>
      </details>

      <div className="summary-strip">
        <div className="summary-strip-item">
          <span className="label">Before Retirement</span>
          <span className="value">{formatCurrency(preRetTotal, { compact: true })}<span className="muted" style={{ fontSize: 12 }}> /mo</span></span>
        </div>
        <div className="summary-strip-item">
          <span className="label">After Retirement</span>
          <span className="value">{formatCurrency(postRetTotal, { compact: true })}<span className="muted" style={{ fontSize: 12 }}> /mo</span></span>
        </div>
        <div className="summary-strip-item">
          <span className="label">Expense Count</span>
          <span className="value">{scenario.expenses.length}</span>
        </div>
      </div>

      {scenario.expenses.length === 0 ? (
        <p className="muted" style={{ padding: '8px 0' }}>No expenses added yet. Use Quick Add above or click "Add Expense" to start.</p>
      ) : (
        <div className="income-groups">
          {groups.map((g) => {
            const groupTotal = g.expenses.reduce((s, e) => s + e.annualAmount, 0) / 12;
            return (
              <div key={g.category} className="income-group">
                <div className="income-group-header">
                  <span className="income-group-icon">{g.icon}</span>
                  <span className="income-group-label">{prettify(g.category)}</span>
                  <span className="income-group-count">{g.expenses.length}</span>
                  <span className="income-group-total-muted">{formatCurrency(groupTotal, { compact: true })}/mo</span>
                </div>
                <div className="income-group-rows">
                  {g.expenses.map((exp) => (
                    <ExpenseRow key={exp.id} exp={exp} scenario={scenario} store={store} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Income type icons */
const INCOME_ICONS: Record<string, string> = {
  salary: '💼',
  social_security: '🏛️',
  pension: '🏢',
  part_time: '🕐',
  self_employment: '🔨',
  rental: '🏠',
  annuity: '📊',
  dividends: '💰',
  other: '📦',
};

/** Format timing as a compact summary */
function formatTiming(startAge: number, endAge: number | null, retirementAge: number): { text: string; phase: 'pre' | 'post' | 'both' } {
  const endsAt = endAge ?? 999;
  const startsPre = startAge < retirementAge;
  const endsPost = endsAt >= retirementAge;
  let phase: 'pre' | 'post' | 'both' = 'both';
  if (startsPre && !endsPost) phase = 'pre';
  else if (!startsPre && endsPost) phase = 'post';

  if (endAge === null) {
    return { text: `Age ${startAge} → lifetime`, phase };
  }
  return { text: `Age ${startAge} → ${endAge}`, phase };
}

function IncomeRow({ inc, scenario, store }: {
  inc: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0]['incomeSources'][0];
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
}) {
  const timing = formatTiming(inc.startAge, inc.endAge, scenario.assumptions.retirementAge);
  const monthly = Math.round(inc.annualAmount / 12);

  return (
    <div className="income-row">
      <div className="income-row-main">
        <span className="income-row-icon">{INCOME_ICONS[inc.type] ?? '📦'}</span>
        <input
          type="text"
          className="income-row-name"
          value={inc.name}
          onChange={(e) => store.updateIncome(scenario.id, inc.id, { name: e.target.value })}
        />
        <select
          className="table-select income-row-type"
          value={inc.type}
          onChange={(e) => store.updateIncome(scenario.id, inc.id, { type: e.target.value as IncomeType })}
        >
          {INCOME_TYPES.map((t) => <option key={t} value={t}>{prettify(t)}</option>)}
        </select>
      </div>
      <div className="income-row-details">
        <div className="income-row-amount">
          <CurrencyCellInput value={monthly} onChange={(v) => store.updateIncome(scenario.id, inc.id, { annualAmount: v * 12 })} />
          <span className="income-row-amount-unit">/mo</span>
        </div>
        <div className="income-row-timing">
          <label>Start</label>
          <NumCellInput value={inc.startAge} onChange={(v) => store.updateIncome(scenario.id, inc.id, { startAge: v })} />
          <label>End</label>
          {inc.endAge === null ? (
            <button
              className="income-lifetime-btn active"
              onClick={() => store.updateIncome(scenario.id, inc.id, { endAge: inc.startAge })}
            >Lifetime</button>
          ) : (
            <button
              className="income-lifetime-btn"
              onClick={() => store.updateIncome(scenario.id, inc.id, { endAge: null })}
            >∞</button>
          )}
          {inc.endAge !== null && (
            <NumCellInput value={inc.endAge} onChange={(v) => store.updateIncome(scenario.id, inc.id, { endAge: v || null })} />
          )}
        </div>
        <div className="income-row-flags">
          <button
            className={`income-flag ${inc.cola ? 'active' : ''}`}
            title="Inflation adjusted (COLA)"
            onClick={() => store.updateIncome(scenario.id, inc.id, { cola: !inc.cola })}
          >📈 COLA</button>
          <button
            className={`income-flag ${inc.taxable ? 'active' : ''}`}
            title="Taxed as ordinary income"
            onClick={() => store.updateIncome(scenario.id, inc.id, { taxable: !inc.taxable })}
          >🧾 Tax</button>
        </div>
        <ConfirmDelete title="Delete income source" onConfirm={() => store.deleteIncome(scenario.id, inc.id)} />
      </div>
      <div className="income-row-summary">
        <span className={`income-phase-badge income-phase-${timing.phase}`}>{timing.phase === 'pre' ? 'Pre-Retirement' : timing.phase === 'post' ? 'Retirement' : 'Both Phases'}</span>
        <span className="income-timing-text">{timing.text}</span>
      </div>
    </div>
  );
}

function IncomePanel({ scenario, store }: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
}) {
  const totalMonthly = scenario.incomeSources.reduce((s, i) => s + i.annualAmount, 0) / 12;
  const ssCount = scenario.incomeSources.filter(i => i.type === 'social_security').length;

  // Group by phase
  const preRet = scenario.incomeSources.filter(i => {
    const t = formatTiming(i.startAge, i.endAge, scenario.assumptions.retirementAge);
    return t.phase === 'pre' || t.phase === 'both';
  });
  const postRet = scenario.incomeSources.filter(i => {
    const t = formatTiming(i.startAge, i.endAge, scenario.assumptions.retirementAge);
    return t.phase === 'post' || t.phase === 'both';
  });

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>💵 Income Sources</h2>
        <button className="btn btn-sm" onClick={() => store.addIncome(scenario.id, {
          name: 'New Income', type: 'part_time', annualAmount: 0, startAge: scenario.assumptions.currentAge, endAge: scenario.assumptions.retirementAge - 1, cola: true, taxable: true,
        })}>+ Add Income</button>
      </div>
      <p className="section-help">
        Add <strong>any income source</strong> — pre-retirement (salary, self-employment) or post-retirement (Social Security, pension).
        Set Start/End ages to control when each source is active.
      </p>
      <div className="summary-strip">
        <div className="summary-strip-item">
          <span className="label">Total Monthly</span>
          <span className="value">{formatCurrency(totalMonthly, { compact: true })}<span className="muted" style={{ fontSize: 12 }}> /mo</span></span>
        </div>
        <div className="summary-strip-item">
          <span className="label">Sources</span>
          <span className="value">{scenario.incomeSources.length}</span>
        </div>
        {ssCount > 0 && (
          <div className="summary-strip-item">
            <span className="label">Social Security</span>
            <span className="value">{ssCount}</span>
          </div>
        )}
      </div>

      {scenario.incomeSources.length === 0 ? (
        <p className="muted" style={{ padding: '8px 0' }}>No income sources added yet. Click "Add Income" to start tracking salary, Social Security, pensions, and more.</p>
      ) : (
        <div className="income-groups">
          {preRet.length > 0 && (
            <div className="income-group">
              <div className="income-group-header">
                <span className="income-group-icon">💼</span>
                <span className="income-group-label">Pre-Retirement Income</span>
                <span className="income-group-count">{preRet.length}</span>
              </div>
              <div className="income-group-rows">
                {preRet.map((inc) => (
                  <IncomeRow key={inc.id} inc={inc} scenario={scenario} store={store} />
                ))}
              </div>
            </div>
          )}
          {postRet.length > 0 && (
            <div className="income-group">
              <div className="income-group-header">
                <span className="income-group-icon">🏛️</span>
                <span className="income-group-label">Retirement Income</span>
                <span className="income-group-count">{postRet.length}</span>
              </div>
              <div className="income-group-rows">
                {postRet.map((inc) => (
                  <IncomeRow key={inc.id} inc={inc} scenario={scenario} store={store} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Event type metadata: icon, hint, and which fields are emphasized
const EVENT_META: Record<EventType, { icon: string; hint: string; example: string }> = {
  home_purchase: { icon: '🏠', hint: 'Down payment and closing costs reduce your savings. Ongoing impact can model higher property taxes or mortgage payments.', example: 'Buy a retirement home' },
  home_sale: { icon: '🏡', hint: 'Proceeds from the sale add to your savings. You can model ongoing impact for reduced housing costs after downsizing.', example: 'Sell current house' },
  large_purchase: { icon: '🚗', hint: 'A one-time expense like a vehicle, RV, or major renovation. Enter the total cost and when it happens.', example: 'Buy an RV' },
  windfall: { icon: '💰', hint: 'An inheritance, gift, or bonus. Enter the proceeds amount and when you expect to receive it.', example: 'Receive inheritance' },
  other: { icon: '📋', hint: 'Any other significant financial event. Use cost for money out, proceeds for money in, and ongoing for recurring impacts.', example: 'Custom event' },
};

function EventsPanel({ scenario, store }: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
}) {
  const totalOneTimeCost = scenario.events.reduce((s, e) => s + e.cost, 0);
  const totalOneTimeProceeds = scenario.events.reduce((s, e) => s + e.proceeds, 0);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>📅 Life Events</h2>
        <button className="btn btn-sm" onClick={() => store.addEvent(scenario.id, {
          name: '', type: 'home_purchase', age: scenario.assumptions.currentAge + 5, cost: 0, proceeds: 0, ongoingAnnualImpact: 0, ongoingDurationYears: null, notes: '',
        })}>+ Add Event</button>
      </div>
      <p className="section-help">
        Model major events that impact your retirement plan — buying or selling a home, receiving an inheritance,
        making a large purchase, or any significant financial change. Each event card shows only the fields relevant to that event type.
      </p>
      {scenario.events.length > 0 && (
        <div className="summary-strip">
          <div className="summary-strip-item">
            <span className="label">Total Cost</span>
            <span className="value" style={{ color: 'var(--red)' }}>{formatCurrency(totalOneTimeCost, { compact: true })}</span>
          </div>
          <div className="summary-strip-item">
            <span className="label">Total Proceeds</span>
            <span className="value" style={{ color: 'var(--green)' }}>{formatCurrency(totalOneTimeProceeds, { compact: true })}</span>
          </div>
          <div className="summary-strip-item">
            <span className="label">Net Impact</span>
            <span className="value" style={{ color: totalOneTimeProceeds - totalOneTimeCost >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {formatCurrency(totalOneTimeProceeds - totalOneTimeCost, { compact: true })}
            </span>
          </div>
          <div className="summary-strip-item">
            <span className="label">Events</span>
            <span className="value">{scenario.events.length}</span>
          </div>
        </div>
      )}
      {scenario.events.length === 0 ? (
        <p className="muted" style={{ padding: '8px 0' }}>No life events modeled. Add one to see how a home purchase, inheritance, or large expense affects your plan.</p>
      ) : (
        scenario.events.map((ev) => {
          const meta = EVENT_META[ev.type] || EVENT_META.other;
          const hasOngoing = ev.ongoingAnnualImpact !== 0;
          return (
            <div key={ev.id} className="event-card">
              <div className="event-card-header">
                <span className="event-icon">{meta.icon}</span>
                <span className="event-name">
                  <input
                    type="text"
                    value={ev.name}
                    placeholder={`e.g. ${meta.example}`}
                    onChange={(e) => store.updateEvent(scenario.id, ev.id, { name: e.target.value })}
                  />
                </span>
                <select
                  className="table-select"
                  value={ev.type}
                  onChange={(e) => store.updateEvent(scenario.id, ev.id, { type: e.target.value as EventType })}
                  style={{ width: 'auto', minWidth: 140 }}
                >
                  {EVENT_TYPES.map((t) => <option key={t} value={t}>{prettify(t)}</option>)}
                </select>
                <ConfirmDelete title="Delete event" onConfirm={() => store.deleteEvent(scenario.id, ev.id)} />
              </div>
              <div className="event-card-body">
                {/* When it happens */}
                <div className="event-field-group">
                  <span className="group-label">When</span>
                  <div className="field-row">
                    <label>At age</label>
                    <input
                      type="number"
                      value={ev.age}
                      onChange={(e) => store.updateEvent(scenario.id, ev.id, { age: +e.target.value })}
                      style={{ width: 70 }}
                    />
                  </div>
                </div>

                {/* Money out (cost) — shown for purchase types */}
                {(ev.type === 'home_purchase' || ev.type === 'large_purchase' || ev.type === 'other') && (
                  <div className="event-field-group">
                    <span className="group-label">Money Out</span>
                    <div className="field-row">
                      <CurrencyCellInput value={ev.cost} onChange={(v) => store.updateEvent(scenario.id, ev.id, { cost: v })} />
                    </div>
                  </div>
                )}

                {/* Money in (proceeds) — shown for sale/windfall types */}
                {(ev.type === 'home_sale' || ev.type === 'windfall' || ev.type === 'other') && (
                  <div className="event-field-group">
                    <span className="group-label">Money In</span>
                    <div className="field-row">
                      <CurrencyCellInput value={ev.proceeds} onChange={(v) => store.updateEvent(scenario.id, ev.id, { proceeds: v })} />
                    </div>
                  </div>
                )}

                {/* Ongoing impact */}
                <div className="event-field-group">
                  <span className="group-label">Ongoing Impact {hasOngoing ? '' : '(optional)'}</span>
                  <div className="field-row">
                    <CurrencyCellInput value={ev.ongoingAnnualImpact} onChange={(v) => store.updateEvent(scenario.id, ev.id, { ongoingAnnualImpact: v })} />
                    <label>/yr for</label>
                    <input
                      type="number"
                      value={ev.ongoingDurationYears ?? 0}
                      placeholder="∞"
                      onChange={(e) => store.updateEvent(scenario.id, ev.id, { ongoingDurationYears: +e.target.value || null })}
                      style={{ width: 60 }}
                    />
                    <span className="muted" style={{ fontSize: 12 }}>yrs</span>
                  </div>
                </div>
              </div>
              <div className="event-hint">{meta.hint}</div>
            </div>
          );
        })
      )}
    </div>
  );
}

/* ============ RESULTS VIEW ============ */

function ResultsView({ scenario, result, readiness }: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  result: NonNullable<ReturnType<typeof runProjection>>;
  readiness: NonNullable<ReturnType<typeof getReadinessSummary>>;
}) {
  const tc = useThemeColors();
  const tooltipStyle = { background: tc.panel, border: `1px solid ${tc.border}`, borderRadius: 8 };

  const chartData = result.years.map((y) => ({
    age: y.age,
    'Nominal Assets': Math.round(y.endingAssets),
    'Today\'s Dollars': Math.round(y.realAssets),
  }));

  const cashFlowData = result.years.filter((y) => y.age >= scenario.assumptions.retirementAge).map((y) => ({
    age: y.age,
    Income: Math.round(y.income),
    Withdrawals: Math.round(y.withdrawals),
    Expenses: Math.round(y.expenses),
  }));

  return (
    <div>
      {/* Summary cards */}
      <div className="summary-grid">
        <div className="summary-card">
          <div className="label">Nest Egg at Retirement</div>
          <div className="value">{formatCurrency(readiness.nestEggAtRetirement, { compact: true })}</div>
          <div className="sub">{formatCurrency(readiness.nestEggAtRetirementReal, { compact: true })} in today's dollars</div>
        </div>
        <div className="summary-card">
          <div className="label">Plan Outcome</div>
          <div className={`value ${result.success ? 'value-good' : 'value-bad'}`}>
            {result.success ? '✓ Sustainable' : '✗ Runs Out'}
          </div>
          <div className="sub">{result.success ? `Lasts to age ${scenario.assumptions.endAge}` : `Depleted at age ${formatAge(result.depletionAge)}`}</div>
        </div>
        <div className="summary-card">
          <div className="label">Year-1 Withdrawal Rate</div>
          <div className={`value ${readiness.neededWithdrawalRate <= scenario.assumptions.safeWithdrawalRate ? 'value-good' : 'value-bad'}`}>
            {formatPercent(readiness.neededWithdrawalRate)}
          </div>
          <div className="sub">Safe rate: {formatPercent(scenario.assumptions.safeWithdrawalRate)}</div>
        </div>
        <div className="summary-card">
          <div className="label">Final Assets (age {scenario.assumptions.endAge})</div>
          <div className="value">{formatCurrency(result.finalAssets, { compact: true })}</div>
          <div className="sub">{formatCurrency(result.finalAssetsReal, { compact: true })} in today's dollars</div>
        </div>
      </div>

      {/* Net worth chart */}
      <div className="chart-container">
        <h3>Projected Net Worth Over Time</h3>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={tc.border} />
            <XAxis dataKey="age" stroke={tc.textDim} />
            <YAxis stroke={tc.textDim} tickFormatter={(v) => formatCurrency(v, { compact: true })} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number) => formatCurrency(v)}
              labelFormatter={(l) => `Age ${l}`}
              labelStyle={{ color: tc.text }}
              itemStyle={{ color: tc.text }}
            />
            <Legend />
            <Area type="monotone" dataKey="Nominal Assets" stroke={tc.chart} fill={tc.chart} fillOpacity={0.15} />
            <Area type="monotone" dataKey="Today's Dollars" stroke={tc.chart2} fill={tc.chart2} fillOpacity={0.1} />
            <ReferenceLine x={scenario.assumptions.retirementAge} stroke={tc.yellow} strokeDasharray="5 5" label={{ value: 'Retire', fill: tc.yellow, fontSize: 11 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Cash flow chart */}
      <div className="chart-container">
        <h3>Retirement Cash Flow (Income vs Expenses vs Withdrawals)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={cashFlowData}>
            <CartesianGrid strokeDasharray="3 3" stroke={tc.border} />
            <XAxis dataKey="age" stroke={tc.textDim} />
            <YAxis stroke={tc.textDim} tickFormatter={(v) => formatCurrency(v, { compact: true })} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number) => formatCurrency(v)}
              labelFormatter={(l) => `Age ${l}`}
              labelStyle={{ color: tc.text }}
              itemStyle={{ color: tc.text }}
            />
            <Legend />
            <Bar dataKey="Income" fill={tc.green} />
            <Bar dataKey="Withdrawals" fill={tc.chart} />
            <Bar dataKey="Expenses" fill={tc.red} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Year-by-year table */}
      <YearTable result={result} retirementAge={scenario.assumptions.retirementAge} scenario={scenario} />
    </div>
  );
}

/** Compute per-source income breakdown for a given age */
function getIncomeBreakdown(scenario: NonNullable<ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0]>, age: number) {
  const a = scenario.assumptions;
  const yearsFromNow = age - a.currentAge;
  const inflationFactor = Math.pow(1 + a.inflationRate, yearsFromNow);
  const items: { name: string; amount: number; type: string }[] = [];

  for (const inc of scenario.incomeSources) {
    if (age >= inc.startAge && (inc.endAge === null || age <= inc.endAge)) {
      let nominalGross: number;
      if (inc.cola) {
        // COLA income grows with inflation — inflationFactor alone captures this.
        nominalGross = inc.annualAmount * inflationFactor;
      } else {
        // Non-COLA income: nominal amount is fixed at startAge (inflated from today's $).
        const startAgeInflation = Math.pow(1 + a.inflationRate, inc.startAge - a.currentAge);
        nominalGross = inc.annualAmount * startAgeInflation;
      }
      const nominalNet = inc.taxable ? nominalGross * (1 - a.retirementTaxRate) : nominalGross;
      items.push({ name: inc.name, amount: nominalNet, type: inc.type });
    }
  }
  return items;
}

/** Compute per-source expense breakdown for a given age */
function getExpenseBreakdown(scenario: NonNullable<ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0]>, age: number) {
  const a = scenario.assumptions;
  const yearsFromNow = age - a.currentAge;
  const inflationFactor = Math.pow(1 + a.inflationRate, yearsFromNow);
  const isRetired = age >= a.retirementAge;
  const items: { name: string; amount: number; category: string }[] = [];

  // Regular expenses
  for (const exp of scenario.expenses) {
    const activePre = exp.preRetirement && !isRetired;
    const activePost = exp.postRetirement && isRetired;
    if (!activePre && !activePost) continue;
    if (exp.startAge !== null && age < exp.startAge) continue;
    if (exp.endAge !== null && age > exp.endAge) continue;
    items.push({ name: exp.name, amount: exp.annualAmount * inflationFactor, category: exp.category });
  }

  // Property expenses
  if (scenario.properties) {
    for (const prop of scenario.properties) {
      if (prop.saleAge && age >= prop.saleAge) continue;
      if (prop.purchaseAge && age < prop.purchaseAge) continue;

      const propTax = prop.annualPropertyTax * inflationFactor;
      if (propTax > 0) items.push({ name: `${prop.name} — Property Tax`, amount: propTax, category: 'housing' });

      const insurance = prop.annualInsurance * inflationFactor;
      if (insurance > 0) items.push({ name: `${prop.name} — Insurance`, amount: insurance, category: 'insurance' });

      // Existing mortgage
      if (!prop.purchaseAge && prop.mortgageBalance > 0) {
        const yearsLeft = prop.mortgageYearsLeft ?? 30;
        if (yearsFromNow < yearsLeft) {
          const payment = (prop.mortgagePayment ?? prop.mortgageBalance / 30) * inflationFactor;
          if (payment > 0) items.push({ name: `${prop.name} — Mortgage`, amount: payment, category: 'housing' });
        }
      }
    }
  }

  // Life events ongoing
  for (const ev of scenario.events) {
    if (age >= ev.age && ev.ongoingAnnualImpact !== 0) {
      const dur = ev.ongoingDurationYears;
      if (dur === null || age < ev.age + dur) {
        items.push({ name: `${ev.name} — Ongoing`, amount: ev.ongoingAnnualImpact * inflationFactor, category: 'other' });
      }
    }
  }

  return items;
}

function YearTable({ result, retirementAge, scenario }: { result: NonNullable<ReturnType<typeof runProjection>>; retirementAge: number; scenario: NonNullable<ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0]> }) {
  const [showAll, setShowAll] = useState(false);
  const [expandedAge, setExpandedAge] = useState<number | null>(null);
  const data = showAll ? result.years : result.years.filter((y) => y.age >= retirementAge - 5 && y.age <= retirementAge + 15);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>📊 Year-by-Year Detail</h2>
        <button className="btn btn-sm" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show Summary' : 'Show All Years'}</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 28 }}></th>
              <th>Age</th>
              <th className="text-right">Start Assets</th>
              <th className="text-right">Contrib.</th>
              <th className="text-right">Growth</th>
              <th className="text-right">Income</th>
              <th className="text-right">Withdrawals</th>
              <th className="text-right">Expenses</th>
              <th className="text-right">End Assets</th>
              <th className="text-right">Real $</th>
            </tr>
          </thead>
          <tbody>
            {data.map((y) => (
              <>
                <tr
                  key={y.age}
                  style={y.depleted ? { color: 'var(--red)' } : {}}
                  className="year-row"
                  onClick={() => setExpandedAge(expandedAge === y.age ? null : y.age)}
                >
                  <td className="drag-handle" style={{ cursor: 'pointer', opacity: 1 }}>{expandedAge === y.age ? '▼' : '▶'}</td>
                  <td style={{ cursor: 'pointer' }}>{y.age}</td>
                  <td className="text-right">{formatCurrency(y.beginningAssets, { compact: true })}</td>
                  <td className="text-right">{y.contributions > 0 ? formatCurrency(y.contributions, { compact: true }) : '—'}</td>
                  <td className="text-right" style={{ color: 'var(--green)' }}>{y.growth > 0 ? '+' + formatCurrency(y.growth, { compact: true }) : '—'}</td>
                  <td className="text-right">{y.income > 0 ? formatCurrency(y.income, { compact: true }) : '—'}</td>
                  <td className="text-right" style={{ color: y.withdrawals > 0 ? 'var(--red)' : undefined }}>{y.withdrawals > 0 ? '-' + formatCurrency(y.withdrawals, { compact: true }) : '—'}</td>
                  <td className="text-right">{y.expenses > 0 ? formatCurrency(y.expenses, { compact: true }) : '—'}</td>
                  <td className="text-right" style={{ fontWeight: 600 }}>{formatCurrency(y.endingAssets, { compact: true })}</td>
                  <td className="text-right muted">{formatCurrency(y.realAssets, { compact: true })}</td>
                </tr>
                {expandedAge === y.age && (
                  <tr key={`${y.age}-detail`} className="year-detail-row">
                    <td colSpan={10} style={{ padding: 0 }}>
                      <div className="year-detail">
                        <div className="year-detail-grid">
                          <div className="year-detail-section">
                            <div className="year-detail-title">💵 Income Sources</div>
                            <table className="data-table year-detail-table">
                              <tbody>
                                {(() => {
                                  const items = getIncomeBreakdown(scenario, y.age);
                                  if (items.length === 0) return <tr><td className="muted">No income this year</td></tr>;
                                  return items.map((item, i) => (
                                    <tr key={i}>
                                      <td>{item.name}</td>
                                      <td className="muted" style={{ fontSize: 11 }}>{prettify(item.type)}</td>
                                      <td className="text-right" style={{ color: 'var(--green)' }}>{formatCurrency(item.amount)}</td>
                                    </tr>
                                  ));
                                })()}
                              </tbody>
                            </table>
                          </div>
                          <div className="year-detail-section">
                            <div className="year-detail-title">📋 Expenses</div>
                            <table className="data-table year-detail-table">
                              <tbody>
                                {(() => {
                                  const items = getExpenseBreakdown(scenario, y.age);
                                  if (items.length === 0) return <tr><td className="muted">No expenses this year</td></tr>;
                                  return items.map((item, i) => (
                                    <tr key={i}>
                                      <td>{item.name}</td>
                                      <td className="muted" style={{ fontSize: 11 }}>{prettify(item.category)}</td>
                                      <td className="text-right" style={{ color: 'var(--red)' }}>{formatCurrency(item.amount)}</td>
                                    </tr>
                                  ));
                                })()}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============ COMPARE VIEW ============ */

function CompareView({ results }: { results: NonNullable<ReturnType<typeof runProjection>>[] }) {
  const tc = useThemeColors();
  const tooltipStyle = { background: tc.panel, border: `1px solid ${tc.border}`, borderRadius: 8 };
  const compareData = useMemo(() => {
    const maxAge = Math.max(...results.map((r) => r.years[r.years.length - 1]?.age ?? 0));
    const data: Record<string, number | string>[] = [];
    for (let age = results[0]?.years[0]?.age ?? 0; age <= maxAge; age++) {
      const row: Record<string, number | string> = { age };
      results.forEach((r) => {
        const y = r.years.find((y) => y.age === age);
        row[r.scenarioName] = y ? Math.round(y.realAssets) : 0;
      });
      data.push(row);
    }
    return data;
  }, [results]);

  const colors = ['#0d9488', '#0e7490', '#7c3aed', '#ca8a04', '#dc2626', '#d97706'];

  return (
    <div>
      <div className="summary-grid">
        {results.map((r, i) => (
          <div key={r.scenarioId} className="summary-card">
            <div className="label" style={{ color: colors[i % colors.length] }}>{r.scenarioName}</div>
            <div className={`value ${r.success ? 'value-good' : 'value-bad'}`}>
              {r.success ? '✓ Sustainable' : '✗ Depleted'}
            </div>
            <div className="sub">
              {r.success ? `${formatCurrency(r.finalAssetsReal, { compact: true })} at end` : `Runs out at age ${formatAge(r.depletionAge)}`}
            </div>
          </div>
        ))}
      </div>

      <div className="chart-container">
        <h3>Net Worth Comparison (Today's Dollars)</h3>
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={compareData}>
            <CartesianGrid strokeDasharray="3 3" stroke={tc.border} />
            <XAxis dataKey="age" stroke={tc.textDim} />
            <YAxis stroke={tc.textDim} tickFormatter={(v) => formatCurrency(v, { compact: true })} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number) => formatCurrency(v)}
              labelFormatter={(l) => `Age ${l}`}
              labelStyle={{ color: tc.text }}
              itemStyle={{ color: tc.text }}
            />
            <Legend />
            {results.map((r, i) => (
              <Line key={r.scenarioId} type="monotone" dataKey={r.scenarioName} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============ SHARED INPUT COMPONENTS ============ */

function PctCellInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="input-with-unit">
      <input
        className="table-input text-right"
        type="number"
        value={+(value * 100).toFixed(1)}
        step={0.5}
        onChange={(e) => onChange(+e.target.value / 100)}
      />
      <span className="unit">%</span>
    </div>
  );
}

function CurrencyCellInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="input-with-unit">
      <span className="unit">$</span>
      <input
        className="table-input text-right"
        type="number"
        value={value}
        onChange={(e) => onChange(+e.target.value)}
      />
    </div>
  );
}

function NumCellInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      className="table-input text-right"
      type="number"
      value={value}
      onChange={(e) => onChange(+e.target.value)}
    />
  );
}