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
import type { AccountType, IncomeType, ExpenseCategory, EventType, PropertyType } from './types';
import { formatCurrency, formatPercent, formatAge } from './format';
import { exportMarkdown } from './markdown';

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

const THEMES: { id: Theme; label: string }[] = [
  { id: 'dark', label: '🌙 Dark' },
  { id: 'light', label: '☀️ Light' },
  { id: 'sepia', label: '📜 Sepia' },
  { id: 'nord', label: '❄️ Nord' },
];

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
        <h1><img src="/images/title.png" alt="retirementMe-Off" style={{ height: '96px', width: 'auto', verticalAlign: 'middle', background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '4px 8px' }} /></h1>
        <div className="header-actions">
          <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)} style={{ width: 'auto' }}>
            {THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
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
    { label: 'Has at least 1 account', pass: scenario.accounts.length > 0, weight: 15 },
    { label: 'Account balances > $0', pass: scenario.accounts.some(a => a.balance > 0), weight: 10 },
    { label: 'Has retirement contributions', pass: scenario.accounts.some(a => a.annualContribution > 0), weight: 10 },
    { label: 'Has expenses defined', pass: scenario.expenses.length > 0, weight: 15 },
    { label: 'Has post-retirement expenses', pass: scenario.expenses.some(e => e.postRetirement), weight: 10 },
    { label: 'Has income sources', pass: scenario.incomeSources.length > 0, weight: 10 },
    { label: 'Has Social Security or pension', pass: scenario.incomeSources.some(i => i.type === 'social_security' || i.type === 'pension'), weight: 10 },
    { label: 'Current age < retirement age', pass: scenario.assumptions.currentAge < scenario.assumptions.retirementAge, weight: 5 },
    { label: 'Retirement age < end age', pass: scenario.assumptions.retirementAge < scenario.assumptions.endAge, weight: 5 },
    { label: 'Realistic withdrawal rate (3-5%)', pass: scenario.assumptions.safeWithdrawalRate >= 0.03 && scenario.assumptions.safeWithdrawalRate <= 0.05, weight: 5 },
    { label: 'Realistic pre-retirement return (5-10%)', pass: scenario.assumptions.preRetirementReturn >= 0.05 && scenario.assumptions.preRetirementReturn <= 0.10, weight: 5 },
  ];
  const wellnessScore = checks.reduce((sum, c) => sum + (c.pass ? c.weight : 0), 0);
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

      {/* Timeline section */}
      <div className="form-section">
        <div className="form-section-title">🗓️ Timeline</div>
        <div className="form-section-help">Define your retirement window. These ages determine how long you have to save and how long your savings need to last.</div>
        <div className="form-row-3">
          <FieldGroup
            label="Current Age"
            helpText="Your age today. The model starts from this year."
          >
            <AgeInput value={a.currentAge} onChange={(v) => upd({ currentAge: v })} />
          </FieldGroup>
          <FieldGroup
            label="Retirement Age"
            helpText={`When you stop working and start withdrawals. You have ${yearsToRetirement > 0 ? yearsToRetirement : 0} years left to save.`}
            highImpact
          >
            <AgeInput value={a.retirementAge} onChange={(v) => upd({ retirementAge: v })} />
          </FieldGroup>
          <FieldGroup
            label="Plan End Age"
            helpText={`How long the plan must last. This covers ${yearsInRetirement} years of retirement.`}
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

