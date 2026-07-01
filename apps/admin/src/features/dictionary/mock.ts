import type { Cefr, DictWord, Pos, WordStatus, WordType } from "./types";

// 智能词库 Mock 数据源。仅前端占位用，字段贴合截图列；后端接口就绪后整体替换为真实请求。

interface Seed {
  word: string;
  type: WordType;
  meaning: string;
  pos: Pos[];
  difficulty: Cefr[];
}

const SEEDS: Seed[] = [
  {
    word: "record",
    type: "单词",
    meaning: "记录，记载",
    pos: ["n.", "v."],
    difficulty: ["A1", "A2", "B1", "B2", "C1", "C2"]
  },
  {
    word: "work out",
    type: "短语",
    meaning: "解决；锻炼",
    pos: ["v."],
    difficulty: ["B1"]
  },
  {
    word: "attitude",
    type: "单词",
    meaning: "态度，看法；姿势",
    pos: ["n."],
    difficulty: ["A2", "B1"]
  },
  {
    word: "electronic",
    type: "单词",
    meaning: "电子的，电子学的",
    pos: ["adj."],
    difficulty: ["B1", "B2"]
  },
  {
    word: "circuit",
    type: "单词",
    meaning: "电路，回路",
    pos: ["n."],
    difficulty: ["B1", "B2"]
  },
  {
    word: "chewing",
    type: "单词",
    meaning: "咀嚼，嚼碎",
    pos: ["adj.", "v."],
    difficulty: ["B1", "B2"]
  },
  {
    word: "transparent",
    type: "单词",
    meaning: "透明的，清澈的",
    pos: ["adj."],
    difficulty: ["B2"]
  },
  {
    word: "screen",
    type: "单词",
    meaning: "屏幕，荧光屏",
    pos: ["n.", "v."],
    difficulty: ["B1", "B2"]
  },
  {
    word: "tween",
    type: "单词",
    meaning: "在……之间",
    pos: ["prep."],
    difficulty: ["A2", "B1"]
  },
  {
    word: "aged",
    type: "单词",
    meaning: "年老的，年迈的",
    pos: ["adj."],
    difficulty: ["A1", "A2", "B1", "B2"]
  },
  {
    word: "deliver",
    type: "单词",
    meaning: "递送；发表",
    pos: ["v."],
    difficulty: ["B1"]
  },
  {
    word: "in charge of",
    type: "短语",
    meaning: "负责，主管",
    pos: ["prep."],
    difficulty: ["B1", "B2"]
  },
  {
    word: "efficient",
    type: "单词",
    meaning: "高效的，效率高的",
    pos: ["adj."],
    difficulty: ["B2", "C1"]
  },
  {
    word: "narrative",
    type: "单词",
    meaning: "叙述，故事",
    pos: ["n.", "adj."],
    difficulty: ["C1"]
  },
  {
    word: "carry out",
    type: "短语",
    meaning: "执行，实施",
    pos: ["v."],
    difficulty: ["B1", "B2"]
  },
  {
    word: "genuine",
    type: "单词",
    meaning: "真正的，真实的",
    pos: ["adj."],
    difficulty: ["B2"]
  },
  {
    word: "hypothesis",
    type: "单词",
    meaning: "假设，假说",
    pos: ["n."],
    difficulty: ["C1", "C2"]
  },
  {
    word: "look into",
    type: "短语",
    meaning: "调查，研究",
    pos: ["v."],
    difficulty: ["B1"]
  },
  {
    word: "vivid",
    type: "单词",
    meaning: "生动的，鲜明的",
    pos: ["adj."],
    difficulty: ["B2"]
  },
  {
    word: "consequence",
    type: "单词",
    meaning: "结果，后果",
    pos: ["n."],
    difficulty: ["B2", "C1"]
  },
  {
    word: "put up with",
    type: "短语",
    meaning: "忍受，容忍",
    pos: ["v."],
    difficulty: ["B2"]
  },
  {
    word: "diverse",
    type: "单词",
    meaning: "多种多样的",
    pos: ["adj."],
    difficulty: ["B2", "C1"]
  },
  {
    word: "framework",
    type: "单词",
    meaning: "框架，结构",
    pos: ["n."],
    difficulty: ["C1"]
  },
  {
    word: "set up",
    type: "短语",
    meaning: "建立，设立",
    pos: ["v."],
    difficulty: ["A2", "B1"]
  }
];

const CREATORS = [
  "姚政",
  "王笑天",
  "王漫",
  "胡允",
  "李书易",
  "傅彭薄",
  "王乐康",
  "魏鑫瑶"
];

// 依 id 派生一个稳定的「随机」创建人/时间，保证每次渲染一致（无副作用、可测）。
function pick<T>(arr: readonly T[], seed: number): T {
  return arr[seed % arr.length]!;
}

function stamp(dayOffset: number, hour: number, minute: number): string {
  const base = new Date(2025, 10, 1); // 2025-11-01
  base.setDate(base.getDate() - dayOffset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())} ${pad(hour)}:${pad(minute)}`;
}

export const MOCK_WORDS: DictWord[] = SEEDS.map((seed, i) => {
  const id = i + 1;
  const status: WordStatus =
    id % 5 === 0
      ? "已发布"
      : id % 7 === 0
        ? "草稿"
        : id % 3 === 0
          ? "已发布"
          : "草稿";
  return {
    id,
    ...seed,
    creator: pick(CREATORS, id * 3),
    status,
    createdAt: stamp(id, 9 + (id % 12), (id * 7) % 60),
    updatedAt: stamp(id % 9, 10 + (id % 10), (id * 11) % 60)
  };
});

// 头部统计（Mock）。真实实现应由后端聚合返回。
export const MOCK_STATS = {
  total: 234,
  today: 24,
  month: 124
};
