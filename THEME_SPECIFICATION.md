# Theme Specification — Premium Finance Dashboard

## Design Philosophy

A **calm, editorial, trustworthy** aesthetic inspired by premium personal finance dashboards (Monarch Money, Copilot, Wealthfront). The design avoids flashy gradients, glassmorphism, and neon colors in favor of warm-white surfaces, subtle borders, soft shadows, and restrained accent usage.

**Core principles:**
- **Light-first**: Warm off-white background, clean white panels
- **Orange as primary action color**: Used sparingly on CTAs, active states, and key emphasis — never decoratively
- **Teal for data**: Charts and data visualization use a soft teal palette
- **Neutral elsewhere**: Most UI is neutral; color carries semantic meaning
- **Editorial typography**: Inter typeface, strong hierarchy, comfortable reading

---

## Color System

### Surfaces
| Token | Light Value | Dark Value | Usage |
|-------|------------|------------|-------|
| `--bg` | `#f7f6f3` | `#1a1816` | Page background — warm off-white |
| `--bg-subtle` | `#f1efe9` | `#221f1c` | Card recess, hover backgrounds |
| `--panel` | `#ffffff` | `#262320` | Primary card surface |
| `--panel-light` | `#f6f5f2` | `#2e2b27` | Secondary surface (event cards) |
| `--panel-hover` | `#f1efe9` | `#36322d` | Interactive hover state |

### Borders
| Token | Light Value | Usage |
|-------|------------|-------|
| `--border` | `#e6e2da` | Subtle warm borders — table rows, card edges |
| `--border-strong` | `#d8d3c8` | Emphasized borders — hover states |

### Text
| Token | Light Value | Usage |
|-------|------------|-------|
| `--text` | `#1c1b19` | Primary text — near-black, warm |
| `--text-dim` | `#6e6a60` | Secondary text — labels, descriptions |
| `--text-faint` | `#a8a294` | Tertiary — drag handles, disabled |

### Primary Action (Orange)
Used **sparly** — only for primary CTAs, active navigation, and focused inputs.

| Token | Light Value | Usage |
|-------|------------|-------|
| `--accent` | `#e8590c` | Primary buttons, active tabs, focus rings |
| `--accent-hover` | `#d9480f` | Button hover state |
| `--accent-dim` | `#fff4ed` | Pale tint — active nav backgrounds, focus glows |
| `--accent-text` | `#ffffff` | Text on orange backgrounds |

### Chart / Data Palette (Teal-First)
| Token | Light Value | Usage |
|-------|------------|-------|
| `--chart` | `#0d9488` | Primary data series (teal) |
| `--chart-2` | `#0e7490` | Secondary series (cyan-blue) |
| `--chart-3` | `#7c3aed` | Tertiary series (purple) |
| `--chart-4` | `#ca8a04` | Quaternary series (gold) |

### Semantic Colors
| Token | Light Value | Usage |
|-------|------------|-------|
| `--green` | `#15803d` | Positive metrics, sustainable indicators |
| `--green-dim` | `#f0fdf4` | Green tint backgrounds |
| `--red` | `#dc2626` | Negative metrics, depletion warnings |
| `--red-dim` | `#fef2f2` | Red tint backgrounds |
| `--yellow` | `#b45309` | Warnings, caution states |
| `--yellow-dim` | `#fffbeb` | Yellow tint backgrounds |
| `--purple` | `#7c3aed` | Category markers |
| `--gold` | `#ca8a04` | Highlight accents |

---

## Typography Scale

| Token | Size | Usage |
|-------|------|-------|
| `--text-xs` | 11px | Labels, captions, hints |
| `--text-sm` | 13px | Table cells, form inputs, secondary text |
| `--text-base` | 14px | Body text, default |
| `--text-lg` | 16px | Panel headers, card values |
| `--text-xl` | 20px | Summary card values |
| `--text-2xl` | 24px | App title |

**Font families:**
- `--font-sans`: Inter (primary), system fallbacks
- `--font-mono`: JetBrains Mono (numbers if needed)

---

## Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Small inputs, table cells |
| `--radius` | 10px | Buttons, summary strips |
| `--radius-lg` | 14px | Cards, panels, event cards |

---

## Shadow System

Soft, layered shadows — never harsh or heavy.

| Token | Usage |
|-------|-------|
| `--shadow-sm` | Subtle elevation — scenario tabs, small buttons |
| `--shadow` | Default cards and panels |
| `--shadow-md` | Hover lifts, emphasized cards |
| `--shadow-lg` | Dropdowns, overlays, menus |

---

## Spacing

Uses consistent multiples:
- **4px** — tight gaps within components
- **8px** — standard form spacing
- **12px** — form rows, table padding
- **16px** — panel section spacing
- **18-22px** — card padding
- **24px** — major section spacing

---

## Component Styles

### Cards / Panels
- White surface (`--panel`)
- 1px subtle border
- 14px radius
- Soft shadow (`--shadow`)
- 22px padding

### Buttons
- **Primary**: Orange background, white text, 10px radius — used for main CTAs
- **Secondary**: Panel background, border, subtle shadow — used for menu/utility actions
- **Danger**: Red text, red hover background

### Tables
- Uppercase, tracked-out column headers (`--text-xs`, `--text-dim`)
- Zebra striping on alternating rows
- Hover highlight on rows
- Transparent table inputs that show border on hover/focus

### Form Inputs
- Warm-gray background (`--bg-subtle`)
- Subtle border, accent focus ring (orange glow)
- Unit suffixes (`%`, `$`, `yrs`) shown inline

### Badges / Pills
- Rounded pill shape (20px radius)
- Semantic colors with tinted backgrounds
- Used for status indicators and category markers

### Tabs
- Underline-style tabs with orange active indicator
- Muted text in inactive state, full color when active

### Charts
- White card containers with subtle border
- Teal primary series, cyan-blue secondary
- Theme-aware grid lines and axis labels
- Soft fill opacity (10-15%) for area charts

---

## Theme Variants

1. **Light** (default) — Warm off-white, premium feel
2. **Dark** — Warm charcoal, not pure black; brighter orange for contrast
3. **Sepia** — Warm parchment tones for extended reading
4. **Nord** — Cool blue-gray palette (Nord color scheme)