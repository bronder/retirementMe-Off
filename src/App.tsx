import { useState, useMemo, useRef, useEffect, Fragment } from 'react';
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
import { usePlanStore, ASSUMPTION_BOUNDS } from './store';
import { runProjection, getReadinessSummary, computeAnnualMortgage, mortgagePaymentAtAge } from './engine';
import { ACCOUNT_TAX_TREATMENT } from './types';
import type { AccountType, IncomeType, ExpenseCategory, EventType, PropertyType, Property, LifeEvent } from './types';
import { formatCurrency, formatPercent, formatAge, prettify, parseNum, decideSnapBack } from './format';
import { exportMarkdown } from './markdown';
import { AiChat } from './AiChat';
import { MonteCarloPanel } from './MonteCarloPanel';

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

/** Quick-add templates for accounts — sensible defaults per type (typical
 *  long-term return + contribution). Mirrors the Expenses Quick Add pattern so
 *  all three data panels offer one-click setup. */
const COMMON_ACCOUNTS: { name: string; icon: string; type: AccountType; balance: number; annualReturn: number; annualContribution: number; employerMatch: number; hint: string }[] = [
  { name: 'Checking', icon: '🏦', type: 'checking_savings', balance: 10000, annualReturn: 0.01, annualContribution: 0, employerMatch: 0, hint: 'Cash' },
  { name: 'Savings', icon: '💰', type: 'checking_savings', balance: 25000, annualReturn: 0.03, annualContribution: 3600, employerMatch: 0, hint: 'Emergency fund' },
  { name: 'Taxable Brokerage', icon: '📈', type: 'taxable_brokerage', balance: 50000, annualReturn: 0.07, annualContribution: 6000, employerMatch: 0, hint: 'Invested' },
  { name: 'Traditional 401(k)', icon: '🏛️', type: 'traditional_401k', balance: 120000, annualReturn: 0.07, annualContribution: 12000, employerMatch: 4000, hint: '+ match' },
  { name: 'Roth 401(k)', icon: '🌿', type: 'roth_401k', balance: 0, annualReturn: 0.07, annualContribution: 12000, employerMatch: 0, hint: 'Tax-free' },
  { name: 'Traditional IRA', icon: '📕', type: 'traditional_ira', balance: 30000, annualReturn: 0.07, annualContribution: 7000, employerMatch: 0, hint: 'Tax-deferred' },
  { name: 'Roth IRA', icon: '🌱', type: 'roth_ira', balance: 60000, annualReturn: 0.07, annualContribution: 7000, employerMatch: 0, hint: 'Tax-free' },
  { name: 'HSA (invested)', icon: '🏥', type: 'hsa', balance: 8000, annualReturn: 0.06, annualContribution: 4150, employerMatch: 0, hint: 'Triple-tax-free' },
];

/** Quick-add templates for income sources — typical amounts and ages so the
 *  user can populate a realistic plan in a few clicks. */
const COMMON_INCOME: { name: string; icon: string; type: IncomeType; annualAmount: number; startAge: number; endAge: number | null; cola: boolean; taxable: boolean; hint: string }[] = [
  { name: 'Salary', icon: '💼', type: 'salary', annualAmount: 85000, startAge: 0, endAge: 64, cola: true, taxable: true, hint: 'Pre-retirement' },
  { name: 'Social Security', icon: '🏛️', type: 'social_security', annualAmount: 36000, startAge: 67, endAge: null, cola: true, taxable: false, hint: 'COLA' },
  { name: 'Pension', icon: '📄', type: 'pension', annualAmount: 18000, startAge: 65, endAge: null, cola: false, taxable: true, hint: 'Fixed' },
  { name: 'Part-time', icon: '🕒', type: 'part_time', annualAmount: 15000, startAge: 65, endAge: 70, cola: false, taxable: true, hint: 'Bridge' },
  { name: 'Rental Income', icon: '🏠', type: 'rental', annualAmount: 24000, startAge: 0, endAge: null, cola: true, taxable: true, hint: 'Property' },
  { name: 'Dividends', icon: '💹', type: 'dividends', annualAmount: 6000, startAge: 0, endAge: null, cola: false, taxable: true, hint: 'Investments' },
  { name: 'Annuity', icon: '🔒', type: 'annuity', annualAmount: 12000, startAge: 65, endAge: null, cola: false, taxable: true, hint: 'Guaranteed' },
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

/** Curated external resources (calculators, SSA, IRS, Medicare, investing).
 *  Shown in a collapsible footer so they're accessible without cluttering the
 *  data-entry sidebar on every Inputs screen. */
const RESOURCE_GROUPS: { label: string; links: { icon: string; name: string; url: string }[] }[] = [
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

/**
 * Theme-aware chart color set, read once from CSS custom properties.
 * Returned shape is exported via `ThemeColors` so other panels (e.g.
 * MonteCarloPanel) can type their props against it.
 */
export interface ThemeColors {
  panel: string;
  border: string;
  textDim: string;
  text: string;
  chart: string;
  chart2: string;
  chart3: string;
  chart4: string;
  /** 5th scenario palette color — reuses --red so depleting-savings
   *  trajectories read as "at risk" without an explicit legend. */
  chart5: string;
  /** 6th scenario palette color — reuses --yellow so marginal outcomes
   *  read as a warning accent. */
  chart6: string;
  green: string;
  red: string;
  yellow: string;
}

const DEFAULT_THEME_COLORS: ThemeColors = {
  panel: '#ffffff',
  border: '#e6e2da',
  textDim: '#6e6a60',
  text: '#1c1b19',
  chart: '#0d9488',
  chart2: '#0e7490',
  chart3: '#7c3aed',
  chart4: '#ca8a04',
  chart5: '#dc2626',
  chart6: '#b45309',
  green: '#15803d',
  red: '#dc2626',
  yellow: '#b45309',
};

/** Read CSS variable values for theme-aware chart styling */
function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(DEFAULT_THEME_COLORS);

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
        chart5: style.getPropertyValue('--red').trim() || '#dc2626',
        chart6: style.getPropertyValue('--yellow').trim() || '#b45309',
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
type Theme = 'dark' | 'light' | 'sepia' | 'nord' | 'warm-gray' | 'dracula';

/** Theme picker config. Short labels for the popover, swatch for visual. */
type ThemeId = 'light' | 'dark' | 'sepia' | 'nord' | 'warm-gray' | 'dracula';

const THEMES: { id: ThemeId; label: string; icon: string; swatch: string }[] = [
  { id: 'light',     label: 'Light',    icon: '☀',  swatch: '#f7f6f3' },
  { id: 'dark',      label: 'Dark',     icon: '☾',  swatch: '#1a1816' },
  { id: 'sepia',     label: 'Sepia',    icon: '☕', swatch: '#f4ecd8' },
  { id: 'warm-gray', label: 'Warm Gray', icon: '◆',  swatch: '#3a3a3a' },
  { id: 'nord',      label: 'Nord',     icon: '❄',  swatch: '#2e3440' },
  { id: 'dracula',   label: 'Dracula',  icon: '🦇', swatch: '#282a36' },
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

/**
 * Save indicator — gives the user confidence their edits persist.
 *
 * Subscribes to the serialized plan (a stable JSON snapshot) so ANY nested
 * change — account balance, expense amount, scenario name — is detected.
 *
 * Honesty note: the zustand `persist` middleware writes to localStorage
 * synchronously on every state change, so by the time this component
 * re-renders with a new snapshot the write is already complete. There's no
 * real "in flight" state to show, so we skip the theatrical "Saving…" phase
 * that the previous version faked with a 250ms timer and go straight to
 * "Saved ✓", which fades after 2s to a quiet "Saved · {relative time}" that
 * stays visible as an ongoing trust signal.
 */
function SaveIndicator() {
  const plan = usePlanStore((s) => s.plan);
  // Stable snapshot that changes on any (deep) plan mutation.
  const snapshot = JSON.stringify(plan);
  const [phase, setPhase] = useState<'idle' | 'saved'>('idle');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    // Skip the very first run so we don't flash "Saved" on initial load.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    // The persist middleware has already written synchronously by now — no
    // async to await, so go straight to the confirmed "Saved" state.
    setPhase('saved');
    setSavedAt(Date.now());
  }, [snapshot]);

  // After "saved", fade to idle after 2s so the checkmark doesn't linger.
  useEffect(() => {
    if (phase !== 'saved') return;
    const t2 = setTimeout(() => setPhase('idle'), 2000);
    return () => clearTimeout(t2);
  }, [phase]);

  // Relative "x ago" tick while idle, refreshed every 30s.
  const [, force] = useState(0);
  useEffect(() => {
    if (phase !== 'idle') return;
    const t3 = setInterval(() => force((n) => n + 1), 30000);
    return () => clearInterval(t3);
  }, [phase]);

  if (phase === 'idle') {
    if (savedAt === null) return null;
    return (
      <span className="save-indicator save-indicator-idle" title={`Last saved ${new Date(savedAt).toLocaleTimeString()}`}>
        <span aria-hidden="true">✓</span> Saved · {relativeTime(savedAt)}
      </span>
    );
  }
  return (
    <span className="save-indicator save-indicator-saved">
      <span aria-hidden="true">✓</span> Saved
    </span>
  );
}

/** Compact "just now" / "3m ago" relative-time label. */
function relativeTime(ts: number): string {
  const secs = Math.round((Date.now() - ts) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString();
}

/**
 * First-run banner. New users inherit a fully-populated sample plan (a
 * hypothetical 40-year-old) so the app demonstrates itself — but without a
 * signal, they could believe the $120k 401(k) is somehow real. This dismissible
 * banner names the sample data, offers a one-click "Start fresh" (reset), and
 * remembers the dismissal so it never nags. The "Start fresh" path uses the
 * store's resetPlan, which wipes to an empty plan.
 */
const ONBOARD_KEY = 'retirement-onboarded';
function OnboardingBanner({ onStartFresh, onDismiss }: { onStartFresh: () => void; onDismiss: () => void }) {
  return (
    <div className="onboarding-banner" role="status">
      <span className="onboarding-icon" aria-hidden="true">👋</span>
      <div className="onboarding-body">
        <strong>Welcome!</strong> This is sample data to show how the app works.
        Edit the numbers to match your life, or start with a blank plan.
      </div>
      <div className="onboarding-actions">
        <button className="btn btn-sm" onClick={onStartFresh}>Start fresh</button>
        <button className="onboarding-dismiss" onClick={onDismiss} aria-label="Dismiss welcome message">Got it ✕</button>
      </div>
    </div>
  );
}

/**
 * Collapsible resource links, shown as a footer so they're accessible from any
 * tab without cluttering the data-entry sidebar. Collapsed by default — a
 * user who needs a calculator or SSA reference can expand it; everyone else
 * never sees the 22 links.
 */
function ResourcesFooter() {
  return (
    <footer className="resources-footer">
      <p className="disclaimer">
        <strong>Educational tool.</strong> Projections are estimates based on the
        assumptions you enter and are not financial, tax, or investment advice.
        Past performance doesn't guarantee future results. Consult a qualified
        financial advisor before making decisions.
      </p>
    </footer>
  );
}

/**
 * Contextual resource section — shown at the bottom of an Inputs panel with
 * ONLY the links relevant to that panel's data (e.g. SSA links on Income,
 * tax links on Assumptions). Collapsed by default so it adds one line of
 * height until the user expands it. Reuses the shared .resource-link styling.
 */
function ContextualResources({ group }: { group: { label: string; links: { icon: string; name: string; url: string }[] } }) {
  return (
    <details className="contextual-resources">
      <summary>🔗 {group.label} resources</summary>
      <div className="contextual-resources-grid">
        {group.links.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="resource-link"
            title={link.name}
          >
            <span className="resource-icon" aria-hidden="true">{link.icon}</span>
            <span className="resource-name">{link.name}</span>
            <span className="resource-ext" aria-hidden="true">↗</span>
          </a>
        ))}
      </div>
    </details>
  );
}

