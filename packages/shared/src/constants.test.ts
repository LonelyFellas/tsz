import { describe, expect, it } from "vitest";
import {
  DAILY_CHECKIN_COINS,
  REVIEW_STATUS_LABELS,
  ROLE_LABELS
} from "./constants";

describe("ROLE_LABELS", () => {
  it("三种角色都有中文名", () => {
    expect(ROLE_LABELS).toEqual({
      student: "学生",
      teacher: "老师",
      admin: "平台"
    });
  });
});

describe("REVIEW_STATUS_LABELS", () => {
  it("三种审核状态都有中文名", () => {
    expect(REVIEW_STATUS_LABELS).toEqual({
      pending: "待审核",
      approved: "已通过",
      rejected: "已拒绝"
    });
  });
});

describe("DAILY_CHECKIN_COINS", () => {
  it("每日打卡奖励为 10", () => {
    expect(DAILY_CHECKIN_COINS).toBe(10);
  });
});
