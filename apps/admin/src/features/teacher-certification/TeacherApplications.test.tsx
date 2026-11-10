import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import { INTERFACE_LOCALES, type InterfaceLocale } from "@tsz/shared/i18n";
import { HttpError } from "@tsz/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "@tsz/ui/admin/overlays";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TeacherApplicationsPage } from "./TeacherApplications";
import { api, usePermission } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  usePermission: vi.fn(),
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ profile: { id: "admin-1" } }),
  api: {
    teacherCertification: {
      list: vi.fn(),
      detail: vi.fn(),
      review: vi.fn(),
      file: vi.fn(),
      revoke: vi.fn()
    }
  }
}));
const application = {
  id: "application-1",
  user_id: "user-1",
  real_name: "李老师",
  contact: "teacher@example.test",
  statement: "申请任教",
  status: "pending" as const,
  submitted_at: "2026-09-28T00:00:00Z",
  reviewed_at: null,
  review_reason: null,
  revoked_at: null,
  revoke_reason: null
};
const show = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const content = (locale: InterfaceLocale) => (
    <InterfaceI18nProvider locale={locale}>
      <QueryClientProvider client={client}>
        <App>
          <TeacherApplicationsPage />
        </App>
      </QueryClientProvider>
    </InterfaceI18nProvider>
  );
  const view = render(content("zh-Hans"));
  return {
    ...view,
    setLocale: (locale: InterfaceLocale) => view.rerender(content(locale))
  };
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(usePermission).mockReturnValue(true);
  vi.mocked(api.teacherCertification.list).mockResolvedValue({
    items: [application],
    total: 1
  });
  vi.mocked(api.teacherCertification.detail).mockResolvedValue({
    application,
    files: []
  });
});

it("does not request applications for an ordinary admin", () => {
  vi.mocked(usePermission).mockReturnValue(false);
  show();
  expect(
    screen.getByText("未开通教师资格申请列表查看权限")
  ).toBeInTheDocument();
  expect(api.teacherCertification.list).not.toHaveBeenCalled();
});

it("审核授权不包含认证原件读取或资格撤销，原件组件不挂载、不请求", async () => {
  vi.mocked(usePermission).mockImplementation(
    (key) => key === "teacherapply.access" || key === "teacherapply.review"
  );
  vi.mocked(api.teacherCertification.detail).mockResolvedValue({
    application,
    files: [
      {
        id: "private-file",
        kind: "id_front",
        content_type: "image/png",
        size_bytes: 100
      }
    ]
  });
  show();
  await screen.findByText("李老师");
  fireEvent.click(screen.getByText("查看材料"));
  await screen.findByText("未开通资格证书或身份证查看权限");
  expect(screen.getByRole("button", { name: "通 过" })).toBeEnabled();
  expect(api.teacherCertification.file).not.toHaveBeenCalled();
  expect(screen.queryByText("撤销教师资格")).toBeNull();
});

it("lets a super admin read an application and requires a rejection reason", async () => {
  show();
  await screen.findByText("李老师");
  fireEvent.click(screen.getByText("查看材料"));
  await screen.findByText("申请任教");
  fireEvent.click(screen.getByRole("button", { name: "驳 回" }));
  fireEvent.click(screen.getByRole("button", { name: "确认驳回" }));
  expect(await screen.findByText("请填写驳回原因")).toBeInTheDocument();
  expect(api.teacherCertification.review).not.toHaveBeenCalled();
});

it.each([
  ["teacherapply.read_certificates", "certificate"],
  ["teacherapply.read_identity", "identity"]
])("%s 只加载对应材料，撤权后移除预览", async (key, visibleId) => {
  vi.mocked(usePermission).mockImplementation(
    (permission) => permission === "teacherapply.access" || permission === key
  );
  vi.mocked(api.teacherCertification.file).mockResolvedValue(
    new Blob(["image"])
  );
  const revoke = vi.fn();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => "blob:test");
      static revokeObjectURL = revoke;
    }
  );
  vi.mocked(api.teacherCertification.detail).mockResolvedValue({
    application,
    files: [
      {
        id: "identity",
        kind: "id_front",
        content_type: "image/png",
        size_bytes: 10
      },
      {
        id: "certificate",
        kind: "education",
        content_type: "image/png",
        size_bytes: 10
      }
    ]
  });
  const view = show();
  await screen.findByText("李老师");
  fireEvent.click(screen.getByText("查看材料"));
  await screen.findByRole("img", {
    name: visibleId === "identity" ? "身份证人像面" : "学历证书"
  });
  expect(api.teacherCertification.file).toHaveBeenCalledTimes(1);
  expect(api.teacherCertification.file).toHaveBeenCalledWith(
    visibleId,
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
  vi.mocked(usePermission).mockImplementation(
    (permission) => permission === "teacherapply.access"
  );
  view.rerender(
    <QueryClientProvider client={new QueryClient()}>
      <App>
        <TeacherApplicationsPage />
      </App>
    </QueryClientProvider>
  );
  expect(
    screen.queryByRole("img", { name: /身份证人像面|学历证书/ })
  ).toBeNull();
  expect(revoke).toHaveBeenCalledWith("blob:test");
  vi.unstubAllGlobals();
});

