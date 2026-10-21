import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, usePermission } from "@/lib/auth";
import { HttpError } from "@tsz/api-client";
import { createAdminAuthStore, hasAdminPermission } from "@tsz/shared/auth";
import { bindAdminAuthorizationCache } from "@/lib/adminAuthorization";

vi.mock("@/lib/auth", () => ({
  usePermission: vi.fn(),
  api: {
    teacherCertification: { revoke: vi.fn() },
    users: { registrationRegion: vi.fn() }
  }
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.users.registrationRegion).mockReset().mockResolvedValue({
    city: "北京",
    status: "resolved"
  });
  vi.mocked(usePermission).mockImplementation((key) =>
    ["users.read_sensitive", "users.read_basic"].includes(key)
  );
});
import type {
  AdminProfile,
  AdminUser,
  UserRegistrationRegion
} from "@tsz/types";
import { UserDetailDrawer } from "./UserDetailDrawer";

const base: AdminUser = {
  id: "u1",
  display_name: "Full",
  avatar_url: "",
  roles: ["student"],
  teacher_verified: false,
  status: "active",
  created_at: "2026-06-01T08:00:00Z",
  updated_at: "2026-06-02T09:30:00Z"
};

function mountRegistrationRegion() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const view = (user: AdminUser | null = base) => (
    <QueryClientProvider client={client}>
      <UserDetailDrawer user={user} onClose={vi.fn()} />
    </QueryClientProvider>
  );
  return { ...render(view()), view, client };
}

