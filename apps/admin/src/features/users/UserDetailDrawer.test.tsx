import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AdminUserView } from "@tsz/types";
import { UserDetailDrawer } from "./UserDetailDrawer";

const base: AdminUserView = {
  id: "u1",
  display_name: "Full",
  avatar_url: "",
  roles: ["student"],
  status: "active",
  created_at: "2026-06-01T08:00:00Z",
  updated_at: "2026-06-02T09:30:00Z"
};

describe("UserDetailDrawer", () => {
  it("完整用户：联系方式/等级/余额/禁用态全部展示", () => {
    const user: AdminUserView = {
      ...base,
      phone: "13800000009",
      email: "full@qq.com",
      roles: ["student", "teacher"],
      status: "disabled",
      coin_balance: 1234,
      level: "B2"
    };
    render(<UserDetailDrawer user={user} onClose={vi.fn()} />);
    expect(screen.getByText("13800000009")).toBeInTheDocument();
    expect(screen.getByText("full@qq.com")).toBeInTheDocument();
    // 等级 Tag：level 存在时渲染「B2等级」而非占位。
    expect(screen.getByText("B2等级")).toBeInTheDocument();
    expect(screen.getByText("1234")).toBeInTheDocument();
    expect(screen.getByText("已禁用")).toBeInTheDocument();
    // 师生合一：两个角色 tag 都在。
    expect(screen.getByText("学生")).toBeInTheDocument();
    expect(screen.getByText("老师")).toBeInTheDocument();
  });

  it("最小用户：缺失字段显示占位「-」，状态正常", () => {
    render(<UserDetailDrawer user={base} onClose={vi.fn()} />);
    // phone / email / level / coin 四处缺省 → 至少 4 个占位「-」。
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText("正常")).toBeInTheDocument();
  });

  it("空时间戳走 fmt 占位分支", () => {
    render(
      <UserDetailDrawer
        user={{ ...base, created_at: "", updated_at: "" }}
        onClose={vi.fn()}
      />
    );
    // 注册时间 + 更新时间两处也变占位，占位总数进一步增加。
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(6);
  });

  it("user 为 null 时抽屉关闭、不渲染内容", () => {
    render(<UserDetailDrawer user={null} onClose={vi.fn()} />);
    // Descriptions 独有的「用户 ID」标签不应出现。
    expect(screen.queryByText("用户 ID")).toBeNull();
  });
});
