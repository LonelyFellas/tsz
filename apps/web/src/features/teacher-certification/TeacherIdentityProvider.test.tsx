import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  TeacherIdentityProvider,
  useTeacherIdentity
} from "./TeacherIdentityProvider";
import { api } from "@/lib/request";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/"
}));
vi.mock("@/stores/user", () => ({
  useUserStore: (select: (s: unknown) => unknown) =>
    select({
      user: { id: "student-1", active_role: "student" },
      hydrated: true
    })
}));
vi.mock("@/lib/request", () => ({
  api: { teacherCertification: { mine: vi.fn() } }
}));
afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

function Harness() {
  const value = useTeacherIdentity();
  return (
    <>
      <span>{value.ready ? "身份已核验" : "核验中"}</span>
      <span data-testid="identity">{value.identity}</span>
      <button onClick={() => void value.select("teacher")}>切换</button>
    </>
  );
}

it("keeps the browser choice through revalidation and clears it on revocation", async () => {
  const user = userEvent.setup();
  const verified = { teacher_verified: true, application: null, files: [] };
  vi.mocked(api.teacherCertification.mine).mockResolvedValue(verified);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={client}>
      <TeacherIdentityProvider>
        <Harness />
      </TeacherIdentityProvider>
    </QueryClientProvider>
  );
  await screen.findByText("身份已核验");
  await user.click(screen.getByRole("button", { name: "切换" }));
  await waitFor(() =>
    expect(screen.getByTestId("identity")).toHaveTextContent("teacher")
  );
  await act(async () => {
    await client.refetchQueries({
      queryKey: ["teacher-certification", "student-1"]
    });
  });
  expect(screen.getByTestId("identity")).toHaveTextContent("teacher");
  act(() =>
    client.setQueryData(["teacher-certification", "student-1"], {
      ...verified,
      teacher_verified: false
    })
  );
  await waitFor(() =>
    expect(screen.getByTestId("identity")).toHaveTextContent("student")
  );
  expect(localStorage.getItem("tsz:workspace:student-1")).toBe("student");
});
