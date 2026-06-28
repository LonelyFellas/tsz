"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@tsz/ui";
import type { WordListCustomWord, WordListVisibility } from "@tsz/types";
import { MOCK_WORDS } from "../data/mockWords";
import { useCreateWordList } from "../hooks/useWordLists";

// 对应流程图「创建词表」分支:
// 选智能词库词汇 + 完善自定义词汇 → 填写名称 → 完成创建私密词表
// → 公开?→(有自定义词汇则)敏感词审核 → 通过后公开,师生可见。
type Step = "words" | "name" | "visibility" | "done";

const STEP_TITLES: Record<Step, string> = {
  words: "1 / 3 · 选择词汇",
  name: "2 / 3 · 词表命名",
  visibility: "3 / 3 · 公开设置",
  done: "完成"
};

export function WordListCreator() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("words");

  // 选词状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [customWords, setCustomWords] = useState<WordListCustomWord[]>([]);
  const [customDraft, setCustomDraft] = useState("");

  // 词表信息
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<WordListVisibility>("private");

  const createWordList = useCreateWordList();
  const submitting = createWordList.isPending;

  const totalWords = selectedIds.size + customWords.length;
  const hasCustom = customWords.length > 0;
  // 公开 + 有自定义词汇 → 需走敏感词审核(对应流程图分支)。
  const needsReview = visibility === "public" && hasCustom;

  const selectedWords = useMemo(
    () => MOCK_WORDS.filter((w) => selectedIds.has(w.id)),
    [selectedIds]
  );

  function toggleWord(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addCustomWord() {
    const text = customDraft.trim();
    if (!text) return;
    setCustomWords((prev) => [...prev, { text }]);
    setCustomDraft("");
  }

  async function submit() {
    await createWordList.mutateAsync({
      name: name.trim(),
      word_ids: [...selectedIds],
      custom_words: customWords,
      visibility
    });
    setStep("done");
  }

  return (
    <section className="mx-auto max-w-2xl">
      <header className="mb-4">
        <h1 className="text-xl font-bold">创建词表</h1>
        <p className="text-sm text-gray-500">{STEP_TITLES[step]}</p>
      </header>

      {step === "words" && (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="mb-2 font-medium">从智能词库选择</h2>
            <ul className="grid grid-cols-2 gap-2">
              {MOCK_WORDS.map((w) => {
                const checked = selectedIds.has(w.id);
                return (
                  <li key={w.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 ${
                        checked
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleWord(w.id)}
                      />
                      <span className="font-medium">{w.text}</span>
                      <span className="text-xs text-gray-400">
                        {w.phonetic}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <h2 className="mb-2 font-medium">自定义词汇(可选)</h2>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded border px-3 py-2"
                placeholder="输入一个词后点添加"
                value={customDraft}
                onChange={(e) => setCustomDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomWord()}
              />
              <Button variant="secondary" onClick={addCustomWord}>
                添加
              </Button>
            </div>
            {hasCustom && (
              <div className="mt-2 flex flex-wrap gap-2">
                {customWords.map((c, i) => (
                  <span
                    key={`${c.text}-${i}`}
                    className="rounded bg-gray-100 px-2 py-1 text-sm"
                  >
                    {c.text}
                  </span>
                ))}
              </div>
            )}
            {hasCustom && (
              <p className="mt-2 text-xs text-amber-600">
                含自定义词汇,若选择公开将需要敏感词审核。
              </p>
            )}
          </div>

          <div className="flex justify-between">
            <span className="self-center text-sm text-gray-500">
              已选 {totalWords} 个词
            </span>
            <Button disabled={totalWords === 0} onClick={() => setStep("name")}>
              下一步
            </Button>
          </div>
        </Card>
      )}

      {step === "name" && (
        <Card className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm">词表名称</label>
            <input
              className="w-full rounded border px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如:小学一年级核心词"
            />
          </div>
          <p className="text-sm text-gray-500">
            共 {totalWords} 个词({selectedWords.length} 智能 +{" "}
            {customWords.length} 自定义)
          </p>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep("words")}>
              上一步
            </Button>
            <Button
              disabled={!name.trim()}
              onClick={() => setStep("visibility")}
            >
              下一步
            </Button>
          </div>
        </Card>
      )}

      {step === "visibility" && (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {(["private", "public"] as const).map((v) => (
              <label
                key={v}
                className={`flex cursor-pointer items-start gap-2 rounded border px-3 py-2 ${
                  visibility === v
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200"
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  checked={visibility === v}
                  onChange={() => setVisibility(v)}
                />
                <span>
                  <span className="font-medium">
                    {v === "private" ? "私密" : "公开"}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {v === "private"
                      ? "仅自己可见"
                      : "发布到老师/学生可浏览(需审核)"}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {needsReview && (
            <p className="rounded bg-amber-50 p-3 text-sm text-amber-700">
              公开 + 含自定义词汇 →
              提交后将进入敏感词审核,通过后才会对师生可见。
            </p>
          )}
          {createWordList.isError && (
            <p className="text-sm text-red-500">
              创建失败:{(createWordList.error as Error).message}
            </p>
          )}
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep("name")}>
              上一步
            </Button>
            <Button disabled={submitting} onClick={submit}>
              {submitting ? "提交中…" : "完成创建"}
            </Button>
          </div>
        </Card>
      )}

      {step === "done" && (
        <Card className="flex flex-col items-center gap-4 py-8 text-center">
          <h2 className="text-lg font-bold">「{name}」创建成功</h2>
          <p className="text-gray-500">
            {visibility === "private"
              ? "已保存为私密词表。"
              : needsReview
                ? "已提交审核,通过后将对师生可见。"
                : "已公开,师生现在可以浏览。"}
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => router.push("/wordlists")}
            >
              返回词表
            </Button>
            <Button onClick={() => router.refresh()}>再建一个</Button>
          </div>
        </Card>
      )}
    </section>
  );
}
