import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { WordListBrowser } from "./WordListBrowser";
vi.mock("@/lib/request", () => ({
  api: { wordList: { list: vi.fn().mockRejectedValue(new Error("offline")) } }
}));
it("read failure is visible and never falls back to prototype data", async () => {
  renderWithProviders(<WordListBrowser />);
  expect(await screen.findByRole("alert")).toHaveTextContent("词表加载失败");
  expect(screen.queryByText("小学一年级核心词")).not.toBeInTheDocument();
});
