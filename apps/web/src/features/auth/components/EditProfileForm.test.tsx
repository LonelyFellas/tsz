import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeResponse } from "@tsz/api-client";
import type { User } from "@tsz/types";
import { EditProfileForm } from "./EditProfileForm";
import { useUserStore } from "@/stores/user";

const mockBack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: mockBack })
}));

vi.mock("@/lib/request", () => ({
  api: {
    auth: {
      me: vi.fn(),
      updateProfile: vi.fn()
    }
  }
}));

// 三步上传流程本身在 ../avatar 单测覆盖,这里只 mock 两个函数;
// AVATAR_ACCEPT 等常量透传真实值,避免测试对着手抄副本自证。
vi.mock("../avatar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../avatar")>()),
  isAvatarStorageUnavailable: vi.fn(() => false),
  uploadAvatar: vi.fn()
}));

import { api } from "@/lib/request";
import {
  AVATAR_ACCEPT,
  isAvatarStorageUnavailable,
  uploadAvatar
} from "../avatar";
const mockMe = vi.mocked(api.auth.me);
const mockUpdate = vi.mocked(api.auth.updateProfile);
const mockUnavailable = vi.mocked(isAvatarStorageUnavailable);
const mockUploadAvatar = vi.mocked(uploadAvatar);

const PHONE = "13899997777";

function userWith(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    phone: PHONE,
    display_name: "Alice",
    roles: ["student"],
    avatar_url: "",
    active_role: "student",
    ...overrides
  };
}

function meResponse(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    user: userWith(),
    active_role: "student",
    learning_settings: { cefr_level: "A1", english_variant: "BrE" },
    onboarded: true,
    ...overrides
  };
}

beforeEach(() => {
  // resetAllMocks 连实现一起清(clearAllMocks 只清 calls):
  // 防止 mockUploadAvatar 等的 mockResolvedValue/mockRejectedValue 跨用例泄漏。
  vi.resetAllMocks();
  useUserStore.setState({ user: null });
  mockMe.mockResolvedValue(meResponse());
  mockUnavailable.mockReturnValue(false);
});

// ── 加载与渲染 ────────────────────────────────────────
describe("EditProfileForm — 加载与渲染", () => {
  it("挂载即拉取 /me,展示联系方式 / 等级口音徽标 / 昵称回填", async () => {
    render(<EditProfileForm />);

    expect(await screen.findByText(PHONE)).toBeInTheDocument();
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("英式")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Alice")).toBeInTheDocument();
    expect(mockMe).toHaveBeenCalledTimes(1);
  });

  it("learning_settings 为 null → 不渲染等级/口音徽标", async () => {
    mockMe.mockResolvedValue(meResponse({ learning_settings: null }));
    render(<EditProfileForm />);

    await screen.findByDisplayValue("Alice");
    expect(screen.queryByText("A1")).not.toBeInTheDocument();
    expect(screen.queryByText("英式")).not.toBeInTheDocument();
  });

  it.each([
    { phone: PHONE },
    { phone: undefined, email: "a@b.com" },
    { phone: PHONE, email: "a@b.com" }
  ])("联系方式维护统一进入账号安全页：%j", async (contact) => {
    mockMe.mockResolvedValue(meResponse({ user: userWith(contact) }));
    render(<EditProfileForm />);
    expect(
      await screen.findByRole("link", { name: /账号安全/ })
    ).toHaveAttribute("href", "/account/security");
    expect(
      screen.queryByPlaceholderText("请输入验证码")
    ).not.toBeInTheDocument();
  });

  it("拉取失败 → 显示兜底文案", async () => {
    mockMe.mockRejectedValue(new Error("boom"));
    render(<EditProfileForm />);
    expect(
      await screen.findByText("资料加载失败,请刷新重试。")
    ).toBeInTheDocument();
  });
});

