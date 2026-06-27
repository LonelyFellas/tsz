import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplyTeacherForm } from "./ApplyTeacherForm";

vi.mock("@/lib/request", () => ({
  api: { auth: { applyTeacher: vi.fn().mockResolvedValue(undefined) } }
}));

import { api } from "@/lib/request";
const mockApply = vi.mocked(api.auth.applyTeacher);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ApplyTeacherForm", () => {
  it("姓名为空 → 提交按钮禁用", () => {
    render(<ApplyTeacherForm />);
    expect(screen.getByRole("button", { name: "提交审核" })).toBeDisabled();
  });

  it("填写姓名后提交 → 调 applyTeacher 带 { realName }", async () => {
    const user = userEvent.setup();
    render(<ApplyTeacherForm />);

    await user.type(screen.getByRole("textbox"), "张三");
    await user.click(screen.getByRole("button", { name: "提交审核" }));

    await waitFor(() => {
      expect(mockApply).toHaveBeenCalledWith({ realName: "张三" });
    });
  });

  it("传入 rejectReason → 展示上次被拒原因", () => {
    render(<ApplyTeacherForm rejectReason="资料不全" />);
    expect(screen.getByText(/上次申请被拒/)).toBeInTheDocument();
    expect(screen.getByText(/资料不全/)).toBeInTheDocument();
  });
});