/**
 * Header resources popover — shows ALL resource groups in a dropdown so the
 * full list is reachable from anywhere in the app. Mirrors the ThemePicker
 * pattern (self-contained open state, outside-click + Escape to close).
 */
function ResourcesPicker() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
    <div className="resources-picker" ref={ref}>
      <button
        type="button"
        className={`btn btn-sm resources-picker-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        title="Helpful resources"
      >
        <span aria-hidden="true">🔗</span> Resources
        <span className="resources-picker-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="resources-picker-menu">
          {RESOURCE_GROUPS.map((group) => (
            <div key={group.label} className="resources-picker-group">
              <div className="resources-picker-label">{group.label}</div>
              {group.links.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="resource-link"
                  title={link.name}
                  onClick={() => setOpen(false)}
                >
                  <span className="resource-icon" aria-hidden="true">{link.icon}</span>
                  <span className="resource-name">{link.name}</span>
                  <span className="resource-ext" aria-hidden="true">↗</span>
                </a>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
/**
 * Undo toast — surfaces the single-slot undo snapshot from the store.
 *
 * Appears bottom-left whenever a destructive op (delete account/scenario/
 * property/income/expense/event, or reset) leaves an undo available.
 * Auto-dismisses after 7s (clearing the slot), and responds to the
 * platform-standard Cmd/Ctrl+Z shortcut. The toast is kept low-key: a single
 * line, one primary action. It must not steal focus or block interaction.
 *
 * Rendered once at the App root so it overlays every view.
 */
const UNDO_TIMEOUT_MS = 7000;
function UndoToast() {
  const undoState = usePlanStore((s) => s.undoState);
  const undo = usePlanStore((s) => s.undo);
  const dismissUndo = usePlanStore((s) => s.dismissUndo);

  // Auto-dismiss after a timeout. Re-armed whenever undoState changes (i.e. a
  // new delete extends the window). Cleared on unmount/restore.
  useEffect(() => {
    if (!undoState) return;
    const t = setTimeout(() => dismissUndo(), UNDO_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [undoState, dismissUndo]);

  // Platform-standard undo shortcut: Cmd/Ctrl+Z. Ignored when focus is in a
  // text field (input/textarea/select) so the native text-undo still works.
  useEffect(() => {
    if (!undoState) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        // Skip when focus is in a text field so the native text-undo works.
        const el = document.activeElement as HTMLElement | null;
        const tag = el?.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return;
        e.preventDefault();
        undo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [undoState, undo]);

  if (!undoState) return null;

  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span className="undo-toast-label">{undoState.label}</span>
      <button className="undo-toast-btn" onClick={undo} autoFocus>
        Undo
      </button>
    </div>
  );
}

export default function App() {
  const store = usePlanStore();
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('retirement-tab') as Tab) || 'inputs');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('retirement-theme') as Theme) || 'light');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem(ONBOARD_KEY) === null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('retirement-theme', theme);
  }, [theme]);

  // Persist active tab so a refresh (F5) returns to the same view
  useEffect(() => {
    localStorage.setItem('retirement-tab', tab);
  }, [tab]);

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

  const dismissOnboarding = () => {
    localStorage.setItem(ONBOARD_KEY, '1');
    setShowOnboarding(false);
  };

  const startFresh = () => {
    store.resetPlan();
    dismissOnboarding();
  };

  return (
    <div className="app">
      {/* Compact top bar — logo, scenario tabs, and actions in a single row */}
      <div className="app-topbar">
        <div className="app-topbar-left">
          <img className="app-logo" src="./images/retirementmeoff-dark.png" alt="retirementMe-Off" />
          <ScenarioSwitcher
            scenarios={store.plan.scenarios}
            activeScenarioId={activeScenario.id}
            onSelect={(id) => store.setActiveScenario(id)}
            onAdd={() => store.addScenario()}
            onDelete={(id) => store.deleteScenario(id)}
            onRename={(id, name) => store.renameScenario(id, name)}
            onDuplicate={(id) => store.duplicateScenario(id)}
          />
        </div>
        <div className="header-actions">
          <SaveIndicator />
          <ResourcesPicker />
          <ThemePicker theme={theme} setTheme={setTheme} />
          <div className="menu-wrapper" ref={menuRef}>
            <button className="btn btn-sm menu-trigger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">☰ Menu</button>
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
                <div className="menu-divider menu-divider-theme" />
                <div className="menu-theme-label">Theme</div>
                <div className="menu-theme-grid">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`menu-theme-swatch${t.id === theme ? ' active' : ''}`}
                      style={{ background: t.swatch }}
                      onClick={() => { setTheme(t.id); setMenuOpen(false); }}
                      title={t.label}
                      aria-label={t.label}
                      aria-pressed={t.id === theme}
                    >
                      <span className="menu-theme-icon">{t.icon}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
        </div>
      </div>

      {/* Tab bar with inline context stats — replaces the tall hero card */}
      <div className="app-tabbar">
        <div className="tab-bar">
          <button className={`tab ${tab === 'inputs' ? 'active' : ''}`} onClick={() => setTab('inputs')}>Inputs</button>
          <button className={`tab ${tab === 'results' ? 'active' : ''}`} onClick={() => setTab('results')}>Results & Charts</button>
          <button className={`tab ${tab === 'compare' ? 'active' : ''}`} onClick={() => setTab('compare')}>Compare</button>
        </div>
        {tab === 'inputs' && (
          <div className="tabbar-stats">
            <span className="tabbar-stat"><span className="tabbar-stat-label">Retire at</span><span className="tabbar-stat-value">{activeScenario.assumptions.retirementAge}</span></span>
            <span className="tabbar-stat"><span className="tabbar-stat-label">Through</span><span className="tabbar-stat-value">{activeScenario.assumptions.endAge}</span></span>
            <span className="tabbar-stat"><span className="tabbar-stat-label">Withdrawal</span><span className="tabbar-stat-value">{formatPercent(activeScenario.assumptions.safeWithdrawalRate)}</span></span>
          </div>
        )}
        {tab === 'results' && (
          <div className="tabbar-stats">
            <span className="tabbar-stat"><span className="tabbar-stat-label">Retire at</span><span className="tabbar-stat-value">{activeScenario.assumptions.retirementAge}</span></span>
            <span className="tabbar-stat"><span className="tabbar-stat-label">Monthly</span><span className="tabbar-stat-value">{formatCurrency((readiness.firstYearIncome + readiness.firstYearWithdrawal) / 12, { compact: true })}</span></span>
            <span className="tabbar-stat"><span className="tabbar-stat-label">Status</span><span className="tabbar-stat-value" style={{ color: readiness.onTrack ? 'var(--green)' : 'var(--yellow)' }}>{readiness.onTrack ? '✓ On track' : '⚠ Review'}</span></span>
          </div>
        )}
        {tab === 'compare' && (
          <div className="tabbar-stats">
            <span className="tabbar-stat"><span className="tabbar-stat-label">Scenarios</span><span className="tabbar-stat-value">{allResults.length}</span></span>
            <span className="tabbar-stat"><span className="tabbar-stat-label">Sustainable</span><span className="tabbar-stat-value">{allResults.filter((r) => r.success).length}/{allResults.length}</span></span>
            <span className="tabbar-stat"><span className="tabbar-stat-label">Best final</span><span className="tabbar-stat-value">{formatCurrency(Math.max(...allResults.map((r) => r.finalAssetsReal)), { compact: true })}</span></span>
          </div>
        )}
      </div>

      {showOnboarding && (
        <OnboardingBanner onStartFresh={startFresh} onDismiss={dismissOnboarding} />
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
        <CompareView results={allResults} scenarios={store.plan.scenarios} />
      )}

      <ResourcesFooter />

      {/* AI Chat Assistant */}
      <AiChat />

      {/* Undo toast — overlays every view, single-slot */}
      <UndoToast />
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

/* ============ SCENARIO SWITCHER ============ */

type Scenario = ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];

/**
 * Header scenario control — labeled group with a primary accent dropdown
 * (current scenario) and a secondary create action. Mirrors the ThemePicker
 * popover language so the two header controls read as a family.
 *
 *   Scenarios │ [ Scenario: 62 ▾ ]  [ + New Scenario ]
 */
function ScenarioSwitcher({
  scenarios,
  activeScenarioId,
  onSelect,
  onAdd,
  onDelete,
  onRename,
  onDuplicate,
}: {
  scenarios: Scenario[];
  activeScenarioId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = scenarios.find((s) => s.id === activeScenarioId) ?? scenarios[0];

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
    <div className="scenario-group" ref={ref}>
      <span className="scenario-group-label">Scenarios</span>

      {/* Primary: accent dropdown showing the current scenario */}
      <button
        type="button"
        className={`scenario-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch scenario"
      >
        <span className="scenario-trigger-kicker">Scenario</span>
        <span className="scenario-trigger-name">{active?.name ?? '—'}</span>
        <span className="scenario-trigger-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="scenario-menu" role="listbox">
          {scenarios.map((s) => (
            <ScenarioMenuItem
              key={s.id}
              scenario={s}
              isActive={s.id === activeScenarioId}
              canDelete={scenarios.length > 1}
              onSelect={() => { onSelect(s.id); setOpen(false); }}
              onDelete={() => onDelete(s.id)}
              onRename={(name) => { onRename(s.id, name); }}
              onDuplicate={() => { onDuplicate(s.id); setOpen(false); }}
            />
          ))}
          <div className="scenario-menu-divider" />
          <button
            type="button"
            className="scenario-menu-item scenario-menu-add"
            onClick={() => { onAdd(); setOpen(false); }}
          >
            <span className="scenario-menu-add-icon" aria-hidden="true">＋</span>
            <span>New Scenario</span>
          </button>
        </div>
      )}

      {/* Secondary: create action, visually tied to the switcher by grouping */}
      <button
        type="button"
        className="btn btn-sm scenario-add-btn"
        onClick={() => onAdd()}
        title="Create a new scenario"
      >
        ＋ New
      </button>
    </div>
  );
}