describe("UserDetailDrawer", () => {
  it("没有资料权限时，即使旧缓存含完整联系方式和学习配置也不展示", () => {
    vi.mocked(usePermission).mockReturnValue(false);
    render(
      <UserDetailDrawer
        user={{
          ...base,
          phone: "13800138000",
          email: "private@example.test",
          learning_settings: { cefr_level: "C1", english_variant: "AmE" }
        }}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByText("13800138000")).toBeNull();
    expect(screen.queryByText("private@example.test")).toBeNull();
    expect(screen.getAllByText("未授权")).toHaveLength(2);
    expect(screen.queryByText("学生等级")).toBeNull();
    expect(screen.queryByText("英美式偏好")).toBeNull();
    expect(screen.queryByText("C1")).toBeNull();
    expect(screen.queryByText("美式")).toBeNull();
  });
  it("普通管理员只能查看认证状态", () => {
    render(
      <UserDetailDrawer
        user={{ ...base, teacher_verified: true }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("已认证")).toBeInTheDocument();
    expect(screen.queryByText("撤销教师资格")).not.toBeInTheDocument();
  });

  it("超管可以填写原因撤销历史认证并关闭旧详情", async () => {
    vi.mocked(usePermission).mockReturnValue(true);
    vi.mocked(api.teacherCertification.revoke).mockResolvedValue({
      teacher_verified: false
    });
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App>
          <UserDetailDrawer
            user={{ ...base, teacher_verified: true }}
            onClose={onClose}
          />
        </App>
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByText("撤销教师资格"));
    fireEvent.click(screen.getByText("确认撤销"));
    expect(await screen.findByText("请填写撤销原因")).toBeInTheDocument();
    expect(api.teacherCertification.revoke).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("撤销原因"), {
      target: { value: "材料不再有效" }
    });
    fireEvent.click(screen.getByText("确认撤销"));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(api.teacherCertification.revoke).toHaveBeenCalledWith(
      "u1",
      "材料不再有效"
    );
    expect(
      screen.getByText("教师资格已撤销，学生身份与原有数据保留")
    ).toBeInTheDocument();
  });
  it.each([
    ["BrE", "英式"],
    ["AmE", "美式"]
  ] as const)("完整用户：展示学生等级与 %s 偏好", (variant, label) => {
    const user: AdminUser = {
      ...base,
      phone: "13800000009",
      email: "full@qq.com",
      roles: ["student", "teacher"],
      status: "disabled",
      learning_settings: { cefr_level: "B2", english_variant: variant }
    };
    render(<UserDetailDrawer user={user} onClose={vi.fn()} />);
    expect(screen.getByText("13800000009")).toBeInTheDocument();
    expect(screen.getByText("full@qq.com")).toBeInTheDocument();
    expect(screen.getByText("学生等级")).toBeInTheDocument();
    expect(screen.getByText("B2")).toBeInTheDocument();
    expect(screen.getByText("英美式偏好")).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText("已禁用")).toBeInTheDocument();
    // 师生合一：教师仍展示自己作为学生时的等级。
    expect(screen.getByText("学生")).toBeInTheDocument();
    expect(screen.getByText("老师")).toBeInTheDocument();
  });

  it.each([true, false])("展示教师认证状态：%s", (verified) => {
    const user = { ...base, teacher_verified: verified };
    render(<UserDetailDrawer user={user} onClose={vi.fn()} />);
    expect(screen.getByText("教师认证")).toBeInTheDocument();
    expect(
      screen.getByText(verified ? "已认证" : "未认证")
    ).toBeInTheDocument();
  });

  it.each([null, undefined])(
    "学习配置为 %s 时显示未设置，不推断等级或默认英美式偏好",
    (settings) => {
      render(
        <UserDetailDrawer
          user={{ ...base, learning_settings: settings }}
          onClose={vi.fn()}
        />
      );
      expect(screen.getAllByText("未设置")).toHaveLength(2);
      expect(screen.getAllByText("-")).toHaveLength(2);
      expect(screen.getByText("正常")).toBeInTheDocument();
    }
  );

  it("空时间戳走 fmt 占位分支", () => {
    render(
      <UserDetailDrawer
        user={{ ...base, created_at: "", updated_at: "" }}
        onClose={vi.fn()}
      />
    );
    // 注册时间 + 更新时间两处也变占位，占位总数进一步增加。
    expect(screen.getAllByText("-")).toHaveLength(4);
  });

  it("没有地区独立权限时整行隐藏，不请求注册地区", () => {
    mountRegistrationRegion();
    expect(screen.queryByText("注册地区")).toBeNull();
    expect(api.users.registrationRegion).not.toHaveBeenCalled();
  });

  it.each([
    [{ city: "北京", status: "resolved" }, "北京"],
    [{ city: null, status: "not_recorded" }, "未记录"],
    [{ city: null, status: "unknown" }, "未知"]
  ] satisfies Array<[UserRegistrationRegion, string]>)(
    "只有地区权限也自动读取并展示对应状态：%j",
    async (response, label) => {
      vi.mocked(usePermission).mockImplementation(
        (key) => key === "users.read_registration_region"
      );
      vi.mocked(api.users.registrationRegion).mockResolvedValue(response);
      const result = mountRegistrationRegion();
      expect(await screen.findByText(label)).toBeInTheDocument();
      expect(screen.getByText("注册地区")).toBeInTheDocument();
      expect(api.users.registrationRegion).toHaveBeenCalledWith("u1", {
        signal: expect.any(AbortSignal)
      });
      expect(screen.queryByText("用户 ID")).toBeNull();
      result.unmount();
      result.client.clear();
    }
  );

  it("地区加载失败可重试，403 显示无权限而不持续重试", async () => {
    vi.mocked(usePermission).mockImplementation(
      (key) => key === "users.read_registration_region"
    );
    vi.mocked(api.users.registrationRegion)
      .mockRejectedValueOnce(new HttpError(500, "暂时失败"))
      .mockResolvedValueOnce({ city: "杭州", status: "resolved" });
    const result = mountRegistrationRegion();
    expect(await screen.findByText("加载失败")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/重\s*试/));
    expect(await screen.findByText("杭州")).toBeInTheDocument();
    vi.mocked(api.users.registrationRegion).mockRejectedValueOnce(
      new HttpError(403, "forbidden")
    );
    result.rerender(result.view({ ...base, id: "u2" }));
    expect(await screen.findByText("无权限")).toBeInTheDocument();
    expect(screen.queryByText("杭州")).toBeNull();
    expect(screen.queryByText(/重\s*试/)).toBeNull();
    expect(api.users.registrationRegion).toHaveBeenCalledTimes(3);
    result.unmount();
    result.client.clear();
  });

  it("切换用户先清空前一人的城市，关闭抽屉取消未完成的地区请求", async () => {
    vi.mocked(usePermission).mockImplementation(
      (key) => key === "users.read_registration_region"
    );
    const result = mountRegistrationRegion();
    expect(await screen.findByText("北京")).toBeInTheDocument();
    let resolve!: (value: UserRegistrationRegion) => void;
    vi.mocked(api.users.registrationRegion).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    result.rerender(result.view({ ...base, id: "u2" }));
    await waitFor(() =>
      expect(api.users.registrationRegion).toHaveBeenCalledTimes(2)
    );
    expect(screen.queryByText("北京")).toBeNull();
    const signal = vi.mocked(api.users.registrationRegion).mock.calls[1]![1]!
      .signal!;
    result.rerender(result.view(null));
    expect(signal.aborted).toBe(true);
    await act(async () => resolve({ city: "杭州", status: "resolved" }));
    expect(screen.queryByText("杭州")).toBeNull();
    result.unmount();
    result.client.clear();
  });

  it("撤回地区权限取消请求并清缓存，迟到响应不再展示", async () => {
    const store = createAdminAuthStore();
    const profile: AdminProfile = {
      id: "admin",
      role: "admin",
      phone: "13800138000",
      display_name: "管理员",
      preferences: { dialect: "uk" },
      permission_version: 1,
      catalog_version: "v1",
      permissions: ["users.access", "users.read_registration_region"]
    };
    store.getState().setProfile(profile);
    vi.mocked(usePermission).mockImplementation((key) =>
      hasAdminPermission(store.getState().profile, key)
    );
    const result = mountRegistrationRegion();
    expect(await screen.findByText("北京")).toBeInTheDocument();
    const queryKey = ["admin-users", "registration-region", "u1"];
    const detach = bindAdminAuthorizationCache(store, result.client);
    let resolve!: (value: UserRegistrationRegion) => void;
    vi.mocked(api.users.registrationRegion).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    act(() => {
      void result.client.invalidateQueries({ queryKey });
    });
    await waitFor(() =>
      expect(api.users.registrationRegion).toHaveBeenCalledTimes(2)
    );
    expect(result.client.getQueryData(queryKey)).toEqual({
      city: "北京",
      status: "resolved"
    });
    const signal = vi.mocked(api.users.registrationRegion).mock.calls[1]![1]!
      .signal!;
    await act(async () => {
      store.getState().setProfile({
        ...profile,
        permission_version: 2,
        permissions: ["users.access"]
      });
    });
    result.rerender(result.view());
    expect(signal.aborted).toBe(true);
    expect(screen.queryByText("注册地区")).toBeNull();
    await act(async () => resolve({ city: "杭州", status: "resolved" }));
    expect(screen.queryByText("北京")).toBeNull();
    expect(screen.queryByText("杭州")).toBeNull();
    expect(result.client.getQueryData(queryKey)).toBeUndefined();
    detach();
    result.unmount();
    result.client.clear();
  });

  it("user 为 null 时抽屉关闭、不渲染内容", () => {
    render(<UserDetailDrawer user={null} onClose={vi.fn()} />);
    // Descriptions 独有的「用户 ID」标签不应出现。
    expect(screen.queryByText("用户 ID")).toBeNull();
  });
});