function AccountsPanel({ scenario, store }: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
}) {
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (idx: number) => { dragIndex.current = idx; };
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIndex(idx); };
  const handleDrop = (idx: number) => {
    if (dragIndex.current !== null && dragIndex.current !== idx) {
      store.reorderAccounts(scenario.id, dragIndex.current, idx);
    }
    dragIndex.current = null;
    setDragOverIndex(null);
  };
  const handleDragEnd = () => { dragIndex.current = null; setDragOverIndex(null); };

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>🏦 Accounts & Savings</h2>
        <button className="btn btn-sm" onClick={() => store.addAccount(scenario.id, {
          name: 'New Account', type: 'checking_savings', balance: 0, annualReturn: 0.05, annualContribution: 0, employerMatch: 0,
        })}>+ Add Account</button>
      </div>
      <p className="section-help">
        Add all your savings and investment accounts. Enter the <strong>current balance</strong>, expected <strong>annual return rate</strong>,
        and how much you contribute <strong>per year</strong>. Employer match applies to 401(k) plans.
      </p>
      <div className="summary-strip">
        <div className="summary-strip-item">
          <span className="label">Total Balance</span>
          <span className="value">{formatCurrency(scenario.accounts.reduce((s, a) => s + a.balance, 0), { compact: true })}</span>
        </div>
        <div className="summary-strip-item">
          <span className="label">Annual Contributions</span>
          <span className="value">{formatCurrency(scenario.accounts.reduce((s, a) => s + a.annualContribution + a.employerMatch, 0), { compact: true })}</span>
        </div>
        <div className="summary-strip-item">
          <span className="label">Accounts</span>
          <span className="value">{scenario.accounts.length}</span>
        </div>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 28 }}></th>
            <th>Name</th>
            <th>Type</th>
            <th className="text-right" title="Current balance">Balance</th>
            <th className="text-right" title="Expected annual rate of return">Return %</th>
            <th className="text-right" title="Annual contribution you make">Your Contrib.</th>
            <th className="text-right" title="Employer match (401k only)">Match</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {scenario.accounts.map((acct, idx) => (
            <tr
              key={acct.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              className={`${dragIndex.current === idx ? 'dragging' : ''} ${dragOverIndex === idx && dragIndex.current !== null ? 'drag-over' : ''}`}
            >
              <td className="drag-handle" title="Drag to reorder">⋮⋮</td>
              <td className="col-name"><input className="table-input" value={acct.name} onChange={(e) => store.updateAccount(scenario.id, acct.id, { name: e.target.value })} /></td>
              <td className="col-type">
                <select className="table-select" value={acct.type} onChange={(e) => store.updateAccount(scenario.id, acct.id, { type: e.target.value as AccountType })}>
                  {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{prettify(t)}</option>)}
                </select>
              </td>
              <td><CurrencyCellInput value={acct.balance} onChange={(v) => store.updateAccount(scenario.id, acct.id, { balance: v })} /></td>
              <td><PctCellInput value={acct.annualReturn} onChange={(v) => store.updateAccount(scenario.id, acct.id, { annualReturn: v })} /></td>
              <td><CurrencyCellInput value={acct.annualContribution} onChange={(v) => store.updateAccount(scenario.id, acct.id, { annualContribution: v })} /></td>
              <td><CurrencyCellInput value={acct.employerMatch} onChange={(v) => store.updateAccount(scenario.id, acct.id, { employerMatch: v })} /></td>
              <td><ConfirmDelete title="Delete account" onConfirm={() => store.deleteAccount(scenario.id, acct.id)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="add-row muted text-right">
        Total: {formatCurrency(scenario.accounts.reduce((s, a) => s + a.balance, 0))}
      </div>
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
      {/* === Header === */}
      <div className="prop-card-header">
        <span className="prop-icon">{prop.type === 'land' ? '🌳' : '🏠'}</span>
        <input type="text" className="prop-name-input" value={prop.name} placeholder="e.g. Family Home" onChange={(e) => store.updateProperty(scenario.id, prop.id, { name: e.target.value })} />
        <select className="table-select" value={prop.type} onChange={(e) => store.updateProperty(scenario.id, prop.id, { type: e.target.value as PropertyType })} style={{ width: 'auto', minWidth: 140 }}>
          {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{prettify(t)}</option>)}
        </select>
        <ConfirmDelete title="Delete property" onConfirm={() => store.deleteProperty(scenario.id, prop.id)} />
      </div>

      {/* === SECTION A: Property Details === */}
      <div className="prop-zone prop-zone-current">
        <div className="prop-zone-label">📍 Property Details</div>
        <div className="prop-zone-grid">
          <div className="prop-field">
            <label>Current market value</label>
            <CurrencyCellInput value={prop.currentValue} onChange={(v) => store.updateProperty(scenario.id, prop.id, { currentValue: v })} />
            <a href={`https://www.zillow.com/homes/${encodeURIComponent(prop.name || '')}_rb/`} target="_blank" rel="noopener noreferrer" className="prop-zillow-link">🔍 Check Zillow</a>
          </div>
          <div className="prop-field">
            <label>Expected annual home value growth</label>
            <PctCellInput value={prop.annualAppreciation} onChange={(v) => store.updateProperty(scenario.id, prop.id, { annualAppreciation: v })} />
          </div>
        </div>
      </div>

      {/* === SECTION B: Current Finances === */}
      <div className="prop-zone prop-zone-current" style={{ paddingTop: 0 }}>
        <div className="prop-zone-label">💰 Current Mortgage</div>
        <div className="prop-zone-grid">
          <div className="prop-field">
            <label>Remaining mortgage balance</label>
            <CurrencyCellInput value={prop.mortgageBalance} onChange={(v) => store.updateProperty(scenario.id, prop.id, { mortgageBalance: v })} />
          </div>
          <div className="prop-field">
            <label>Annual mortgage payment (P+I)</label>
            <CurrencyCellInput value={prop.mortgagePayment ?? 0} onChange={(v) => store.updateProperty(scenario.id, prop.id, { mortgagePayment: v })} />
          </div>
          <div className="prop-field">
            <label>Years remaining on mortgage</label>
            <input type="number" value={prop.mortgageYearsLeft ?? ''} placeholder="—" onChange={(e) => store.updateProperty(scenario.id, prop.id, { mortgageYearsLeft: +e.target.value || undefined })} />
          </div>
        </div>
      </div>

      {/* === SECTION C: Annual Ownership Costs === */}
      <div className="prop-zone prop-zone-current" style={{ paddingTop: 0 }}>
        <div className="prop-zone-label">📋 Annual Ownership Costs</div>
        <div className="prop-zone-grid">
          <div className="prop-field">
            <label>Property tax per year</label>
            <CurrencyCellInput value={prop.annualPropertyTax} onChange={(v) => store.updateProperty(scenario.id, prop.id, { annualPropertyTax: v })} />
          </div>
          <div className="prop-field">
            <label>Home insurance per year</label>
            <CurrencyCellInput value={prop.annualInsurance} onChange={(v) => store.updateProperty(scenario.id, prop.id, { annualInsurance: v })} />
          </div>
        </div>
      </div>

      {/* === Calculated metrics — visually distinct === */}
      <div className="prop-metrics">
        <div className="prop-metric">
          <span className="prop-metric-label">Current Equity</span>
          <span className="prop-metric-value" style={{ color: equity >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatCurrency(equity)}</span>
        </div>
        <div className="prop-metric">
          <span className="prop-metric-label">Annual Housing Cost</span>
          <span className="prop-metric-value">{formatCurrency(annualHousing + (prop.mortgagePayment ?? 0))}</span>
          <span className="prop-metric-sub">mortgage + tax + insurance</span>
        </div>
        {payoffYears > 0 && (
          <div className="prop-metric">
            <span className="prop-metric-label">Mortgage Payoff</span>
            <span className="prop-metric-value">~{payoffYears} yrs</span>
            <span className="prop-metric-sub">remaining</span>
          </div>
        )}
      </div>

      {/* === SECTION D: Future Plan === */}
      <div className="prop-zone prop-zone-planned">
        <div className="prop-zone-label">🔄 What do you plan to do with this property?</div>

        {/* Plan action selector */}
        <div className="prop-plan-grid">
          {PLAN_ACTION_LABELS.map((opt) => (
            <button
              key={opt.value}
              className={`prop-plan-option ${planAction === opt.value ? 'active' : ''}`}
              onClick={() => {
                const action = opt.value as 'keep' | 'sell' | 'sell_and_buy' | 'undecided';
                const updates: Record<string, unknown> = { planAction: action };
                // Auto-set sale age for sell actions
                if ((action === 'sell' || action === 'sell_and_buy') && !prop.saleAge) {
                  updates.saleAge = scenario.assumptions.retirementAge;
                  updates.saleProceeds = equity;
                }
                // Auto-set purchase age for sell_and_buy
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

        {/* Sale fields — shown for sell or sell_and_buy */}
        {showSaleFields && (
          <div className="prop-plan-fields">
            <div className="prop-zone-label" style={{ marginTop: 14 }}>🏡 Sale Details</div>
            <div className="prop-zone-grid">
              <div className="prop-field">
                <label>Sell at age</label>
                <input type="number" value={prop.saleAge ?? ''} placeholder="—" onChange={(e) => { const val = +e.target.value || null; store.updateProperty(scenario.id, prop.id, { saleAge: val, saleProceeds: val ? equity : (prop.saleProceeds ?? 0) }); }} />
              </div>
              <div className="prop-field">
                <label>Estimated net proceeds after mortgage payoff</label>
                <CurrencyCellInput value={prop.saleProceeds ?? 0} onChange={(v) => store.updateProperty(scenario.id, prop.id, { saleProceeds: v })} />
              </div>
            </div>
          </div>
        )}

        {/* Purchase fields — shown only for sell_and_buy */}
        {showBuyFields && (
          <div className="prop-plan-fields">
            <div className="prop-zone-label" style={{ marginTop: 14 }}>🔑 New Home Purchase</div>
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
              <div className="prop-metrics prop-metrics-inline">
                <span className="prop-metric-label">Estimated payment:</span>
                <span className="prop-metric-value" style={{ fontSize: 'var(--text-sm)' }}>{formatCurrency(estMortgage)}/yr</span>
                <span className="prop-metric-sub">({formatCurrency(estMortgage / 12)}/mo)</span>
              </div>
            )}
          </div>
        )}

        {/* Keep message */}
        {planAction === 'keep' && (
          <p className="prop-plan-note">You'll keep this property through retirement. Housing costs (mortgage if remaining, tax, insurance) will continue as expenses.</p>
        )}
        {planAction === 'undecided' && (
          <p className="prop-plan-note">Choose a plan above to model how this property affects your retirement. You can change this anytime.</p>
        )}
      </div>

      {/* === SECTION E: Retirement Impact === */}
      <div className="prop-zone prop-zone-impact">
        <div className="prop-zone-label">📊 Retirement Impact</div>
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

function ExpensesPanel({ scenario, store }: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
}) {
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (idx: number) => { dragIndex.current = idx; };
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIndex(idx); };
  const handleDrop = (idx: number) => {
    if (dragIndex.current !== null && dragIndex.current !== idx) {
      store.reorderExpenses(scenario.id, dragIndex.current, idx);
    }
    dragIndex.current = null;
    setDragOverIndex(null);
  };
  const handleDragEnd = () => { dragIndex.current = null; setDragOverIndex(null); };

  const preRetTotal = scenario.expenses.filter(e => e.preRetirement).reduce((s, e) => s + e.annualAmount, 0) / 12;
  const postRetTotal = scenario.expenses.filter(e => e.postRetirement).reduce((s, e) => s + e.annualAmount, 0) / 12;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>📋 Expenses</h2>
        <button className="btn btn-sm" onClick={() => store.addExpense(scenario.id, {
          name: 'New Expense', category: 'other', annualAmount: 0, preRetirement: false, postRetirement: true, startAge: null, endAge: null,
        })}>+ Add Expense</button>
      </div>
      <p className="section-help">
        Enter your monthly costs for each category. Check <strong>Before retirement</strong> for expenses you pay while working,
        and <strong>After retirement</strong> for those that continue into retirement. Drag rows by the handle to reorder.
      </p>
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
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 28 }}></th>
            <th>Name</th>
            <th>Category</th>
            <th className="text-right">Monthly</th>
            <th className="checkbox-cell" title="Applies before retirement age">Before Retirement</th>
            <th className="checkbox-cell" title="Applies after retirement age">After Retirement</th>
            <th className="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          {scenario.expenses.map((exp, idx) => (
            <tr
              key={exp.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              className={`${dragIndex.current === idx ? 'dragging' : ''} ${dragOverIndex === idx && dragIndex.current !== null ? 'drag-over' : ''}`}
            >
              <td className="drag-handle" title="Drag to reorder">⋮⋮</td>
              <td className="col-name"><input className="table-input" value={exp.name} onChange={(e) => store.updateExpense(scenario.id, exp.id, { name: e.target.value })} /></td>
              <td>
                <select className="table-select" value={exp.category} onChange={(e) => store.updateExpense(scenario.id, exp.id, { category: e.target.value as ExpenseCategory })}>
                  {EXPENSE_CATEGORIES.map((t) => <option key={t} value={t}>{prettify(t)}</option>)}
                </select>
              </td>
              <td><CurrencyCellInput value={Math.round(exp.annualAmount / 12)} onChange={(v) => store.updateExpense(scenario.id, exp.id, { annualAmount: v * 12 })} /></td>
              <td className="checkbox-cell"><input type="checkbox" checked={exp.preRetirement} onChange={(e) => store.updateExpense(scenario.id, exp.id, { preRetirement: e.target.checked })} /></td>
              <td className="checkbox-cell"><input type="checkbox" checked={exp.postRetirement} onChange={(e) => store.updateExpense(scenario.id, exp.id, { postRetirement: e.target.checked })} /></td>
              <td className="col-actions">
                <ConfirmDelete title="Delete expense" onConfirm={() => store.deleteExpense(scenario.id, exp.id)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IncomePanel({ scenario, store }: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
}) {
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (idx: number) => { dragIndex.current = idx; };
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIndex(idx); };
  const handleDrop = (idx: number) => {
    if (dragIndex.current !== null && dragIndex.current !== idx) {
      store.reorderIncome(scenario.id, dragIndex.current, idx);
    }
    dragIndex.current = null;
    setDragOverIndex(null);
  };
  const handleDragEnd = () => { dragIndex.current = null; setDragOverIndex(null); };

  const totalMonthly = scenario.incomeSources.reduce((s, i) => s + i.annualAmount, 0) / 12;
  const ssCount = scenario.incomeSources.filter(i => i.type === 'social_security').length;
  const earliestStart = scenario.incomeSources.length > 0
    ? Math.min(...scenario.incomeSources.map(i => i.startAge || 999))
    : null;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>💵 Income Sources</h2>
        <button className="btn btn-sm" onClick={() => store.addIncome(scenario.id, {
          name: 'New Income', type: 'part_time', annualAmount: 0, startAge: scenario.assumptions.currentAge, endAge: scenario.assumptions.retirementAge - 1, cola: true, taxable: true,
        })}>+ Add Income</button>
      </div>
      <p className="section-help">
        Add <strong>any income source</strong> — pre-retirement (salary, side hustle, rental) or post-retirement (Social Security, pension, part-time).
        Set the <strong>Start Age</strong> and <strong>End Age</strong> to control when each income source is active.
        Check <strong>Inflation Adjusted</strong> if the income rises with cost-of-living. Check <strong>Taxable</strong> if it's taxed as ordinary income.
      </p>
      <div className="summary-strip">
        <div className="summary-strip-item">
          <span className="label">Total Monthly Income</span>
          <span className="value">{formatCurrency(totalMonthly, { compact: true })}<span className="muted" style={{ fontSize: 12 }}> /mo</span></span>
        </div>
        <div className="summary-strip-item">
          <span className="label">Income Sources</span>
          <span className="value">{scenario.incomeSources.length}</span>
        </div>
        {earliestStart !== null && (
          <div className="summary-strip-item">
            <span className="label">Earliest Starts</span>
            <span className="value">Age {earliestStart}</span>
          </div>
        )}
        {ssCount > 0 && (
          <div className="summary-strip-item">
            <span className="label">Social Security</span>
            <span className="value">{ssCount} {ssCount === 1 ? 'source' : 'sources'}</span>
          </div>
        )}
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 28 }}></th>
            <th>Name</th>
            <th>Type</th>
            <th className="text-right">Monthly</th>
            <th className="text-right" title="Age when this income source begins">Start Age</th>
            <th className="text-right" title="Age when this income source ends (leave 0 for lifetime)">End Age</th>
            <th className="checkbox-cell" title="Income rises with inflation (e.g., Social Security)">Inflation Adjusted</th>
            <th className="checkbox-cell" title="Taxed as ordinary income">Taxable</th>
            <th className="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          {scenario.incomeSources.map((inc, idx) => (
            <tr
              key={inc.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              className={`${dragIndex.current === idx ? 'dragging' : ''} ${dragOverIndex === idx && dragIndex.current !== null ? 'drag-over' : ''}`}
            >
              <td className="drag-handle" title="Drag to reorder">⋮⋮</td>
              <td className="col-name"><input className="table-input" value={inc.name} onChange={(e) => store.updateIncome(scenario.id, inc.id, { name: e.target.value })} /></td>
              <td className="col-type">
                <select className="table-select" value={inc.type} onChange={(e) => store.updateIncome(scenario.id, inc.id, { type: e.target.value as IncomeType })}>
                  {INCOME_TYPES.map((t) => <option key={t} value={t}>{prettify(t)}</option>)}
                </select>
              </td>
              <td><CurrencyCellInput value={Math.round(inc.annualAmount / 12)} onChange={(v) => store.updateIncome(scenario.id, inc.id, { annualAmount: v * 12 })} /></td>
              <td><NumCellInput value={inc.startAge} onChange={(v) => store.updateIncome(scenario.id, inc.id, { startAge: v })} /></td>
              <td>
                {inc.endAge === null ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <label className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={true}
                        onChange={(e) => store.updateIncome(scenario.id, inc.id, { endAge: e.target.checked ? null : inc.startAge })}
                        style={{ marginRight: 4 }}
                      />
                      Lifetime
                    </label>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <NumCellInput value={inc.endAge ?? 0} onChange={(v) => store.updateIncome(scenario.id, inc.id, { endAge: v || null })} />
                  </div>
                )}
              </td>
              <td className="checkbox-cell"><input type="checkbox" checked={inc.cola} onChange={(e) => store.updateIncome(scenario.id, inc.id, { cola: e.target.checked })} /></td>
              <td className="checkbox-cell"><input type="checkbox" checked={inc.taxable} onChange={(e) => store.updateIncome(scenario.id, inc.id, { taxable: e.target.checked })} /></td>
              <td className="col-actions">
                <ConfirmDelete title="Delete income source" onConfirm={() => store.deleteIncome(scenario.id, inc.id)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
      <YearTable result={result} retirementAge={scenario.assumptions.retirementAge} />
    </div>
  );
}

function YearTable({ result, retirementAge }: { result: NonNullable<ReturnType<typeof runProjection>>; retirementAge: number }) {
  const [showAll, setShowAll] = useState(false);
  const data = showAll ? result.years : result.years.filter((y) => y.age >= retirementAge - 2 && y.age <= retirementAge + 15);

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
              <tr key={y.age} style={y.depleted ? { color: 'var(--red)' } : {}}>
                <td>{y.age}</td>
                <td className="text-right">{formatCurrency(y.beginningAssets, { compact: true })}</td>
                <td className="text-right">{y.contributions > 0 ? formatCurrency(y.contributions, { compact: true }) : '—'}</td>
                <td className="text-right" style={{ color: 'var(--green)' }}>{y.growth > 0 ? '+' + formatCurrency(y.growth, { compact: true }) : '—'}</td>
                <td className="text-right">{y.income > 0 ? formatCurrency(y.income, { compact: true }) : '—'}</td>
                <td className="text-right" style={{ color: y.withdrawals > 0 ? 'var(--red)' : undefined }}>{y.withdrawals > 0 ? '-' + formatCurrency(y.withdrawals, { compact: true }) : '—'}</td>
                <td className="text-right">{y.expenses > 0 ? formatCurrency(y.expenses, { compact: true }) : '—'}</td>
                <td className="text-right" style={{ fontWeight: 600 }}>{formatCurrency(y.endingAssets, { compact: true })}</td>
                <td className="text-right muted">{formatCurrency(y.realAssets, { compact: true })}</td>
              </tr>
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