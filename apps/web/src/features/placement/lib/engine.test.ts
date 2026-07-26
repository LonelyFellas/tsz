import { describe, expect, it } from "vitest";
import {
  advance,
  decideMove,
  DEFAULT_PARAMS,
  initialProgress,
  settle,
  type Progress,
  type StepOutcome
} from "./engine";

// 状态机行为规格(同时是后端 Rust 实现的对照用例)。
// 档位 index:A1=0 … C2=5;起测 A2=1。

/** 依次消化每块得分,返回轨迹与最终结局。 */
function run(corrects: number[]): {
  outcome: StepOutcome;
  trail: Progress[];
} {
  let progress = initialProgress();
  const trail: Progress[] = [progress];
  let outcome: StepOutcome | null = null;
  for (const c of corrects) {
    outcome = advance(progress, c);
    if (outcome.kind === "finalize") return { outcome, trail };
    progress = outcome.next;
    trail.push(progress);
  }
  if (!outcome) throw new Error("empty sequence");
  return { outcome, trail };
}

describe("decideMove", () => {
  it("≥3 升 / =2 边界 / ≤1 降", () => {
    expect(decideMove(4)).toBe("U");
    expect(decideMove(3)).toBe("U");
    expect(decideMove(2)).toBe("C");
    expect(decideMove(1)).toBe("D");
    expect(decideMove(0)).toBe("D");
  });
});

describe("initialProgress", () => {
  it("起测 A2、第一块、无方向", () => {
    expect(initialProgress()).toEqual({
      band: 1,
      block_no: 1,
      last_dir: null,
      scores: []
    });
  });
});

describe("advance:基本升降", () => {
  it("升档:band+1 并记录方向", () => {
    const out = advance(initialProgress(), 4);
    expect(out).toMatchObject({
      kind: "continue",
      next: { band: 2, block_no: 2, last_dir: "U" }
    });
  });

  it("降档:band-1 并记录方向", () => {
    const out = advance(initialProgress(), 1);
    expect(out).toMatchObject({
      kind: "continue",
      next: { band: 0, block_no: 2, last_dir: "D" }
    });
  });

  it("得分历史逐块累积且不改写入参", () => {
    const first = initialProgress();
    const out = advance(first, 4);
    expect(first.scores).toEqual([]); // 纯函数,无副作用
    if (out.kind !== "continue") throw new Error("expected continue");
    expect(out.next.scores).toEqual([{ band: 1, correct: 4 }]);
  });
});

describe("advance:收敛规则", () => {
  it("边界块(=2)未满 3 块 → 原档继续,方向清空", () => {
    const out = advance(initialProgress(), 2);
    expect(out).toMatchObject({
      kind: "continue",
      next: { band: 1, block_no: 2, last_dir: null }
    });
  });

  it("边界块(=2)满 3 块 → 当前档收敛", () => {
    // U(1→2), U(2→3), C@3
    const { outcome } = run([4, 4, 2]);
    expect(outcome).toEqual({ kind: "finalize", band: 3 });
  });

  it("先升后降反转 → 取两档中较低者", () => {
    // U(1→2), U(2→3), D@3 → min(3, 2) = 2
    const { outcome } = run([4, 4, 1]);
    expect(outcome).toEqual({ kind: "finalize", band: 2 });
  });

  it("先降后升反转(未满 3 块)→ 落到低档继续", () => {
    // D(1→0), U@0:反转候选 min(0,1)=0,block2<3 → 在 0 档继续
    const { outcome, trail } = run([1, 4]);
    expect(outcome.kind).toBe("continue");
    expect(trail[2]).toMatchObject({ band: 0, block_no: 3, last_dir: null });
  });

  it("C2 触顶 → 直接定 C2", () => {
    // 1→2→3→4→5,第 5 块在 C2 仍全对
    const { outcome } = run([4, 4, 4, 4, 4]);
    expect(outcome).toEqual({ kind: "finalize", band: 5 });
  });

  it("A1 触底(满 3 块)→ 定 A1", () => {
    // D(1→0), C@0 未满3块继续, D@0 触底且 block3≥3
    const { outcome } = run([1, 2, 0]);
    expect(outcome).toEqual({ kind: "finalize", band: 0 });
  });

  it("到 6 块上限 → 取最后两块表现较好的档(平分取后者)", () => {
    // C@1, C@1, U(1→2), U(2→3), U(3→4), U@4:block6 到上限
    // 最后两块 {band:3,correct:4} vs {band:4,correct:4} 平分 → 取后者 4
    const { outcome } = run([2, 2, 4, 4, 4, 4]);
    expect(outcome).toEqual({ kind: "finalize", band: 4 });
  });

  it("到 6 块上限 → 前一块更优则取前一块的档", () => {
    // 同上,但 block6 只对 3 题(仍是 U,不触发其它收敛)
    // 最后两块 {band:3,correct:4} vs {band:4,correct:3} → 取前者 3
    const { outcome } = run([2, 2, 4, 4, 4, 3]);
    expect(outcome).toEqual({ kind: "finalize", band: 3 });
  });
});

describe("settle:假词误报惩罚", () => {
  it("误报 0/1 → 结果不变", () => {
    expect(settle(3, 0)).toEqual({ state: "completed", band: 3 });
    expect(settle(3, 1)).toEqual({ state: "completed", band: 3 });
  });

  it("误报 2 → 降一档,A1 兜底", () => {
    expect(settle(3, 2)).toEqual({ state: "completed", band: 2 });
    expect(settle(0, 2)).toEqual({ state: "completed", band: 0 });
  });

  it("误报 ≥3 → 无效", () => {
    expect(settle(3, 3)).toEqual({ state: "invalid" });
    expect(settle(5, DEFAULT_PARAMS.fa_invalid + 1)).toEqual({
      state: "invalid"
    });
  });
});
