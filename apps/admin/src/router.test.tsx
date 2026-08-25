import { render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  useLocation
} from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/pages/Words", () => ({
  WordsPage: () => <div>words-page</div>
}));
vi.mock("@/pages/WordCreate", () => ({
  WordCreatePage: () => <div>v2-create-page</div>
}));
vi.mock("@/pages/WordWizard", () => ({
  WordWizardPage: () => <div>v2-wizard-page</div>
}));
vi.mock("@/pages/WordCreateV3", () => ({
  WordCreateV3Page: () => <div>v3-create-page</div>
}));
vi.mock("@/pages/WordWizardV3", () => ({
  WordWizardV3Page: () => <div>v3-wizard-page</div>
}));

import { wordRoutes } from "./router";

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function TestShell() {
  return (
    <>
      <LocationProbe />
      <Outlet />
    </>
  );
}

function renderRoute(initialEntry: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        children: [...wordRoutes, { path: "*", element: <div>not-found</div> }],
        element: <TestShell />
      }
    ],
    { initialEntries: [initialEntry] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("word route parsing", () => {
  it.each(["/words/new", "/words/new?kind=word"])(
    "redirects the legacy word creation entry %s to V3",
    async (entry) => {
      const router = renderRoute(entry);

      expect(await screen.findByText("v3-create-page")).toBeInTheDocument();
      await waitFor(() =>
        expect(router.state.location.pathname).toBe("/words/new/v3")
      );
    }
  );

  it("keeps phrase creation on the existing V2 route", async () => {
    const router = renderRoute("/words/new?kind=phrase");

    expect(await screen.findByText("v2-create-page")).toBeInTheDocument();
    expect(router.state.location).toMatchObject({
      pathname: "/words/new",
      search: "?kind=phrase"
    });
  });

  it.each([
    ["/words/v2-1/wizard/forms", "v2-wizard-page"],
    ["/words/v3-1/v3/wizard/forms", "v3-wizard-page"]
  ])("resolves %s without crossing schema editors", async (entry, expected) => {
    renderRoute(entry);
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });
});
