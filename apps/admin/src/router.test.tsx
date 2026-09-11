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
  WordCreatePage: () => <div>unified-create-page</div>
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
  it.each(["/words/new", "/words/new?kind=word", "/words/new?kind=phrase"])(
    "keeps every product creation entry on the unified page: %s",
    async (entry) => {
      const router = renderRoute(entry);

      expect(
        await screen.findByText("unified-create-page")
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/words/new");
    }
  );

  it("redirects the old V3 creation deep link to the unified page", async () => {
    const router = renderRoute("/words/new/v3");

    expect(await screen.findByText("unified-create-page")).toBeInTheDocument();
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/words/new")
    );
  });

  it("resolves the V3 wizard deep link", async () => {
    renderRoute("/words/v3-1/v3/wizard/forms");
    expect(await screen.findByText("v3-wizard-page")).toBeInTheDocument();
  });

  it("旧向导路径已下线，落到 404 而不是静默跳回某个编辑器", async () => {
    renderRoute("/words/v2-1/wizard/forms");
    expect(await screen.findByText("not-found")).toBeInTheDocument();
  });
});
