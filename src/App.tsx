import { useState, useMemo, useRef, useEffect, Component, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import {
  LayoutDashboard,
  Settings,
  Wallet,
  Landmark,
  Home,
  ListChecks,
  CalendarDays,
  ClipboardList,
  TrendingUp,
  Table2,
  Menu,
  Upload,
  FileJson,
  FileText,
  Wand2,
  Sparkles,
  BookOpen,
  Users,
  Percent,
  Zap,
  CalendarClock,
  Trash2,
  // Category / content-marker icons
  Utensils,
  Car,
  CarFront,
  HeartPulse,
  ShieldCheck,
  Lightbulb,
  Clapperboard,
  Plane,
  CreditCard,
  Receipt,
  Package,
  Shirt,
  Pizza,
  Gift,
  Pill,
  House,
  Hammer,
  SprayCan,
  Smartphone,
  Tv,
  PawPrint,
  // Quick-add chip icons (specific expense items)
  Flame,
  Droplets,
  Fuel,
  Film,
  Music,
  Gamepad2,
  Bus,
  Coffee,
  Wine,
  Salad,
  Ticket,
  Cookie,
  ShoppingCart,
  Wrench,
  ParkingSquare,
  CarTaxiFront,
  Wifi,
  Recycle,
  Banknote,
  PiggyBank,
  Building2,
  Sprout,
  Coins,
  Briefcase,
  // Quick-add chip icons: remaining categories
  Flower2,
  Dumbbell,
  Stethoscope,
  Baby,
  Ship,
  Camera,
  Heart,
  HandHeart,
  HandCoins,
  ReceiptText,
  Building,
  Bed,
  Lamp,
  Trophy,
  Tent,
  Link2,
  Info,
  Clock,
  CircleDollarSign,
  Lock,
  Palmtree,
  TreePine,
  ArrowLeftRight,
  GraduationCap,
  HelpCircle,
  KeyRound,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import { usePlanStore, ASSUMPTION_BOUNDS, flushDebouncedStorage } from './store';
import { getReadinessSummary, computeAnnualMortgage } from './engine';
import { projectScenario } from './projectionCache';
import { Glyph, RESOURCE_GROUPS, ContextualResources } from './ui/shared';
import { ACCOUNT_TAX_TREATMENT } from './types';
import type { AccountType, IncomeType, ExpenseCategory, EventType, PropertyType, Property, LifeEvent } from './types';
import { formatCurrency, formatPercent, prettify } from './format';
import { exportMarkdown } from './markdown';
import { AiChat } from './AiChat';
import { defaultScenario } from './defaults';
import { AgeInput } from './inputs/AgeInput';
import { PctInputEnhanced } from './inputs/PctInputEnhanced';
import { FieldGroup } from './inputs/FieldGroup';
import { ContextWarning } from './inputs/ContextWarning';
import { useEditableNumber } from './hooks/useEditableNumber';
import { usePopoverPosition } from './hooks/usePopoverPosition';
import { ScenarioWizard } from './inputs/ScenarioWizard';

// Chart-bearing views load on demand. They pull recharts (the single largest
// dependency) into an async chunk, so the initial download only carries the
// data-entry UI.
const OverviewPanel = lazy(() => import('./panels/OverviewPanel').then((m) => ({ default: m.OverviewPanel })));
const ResultsView = lazy(() => import('./results/ResultsView').then((m) => ({ default: m.ResultsView })));
const CompareView = lazy(() => import('./results/CompareView').then((m) => ({ default: m.CompareView })));

/** Loading shell for the lazily-loaded tab views. */
function TabFallback() {
  return <div className="panel muted" style={{ padding: 24 }}>Loading…</div>;
}

type Tab = 'inputs' | 'results' | 'compare';
type InputSection = 'overview' | 'assumptions' | 'accounts' | 'properties' | 'expenses' | 'income' | 'events';
type Theme = 'dark' | 'light' | 'sepia' | 'nord' | 'warm-gray' | 'dracula';

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

const COMMON_EXPENSES: { name: string; icon: LucideIcon; category: ExpenseCategory; annualAmount: number; preRetirement: boolean; postRetirement: boolean; startAge: number | null; endAge: number | null }[] = [
  // Based on BLS Consumer Expenditure Survey national averages (sorted alphabetically)
  { name: 'Clothing & Apparel', icon: Shirt, category: 'other', annualAmount: 1833, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Dining Out', icon: Pizza, category: 'food', annualAmount: 3639, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Entertainment', icon: Clapperboard, category: 'entertainment', annualAmount: 3458, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Food & Groceries', icon: Utensils, category: 'food', annualAmount: 9985, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Gifts & Donations', icon: Gift, category: 'other', annualAmount: 2551, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Healthcare (Medicare)', icon: Pill, category: 'healthcare', annualAmount: 4392, preRetirement: false, postRetirement: true, startAge: 65, endAge: null },
  { name: 'Healthcare (pre-Medicare)', icon: HeartPulse, category: 'healthcare', annualAmount: 6194, preRetirement: true, postRetirement: true, startAge: null, endAge: 64 },
  { name: 'Home Insurance', icon: House, category: 'insurance', annualAmount: 1716, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Home Maintenance & Repairs', icon: Hammer, category: 'housing', annualAmount: 2208, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Life Insurance', icon: ClipboardList, category: 'insurance', annualAmount: 680, preRetirement: true, postRetirement: false, startAge: null, endAge: null },
  { name: 'Miscellaneous', icon: Package, category: 'other', annualAmount: 1820, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Mortgage / Rent', icon: Home, category: 'housing', annualAmount: 22032, preRetirement: true, postRetirement: false, startAge: null, endAge: null },
  { name: 'Personal Care', icon: SprayCan, category: 'other', annualAmount: 1010, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Pet Expenses', icon: PawPrint, category: 'other', annualAmount: 1464, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Phone & Internet', icon: Smartphone, category: 'utilities', annualAmount: 1680, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Subscriptions (streaming, etc.)', icon: Tv, category: 'entertainment', annualAmount: 1272, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Travel & Vacations', icon: Plane, category: 'travel', annualAmount: 4500, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Utilities (gas, electric, water)', icon: Lightbulb, category: 'utilities', annualAmount: 4725, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Vehicle Insurance', icon: ShieldCheck, category: 'insurance', annualAmount: 1905, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Vehicle Payment & Gas', icon: CarFront, category: 'transportation', annualAmount: 12285, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
];

/** Specific, named quick-add items shown as collapsible chips inside each
 *  expense category group. Kept SEPARATE from COMMON_EXPENSES so the "+ Add"
 *  dropdown stays short and clean — these live only in the in-group chip row.
 *  Amounts are rough US averages in today's dollars (annual). */
const QUICK_ADD_EXPENSES: { name: string; icon: LucideIcon; category: ExpenseCategory; annualAmount: number; preRetirement: boolean; postRetirement: boolean; startAge: number | null; endAge: number | null }[] = [
  // --- Entertainment ---
  { name: 'Netflix', icon: Tv, category: 'entertainment', annualAmount: 204, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Amazon Prime', icon: Package, category: 'entertainment', annualAmount: 139, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Disney+', icon: Film, category: 'entertainment', annualAmount: 160, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Spotify', icon: Music, category: 'entertainment', annualAmount: 132, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'YouTube Premium', icon: Tv, category: 'entertainment', annualAmount: 144, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Apple One / iCloud', icon: Music, category: 'entertainment', annualAmount: 149, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'AI Subscription', icon: Sparkles, category: 'entertainment', annualAmount: 240, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Movies & Theater', icon: Ticket, category: 'entertainment', annualAmount: 720, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Gaming', icon: Gamepad2, category: 'entertainment', annualAmount: 600, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Books & Kindle', icon: BookOpen, category: 'entertainment', annualAmount: 240, preRetirement: true, postRetirement: true, startAge: null, endAge: null },

  // --- Utilities ---
  { name: 'Cell Phone Plan', icon: Smartphone, category: 'utilities', annualAmount: 900, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Home Internet', icon: Wifi, category: 'utilities', annualAmount: 840, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Electricity', icon: Lightbulb, category: 'utilities', annualAmount: 1740, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Natural Gas', icon: Flame, category: 'utilities', annualAmount: 900, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Water & Sewer', icon: Droplets, category: 'utilities', annualAmount: 600, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Trash & Recycling', icon: Recycle, category: 'utilities', annualAmount: 360, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Streaming TV (YouTube TV)', icon: Tv, category: 'utilities', annualAmount: 816, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Home Security', icon: ShieldCheck, category: 'utilities', annualAmount: 600, preRetirement: true, postRetirement: true, startAge: null, endAge: null },

  // --- Food ---
  { name: 'Groceries', icon: ShoppingCart, category: 'food', annualAmount: 7800, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Dining Out', icon: Utensils, category: 'food', annualAmount: 3600, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Coffee', icon: Coffee, category: 'food', annualAmount: 780, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Alcohol', icon: Wine, category: 'food', annualAmount: 720, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Meal Kit Delivery', icon: Salad, category: 'food', annualAmount: 2400, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Snacks', icon: Cookie, category: 'food', annualAmount: 480, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Work / School Lunches', icon: Pizza, category: 'food', annualAmount: 1200, preRetirement: true, postRetirement: true, startAge: null, endAge: null },

  // --- Transportation ---
  { name: 'Auto Loan / Lease', icon: CreditCard, category: 'transportation', annualAmount: 5520, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Gasoline', icon: Fuel, category: 'transportation', annualAmount: 3000, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Auto Insurance', icon: ShieldCheck, category: 'transportation', annualAmount: 1905, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Registration & Fees', icon: Receipt, category: 'transportation', annualAmount: 220, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Maintenance & Tires', icon: Wrench, category: 'transportation', annualAmount: 900, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Rideshare / Taxi', icon: CarTaxiFront, category: 'transportation', annualAmount: 720, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Public Transit', icon: Bus, category: 'transportation', annualAmount: 600, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Parking & Tolls', icon: ParkingSquare, category: 'transportation', annualAmount: 480, preRetirement: true, postRetirement: true, startAge: null, endAge: null },

  // --- Housing (ongoing costs; mortgage/rent is usually on the Homes tab) ---
  { name: 'Rent', icon: Home, category: 'housing', annualAmount: 18000, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'HOA / Condo Fees', icon: Building, category: 'housing', annualAmount: 3600, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Home Maintenance', icon: Wrench, category: 'housing', annualAmount: 2208, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Lawn & Garden', icon: Flower2, category: 'housing', annualAmount: 720, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Pest Control', icon: Sprout, category: 'housing', annualAmount: 360, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Furniture & Decor', icon: Lamp, category: 'housing', annualAmount: 1200, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Appliance Repair', icon: Wrench, category: 'housing', annualAmount: 480, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Septic / Well Service', icon: Droplets, category: 'housing', annualAmount: 360, preRetirement: true, postRetirement: true, startAge: null, endAge: null },

  // --- Healthcare ---
  { name: 'Health Insurance Premium', icon: HeartPulse, category: 'healthcare', annualAmount: 3000, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Dental & Vision', icon: Stethoscope, category: 'healthcare', annualAmount: 900, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Prescriptions / Medications', icon: Pill, category: 'healthcare', annualAmount: 720, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Co-pays & Doctor Visits', icon: Stethoscope, category: 'healthcare', annualAmount: 600, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Gym / Fitness Membership', icon: Dumbbell, category: 'healthcare', annualAmount: 600, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Vision / Eyewear', icon: HeartPulse, category: 'healthcare', annualAmount: 360, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Hearing / Medical Devices', icon: Stethoscope, category: 'healthcare', annualAmount: 480, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Supplements & Vitamins', icon: Pill, category: 'healthcare', annualAmount: 360, preRetirement: true, postRetirement: true, startAge: null, endAge: null },

  // --- Insurance ---
  { name: 'Homeowners Insurance', icon: House, category: 'insurance', annualAmount: 1716, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Auto Insurance', icon: ShieldCheck, category: 'insurance', annualAmount: 1905, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Life Insurance', icon: ClipboardList, category: 'insurance', annualAmount: 680, preRetirement: true, postRetirement: false, startAge: null, endAge: null },
  { name: 'Health Insurance', icon: HeartPulse, category: 'insurance', annualAmount: 3000, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Umbrella Liability', icon: ShieldCheck, category: 'insurance', annualAmount: 360, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Long-Term Care', icon: HandHeart, category: 'insurance', annualAmount: 2400, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Disability Insurance', icon: ShieldCheck, category: 'insurance', annualAmount: 600, preRetirement: true, postRetirement: false, startAge: null, endAge: null },
  { name: 'Valuables / Jewelry Rider', icon: Lock, category: 'insurance', annualAmount: 240, preRetirement: true, postRetirement: true, startAge: null, endAge: null },

  // --- Travel ---
  { name: 'Annual Vacation', icon: Plane, category: 'travel', annualAmount: 4500, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Weekend Trips', icon: CarFront, category: 'travel', annualAmount: 1800, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Cruise', icon: Ship, category: 'travel', annualAmount: 3000, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Camping / RV', icon: Tent, category: 'travel', annualAmount: 1200, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Hotels & Lodging', icon: Bed, category: 'travel', annualAmount: 2400, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Visiting Family', icon: Heart, category: 'travel', annualAmount: 1500, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Travel Insurance', icon: ShieldCheck, category: 'travel', annualAmount: 240, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Souvenirs & Excursions', icon: Camera, category: 'travel', annualAmount: 600, preRetirement: true, postRetirement: true, startAge: null, endAge: null },

  // --- Debt Payment ---
  { name: 'Credit Card Payment', icon: CreditCard, category: 'debt_payment', annualAmount: 3600, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Student Loan', icon: GraduationCap, category: 'debt_payment', annualAmount: 3600, preRetirement: true, postRetirement: false, startAge: null, endAge: null },
  { name: 'Personal Loan', icon: HandCoins, category: 'debt_payment', annualAmount: 2400, preRetirement: true, postRetirement: false, startAge: null, endAge: null },
  { name: 'Medical Debt', icon: HeartPulse, category: 'debt_payment', annualAmount: 1800, preRetirement: true, postRetirement: false, startAge: null, endAge: null },
  { name: 'Buy Now Pay Later', icon: CreditCard, category: 'debt_payment', annualAmount: 1200, preRetirement: true, postRetirement: false, startAge: null, endAge: null },
  { name: 'Tax Debt / Installment', icon: Receipt, category: 'debt_payment', annualAmount: 2400, preRetirement: true, postRetirement: false, startAge: null, endAge: null },

  // --- Taxes ---
  { name: 'Federal Income Tax', icon: ReceiptText, category: 'taxes', annualAmount: 12000, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'State Income Tax', icon: Landmark, category: 'taxes', annualAmount: 4000, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Property Tax', icon: Home, category: 'taxes', annualAmount: 3600, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Vehicle Registration', icon: CarFront, category: 'taxes', annualAmount: 220, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Sales Tax (estimated)', icon: Receipt, category: 'taxes', annualAmount: 2400, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Estimated / Self-Employment Tax', icon: Briefcase, category: 'taxes', annualAmount: 6000, preRetirement: true, postRetirement: false, startAge: null, endAge: null },

  // --- Other ---
  { name: 'Childcare / Daycare', icon: Baby, category: 'other', annualAmount: 12000, preRetirement: true, postRetirement: false, startAge: null, endAge: null },
  { name: 'Child Support', icon: Heart, category: 'other', annualAmount: 7200, preRetirement: true, postRetirement: false, startAge: null, endAge: null },
  { name: 'Pet Care / Vet', icon: PawPrint, category: 'other', annualAmount: 1200, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Gifts & Donations', icon: Gift, category: 'other', annualAmount: 2551, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Clothing', icon: Shirt, category: 'other', annualAmount: 1833, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Personal Care', icon: SprayCan, category: 'other', annualAmount: 1010, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Education / Classes', icon: GraduationCap, category: 'other', annualAmount: 1200, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Hobbies', icon: Trophy, category: 'other', annualAmount: 720, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Subscriptions (misc)', icon: Package, category: 'other', annualAmount: 480, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
  { name: 'Charitable Giving', icon: HandHeart, category: 'other', annualAmount: 1200, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
];

/** Quick-add templates for accounts — sensible defaults per type (typical
 *  long-term return + contribution). Mirrors the Expenses Quick Add pattern so
 *  all three data panels offer one-click setup. */
const COMMON_ACCOUNTS: { name: string; icon: LucideIcon; type: AccountType; balance: number; annualReturn: number; annualContribution: number; employerMatch: number; hint: string }[] = [
  { name: 'Checking', icon: Banknote, type: 'checking_savings', balance: 10000, annualReturn: 0.01, annualContribution: 0, employerMatch: 0, hint: 'Cash' },
  { name: 'Savings', icon: PiggyBank, type: 'checking_savings', balance: 25000, annualReturn: 0.03, annualContribution: 3600, employerMatch: 0, hint: 'Emergency fund' },
  { name: 'Taxable Brokerage', icon: TrendingUp, type: 'taxable_brokerage', balance: 50000, annualReturn: 0.07, annualContribution: 6000, employerMatch: 0, hint: 'Invested' },
  { name: 'Traditional 401(k)', icon: Landmark, type: 'traditional_401k', balance: 120000, annualReturn: 0.07, annualContribution: 12000, employerMatch: 4000, hint: '+ match' },
  { name: 'Roth 401(k)', icon: Sprout, type: 'roth_401k', balance: 0, annualReturn: 0.07, annualContribution: 12000, employerMatch: 0, hint: 'Tax-free' },
  { name: 'Traditional IRA', icon: FileText, type: 'traditional_ira', balance: 30000, annualReturn: 0.07, annualContribution: 7000, employerMatch: 0, hint: 'Tax-deferred' },
  { name: 'Roth IRA', icon: Coins, type: 'roth_ira', balance: 60000, annualReturn: 0.07, annualContribution: 7000, employerMatch: 0, hint: 'Tax-free' },
  { name: 'HSA (invested)', icon: HeartPulse, type: 'hsa', balance: 8000, annualReturn: 0.06, annualContribution: 4150, employerMatch: 0, hint: 'Triple-tax-free' },
];

/** Quick-add templates for income sources — typical amounts and ages so the
 *  user can populate a realistic plan in a few clicks. */
const COMMON_INCOME: { name: string; icon: LucideIcon; type: IncomeType; annualAmount: number; startAge: number; endAge: number | null; cola: boolean; taxable: boolean; hint: string; postRetirement?: boolean }[] = [
  { name: 'Salary', icon: Briefcase, type: 'salary', annualAmount: 85000, startAge: 0, endAge: 64, cola: true, taxable: true, hint: 'Pre-retirement' },
  { name: 'Salary in Retirement', icon: Briefcase, type: 'salary', annualAmount: 60000, startAge: 0, endAge: null, cola: true, taxable: true, hint: 'Working into retirement', postRetirement: true },
  { name: 'Social Security', icon: Landmark, type: 'social_security', annualAmount: 36000, startAge: 67, endAge: null, cola: true, taxable: false, hint: 'COLA' },
  { name: 'Pension', icon: FileText, type: 'pension', annualAmount: 18000, startAge: 65, endAge: null, cola: false, taxable: true, hint: 'Fixed' },
  { name: 'Part-time', icon: Clock, type: 'part_time', annualAmount: 15000, startAge: 65, endAge: 70, cola: false, taxable: true, hint: 'Bridge' },
  { name: 'Rental Income', icon: Home, type: 'rental', annualAmount: 24000, startAge: 0, endAge: null, cola: true, taxable: true, hint: 'Property' },
  { name: 'Dividends', icon: CircleDollarSign, type: 'dividends', annualAmount: 6000, startAge: 0, endAge: null, cola: false, taxable: true, hint: 'Investments' },
  { name: 'Annuity', icon: Lock, type: 'annuity', annualAmount: 12000, startAge: 65, endAge: null, cola: false, taxable: true, hint: 'Guaranteed' },
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

/** Theme picker config. Short labels for the popover, swatch for visual. */
type ThemeId = 'light' | 'dark' | 'sepia' | 'nord' | 'warm-gray' | 'dracula';

const THEMES: { id: ThemeId; label: string; swatch: string }[] = [
  { id: 'light',     label: 'Light',     swatch: '#f7f6f3' },
  { id: 'dark',      label: 'Dark',      swatch: '#1a1816' },
  { id: 'sepia',     label: 'Sepia',     swatch: '#f4ecd8' },
  { id: 'warm-gray', label: 'Warm Gray', swatch: '#3a3a3a' },
  { id: 'nord',      label: 'Nord',      swatch: '#2e3440' },
  { id: 'dracula',   label: 'Dracula',   swatch: '#282a36' },
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
 * Save indicator — gives the user confidence their edits persist, without
 * flickering on every keystroke.
 *
 * Subscribes to a JSON snapshot of the plan so any nested change — account
 * balance, expense amount, scenario name — is detected.
 *
 * Visual model:
 * - Before the user's first edit, render nothing (don't fake a "saved" state).
 * - During active typing, render a dim "Saved · 3s ago" label (the store's
 *   storage layer is also debounced, so nothing has actually hit disk yet —
 *   we don't lie about it).
 * - After a 500ms quiet pause following a change, transition to a bright
 *   "✓ Saved" for 2s, then back to the dim label with the updated timestamp.
 *   Single 500ms gate keeps the UI from flashing per keystroke.
 *
 * The `beforeunload` listener in App.tsx calls flushDebouncedStorage() so
 * the user's most recent edits still land on disk if they close the tab
 * within the 500ms debounce window.
 */
function SaveIndicator() {
  const plan = usePlanStore((s) => s.plan);
  // Stable snapshot that changes on any (deep) plan mutation.
  const snapshot = JSON.stringify(plan);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const firstRun = useRef(true);

  // Only mark the save after a 500ms quiet pause. If the user is still
  // typing, each new snapshot resets the timer — so a 30-character burst
  // produces exactly one "Saved" flash, at the end.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const timer = setTimeout(() => setSavedAt(Date.now()), 500);
    return () => clearTimeout(timer);
  }, [snapshot]);

  // Refresh the relative-time label every 30s while idle.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  if (savedAt === null) return null;
  // Fresh (< 2s since last quiet pause): bright "✓ Saved".
  // Older: dim "✓ Saved · 3m ago" as an ongoing trust signal.
  if (now - savedAt < 2000) {
    return (
      <span className="save-indicator save-indicator-saved">
        <span aria-hidden="true">✓</span> Saved
      </span>
    );
  }
  return (
    <span className="save-indicator save-indicator-idle" title={`Last saved ${new Date(savedAt).toLocaleTimeString()}`}>
      <span aria-hidden="true">✓</span> Saved · {relativeTime(savedAt)}
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
      <span className="onboarding-icon" aria-hidden="true"><Sparkles size={20} /></span>
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

/** Last-resort fallback for any render-time error in App. Replaces the
 *  previous `return null` guard at App.tsx:659 with a recoverable error UI
 *  so a bad projection result or malformed store data doesn't leave the
 *  user with a blank page and no path forward. */
class AppErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface to devtools; could be wired to a real error sink later.
    // eslint-disable-next-line no-console
    console.error('App render error:', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary-fallback">
          <h2>Something went wrong</h2>
          <p>{this.state.error.message || 'An unexpected error occurred while rendering this page.'}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
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
        title="Helpful calculators, Social Security, and other external tools"
      >
        <span className="resources-picker-icon" aria-hidden="true"><BookOpen size={16} /></span> Learn more
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
                  <span className="resource-icon" aria-hidden="true"><Glyph i={link.icon} /></span>
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
  // Subscribe to only the two state slices App renders from. Subscribing to
  // the whole store re-rendered the entire tree on every state change —
  // including every streamed AI chat chunk and undoState flip. Actions (and
  // the rare fields App never renders) come from the live snapshot below.
  const plan = usePlanStore((s) => s.plan);
  const activeScenarioId = usePlanStore((s) => s.activeScenarioId);
  // Actions are stable since store creation; spread the snapshot once so the
  // many `store.someAction(...)` call sites below keep working unchanged.
  const store = { ...usePlanStore.getState(), plan, activeScenarioId };
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('retirement-tab') as Tab) || 'inputs');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('retirement-theme') as Theme) || 'light');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem(ONBOARD_KEY) === null);
  /** New-scenario chooser popover (Blank / Wizard / Duplicate). Replaces the
   *  old instant sample-drop on ＋ New so the wizard is discoverable without
   *  forcing it on power users. */
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  /** Scenario wizard modal — opened from the chooser. */
  const [wizardOpen, setWizardOpen] = useState(false);
  /** Inline error message surfaced when an Import Plan file fails to parse.
   *  Lives next to the menu trigger so it doesn't interrupt the flow. */
  const [importError, setImportError] = useState<string | null>(null);
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

  // Flush any pending debounced localStorage write synchronously before the
  // page unloads. Without this, closing the tab within ~500ms of an edit
  // could drop the most recent change on disk.
  useEffect(() => {
    const handler = () => { flushDebouncedStorage(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

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
    const s = plan.scenarios.find((s) => s.id === activeScenarioId);
    return s ?? plan.scenarios[0];
  }, [plan, activeScenarioId]);

  // Run projection for active scenario (cached per scenario identity — see
  // projectScenario). The same cache backs allResults, the Overview panel,
  // and exports, so each scenario projects at most once per edit.
  const activeResult = useMemo(
    () => (activeScenario ? projectScenario(activeScenario) : null),
    [activeScenario],
  );

  // Projections for ALL scenarios (for comparison view + exports) — cache
  // hits for every scenario the current edit didn't touch.
  const allResults = useMemo(
    () => plan.scenarios.map(projectScenario),
    [plan.scenarios],
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
        setImportError(null);
      } catch {
        // Inline error surfaced to the user as an unobtrusive chip next to
        // the menu trigger — replaces the previous blocking window.alert()
        // which interrupted the flow and looked broken in modern browsers.
        setImportError(`Couldn't read "${file.name}". The file isn't valid JSON, or doesn't match the plan schema.`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const dismissOnboarding = () => {
    localStorage.setItem(ONBOARD_KEY, '1');
    setShowOnboarding(false);
  };

  /** Re-open the welcome banner — used by the menu "Show welcome tour" item
   *  so users who dismissed it can still see it later. */
  const restartOnboarding = () => {
    localStorage.removeItem(ONBOARD_KEY);
    setShowOnboarding(true);
    setMenuOpen(false);
  };

  const startFresh = () => {
    store.resetPlan();
    dismissOnboarding();
  };

  return (
    <AppErrorBoundary>
    <div className="app">
      {/* Compact top bar — logo, scenario tabs, and actions in a single row */}
      <div className="app-topbar">
        <div className="app-topbar-left">
          <img className="app-logo" src="./images/retirementmeoff-dark.png" alt="retirementMe-Off" />
          <ScenarioSwitcher
            scenarios={store.plan.scenarios}
            activeScenarioId={activeScenario.id}
            onSelect={(id) => store.setActiveScenario(id)}
            onAdd={() => setNewMenuOpen(true)}
            onDelete={(id) => store.deleteScenario(id)}
            onRename={(id, name) => store.renameScenario(id, name)}
            onDuplicate={(id) => store.duplicateScenario(id)}
          />
        </div>
        <div className="header-actions">
          <SaveIndicator />
          <ResourcesPicker />
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleExportMarkdown}
            title="Export plan as Notes (Markdown) — works with Obsidian or any notes app"
            aria-label="Export plan notes"
          >
            <FileText size={16} aria-hidden="true" /> Notes
          </button>
          <ThemePicker theme={theme} setTheme={setTheme} />
          <div className="menu-wrapper" ref={menuRef}>
            <button className="btn btn-sm menu-trigger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu"><Menu size={16} aria-hidden="true" /> Menu</button>
            {menuOpen && (
              <div className="menu-dropdown">
                <button className="menu-item" onClick={() => { fileInputRef.current?.click(); setMenuOpen(false); }}>
                  <Upload size={16} aria-hidden="true" /> Import Plan
                </button>
                <button className="menu-item" onClick={() => { handleExport(); setMenuOpen(false); }}>
                  <FileJson size={16} aria-hidden="true" /> Export JSON
                </button>
                <button className="menu-item" onClick={() => { handleExportMarkdown(); setMenuOpen(false); }} title="Markdown for Obsidian or any notes app">
                  <FileText size={16} aria-hidden="true" /> Export Notes
                </button>
                <div className="menu-divider" />
                <button className="menu-item" onClick={restartOnboarding}>
                  <Sparkles size={16} aria-hidden="true" /> Show welcome tour
                </button>
                <ResetPlanMenuItem onReset={() => { store.resetPlan(); setMenuOpen(false); }} />
              </div>
            )}
          </div>
          {importError && (
            <div className="inline-error" role="alert">
              <span aria-hidden="true">⚠️</span>
              {importError}
              <button className="inline-error-dismiss" onClick={() => setImportError(null)} aria-label="Dismiss error">✕</button>
            </div>
          )}
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
        <Suspense fallback={<TabFallback />}>
          <ResultsView
            scenario={activeScenario}
            result={activeResult}
            readiness={readiness}
          />
        </Suspense>
      )}

      {tab === 'compare' && (
        <Suspense fallback={<TabFallback />}>
          <CompareView results={allResults} scenarios={store.plan.scenarios} />
        </Suspense>
      )}

      <ResourcesFooter />

      {/* New-scenario chooser — opens when the user clicks ＋ New. Offers the
          instant sample drop (Start blank), the guided wizard, or duplicating
          the current scenario. Renders at the App level so the wizard it
          launches can overlay everything. */}
      {newMenuOpen && (
        <NewScenarioMenu
          onBlank={() => { store.addScenario(); setNewMenuOpen(false); }}
          onWizard={() => { setWizardOpen(true); setNewMenuOpen(false); }}
          onDuplicate={() => { store.duplicateScenario(activeScenario.id); setNewMenuOpen(false); }}
          onCancel={() => setNewMenuOpen(false)}
        />
      )}

      {/* Scenario wizard modal */}
      {wizardOpen && (
        <ScenarioWizard
          onCreate={(data) => { store.addScenarioFromData(data); setWizardOpen(false); setTab('results'); }}
          onCancel={() => setWizardOpen(false)}
        />
      )}

      {/* AI Chat Assistant */}
      <AiChat />

      {/* Undo toast — overlays every view, single-slot */}
      <UndoToast />
    </div>
    </AppErrorBoundary>
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
      <Trash2 size={16} aria-hidden="true" /> Reset Plan
    </button>
  );
}

/* ============ NEW SCENARIO MENU (chooser) ============ */

/**
 * Chooser that appears when the user clicks ＋ New. Offers three creation
 * paths so the wizard is discoverable without forcing it on power users:
 *   - Start blank: instant sample drop (the old ＋ New behavior, preserved)
 *   - ✨ Use the wizard: guided 3-step creator for a personalized plan
 *   - Duplicate current: copy the active scenario for what-if analysis
 *
 * Rendered as a centered modal with a scrim (the app's first), matching the
 * wizard it can launch. Escape and outside-click dismiss.
 */
function NewScenarioMenu({
  onBlank,
  onWizard,
  onDuplicate,
  onCancel,
}: {
  onBlank: () => void;
  onWizard: () => void;
  onDuplicate: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="new-scenario-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Create a scenario"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="new-scenario-menu-header">
          <h2>Create a scenario</h2>
          <button className="wizard-close" onClick={onCancel} aria-label="Close">✕</button>
        </div>
        <button className="new-scenario-option" onClick={onWizard}>
          <span className="new-scenario-option-icon" aria-hidden="true"><Wand2 size={20} /></span>
          <span className="new-scenario-option-body">
            <span className="new-scenario-option-title">Use the wizard</span>
            <span className="new-scenario-option-desc">Answer 3 quick questions for a plan that matches your life.</span>
          </span>
        </button>
        <button className="new-scenario-option" onClick={onBlank}>
          <span className="new-scenario-option-icon" aria-hidden="true"><ClipboardList size={20} /></span>
          <span className="new-scenario-option-body">
            <span className="new-scenario-option-title">Start with sample data</span>
            <span className="new-scenario-option-desc">A fully filled-in example you edit to match your situation.</span>
          </span>
        </button>
        <button className="new-scenario-option" onClick={onDuplicate}>
          <span className="new-scenario-option-icon" aria-hidden="true"><FileText size={20} /></span>
          <span className="new-scenario-option-body">
            <span className="new-scenario-option-title">Duplicate current</span>
            <span className="new-scenario-option-desc">Copy “{usePlanStore.getState().plan.scenarios.find((s) => s.id === usePlanStore.getState().activeScenarioId)?.name ?? 'current'}” to tweak as a what-if.</span>
          </span>
        </button>
      </div>
    </div>
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
      <Trash2 size={15} aria-hidden="true" />
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

  const navItems: { id: InputSection; label: string; icon: LucideIcon }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'assumptions', label: 'Assumptions', icon: Settings },
    { id: 'income', label: 'Income Sources', icon: Wallet },
    { id: 'accounts', label: 'Accounts & Savings', icon: Landmark },
    { id: 'properties', label: 'Homes & Property', icon: Home },
    { id: 'expenses', label: 'Expenses', icon: ListChecks },
    { id: 'events', label: 'Life Events', icon: CalendarDays },
  ];

  return (
    <div className="inputs-layout">
      <aside className="inputs-sidebar">
        <ul className="inputs-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  className={`inputs-nav-item ${section === item.id ? 'active' : ''}`}
                  onClick={() => setSection(item.id)}
                >
                  <Icon className="inputs-nav-icon" size={18} strokeWidth={1.75} aria-hidden="true" />
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
      <div className="inputs-content">
        {section === 'overview' && (
          <Suspense fallback={<TabFallback />}>
            <OverviewPanel scenario={scenario} />
          </Suspense>
        )}
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
        <h2 className="assumptions-title"><Settings size={18} aria-hidden="true" /> Assumptions
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
        <div className="form-section-title"><CalendarClock size={15} aria-hidden="true" /> Timeline</div>
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
            <Users size={15} aria-hidden="true" /> Spouse
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
        <div className="form-section-title"><Percent size={15} aria-hidden="true" /> Inflation & Tax</div>
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
        <div className="form-section-title"><TrendingUp size={15} aria-hidden="true" /> Investment Returns & Withdrawals</div>
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

const ACCOUNT_GROUP_META: { types: AccountType[]; label: string; icon: LucideIcon; hint: string }[] = [
  { types: ['checking_savings'], label: 'Cash & Liquid', icon: Wallet, hint: 'Checking and savings — easily accessible, low return' },
  { types: ['taxable_brokerage'], label: 'Taxable Investments', icon: TrendingUp, hint: 'Brokerage accounts — taxed on gains each year' },
  { types: ['traditional_401k', 'roth_401k', 'traditional_ira', 'roth_ira', 'hsa'], label: 'Tax-Advantaged', icon: ShieldCheck, hint: '401k, IRA, HSA — tax-deferred or tax-free growth' },
  { types: ['pension', 'other'], label: 'Other', icon: Package, hint: 'Pensions and other account types' },
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
          <div className="acct-card-title-area">
            <div className="acct-card-name-row">
              <span className="acct-card-icon" aria-hidden="true"><Glyph i={acct.type === 'checking_savings' ? Wallet : acct.type === 'taxable_brokerage' ? TrendingUp : acct.type.includes('roth') ? Sprout : acct.type === 'hsa' ? HeartPulse : acct.type === 'pension' ? Building2 : Landmark} /></span>
              <input
                type="text"
                className="acct-card-name"
                value={acct.name}
                onChange={(e) => store.updateAccount(scenario.id, acct.id, { name: e.target.value })}
                aria-label="Account name"
                placeholder="Account name"
              />
              <ConfirmDelete title="Delete account" onConfirm={() => store.deleteAccount(scenario.id, acct.id)} />
            </div>
            <div className="acct-card-meta">
              <select className="table-select acct-type-select" value={acct.type} onChange={(e) => store.updateAccount(scenario.id, acct.id, { type: e.target.value as AccountType })} aria-label="Account type">
                {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{prettify(t)}</option>)}
              </select>
              <span className="acct-tax-badge" style={{ color: taxColor, borderColor: taxColor }}>{taxLabel}</span>
            </div>
          </div>
        </div>
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
        <h2><Landmark size={20} aria-hidden="true" /> Accounts & Savings</h2>
      </div>
      <p className="section-help">
        Track all your savings and investment accounts. Enter the <strong>current balance</strong>, expected <strong>annual return</strong>,
        and your <strong>yearly contribution</strong>. Employer match is only shown for 401(k) accounts.
      </p>

      {/* Quick add common accounts */}
      <details className="quick-add-section">
        <summary className="quick-add-label"><Zap size={15} aria-hidden="true" /> Quick Add Common Accounts <span className="quick-add-toggle"></span></summary>
        <div className="quick-add-grid">
          {COMMON_ACCOUNTS.map((ca) => (
            <button key={ca.name} className="quick-add-btn" onClick={() => store.addAccount(scenario.id, {
              name: ca.name, type: ca.type, balance: ca.balance, annualReturn: ca.annualReturn, annualContribution: ca.annualContribution, employerMatch: ca.employerMatch,
            })}>
              <span className="quick-add-icon" aria-hidden="true"><Glyph i={ca.icon} /></span>
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
                  <span><Glyph i={g.icon} /> {g.label}</span>
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
              <span className="acct-group-icon"><Glyph i={g.icon} /></span>
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
        <div className="empty-state-cta">
          <p className="muted">No accounts added yet. Click "Add Account" to start tracking your savings and investments, or load the baseline example to see how a typical retirement portfolio looks.</p>
          <button
            className="btn btn-sm"
            onClick={() => {
              // Pull the seeded accounts out of a fresh defaultScenario() so
              // the user sees the same baseline values the app starts with on
              // first run. addAccount uses createId() so the new rows get
              // fresh ids and don't collide with anything already there.
              for (const acct of defaultScenario().accounts) {
                store.addAccount(scenario.id, acct);
              }
            }}
          >
            Load baseline example accounts
          </button>
        </div>
      )}

      <ContextualResources group={RESOURCE_GROUPS[4]} />
    </div>
  );
}

const PROPERTY_TYPES: PropertyType[] = ['primary_residence', 'vacation', 'investment', 'land', 'other'];

/** Property group metadata — mirrors ACCOUNT_GROUP_META so the Properties
 *  panel groups by type with per-group headers and + Add buttons, just like
 *  Accounts & Savings. Each group lists its property types in display order. */
const PROPERTY_GROUP_META: { label: string; icon: LucideIcon; types: PropertyType[] }[] = [
  { label: 'Primary & Residential', icon: Home, types: ['primary_residence'] },
  { label: 'Vacation & Investment', icon: Palmtree, types: ['vacation', 'investment'] },
  { label: 'Land & Other', icon: TreePine, types: ['land', 'other'] },
];

const PLAN_ACTION_LABELS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'keep', label: 'Keep it', icon: Home },
  { value: 'sell', label: 'Sell it', icon: House },
  { value: 'sell_and_buy', label: 'Sell and buy another', icon: ArrowLeftRight },
  { value: 'undecided', label: 'Not sure yet', icon: HelpCircle },
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
  // 'simple' = one flat monthly payment (escrow) covering P+I + tax + insurance,
  // flat until payoff then $0. 'detailed' (default) = separate fields. Absent
  // field on legacy data falls back to detailed = today's behavior.
  const mortgageMode = prop.mortgageInputMode ?? 'detailed';
  const isSimpleMortgage = mortgageMode === 'simple';

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
        <span className="prop-icon"><Glyph i={prop.type === 'land' ? TreePine : Home} /></span>
        <input type="text" className="prop-name-input" value={prop.name} placeholder="e.g. Family Home" onChange={(e) => store.updateProperty(scenario.id, prop.id, { name: e.target.value })} aria-label="Property name" />
        <select className="table-select" value={prop.type} onChange={(e) => store.updateProperty(scenario.id, prop.id, { type: e.target.value as PropertyType })} aria-label="Property type" style={{ width: 'auto', minWidth: 140 }}>
          {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{prettify(t)}</option>)}
        </select>
        <ConfirmDelete title="Delete property" onConfirm={() => store.deleteProperty(scenario.id, prop.id)} />
      </div>

      {/* === Step 1: Current property (compact) === */}
      <div className="prop-step">
        <div className="prop-step-label">① Current Property</div>
        <div className="prop-mode-toggle-row">
          <span className="prop-mode-toggle-label">How do you track housing costs?</span>
          <span className="income-end-toggle prop-mode-toggle">
            <button
              className={`income-lifetime-btn ${isSimpleMortgage ? 'active' : ''}`}
              title="Enter one monthly payment that includes principal, interest, taxes & insurance"
              onClick={() => store.updateProperty(scenario.id, prop.id, { mortgageInputMode: 'simple' })}
            >Simple (one payment)</button>
            <button
              className={`income-lifetime-btn ${!isSimpleMortgage ? 'active' : ''}`}
              title="Enter balance, P+I payment, tax, and insurance separately"
              onClick={() => store.updateProperty(scenario.id, prop.id, { mortgageInputMode: 'detailed' })}
            >Detailed</button>
          </span>
        </div>
        {isSimpleMortgage && (
          <div className="prop-hint" style={{ marginBottom: 12 }}>
            Enter your total monthly payment as shown on your statement — most people escrow, so it includes principal, interest, taxes &amp; insurance. It counts as a single housing cost until the mortgage pays off, then drops to $0. We still need the balance to track your equity and payoff.
          </div>
        )}
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
          {isSimpleMortgage ? (
            <PropMonthlyPaymentField prop={prop} scenario={scenario} store={store} />
          ) : (
            <div className="prop-field">
              <label>Annual mortgage payment (P+I)</label>
              <CurrencyCellInput value={prop.mortgagePayment ?? 0} onChange={(v) => store.updateProperty(scenario.id, prop.id, { mortgagePayment: v })} />
            </div>
          )}
          <PropYearsLeftField prop={prop} scenario={scenario} store={store} />
          {!isSimpleMortgage && (
            <>
              <div className="prop-field">
                <label>Property tax /yr</label>
                <CurrencyCellInput value={prop.annualPropertyTax} onChange={(v) => store.updateProperty(scenario.id, prop.id, { annualPropertyTax: v })} />
              </div>
              <div className="prop-field">
                <label>Home insurance /yr</label>
                <CurrencyCellInput value={prop.annualInsurance} onChange={(v) => store.updateProperty(scenario.id, prop.id, { annualInsurance: v })} />
              </div>
            </>
          )}
          <div className="prop-field">
            <label>Expected annual home value growth</label>
            <PctCellInput value={prop.annualAppreciation} onChange={(v) => store.updateProperty(scenario.id, prop.id, { annualAppreciation: v })} />
            <div className="prop-hint">Historical US average is ~3%. Above 5% is optimistic.</div>
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
        <div className="prop-hint" style={{ marginBottom: 10 }}>
          <strong>Keep</strong> holds it through retirement. <strong>Sell</strong> ends ownership at a chosen age. <strong>Sell &amp; Buy</strong> moves you to a different home (adds purchase fields). <strong>Undecided</strong> pauses the projection until you choose.
        </div>
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
              <span className="prop-plan-icon"><Glyph i={opt.icon} /></span>
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
              <div className="prop-hint">Typical 15–30 year fixed: ~5–7%. Older loans may be lower.</div>
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
        <div className="prop-step-label"><TrendingUp size={15} aria-hidden="true" /> Retirement Impact</div>
        <div className="prop-impact-grid">
          <div className="prop-impact-item">
            <span className="prop-impact-icon"><Home size={16} aria-hidden="true" /></span>
            <div>
              <div className="prop-impact-value">{formatCurrency(equity, { compact: true })}</div>
              <div className="prop-impact-label">Equity available</div>
            </div>
          </div>
          <div className="prop-impact-item">
            <span className="prop-impact-icon"><CircleDollarSign size={16} aria-hidden="true" /></span>
            <div>
              <div className="prop-impact-value">{formatCurrency(annualHousing + (prop.mortgagePayment ?? 0), { compact: true })}/yr</div>
              <div className="prop-impact-label">Housing cost in retirement</div>
            </div>
          </div>
          {showSaleFields && (prop.saleProceeds ?? 0) > 0 && (
            <div className="prop-impact-item">
              <span className="prop-impact-icon"><Wallet size={16} aria-hidden="true" /></span>
              <div>
                <div className="prop-impact-value" style={{ color: 'var(--green)' }}>{formatCurrency(prop.saleProceeds ?? 0, { compact: true })}</div>
                <div className="prop-impact-label">Cash from sale at age {prop.saleAge}</div>
              </div>
            </div>
          )}
          {showBuyFields && estMortgage > 0 && (
            <div className="prop-impact-item">
              <span className="prop-impact-icon"><KeyRound size={16} aria-hidden="true" /></span>
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
        <h2><Home size={20} aria-hidden="true" /> Homes & Property</h2>
        <button className="btn btn-sm" onClick={() => store.addProperty(scenario.id, {
          name: 'New Property', type: 'primary_residence', currentValue: 0, mortgageBalance: 0, annualAppreciation: 0.03, annualPropertyTax: 0, annualInsurance: 0,
        })}>+ Add Property</button>
      </div>
      <p className="section-help">
        Track properties you own and model future purchases or sales. Your <strong>mortgage payment</strong> (flat until
        payoff), <strong>property tax</strong>, and <strong>home insurance</strong> are automatically added as expenses on
        the Expenses page — you'll see them tagged with a <em>from property</em> badge. Your home equity and any sale
        proceeds are factored into your net worth and retirement plan.
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
                  <span className="acct-group-icon" aria-hidden="true"><Glyph i={g.icon} /></span>
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

      <ContextualResources group={RESOURCE_GROUPS[0]} />
    </div>
  );
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  housing: Home,
  food: Utensils,
  transportation: Car,
  healthcare: HeartPulse,
  insurance: ShieldCheck,
  utilities: Lightbulb,
  entertainment: Clapperboard,
  travel: Plane,
  debt_payment: CreditCard,
  taxes: Receipt,
  other: Package,
};

/* ============================================================
   EXPENSE TIMING MODEL
   ============================================================
   The expense's schedule is expressed to the engine via four low-level
   fields (preRetirement, postRetirement, startAge, endAge). Asking the
   user to set those four independently is the source of the confusion
   this redesign fixes: "Before" + "End: At age 72" + "Start: Always"
   requires decoding before the schedule is legible.

   Instead we expose a single semantic "timing mode" and derive the four
   fields from it. The mode is the source of truth in the UI; the fields
   are derived state we write back to the store. Four modes cover every
   real expense (the three the spec names, plus "Always" — the dominant
   case where a cost runs both phases with no age bound):

     always      -> both phases, no age bounds (Food, Utilities, ...)
     before      -> pre-retirement only; ends at retirement (Mortgage)
     retirement  -> post-retirement only; starts at retirement (Travel)
     custom      -> explicit start/end ages the user sets (pet care that
                    ends at 72, pre-Medicare healthcare ending at 64)

   `custom` is progressive disclosure: its start/end inputs appear only
   when that mode is chosen, so the row stays one line in the common case.
*/

type ExpenseTimingMode = 'always' | 'before' | 'retirement' | 'custom';

/** Derive the timing mode from the stored fields. The engine treats a null
 *  age bound as "no constraint", so a both-phases expense with no bounds is
 *  `always`. Any explicit age bound means the user has chosen a window, so
 *  we read it as `custom` regardless of the phase flags. */
function deriveExpenseTiming(exp: {
  preRetirement: boolean;
  postRetirement: boolean;
  startAge: number | null;
  endAge: number | null;
}): ExpenseTimingMode {
  if (exp.startAge !== null || exp.endAge !== null) return 'custom';
  if (exp.preRetirement && !exp.postRetirement) return 'before';
  if (!exp.preRetirement && exp.postRetirement) return 'retirement';
  return 'always'; // both, or neither (inactive) — both surface as "always"
}

/** Human label + accent class for the summary badge, by mode. Read at a
 *  glance — no decoding required. */
function expenseTimingLabel(mode: ExpenseTimingMode, retirementAge: number): { label: string; cls: string } {
  switch (mode) {
    case 'before': return { label: `Until retirement (age ${retirementAge})`, cls: 'exp-phase-pre' };
    case 'retirement': return { label: `From retirement (age ${retirementAge}) onward`, cls: 'exp-phase-post' };
    case 'custom': return { label: 'Custom age window', cls: 'exp-phase-custom' };
    default: return { label: 'Always', cls: 'exp-phase-both' };
  }
}

/** Map a chosen mode to the field patch that realizes it. Anchored modes
 *  (before/retirement) use the phase flags as the boundary; `always` clears
 *  any age bounds. `custom` keeps any bounds the user already set, but when
 *  entering fresh it seeds startAge = currentAge — this is projection-neutral
 *  (the plan starts at currentAge) and essential to avoid the mode being
 *  indistinguishable from `always` (which would snap the selector back). */
function timingModePatch(
  mode: ExpenseTimingMode,
  prev: { preRetirement: boolean; postRetirement: boolean; startAge: number | null; endAge: number | null },
  currentAge: number,
): { preRetirement: boolean; postRetirement: boolean; startAge: number | null; endAge: number | null } {
  switch (mode) {
    case 'before': return { preRetirement: true, postRetirement: false, startAge: null, endAge: null };
    case 'retirement': return { preRetirement: false, postRetirement: true, startAge: null, endAge: null };
    case 'custom': {
      // Keep any bounds the user already set. But when entering Custom fresh
      // (no startAge yet), seed startAge = currentAge. Without this, the patch
      // would be {startAge: null, endAge: null, both phases} — identical to
      // "Always" — so deriveExpenseTiming would immediately read it back as
      // `always` and the selector would snap back (the flicker bug).
      // currentAge is projection-neutral: the plan starts at currentAge anyway.
      const startAge = prev.startAge ?? currentAge;
      return {
        preRetirement: true,
        postRetirement: true,
        startAge,
        endAge: prev.endAge ?? null,
      };
    }
    default: return { preRetirement: true, postRetirement: true, startAge: null, endAge: null };
  }
}

function ExpenseRow({ exp, scenario, store }: {
  exp: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0]['expenses'][0];
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
}) {
  const monthly = Math.round(exp.annualAmount / 12);
  const { retirementAge, currentAge } = scenario.assumptions;
  const mode = deriveExpenseTiming(exp);
  const timing = expenseTimingLabel(mode, retirementAge);

  return (
    <div className="income-row exp-row">
      <div className="income-row-main">
        <span className="income-row-icon" aria-hidden="true"><Glyph i={CATEGORY_ICONS[exp.category] ?? Package} /></span>
        <input
          type="text"
          className="income-row-name"
          value={exp.name}
          onChange={(e) => store.updateExpense(scenario.id, exp.id, { name: e.target.value })}
          placeholder="Expense name"
          aria-label="Expense name"
        />
        {exp._propertyId && (
          <span className="exp-linked-badge" title="Auto-created from your Homes &amp; Property page — edit it there">
            <Link2 size={11} aria-hidden="true" /> from property
          </span>
        )}
        <select
          className="table-select income-row-type"
          value={exp.category}
          onChange={(e) => store.updateExpense(scenario.id, exp.id, { category: e.target.value as ExpenseCategory })}
          aria-label="Expense category"
        >
          {EXPENSE_CATEGORIES.map((t) => <option key={t} value={t}>{prettify(t)}</option>)}
        </select>
      </div>
      <div className="income-row-details">
        <div className="income-row-amount">
          <CurrencyCellInput value={monthly} onChange={(v) => store.updateExpense(scenario.id, exp.id, { annualAmount: v * 12 })} />
          <span className="income-row-amount-unit">/mo</span>
        </div>
        {/* TIMING — one semantic selector whose value IS the schedule. This
            replaces the old Start/End/Before/After quad: the user picks the
            intent ("until retirement", "from retirement onward", "custom
            range") and we derive the underlying fields. Custom reveals its
            start/end inputs inline only when chosen (progressive disclosure),
            so the common case stays a single compact line. */}
        <div className="exp-timing">
          <select
            className="table-select exp-timing-select"
            value={mode}
            onChange={(e) => store.updateExpense(scenario.id, exp.id, timingModePatch(e.target.value as ExpenseTimingMode, exp, currentAge))}
            aria-label="When this expense applies"
          >
            <option value="always">Always</option>
            <option value="before">Until retirement</option>
            <option value="retirement">From retirement onward</option>
            <option value="custom">Custom range…</option>
          </select>
          {mode === 'custom' && (
            <div className="exp-custom-range">
              <span className="exp-custom-field">
                <label>From age</label>
                <NumCellInput
                  value={exp.startAge ?? currentAge}
                  onChange={(v) => store.updateExpense(scenario.id, exp.id, { startAge: v })}
                />
              </span>
              <span className="exp-custom-sep" aria-hidden="true">→</span>
              <span className="exp-custom-field">
                <label>To age</label>
                <NumCellInput
                  value={exp.endAge ?? scenario.assumptions.endAge}
                  onChange={(v) => store.updateExpense(scenario.id, exp.id, { endAge: v || null })}
                />
                <button
                  className={`income-lifetime-btn ${exp.endAge === null ? 'active' : ''}`}
                  title="Continues for life"
                  onClick={() => store.updateExpense(scenario.id, exp.id, { endAge: null })}
                >Life</button>
              </span>
            </div>
          )}
        </div>
        <ConfirmDelete title="Delete expense" onConfirm={() => store.deleteExpense(scenario.id, exp.id)} />
      </div>
      <div className="income-row-summary">
        <span className={`income-phase-badge ${timing.cls}`}>{timing.label}</span>
      </div>
    </div>
  );
}

/**
 * Popover menu of common expense types, presented when "+ Add Expense" is clicked.
 * Mirrors IncomeAddMenu / ThemePicker (outside-click + Escape to close).
 * Picking an option adds a row pre-filled with that expense's category, amount,
 * and Before/After timing defaults — instead of appending a blank "New Expense".
 *
 * `defaultCategory`, when set (used by per-category "+ Add" buttons), filters the
 * menu to entries of that category and offers a custom-blank option for it.
 */
function ExpenseAddMenu({ scenario, store, label, defaultCategory, compact }: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
  label: string;
  defaultCategory?: ExpenseCategory;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { style: popStyle, placement } = usePopoverPosition(ref, open);

  const items = defaultCategory
    ? COMMON_EXPENSES.filter((ce) => ce.category === defaultCategory)
    : COMMON_EXPENSES;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      // The dropdown is portaled to document.body, so it's no longer a DOM
      // child of the trigger wrapper — check both to avoid closing on clicks
      // inside the menu itself.
      if (ref.current && !ref.current.contains(t) && dropdownRef.current && !dropdownRef.current.contains(t)) setOpen(false);
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

  // Compact timing label for the hint line.
  const timingLabel = (ce: { preRetirement: boolean; postRetirement: boolean }) =>
    ce.preRetirement && ce.postRetirement ? 'Before + After'
      : ce.preRetirement ? 'Before'
      : ce.postRetirement ? 'After'
      : 'Manual';

  return (
    <div className="menu-wrapper expense-add-menu" ref={ref}>
      <button
        type="button"
        className={`btn btn-sm${compact ? ' acct-group-add' : ''}${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open && createPortal(
        <div ref={dropdownRef} className={`menu-dropdown ${placement === 'above' ? 'open-above' : ''}`} role="listbox" style={{ ...popStyle }}>
          {items.map((ce) => (
            <button
              key={ce.name}
              type="button"
              role="option"
              className="menu-item income-add-item"
              onClick={() => {
                store.addExpense(scenario.id, { ...ce });
                setOpen(false);
              }}
            >
              <span className="income-add-icon" aria-hidden="true"><Glyph i={ce.icon} /></span>
              <span className="income-add-text">
                <span className="income-add-name">{ce.name}</span>
                <span className="income-add-hint">{prettify(ce.category)} · {timingLabel(ce)} · {formatCurrency(ce.annualAmount / 12, { compact: true })}/mo</span>
              </span>
            </button>
          ))}
          <div className="menu-divider" />
          <button
            type="button"
            role="option"
            className="menu-item income-add-item"
            onClick={() => {
              store.addExpense(scenario.id, {
                name: 'New Expense', category: defaultCategory ?? 'other', annualAmount: 0,
                preRetirement: false, postRetirement: true, startAge: null, endAge: null,
              });
              setOpen(false);
            }}
          >
            <span className="income-add-icon" aria-hidden="true"><Glyph i={Plus} /></span>
            <span className="income-add-text">
              <span className="income-add-name">Custom expense…</span>
              <span className="income-add-hint">{defaultCategory ? prettify(defaultCategory) : 'Other'} · blank row, edit yourself</span>
            </span>
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

function ExpensesPanel({ scenario, store }: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
}) {
  const preRetTotal = scenario.expenses.filter(e => e.preRetirement).reduce((s, e) => s + e.annualAmount, 0) / 12;
  const postRetTotal = scenario.expenses.filter(e => e.postRetirement).reduce((s, e) => s + e.annualAmount, 0) / 12;

  // Which category's quick-add chip panel is open (null = none). Only one
  // group's chips can be expanded at a time — keeps the page tidy.
  const [openQuickAdd, setOpenQuickAdd] = useState<ExpenseCategory | null>(null);

  // Group by category
  const groups = EXPENSE_CATEGORIES.map((cat) => ({
    category: cat,
    icon: CATEGORY_ICONS[cat] ?? Package,
    expenses: scenario.expenses.filter((e) => e.category === cat),
  })).filter((g) => g.expenses.length > 0);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2><ListChecks size={20} aria-hidden="true" /> Expenses</h2>
        <ExpenseAddMenu scenario={scenario} store={store} label="+ Add Expense" />
      </div>
      <p className="section-help">
        Enter your monthly costs for each category. Toggle <strong>Before</strong> and/or <strong>After</strong> to control
        when each expense applies in your retirement plan. If you own a home, its mortgage, tax, and insurance are
        managed on the <strong>Homes &amp; Property</strong> page and appear here automatically — don't add them twice.
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

      {scenario.expenses.length === 0 ? (
        <p className="muted" style={{ padding: '8px 0' }}>No expenses added yet. Click "Add Expense" to start.</p>
      ) : (
        <div className="income-groups">
          {groups.map((g) => {
            const groupTotal = g.expenses.reduce((s, e) => s + e.annualAmount, 0) / 12;
            return (
              <div key={g.category} className="income-group">
                <div className="income-group-header">
                  <span className="income-group-icon"><Glyph i={g.icon} /></span>
                  <span className="income-group-label">{prettify(g.category)}</span>
                  <span className="income-group-count">{g.expenses.length}</span>
                  <span className="income-group-total-muted">{formatCurrency(groupTotal, { compact: true })}/mo</span>
                  {QUICK_ADD_EXPENSES.some((q) => q.category === g.category) && (
                    <button
                      className={`btn btn-sm quick-add-trigger${openQuickAdd === g.category ? ' active' : ''}`}
                      onClick={() => setOpenQuickAdd(openQuickAdd === g.category ? null : g.category)}
                      title="Quick add common items"
                    >
                      <Zap size={13} aria-hidden="true" /> Quick add <span aria-hidden="true">{openQuickAdd === g.category ? '▴' : '▾'}</span>
                    </button>
                  )}
                  <ExpenseAddMenu scenario={scenario} store={store} label="+ Add" defaultCategory={g.category} compact />
                </div>
                {g.category === 'housing' && (scenario.properties?.length ?? 0) > 0 && (
                  <div className="info-banner">
                    <Info size={14} aria-hidden="true" />
                    <span>Mortgage, property tax, and home insurance from your <strong>Homes &amp; Property</strong> page are already included here — look for the <span className="exp-linked-badge-inline"><Link2 size={10} aria-hidden="true" /> from property</span> badge. Don't add them again, or they'll be double-counted.</span>
                  </div>
                )}
                {openQuickAdd === g.category && (
                  <div className="quick-add-panel">
                    <div className="quick-add-grid">
                      {QUICK_ADD_EXPENSES.filter((q) => q.category === g.category).map((q) => (
                        <button key={q.name} className="quick-add-btn" onClick={() => store.addExpense(scenario.id, { ...q })}>
                          <span className="quick-add-icon" aria-hidden="true"><Glyph i={q.icon} /></span>
                          <span>{q.name}</span>
                          <span className="quick-add-amount">{formatCurrency(q.annualAmount / 12, { compact: true })}/mo</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
const INCOME_ICONS: Record<string, LucideIcon> = {
  salary: Briefcase,
  social_security: Landmark,
  pension: Building2,
  part_time: Clock,
  self_employment: Hammer,
  rental: Home,
  annuity: Table2,
  dividends: CircleDollarSign,
  other: Package,
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

/**
 * Patch for an income row whose type just changed. The Pre/Retirement grouping
 * is driven by start/end ages, so keeping the OLD type's ages strands the card
 * — a Salary ending at 64 turned into Social Security stayed under
 * Pre-Retirement. When the current timing's phase disagrees with the new
 * type's typical phase, re-apply that type's template timing (the same
 * defaults the "+ Add Income" picker uses) so the card lands where adding
 * that type fresh would have put it. When the phases already agree (including
 * 'both'), the user's custom ages are preserved.
 */
function incomeTypeChangePatch(
  startAge: number,
  endAge: number | null,
  newType: IncomeType,
  retirementAge: number,
): { type: IncomeType; startAge?: number; endAge?: number | null } {
  const patch: { type: IncomeType; startAge?: number; endAge?: number | null } = { type: newType };
  const template = COMMON_INCOME.find((t) => t.type === newType && !t.postRetirement);
  if (!template) return patch;
  const currentPhase = formatTiming(startAge, endAge, retirementAge).phase;
  const templatePhase = formatTiming(template.startAge, template.endAge, retirementAge).phase;
  const incompatible =
    currentPhase !== templatePhase && currentPhase !== 'both' && templatePhase !== 'both';
  if (incompatible) {
    patch.startAge = template.startAge;
    patch.endAge = template.endAge;
  }
  return patch;
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
        <span className="income-row-icon" aria-hidden="true"><Glyph i={INCOME_ICONS[inc.type] ?? Package} /></span>
        <input
          type="text"
          className="income-row-name"
          value={inc.name}
          onChange={(e) => store.updateIncome(scenario.id, inc.id, { name: e.target.value })}
          placeholder="Income source name"
          aria-label="Income source name"
        />
        <select
          className="table-select income-row-type"
          value={inc.type}
          onChange={(e) =>
            store.updateIncome(
              scenario.id,
              inc.id,
              incomeTypeChangePatch(
                inc.startAge,
                inc.endAge,
                e.target.value as IncomeType,
                scenario.assumptions.retirementAge,
              ),
            )
          }
          aria-label="Income type"
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
          ><TrendingUp size={14} aria-hidden="true" /> COLA</button>
          <button
            className={`income-flag ${inc.taxable ? 'active' : ''}`}
            title="Taxed as ordinary income"
            onClick={() => store.updateIncome(scenario.id, inc.id, { taxable: !inc.taxable })}
          ><Receipt size={14} aria-hidden="true" /> Tax</button>
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

/**
 * Popover menu of income types, presented when "+ Add Income" is clicked.
 * Mirrors the ThemePicker popover pattern (outside-click + Escape to close).
 * Picking an option adds a row pre-filled with sensible defaults for that type,
 * instead of the old behavior of appending a blank "New Income".
 *
 * `defaultPhase` biases the start/end ages so a row lands in the intended group
 * when triggered from a Pre-Retirement / Retirement group header.
 */
function IncomeAddMenu({ scenario, store, label, defaultPhase, compact }: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
  label: string;
  defaultPhase?: 'pre' | 'post';
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { style: popStyle, placement } = usePopoverPosition(ref, open);
  const cur = scenario.assumptions.currentAge;
  const ret = scenario.assumptions.retirementAge;

  // Resolve start/end ages for a COMMON_INCOME entry, honoring defaultPhase bias.
  const agesFor = (ci: { startAge: number; endAge: number | null; postRetirement?: boolean }): { startAge: number; endAge: number | null } => {
    if (defaultPhase === 'pre') return { startAge: cur, endAge: ret - 1 };
    if (defaultPhase === 'post') return { startAge: ret, endAge: null };
    // Sources flagged as post-retirement (e.g. Salary in Retirement) start at
    // retirement age so they land in the Retirement group, with no end clamp.
    if (ci.postRetirement) return { startAge: ret, endAge: ci.endAge };
    // Default: keep the preset start, but clamp a finite endAge to stay within
    // the pre-retirement phase so a source like Salary (preset endAge 64) doesn't
    // span the retirement boundary and render as phase 'both'. Lifetime (null)
    // sources are intentionally left alone.
    const startAge = Math.max(ci.startAge, cur);
    const endAge = ci.endAge !== null && ci.endAge >= ret ? ret - 1 : ci.endAge;
    return { startAge, endAge };
  };

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && dropdownRef.current && !dropdownRef.current.contains(t)) setOpen(false);
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
    <div className={`menu-wrapper income-add-menu`} ref={ref}>
      <button
        type="button"
        className={`btn btn-sm${compact ? ' acct-group-add' : ''}${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open && createPortal(
        <div ref={dropdownRef} className={`menu-dropdown ${placement === 'above' ? 'open-above' : ''}`} role="listbox" style={{ ...popStyle }}>
          {COMMON_INCOME.map((ci) => {
            const { startAge, endAge } = agesFor(ci);
            return (
              <button
                key={ci.type}
                type="button"
                role="option"
                className="menu-item income-add-item"
                onClick={() => {
                  store.addIncome(scenario.id, {
                    name: ci.name, type: ci.type, annualAmount: ci.annualAmount, startAge, endAge, cola: ci.cola, taxable: ci.taxable,
                  });
                  setOpen(false);
                }}
              >
                <span className="income-add-icon" aria-hidden="true"><Glyph i={ci.icon} /></span>
                <span className="income-add-text">
                  <span className="income-add-name">{ci.name}</span>
                  <span className="income-add-hint">{ci.hint} · {formatCurrency(ci.annualAmount / 12, { compact: true })}/mo</span>
                </span>
              </button>
            );
          })}
          <div className="menu-divider" />
          <button
            type="button"
            role="option"
            className="menu-item income-add-item"
            onClick={() => {
              const base = {
                name: 'New Income', annualAmount: 0,
                startAge: defaultPhase === 'post' ? ret : cur,
                endAge: defaultPhase === 'pre' ? ret - 1 : null,
                cola: true, taxable: true,
              } as const;
              store.addIncome(scenario.id, { ...base, type: defaultPhase === 'post' ? 'pension' : 'other' });
              setOpen(false);
            }}
          >
            <span className="income-add-icon" aria-hidden="true"><Glyph i={Plus} /></span>
            <span className="income-add-text">
              <span className="income-add-name">Custom income…</span>
              <span className="income-add-hint">Blank row, edit details yourself</span>
            </span>
          </button>
        </div>,
        document.body,
      )}
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
        <h2><Wallet size={20} aria-hidden="true" /> Income Sources</h2>
        <IncomeAddMenu scenario={scenario} store={store} label="+ Add Income" />
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
                <span className="income-group-icon"><Briefcase size={16} aria-hidden="true" /></span>
                <span className="income-group-label">Pre-Retirement Income</span>
                <span className="income-group-count">{preRet.length}</span>
                <IncomeAddMenu scenario={scenario} store={store} label="+ Add" defaultPhase="pre" compact />
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
                <span className="income-group-icon"><Landmark size={16} aria-hidden="true" /></span>
                <span className="income-group-label">Retirement Income</span>
                <span className="income-group-count">{postRet.length}</span>
                <IncomeAddMenu scenario={scenario} store={store} label="+ Add" defaultPhase="post" compact />
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
const EVENT_META: Record<EventType, { icon: LucideIcon; hint: string; example: string }> = {
  home_purchase: { icon: Home, hint: 'Down payment and closing costs reduce your savings. Ongoing impact can model higher property taxes or mortgage payments.', example: 'Buy a retirement home' },
  home_sale: { icon: House, hint: 'Proceeds from the sale add to your savings. You can model ongoing impact for reduced housing costs after downsizing.', example: 'Sell current house' },
  large_purchase: { icon: Car, hint: 'A one-time expense like a vehicle, RV, or major renovation. Enter the total cost and when it happens.', example: 'Buy an RV' },
  windfall: { icon: CircleDollarSign, hint: 'An inheritance, gift, or bonus. Enter the proceeds amount and when you expect to receive it.', example: 'Receive inheritance' },
  other: { icon: ClipboardList, hint: 'Any other significant financial event. Use cost for money out, proceeds for money in, and ongoing for recurring impacts.', example: 'Custom event' },
};

// Sensible starting cost/proceeds/ongoing defaults per event type, so the
// "+ Add Event" menu can pre-fill a row that matches the chosen type.
const EVENT_DEFAULTS: Record<EventType, { cost: number; proceeds: number; ongoingAnnualImpact: number }> = {
  home_purchase: { cost: 80000, proceeds: 0, ongoingAnnualImpact: 18000 },
  home_sale: { cost: 0, proceeds: 250000, ongoingAnnualImpact: -6000 },
  large_purchase: { cost: 40000, proceeds: 0, ongoingAnnualImpact: 0 },
  windfall: { cost: 0, proceeds: 100000, ongoingAnnualImpact: 0 },
  other: { cost: 0, proceeds: 0, ongoingAnnualImpact: 0 },
};

/**
 * Popover menu of life event types, presented when "+ Add Event" is clicked.
 * Mirrors IncomeAddMenu / ThemePicker (outside-click + Escape to close).
 * Picking an option adds an event pre-filled with that type's name, icon,
 * and sensible cost/proceeds/ongoing defaults — instead of appending a blank
 * "home_purchase" event.
 */
function EventAddMenu({ scenario, store, label }: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { style: popStyle, placement } = usePopoverPosition(ref, open);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && dropdownRef.current && !dropdownRef.current.contains(t)) setOpen(false);
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
    <div className="menu-wrapper event-add-menu" ref={ref}>
      <button
        type="button"
        className={`btn btn-sm${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open && createPortal(
        <div ref={dropdownRef} className={`menu-dropdown ${placement === 'above' ? 'open-above' : ''}`} role="listbox" style={{ ...popStyle }}>
          {EVENT_TYPES.map((t) => {
            const meta = EVENT_META[t];
            const d = EVENT_DEFAULTS[t];
            const amountHint = d.proceeds > 0
              ? `+${formatCurrency(d.proceeds, { compact: true })}`
              : d.cost > 0
                ? `-${formatCurrency(d.cost, { compact: true })}`
                : 'No amount';
            return (
              <button
                key={t}
                type="button"
                role="option"
                className="menu-item income-add-item"
                onClick={() => {
                  store.addEvent(scenario.id, {
                    name: meta.example, type: t, age: scenario.assumptions.currentAge + 5,
                    cost: d.cost, proceeds: d.proceeds, ongoingAnnualImpact: d.ongoingAnnualImpact,
                    ongoingDurationYears: d.ongoingAnnualImpact !== 0 ? 30 : null, notes: '',
                  });
                  setOpen(false);
                }}
              >
                <span className="income-add-icon" aria-hidden="true"><Glyph i={meta.icon} /></span>
                <span className="income-add-text">
                  <span className="income-add-name">{meta.example}</span>
                  <span className="income-add-hint">{prettify(t)} · {amountHint}</span>
                </span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

function EventsPanel({ scenario, store }: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  store: ReturnType<typeof usePlanStore.getState>;
}) {
  const totalOneTimeCost = scenario.events.reduce((s, e) => s + e.cost, 0);
  const totalOneTimeProceeds = scenario.events.reduce((s, e) => s + e.proceeds, 0);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2><CalendarDays size={20} aria-hidden="true" /> Life Events</h2>
        <EventAddMenu scenario={scenario} store={store} label="+ Add Event" />
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
                <span className="event-icon"><Glyph i={meta.icon} /></span>
                <span className="event-name">
                  <input
                    type="text"
                    value={ev.name}
                    placeholder={`e.g. ${meta.example}`}
                    onChange={(e) => store.updateEvent(scenario.id, ev.id, { name: e.target.value })}
                    aria-label="Event name"
                  />
                </span>
                <select
                  className="table-select"
                  value={ev.type}
                  onChange={(e) => store.updateEvent(scenario.id, ev.id, { type: e.target.value as EventType })}
                  aria-label="Event type"
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

      <ContextualResources group={RESOURCE_GROUPS[2]} />
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
        className="table-input text-right"
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

/**
 * Monthly payment entry for simple mortgage mode. Presents the monthly amount
 * (mortgagePayment / 12) but commits the annual figure (v * 12) so the engine
 * treats it identically to a detailed-mode P+I payment — flat until the
 * balance amortizes to 0, then 0. The "balance" used for amortization is
 * implicitly derived; for simple mode the user only provides payment + years.
 */
function PropMonthlyPaymentField({ prop, scenario, store }: {
  prop: Property; scenario: Scenario; store: ScenarioStore;
}) {
  // The engine stores mortgagePayment as an ANNUAL figure. Show monthly.
  const { display, handleChange, handleBlur, notice } = useEditableNumber({
    value: (prop.mortgagePayment ?? 0) / 12,
    onCommit: (v) => store.updateProperty(scenario.id, prop.id, { mortgagePayment: v * 12 }),
    min: 0,
    toInput: (v) => v.toFixed(0),
  });
  return (
    <div className="prop-field">
      <label>Monthly payment (incl. tax &amp; insurance)</label>
      <div className="input-with-unit">
        <span className="unit">$</span>
        <input
          className="table-input text-right"
          type="number"
          value={display}
          min={0}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
        />
        <span className="unit">/mo</span>
      </div>
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
        className="table-input text-right"
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
        className="table-input text-right"
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
        className="table-input text-right"
        type="number"
        value={display}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
      />
      {notice && <div className="input-snapback">{notice}</div>}
      <div className="prop-hint">Most US mortgages are 15 or 30 years.</div>
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