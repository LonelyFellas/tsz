import { DEFAULT_DIALECT, DIALECTS } from "../editorConstants";

// —— 默认值工厂：新增 Tab / 行时用于填充结构，避免 undefined。———————————————————
// 每次调用返回全新对象，避免多处共享同一引用导致数据串改。

export function defaultDefinition() {
  return { level: "A1", type: "中文释义", text: "" };
}

export function defaultSense() {
  return {
    level: "A1",
    contextDependent: false,
    definitions: [defaultDefinition()],
    examples: [""],
    synonyms: [],
    antonyms: [],
    derivatives: []
  };
}

export function defaultPos(pos: string) {
  // 每种方言 + 无方言兜底块各预置一条「原形」行，切到任一模式都有起始行。
  const inflections = Object.fromEntries(
    [...DIALECTS, DEFAULT_DIALECT].map((d) => [d, [{ style: "正常" }]])
  );
  return {
    pos,
    inflections,
    grammar: [{}],
    senses: [defaultSense()]
  };
}