/** One row in the scenario dropdown — selectable, with inline rename,
 *  duplicate, and two-step delete confirm. All scenario actions live here so
 *  users don't have to hunt across the top bar and the Assumptions panel. */
function ScenarioMenuItem({
  scenario,
  isActive,
  canDelete,
  onSelect,
  onDelete,
  onRename,
  onDuplicate,
}: {
  scenario: Scenario;
  isActive: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(scenario.name);

  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== scenario.name) onRename(trimmed);
    setEditing(false);
  };

  return (
    <div className={`scenario-menu-item-row${armed ? ' confirming' : ''}${editing ? ' editing' : ''}`}>
      {armed ? (
        <div className="scenario-confirm-inline">
          <span className="scenario-confirm-text">Delete “{scenario.name}”?</span>
          <span className="scenario-confirm-actions">
            <button
              type="button"
              className="scenario-confirm-btn yes"
              title="Confirm delete"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
            >✓</button>
            <button
              type="button"
              className="scenario-confirm-btn no"
              title="Cancel"
              onClick={(e) => { e.stopPropagation(); setArmed(false); }}
            >✕</button>
          </span>
        </div>
      ) : editing ? (
        <div className="scenario-rename-inline">
          <input
            type="text"
            className="scenario-rename-input"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
              if (e.key === 'Escape') { setDraft(scenario.name); setEditing(false); }
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="scenario-confirm-btn yes"
            title="Save name"
            onClick={(e) => { e.stopPropagation(); commitRename(); }}
          >✓</button>
        </div>
      ) : (
        <>
          <button
            type="button"
            role="option"
            aria-selected={isActive}
            className={`scenario-menu-item${isActive ? ' active' : ''}`}
            onClick={onSelect}
          >
            <span className="scenario-menu-dot" aria-hidden="true">{isActive ? '●' : '○'}</span>
            <span className="scenario-menu-item-name">{scenario.name}</span>
            {isActive && <span className="scenario-menu-item-check" aria-hidden="true">✓</span>}
          </button>
          <span className="scenario-menu-item-actions">
            <button
              type="button"
              className="scenario-menu-item-action"
              title="Rename scenario"
              onClick={(e) => { e.stopPropagation(); setDraft(scenario.name); setEditing(true); }}
              aria-label={`Rename scenario ${scenario.name}`}
            >✎</button>
            <button
              type="button"
              className="scenario-menu-item-action"
              title="Duplicate scenario"
              onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
              aria-label={`Duplicate scenario ${scenario.name}`}
            >⧉</button>
            {canDelete && (
              <button
                type="button"
                className="scenario-menu-item-delete"
                title="Delete scenario"
                onClick={(e) => { e.stopPropagation(); setArmed(true); }}
                aria-label={`Delete scenario ${scenario.name}`}
              >
                ×
              </button>
            )}
          </span>
        </>
      )}
    </div>
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

function useEditableNumber({
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

function AgeInput({ value, onChange, unit = 'yrs', min, max }: { value: number; onChange: (v: number) => void; unit?: string; min?: number; max?: number }) {
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

function PctInputEnhanced({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
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

  // Net worth includes both financial-account balances AND home equity
  // (property market value minus outstanding mortgage). The mortgage
  // balance is treated as static here — see propertyValueAtAge in engine.ts
  // for the matching treatment in the year-by-year chart.
  const propertyEquityNow = (scenario.properties ?? []).reduce(
    (s, p) => s + Math.max(0, (p.currentValue ?? 0) - (p.mortgageBalance ?? 0)),
    0,
  );
  const totalNetWorth = currentNetWorth + propertyEquityNow;

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
  const wellnessLabel = wellnessScore >= 80 ? 'Detailed' : wellnessScore >= 50 ? 'Basic' : 'Sparse';
  const gaugeDeg = Math.min(180, (wellnessScore / 100) * 180);

  // Mini-chart series: stacked liquid + property equity so users see both
  // the financial-account trajectory and how much of their wealth is tied
  // up in real estate. `total` is the convenience top-line sum.
  const miniChartData = result.years.map((y) => ({
    age: y.age,
    liquid: Math.round(y.realAssets),
    propertyEquity: Math.round(y.realPropertyEquity),
    total: Math.round(y.realAssets + y.realPropertyEquity),
  }));

  // Build the sub-line under "Current Net Worth" — distinguishes liquid
  // accounts vs. home equity so users understand what the total includes.
  const accountCount = scenario.accounts.length;
  const netWorthSub = propertyEquityNow > 0
    ? `${formatCurrency(currentNetWorth, { compact: true })} liquid · ${formatCurrency(propertyEquityNow, { compact: true })} equity`
    : `${accountCount} ${accountCount === 1 ? 'account' : 'accounts'}`;

  return (
    <div>
      <div className="summary-grid">
        <div className="summary-card">
          <div className="label">Current Net Worth</div>
          <div className="value">{formatCurrency(totalNetWorth, { compact: true })}</div>
          <div className="sub">{netWorthSub}</div>
        </div>
        <div className="summary-card">
          <div className="label">Projected at Retirement</div>
          <div className="value">
            {formatCurrency(
              readiness.nestEggAtRetirement +
                (result.years.find((y) => y.age === scenario.assumptions.retirementAge)?.propertyEquity ?? 0),
              { compact: true },
            )}
          </div>
          <div className="sub">
            {formatCurrency(
              readiness.nestEggAtRetirementReal +
                (result.years.find((y) => y.age === scenario.assumptions.retirementAge)?.realPropertyEquity ?? 0),
              { compact: true },
            )} in today's $
          </div>
        </div>
        <div className="summary-card">
          <div className="label">Annual Savings Rate</div>
          <div className="value">{formatCurrency(totalContributions, { compact: true })}</div>
          <div className="sub">{totalContributions > 0 && totalNetWorth > 0 ? `${formatPercent(totalContributions / totalNetWorth)} of net worth` : '—'}</div>
        </div>
        <div className="summary-card">
          <div className="label">Plan Outcome</div>
          <div className={`value ${result.success ? 'value-good' : 'value-bad'}`}>{result.success ? '✓ On Track' : '✗ At Risk'}</div>
          <div className="sub">{result.success ? `Lasts to age ${scenario.assumptions.endAge}` : `Depleted at age ${formatAge(result.depletionAge)}`}</div>
        </div>
      </div>

      <div className="overview-wellness-grid">
        <div className="panel overview-gauge-card">
          <h3 className="overview-section-title">📋 Plan Detail</h3>
          <div className="overview-gauge-container">
            <div className="overview-gauge" style={{ background: `conic-gradient(from 270deg, ${wellnessColor} 0deg ${gaugeDeg}deg, var(--bg-subtle) ${gaugeDeg}deg 180deg, transparent 180deg)` }}>
              <div className="overview-gauge-inner">
                <span className="overview-gauge-score" style={{ color: wellnessColor }}>{wellnessScore}%</span>
                <span className="overview-gauge-label">{wellnessLabel}</span>
              </div>
            </div>
          </div>
          <div className="overview-gauge-hint">How much of your plan you've filled in — not a measure of whether it will succeed</div>
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
              <linearGradient id="overviewGradientLiquid" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={tc.chart} stopOpacity={0.35} />
                <stop offset="100%" stopColor={tc.chart} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="overviewGradientProperty" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={tc.chart3} stopOpacity={0.35} />
                <stop offset="100%" stopColor={tc.chart3} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={tc.border} />
            <XAxis dataKey="age" stroke={tc.textDim} />
            <YAxis stroke={tc.textDim} tickFormatter={(v) => formatCurrency(v, { compact: true })} />
            <Tooltip contentStyle={{ background: tc.panel, border: `1px solid ${tc.border}`, borderRadius: 8 }} formatter={(v: number) => formatCurrency(v)} labelFormatter={(l) => `Age ${l}`} labelStyle={{ color: tc.text }} itemStyle={{ color: tc.text }} />
            <Legend />
            {/* Stacked: liquid assets on the bottom, property equity on top. */}
            <Area type="monotone" dataKey="liquid" stackId="networth" name="Liquid Assets" stroke={tc.chart} strokeWidth={2} fill="url(#overviewGradientLiquid)" />
            <Area type="monotone" dataKey="propertyEquity" stackId="networth" name="Home Equity" stroke={tc.chart3} strokeWidth={2} fill="url(#overviewGradientProperty)" />
            {/* Top-line overlay showing total net worth so the user can read it directly. */}
            <Area type="monotone" dataKey="total" name="Total Net Worth" stroke={tc.text} strokeWidth={1.5} fill="none" strokeDasharray="0" />
            <ReferenceLine x={scenario.assumptions.retirementAge} stroke={tc.yellow} strokeDasharray="5 5" label={{ value: 'Retire', fill: tc.yellow, fontSize: 11 }} />
            {scenario.events.filter((ev) => ev.proceeds > 0 || ev.cost > 0).map((ev) => (
              <ReferenceLine
                key={ev.id}
                x={ev.age}
                stroke={ev.proceeds >= ev.cost ? tc.green : tc.red}
                strokeDasharray="3 3"
                label={{ value: ev.name || (ev.proceeds >= ev.cost ? '▲' : '▼'), fill: ev.proceeds >= ev.cost ? tc.green : tc.red, fontSize: 10, position: 'top' }}
              />
            ))}
            {scenario.properties?.filter((p) => p.saleAge || p.purchaseAge).flatMap((p) => {
              const lines = [];
              if (p.saleAge) lines.push(<ReferenceLine key={`${p.id}-sale`} x={p.saleAge} stroke={tc.green} strokeDasharray="3 3" label={{ value: '🏡 Sale', fill: tc.green, fontSize: 10, position: 'top' }} />);
              if (p.purchaseAge) lines.push(<ReferenceLine key={`${p.id}-buy`} x={p.purchaseAge} stroke={tc.red} strokeDasharray="3 3" label={{ value: '🏠 Buy', fill: tc.red, fontSize: 10, position: 'top' }} />);
              return lines;
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Upcoming Life Events widget — shows the next few events so users can
          see at a glance what's coming. Each event affects the projection
          at its `age`; future events show up here but not in today's
          "Current Net Worth" card (which is always at currentAge). */}
      <UpcomingEventsWidget scenario={scenario} currentAge={scenario.assumptions.currentAge} />

      <div className="summary-strip">
        <div className="summary-strip-item"><span className="label">Years to Retirement</span><span className="value">{Math.max(0, scenario.assumptions.retirementAge - scenario.assumptions.currentAge)}</span></div>
        <div className="summary-strip-item"><span className="label">Years in Retirement</span><span className="value">{scenario.assumptions.endAge - scenario.assumptions.retirementAge}</span></div>
        <div className="summary-strip-item"><span className="label">Monthly Expenses (Ret.)</span><span className="value">{formatCurrency(readiness.firstYearExpenses / 12, { compact: true })}</span></div>
        <div className="summary-strip-item"><span className="label">Monthly Income (Ret.)</span><span className="value">{formatCurrency(readiness.firstYearIncome / 12, { compact: true })}</span></div>
        <div className="summary-strip-item"><span className="label">Life Events</span><span className="value">{scenario.events.length}</span></div>
      </div>

      <ContextualResources group={RESOURCE_GROUPS[0]} />
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
        <h2 className="assumptions-title">⚙️ Assumptions
          <span className="scenario-name-edit" title="Click to rename this scenario">
            <input
              type="text"
              className="scenario-name-input"
              value={scenario.name}
              onChange={(e) => store.renameScenario(scenario.id, e.target.value)}
              aria-label="Scenario name"
            />
            <span className="scenario-name-edit-icon" aria-hidden="true">✎</span>
          </span>
        </h2>
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

      {/* Compact summary — discrete chips so the row wraps cleanly at chip
          boundaries instead of orphaning "·" separators mid-line. */}
      <div className="assumptions-summary-banner">
        <span className="asm-chip"><span className="asm-chip-label">Retire at</span><span className="asm-chip-value">{a.retirementAge}</span></span>
        <span className="asm-chip"><span className="asm-chip-label">Plan through</span><span className="asm-chip-value">{a.endAge}</span></span>
        <span className="asm-chip"><span className="asm-chip-label">Inflation</span><span className="asm-chip-value">{formatPercent(a.inflationRate)}</span></span>
        <span className="asm-chip"><span className="asm-chip-label">Withdrawal</span><span className="asm-chip-value">{formatPercent(a.safeWithdrawalRate)}</span></span>
        <span className="asm-chip"><span className="asm-chip-label">{yearsToRetirement > 0 ? 'To save' : 'Status'}</span><span className="asm-chip-value">{yearsToRetirement > 0 ? `${yearsToRetirement} yrs` : 'At retirement'}</span></span>
        <span className="asm-chip"><span className="asm-chip-label">In retirement</span><span className="asm-chip-value">{yearsInRetirement} yrs</span></span>
      </div>

      {/* Timeline section */}
      <div className="form-section">
        <div className="form-section-title">🗓️ Timeline</div>
        <div className="form-row-3">
          <FieldGroup label="Current Age">
            <AgeInput value={a.currentAge} onChange={(v) => upd({ currentAge: v })} min={ASSUMPTION_BOUNDS.currentAge[0]} max={ASSUMPTION_BOUNDS.currentAge[1]} />
          </FieldGroup>
          <FieldGroup
            label="Retirement Age"
            helpText={`${yearsToRetirement > 0 ? yearsToRetirement : 0} years left to save`}
            highImpact
          >
            <AgeInput value={a.retirementAge} onChange={(v) => upd({ retirementAge: v })} min={ASSUMPTION_BOUNDS.retirementAge[0]} max={ASSUMPTION_BOUNDS.retirementAge[1]} />
          </FieldGroup>
          <FieldGroup
            label="Plan End Age"
            helpText={`${yearsInRetirement} years of retirement`}
            highImpact
          >
            <AgeInput value={a.endAge} onChange={(v) => upd({ endAge: v })} min={ASSUMPTION_BOUNDS.endAge[0]} max={ASSUMPTION_BOUNDS.endAge[1]} />
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
                <AgeInput value={a.spouse.currentAge} onChange={(v) => upd({ spouse: { ...a.spouse!, currentAge: v } })} min={ASSUMPTION_BOUNDS.currentAge[0]} max={ASSUMPTION_BOUNDS.currentAge[1]} />
              </FieldGroup>
              <FieldGroup
                label="Spouse Retirement Age"
                helpText="When your spouse stops working."
              >
                <AgeInput value={a.spouse.retirementAge} onChange={(v) => upd({ spouse: { ...a.spouse!, retirementAge: v } })} min={ASSUMPTION_BOUNDS.retirementAge[0]} max={ASSUMPTION_BOUNDS.retirementAge[1]} />
              </FieldGroup>
              <FieldGroup
                label="Spouse Plan End Age"
                helpText="If higher than yours, the plan extends to cover your spouse's full lifespan."
                highImpact
              >
                <AgeInput value={a.spouse.endAge} onChange={(v) => upd({ spouse: { ...a.spouse!, endAge: v } })} min={ASSUMPTION_BOUNDS.endAge[0]} max={ASSUMPTION_BOUNDS.endAge[1]} />
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
            <PctInputEnhanced value={a.inflationRate} onChange={(v) => upd({ inflationRate: v })} min={ASSUMPTION_BOUNDS.inflationRate[0]} max={ASSUMPTION_BOUNDS.inflationRate[1]} />
          </FieldGroup>
          <FieldGroup
            label="Social Security COLA"
            helpText="Annual increase for Social Security benefits. Typically tracks inflation. Use 2.5–3% for a reasonable estimate."
          >
            <PctInputEnhanced value={a.socialSecurityCola} onChange={(v) => upd({ socialSecurityCola: v })} min={ASSUMPTION_BOUNDS.socialSecurityCola[0]} max={ASSUMPTION_BOUNDS.socialSecurityCola[1]} />
          </FieldGroup>
          <FieldGroup
            label="Retirement Tax Rate"
            helpText="Effective tax rate on taxable withdrawals (traditional 401k/IRA, pensions). Roth withdrawals are tax-free. 10–20% is typical."
          >
            <PctInputEnhanced value={a.retirementTaxRate} onChange={(v) => upd({ retirementTaxRate: v })} min={ASSUMPTION_BOUNDS.retirementTaxRate[0]} max={ASSUMPTION_BOUNDS.retirementTaxRate[1]} />
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
            <PctInputEnhanced value={a.safeWithdrawalRate} onChange={(v) => upd({ safeWithdrawalRate: v })} min={ASSUMPTION_BOUNDS.safeWithdrawalRate[0]} max={ASSUMPTION_BOUNDS.safeWithdrawalRate[1]} />
          </FieldGroup>
          <FieldGroup
            label="Pre-Retirement Return"
            helpText="Fallback annual return while saving. A growth-oriented portfolio (mostly stocks) historically averages 7–10%."
            highImpact
          >
            <PctInputEnhanced value={a.preRetirementReturn} onChange={(v) => upd({ preRetirementReturn: v })} min={ASSUMPTION_BOUNDS.preRetirementReturn[0]} max={ASSUMPTION_BOUNDS.preRetirementReturn[1]} />
          </FieldGroup>
          <FieldGroup
            label="Post-Retirement Return"
            helpText="Fallback annual return after retiring. Usually lower (more bonds/cash) to reduce volatility. 4–6% is common."
            highImpact
          >
            <PctInputEnhanced value={a.postRetirementReturn} onChange={(v) => upd({ postRetirementReturn: v })} min={ASSUMPTION_BOUNDS.postRetirementReturn[0]} max={ASSUMPTION_BOUNDS.postRetirementReturn[1]} />
          </FieldGroup>
        </div>
      </div>

      <ContextualResources group={RESOURCE_GROUPS[2]} />
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
          <span className="acct-card-icon" aria-hidden="true">{acct.type === 'checking_savings' ? '💵' : acct.type === 'taxable_brokerage' ? '📈' : acct.type.includes('roth') ? '🌿' : acct.type === 'hsa' ? '🏥' : acct.type === 'pension' ? '🏢' : '🏦'}</span>
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
        <h2><span aria-hidden="true">🏦</span> Accounts & Savings</h2>
      </div>
      <p className="section-help">
        Track all your savings and investment accounts. Enter the <strong>current balance</strong>, expected <strong>annual return</strong>,
        and your <strong>yearly contribution</strong>. Employer match is only shown for 401(k) accounts.
      </p>

      {/* Quick add common accounts */}
      <details className="quick-add-section">
        <summary className="quick-add-label">⚡ Quick Add Common Accounts <span className="quick-add-toggle"></span></summary>
        <div className="quick-add-grid">
          {COMMON_ACCOUNTS.map((ca) => (
            <button key={ca.name} className="quick-add-btn" onClick={() => store.addAccount(scenario.id, {
              name: ca.name, type: ca.type, balance: ca.balance, annualReturn: ca.annualReturn, annualContribution: ca.annualContribution, employerMatch: ca.employerMatch,
            })}>
              <span className="quick-add-icon" aria-hidden="true">{ca.icon}</span>
              <span>{ca.name}</span>
              <span className="quick-add-amount">{ca.hint}</span>
            </button>
          ))}
        </div>
      </details>

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

      <ContextualResources group={RESOURCE_GROUPS[4]} />
    </div>
  );
}

const PROPERTY_TYPES: PropertyType[] = ['primary_residence', 'vacation', 'investment', 'land', 'other'];

/** Property group metadata — mirrors ACCOUNT_GROUP_META so the Properties
 *  panel groups by type with per-group headers and + Add buttons, just like
 *  Accounts & Savings. Each group lists its property types in display order. */
const PROPERTY_GROUP_META: { label: string; icon: string; types: PropertyType[] }[] = [
  { label: 'Primary & Residential', icon: '🏠', types: ['primary_residence'] },
  { label: 'Vacation & Investment', icon: '🏖️', types: ['vacation', 'investment'] },
  { label: 'Land & Other', icon: '🌳', types: ['land', 'other'] },
];

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
          <PropYearsLeftField prop={prop} scenario={scenario} store={store} />
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
            <PropSaleAgeField prop={prop} scenario={scenario} store={store} equity={equity} />
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
            <PropPurchaseAgeField prop={prop} scenario={scenario} store={store} />
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
            <PropMortgageTermField prop={prop} scenario={scenario} store={store} />
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
        <h2><span aria-hidden="true">🏠</span> Homes & Property</h2>
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
          {PROPERTY_GROUP_META.map((g) => {
            const groupProps = properties.filter((p) => g.types.includes(p.type));
            if (groupProps.length === 0) return null;
            const groupValue = groupProps.reduce((s, p) => s + p.currentValue, 0);
            return (
              <div key={g.label} className="acct-group">
                <div className="acct-group-header">
                  <span className="acct-group-icon" aria-hidden="true">{g.icon}</span>
                  <span className="acct-group-label">{g.label}</span>
                  <span className="acct-group-count">{groupProps.length}</span>
                  <span className="acct-group-total">{formatCurrency(groupValue, { compact: true })}</span>
                  <button className="btn btn-sm acct-group-add" onClick={() => store.addProperty(scenario.id, {
                    name: 'New Property', type: g.types[0], currentValue: 0, mortgageBalance: 0, annualAppreciation: 0.03, annualPropertyTax: 0, annualInsurance: 0,
                  })}>+ Add</button>
                </div>
                <div className="prop-group-cards">
                  {groupProps.map((prop) => (
                    <PropertyCard key={prop.id} prop={prop} scenario={scenario} store={store} />
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
        <span className="income-row-icon" aria-hidden="true">{CATEGORY_ICONS[exp.category] ?? '📦'}</span>
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
        <h2><span aria-hidden="true">📋</span> Expenses</h2>
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
                  <button className="btn btn-sm acct-group-add" onClick={() => store.addExpense(scenario.id, {
                    name: 'New Expense', category: g.category, annualAmount: 0, preRetirement: false, postRetirement: true, startAge: null, endAge: null,
                  })}>+ Add</button>
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

      <ContextualResources group={RESOURCE_GROUPS[3]} />
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
        <span className="income-row-icon" aria-hidden="true">{INCOME_ICONS[inc.type] ?? '📦'}</span>
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
          {/* Two-state toggle that reads as a radio: "Lifetime" (endAge=null)
              vs "At age" (endAge=number). Same controls in both states, so the
              user always sees one predictable affordance — unlike the old
              Lifetime/∞ design which swapped between different button states.
              The toggle + conditional input are grouped as one unit so they
              don't break apart when the row wraps. */}
          <span className="income-end-toggle">
            <button
              className={`income-lifetime-btn ${inc.endAge === null ? 'active' : ''}`}
              title="Continues for life"
              onClick={() => store.updateIncome(scenario.id, inc.id, { endAge: null })}
            >Lifetime</button>
            <button
              className={`income-lifetime-btn ${inc.endAge !== null ? 'active' : ''}`}
              title="Ends at a specific age"
              onClick={() => store.updateIncome(scenario.id, inc.id, { endAge: inc.endAge ?? inc.startAge })}
            >At age</button>
            {inc.endAge !== null && (
              <NumCellInput value={inc.endAge} onChange={(v) => store.updateIncome(scenario.id, inc.id, { endAge: v || null })} />
            )}
          </span>
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
        <h2><span aria-hidden="true">💵</span> Income Sources</h2>
        <button className="btn btn-sm" onClick={() => store.addIncome(scenario.id, {
          name: 'New Income', type: 'part_time', annualAmount: 0, startAge: scenario.assumptions.currentAge, endAge: scenario.assumptions.retirementAge - 1, cola: true, taxable: true,
        })}>+ Add Income</button>
      </div>
      <p className="section-help">
        Add <strong>any income source</strong> — pre-retirement (salary, self-employment) or post-retirement (Social Security, pension).
        Set Start/End ages to control when each source is active.
      </p>

      {/* Quick add common income sources */}
      <details className="quick-add-section">
        <summary className="quick-add-label">⚡ Quick Add Common Income <span className="quick-add-toggle"></span></summary>
        <div className="quick-add-grid">
          {COMMON_INCOME.map((ci) => (
            <button key={ci.name} className="quick-add-btn" onClick={() => store.addIncome(scenario.id, {
              name: ci.name, type: ci.type, annualAmount: ci.annualAmount, startAge: Math.max(ci.startAge, scenario.assumptions.currentAge), endAge: ci.endAge, cola: ci.cola, taxable: ci.taxable,
            })}>
              <span className="quick-add-icon" aria-hidden="true">{ci.icon}</span>
              <span>{ci.name}</span>
              <span className="quick-add-amount">{formatCurrency(ci.annualAmount / 12, { compact: true })}/mo</span>
            </button>
          ))}
        </div>
      </details>

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
                <button className="btn btn-sm acct-group-add" onClick={() => store.addIncome(scenario.id, {
                  name: 'New Income', type: 'salary', annualAmount: 0, startAge: scenario.assumptions.currentAge, endAge: scenario.assumptions.retirementAge - 1, cola: true, taxable: true,
                })}>+ Add</button>
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
                <button className="btn btn-sm acct-group-add" onClick={() => store.addIncome(scenario.id, {
                  name: 'New Income', type: 'pension', annualAmount: 0, startAge: scenario.assumptions.retirementAge, endAge: null, cola: false, taxable: true,
                })}>+ Add</button>
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

      <ContextualResources group={RESOURCE_GROUPS[1]} />
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
        <h2><span aria-hidden="true">📅</span> Life Events</h2>
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
                    <EventAgeField ev={ev} scenario={scenario} store={store} />
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
                    <EventDurationField ev={ev} scenario={scenario} store={store} />
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

/* ============ UPCOMING EVENTS WIDGET ============
   Shown on the Summary page so users can see at a glance which life
   events are configured and when they'll fire. The current net-worth
   card always reflects *today's* state, so future events don't appear
   there — this widget makes them visible without forcing the user to
   dig into the Life Events panel. */

const EVENT_ICON: Record<EventType, string> = {
  home_purchase: '🏠',
  home_sale: '🏡',
  large_purchase: '🚗',
  windfall: '💰',
  other: '📋',
};

function UpcomingEventsWidget({
  scenario,
  currentAge,
}: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  currentAge: number;
}) {
  // Pull the next 5 events sorted by age. "Upcoming" = age >= currentAge.
  // We also include events that already happened (age < currentAge) so users
  // can see "yep, this event has already been applied" — but tag them as past.
  const upcoming = scenario.events
    .slice()
    .sort((a, b) => a.age - b.age)
    .slice(0, 5);

  if (upcoming.length === 0) {
    return (
      <div className="upcoming-events-widget">
        <div className="upcoming-events-header">📅 Upcoming Life Events</div>
        <div className="upcoming-events-empty">
          No life events yet. Add a windfall, home purchase, or other one-time event to see how it
          affects your plan. <span className="muted">(Events impact net worth and other projections.)</span>
        </div>
      </div>
    );
  }

  return (
    <div className="upcoming-events-widget">
      <div className="upcoming-events-header">
        📅 Upcoming Life Events
        <span className="upcoming-events-hint">
          These will affect your projection at the indicated age.
        </span>
      </div>
      <div className="upcoming-events-list">
        {upcoming.map((ev) => {
          const isPast = ev.age < currentAge;
          const netAmount = ev.proceeds - ev.cost;
          const ongoing = ev.ongoingAnnualImpact;
          return (
            <div
              key={ev.id}
              className={`upcoming-event-row ${isPast ? 'past' : ''}`}
              title={isPast ? 'This event has already been applied to your current net worth' : 'Future event — not yet reflected in current net worth'}
            >
              <span className="upcoming-event-icon">{EVENT_ICON[ev.type] ?? '📋'}</span>
              <span className="upcoming-event-name">{ev.name || prettify(ev.type)}</span>
              <span className="upcoming-event-age">
                {isPast ? `Past (age ${ev.age})` : `Age ${ev.age}`}
              </span>
              {netAmount !== 0 && (
                <span
                  className="upcoming-event-amount"
                  style={{ color: netAmount > 0 ? 'var(--green)' : 'var(--red)' }}
                >
                  {netAmount > 0 ? '+' : ''}
                  {formatCurrency(netAmount, { compact: true })}
                </span>
              )}
              {ongoing !== 0 && (
                <span className="upcoming-event-ongoing" title="Ongoing annual impact (inflation-adjusted)">
                  {ongoing > 0 ? '+' : ''}
                  {formatCurrency(ongoing, { compact: true })}/yr
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============ RESULTS VIEW ============ */

/**
 * Results tab sub-sections. Deterministic is the default landing because
 * it renders fully on first view — charts, cash flow, and the year table
 * all populate immediately. Monte Carlo is gated behind a manual "Run"
 * (it starts idle), so defaulting to it showed a blank body beneath the
 * summary cards. Users still land on the straight-line projection and can
 * click into Monte Carlo for the probability view.
 */
type ResultSection = 'monte-carlo' | 'deterministic';
const DEFAULT_RESULT_SECTION: ResultSection = 'deterministic';

function ResultsView({ scenario, result, readiness }: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  result: NonNullable<ReturnType<typeof runProjection>>;
  readiness: NonNullable<ReturnType<typeof getReadinessSummary>>;
}) {
  const tc = useThemeColors();

  const [section, setSection] = useState<ResultSection>(
    () => (localStorage.getItem('retirement-result-section') as ResultSection) || DEFAULT_RESULT_SECTION,
  );
  useEffect(() => {
    localStorage.setItem('retirement-result-section', section);
  }, [section]);

  // Net-worth chart view mode: show nominal OR real (today's $), not both.
  // Showing both at once produces 4 overlapping areas + reference lines — too
  // dense. Defaults to real (today's $) since that's the more meaningful number.
  const [nwView, setNwView] = useState<'real' | 'nominal'>(
    () => (localStorage.getItem('retirement-nw-view') as 'real' | 'nominal') || 'real',
  );
  useEffect(() => { localStorage.setItem('retirement-nw-view', nwView); }, [nwView]);

  // Headline-card → year-table drill-down. When the user clicks a headline
  // card, we set focusAge + flip to the deterministic section; the YearTable
  // (which only mounts under that section) consumes focusAge, scrolls the
  // matching row into view, and flashes a highlight. Cleared after the
  // highlight expires so re-clicking the same age re-triggers.
  const [focusAge, setFocusAge] = useState<number | null>(null);
  const focusOn = (age: number) => {
    setSection('deterministic');
    setFocusAge(age);
  };

  const tooltipStyle = { background: tc.panel, border: `1px solid ${tc.border}`, borderRadius: 8 };

  // Net worth chart: liquid (financial accounts) + home equity, stacked.
  // `nominal` and `real` are summed totals so the user can read total net
  // worth directly from the legend. The property-component series
  // (`homeNominal`, `homeReal`) is computed per-year from the engine.
  // NOTE: keys use the literal U+2019 (') rather than a \u2019 escape so they
  // match the dataKey attributes in JSX (which do not process backslash escapes).
  const chartData = result.years.map((y) => ({
    age: y.age,
    'Liquid (Nominal)': Math.round(y.endingAssets),
    'Home Equity (Nominal)': Math.round(y.propertyEquity),
    'Total (Nominal)': Math.round(y.endingAssets + y.propertyEquity),
    'Liquid (Today’s $)': Math.round(y.realAssets),
    'Home Equity (Today’s $)': Math.round(y.realPropertyEquity),
    'Total (Today’s $)': Math.round(y.realAssets + y.realPropertyEquity),
  }));

  const cashFlowData = result.years.filter((y) => y.age >= scenario.assumptions.retirementAge).map((y) => ({
    age: y.age,
    Income: Math.round(y.income),
    Withdrawals: Math.round(y.withdrawals),
    Expenses: Math.round(y.expenses),
  }));

  const navItems: { id: ResultSection; label: string; icon: string; help: string }[] = [
    {
      id: 'monte-carlo',
      label: 'Monte Carlo Stress Test',
      icon: '🎲',
      help: 'Probability of success across thousands of random futures.',
    },
    {
      id: 'deterministic',
      label: 'Straight-Line Projection',
      icon: '📊',
      help: 'Single-trajectory view at your expected returns.',
    },
  ];

  return (
    <div>
      {/* === Headline summary cards — always visible across sections ===
          The "Nest Egg" and "Final Assets" cards are clickable: they drill
          down into the year-by-year table at the relevant age so the user
          can see how the number was derived. The "Plan Outcome" card jumps
          to the depletion age (if the plan runs out) or the end age. */}
      <div className="summary-grid">
        <button type="button" className="summary-card summary-card-drilldown" onClick={() => focusOn(scenario.assumptions.retirementAge)} title="See the year-by-year breakdown at retirement">
          <div className="label">Nest Egg at Retirement</div>
          <div className="value">{formatCurrency(readiness.nestEggAtRetirement, { compact: true })}</div>
          <div className="sub">{formatCurrency(readiness.nestEggAtRetirementReal, { compact: true })} in today's dollars</div>
          <span className="summary-card-drilldown-hint" aria-hidden="true">View breakdown →</span>
        </button>
        <button type="button" className="summary-card summary-card-drilldown" onClick={() => focusOn(result.depletionAge ?? scenario.assumptions.endAge)} title="See the year the plan depletes (or the final year)">
          <div className="label">Plan Outcome</div>
          <div className={`value ${result.success ? 'value-good' : 'value-bad'}`}>
            {result.success ? '✓ Sustainable' : '✗ Runs Out'}
          </div>
          <div className="sub">{result.success ? `Lasts to age ${scenario.assumptions.endAge}` : `Depleted at age ${formatAge(result.depletionAge)}`}</div>
          <span className="summary-card-drilldown-hint" aria-hidden="true">View breakdown →</span>
        </button>
        <div className="summary-card">
          <div className="label">Year-1 Withdrawal Rate</div>
          <div className={`value ${readiness.neededWithdrawalRate <= scenario.assumptions.safeWithdrawalRate ? 'value-good' : 'value-bad'}`}>
            {formatPercent(readiness.neededWithdrawalRate)}
          </div>
          <div className="sub">Safe rate: {formatPercent(scenario.assumptions.safeWithdrawalRate)}</div>
        </div>
        <button type="button" className="summary-card summary-card-drilldown" onClick={() => focusOn(scenario.assumptions.endAge)} title="See the final-year breakdown">
          <div className="label">Final Assets (age {scenario.assumptions.endAge})</div>
          <div className="value">{formatCurrency(result.finalAssets, { compact: true })}</div>
          <div className="sub">{formatCurrency(result.finalAssetsReal, { compact: true })} in today's dollars</div>
          <span className="summary-card-drilldown-hint" aria-hidden="true">View breakdown →</span>
        </button>
      </div>

      {/* === Sidebar layout: chart panels live behind a left rail === */}
      <div className="results-layout">
        <aside className="results-sidebar">
          <ul className="results-nav">
            {navItems.map((item) => (
              <li key={item.id}>
                <button
                  className={`results-nav-item ${section === item.id ? 'active' : ''}`}
                  onClick={() => setSection(item.id)}
                  title={item.help}
                >
                  <span className="results-nav-icon">{item.icon}</span>
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="sidebar-divider" />
          <div className="sidebar-resources-label">About</div>
          <p className="muted" style={{ fontSize: 'var(--text-xs)', padding: '0 16px', lineHeight: 1.5 }}>
            {section === 'monte-carlo'
              ? 'Monte Carlo runs the plan many times with randomized returns to surface the probability of success across random futures.'
              : 'Deterministic view projects the plan at your exact expected return — one possible future.'}
          </p>
        </aside>

        <div className="results-content">
          {section === 'monte-carlo' && (
            <div className="panel">
              <div className="panel-header">
                <h2><span aria-hidden="true">🎲</span> Monte Carlo Stress Test</h2>
                <button
                  className="btn btn-sm"
                  onClick={() => setSection('deterministic')}
                  title="Jump to the deterministic single-trajectory charts"
                >
                  Compare to deterministic →
                </button>
              </div>
              <p className="section-help">
                The deterministic projection above assumes your exact expected return. Real markets
                vary year to year. This panel runs the plan many times with randomized returns to
                estimate the <strong>probability of success</strong> across thousands of possible futures.
              </p>
              <MonteCarloPanel scenario={scenario} colors={tc} />
            </div>
          )}

          {section === 'deterministic' && (
            <>
              {/* Net worth chart — stacked liquid + home equity.
                  Toggle between Nominal and Today's $ to avoid 4 overlapping
                  areas; both views are available but not shown at once. */}
              <div className="chart-container">
                <div className="chart-header-row">
                  <h3>Projected Net Worth Over Time</h3>
                  <div className="seg-toggle" role="group" aria-label="Net worth view">
                    <button className={`seg-btn${nwView === 'real' ? ' active' : ''}`} onClick={() => setNwView('real')}>Today's $</button>
                    <button className={`seg-btn${nwView === 'nominal' ? ' active' : ''}`} onClick={() => setNwView('nominal')}>Nominal</button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="detGradientLiquidNom" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={tc.chart} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={tc.chart} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="detGradientLiquidReal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={tc.chart2} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={tc.chart2} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="detGradientHomeNom" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={tc.chart3} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={tc.chart3} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="detGradientHomeReal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={tc.chart4} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={tc.chart4} stopOpacity={0} />
                      </linearGradient>
                    </defs>
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
                    {nwView === 'nominal' ? (
                      <>
                        <Area type="monotone" dataKey="Liquid (Nominal)" stackId="nom" stroke={tc.chart} fill="url(#detGradientLiquidNom)" strokeWidth={1.5} />
                        <Area type="monotone" dataKey="Home Equity (Nominal)" stackId="nom" stroke={tc.chart3} fill="url(#detGradientHomeNom)" strokeWidth={1.5} />
                      </>
                    ) : (
                      <>
                        <Area type="monotone" dataKey="Liquid (Today’s $)" stackId="real" stroke={tc.chart2} fill="url(#detGradientLiquidReal)" strokeWidth={1.5} />
                        <Area type="monotone" dataKey="Home Equity (Today’s $)" stackId="real" stroke={tc.chart4} fill="url(#detGradientHomeReal)" strokeWidth={1.5} />
                      </>
                    )}
                    <ReferenceLine x={scenario.assumptions.retirementAge} stroke={tc.yellow} strokeDasharray="5 5" label={{ value: 'Retire', fill: tc.yellow, fontSize: 11 }} />
                    {scenario.events.filter((ev) => ev.proceeds > 0 || ev.cost > 0).map((ev) => (
                      <ReferenceLine
                        key={ev.id}
                        x={ev.age}
                        stroke={ev.proceeds >= ev.cost ? tc.green : tc.red}
                        strokeDasharray="3 3"
                        label={{ value: ev.name || (ev.proceeds >= ev.cost ? '▲' : '▼'), fill: ev.proceeds >= ev.cost ? tc.green : tc.red, fontSize: 10, position: 'top' }}
                      />
                    ))}
                    {scenario.properties?.filter((p) => p.saleAge || p.purchaseAge).flatMap((p) => {
                      const lines = [];
                      if (p.saleAge) lines.push(<ReferenceLine key={`${p.id}-sale`} x={p.saleAge} stroke={tc.green} strokeDasharray="3 3" label={{ value: '🏡 Sale', fill: tc.green, fontSize: 10, position: 'top' }} />);
                      if (p.purchaseAge) lines.push(<ReferenceLine key={`${p.id}-buy`} x={p.purchaseAge} stroke={tc.red} strokeDasharray="3 3" label={{ value: '🏠 Buy', fill: tc.red, fontSize: 10, position: 'top' }} />);
                      return lines;
                    })}
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
              <YearTable result={result} retirementAge={scenario.assumptions.retirementAge} scenario={scenario} focusAge={focusAge} onFocusConsumed={() => setFocusAge(null)} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Builds a helpful "why is this empty?" message for the income detail row.
 *  Finds the next income source that will activate after the current age, so
 *  the user understands the gap (e.g. "Social Security starts at 67"). */
function nextIncomeHint(scenario: NonNullable<ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0]>, age: number): string {
  const upcoming = scenario.incomeSources
    .filter((i) => i.startAge > age)
    .sort((a, b) => a.startAge - b.startAge);
  if (upcoming.length > 0) {
    const next = upcoming[0];
    return `No income active at ${age}. Next up: ${next.name} at age ${next.startAge}.`;
  }
  const isRetired = age >= scenario.assumptions.retirementAge;
  return isRetired
    ? `No income active at ${age}. Add Social Security, a pension, or other sources on the Income tab.`
    : `No income active at ${age}. Add a salary or other income source on the Income tab.`;
}

/** Builds a helpful "why is this empty?" message for the expense detail row. */
function nextExpenseHint(scenario: NonNullable<ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0]>, age: number): string {
  const isRetired = age >= scenario.assumptions.retirementAge;
  // Check if any expenses exist at all for this phase
  const hasAnyForPhase = scenario.expenses.some((e) =>
    isRetired ? e.postRetirement : e.preRetirement,
  );
  if (!hasAnyForPhase) {
    return isRetired
      ? `No expenses marked for retirement at ${age}. Add housing, healthcare, and living costs on the Expenses tab.`
      : `No expenses marked for pre-retirement at ${age}. Add your current monthly costs on the Expenses tab.`;
  }
  // Expenses exist for the phase but none active at this exact age (age-window gap)
  return `No expenses active at age ${age}.`;
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

  // Regular expenses (includes linked :tax and :insurance entries).
  for (const exp of scenario.expenses) {
    const activePre = exp.preRetirement && !isRetired;
    const activePost = exp.postRetirement && isRetired;
    if (!activePre && !activePost) continue;
    if (exp.startAge !== null && age < exp.startAge) continue;
    if (exp.endAge !== null && age > exp.endAge) continue;
    // Legacy :mortgage linked expenses are computed by the engine now (see
    // below) — skip any that pre-date migration v6 to avoid double-counting.
    if (exp._propertyId?.endsWith(':mortgage')) continue;
    items.push({ name: exp.name, amount: exp.annualAmount * inflationFactor, category: exp.category });
  }

  // Mortgage payments (engine-computed, contractual — NOT inflated).
  // Counted in retirement only, matching the projection engine. Tax and
  // insurance are already covered above via their linked expense entries.
  if (isRetired && scenario.properties) {
    for (const prop of scenario.properties) {
      if (prop.saleAge && age >= prop.saleAge) continue;
      if (prop.purchaseAge && age < prop.purchaseAge) continue;
      const payment = mortgagePaymentAtAge(prop, age, a.currentAge);
      if (payment > 0) items.push({ name: `${prop.name} — Mortgage`, amount: payment, category: 'housing' });
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

function YearTable({ result, retirementAge, scenario, focusAge, onFocusConsumed }: { result: NonNullable<ReturnType<typeof runProjection>>; retirementAge: number; scenario: NonNullable<ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0]>; focusAge?: number | null; onFocusConsumed?: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const [expandedAge, setExpandedAge] = useState<number | null>(null);
  // If a focusAge arrives that falls outside the default summary window,
  // widen the view so the row is actually rendered and scrollable to.
  const focusOutsideWindow = focusAge !== null && focusAge !== undefined && (focusAge < retirementAge - 5 || focusAge > retirementAge + 15);
  const data = (showAll || focusOutsideWindow) ? result.years : result.years.filter((y) => y.age >= retirementAge - 5 && y.age <= retirementAge + 15);

  // Refs to each year row so we can scrollIntoView when a headline card
  // drills down to a specific age.
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});
  const [highlightAge, setHighlightAge] = useState<number | null>(null);

  // When a focusAge arrives (from a headline card click), expand the row,
  // scroll it into view, and flash a highlight so the user sees exactly
  // which row backs the number they clicked.
  useEffect(() => {
    if (focusAge === null || focusAge === undefined) return;
    setExpandedAge(focusAge);
    setHighlightAge(focusAge);
    // Defer the scroll until React has rendered the row (and potentially
    // widened the data range via focusOutsideWindow).
    const t = setTimeout(() => {
      rowRefs.current[focusAge]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    // Clear the highlight after ~2.5s and tell the parent we consumed it.
    const t2 = setTimeout(() => {
      setHighlightAge(null);
      onFocusConsumed?.();
    }, 2500);
    return () => { clearTimeout(t); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAge]);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2><span aria-hidden="true">📊</span> Year-by-Year Detail</h2>
        <button className="btn btn-sm" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show Summary' : 'Show All Years'}</button>
      </div>
      <div className="table-scroll" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 28 }}></th>
              <th>Age</th>
              <th className="text-right col-optional">Start Assets</th>
              <th className="text-right col-optional">Contrib.</th>
              <th className="text-right col-optional">Deposits</th>
              <th className="text-right col-optional">Growth</th>
              <th className="text-right">Income</th>
              <th className="text-right">Withdrawals</th>
              <th className="text-right">Expenses</th>
              <th className="text-right">End Assets</th>
              <th className="text-right col-optional">Real $</th>
            </tr>
          </thead>
          <tbody>
            {data.map((y) => (
              <Fragment key={y.age}>
                <tr
                  ref={(el) => { rowRefs.current[y.age] = el; }}
                  style={y.depleted ? { color: 'var(--red)' } : {}}
                  className={`year-row${highlightAge === y.age ? ' year-row-highlight' : ''}`}
                  tabIndex={0}
                  role="button"
                  aria-expanded={expandedAge === y.age}
                  aria-label={`Age ${y.age}, ${expandedAge === y.age ? 'collapse' : 'expand'} details`}
                  onClick={() => setExpandedAge(expandedAge === y.age ? null : y.age)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setExpandedAge(expandedAge === y.age ? null : y.age);
                    }
                  }}
                >
                  <td className="drag-handle" style={{ cursor: 'pointer', opacity: 1 }} aria-hidden="true">{expandedAge === y.age ? '▼' : '▶'}</td>
                  <td style={{ cursor: 'pointer' }}>{y.age}</td>
                  <td className="text-right col-optional">{formatCurrency(y.beginningAssets, { compact: true })}</td>
                  <td className="text-right col-optional">{y.contributions > 0 ? formatCurrency(y.contributions, { compact: true }) : '—'}</td>
                  <td className="text-right col-optional" style={{ color: 'var(--chart-2)' }}>{y.deposits > 0 ? '+' + formatCurrency(y.deposits, { compact: true }) : '—'}</td>
                  <td className="text-right col-optional" style={{ color: 'var(--green)' }}>{y.growth > 0 ? '+' + formatCurrency(y.growth, { compact: true }) : '—'}</td>
                  <td className="text-right">{y.income > 0 ? formatCurrency(y.income, { compact: true }) : '—'}</td>
                  <td className="text-right" style={{ color: y.withdrawals > 0 ? 'var(--red)' : undefined }}>{y.withdrawals > 0 ? '-' + formatCurrency(y.withdrawals, { compact: true }) : '—'}</td>
                  <td className="text-right">{y.expenses > 0 ? formatCurrency(y.expenses, { compact: true }) : '—'}</td>
                  <td className="text-right" style={{ fontWeight: 600 }}>{formatCurrency(y.endingAssets, { compact: true })}</td>
                  <td className="text-right col-optional muted">{formatCurrency(y.realAssets, { compact: true })}</td>
                </tr>
                {expandedAge === y.age && (
                  <tr key={`${y.age}-detail`} className="year-detail-row">
                    <td colSpan={11} style={{ padding: 0 }}>
                      <div className="year-detail">
                        <div className="year-detail-grid">
                          <div className="year-detail-section">
                            <div className="year-detail-title">💵 Income Sources</div>
                            <table className="data-table year-detail-table">
                              <tbody>
                                {(() => {
                                  const items = getIncomeBreakdown(scenario, y.age);
                                  if (items.length === 0) return <tr><td className="muted">{nextIncomeHint(scenario, y.age)}</td></tr>;
                                  const total = items.reduce((s, it) => s + it.amount, 0);
                                  return (
                                    <>
                                      {items.map((item, i) => (
                                        <tr key={i}>
                                          <td>{item.name}</td>
                                          <td className="muted" style={{ fontSize: 11 }}>{prettify(item.type)}</td>
                                          <td className="text-right" style={{ color: 'var(--green)' }}>{formatCurrency(item.amount)}</td>
                                        </tr>
                                      ))}
                                      <tr className="year-detail-total">
                                        <td colSpan={2}>Total / yr</td>
                                        <td className="text-right" style={{ color: 'var(--green)' }}>{formatCurrency(total)}</td>
                                      </tr>
                                    </>
                                  );
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
                                  if (items.length === 0) return <tr><td className="muted">{nextExpenseHint(scenario, y.age)}</td></tr>;
                                  const total = items.reduce((s, it) => s + it.amount, 0);
                                  return (
                                    <>
                                      {items.map((item, i) => (
                                        <tr key={i}>
                                          <td>{item.name}</td>
                                          <td className="muted" style={{ fontSize: 11 }}>{prettify(item.category)}</td>
                                          <td className="text-right" style={{ color: 'var(--red)' }}>{formatCurrency(item.amount)}</td>
                                        </tr>
                                      ))}
                                      <tr className="year-detail-total">
                                        <td colSpan={2}>Total / yr</td>
                                        <td className="text-right" style={{ color: 'var(--red)' }}>{formatCurrency(total)}</td>
                                      </tr>
                                    </>
                                  );
                                })()}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============ COMPARE VIEW ============ */

function CompareView({ results, scenarios }: { results: NonNullable<ReturnType<typeof runProjection>>[]; scenarios: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'] }) {
  const tc = useThemeColors();
  const tooltipStyle = { background: tc.panel, border: `1px solid ${tc.border}`, borderRadius: 8 };
  // Need the store to offer a one-click "duplicate" from the empty state so a
  // user landing on Compare with a single scenario isn't staring at a lonely
  // card and a hidden diff table — they get a clear path to a 2nd scenario.
  const duplicateScenario = usePlanStore((s) => s.duplicateScenario);
  const activeScenarioId = usePlanStore((s) => s.activeScenarioId);

  // Assumption fields to compare, with label + formatter. Only fields that
  // DIFFER across scenarios are shown — identical values add noise, not signal.
  const assumptionFields: { key: keyof Scenario['assumptions']; label: string; fmt: (v: number) => string }[] = [
    { key: 'currentAge', label: 'Current age', fmt: (v) => String(v) },
    { key: 'retirementAge', label: 'Retirement age', fmt: (v) => String(v) },
    { key: 'endAge', label: 'Plan end age', fmt: (v) => String(v) },
    { key: 'inflationRate', label: 'Inflation', fmt: (v) => formatPercent(v) },
    { key: 'socialSecurityCola', label: 'SS COLA', fmt: (v) => formatPercent(v) },
    { key: 'retirementTaxRate', label: 'Retirement tax rate', fmt: (v) => formatPercent(v) },
    { key: 'safeWithdrawalRate', label: 'Safe withdrawal', fmt: (v) => formatPercent(v) },
    { key: 'preRetirementReturn', label: 'Pre-retirement return', fmt: (v) => formatPercent(v) },
    { key: 'postRetirementReturn', label: 'Post-retirement return', fmt: (v) => formatPercent(v) },
  ];
  // Map results back to their scenarios so the diff columns align with the
  // summary cards above (same scenario order).
  const orderedScenarios = results
    .map((r) => scenarios.find((s) => s.id === r.scenarioId))
    .filter((s): s is Scenario => !!s);
  const differingFields = assumptionFields.filter((f) => {
    const vals = orderedScenarios.map((s) => s.assumptions[f.key]);
    return !vals.every((v) => v === vals[0]);
  });
  // Each scenario gets two parallel lines: liquid and total (incl. home equity).
  // Total - Liquid === Home Equity at that age, so the gap between the lines
  // visually communicates how much of each scenario's wealth is real estate.
  const compareData = useMemo(() => {
    const maxAge = Math.max(...results.map((r) => r.years[r.years.length - 1]?.age ?? 0));
    const data: Record<string, number | string>[] = [];
    for (let age = results[0]?.years[0]?.age ?? 0; age <= maxAge; age++) {
      const row: Record<string, number | string> = { age };
      results.forEach((r) => {
        const y = r.years.find((y) => y.age === age);
        if (!y) return;
        row[`${r.scenarioName} (Liquid)`] = Math.round(y.realAssets);
        row[`${r.scenarioName} (Total)`] = Math.round(y.realAssets + y.realPropertyEquity);
      });
      data.push(row);
    }
    return data;
  }, [results]);

  // Scenario palette: derived from the active theme so switching themes
  // recolors these lines along with the rest of the chart. Slots 1–4 take the
  // four `--chart` tokens; slots 5–6 reuse `--red` / `--yellow` so a
  // scenario that's depleting its savings lands visually as "at risk" without
  // needing an extra legend.
  const colors = [tc.chart, tc.chart2, tc.chart3, tc.chart4, tc.chart5, tc.chart6];

  return (
    <div>
      {results.length < 2 && (
        <div className="panel mb-16 compare-empty">
          <div className="compare-empty-icon" aria-hidden="true">⚖️</div>
          <div className="compare-empty-body">
            <h3>Compare needs at least two scenarios</h3>
            <p className="section-help" style={{ marginBottom: 0 }}>
              You currently have {results.length === 1 ? 'one' : 'none'}. Duplicate your active scenario and tweak an
              assumption (retirement age, withdrawal rate, returns) to see how the outcome changes side by side.
            </p>
          </div>
          {results.length === 1 && (
            <button
              className="btn"
              onClick={() => duplicateScenario(activeScenarioId)}
            >
              ⧉ Duplicate “{scenarios.find((s) => s.id === activeScenarioId)?.name ?? 'scenario'}”
            </button>
          )}
        </div>
      )}

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

      {differingFields.length > 0 && (
        <div className="panel mb-16">
          <div className="panel-header">
            <h3>What's different?</h3>
          </div>
          <p className="section-help">
            Only the assumptions that vary between scenarios are shown — so you can see <em>why</em> the outcomes differ without switching back to Inputs.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table compare-diff-table">
              <thead>
                <tr>
                  <th>Assumption</th>
                  {orderedScenarios.map((s, i) => (
                    <th key={s.id} className="text-right" style={{ color: colors[i % colors.length] }}>{s.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {differingFields.map((f) => (
                  <tr key={f.key}>
                    <td>{f.label}</td>
                    {orderedScenarios.map((s) => (
                      <td key={s.id} className="text-right">{f.fmt(s.assumptions[f.key] as number)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
            {results.map((r, i) => {
              const c = colors[i % colors.length];
              // Two lines per scenario: solid for liquid assets, dashed for
              // total (incl. home equity). The gap between them is the home
              // equity contribution at each age.
              // NOTE: <Line> must be a DIRECT child of <LineChart> — Recharts
              // discovers series via React.Children and skips anything nested
              // in a wrapper like <g> or <Fragment>, so we return a flat array.
              return [
                <Line key={`${r.scenarioId}-liquid`} type="monotone" dataKey={`${r.scenarioName} (Liquid)`} name={r.scenarioName} stroke={c} strokeWidth={2} dot={false} />,
                <Line key={`${r.scenarioId}-total`} type="monotone" dataKey={`${r.scenarioName} (Total)`} name={`${r.scenarioName} (+ home)`} stroke={c} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />,
              ];
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============ SHARED INPUT COMPONENTS ============ */

function PctCellInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { display, handleChange, handleBlur, notice } = useEditableNumber({
    value,
    onCommit: onChange,
    toInput: (v) => (v * 100).toFixed(1),
    fromInput: (v) => v / 100,
  });
  return (
    <>
      <div className="input-with-unit">
        <input
          className="table-input text-right"
          type="number"
          value={display}
          step={0.5}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
        />
        <span className="unit">%</span>
      </div>
      {notice && <div className="input-snapback">{notice}</div>}
    </>
  );
}

function CurrencyCellInput({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  const { display, handleChange, handleBlur, notice } = useEditableNumber({
    value,
    onCommit: onChange,
    min,
    formatValue: formatCurrency,
  });
  return (
    <>
      <div className="input-with-unit">
        <span className="unit">$</span>
        <input
          className="table-input text-right"
          type="number"
          value={display}
          min={min}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
        />
      </div>
      {notice && <div className="input-snapback">{notice}</div>}
    </>
  );
}

function NumCellInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { display, handleChange, handleBlur, notice } = useEditableNumber({
    value,
    onCommit: onChange,
  });
  return (
    <>
      <input
        className="table-input text-right"
        type="number"
        value={display}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
      />
      {notice && <div className="input-snapback">{notice}</div>}
    </>
  );
}

/* ---------- Bare numeric field helpers (for property + events panels) ----------
 * Each one wraps useEditableNumber and handles its own nullable-aware storage
 * so callers don't have to. They render the same labeled input + snap-back
 * notice pattern as the other cell components above. */

type ScenarioStore = ReturnType<typeof usePlanStore.getState>;

function PropYearsLeftField({ prop, scenario, store }: {
  prop: Property; scenario: Scenario; store: ScenarioStore;
}) {
  const { display, handleChange, handleBlur, notice } = useEditableNumber({
    value: prop.mortgageYearsLeft ?? 0,
    onCommit: (v) => store.updateProperty(scenario.id, prop.id, { mortgageYearsLeft: v }),
    min: 0, max: 50,
  });
  // When the prop is unset, render the input as empty (matches the old
  // `value={prop.mortgageYearsLeft ?? ''}` UX) even though the hook holds 0.
  const shown = prop.mortgageYearsLeft == null ? '' : display;
  return (
    <div className="prop-field">
      <label>Years remaining</label>
      <input
        type="number"
        value={shown}
        placeholder="—"
        min={0}
        max={50}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
      />
      {notice && <div className="input-snapback">{notice}</div>}
    </div>
  );
}

function PropSaleAgeField({ prop, scenario, store, equity }: {
  prop: Property; scenario: Scenario; store: ScenarioStore; equity: number;
}) {
  const { display, handleChange, handleBlur, notice } = useEditableNumber({
    value: prop.saleAge ?? 0,
    // Side-effect: when saleAge transitions to "unset" (committed 0 from a
    // previously-set value) clear saleProceeds back to whatever it was; when
    // saleAge is set, recompute saleProceeds from current equity.
    onCommit: (v) => {
      const goingToNull = v === 0 && prop.saleAge !== 0;
      store.updateProperty(scenario.id, prop.id, {
        saleAge: goingToNull ? null : v,
        saleProceeds: goingToNull ? (prop.saleProceeds ?? 0) : equity,
      });
    },
    formatValue: (v) => (v === 0 ? 'unset' : `${v}`),
  });
  const shown = prop.saleAge == null ? '' : display;
  return (
    <div className="prop-field">
      <label>Sell at age</label>
      <input
        type="number"
        value={shown}
        placeholder="—"
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
      />
      {notice && <div className="input-snapback">{notice}</div>}
    </div>
  );
}

function PropPurchaseAgeField({ prop, scenario, store }: {
  prop: Property; scenario: Scenario; store: ScenarioStore;
}) {
  const { display, handleChange, handleBlur, notice } = useEditableNumber({
    value: prop.purchaseAge ?? 0,
    onCommit: (v) => {
      const goingToNull = v === 0 && prop.purchaseAge !== 0;
      store.updateProperty(scenario.id, prop.id, {
        purchaseAge: goingToNull ? null : v,
      });
    },
    formatValue: (v) => (v === 0 ? 'unset' : `${v}`),
  });
  const shown = prop.purchaseAge == null ? '' : display;
  return (
    <div className="prop-field">
      <label>Buy at age</label>
      <input
        type="number"
        value={shown}
        placeholder="—"
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
      />
      {notice && <div className="input-snapback">{notice}</div>}
    </div>
  );
}

function PropMortgageTermField({ prop, scenario, store }: {
  prop: Property; scenario: Scenario; store: ScenarioStore;
}) {
  const { display, handleChange, handleBlur, notice } = useEditableNumber({
    value: prop.mortgageTerm ?? 30,
    onCommit: (v) => store.updateProperty(scenario.id, prop.id, { mortgageTerm: v }),
    min: 1, max: 50,
  });
  return (
    <div className="prop-field">
      <label>Mortgage term (years)</label>
      <input
        type="number"
        value={display}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
      />
      {notice && <div className="input-snapback">{notice}</div>}
    </div>
  );
}

function EventAgeField({ ev, scenario, store }: {
  ev: LifeEvent; scenario: Scenario; store: ScenarioStore;
}) {
  const { display, handleChange, handleBlur, notice } = useEditableNumber({
    value: ev.age,
    onCommit: (v) => store.updateEvent(scenario.id, ev.id, { age: v }),
    min: scenario.assumptions.currentAge,
    max: scenario.assumptions.endAge,
  });
  return (
    <>
      <input
        type="number"
        value={display}
        style={{ width: 70 }}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
      />
      {notice && <div className="input-snapback">{notice}</div>}
    </>
  );
}

function EventDurationField({ ev, scenario, store }: {
  ev: LifeEvent; scenario: Scenario; store: ScenarioStore;
}) {
  const { display, handleChange, handleBlur, notice } = useEditableNumber({
    value: ev.ongoingDurationYears ?? 0,
    onCommit: (v) => {
      // Translate 0 → null when going from a previously-set value to "forever".
      const goingToNull = v === 0 && ev.ongoingDurationYears !== 0;
      store.updateEvent(scenario.id, ev.id, {
        ongoingDurationYears: goingToNull ? null : v,
      });
    },
    min: 0, max: 100,
    formatValue: (v) => (v === 0 ? '∞' : `${v}`),
  });
  const shown = ev.ongoingDurationYears == null ? '' : display;
  return (
    <>
      <input
        type="number"
        value={shown}
        placeholder="∞"
        style={{ width: 60 }}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
      />
      {notice && <div className="input-snapback">{notice}</div>}
    </>
  );
}