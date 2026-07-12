# 💼 retirementMe-Off

A privacy-first retirement planning web app. All data stays in your browser — no servers, no accounts, no tracking.

## Features

- **Year-by-year projection** from current age through end-of-life
- **Multi-scenario planning** with side-by-side comparison charts
- **Multi-account support**: 401(k), Roth IRA, traditional IRA, taxable brokerage, HSA, checking/savings, pensions
- **Tax-aware withdrawals**: pulls from taxable → tax-deferred → tax-free (Roth) in optimal order
- **Inflation & COLA**: all expenses and income adjust for inflation; Social Security COLA modeled separately
- **Income sources (pre- and post-retirement)**: salary, self-employment, Social Security, pensions, part-time, rentals, annuities, dividends, and more
- **Spouse planning**: extend the projection to cover the longer-lived partner's lifespan
- **Life events**: model buying a house, windfalls, large purchases with one-time and ongoing impacts
- **Charts**: net worth over time (nominal + real dollars), retirement cash flow, multi-scenario comparison
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

**Assumptions** — Set your current age, retirement age, end age, inflation rate, tax rate, safe withdrawal rate, and expected returns. Enable spouse planning to model a joint retirement. Contextual warnings alert you to risky values (e.g., withdrawal rate above 4%).

**Accounts & Savings** — Add all your accounts with current balances, expected annual returns, annual contributions (yearly figures), and employer match.

**Expenses** — Enter monthly amounts for each category. Mark whether each applies pre-retirement, post-retirement, or both. These auto-inflate over time.

**Income Sources** — Add any income source (salary, self-employment, Social Security, pensions, part-time, rentals, annuities, dividends). Set start/end ages to control when each is active. Check COLA for inflation-adjusted income.

**Life Events** — Model one-time events like buying a house (cost = down payment, ongoing impact = new mortgage). Set the age it occurs and any recurring financial impact.

### 2. Results & Charts Tab

- **Summary cards** show nest egg at retirement, sustainability, withdrawal rate, and final assets
- **Net Worth chart** displays nominal and inflation-adjusted (today's dollars) trajectories
- **Cash Flow chart** breaks down income, withdrawals, and expenses during retirement
- **Year-by-Year table** with toggle for full detail vs. summary view

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

The financial engine (`src/engine.ts`) has 9 unit tests covering growth, contributions, withdrawals, tax grossing, depletion detection, life events, inflation, and dual pre/post-retirement expense checking.

## Privacy

**100% local.** Your financial data never leaves your browser. The app uses localStorage for persistence — clear your browser data or click "Reset" to wipe everything.

## Repository

[github.com/bronder/retirementMe-Off](https://github.com/bronder/retirementMe-Off)

## License

MIT