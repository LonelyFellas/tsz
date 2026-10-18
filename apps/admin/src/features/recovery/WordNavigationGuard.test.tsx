import { ConfigProvider } from "antd";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  Link,
  Outlet,
  RouterProvider
} from "react-router-dom";
import { expect, it } from "vitest";
import { WordNavigationGuard } from "./WordNavigationGuard";

it("keeps unsaved word edits on external navigation while allowing its own step links", async () => {
  const router = createMemoryRouter(
    [
      {
        path: "/words/:id/v3/wizard",
        element: (
          <>
            <WordNavigationGuard wordId="a" dirty busy={false} />
            <Link to="/words/a/v3/wizard/meanings">词义步骤</Link>
            <Link to="/elsewhere">离开词条</Link>
            <Outlet />
          </>
        ),
        children: [
          { path: "forms", element: <p>词形</p> },
          { path: "meanings", element: <p>词义</p> }
        ]
      },
      { path: "/elsewhere", element: <p>其他页面</p> }
    ],
    { initialEntries: ["/words/a/v3/wizard/forms"] }
  );
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <RouterProvider router={router} />
    </ConfigProvider>
  );
  fireEvent.click(screen.getByText("词义步骤"));
  expect(await screen.findByText("词义")).toBeVisible();
  fireEvent.click(screen.getByText("离开词条"));
  await waitFor(() =>
    expect(screen.getByText("词条还有未保存的修改")).toBeVisible()
  );
  expect(screen.queryByText("其他页面")).toBeNull();
  fireEvent.click(screen.getByText("继续编辑"));
  expect(router.state.location.pathname).toBe("/words/a/v3/wizard/meanings");
});

it("does not leave until the embedded sentence guard permits it", async () => {
  let allowed = false;
  const router = createMemoryRouter(
    [
      {
        path: "/words/a/v3/wizard/forms",
        element: (
          <>
            <WordNavigationGuard
              wordId="a"
              dirty
              busy={false}
              requestSentenceLeave={async () => allowed}
            />
            <Link to="/elsewhere">离开词条</Link>
          </>
        )
      },
      { path: "/elsewhere", element: <p>其他页面</p> }
    ],
    { initialEntries: ["/words/a/v3/wizard/forms"] }
  );
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <RouterProvider router={router} />
    </ConfigProvider>
  );
  fireEvent.click(screen.getByText("离开词条"));
  fireEvent.click(await screen.findByText("离开页面"));
  await waitFor(() =>
    expect(screen.getByText("离开页面").closest("button")).not.toHaveClass(
      "ant-btn-loading"
    )
  );
  expect(router.state.location.pathname).toBe("/words/a/v3/wizard/forms");
  allowed = true;
  fireEvent.click(screen.getByText("离开页面"));
  expect(await screen.findByText("其他页面")).toBeVisible();
});
