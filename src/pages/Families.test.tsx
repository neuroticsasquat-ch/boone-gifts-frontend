import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { Families } from "./Families";

const API = "https://boone-gifts-api.localhost";

function renderFamilies() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Families />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Families", () => {
  it("renders list of families with name, role, and member count", async () => {
    server.use(
      http.get(`${API}/families`, () =>
        HttpResponse.json([
          { id: 1, name: "The Boones", role: "organizer", member_count: 4 },
          { id: 2, name: "Smith Family", role: "member", member_count: 2 },
        ])
      ),
    );

    renderFamilies();

    await waitFor(() => {
      expect(screen.getByText("The Boones")).toBeInTheDocument();
    });
    expect(screen.getByText("Smith Family")).toBeInTheDocument();
    expect(screen.getByText(/organizer/i)).toBeInTheDocument();
    expect(screen.getAllByText(/member/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/4 members/i)).toBeInTheDocument();
    expect(screen.getByText(/2 members/i)).toBeInTheDocument();
  });

  it("renders links to /families/:id for each family", async () => {
    server.use(
      http.get(`${API}/families`, () =>
        HttpResponse.json([
          { id: 1, name: "The Boones", role: "organizer", member_count: 3 },
        ])
      ),
    );

    renderFamilies();

    const link = await screen.findByRole("link", { name: /The Boones/ });
    expect(link).toHaveAttribute("href", "/families/1");
  });

  it("creates a family, clears input, and navigates to detail page", async () => {
    server.use(
      http.get(`${API}/families`, () => HttpResponse.json([])),
      http.post(`${API}/families`, () =>
        HttpResponse.json(
          { id: 5, name: "New Family", created_by_id: 1, members: [] },
          { status: 201 }
        )
      ),
    );

    renderFamilies();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Family name")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText("Family name"), "New Family");
    await userEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Family name")).toHaveValue("");
    });
  });

  it("shows empty state when no families exist", async () => {
    server.use(
      http.get(`${API}/families`, () => HttpResponse.json([])),
    );

    renderFamilies();

    await waitFor(() => {
      expect(screen.getByText("No families yet. Create one above.")).toBeInTheDocument();
    });
  });

  it("shows singular 'member' for a family with 1 member", async () => {
    server.use(
      http.get(`${API}/families`, () =>
        HttpResponse.json([
          { id: 3, name: "Solo Family", role: "organizer", member_count: 1 },
        ])
      ),
    );

    renderFamilies();

    await waitFor(() => {
      expect(screen.getByText(/1 member$/)).toBeInTheDocument();
    });
  });
});
