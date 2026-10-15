import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/request";
import { NotificationTabBadge } from "./NotificationTabBadge";
import { Notifications } from "./Notifications";

const session = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  hydrated: true
}));
vi.mock("@/stores/user", () => ({
  useUserStore: (select: (state: typeof session) => unknown) => select(session)
}));
vi.mock("@/lib/request", () => ({
  api: {
    teacherCertification: { notifications: vi.fn(), readNotification: vi.fn() }
  }
}));
const fillText = vi.fn();
let images: { onload?: () => void; src: string }[];
let client: QueryClient;
const data = (count: number) => ({
  items: [],
  total: count,
  unread_count: count
});
const tree = (list = false) => (
  <QueryClientProvider client={client}>
    <NotificationTabBadge />
    {list && <Notifications />}
  </QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  session.user = { id: "user-1" };
  session.hydrated = true;
  document.head.innerHTML =
    '<title>首页 | 天生会背</title><link rel="icon" href="/icon.png">';
  images = [];
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      constructor() {
        images.push(this);
      }
    }
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    fillText
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/png;base64,badge"
  );
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(api.teacherCertification.notifications).mockResolvedValue(data(3));
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps page titles on navigation and restores the original icon and title at zero", async () => {
  render(tree());
  await waitFor(() => expect(document.title).toBe("(3) 首页 | 天生会背"));
  act(() => images.at(-1)?.onload?.());
  expect(document.querySelectorAll('link[rel="icon"]')).toHaveLength(2);
  expect(fillText).toHaveBeenCalledWith("3", 49, 16);
  document.title = "通知 | 天生会背";
  await waitFor(() => expect(document.title).toBe("(3) 通知 | 天生会背"));
  act(() => client.setQueryData(["notifications", "user-1", 1], data(123)));
  await waitFor(() => expect(document.title).toBe("(123) 通知 | 天生会背"));
  act(() => images.at(-1)?.onload?.());
  expect(fillText).toHaveBeenLastCalledWith("99+", 40, 16);
  act(() => client.setQueryData(["notifications", "user-1", 1], data(0)));
  await waitFor(() => expect(document.title).toBe("通知 | 天生会背"));
  expect(document.querySelectorAll('link[rel="icon"]')).toHaveLength(1);
  expect(document.querySelector('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/icon.png"
  );
});

it.each(["wordlist_liked", "wordlist_tipped"] as const)(
  "shares %s notifications with the page and clears the badge after marking read",
  async (kind) => {
    const item = {
      id: "n1",
      kind,
      wordlist_id: "list-1",
      wordlist_name: "四级词汇",
      actor_name: "小明",
      amount: kind === "wordlist_tipped" ? "7" : null,
      application_id: null,
      reason: null,
      created_at: "2026-10-15T00:00:00Z",
      read_at: null
    };
    vi.mocked(api.teacherCertification.notifications).mockResolvedValue({
      items: [item],
      total: 1,
      unread_count: 1
    });
    vi.mocked(api.teacherCertification.readNotification).mockResolvedValue({
      ...item,
      read_at: "2026-10-15T01:00:00Z"
    });
    render(tree(true));
    await waitFor(() => expect(document.title).toBe("(1) 首页 | 天生会背"));
    expect(api.teacherCertification.notifications).toHaveBeenCalledTimes(1);
    vi.mocked(api.teacherCertification.notifications).mockResolvedValue(
      data(0)
    );
    fireEvent.click(screen.getByRole("button", { name: "标为已读" }));
    await waitFor(() => expect(document.title).toBe("首页 | 天生会背"));
  }
);

it("clears the previous account badge and ignores late image loads after logout", async () => {
  const view = render(tree());
  await waitFor(() => expect(document.title).toContain("(3)"));
  const oldImage = images.at(-1);
  session.user = { id: "user-2" };
  vi.mocked(api.teacherCertification.notifications).mockResolvedValue(data(0));
  view.rerender(tree());
  await waitFor(() => expect(document.title).toBe("首页 | 天生会背"));
  session.user = null;
  view.rerender(tree());
  act(() => oldImage?.onload?.());
  expect(document.querySelectorAll('link[rel="icon"]')).toHaveLength(1);
});
