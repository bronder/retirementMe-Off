import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Plan, Scenario, Account, IncomeSource, Expense, LifeEvent, Assumptions, Property } from './types';
import { defaultPlan, defaultScenario, createId, PLAN_VERSION } from './defaults';
import type { ScenarioSuggestion } from './ai';

interface PlanStore {
  plan: Plan;
  activeScenarioId: string;

  // AI settings (stored separately, not in plan JSON)
  aiProvider: string;
  aiApiKey: string;
  aiModel: string;
  setAiProvider: (provider: string) => void;
  setAiApiKey: (key: string) => void;
  setAiModel: (model: string) => void;

  // Scenario operations
  setActiveScenario: (id: string) => void;
  addScenario: (name?: string) => void;
  duplicateScenario: (id: string, name?: string) => void;
  deleteScenario: (id: string) => void;
  renameScenario: (id: string, name: string) => void;
  updateAssumptions: (scenarioId: string, patch: Partial<Assumptions>) => void;

  /** Create a new scenario from an AI suggestion (duplicates active scenario, applies assumption changes) */
  applyScenarioSuggestion: (suggestion: ScenarioSuggestion) => void;

  // Account operations
  addAccount: (scenarioId: string, account: Omit<Account, 'id'>) => void;
  updateAccount: (scenarioId: string, accountId: string, patch: Partial<Account>) => void;
  deleteAccount: (scenarioId: string, accountId: string) => void;
  reorderAccounts: (scenarioId: string, fromIndex: number, toIndex: number) => void;

  // Property operations
  addProperty: (scenarioId: string, property: Omit<Property, 'id'>) => void;
  updateProperty: (scenarioId: string, propertyId: string, patch: Partial<Property>) => void;
  deleteProperty: (scenarioId: string, propertyId: string) => void;

  // Income operations
  addIncome: (scenarioId: string, income: Omit<IncomeSource, 'id'>) => void;
  updateIncome: (scenarioId: string, incomeId: string, patch: Partial<IncomeSource>) => void;
  deleteIncome: (scenarioId: string, incomeId: string) => void;
  reorderIncome: (scenarioId: string, fromIndex: number, toIndex: number) => void;

  // Expense operations
  addExpense: (scenarioId: string, expense: Omit<Expense, 'id'>) => void;
  updateExpense: (scenarioId: string, expenseId: string, patch: Partial<Expense>) => void;
  deleteExpense: (scenarioId: string, expenseId: string) => void;
  moveExpense: (scenarioId: string, expenseId: string, direction: 'up' | 'down') => void;
  reorderExpenses: (scenarioId: string, fromIndex: number, toIndex: number) => void;

  // Event operations
  addEvent: (scenarioId: string, event: Omit<LifeEvent, 'id'>) => void;
  updateEvent: (scenarioId: string, eventId: string, patch: Partial<LifeEvent>) => void;
  deleteEvent: (scenarioId: string, eventId: string) => void;

  // Import/export
  loadPlan: (plan: Plan) => void;
  resetPlan: () => void;
}

function getScenario(plan: Plan, id: string): Scenario {
  const s = plan.scenarios.find((s) => s.id === id);
  if (!s) throw new Error(`Scenario ${id} not found`);
  return s;
}