it("四语保留详情、原文、列身份及驳回输入，已显示校验即时翻译", async () => {
  localStorage.setItem(
    "tsz:admin:table-columns:v1:teacher-applications",
    JSON.stringify([{ key: "contact", visible: false, fixed: false }])
  );
  const view = show();
  await screen.findByText("李老师");
  expect(screen.queryByRole("columnheader", { name: "联系方式" })).toBeNull();
  fireEvent.click(screen.getByText("查看材料"));
  await screen.findByText("申请任教");
  fireEvent.click(screen.getByRole("button", { name: "驳 回" }));
  fireEvent.click(screen.getByRole("button", { name: "确认驳回" }));
  await screen.findByText("请填写驳回原因");
  view.setLocale("en-GB");
  await screen.findByText("Enter a rejection reason");
  const input = screen.getByLabelText("Rejection reason");
  fireEvent.change(input, { target: { value: "  原始原因 centre  " } });
  input.focus();
  for (const locale of INTERFACE_LOCALES) {
    view.setLocale(locale);
    expect(screen.getByRole("textbox")).toBe(input);
    expect(input).toHaveValue("  原始原因 centre  ");
    expect(input).toHaveFocus();
    expect(screen.getByText("申请任教")).toBeInTheDocument();
    expect(screen.getByText("teacher@example.test")).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", {
        name: /联系方式|聯絡方式|Contact details/
      })
    ).toBeNull();
  }
  expect(api.teacherCertification.list).toHaveBeenCalledTimes(1);
  expect(api.teacherCertification.list).toHaveBeenCalledWith(1, 20, "pending");
  expect(api.teacherCertification.detail).toHaveBeenCalledTimes(1);
  expect(api.teacherCertification.review).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));
  await waitFor(() =>
    expect(api.teacherCertification.review).toHaveBeenCalledWith(
      "application-1",
      "reject",
      "原始原因 centre"
    )
  );
});

it.each(["approve", "reject"] as const)(
  "%s 确认在途切换不更换目标、不重发请求，失败原文保留并可明确重试",
  async (decision) => {
    let fail!: (error: Error) => void;
    vi.mocked(api.teacherCertification.review).mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        })
    );
    const view = show();
    await screen.findByText("李老师");
    fireEvent.click(screen.getByText("查看材料"));
    await screen.findByText("申请任教");
    fireEvent.click(
      screen.getByRole("button", {
        name: decision === "approve" ? "通 过" : "驳 回"
      })
    );
    if (decision === "reject")
      fireEvent.change(screen.getByLabelText("驳回原因"), {
        target: { value: "  原始原因  " }
      });
    fireEvent.click(
      screen.getByRole("button", {
        name: decision === "approve" ? "确认通过" : "确认驳回"
      })
    );
    await waitFor(() =>
      expect(api.teacherCertification.review).toHaveBeenCalledTimes(1)
    );
    for (const locale of INTERFACE_LOCALES) view.setLocale(locale);
    expect(
      screen.getByRole("button", {
        name: decision === "approve" ? "Confirm approval" : "Confirm rejection"
      })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByText(
        decision === "approve"
          ? "Approve teacher certification"
          : "Reject teacher application"
      )
    ).toBeInTheDocument();
    await act(async () => fail(new Error("原始未知错误 opaque-42")));
    expect(
      await screen.findByText("原始未知错误 opaque-42")
    ).toBeInTheDocument();
    view.setLocale("zh-Hant");
    expect(screen.getByText("原始未知错误 opaque-42")).toBeInTheDocument();
    expect(api.teacherCertification.review).toHaveBeenCalledTimes(1);
    vi.mocked(api.teacherCertification.review).mockResolvedValueOnce({
      ...application,
      status: decision === "approve" ? "approved" : "rejected"
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: decision === "approve" ? "確認通過" : "確認駁回"
      })
    );
    await waitFor(() =>
      expect(api.teacherCertification.review).toHaveBeenCalledTimes(2)
    );
    expect(vi.mocked(api.teacherCertification.review).mock.calls).toEqual(
      Array(2).fill([
        "application-1",
        decision,
        decision === "reject" ? "原始原因" : undefined
      ])
    );
    await screen.findByText("審核結果已儲存並通知申請人");
  }
);

