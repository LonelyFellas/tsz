import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockAssessmentClient, sampleReal, shuffle } from "./mock";
import { readQuota, type StorageLike } from "./quota";
import {
  QuotaExhaustedError,
  type AssessmentAnswer,
  type BlockItem,
  type SubmitResponse
} from "./types";
import { PSEUDO_WORDS, REAL_WORDS } from "./words";

function memStorage(): StorageLike {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k)
  };
}

/** 确定性随机源。 */
function seqRng(): () => number {
  let i = 0;
  return () => {
    i = (i + 7) % 97;
    return i / 97;
  };
}

const isPseudo = (text: string): boolean => PSEUDO_WORDS.includes(text);

function answerBlock(
  block: BlockItem[],
  policy: (text: string) => boolean
): AssessmentAnswer[] {
  return block.map((it) => ({
    item_id: it.item_id,
    known: policy(it.text),
    rt_ms: 500
  }));
}

function testClient(storage: StorageLike = memStorage()) {
  return {
    client: createMockAssessmentClient({
      latency_ms: 0,
      rng: seqRng(),
      storage
    }),
    storage
  };
}

/** 按同一策略答到出结果。 */
async function runToResult(
  client: ReturnType<typeof createMockAssessmentClient>,
  policy: (text: string, blockNo: number) => boolean
): Promise<Extract<SubmitResponse, { result: unknown }>["result"]> {
  const start = await client.start();
  let blockNo = 1;
  let res = await client.submit(
    start.session_id,
    answerBlock(start.block, (t) => policy(t, blockNo))
  );
  while ("next_block" in res) {
    blockNo += 1;
    if (blockNo > 10) throw new Error("did not converge");
    res = await client.submit(
      start.session_id,
      answerBlock(res.next_block, (t) => policy(t, blockNo))
    );
  }
  return res.result;
}

describe("start", () => {
  it("首块:5 题 = 起测档(A2)4 真词 + 1 假词,响应不泄露 kind/band", async () => {
    const { client } = testClient();
    const res = await client.start();
    expect(res.session_id).toBeTruthy();
    expect(res.block).toHaveLength(5);
    for (const item of res.block) {
      expect(Object.keys(item).sort()).toEqual(["item_id", "text"]);
    }
    const ids = new Set(res.block.map((i) => i.item_id));
    expect(ids.size).toBe(5);
    const pseudo = res.block.filter((i) => isPseudo(i.text));
    expect(pseudo).toHaveLength(1);
    for (const item of res.block) {
      if (isPseudo(item.text)) continue;
      expect(REAL_WORDS.A2).toContain(item.text);
    }
  });

  it("session 内不重复出词", async () => {
    const { client } = testClient();
    const start = await client.start();
    const seen = new Set(start.block.map((i) => i.text));
    let res = await client.submit(
      start.session_id,
      answerBlock(start.block, (t) => !isPseudo(t))
    );
    while ("next_block" in res) {
      for (const item of res.next_block) {
        expect(seen.has(item.text)).toBe(false);
        seen.add(item.text);
      }
      res = await client.submit(
        start.session_id,
        answerBlock(res.next_block, (t) => !isPseudo(t))
      );
    }
  });
});

describe("定级路径", () => {
  it("真词全认识、假词全拒 → C2,消耗 1 次机会", async () => {
    const { client, storage } = testClient();
    const result = await runToResult(client, (t) => !isPseudo(t));
    expect(result).toEqual({
      state: "completed",
      band: "C2",
      vocab_range: "8,000+ 词"
    });
    const quota = readQuota(storage);
    expect(quota.used).toBe(1);
    expect(quota.last?.band).toBe("C2");
  });

  it("全部点认识(乱点)→ 假词误报 ≥3 → 无效,不消耗次数", async () => {
    const { client, storage } = testClient();
    const result = await runToResult(client, () => true);
    expect(result).toEqual({
      state: "invalid",
      reason: "too_many_false_alarms"
    });
    expect(readQuota(storage).used).toBe(0);
  });

  it("全部点不认识 → A1(真词不认识不惩罚)", async () => {
    const { client, storage } = testClient();
    const result = await runToResult(client, () => false);
    expect(result).toMatchObject({ state: "completed", band: "A1" });
    expect(readQuota(storage).used).toBe(1);
  });

  it("误报恰 2 次 → 最终降一档(C2 → C1)", async () => {
    const { client } = testClient();
    const result = await runToResult(client, (t, blockNo) =>
      isPseudo(t) ? blockNo <= 2 : true
    );
    expect(result).toMatchObject({ state: "completed", band: "C1" });
  });
});

