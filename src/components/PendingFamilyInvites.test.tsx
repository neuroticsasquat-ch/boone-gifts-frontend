import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { PendingFamilyInvites } from "./PendingFamilyInvites";

const API = "https://boone-gifts-api.localhost";

const testInvite = {
  id: 1,
  token: "tok-abc123",
  role: "member",
  family: { id: 10, name: "The Smiths" },
  invited_by: { id: 5, name: "Alice Smith" },
  expires_at: "2026-12-31T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
};

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return { queryClient, ...render(
    <QueryClientProvider client={queryClient}>
      <PendingFamilyInvites />
    </QueryClientProvider>
  )};
}

describe("PendingFamilyInvites", () => {
  it("renders incoming invites with family name and inviter name", async () => {
    server.use(
      http.get(`${API}/families/invites`, () =>
        HttpResponse.json([testInvite])
      ),
    );

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("The Smiths")).toBeInTheDocument();
    });
    expect(screen.getByText(/Alice Smith/)).toBeInTheDocument();
    expect(screen.getByText("Accept")).toBeInTheDocument();
    expect(screen.getByText("Decline")).toBeInTheDocument();
    expect(screen.getByText("Pending Family Invites")).toBeInTheDocument();
  });

  it("hides section when invite list is empty", async () => {
    server.use(
      http.get(`${API}/families/invites`, () => HttpResponse.json([])),
    );

    renderComponent();

    await waitFor(() => {
      expect(screen.queryByText("Pending Family Invites")).not.toBeInTheDocument();
    });
  });

  it("fires POST /families/invites/{token}/accept when Accept is clicked", async () => {
    const acceptHandler = vi.fn();

    server.use(
      http.get(`${API}/families/invites`, () => HttpResponse.json([testInvite])),
      http.post(`${API}/families/invites/:token/accept`, ({ params }) => {
        acceptHandler(params.token);
        return HttpResponse.json({ family: testInvite.family, role: "member" });
      }),
    );

    renderComponent();

    const acceptBtn = await screen.findByText("Accept");
    await userEvent.click(acceptBtn);

    await waitFor(() => {
      expect(acceptHandler).toHaveBeenCalledWith("tok-abc123");
    });
  });

  it("fires POST /families/invites/{token}/decline when Decline is clicked", async () => {
    const declineHandler = vi.fn();

    server.use(
      http.get(`${API}/families/invites`, () => HttpResponse.json([testInvite])),
      http.post(`${API}/families/invites/:token/decline`, ({ params }) => {
        declineHandler(params.token);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderComponent();

    const declineBtn = await screen.findByText("Decline");
    await userEvent.click(declineBtn);

    await waitFor(() => {
      expect(declineHandler).toHaveBeenCalledWith("tok-abc123");
    });
  });

  it("invalidates familyInvites and shows stale-invite toast on 409 accept", async () => {
    server.use(
      http.get(`${API}/families/invites`, () => HttpResponse.json([testInvite])),
      http.post(`${API}/families/invites/:token/accept`, () =>
        new HttpResponse(null, { status: 409 })
      ),
    );

    const { queryClient } = renderComponent();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const acceptBtn = await screen.findByText("Accept");
    await userEvent.click(acceptBtn);

    await waitFor(() => {
      const keys = invalidateSpy.mock.calls.map(
        (c) => (c[0] as { queryKey: unknown }).queryKey
      );
      expect(keys).toContainEqual(["familyInvites"]);
    });
  });

  it("invalidates familyInvites, families, and lists/family queries on accept", async () => {
    server.use(
      http.get(`${API}/families/invites`, () => HttpResponse.json([testInvite])),
      http.post(`${API}/families/invites/:token/accept`, () =>
        HttpResponse.json({ family: testInvite.family, role: "member" })
      ),
    );

    const { queryClient } = renderComponent();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const acceptBtn = await screen.findByText("Accept");
    await userEvent.click(acceptBtn);

    await waitFor(() => {
      const calls = invalidateSpy.mock.calls.map((c) => c[0]);
      const keys = calls.map((c) => (c as { queryKey: unknown }).queryKey);
      expect(keys).toContainEqual(["familyInvites"]);
      expect(keys).toContainEqual(["families"]);
      expect(keys).toContainEqual(["lists", "family"]);
    });
  });
});
