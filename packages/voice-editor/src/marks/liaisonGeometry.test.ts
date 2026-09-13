import { afterEach, describe, expect, it, vi } from "vitest";
import {
  anchorTip,
  buildLiaisonArcs,
  collectLiaisonGlyphs,
  createGlyphMeasurer,
  type LiaisonLinkElements
} from "./liaisonGeometry";
import { liaisonPath } from "./liaisonPath";

function rect(left: number, top: number, width: number, height: number) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({})
  } as DOMRect;
}

function element(box: DOMRect, text = "w"): HTMLElement {
  const node = document.createElement("span");
  node.textContent = text;
  node.getBoundingClientRect = () => box;
  return node;
}

function anchor(box: DOMRect, text = "w") {
  const node = element(box, text);
  return { glyphs: [{ source: node, element: node, text }] };
}

describe("anchorTip", () => {
  it("starts a hair above the ink top, not at the box top, when metrics are known", () => {
    // 26px 下 w 的墨迹上伸 13.44、字体上伸 28：字盒顶 100 → 100 + 14.56 − 0.06em
    const tip = anchorTip({ left: 10, right: 30, top: 100, bottom: 137 }, 26, {
      fontAscent: 28,
      inkAscent: 13.44
    });
    expect(tip.x).toBe(20);
    expect(tip.tipY).toBeCloseTo(113, 5);
  });

  it("falls back to the box top without metrics", () => {
    expect(
      anchorTip({ left: 10, right: 30, top: 100, bottom: 137 }, 26, undefined)
    ).toEqual({ x: 20, tipY: 100 });
  });
});

describe("buildLiaisonArcs", () => {
  const container = document.createElement("div");
  container.getBoundingClientRect = () => rect(0, 0, 400, 100);
  const style = {
    fontSize: "20px",
    paddingLeft: "10px",
    paddingRight: "10px"
  } as CSSStyleDeclaration;
  const measure = () => ({ fontAscent: 20, inkAscent: 10 });
  const tipY = 50 + 10 - 1.2;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draws one arc between the anchor centres on the same line", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue(style);
    const link: LiaisonLinkElements = {
      start: anchor(rect(20, 50, 10, 25)),
      end: anchor(rect(120, 50, 10, 25), "o")
    };
    const layout = buildLiaisonArcs(container, [link], measure);
    expect(layout.strokeWidth).toBeCloseTo(1.4, 5);
    expect(layout.arcs).toEqual([
      {
        key: "0",
        index: 0,
        d: liaisonPath({ x: 25, tipY }, { x: 125, tipY }, 20)
      }
    ]);
  });

  it("uses a real glyph near the centre of a multi-letter anchor", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue(style);
    const link: LiaisonLinkElements = {
      start: {
        glyphs: [
          ...anchor(rect(20, 50, 10, 25), "c").glyphs,
          ...anchor(rect(30, 50, 10, 25), "k").glyphs
        ]
      },
      end: anchor(rect(120, 50, 10, 25), "i")
    };
    const [arc] = buildLiaisonArcs(container, [link], measure).arcs;
    expect(arc?.d.startsWith("M 25 ")).toBe(true);
  });

  it("attaches a multi-letter anchor to the short glyph under its centre", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue(style);
    const leftL = element(rect(20, 50, 6, 25), "l");
    const leftA = element(rect(26, 50, 20, 25), "a");
    const link: LiaisonLinkElements = {
      start: {
        glyphs: [
          { source: leftL, element: leftL, text: "l" },
          { source: leftA, element: leftA, text: "a" }
        ]
      },
      end: anchor(rect(120, 50, 10, 25), "k")
    };
    const measured = (text: string) => ({
      fontAscent: 20,
      inkAscent: text === "a" ? 10 : 18
    });
    const [arc] = buildLiaisonArcs(container, [link], measured).arcs;
    expect(arc?.d).toBe(
      liaisonPath({ x: 36, tipY: 58.8 }, { x: 125, tipY: 50.8 }, 20)
    );
  });

  it("splits a wrapped link into a head and a tail reaching the padding edges", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue(style);
    const link: LiaisonLinkElements = {
      start: anchor(rect(300, 50, 10, 25)),
      end: anchor(rect(20, 90, 10, 25), "o")
    };
    const { arcs } = buildLiaisonArcs(container, [link], measure);
    expect(arcs.map((arc) => arc.key)).toEqual(["0-head", "0-tail"]);
    expect(arcs[0]!.d).toBe(
      liaisonPath({ x: 305, tipY }, { x: 390, tipY }, 20)
    );
    expect(arcs[1]!.d).toBe(
      liaisonPath({ x: 10, tipY: tipY + 40 }, { x: 25, tipY: tipY + 40 }, 20)
    );
    expect(arcs.every((arc) => arc.index === 0)).toBe(true);
  });

  it("treats anchors whose box tops differ by a pixel as one line", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue(style);
    // 粗体字母的内容盒会比常规字母高出个把像素，不能因此当成换行。
    const link: LiaisonLinkElements = {
      start: anchor(rect(20, 50, 10, 25)),
      end: anchor(rect(120, 51, 10, 25), "o")
    };
    expect(buildLiaisonArcs(container, [link], measure).arcs).toHaveLength(1);
  });

  it("keeps arc indexes aligned with the link list when an entry is missing", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue(style);
    const link: LiaisonLinkElements = {
      start: anchor(rect(20, 50, 10, 25)),
      end: anchor(rect(120, 50, 10, 25), "o")
    };
    const { arcs } = buildLiaisonArcs(container, [undefined, link], measure);
    expect(arcs.map((arc) => arc.index)).toEqual([1]);
  });

  it("draws nothing without layout information instead of writing NaN paths", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      fontSize: ""
    } as CSSStyleDeclaration);
    const link: LiaisonLinkElements = {
      start: anchor(rect(20, 50, 10, 25)),
      end: anchor(rect(120, 50, 10, 25), "o")
    };
    expect(buildLiaisonArcs(container, [link], measure)).toEqual({
      arcs: [],
      strokeWidth: 0
    });
  });
});

