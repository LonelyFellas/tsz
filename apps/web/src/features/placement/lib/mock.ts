import {
  advance,
  DEFAULT_PARAMS,
  initialProgress,
  settle,
  type EngineParams,
  type Progress
} from "./engine";
import { VOCAB_RANGE } from "./content";
import { readQuota, recordResult, MAX_TESTS, type StorageLike } from "./quota";
import { PSEUDO_WORDS, REAL_WORDS } from "./words";
import {
  bandAt,
  BANDS,
  QuotaExhaustedError,
  type AssessmentAnswer,
  type AssessmentClient,
  type BlockItem,
  type StartResponse,
  type SubmitResponse
} from "./types";

// AssessmentClient 的 mock 实现。真假词知识只存在于本模块闭包内,
// 响应剥离 kind/band —— 与真后端相同的信息边界,组件层无法分辨在跟谁说话。
// 默认带人工延迟,逼出块提交的 loading/失败态,避免接真后端时才补。

export interface MockOptions {
  /** 每次请求的人工延迟毫秒数;测试传 0 跳过。 */
  latency_ms?: number;
  /** 随机源,测试注入确定性序列。 */
  rng?: () => number;
  /** 配额存储,测试注入内存实现;null 表示无持久化。 */
  storage?: StorageLike | null;
  params?: EngineParams;
}

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const vi = arr[i];
    const vj = arr[j];
    if (vi === undefined || vj === undefined) continue; // 类型完备,实际不可达
    arr[i] = vj;
    arr[j] = vi;
  }
  return arr;
}

/** 档内分层抽真词;档内未用词不足时向邻档借(词库扩容后极少触发)。 */
export function sampleReal(
  bandIdx: number,
  used: ReadonlySet<string>,
  n: number,
  rng: () => number
): string[] {
  const pool = REAL_WORDS[bandAt(bandIdx)].filter((w) => !used.has(w));
  if (pool.length < n) {
    const adjacent = BANDS[bandIdx + 1] ?? BANDS[bandIdx - 1];
    if (adjacent)
      pool.push(...REAL_WORDS[adjacent].filter((w) => !used.has(w)));
  }
  return shuffle(pool, rng).slice(0, n);
}

interface MockSession {
  id: string;
  progress: Progress;
  false_alarms: number;
  used_words: Set<string>;
  items: Map<string, { text: string; kind: "real" | "pseudo" }>;
  seq: number;
}

export function createMockAssessmentClient(
  options: MockOptions = {}
): AssessmentClient {
  const latency = options.latency_ms ?? 200;
  const rng = options.rng ?? Math.random;
  const storage = options.storage;
  const params = options.params ?? DEFAULT_PARAMS;

  let session: MockSession | null = null;
  let sessionSeq = 0;

  const delay = (): Promise<void> =>
    latency > 0
      ? new Promise((resolve) => setTimeout(resolve, latency))
      : Promise.resolve();

  function buildBlock(s: MockSession): BlockItem[] {
    const real = sampleReal(
      s.progress.band,
      s.used_words,
      params.block_real,
      rng
    );
    const pseudo =
      shuffle(
        PSEUDO_WORDS.filter((w) => !s.used_words.has(w)),
        rng
      )[0] ??
      PSEUDO_WORDS[0] ??
      "";
    const texts = shuffle([...real, pseudo], rng);
    return texts.map((text) => {
      const item_id = `w_${++s.seq}`;
      s.used_words.add(text);
      s.items.set(item_id, {
        text,
        kind: PSEUDO_WORDS.includes(text) ? "pseudo" : "real"
      });
      return { item_id, text };
    });
  }

  return {
    async start(): Promise<StartResponse> {
      await delay();
      // storage 未注入(undefined)时走 readQuota 默认参数(浏览器 localStorage)
      if (readQuota(storage).used >= MAX_TESTS) throw new QuotaExhaustedError();
      session = {
        id: `sess_mock_${++sessionSeq}`,
        progress: initialProgress(params),
        false_alarms: 0,
        used_words: new Set(),
        items: new Map(),
        seq: 0
      };
      return { session_id: session.id, block: buildBlock(session) };
    },

    async submit(
      session_id: string,
      answers: AssessmentAnswer[]
    ): Promise<SubmitResponse> {
      await delay();
      const s = session;
      if (!s || s.id !== session_id) {
        throw new Error("assessment session not found");
      }

      let correct = 0;
      for (const a of answers) {
        const item = s.items.get(a.item_id);
        if (!item) continue; // 未知题目忽略(容错,真后端会 400)
        if (item.kind === "pseudo") {
          if (a.known) s.false_alarms += 1;
        } else if (a.known) {
          correct += 1;
        }
      }

      const step = advance(s.progress, correct, params);
      if (step.kind === "continue") {
        s.progress = step.next;
        return { next_block: buildBlock(s) };
      }

      session = null; // 出结果即终结会话
      const final = settle(step.band, s.false_alarms, params);
      if (final.state === "invalid") {
        return {
          result: { state: "invalid", reason: "too_many_false_alarms" }
        };
      }
      const band = bandAt(final.band);
      recordResult(band, new Date().toISOString(), storage);
      return {
        result: { state: "completed", band, vocab_range: VOCAB_RANGE[band] }
      };
    }
  };
}
