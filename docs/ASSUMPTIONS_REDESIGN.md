# Assumptions Page — UX Critique & Redesign

## 1. UX Critique (Before)

| Issue | Impact |
|-------|--------|
| **Flat visual hierarchy** — all fields looked the same weight/style | Critical fields (retirement age, withdrawal rate) didn't stand out; user had to read every label to find what matters |
| **No summary of the plan** | User couldn't see the "big picture" (retire at 65, plan to 95, 4% withdrawal) without scanning all inputs |
| **Helper text competed with labels** | Same color/weight as labels; created visual noise |
| **No contextual guidance for risky values** | A 7% withdrawal rate or post-retirement return higher than pre-retirement would silently produce unrealistic projections |
| **"Fallback" behavior unclear** | Users didn't understand that per-account rates override the assumption-level rates |
| **Validation was binary** | Only showed "age must be before retirement age" — no guidance on *why* a value might be risky even if technically valid |
| **Generic settings-form feel** | Didn't convey "this is a financial planning tool making important projections" |

---

## 2. Proposed Improved Layout

```
┌─────────────────────────────────────────────────────────┐
│  ⚙️ Assumptions — [Scenario Name]     [Duplicate] [Delete]│
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐ │
│  │ 📋 Plan Summary:                                    │ │
│  │ Retire at [65] · through [95] · [3%] inflation ·    │ │
│  │ [4%] withdrawal · 22 yrs to save · 30 yrs retired   │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ ⚠️ Contextual Warning (if triggered)                │ │
│  │ Post-retirement return is higher than pre-ret...    │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                         │
│  🗓️ Timeline                                            │
│  Define your retirement window...                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Current  │  │ Retire*  │  │ End Age* │              │
│  │ Age      │  │ [65]     │  │ [95]     │              │
│  │ [42]     │  │          │  │          │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│  (* = high-impact field with elevated styling)          │
│                                                         │
│  📊 Inflation & Tax                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Inflation│  │ SS COLA  │  │ Tax Rate │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│                                                         │
│  📈 Investment Returns & Withdrawals                    │
│  These rates are FALLBACKS — per-account rates override │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Withdraw*│  │ Pre-Ret* │  │ Post-Ret*│              │
│  │ [4%]     │  │ [7%]     │  │ [5%]     │              │
│  └──────────┘  └──────────┘  └──────────┘              │
└─────────────────────────────────────────────────────────┘
```

**Layout principles:**
- Summary banner **above** all inputs — sets context before any interaction
- Warnings appear **between summary and fields** — read first, then adjust
- High-impact fields visually distinct (elevated card, bold text, focus glow)
- Helper text **below** inputs, muted to `--text-faint`
- Sections separated by titled dividers with icons

---

## 3. Updated Labels & Helper Text

| Field | Old Label | New Label | Helper Text |
|-------|-----------|-----------|-------------|
| Retirement Age | "Retirement Age" | "Retirement Age" *(high-impact)* | "When you stop working and start withdrawals. You have **22 years** left to save." *(dynamic)* |
| Plan End Age | "Plan End Age" | "Plan End Age" *(high-impact)* | "How long the plan must last. This covers **30 years** of retirement." *(dynamic)* |
| Safe Withdrawal Rate | "Safe Withdrawal Rate" | "Safe Withdrawal Rate" *(high-impact)* | "Annual withdrawal as a percentage of savings. The '4% rule' is a common starting point; 3.5% is more conservative." |
| Pre-Retirement Return | "Pre-Retirement Return (fallback)" | "Pre-Retirement Return" *(high-impact)* | "Fallback annual return while saving. A growth-oriented portfolio (mostly stocks) historically averages 7–10%." |
| Post-Retirement Return | "Post-Retirement Return (fallback)" | "Post-Retirement Return" *(high-impact)* | "Fallback annual return after retiring. Usually lower (more bonds/cash) to reduce volatility. 4–6% is common." |
| Inflation Rate | "Inflation Rate" | "Inflation Rate" | "Annual rise in cost of living. All expenses and income (with COLA) grow at this rate. Historical US average ≈ 3%." |
| SS COLA | "Social Security COLA" | "Social Security COLA" | "Annual increase for Social Security benefits. Typically tracks inflation. Use 2.5–3% for a reasonable estimate." |
| Retirement Tax Rate | "Retirement Tax Rate" | "Retirement Tax Rate" | "Effective tax rate on taxable withdrawals (traditional 401k/IRA, pensions). Roth withdrawals are tax-free. 10–20% is typical." |

---

## 4. Contextual Warning Rules

| Trigger | Warning Message |
|---------|----------------|
| `currentAge >= retirementAge` | "Retirement age must be **after** your current age. Currently, retirement is set to {X} but you are already {Y}." |
| `retirementAge >= endAge` | "Plan end age must be **after** retirement age. Currently both are set to {X}–{Y}." |
| `postRetirementReturn > preRetirementReturn` | "Post-retirement return ({X}%) is **higher** than pre-retirement ({Y}%). This is unusual — retirees typically shift to a more conservative portfolio. Consider lowering it unless you have a specific reason." |
| `safeWithdrawalRate > 5%` | "A withdrawal rate of **{X}%** is above the commonly recommended 4%. Higher rates increase the risk of running out of money, especially in early retirement." |
| `safeWithdrawalRate < 2.5%` | "A withdrawal rate of **{X}%** is quite conservative. You may be able to spend more — but a lower rate provides greater safety margin." |

---

## 5. Component-Level Changes

### CSS (`styles.css`)
- `.plan-summary-banner` — accent-dim background, accent border, pill-style values
- `.context-warning` — yellow-dim background, left-border accent, icon + body layout
- `.field-high-impact .input-wrapper` — panel background, border-strong, shadow-sm
- `.field-high-impact .input-wrapper:focus-within` — accent border + accent-dim glow
- `.field-high-impact input` — text-lg size, bold weight
- `.form-group-enhanced .help-text` — text-faint color (restrained)

### React (`App.tsx`)
- `FieldGroup` — added `highImpact` prop; conditionally applies `.field-high-impact` class
- `ContextWarning` — new component rendering `.context-warning` with icon + children
- `AssumptionsPanel` — comprehensive rewrite:
  - Computes `warnings[]` array from validation rules
  - Renders `<PlanSummaryBanner>` with dynamic year calculations
  - Renders `<ContextWarning>` for each triggered warning
  - Passes `highImpact` to five critical fields
  - Dynamic helper text (years to save, years in retirement)

---

## 6. Design Constraints Honored

- ✅ App shell unchanged (header, scenario selector, tabs, sidebar)
- ✅ No neon/glassmorphism/flashy effects
- ✅ Uses existing design tokens (`--accent`, `--yellow-dim`, `--text-faint`, etc.)
- ✅ Desktop-friendly (wide banner, horizontal 3-column field rows)
- ✅ Calm, editorial, trustworthy tone
- ✅ Interaction model unchanged (inputs still update store via same handlers)