describe("createGlyphMeasurer", () => {
  it("yields no metrics where canvas text measurement is unavailable", () => {
    // jsdom 没有 canvas：退回按字盒顶端起笔，而不是抛错。
    expect(createGlyphMeasurer(document.body)("w")).toBeUndefined();
  });
});

it("collects visible graphemes and their own font elements without splitting combining characters", () => {
  const element = document.createElement("span");
  element.innerHTML = '<strong>l</strong><span class="normal">é a</span>';
  const glyphs = collectLiaisonGlyphs(element);
  expect(glyphs.map((g) => g.text)).toEqual(["l", "é", "a"]);
  expect(glyphs[0]!.element.tagName).toBe("STRONG");
  expect(glyphs[1]!.element).toBe(element.querySelector(".normal"));
});

it("measures the font of the actual glyph instead of the container font", () => {
  const container = document.createElement("div");
  container.style.font = "700 26px Ubuntu";
  const glyph = document.createElement("span");
  glyph.style.font = "400 20px Ubuntu";
  const context = {
    font: "",
    measureText: vi.fn(() => ({
      fontBoundingBoxAscent: 20,
      actualBoundingBoxAscent: 10
    }))
  };
  vi.stubGlobal("CanvasRenderingContext2D", class {});
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
  try {
    expect(createGlyphMeasurer(container)("a", glyph)).toEqual({
      fontAscent: 20,
      inkAscent: 10
    });
    expect(context.font).toContain("400 20px");
    expect(context.measureText).toHaveBeenCalledWith("a");
  } finally {
    getContext.mockRestore();
    vi.unstubAllGlobals();
  }
});
