import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { User } from "@tsz/types";
import { HeroCTA } from "./HeroCTA";
import { useUserStore } from "@/stores/user";

const USER: User = {
  id: "u1",
  phone: "13800138000",
  display_name: "Alice",
  roles: ["student"],
  avatar_url: "",
  status: "active",
  created_at: "",
  updated_at: ""
};

beforeEach(() => {
  useUserStore.setState({ user: null, onboarded: null, hydrated: false });
});

describe("HeroCTA", () => {
  it("会话恢复中 → 占位,不渲染任何链接", () => {
    render(<HeroCTA />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("未登录 → 登录 + 浏览词表,各自 href", () => {
    useUserStore.setState({ hydrated: true, user: null });
    render(<HeroCTA />);
    expect(screen.getByText("登录").closest("a")).toHaveAttribute(
      "href",
      "/login"
    );
    expect(screen.getByText("浏览词表 ›").closest("a")).toHaveAttribute(
      "href",
      "/wordlists"
    );
  });

  it("已登录且已引导 → 进入学习指向 /wordlists", () => {
    useUserStore.setState({ hydrated: true, user: USER, onboarded: true });
    render(<HeroCTA />);
    expect(screen.getByText("进入学习").closest("a")).toHaveAttribute(
      "href",
      "/wordlists"
    );
  });

  it("已登录但未引导 → 进入学习指向 /onboarding", () => {
    useUserStore.setState({ hydrated: true, user: USER, onboarded: false });
    render(<HeroCTA />);
    expect(screen.getByText("进入学习").closest("a")).toHaveAttribute(
      "href",
      "/onboarding"
    );
  });
});
