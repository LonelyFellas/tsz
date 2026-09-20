import { describe, expect, it } from "vitest";
import { annotationsToMarks, marksToAnnotations, remapMarks } from "./tokens";

const pause = (at: number, duration_ms = 500) => ({
  type: "pause" as const,
  at,
  duration_ms
});
const cp = (text: string) => Array.from(text).length;
function move(
  before: string,
  after: string,
  annotations: ReturnType<typeof pause>[]
) {
  return marksToAnnotations(
    after,
    remapMarks(
      before,
      after,
      annotationsToMarks({ version: 2, text: before, annotations })
    )
  ).filter((a) => a.type === "pause");
}

describe("停顿按原词间边界重映射", () => {
  const text = "one two three four";
  const pauses = [pause(3, 250), pause(13, 1000)];

  it("前插整句话，后面的停顿位置平移而时长不变", () => {
    const prefix = "Please note: ";
    expect(move(text, prefix + text, pauses)).toEqual(
      pauses.map((p) => ({ ...p, at: p.at + prefix.length }))
    );
  });

  it("逐字输入前缀，期间尚未输入空格也不会丢掉原首词后的停顿", () => {
    let previous = text;
    let marks = annotationsToMarks({ version: 2, text, annotations: pauses });
    let prefix = "";
    for (const letter of "Please note: ") {
      prefix += letter;
      const next = prefix + text;
      marks = remapMarks(previous, next, marks);
      expect(marksToAnnotations(next, marks)).toEqual(
        pauses.map((p) => ({ ...p, at: p.at + prefix.length }))
      );
      previous = next;
    }
  });

  it("删除前面的整句话，停顿跟随后续内容前移", () => {
    const prefix = "Please note: ";
    expect(
      move(
        prefix + text,
        text,
        pauses.map((p) => ({ ...p, at: p.at + prefix.length }))
      )
    ).toEqual(pauses);
  });

  it("在中间插入单词，前面的停顿不动，后面的停顿移动", () => {
    expect(move(text, "one two new three four", pauses)).toEqual([
      pause(3, 250),
      pause(17, 1000)
    ]);
  });

  it("重复单词不串位置，也不交换不同停顿时长", () => {
    const repeated = "go now go now go home";
    expect(
      move(repeated, "First, " + repeated, [
        pause(2, 250),
        pause(9, 500),
        pause(16, 1000)
      ])
    ).toEqual([pause(9, 250), pause(16, 500), pause(23, 1000)]);
  });

  it("按码点处理 emoji、中文前缀和组合字符", () => {
    const mixed = "😀 café e\u0301 fin";
    const prefix = "请听 👋 ";
    const marks = [pause(cp("😀"), 250), pause(cp("😀 café e\u0301"), 1000)];
    expect(move(mixed, prefix + mixed, marks)).toEqual(
      marks.map((p) => ({ ...p, at: p.at + cp(prefix) }))
    );
  });

  it("改变词间空白数量可以保留；合并词或改为换行不能误挂", () => {
    expect(move("one two", "one   two", [pause(3)])).toEqual([pause(3)]);
    expect(move("one two", "onetwo", [pause(3)])).toEqual([]);
    expect(move("one two", "one\ntwo", [pause(3)])).toEqual([]);
  });

  it("在原词缝插入新词、删除相邻词，不猜测新的归属", () => {
    expect(move("one two three", "one new two three", [pause(3)])).toEqual([]);
    expect(move("one two three", "one three", [pause(7)])).toEqual([]);
    expect(move("one two three", "one three", [pause(3)])).toEqual([]);
  });

  it("空内容和末尾追加不产生越界停顿", () => {
    expect(move(text, "", pauses)).toEqual([]);
    expect(move(text, text + " five", pauses)).toEqual(pauses);
    expect(move(text, text, pauses)).toEqual(pauses);
  });
});