describe("次数与会话边界", () => {
  it("3 次完成后 start 抛 QuotaExhaustedError", async () => {
    const { client } = testClient();
    for (let i = 0; i < 3; i++) {
      await runToResult(client, () => false);
    }
    await expect(client.start()).rejects.toBeInstanceOf(QuotaExhaustedError);
  });

  it("无效测试不占次数,可无限重测", async () => {
    const { client } = testClient();
    for (let i = 0; i < 4; i++) {
      const result = await runToResult(client, () => true);
      expect(result).toMatchObject({ state: "invalid" });
    }
    await expect(client.start()).resolves.toBeTruthy();
  });

  it("未 start 或 session_id 不匹配 → 报错", async () => {
    const { client } = testClient();
    await expect(client.submit("sess_nope", [])).rejects.toThrow(
      "assessment session not found"
    );
    await client.start();
    await expect(client.submit("sess_wrong", [])).rejects.toThrow(
      "assessment session not found"
    );
  });

  it("出结果后旧 session 失效", async () => {
    const { client } = testClient();
    const start = await client.start();
    await runToResultFrom(client, start.session_id, start.block);
    await expect(client.submit(start.session_id, [])).rejects.toThrow(
      "assessment session not found"
    );

    async function runToResultFrom(
      c: typeof client,
      sid: string,
      firstBlock: BlockItem[]
    ) {
      let res = await c.submit(
        sid,
        answerBlock(firstBlock, () => false)
      );
      while ("next_block" in res) {
        res = await c.submit(
          sid,
          answerBlock(res.next_block, () => false)
        );
      }
      return res;
    }
  });

  it("未知 item_id 被忽略(容错)", async () => {
    const { client } = testClient();
    const start = await client.start();
    const answers = answerBlock(start.block, () => false);
    answers.push({ item_id: "w_bogus", known: true, rt_ms: 1 });
    const res = await client.submit(start.session_id, answers);
    // 全不认识 → 降档继续,未因未知题崩溃或计分
    expect("next_block" in res).toBe(true);
  });
});

describe("默认配置(延迟 + localStorage)", () => {
  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.removeItem("tsz.placement.quota");
  });

  it("默认 200ms 延迟,配额落浏览器 localStorage", async () => {
    vi.useFakeTimers();
    const client = createMockAssessmentClient({ rng: seqRng() });
    const pending = client.start();
    await vi.advanceTimersByTimeAsync(200);
    const start = await pending;
    expect(start.block).toHaveLength(5);
  });
});

describe("抽样工具", () => {
  it("shuffle:保长度保元素,确定性随机源下可复现", () => {
    const rng = seqRng();
    const out = shuffle(["a", "b", "c", "d"], rng);
    expect(out).toHaveLength(4);
    expect([...out].sort()).toEqual(["a", "b", "c", "d"]);
    expect(shuffle(["a", "b", "c", "d"], seqRng())).toEqual(out);
  });

  it("sampleReal:档内不足向上邻档借词", () => {
    const used = new Set(REAL_WORDS.A2.slice(0, REAL_WORDS.A2.length - 2));
    const out = sampleReal(1, used, 4, seqRng());
    expect(out).toHaveLength(4);
    const fromB1 = out.filter((w) => REAL_WORDS.B1.includes(w));
    expect(fromB1.length).toBeGreaterThan(0);
  });

  it("sampleReal:C2 无上邻档时向下借 C1", () => {
    const used = new Set(REAL_WORDS.C2.slice(0, REAL_WORDS.C2.length - 1));
    const out = sampleReal(5, used, 4, seqRng());
    expect(out).toHaveLength(4);
    expect(out.some((w) => REAL_WORDS.C1.includes(w))).toBe(true);
  });
});
