import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ApplyTeacherForm } from "./ApplyTeacherForm";
import { api } from "@/lib/request";

vi.mock("@/lib/request", () => ({
  api: {
    teacherCertification: {
      mine: vi.fn(),
      submit: vi.fn(),
      upload: vi.fn(),
      file: vi.fn(),
      removeFile: vi.fn()
    }
  }
}));
vi.mock("@/stores/user", () => ({
  useUserStore: (select: (state: unknown) => unknown) =>
    select({ user: { id: "student-1" } })
}));

const renderForm = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false }
          }
        })
      }
    >
      <ApplyTeacherForm />
    </QueryClientProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.teacherCertification.mine).mockResolvedValue({
    teacher_verified: false,
    application: null,
    files: []
  });
  vi.mocked(api.teacherCertification.file).mockRejectedValue(
    new Error("preview unavailable")
  );
});

it("requires all prototype fields and does not offer a role selector", async () => {
  renderForm();
  expect(await screen.findByLabelText("联系方式")).toBeRequired();
  expect(screen.getByLabelText("真实姓名")).toHaveAttribute("maxLength", "50");
  expect(screen.getByLabelText("认证说明")).toHaveAttribute(
    "maxLength",
    "2000"
  );
  expect(screen.getByLabelText("身份证人像面")).toBeInTheDocument();
  expect(screen.getByLabelText("身份证国徽面")).toBeInTheDocument();
  expect(screen.getByLabelText("学历证书")).toBeInTheDocument();
  expect(screen.getByLabelText("语言成绩")).toBeInTheDocument();
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "提交审核" })).toBeDisabled();
});

it("does not allow submission with text but without the required evidence", async () => {
  const user = userEvent.setup();
  renderForm();
  await user.type(await screen.findByLabelText("真实姓名"), "李老师");
  await user.type(screen.getByLabelText("联系方式"), "teacher@example.test");
  await user.type(screen.getByLabelText("认证说明"), "申请成为老师");
  expect(screen.getByRole("button", { name: "提交审核" })).toBeDisabled();
  expect(api.teacherCertification.submit).not.toHaveBeenCalled();
});

it("shows a pending application without editable fields or a second submit", async () => {
  vi.mocked(api.teacherCertification.mine).mockResolvedValue({
    teacher_verified: false,
    files: [],
    application: {
      id: "application-1",
      user_id: "student-1",
      real_name: "李老师",
      contact: "teacher@example.test",
      statement: "申请任教",
      status: "pending",
      submitted_at: "2026-09-28T00:00:00Z",
      reviewed_at: null,
      review_reason: null,
      revoked_at: null,
      revoke_reason: null
    }
  });
  renderForm();
  expect(await screen.findByText("审核中")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "提交审核" })
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText("真实姓名")).not.toBeInTheDocument();
});
