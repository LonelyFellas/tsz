import { beforeEach, describe, expect, it } from "vitest";
import type { User } from "@tsz/types";
import { useUserStore } from "./user";

const USER: User = {
  id: "u1",
  phone: "13800138000",
  nickname: "Alice",
  roles: ["student"],
  coins: 0,
  createdAt: ""
};

beforeEach(() => {
  useUserStore.setState({ user: null, onboarded: null, hydrated: false });
});

describe("useUserStore", () => {
  it("初始状态", () => {
    const s = useUserStore.getState();
    expect(s.user).toBeNull();
    expect(s.onboarded).toBeNull();
    expect(s.hydrated).toBe(false);
  });

  it("setUser / setOnboarded / setHydrated", () => {
    const { setUser, setOnboarded, setHydrated } = useUserStore.getState();
    setUser(USER);
    setOnboarded(true);
    setHydrated(true);
    const s = useUserStore.getState();
    expect(s.user).toEqual(USER);
    expect(s.onboarded).toBe(true);
    expect(s.hydrated).toBe(true);
  });

  it("hasRole：命中与未命中", () => {
    useUserStore.setState({ user: USER });
    expect(useUserStore.getState().hasRole("student")).toBe(true);
    expect(useUserStore.getState().hasRole("teacher")).toBe(false);
  });

  it("hasRole：无用户时为 false", () => {
    expect(useUserStore.getState().hasRole("student")).toBe(false);
  });
});
