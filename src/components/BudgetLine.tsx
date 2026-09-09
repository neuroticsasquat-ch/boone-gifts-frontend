import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { clearFolderBudget, setFolderBudget } from "../api/folders";
import { clearOccasionBudget, setOccasionBudget } from "../api/occasions";
import { formatMoney } from "../lib/money";
// Type-only, so it is erased at compile time and the two modules never form a
// runtime cycle (`verbatimModuleSyntax`). The scope is the shopping tab's own
// vocabulary and belongs with the tab.
import type { ShoppingScope } from "./MyShopping";
import type { BudgetRollup } from "../types";

const INVALID = "Enter an amount of $0 or more.";

/**
 * The line at the top of every **My shopping** tab: what the viewer has spent,
 * the target they set for themselves, and how the two compare (project spec
 * §7, §9.2).
 *
 * **Every figure here is the viewer's own.** Nothing on this surface is
 * attributed to, or aggregated across, another person — organizers set an
 * occasion's name and never see any money (`CONTEXT.md` rule 2).
 */
export function BudgetLine({
  budget,
  scope,
  onChanged,
}: {
  budget: BudgetRollup;
  scope: ShoppingScope;
  onChanged: () => void;
}) {
  const hasBudget = budget.amount !== null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const setMutation = useMutation({
    mutationFn: (amount: string) =>
      scope.kind === "occasion"
        ? setOccasionBudget(scope.id, amount)
        : setFolderBudget(scope.id, amount),
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
    // The editor stays open on a failure: the amount they typed is still in it,
    // and closing would make them retype it to find out whether it took.
    onError: () => toast.error("Failed to save the budget."),
  });

  const clearMutation = useMutation({
    mutationFn: () =>
      scope.kind === "occasion" ? clearOccasionBudget(scope.id) : clearFolderBudget(scope.id),
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
    onError: () => toast.error("Failed to remove the budget."),
  });

  const isSaving = setMutation.isPending || clearMutation.isPending;

  const trimmed = draft.trim();
  // Zero is a real target — "I mean to spend nothing here" — so it is only the
  // empty field, and not a falsy value, that counts as nothing to save.
  const parsed = Number(trimmed);
  const isValid = trimmed !== "" && Number.isFinite(parsed) && parsed >= 0;

  function openEditor() {
    // Seeded from the target already set, so editing one is a correction rather
    // than a retype. Empty when there is none, because there is nothing honest
    // to pre-fill it with — the spend so far is a fact about the past, not a
    // proposal for the target.
    setDraft(budget.amount ?? "");
    setEditing(true);
  }

  return (
    <div className="rounded-lg bg-white px-4 py-3 shadow">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm font-medium text-gray-900">{summarize(budget)}</p>
        {!editing && (
          <button
            type="button"
            onClick={openEditor}
            className="text-sm text-blue-600 hover:underline"
          >
            {hasBudget ? "Edit budget" : "Set budget"}
          </button>
        )}
      </div>

      {/* Always rendered, budget or no budget: the tally describes the viewer's
          shopping either way, and the unpriced count is what keeps an
          understated total from reading as fact (project spec §7). */}
      <p className="mt-0.5 text-xs text-gray-500">{tally(budget)}</p>

      {editing && (
        <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
          <label htmlFor="budget-amount" className="block text-xs text-gray-600">
            Budget
          </label>
          <input
            id="budget-amount"
            type="text"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-28 rounded border border-gray-300 px-2 py-1 text-sm"
          />
          {trimmed !== "" && !isValid && <p className="text-xs text-red-600">{INVALID}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMutation.mutate(trimmed)}
              disabled={!isValid || isSaving}
              className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {setMutation.isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={isSaving}
              className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
            >
              Cancel
            </button>
            {/* Clearing is its own button rather than an empty save: the write
                that clears is a different request, and the backend answers 404
                when there is no budget to remove — so it is offered only when
                there is one. */}
            {hasBudget && (
              <button
                type="button"
                onClick={() => clearMutation.mutate()}
                disabled={isSaving}
                className="rounded px-2 py-0.5 text-xs font-medium text-gray-600 hover:text-red-600 disabled:opacity-50"
              >
                {clearMutation.isPending ? "Removing…" : "Remove budget"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The money line: `$142.00 of $200.00 spent · $58.00 left`.
 *
 * Going over is said plainly — `$12.00 over` — and not as an error: a budget is
 * a target, not a limit, and a line that scolds is one people stop setting.
 *
 * With no target set, the spend still shows. It is the viewer's own figure and
 * hiding it until they commit to a number would be tidier and less honest.
 */
function summarize(budget: BudgetRollup): string {
  const spent = formatMoney(budget.spent) ?? budget.spent;
  const target = formatMoney(budget.amount);
  if (target === null) return `${spent} spent · no budget set`;

  const remaining = Number(budget.remaining);
  const magnitude = formatMoney(String(Math.abs(remaining))) ?? "";
  return `${spent} of ${target} spent · ${magnitude} ${remaining < 0 ? "over" : "left"}`;
}

/**
 * The tally beneath it: `3 of 7 bought · 2 purchases with no amount recorded`.
 *
 * **The disclosure renders whenever the count is non-zero.** A purchase with no
 * amount is counted as bought and excluded from the money total, so without
 * this clause the line above reads as fact when it is an understatement. It is
 * not a detail to drop for a tidier layout (project spec §7).
 */
function tally(budget: BudgetRollup): string {
  const bought = `${budget.bought_count} of ${budget.total_count} bought`;
  if (budget.unpriced_count === 0) return bought;
  const noun = budget.unpriced_count === 1 ? "purchase" : "purchases";
  return `${bought} · ${budget.unpriced_count} ${noun} with no amount recorded`;
}
