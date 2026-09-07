import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { Lists } from "./Lists";

const API = "https://boone-gifts-api.localhost";

const testRequest = {
  id: 7,
  status: "pending",
  user: { id: 3, name: "Dave Boone", email: "dave@test.com" },
  created_at: "2026-01-01T00:00:00Z",
  accepted_at: null,
};

function noLists() {
  server.use(http.get(`${API}/lists`, () => HttpResponse.json([])));
}

function renderLists() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return { queryClient, ...render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Lists />
      </MemoryRouter>
    </QueryClientProvider>
  )};
}

describe("Lists", () => {
  it("renders the actionable banner above the lists", async () => {
    noLists();
    server.use(
      http.get(`${API}/connections/requests`, () => HttpResponse.json([testRequest])),
    );

    renderLists();

    const banner = await screen.findByRole("region", { name: "Waiting on you" });
    expect(banner).toBeInTheDocument();
    expect(screen.getByText(/wants to connect/)).toBeInTheDocument();

    // The banner precedes the lists heading in document order.
    const heading = screen.getByRole("heading", { name: /My Lists/ });
    expect(banner.compareDocumentPosition(heading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("renders no banner region when nothing is pending", async () => {
    noLists();

    const { queryClient } = renderLists();

    await waitFor(() => {
      expect(queryClient.getQueryState(["connectionRequests"])?.status).toBe("success");
      expect(queryClient.getQueryState(["familyInvites"])?.status).toBe("success");
    });
    expect(screen.queryByRole("region", { name: "Waiting on you" })).not.toBeInTheDocument();
  });
});