// ── 昵称 ──────────────────────────────────────────────
describe("EditProfileForm — 昵称", () => {
  it("实时显示字数计数", async () => {
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    expect(screen.getByText("5/50")).toBeInTheDocument();
  });

  it("无任何改动 → 确定按钮禁用,不发请求", async () => {
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");

    expect(screen.getByRole("button", { name: "确定" })).toBeDisabled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("无改动直接提交表单(回车) → 提示「没有需要保存的修改」且不发请求", async () => {
    const { container } = render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");

    fireEvent.submit(container.querySelector("form")!);
    expect(screen.getByText("没有需要保存的修改")).toBeInTheDocument();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("仅改昵称 → 调 updateProfile、刷新 store、显示「操作成功」", async () => {
    mockUpdate.mockResolvedValue({ user: userWith({ display_name: "Bob" }) });
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    const input = screen.getByDisplayValue("Alice");
    await user.clear(input);
    await user.type(input, "Bob");
    await user.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("Bob");
      expect(screen.getByText("操作成功")).toBeInTheDocument();
    });
    expect(useUserStore.getState().user?.display_name).toBe("Bob");
  });

  it("昵称含禁字符 → 实时红字提示且确定禁用,不发请求", async () => {
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    const input = screen.getByDisplayValue("Alice");
    await user.clear(input);
    await user.type(input, "Bob<Alice");

    expect(
      screen.getByText("昵称不能包含 < > 或不可见字符")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确定" })).toBeDisabled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("含 & ' 的合法昵称 → 不误拦,正常提交", async () => {
    mockUpdate.mockResolvedValue({
      user: userWith({ display_name: "Tom&Jerry" })
    });
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    const input = screen.getByDisplayValue("Alice");
    await user.clear(input);
    await user.type(input, "Tom&Jerry");

    expect(
      screen.queryByText("昵称不能包含 < > 或不可见字符")
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确定" }));
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("Tom&Jerry");
    });
  });

  it("绕过预检的禁字符被后端 400 → 映射为同一句中文提示", async () => {
    mockUpdate.mockRejectedValue(
      new Error("display name cannot contain < > or invisible characters")
    );
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    const input = screen.getByDisplayValue("Alice");
    await user.clear(input);
    // 零宽空格(U+200B)预检同样能拦;此处直接走后端拒绝路径,
    // 验证 PROFILE_ERRORS 的键与后端原文逐字一致。
    await user.type(input, "Bob");
    await user.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(
        screen.getByText("昵称不能包含 < > 或不可见字符")
      ).toBeInTheDocument();
    });
  });

  it("遗留昵称含禁字符但未改动 → 不提示且保留账号安全入口", async () => {
    mockMe.mockResolvedValue(
      meResponse({ user: userWith({ display_name: "A<lice" }) })
    );
    render(<EditProfileForm />);
    await screen.findByDisplayValue("A<lice");
    expect(
      screen.queryByText("昵称不能包含 < > 或不可见字符")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /账号安全/ })).toHaveAttribute(
      "href",
      "/account/security"
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("昵称校验失败(400) → 红字提示且不绑定", async () => {
    mockUpdate.mockRejectedValue(new Error("display name cannot be blank"));
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    const input = screen.getByDisplayValue("Alice");
    await user.clear(input);
    await user.type(input, "Bob");
    await user.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(screen.getByText("昵称需为 1–50 个字符")).toBeInTheDocument();
    });
  });

  it("提交失败的红字在再次编辑昵称时立即清除", async () => {
    mockUpdate.mockRejectedValue(new Error("display name cannot be blank"));
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    const input = screen.getByDisplayValue("Alice");
    await user.clear(input);
    await user.type(input, "Bob");
    await user.click(screen.getByRole("button", { name: "确定" }));
    await waitFor(() => {
      expect(screen.getByText("昵称需为 1–50 个字符")).toBeInTheDocument();
    });

    // 不需要重新提交,输入一有变化陈旧错误就该消失。
    await user.type(input, "by");
    expect(screen.queryByText("昵称需为 1–50 个字符")).not.toBeInTheDocument();
  });

  it("遗留昵称带首尾空格且未编辑 → 不误判为已修改,确定保持禁用", async () => {
    mockMe.mockResolvedValue(
      meResponse({ user: userWith({ display_name: " Alice " }) })
    );
    render(<EditProfileForm />);
    // testing-library 默认 normalizer 会 trim,能匹配到 " Alice "。
    await screen.findByDisplayValue("Alice");

    expect(screen.getByRole("button", { name: "确定" })).toBeDisabled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ── 头像上传 ──────────────────────────────────────────
describe("EditProfileForm — 头像上传", () => {
  const AVATAR_URL = "https://cdn.example.com/avatars/u1/v2.webp";

  function pngFile(): File {
    return new File(["x"], "me.png", { type: "image/png" });
  }

  /** 通过隐藏的 file input 选图(jsdom 里点按钮不会真弹系统选图框)。 */
  async function pickFile(user: ReturnType<typeof userEvent.setup>) {
    const file = pngFile();
    await user.upload(screen.getByLabelText("选择头像图片"), file);
    return file;
  }

  it("点击「更换头像」→ 触发隐藏 file input(accept 收紧到白名单)", async () => {
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    const input = screen.getByLabelText<HTMLInputElement>("选择头像图片");
    const clickSpy = vi.spyOn(input, "click");
    await user.click(screen.getByRole("button", { name: "更换头像" }));

    expect(clickSpy).toHaveBeenCalled();
    // 与真实模块常量对账(mock 工厂透传原值,这里断言的是生产用的白名单)。
    expect(input.accept).toBe(AVATAR_ACCEPT);
    expect(mockUploadAvatar).not.toHaveBeenCalled();
  });

  it("弹出选图框(未选文件即取消) → 不清掉页面上已有的成功提示", async () => {
    mockUpdate.mockResolvedValue({ user: userWith({ display_name: "Bob" }) });
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    // 先改昵称保存出「操作成功」。
    const input = screen.getByDisplayValue("Alice");
    await user.clear(input);
    await user.type(input, "Bob");
    await user.click(screen.getByRole("button", { name: "确定" }));
    await screen.findByText("操作成功");

    // 点头像只是弹选图框,用户可能直接取消——提示应保留。
    await user.click(screen.getByRole("button", { name: "更换头像" }));
    expect(screen.getByText("操作成功")).toBeInTheDocument();
  });

  it("选图成功 → 调 uploadAvatar、store 与页面头像更新为新 avatar_url", async () => {
    mockUploadAvatar.mockResolvedValue(userWith({ avatar_url: AVATAR_URL }));
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    const file = await pickFile(user);

    await waitFor(() => {
      expect(mockUploadAvatar).toHaveBeenCalledWith(file);
      expect(screen.getByAltText("头像")).toHaveAttribute("src", AVATAR_URL);
    });
    expect(useUserStore.getState().user?.avatar_url).toBe(AVATAR_URL);
  });

  it("上传中 → 头像按钮与「确定」都禁用(与保存互斥),完成后恢复", async () => {
    let resolve!: (u: User) => void;
    mockUploadAvatar.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    // 先制造「确定」本可提交的条件(昵称有改动)。
    const input = screen.getByDisplayValue("Alice");
    await user.clear(input);
    await user.type(input, "Bob");
    expect(screen.getByRole("button", { name: "确定" })).toBeEnabled();

    await pickFile(user);
    expect(screen.getByRole("button", { name: "更换头像" })).toBeDisabled();
    // 并发 commit 会互相覆盖,上传中保存必须锁死。
    expect(screen.getByRole("button", { name: "确定" })).toBeDisabled();

    resolve(userWith({ avatar_url: AVATAR_URL }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "更换头像" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "确定" })).toBeEnabled();
    });
  });

  it("上传中直接触发表单 submit(绕过禁用按钮) → 不发保存请求(互斥不只靠 disabled)", async () => {
    let resolve!: (u: User) => void;
    mockUploadAvatar.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    const input = screen.getByDisplayValue("Alice");
    await user.clear(input);
    await user.type(input, "Bob");
    await pickFile(user);

    // requestSubmit()/回车隐式提交可绕过按钮 disabled,handleSubmit 必须自己拦。
    fireEvent.submit(
      screen.getByRole("button", { name: "确定" }).closest("form")!
    );
    expect(mockUpdate).not.toHaveBeenCalled();

    resolve(userWith({ avatar_url: AVATAR_URL }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "确定" })).toBeEnabled();
    });
  });

  it("保存中 → 点「更换头像」不弹选图(反向互斥)", async () => {
    let resolve!: (v: { user: User }) => void;
    mockUpdate.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    const input = screen.getByDisplayValue("Alice");
    await user.clear(input);
    await user.type(input, "Bob");
    await user.click(screen.getByRole("button", { name: "确定" }));

    const clickSpy = vi.spyOn(
      screen.getByLabelText<HTMLInputElement>("选择头像图片"),
      "click"
    );
    await user.click(screen.getByRole("button", { name: "更换头像" }));
    expect(clickSpy).not.toHaveBeenCalled();

    resolve({ user: userWith({ display_name: "Bob" }) });
    await screen.findByText("操作成功");
  });

  it("上传失败 → 头像下方红字翻译文案,原头像不变(仍显示首字母占位)", async () => {
    mockUploadAvatar.mockRejectedValue(new Error("avatar file too large"));
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    await pickFile(user);

    expect(await screen.findByText("图片不能超过 5MB")).toBeInTheDocument();
    // 失败不 commit:store 不被写入,页面上也没有 <img>(初始 avatar_url 为空)。
    expect(useUserStore.getState().user).toBeNull();
    expect(screen.queryByAltText("头像")).not.toBeInTheDocument();
  });

  it("头像图片加载失败 → 回退首字母占位(不留破图)", async () => {
    mockMe.mockResolvedValue(
      meResponse({ user: userWith({ avatar_url: AVATAR_URL }) })
    );
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");

    fireEvent.error(screen.getByAltText("头像"));
    expect(screen.queryByAltText("头像")).not.toBeInTheDocument();
    // 首字母占位回归(Alice → A)。
    expect(screen.getByRole("button", { name: "更换头像" })).toHaveTextContent(
      "A"
    );
  });

  it("confirm 落库 500(internal error) → 提示「保存失败,请重试」", async () => {
    mockUploadAvatar.mockRejectedValue(new Error("internal error"));
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    await pickFile(user);

    expect(await screen.findByText("保存失败,请重试")).toBeInTheDocument();
  });

  it("OSS 直传失败 → 提示「上传失败,请重试」", async () => {
    mockUploadAvatar.mockRejectedValue(new Error("oss upload failed"));
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    await pickFile(user);

    expect(await screen.findByText("上传失败,请重试")).toBeInTheDocument();
  });

  it("非 Error 异常 → 展示兜底文案", async () => {
    mockUploadAvatar.mockRejectedValue("boom");
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    await pickFile(user);

    expect(
      await screen.findByText("头像上传失败,请稍后再试")
    ).toBeInTheDocument();
  });

  it("会话内已知存储未开通(501) → 点击直接提示「即将上线」,不弹选图", async () => {
    mockUnavailable.mockReturnValue(true);
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    const clickSpy = vi.spyOn(
      screen.getByLabelText<HTMLInputElement>("选择头像图片"),
      "click"
    );
    await user.click(screen.getByRole("button", { name: "更换头像" }));

    expect(screen.getByText("头像功能即将上线")).toBeInTheDocument();
    expect(clickSpy).not.toHaveBeenCalled();
    expect(mockUploadAvatar).not.toHaveBeenCalled();
  });
});

// ── 交互 ──────────────────────────────────────────────
describe("EditProfileForm — 交互", () => {
  it("点击「← 返回」/「取消」→ 调 router.back()", async () => {
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "← 返回" }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(mockBack).toHaveBeenCalledTimes(2);
  });
});
