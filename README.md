# 💼 retirementMe-Off

A privacy-first retirement planning web app. All data stays in your browser — no servers, no accounts, no tracking.

## Features

- **Year-by-year projection** from current age through end-of-life
- **Multi-scenario planning** with side-by-side comparison charts
- **Multi-account support**: 401(k), Roth IRA, traditional IRA, taxable brokerage, HSA, checking/savings, pensions
  - Accounts grouped by type (Cash & Liquid, Taxable Investments, Tax-Advantaged, Other)
  - Visual allocation bar showing balance distribution
  - Tax treatment badges (Tax-Free, Tax-Deferred, Taxable)
  - Per-group add buttons and savings insights
- **Homes & Property**: track real estate with full mortgage modeling
  - Current market value, mortgage balance, payment, and years remaining
  - Property tax and insurance automatically included in retirement expenses
  - Future purchase planning with amortization-based mortgage calculations
  - Future sale modeling with auto-populated net proceeds from equity
  - Plan action selector: Keep, Sell, Sell & Buy, or Undecided
  - Zillow lookup links for quick value reference
  - Retirement impact summary with equity, housing costs, and cash flow
- **Tax-aware withdrawals**: pulls from taxable → tax-deferred → tax-free (Roth) in optimal order
- **Inflation & COLA**: all expenses and income adjust for inflation; Social Security COLA modeled separately
- **Income sources (pre- and post-retirement)**: salary, self-employment, Social Security, pensions, part-time, rentals, annuities, dividends, and more
  - Card-based layout grouped by phase (Pre-Retirement / Retirement)
  - Toggle flags for COLA and taxable status
  - Compact timing summaries ("Age 62 → lifetime")
- **Expenses**: card-based layout with category grouping
  - Quick Add: 20 common expense templates based on BLS national averages
  - Retirement transition badges (Continues, Ends at retirement, Starts in retirement)
  - Toggle flags for Before/After retirement
- **Spouse planning**: extend the projection to cover the longer-lived partner's lifespan
- **Life events**: model buying a house, windfalls, large purchases with one-time and ongoing impacts
- **Overview panel**: wellness gauge, data completeness checklist, and mini net worth chart
  - Partial scoring for account balance and expense category coverage
- **Charts**: net worth over time (nominal + real dollars), retirement cash flow, multi-scenario comparison
- **Expandable Year-by-Year table**: click any year to see detailed income and expense breakdowns
- **4 themes**: light, dark, sepia, and Nord
- **Inline delete confirmations**: no intrusive browser popups
- **Dismissible contextual warnings**: smart guidance for risky assumptions
- **Persistence**: auto-saves to localStorage; remembers your active tab and section
- **Export/import**: JSON backup and Obsidian-friendly Markdown export

## Quick Start

```bash
npm install
npm run dev
```

Open the URL shown in terminal (typically `http://localhost:5173`).

## Usage

### 1. Inputs Tab

**Overview** — At-a-glance summary of your plan: current net worth, projected retirement assets, savings rate, and plan outcome. Includes a data completeness wellness gauge and checklist with partial scoring.

**Assumptions** — Set your current age, retirement age, end age, inflation rate, tax rate, safe withdrawal rate, and expected returns. A compact summary banner shows your scenario at a glance. Enable spouse planning to model a joint retirement. Contextual warnings alert you to risky values (e.g., withdrawal rate above 4%).

**Income Sources** — Add any income source (salary, self-employment, Social Security, pensions, part-time, rentals, annuities, dividends). Card-based layout grouped by retirement phase. Set start/end ages with lifetime toggle. Toggle COLA and taxable status with flag buttons.

**Accounts & Savings** — Add accounts grouped by type (Cash, Taxable, Tax-Advantaged, Other). Each account card shows balance, return rate, contribution, and employer match (401k only). Visual allocation bar shows distribution. Per-group add buttons for quick entry.

**Homes & Property** — Track properties with current value, mortgage details (balance, payment, years remaining), and annual costs (tax, insurance). Choose a plan: Keep, Sell, Sell & Buy, or Undecided. Future purchases compute mortgage payments via standard amortization. Zillow lookup links for easy value reference. Retirement impact summary shows equity, housing costs, and cash flow implications.

**Expenses** — Card-based layout grouped by category. Quick Add section with 20 common expense templates based on BLS national averages. Toggle Before/After retirement with flag buttons. Retirement transition badges show whether each expense continues, ends, or starts at retirement.

**Life Events** — Model one-time events like buying a house (cost = down payment, ongoing impact = new mortgage). Set the age it occurs and any recurring financial impact.

### 2. Results & Charts Tab

- **Summary cards** show nest egg at retirement, sustainability, withdrawal rate, and final assets
- **Net Worth chart** displays nominal and inflation-adjusted (today's dollars) trajectories
- **Cash Flow chart** breaks down income, withdrawals, and expenses during retirement
- **Year-by-Year table** — click any year row to expand and see detailed income source and expense line items

### 3. Compare Scenarios Tab

- Duplicate scenarios to explore "what-if" situations
- Compare net worth trajectories overlaid on a single chart
- Example: "Baseline" vs. "Buy House at 55" vs. "Delay Retirement to 67"

### Export

- **Export JSON** — Full data backup; re-import via the Import button
- **Export Markdown** — Human-readable summary with tables, perfect for Obsidian or Notion

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** (build tool)
- **Zustand** (state management with localStorage persistence)
- **Recharts** (charting)
- **Vitest** (unit tests)

## Testing

```bash
npm test
```

The financial engine (`src/engine.ts`) has unit tests covering growth, contributions, withdrawals, tax grossing, depletion detection, life events, inflation, and dual pre/post-retirement expense checking.

## Privacy

**100% local.** Your financial data never leaves your browser. The app uses localStorage for persistence — clear your browser data or click "Reset" to wipe everything.

## Repository

[github.com/bronder/retirementMe-Off](https://github.com/bronder/retirementMe-Off)

## License

MIT