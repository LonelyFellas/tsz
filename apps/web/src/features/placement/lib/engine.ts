// 升降档状态机 —— 纯函数、无 IO,与产品方案 §7 一一对应。
// 这份实现同时是后端(tsz-rust)状态机的行为参照:参数名与 §7.5 参数表同名。

export interface EngineParams {
  /** 每块真词数(另配 1 个假词,不参与升降判定) */
  block_real: number;
  /** 块内真词答对 ≥ 此数 → 升档 */
  up_threshold: number;
  /** 块内真词答对 ≤ 此数 → 降档 */
  down_threshold: number;
  /** 最少块数,未达前不允许出结果 */
  min_blocks: number;
  /** 最多块数,到达强制收敛 */
  max_blocks: number;
  /** 假词误报 ≥ 此数 → 无效 */
  fa_invalid: number;
  /** 假词误报 ≥ 此数 → 最终降一档 */
  fa_penalty: number;
  /** 起测档 index(A2 = 1) */
  start_band: number;
}

export const DEFAULT_PARAMS: EngineParams = {
  block_real: 4,
  up_threshold: 3,
  down_threshold: 1,
  min_blocks: 3,
  max_blocks: 6,
  fa_invalid: 3,
  fa_penalty: 2,
  start_band: 1
};

/** 单块判定:U 升 / D 降 / C 到达边界。 */
export type Move = "U" | "D" | "C";

export interface Progress {
  /** 当前档 index(0..5) */
  band: number;
  /** 当前块序号(1 起) */
  block_no: number;
  /** 上一次真实移动方向(C 与收敛候选会清空) */
  last_dir: "U" | "D" | null;
  /** 每块得分历史(到上限时取最后两块表现较好的档) */
  scores: { band: number; correct: number }[];
}

const TOP_BAND = 5; // C2

export function initialProgress(p: EngineParams = DEFAULT_PARAMS): Progress {
  return { band: p.start_band, block_no: 1, last_dir: null, scores: [] };
}

export function decideMove(
  correct: number,
  p: EngineParams = DEFAULT_PARAMS
): Move {
  if (correct >= p.up_threshold) return "U";
  if (correct <= p.down_threshold) return "D";
  return "C";
}

export type StepOutcome =
  { kind: "continue"; next: Progress } | { kind: "finalize"; band: number };

/**
 * 消化一块的真词得分,推进状态机。
 * 收敛条件:边界块(C)/方向反转(取低档)/触顶触底;未满 min_blocks 时
 * 收敛候选不出结果,落到候选档继续;到 max_blocks 取最后两块较好的档。
 */
export function advance(
  prev: Progress,
  correct: number,
  p: EngineParams = DEFAULT_PARAMS
): StepOutcome {
  const move = decideMove(correct, p);
  const scores = [...prev.scores, { band: prev.band, correct }];

  let band = prev.band;
  let lastDir = prev.last_dir;
  let candidate: number | null = null;

  if (move === "C") {
    candidate = band;
  } else {
    const delta = move === "U" ? 1 : -1;
    if (lastDir !== null && lastDir !== move) {
      // 方向反转:边界找到,保守取两档中较低者
      candidate = Math.min(band, band + delta);
    } else if (band + delta > TOP_BAND) {
      candidate = TOP_BAND;
    } else if (band + delta < 0) {
      candidate = 0;
    } else {
      band += delta;
      lastDir = move;
    }
  }

  if (candidate !== null) {
    if (prev.block_no >= p.min_blocks)
      return { kind: "finalize", band: candidate };
    // 未满最少块数:落到候选档继续,清空方向避免立刻误判反转
    band = candidate;
    lastDir = null;
  }

  if (prev.block_no >= p.max_blocks) {
    // scores 此刻必非空(本块得分刚入列);兜底仅为类型完备
    const b = scores[scores.length - 1] ?? { band: prev.band, correct: 0 };
    const a = scores[scores.length - 2] ?? b;
    return { kind: "finalize", band: b.correct >= a.correct ? b.band : a.band };
  }

  return {
    kind: "continue",
    next: { band, block_no: prev.block_no + 1, last_dir: lastDir, scores }
  };
}

/** 收敛后应用假词误报惩罚,得出最终结果。 */
export function settle(
  band: number,
  falseAlarms: number,
  p: EngineParams = DEFAULT_PARAMS
): { state: "completed"; band: number } | { state: "invalid" } {
  if (falseAlarms >= p.fa_invalid) return { state: "invalid" };
  if (falseAlarms >= p.fa_penalty) {
    return { state: "completed", band: Math.max(0, band - 1) };
  }
  return { state: "completed", band };
}