it("已显示的状态冲突按稳定 code 翻译，切换不会隐式重试", async () => {
  vi.mocked(api.teacherCertification.review).mockRejectedValue(
    new HttpError(409, "认证状态已变化，请刷新后重试", [], "revision_conflict")
  );
  const view = show();
  await screen.findByText("李老师");
  fireEvent.click(screen.getByText("查看材料"));
  await screen.findByText("申请任教");
  fireEvent.click(screen.getByRole("button", { name: "通 过" }));
  fireEvent.click(screen.getByRole("button", { name: "确认通过" }));
  await screen.findByText("认证状态已变化，请刷新后重试");
  view.setLocale("en-US");
  expect(
    screen.getByText("Certification status has changed. Refresh and try again.")
  ).toBeInTheDocument();
  expect(api.teacherCertification.review).toHaveBeenCalledTimes(1);
});

it("材料读取在途/失败/成功跨语言保留身份与 blob，只有明确重试重新读取并在关闭时释放", async () => {
  let fail!: (error: Error) => void;
  vi.mocked(api.teacherCertification.file).mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      })
  );
  const create = vi.fn(() => "blob:teacher-material");
  const revoke = vi.fn();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    }
  );
  vi.mocked(api.teacherCertification.detail).mockResolvedValue({
    application,
    files: [
      {
        id: "private-file",
        kind: "education",
        content_type: "image/png",
        size_bytes: 10
      }
    ]
  });
  const view = show();
  try {
    await screen.findByText("李老师");
    fireEvent.click(screen.getByText("查看材料"));
    await waitFor(() =>
      expect(api.teacherCertification.file).toHaveBeenCalledTimes(1)
    );
    const signal = vi.mocked(api.teacherCertification.file).mock.calls[0]![1]!
      .signal!;
    for (const locale of INTERFACE_LOCALES) view.setLocale(locale);
    expect(signal.aborted).toBe(false);
    expect(api.teacherCertification.file).toHaveBeenCalledTimes(1);
    await act(async () => fail(new Error("unavailable")));
    await screen.findByRole("button", { name: "Reload material" });
    view.setLocale("zh-Hant");
    expect(
      screen.getByRole("button", { name: "重新讀取" })
    ).toBeInTheDocument();
    expect(api.teacherCertification.file).toHaveBeenCalledTimes(1);
    vi.mocked(api.teacherCertification.file).mockResolvedValueOnce(
      new Blob(["synthetic"])
    );
    fireEvent.click(screen.getByRole("button", { name: "重新讀取" }));
    const image = await screen.findByRole("img", { name: "學歷證書" });
    for (const locale of INTERFACE_LOCALES) view.setLocale(locale);
    expect(screen.getByRole("img", { name: "Education certificate" })).toBe(
      image
    );
    expect(image).toHaveAttribute("src", "blob:teacher-material");
    expect(create).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    expect(api.teacherCertification.file).toHaveBeenCalledTimes(2);
    const drawer = screen.getByRole("dialog", {
      name: "Certification materials"
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(revoke).toHaveBeenCalledWith("blob:teacher-material")
    );
    expect(api.teacherCertification.detail).toHaveBeenCalledTimes(1);
  } finally {
    view.unmount();
    vi.unstubAllGlobals();
  }
});

it("筛选仍提交原状态 code，四语切换保留 1 基分页与 page size", async () => {
  vi.mocked(api.teacherCertification.list).mockResolvedValue({
    items: [application],
    total: 41
  });
  const view = show();
  await screen.findByText("李老师");
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "每页条数" }));
  fireEvent.click(
    await screen.findByText("10 条/页", {
      selector: ".ui-select-item-option-content"
    })
  );
  await waitFor(() =>
    expect(api.teacherCertification.list).toHaveBeenLastCalledWith(
      1,
      10,
      "pending"
    )
  );
  fireEvent.click(await screen.findByRole("button", { name: "第 2 页" }));
  await waitFor(() =>
    expect(api.teacherCertification.list).toHaveBeenLastCalledWith(
      2,
      10,
      "pending"
    )
  );
  await screen.findByText("李老师");
  const count = vi.mocked(api.teacherCertification.list).mock.calls.length;
  for (const locale of INTERFACE_LOCALES) view.setLocale(locale);
  expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  expect(
    screen.getByLabelText("Items per page").parentElement
  ).toHaveTextContent("10 / page");
  expect(api.teacherCertification.list).toHaveBeenCalledTimes(count);
  fireEvent.mouseDown(
    screen.getByRole("combobox", { name: "Certification status" })
  );
  fireEvent.click(await screen.findByText("Rejected"));
  await waitFor(() =>
    expect(api.teacherCertification.list).toHaveBeenLastCalledWith(
      1,
      10,
      "rejected"
    )
  );
  const afterFilter = vi.mocked(api.teacherCertification.list).mock.calls
    .length;
  view.setLocale("zh-Hant");
  expect(
    screen.getByRole("combobox", { name: "認證狀態" }).parentElement
  ).toHaveTextContent("已駁回");
  expect(api.teacherCertification.list).toHaveBeenCalledTimes(afterFilter);
  expect(api.teacherCertification.review).not.toHaveBeenCalled();
});
