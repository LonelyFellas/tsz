import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
  expect(screen.getByRole("button", { name: "提交申请" })).toBeDisabled();
});

it("does not allow submission with text but without the required evidence", async () => {
  const user = userEvent.setup();
  renderForm();
  await user.type(await screen.findByLabelText("真实姓名"), "李老师");
  await user.type(screen.getByLabelText("联系方式"), "teacher@example.test");
  await user.type(screen.getByLabelText("认证说明"), "申请成为老师");
  expect(screen.getByRole("button", { name: "提交申请" })).toBeDisabled();
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
    screen.queryByRole("button", { name: "提交申请" })
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText("真实姓名")).not.toBeInTheDocument();
});

it("keeps a retry action for failed old-material cleanup without losing the replacement", async () => {
  const user = userEvent.setup();
  let sequence = 0;
  vi.mocked(api.teacherCertification.upload).mockImplementation(
    async (kind) => ({
      id: `${kind}-${++sequence}`,
      kind,
      content_type: "image/png",
      size_bytes: 4
    })
  );
  vi.mocked(api.teacherCertification.removeFile)
    .mockRejectedValueOnce(new Error("删除连接失败"))
    .mockResolvedValue(undefined);
  vi.mocked(api.teacherCertification.submit).mockRejectedValue(
    new Error("提交连接失败")
  );
  renderForm();
  await user.type(await screen.findByLabelText("真实姓名"), "测试老师");
  await user.type(screen.getByLabelText("联系方式"), "teacher@example.test");
  await user.type(screen.getByLabelText("认证说明"), "申请任教");
  for (const label of [
    "身份证人像面",
    "身份证国徽面",
    "学历证书",
    "语言成绩",
    "身份证人像面"
  ]) {
    await user.upload(
      screen.getByLabelText(label),
      new File(["test"], `material-${sequence}.png`, { type: "image/png" })
    );
    await waitFor(() => expect(screen.getByLabelText(label)).toBeEnabled());
  }
  const retry = await screen.findByRole("button", {
    name: "重试删除身份证人像面"
  });
  expect(api.teacherCertification.removeFile).toHaveBeenCalledWith(
    "id_front-1"
  );
  expect(screen.getByRole("button", { name: "提交申请" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "提交申请" }));
  await screen.findByText("提交连接失败");
  expect(api.teacherCertification.submit).toHaveBeenCalledWith(
    expect.objectContaining({ id_front: "id_front-5" })
  );
  await user.click(retry);
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "重试删除身份证人像面" })
    ).not.toBeInTheDocument()
  );
  expect(api.teacherCertification.removeFile).toHaveBeenLastCalledWith(
    "id_front-1"
  );
  expect(api.teacherCertification.removeFile).toHaveBeenCalledTimes(2);
});
