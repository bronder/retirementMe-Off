/** Shared UI atoms + static data used by panels across the app.
 *  Extracted from App.tsx so lazily-loaded panels (Overview, Results,
 *  Compare) can import them without dragging App.tsx into their chunks. */
import {
  Landmark, CalendarClock, CircleDollarSign, Table2, Calculator, TrendingUp,
  CreditCard, ClipboardList, Clock, Users, Receipt, FileText, Building2,
  BadgeDollarSign, HeartPulse, Pill, BookOpen, GraduationCap, Scale, Lock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Renders a Lucide icon component by reference. Used wherever an icon is stored
 *  in a data structure (CATEGORY_ICONS, COMMON_EXPENSES, etc.) so the render
 *  site stays a one-liner: `<Icon i={row.icon} />` instead of a lookup +
 *  conditional render. Inherits color from its parent via lucide's currentColor. */
export function Glyph({ i, size = 16 }: { i: LucideIcon; size?: number }) {
  const I = i;
  return <I size={size} aria-hidden="true" />;
}

/** Curated external resources (calculators, SSA, IRS, Medicare, investing).
 *  Shown in a collapsible footer so they're accessible without cluttering the
 *  data-entry sidebar on every Inputs screen. */
export const RESOURCE_GROUPS: { label: string; links: { icon: LucideIcon; name: string; url: string }[] }[] = [
  {
    label: 'Calculators',
    links: [
      { icon: Landmark, name: 'SSA Retirement Estimator', url: 'https://www.ssa.gov/benefits/retirement/estimator.html' },
      { icon: CalendarClock, name: 'SSA Benefit Calculator', url: 'https://www.ssa.gov/OACT/quickcalc/' },
      { icon: CircleDollarSign, name: 'Fidelity Retirement Score', url: 'https://www.fidelity.com/calculators-tools/retirement-score' },
      { icon: Table2, name: 'Vanguard Retirement Nest Egg', url: 'https://retirementplans.vanguard.com/VGApp/pe/pubeducation/calculators/RetirementNestEggCalc.jsf' },
      { icon: Calculator, name: 'AARP Retirement Calculator', url: 'https://www.aarp.org/work/retirement-calculator/' },
      { icon: TrendingUp, name: 'Bankrate 401k Calculator', url: 'https://www.bankrate.com/retirement/401-k-calculator/' },
    ],
  },
  {
    label: 'Social Security',
    links: [
      { icon: CreditCard, name: 'my Social Security Account', url: 'https://www.ssa.gov/myaccount/' },
      { icon: ClipboardList, name: 'SSA Benefit Formulas', url: 'https://www.ssa.gov/oact/cola/Benefits.html' },
      { icon: Clock, name: 'SS Claiming Age Guide', url: 'https://www.ssa.gov/benefits/retirement/planner/agereduction.html' },
      { icon: Users, name: 'Spousal Benefits', url: 'https://www.ssa.gov/oact/quickcalc/spouse.html' },
    ],
  },
  {
    label: 'Taxes',
    links: [
      { icon: Receipt, name: 'IRS Tax Bracket Calculator', url: 'https://www.irs.gov/help/ita/whats-my-tax-bracket' },
      { icon: FileText, name: 'IRS Pub 590-B (IRA Withdrawals)', url: 'https://www.irs.gov/publications/p590b' },
      { icon: Building2, name: 'IRS Pub 560 (401k Limits)', url: 'https://www.irs.gov/publications/p560' },
      { icon: BadgeDollarSign, name: 'RMD Calculator (IRS)', url: 'https://www.irs.gov/retirement-plans/required-minimum-distribution-calculators' },
    ],
  },
  {
    label: 'Medicare & Healthcare',
    links: [
      { icon: HeartPulse, name: 'Medicare.gov Official Site', url: 'https://www.medicare.gov/' },
      { icon: HeartPulse, name: 'Medicare Eligibility Tool', url: 'https://www.medicare.gov/eligibilitypremiumcalc/' },
      { icon: Pill, name: 'Plan Finder (Drug Coverage)', url: 'https://www.medicare.gov/plan-compare/' },
      { icon: BookOpen, name: 'Medicare & You Handbook', url: 'https://www.medicare.gov/medicare-and-you' },
    ],
  },
  {
    label: 'Investing & Education',
    links: [
      { icon: GraduationCap, name: 'Investor.gov (SEC)', url: 'https://www.investor.gov/' },
      { icon: BookOpen, name: 'Compound Interest Calc', url: 'https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator' },
      { icon: Scale, name: 'FINRA Broker Check', url: 'https://brokercheck.finra.org/' },
      { icon: Lock, name: 'SIPC Protection Info', url: 'https://www.sipc.org/for-investors/what-sipc-protects' },
    ],
  },
];

/** Panel-footer resource list. Each Inputs panel passes ONLY the links relevant
 *  to that panel's data (e.g. SSA links on Income, tax links on Assumptions).
 *  Collapsed by default so it adds one line of height until the user expands
 *  it. Reuses the shared .resource-link styling.
 */
export function ContextualResources({ group }: { group: { label: string; links: { icon: LucideIcon; name: string; url: string }[] } }) {
  return (
    <details className="contextual-resources">
      <summary><BookOpen size={15} aria-hidden="true" /> {group.label} resources</summary>
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
            <span className="resource-icon" aria-hidden="true"><Glyph i={link.icon} /></span>
            <span className="resource-name">{link.name}</span>
            <span className="resource-ext" aria-hidden="true">↗</span>
          </a>
        ))}
      </div>
    </details>
  );
}
