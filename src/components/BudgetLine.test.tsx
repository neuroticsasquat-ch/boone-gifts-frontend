import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { BudgetLine } from "./BudgetLine";
import type { ShoppingScope } from "./MyShopping";
import type { BudgetRollup } from "../types";

const API = "https://boone-gifts-api.localhost";

function rollup(overrides: Partial<BudgetRollup> = {}): BudgetRollup {
  return {
    amount: "200.00",
    spent: "142.00",
    remaining: "58.00",
    bought_count: 3,
    total_count: 7,
    unpriced_count: 0,
    ...overrides,
  };
}

function renderBudget({
  budget = rollup(),
  scope = { kind: "occasion", id: 3 } as ShoppingScope,
  onChanged = vi.fn(),
}: { budget?: BudgetRollup; scope?: ShoppingScope; onChanged?: () => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <BudgetLine budget={budget} scope={scope} onChanged={onChanged} />
    </QueryClientProvider>,
  );
  return { onChanged };
}

describe("BudgetLine", () => {
  it("states the spend, the target and what is left", () => {
    renderBudget();

    expect(screen.getByText("$142.00 of $200.00 spent · $58.00 left")).toBeInTheDocument();
    expect(screen.getByText("3 of 7 bought")).toBeInTheDocument();
  });

  // An overspend is a state worth showing plainly, not an error: no red, no
  // warning icon, just the number.
  it("says how far over a budget is, plainly", () => {
    renderBudget({ budget: rollup({ amount: "200.00", spent: "212.00", remaining: "-12.00" }) });

    expect(screen.getByText("$212.00 of $200.00 spent · $12.00 over")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("counts a budget met exactly as neither left nor over", () => {
    renderBudget({ budget: rollup({ amount: "200.00", spent: "200.00", remaining: "0.00" }) });

    expect(screen.getByText("$200.00 of $200.00 spent · $0.00 left")).toBeInTheDocument();
  });

  it("offers to set a budget when there is none, and still shows the tally", () => {
    renderBudget({ budget: rollup({ amount: null, remaining: null }) });

    expect(screen.getByText("$142.00 spent · no budget set")).toBeInTheDocument();
    expect(screen.getByText("3 of 7 bought")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set budget" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit budget" })).not.toBeInTheDocument();
  });

  // The honesty requirement (project spec §7): an understated total must read
  // as an understatement, never as fact.
  it("discloses purchases with no amount recorded whenever there are any", () => {
    renderBudget({ budget: rollup({ unpriced_count: 2 }) });

    expect(
      screen.getByText("3 of 7 bought · 2 purchases with no amount recorded"),
    ).toBeInTheDocument();
  });

  it("says it in the singular for one such purchase", () => {
    renderBudget({ budget: rollup({ unpriced_count: 1 }) });

    expect(
      screen.getByText("3 of 7 bought · 1 purchase with no amount recorded"),
    ).toBeInTheDocument();
  });

  it("leaves the disclosure off only when the count is zero", () => {
    renderBudget({ budget: rollup({ unpriced_count: 0 }) });

    expect(screen.getByText("3 of 7 bought")).toBeInTheDocument();
    expect(screen.queryByText(/no amount recorded/)).not.toBeInTheDocument();
  });

  describe("setting and editing", () => {
    it("sets a budget on the occasion the tab is scoped to", async () => {
      let body: unknown;
      server.use(
        http.put(`${API}/occasions/3/budget`, async ({ request }) => {
          body = await request.json();
          return HttpResponse.json(rollup({ amount: "300.00", remaining: "158.00" }));
        }),
      );
      const { onChanged } = renderBudget({ budget: rollup({ amount: null, remaining: null }) });

      await userEvent.click(screen.getByRole("button", { name: "Set budget" }));
      await userEvent.type(screen.getByLabelText("Budget"), "300");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(onChanged).toHaveBeenCalled());
      expect(body).toEqual({ amount: "300" });
    });

    it("writes a folder's budget to the folder endpoint", async () => {
      let called = false;
      server.use(
        http.put(`${API}/folders/5/budget`, () => {
          called = true;
          return HttpResponse.json(rollup());
        }),
      );
      const { onChanged } = renderBudget({ scope: { kind: "folder", id: 5 } });

      await userEvent.click(screen.getByRole("button", { name: "Edit budget" }));
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(onChanged).toHaveBeenCalled());
      expect(called).toBe(true);
    });

    // Seeded from the target already set, so editing one is a correction and
    // not a retype.
    it("opens the editor on the budget already set", async () => {
      renderBudget();

      await userEvent.click(screen.getByRole("button", { name: "Edit budget" }));

      expect(screen.getByLabelText("Budget")).toHaveValue("200.00");
    });

    it("opens an empty editor when no budget is set", async () => {
      renderBudget({ budget: rollup({ amount: null, remaining: null }) });

      await userEvent.click(screen.getByRole("button", { name: "Set budget" }));

      expect(screen.getByLabelText("Budget")).toHaveValue("");
    });

    it("leaves the budget alone on cancel", async () => {
      const { onChanged } = renderBudget();

      await userEvent.click(screen.getByRole("button", { name: "Edit budget" }));
      await userEvent.clear(screen.getByLabelText("Budget"));
      await userEvent.type(screen.getByLabelText("Budget"), "999");
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByLabelText("Budget")).not.toBeInTheDocument();
      expect(onChanged).not.toHaveBeenCalled();
      expect(screen.getByText("$142.00 of $200.00 spent · $58.00 left")).toBeInTheDocument();
    });

    it("refuses an amount that is not a number, and says why", async () => {
      renderBudget();

      await userEvent.click(screen.getByRole("button", { name: "Edit budget" }));
      await userEvent.clear(screen.getByLabelText("Budget"));
      await userEvent.type(screen.getByLabelText("Budget"), "lots");

      expect(screen.getByText("Enter an amount of $0 or more.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("refuses a negative budget", async () => {
      renderBudget();

      await userEvent.click(screen.getByRole("button", { name: "Edit budget" }));
      await userEvent.clear(screen.getByLabelText("Budget"));
      await userEvent.type(screen.getByLabelText("Budget"), "-5");

      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    // Zero is a real target — "I mean to spend nothing here" — and the backend
    // accepts it, so the field must not treat it as empty.
    it("accepts a budget of zero", async () => {
      let body: unknown;
      server.use(
        http.put(`${API}/occasions/3/budget`, async ({ request }) => {
          body = await request.json();
          return HttpResponse.json(rollup({ amount: "0.00" }));
        }),
      );
      const { onChanged } = renderBudget({ budget: rollup({ amount: null, remaining: null }) });

      await userEvent.click(screen.getByRole("button", { name: "Set budget" }));
      await userEvent.type(screen.getByLabelText("Budget"), "0");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(onChanged).toHaveBeenCalled());
      expect(body).toEqual({ amount: "0" });
    });

    it("cannot save an empty field", async () => {
      renderBudget({ budget: rollup({ amount: null, remaining: null }) });

      await userEvent.click(screen.getByRole("button", { name: "Set budget" }));

      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      expect(screen.queryByText("Enter an amount of $0 or more.")).not.toBeInTheDocument();
    });

    it("reports a write that fails and keeps the editor open", async () => {
      server.use(
        http.put(`${API}/occasions/3/budget`, () => new HttpResponse(null, { status: 500 })),
      );
      const { onChanged } = renderBudget();

      await userEvent.click(screen.getByRole("button", { name: "Edit budget" }));
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(screen.getByLabelText("Budget")).toBeInTheDocument());
      expect(onChanged).not.toHaveBeenCalled();
    });
  });

  describe("clearing", () => {
    it("removes the budget and leaves the counts standing", async () => {
      let called = false;
      server.use(
        http.delete(`${API}/occasions/3/budget`, () => {
          called = true;
          return HttpResponse.json(rollup({ amount: null, remaining: null }));
        }),
      );
      const { onChanged } = renderBudget();

      await userEvent.click(screen.getByRole("button", { name: "Edit budget" }));
      await userEvent.click(screen.getByRole("button", { name: "Remove budget" }));

      await waitFor(() => expect(onChanged).toHaveBeenCalled());
      expect(called).toBe(true);
    });

    // There is nothing to remove, and the backend answers 404 to the attempt.
    it("does not offer removal when no budget is set", async () => {
      renderBudget({ budget: rollup({ amount: null, remaining: null }) });

      await userEvent.click(screen.getByRole("button", { name: "Set budget" }));

      expect(screen.queryByRole("button", { name: "Remove budget" })).not.toBeInTheDocument();
    });
  });
});