export const usePlanStore = create<PlanStore>()(
  persist(
    (set) => ({
      plan: defaultPlan(),
      activeScenarioId: '',
      aiProvider: 'openai',
      aiApiKey: '',
      aiModel: 'gpt-4o-mini',

      setAiProvider: (provider) => set({ aiProvider: provider }),
      setAiApiKey: (key) => set({ aiApiKey: key }),
      setAiModel: (model) => set({ aiModel: model }),

      setActiveScenario: (id) => set({ activeScenarioId: id }),

      addScenario: (name) =>
        set((state) => {
          const newScenario = defaultScenario(name || `Scenario ${state.plan.scenarios.length + 1}`);
          return {
            plan: { ...state.plan, scenarios: [...state.plan.scenarios, newScenario] },
            activeScenarioId: newScenario.id,
          };
        }),

      duplicateScenario: (id, name) =>
        set((state) => {
          const original = getScenario(state.plan, id);
          const copy: Scenario = {
            ...structuredClone(original),
            id: createId(),
            name: name || `${original.name} (copy)`,
          };
          return {
            plan: { ...state.plan, scenarios: [...state.plan.scenarios, copy] },
            activeScenarioId: copy.id,
          };
        }),

      deleteScenario: (id) =>
        set((state) => {
          if (state.plan.scenarios.length <= 1) return state;
          const scenarios = state.plan.scenarios.filter((s) => s.id !== id);
          const activeScenarioId =
            state.activeScenarioId === id ? scenarios[0].id : state.activeScenarioId;
          return { plan: { ...state.plan, scenarios }, activeScenarioId };
        }),

      renameScenario: (id, name) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) => (s.id === id ? { ...s, name } : s)),
          },
        })),

      updateAssumptions: (scenarioId, patch) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) =>
              s.id === scenarioId ? { ...s, assumptions: { ...s.assumptions, ...patch } } : s,
            ),
          },
        })),

      applyScenarioSuggestion: (suggestion) =>
        set((state) => {
          const original = getScenario(state.plan, state.activeScenarioId);
          const copy: Scenario = {
            ...structuredClone(original),
            id: createId(),
            name: suggestion.name,
            assumptions: suggestion.assumptions
              ? { ...original.assumptions, ...suggestion.assumptions }
              : { ...original.assumptions },
          };
          return {
            plan: { ...state.plan, scenarios: [...state.plan.scenarios, copy] },
            activeScenarioId: copy.id,
          };
        }),

      addAccount: (scenarioId, account) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) =>
              s.id === scenarioId
                ? { ...s, accounts: [...s.accounts, { ...account, id: createId() }] }
                : s,
            ),
          },
        })),

      updateAccount: (scenarioId, accountId, patch) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) =>
              s.id === scenarioId
                ? {
                    ...s,
                    accounts: s.accounts.map((a) =>
                      a.id === accountId ? { ...a, ...patch } : a,
                    ),
                  }
                : s,
            ),
          },
        })),

      deleteAccount: (scenarioId, accountId) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) =>
              s.id === scenarioId
                ? { ...s, accounts: s.accounts.filter((a) => a.id !== accountId) }
                : s,
            ),
          },
        })),

      reorderAccounts: (scenarioId: string, fromIndex: number, toIndex: number) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) => {
              if (s.id !== scenarioId) return s;
              const accounts = [...s.accounts];
              if (fromIndex < 0 || fromIndex >= accounts.length || toIndex < 0 || toIndex >= accounts.length) return s;
              const [moved] = accounts.splice(fromIndex, 1);
              accounts.splice(toIndex, 0, moved);
              return { ...s, accounts };
            }),
          },
        })),

      addProperty: (scenarioId, property) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) => {
              if (s.id !== scenarioId) return s;
              const newId = createId();
              const prop = { ...property, id: newId };
              // Auto-create linked expense entries for housing costs so the
              // Expenses section is the single source of truth.
              const linkedExpenses: Expense[] = [
                {
                  id: createId(),
                  name: `${prop.name} — Property Tax`,
                  category: 'housing',
                  annualAmount: prop.annualPropertyTax,
                  preRetirement: false,
                  postRetirement: true,
                  startAge: null,
                  endAge: null,
                  _propertyId: `${newId}:tax`,
                },
                {
                  id: createId(),
                  name: `${prop.name} — Insurance`,
                  category: 'insurance',
                  annualAmount: prop.annualInsurance,
                  preRetirement: false,
                  postRetirement: true,
                  startAge: null,
                  endAge: null,
                  _propertyId: `${newId}:insurance`,
                },
                {
                  id: createId(),
                  name: `${prop.name} — Mortgage`,
                  category: 'housing',
                  annualAmount: prop.mortgagePayment ?? Math.round(prop.mortgageBalance / 30),
                  preRetirement: false,
                  postRetirement: true,
                  startAge: null,
                  endAge: null,
                  _propertyId: `${newId}:mortgage`,
                },
              ];
              return {
                ...s,
                properties: [...(s.properties ?? []), prop],
                expenses: [...s.expenses, ...linkedExpenses],
              };
            }),
          },
        })),

      updateProperty: (scenarioId, propertyId, patch) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) => {
              if (s.id !== scenarioId) return s;
              const prop = s.properties?.find((p) => p.id === propertyId);
              if (!prop) return s;
              const updated = { ...prop, ...patch };
              const updatedExpenses = s.expenses.map((e) => {
                if (e._propertyId === `${propertyId}:tax`) {
                  return { ...e, name: `${updated.name} — Property Tax`, annualAmount: updated.annualPropertyTax };
                }
                if (e._propertyId === `${propertyId}:insurance`) {
                  return { ...e, name: `${updated.name} — Insurance`, annualAmount: updated.annualInsurance };
                }
                if (e._propertyId === `${propertyId}:mortgage`) {
                  return {
                    ...e,
                    name: `${updated.name} — Mortgage`,
                    annualAmount: updated.mortgagePayment ?? Math.round(updated.mortgageBalance / 30),
                  };
                }
                return e;
              });
              return {
                ...s,
                properties: s.properties!.map((p) => (p.id === propertyId ? updated : p)),
                expenses: updatedExpenses,
              };
            }),
          },
        })),

      deleteProperty: (scenarioId, propertyId) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) =>
              s.id === scenarioId
                ? {
                    ...s,
                    properties: (s.properties ?? []).filter((p) => p.id !== propertyId),
                    // Remove any expenses linked to this property
                    expenses: s.expenses.filter((e) => !e._propertyId?.startsWith(propertyId + ':')),
                  }
                : s,
            ),
          },
        })),

      addIncome: (scenarioId, income) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) =>
              s.id === scenarioId
                ? { ...s, incomeSources: [...s.incomeSources, { ...income, id: createId() }] }
                : s,
            ),
          },
        })),

      updateIncome: (scenarioId, incomeId, patch) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) =>
              s.id === scenarioId
                ? {
                    ...s,
                    incomeSources: s.incomeSources.map((i) =>
                      i.id === incomeId ? { ...i, ...patch } : i,
                    ),
                  }
                : s,
            ),
          },
        })),

      deleteIncome: (scenarioId, incomeId) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) =>
              s.id === scenarioId
                ? { ...s, incomeSources: s.incomeSources.filter((i) => i.id !== incomeId) }
                : s,
            ),
          },
        })),

      reorderIncome: (scenarioId: string, fromIndex: number, toIndex: number) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) => {
              if (s.id !== scenarioId) return s;
              const incomeSources = [...s.incomeSources];
              if (fromIndex < 0 || fromIndex >= incomeSources.length || toIndex < 0 || toIndex >= incomeSources.length) return s;
              const [moved] = incomeSources.splice(fromIndex, 1);
              incomeSources.splice(toIndex, 0, moved);
              return { ...s, incomeSources };
            }),
          },
        })),

      addExpense: (scenarioId, expense) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) =>
              s.id === scenarioId
                ? { ...s, expenses: [...s.expenses, { ...expense, id: createId() }] }
                : s,
            ),
          },
        })),

      updateExpense: (scenarioId, expenseId, patch) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) =>
              s.id === scenarioId
                ? {
                    ...s,
                    expenses: s.expenses.map((e) =>
                      e.id === expenseId ? { ...e, ...patch } : e,
                    ),
                  }
                : s,
            ),
          },
        })),

      deleteExpense: (scenarioId, expenseId) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) =>
              s.id === scenarioId
                ? { ...s, expenses: s.expenses.filter((e) => e.id !== expenseId) }
                : s,
            ),
          },
        })),

      reorderExpenses: (scenarioId: string, fromIndex: number, toIndex: number) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) => {
              if (s.id !== scenarioId) return s;
              const expenses = [...s.expenses];
              if (fromIndex < 0 || fromIndex >= expenses.length || toIndex < 0 || toIndex >= expenses.length) return s;
              const [moved] = expenses.splice(fromIndex, 1);
              expenses.splice(toIndex, 0, moved);
              return { ...s, expenses };
            }),
          },
        })),

      moveExpense: (scenarioId, expenseId, direction) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) => {
              if (s.id !== scenarioId) return s;
              const expenses = [...s.expenses];
              const idx = expenses.findIndex((e) => e.id === expenseId);
              if (idx === -1) return s;
              const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
              if (swapIdx < 0 || swapIdx >= expenses.length) return s;
              [expenses[idx], expenses[swapIdx]] = [expenses[swapIdx], expenses[idx]];
              return { ...s, expenses };
            }),
          },
        })),

      addEvent: (scenarioId, event) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) =>
              s.id === scenarioId
                ? { ...s, events: [...s.events, { ...event, id: createId() }] }
                : s,
            ),
          },
        })),

      updateEvent: (scenarioId, eventId, patch) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) =>
              s.id === scenarioId
                ? {
                    ...s,
                    events: s.events.map((e) => (e.id === eventId ? { ...e, ...patch } : e)),
                  }
                : s,
            ),
          },
        })),

      deleteEvent: (scenarioId, eventId) =>
        set((state) => ({
          plan: {
            ...state.plan,
            scenarios: state.plan.scenarios.map((s) =>
              s.id === scenarioId
                ? { ...s, events: s.events.filter((e) => e.id !== eventId) }
                : s,
            ),
          },
        })),

      loadPlan: (plan) => {
        const firstId = plan.scenarios[0]?.id ?? '';
        set({ plan: { ...plan, version: PLAN_VERSION }, activeScenarioId: firstId });
      },

      resetPlan: () => {
        const plan = defaultPlan();
        set({ plan, activeScenarioId: plan.scenarios[0].id });
      },
    }),
    {
      name: 'retirement-planner',
      version: 5,
      partialize: (state) => ({
        plan: state.plan,
        activeScenarioId: state.activeScenarioId,
        aiProvider: state.aiProvider,
        aiApiKey: state.aiApiKey,
        aiModel: state.aiModel,
      }),
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as PlanStore;
        // v0→v2: rename legacy default plan name to "retirementMe-Off"
        if (version < 2 && state?.plan) {
          if (state.plan.name === 'My Retirement Plan') {
            state.plan.name = 'retirementMe-Off';
          }
        }
        // v2→v3: ensure spouse field exists on all scenario assumptions
        if (version < 3 && state?.plan) {
          for (const scenario of state.plan.scenarios) {
            if (!scenario.assumptions.spouse) {
              scenario.assumptions.spouse = {
                enabled: false,
                currentAge: 40,
                retirementAge: 65,
                endAge: 95,
              };
            }
          }
        }
        // v3→v4: ensure properties array exists on all scenarios
        if (version < 4 && state?.plan) {
          for (const scenario of state.plan.scenarios) {
            if (!scenario.properties) {
              scenario.properties = [];
            }
          }
        }
        // v4→v5: housing costs are now sourced from the Expenses section.
        // For every existing property, create linked expense entries for tax,
        // insurance, and mortgage. Skips properties that already have linked
        // expenses (idempotent).
        if (version < 5 && state?.plan) {
          for (const scenario of state.plan.scenarios) {
            if (!scenario.properties) continue;
            const existingLinked = new Set(
              scenario.expenses
                .map((e) => e._propertyId?.split(':')[0])
                .filter((id): id is string => !!id),
            );
            for (const prop of scenario.properties) {
              if (existingLinked.has(prop.id)) continue;
              scenario.expenses.push(
                {
                  id: `mig-${prop.id}-tax`,
                  name: `${prop.name} — Property Tax`,
                  category: 'housing',
                  annualAmount: prop.annualPropertyTax,
                  preRetirement: false,
                  postRetirement: true,
                  startAge: null,
                  endAge: null,
                  _propertyId: `${prop.id}:tax`,
                } as Expense,
                {
                  id: `mig-${prop.id}-insurance`,
                  name: `${prop.name} — Insurance`,
                  category: 'insurance',
                  annualAmount: prop.annualInsurance,
                  preRetirement: false,
                  postRetirement: true,
                  startAge: null,
                  endAge: null,
                  _propertyId: `${prop.id}:insurance`,
                } as Expense,
                {
                  id: `mig-${prop.id}-mortgage`,
                  name: `${prop.name} — Mortgage`,
                  category: 'housing',
                  annualAmount: prop.mortgagePayment ?? Math.round(prop.mortgageBalance / 30),
                  preRetirement: false,
                  postRetirement: true,
                  startAge: null,
                  endAge: null,
                  _propertyId: `${prop.id}:mortgage`,
                } as Expense,
              );
            }
          }
        }
        return state;
      },
      onRehydrateStorage: () => (state) => {
        // Ensure activeScenarioId is valid after rehydration.
        if (state && state.plan.scenarios.length > 0) {
          const exists = state.plan.scenarios.some((s) => s.id === state.activeScenarioId);
          if (!exists) {
            state.activeScenarioId = state.plan.scenarios[0].id;
          }
        }
      },
    },
  ),
);