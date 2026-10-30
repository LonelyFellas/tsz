import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { HeroVisual } from "./HeroVisual";

// Vitest 不执行 Next 的静态图片 metadata loader；这里只替代资源导入边界。
vi.mock("./hero-images", () => ({
  HOME_IMAGES: Object.fromEntries(
    ["ocean", "wave", "shore"].map((word) => [
      word,
      {
        avif: `/images/${word}.avif 1400w`,
        webp: `/images/${word}.webp 1400w`,
        fallback: {
          src: `/images/${word}.webp`,
          width: 1400,
          height: 933,
          blurDataURL: "data:image/webp;base64,UklGRg=="
        }
      }
    ])
  )
}));

it("首图完成前不请求隐藏图片，完成后低优先级加载其余图片", async () => {
  render(<HeroVisual />);
  expect(screen.getAllByRole("img", { hidden: true })).toHaveLength(1);
  const first = screen.getByRole("img");
  expect(first).toHaveAttribute("fetchpriority", "high");
  fireEvent.load(first);
  await waitFor(() =>
    expect(screen.getAllByRole("img", { hidden: true })).toHaveLength(3)
  );
  const images = screen.getAllByRole("img", { hidden: true });
  expect(images).toHaveLength(3);
  for (const image of images.slice(1)) {
    expect(image).toHaveAttribute("fetchpriority", "low");
    expect(image).toHaveAttribute("aria-hidden", "true");
  }
});

it("首图未完成时切词立即加载所选图片，首图失败也不阻塞后续图片", () => {
  render(<HeroVisual />);
  const first = screen.getByRole("img");
  fireEvent.click(screen.getByRole("button", { name: "下一个单词" }));
  expect(screen.getByRole("heading", { name: "wave" })).toBeInTheDocument();
  expect(screen.getByRole("img")).toHaveAttribute("src", "/images/wave.webp");
  expect(screen.getByRole("img")).toHaveAttribute("fetchpriority", "high");
  fireEvent.error(first);
  expect(screen.getAllByRole("img", { hidden: true })).toHaveLength(3);
  expect(screen.getByRole("img")).toHaveAttribute("src", "/images/wave.webp");
});

it("三个单词各有对应图片，循环与返回时图片保持一致", () => {
  render(<HeroVisual />);
  const sources: string[] = [];
  const descriptions: string[] = [];
  for (const word of ["ocean", "wave", "shore"]) {
    expect(screen.getByRole("heading", { name: word })).toBeInTheDocument();
    const image = screen.getByRole("img");
    sources.push(image.getAttribute("src")!);
    descriptions.push(image.getAttribute("alt")!);
    fireEvent.click(screen.getByRole("button", { name: "下一个单词" }));
  }
  expect(new Set(sources).size).toBe(3);
  expect(new Set(descriptions).size).toBe(3);
  expect(screen.getByRole("img")).toHaveAttribute("src", sources[0]);
  fireEvent.click(screen.getByRole("button", { name: "上一个单词" }));
  expect(screen.getByRole("heading", { name: "shore" })).toBeInTheDocument();
  expect(screen.getByRole("img")).toHaveAttribute("src", sources[2]);
});

it("切词时词面、音标、释义和例句保持一致", () => {
  render(<HeroVisual />);
  expect(screen.getByRole("heading", { name: "ocean" })).toBeInTheDocument();
  expect(screen.getByText("/ˈəʊʃən/")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "下一个单词" }));
  expect(screen.getByRole("heading", { name: "wave" })).toBeInTheDocument();
  expect(screen.getByText("/weɪv/")).toBeInTheDocument();
  expect(screen.getByText(/海浪；波浪/)).toBeVisible();
  expect(screen.getByText("一道海浪涌向沙滩。")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent(
    "wave，第 2 个，共 3 个示例单词"
  );
});

it("前后切换可以循环，快速点击不会留下旧单词内容", () => {
  render(<HeroVisual />);
  fireEvent.click(screen.getByRole("button", { name: "上一个单词" }));
  expect(screen.getByRole("heading", { name: "shore" })).toBeInTheDocument();
  for (let i = 0; i < 2; i++)
    fireEvent.click(screen.getByRole("button", { name: "下一个单词" }));
  expect(screen.getByRole("heading", { name: "wave" })).toBeInTheDocument();
  expect(screen.queryByText("我们沿着岸边散步。")).not.toBeInTheDocument();
});

it("可以用键盘隐藏并查看释义，切词后恢复当前单词的释义", async () => {
  const user = userEvent.setup();
  render(<HeroVisual />);
  const toggle = screen.getByRole("button", { name: "隐藏释义" });
  toggle.focus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("button", { name: "查看释义" })).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  expect(screen.getByText("海洋将我们紧密相连。")).not.toBeVisible();
  await user.keyboard("{Enter}");
  expect(screen.getByText("海洋将我们紧密相连。")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "隐藏释义" }));
  await user.click(screen.getByRole("button", { name: "下一个单词" }));
  expect(screen.getByRole("button", { name: "隐藏释义" })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  expect(screen.getByText("一道海浪涌向沙滩。")).toBeVisible();
});

it("首页预览沿用词汇与音标字体，词性使用正文", () => {
  render(<HeroVisual />);
  expect(screen.getByRole("heading", { name: "ocean" })).toHaveClass(
    "tsz-words"
  );
  expect(screen.getByText("/ˈəʊʃən/")).toHaveClass("tsz-phonetics");
  expect(screen.getByText("n.")).not.toHaveClass("tsz-words");
});
