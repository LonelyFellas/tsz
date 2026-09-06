import { afterEach, describe, expect, it, vi } from "vitest";
import {
  anchorTip,
  buildLiaisonArcs,
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
  return { first: node, last: node, text };
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

  it("spans a multi-letter anchor from its first to its last letter", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue(style);
    const link: LiaisonLinkElements = {
      start: {
        first: element(rect(20, 50, 10, 25), "c"),
        last: element(rect(30, 50, 10, 25), "k"),
        text: "ck"
      },
      end: anchor(rect(120, 50, 10, 25), "i")
    };
    const [arc] = buildLiaisonArcs(container, [link], measure).arcs;
    expect(arc?.d.startsWith("M 30 ")).toBe(true);
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
