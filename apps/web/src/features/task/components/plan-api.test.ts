import { beforeEach, it, expect, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  oldList: vi.fn(),
  oldDetail: vi.fn()
}));
vi.mock("@/lib/request", () => ({
  api: {
    learningPlans: { list: mocks.list, detail: mocks.detail },
    learning: { list: mocks.oldList, detail: mocks.oldDetail }
  }
}));
import { listPlans, detailPlan } from "./plan-api";
beforeEach(() => vi.resetAllMocks());
it("only a missing plans API falls back to legacy; permission and server failures remain visible", async () => {
  mocks.list.mockRejectedValue(new HttpError(404, "absent"));
  mocks.oldList.mockResolvedValue({ items: [], pagination: { total: 0 } });
  expect((await listPlans({})).items).toEqual([]);
  expect(mocks.oldList).toHaveBeenCalledOnce();
  mocks.oldList.mockClear();
  mocks.list.mockRejectedValue(new HttpError(403, "denied"));
  await expect(listPlans({})).rejects.toThrow("denied");
  expect(mocks.oldList).not.toHaveBeenCalled();
});
it("a missing single resource does not downgrade an available plans API", async () => {
  mocks.detail.mockRejectedValue(new HttpError(404, "missing resource"));
  mocks.list.mockResolvedValue({ items: [] });
  await expect(detailPlan("missing")).rejects.toThrow("missing resource");
  expect(mocks.oldDetail).not.toHaveBeenCalled();
});
