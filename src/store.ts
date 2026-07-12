import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Plan, Scenario, Account, IncomeSource, Expense, LifeEvent, Assumptions } from './types';
import { defaultPlan, defaultScenario, createId, PLAN_VERSION } from './defaults';

interface PlanStore {
  plan: Plan;
  activeScenarioId: string;

  // Scenario operations
  setActiveScenario: (id: string) => void;
  addScenario: (name?: string) => void;
  duplicateScenario: (id: string, name?: string) => void;
  deleteScenario: (id: string) => void;
  renameScenario: (id: string, name: string) => void;
  updateAssumptions: (scenarioId: string, patch: Partial<Assumptions>) => void;

  // Account operations
  addAccount: (scenarioId: string, account: Omit<Account, 'id'>) => void;
  updateAccount: (scenarioId: string, accountId: string, patch: Partial<Account>) => void;
  deleteAccount: (scenarioId: string, accountId: string) => void;
  reorderAccounts: (scenarioId: string, fromIndex: number, toIndex: number) => void;

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
      version: 3,
      partialize: (state) => ({
        plan: state.plan,
        activeScenarioId: state.activeScenarioId,
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