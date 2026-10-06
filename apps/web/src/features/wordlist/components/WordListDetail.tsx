"use client";
import { TipPanel } from "./WordlistTips";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import type {
  CEFRLevel,
  EnglishVariant,
  WordlistEntry,
  WordlistText,
  MyWordlistItem,
  SubmitWordlist
} from "@tsz/types";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { useTeacherIdentity } from "@/features/teacher-certification/TeacherIdentityProvider";
import { wordListKeys } from "../hooks/useWordLists";
import {
  selectDefinition,
  selectTexts,
  STATE_LABEL,
  buttonClass
} from "../reading";
import "@tsz/voice-editor/styles.css";
export function WordListDetail({
  id,
  mine = false
}: {
  id: string;
  mine?: boolean;
}) {
  const userId = useUserStore((s) => s.user?.id);
  return (
    <Detail
      key={`${userId ?? "guest"}:${id}:${mine}`}
      id={id}
      mine={mine}
      userId={userId}
    />
  );
}
function Detail({
  id,
  mine,
  userId
}: {
  id: string;
  mine: boolean;
  userId?: string;
}) {
  const client = useQueryClient();
  const identity = useTeacherIdentity();
  const hydrated = useUserStore((s) => s.hydrated);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submit, setSubmit] = useState<SubmitWordlist | null>(null);
  const keys = mine ? wordListKeys.mine(userId) : wordListKeys.public;
  const meta = useQuery({
    queryKey: [...keys, "detail", id],
    enabled: !mine || !!userId,
    refetchOnMount: "always",
    queryFn: ({ signal }) =>
      mine
        ? api.wordList.myDetail(id, { signal })
        : api.wordList.get(id, { signal })
  });
  const items = useQuery({
    queryKey: [...keys, "items", id, page, q],
    enabled: meta.isSuccess,
    queryFn: ({ signal }) =>
      mine
        ? api.wordList.myItems(id, { page, q }, { signal })
        : api.wordList.items(id, { page, q }, { signal })
  });
  const profile = useQuery({
    queryKey: [...wordListKeys.mine(userId), "reading-settings"],
    enabled: !!userId,
    refetchOnMount: "always",
    queryFn: ({ signal }) => api.auth.me({ signal })
  });
  const reviews = useQuery({
    queryKey: [...keys, "reviews", id],
    enabled: mine && !!userId,
    queryFn: ({ signal }) => api.wordList.reviews(id, { signal })
  });
  const ready = hydrated && (!userId || (identity.ready && profile.isSuccess));
  const level: CEFRLevel =
    identity.identity === "teacher"
      ? "C2"
      : (profile.data?.learning_settings?.cefr_level ?? "C2");
  const variant = profile.data?.learning_settings?.english_variant ?? null;
  async function action(kind: "submit" | "withdraw") {
    if (!meta.data) return;
    if (
      kind === "withdraw" &&
      !window.confirm("撤回后将立即转为私密，修改内容后需要重新审核。继续？")
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (kind === "submit") {
        const payload = (submit?.expected_revision === meta.data.revision
          ? submit
          : null) ?? {
          expected_revision: meta.data.revision,
          idempotency_key: crypto.randomUUID()
        };
        setSubmit(payload);
        await api.wordList.submit(id, payload);
        setSubmit(null);
      } else
        await api.wordList.withdraw(id, {
          expected_revision: meta.data.revision
        });
      await client.invalidateQueries({ queryKey: wordListKeys.all });
    } catch {
      setError("操作结果未确认，请刷新核对。提审重试会复用原请求键。");
    } finally {
      setBusy(false);
    }
  }
  if (meta.isError)
    return (
      <div className="p-8" role="alert">
        词表不存在、不可访问或暂时无法加载。
        <button onClick={() => void meta.refetch()}>重试</button>
      </div>
    );
  if (!meta.data) return <p className="p-8">正在读取词表…</p>;
  const list = meta.data;
  return (
    <article className="animate-in mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link
        href={mine ? "/account/wordlists" : "/wordlists"}
        className="text-sm text-foreground-muted"
      >
        ← 返回词表
      </Link>
      <header className="mt-6 rounded-3xl border border-border bg-surface p-6">
        <h1 className="break-words text-3xl font-semibold">{list.name}</h1>
        <p className="mt-4">
          {list.owner_name} · {STATE_LABEL[list.state]} · {list.item_count}{" "}
          个词条
        </p>
        <p className="mt-2 break-all text-xs text-foreground-muted">
          ID：{list.id}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {mine ? (
            <>
              <Link
                className={buttonClass}
                href={`/account/wordlists/${id}/edit`}
              >
                {list.state === "pending" || list.state === "published"
                  ? "编辑私密备注"
                  : "编辑词表"}
              </Link>
              {list.state === "pending" || list.state === "published" ? (
                <button
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => void action("withdraw")}
                >
                  撤回为私密
                </button>
              ) : (
                <button
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => void action("submit")}
                >
                  提交公开审核
                </button>
              )}
              {list.state === "published" && (
                <Link className={buttonClass} href={`/wordlists/${id}`}>
                  查看公开页面
                </Link>
              )}
            </>
          ) : (
            list.owner_user_id === userId && (
              <Link className={buttonClass} href={`/account/wordlists/${id}`}>
                管理我的词表
              </Link>
            )
          )}
        </div>
        {error && (
          <p role="alert" className="mt-4">
            {error}
          </p>
        )}
        {mine && reviews.data?.withdraw_reason && (
          <p className="mt-4">下架原因：{reviews.data.withdraw_reason}</p>
        )}
        {mine && reviews.data?.items[0]?.reason && (
          <p className="mt-4">审核意见：{reviews.data.items[0].reason}</p>
        )}
        {mine && reviews.isError && <p role="alert">审核记录加载失败。</p>}
        {!mine && list.state === "published" && <TipPanel list={list} />}
      </header>
      <div className="my-6 flex flex-wrap items-center gap-3">
        <input
          aria-label="搜索词条"
          placeholder="搜索词面"
          className="min-w-40 flex-1 rounded-full border border-border bg-surface px-5 py-3"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <span className="text-sm text-foreground-muted">
          标准模式
          {ready
            ? ` · ${level}${!profile.data?.learning_settings && identity.identity !== "teacher" ? " 预览" : ""}`
            : ""}
        </span>
      </div>
      {!ready ? (
        profile.isError || identity.error ? (
          <p role="alert">
            阅读设置读取失败，请刷新；尚未显示未确认等级的释义。
          </p>
        ) : (
          <p>正在读取阅读设置…</p>
        )
      ) : items.isError ? (
        <p role="alert">
          条目加载失败，
          <button onClick={() => void items.refetch()}>重试</button>。
        </p>
      ) : !items.data ? (
        <p>正在读取条目…</p>
      ) : (
        <>
          <div className="space-y-4">
            {items.data.items.map((item) => (
              <section
                key={item.entry_id}
                className="rounded-3xl border border-border bg-surface p-6"
              >
                <div className="mb-2 text-xs text-foreground-muted">
                  {item.position + 1}
                </div>
                {item.entry ? (
                  <StandardEntry
                    entry={item.entry}
                    level={level}
                    variant={variant}
                  />
                ) : (
                  <p>内容不可用</p>
                )}
                {mine &&
                  "private_note" in item &&
                  (item as MyWordlistItem).private_note && (
                    <p className="mt-4 whitespace-pre-wrap border-t border-border pt-4 text-sm">
                      私密备注：{(item as MyWordlistItem).private_note}
                    </p>
                  )}
              </section>
            ))}
          </div>
          {items.data.items.length === 0 && <p>没有匹配词条</p>}
          <div className="mt-6 flex items-center gap-4">
            <button
              className={buttonClass}
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </button>
            <span>第 {page} 页</span>
            <button
              className={buttonClass}
              disabled={page >= items.data.pagination.total_pages}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </button>
          </div>
        </>
      )}
    </article>
  );
}
function Texts({
  texts,
  variant
}: {
  texts: WordlistText[];
  variant: EnglishVariant | null;
}) {
  return (
    <>
      {selectTexts(texts, variant).map((text, i) => (
        <div key={`${text.dialect}:${i}`} className="break-words">
          {text.dialect !== "common" && (
            <span className="mr-2 text-xs text-foreground-muted">
              {text.dialect === "uk" ? "英" : "美"}
            </span>
          )}
          <RichTextReadOnly value={text.content} />
        </div>
      ))}
    </>
  );
}
export function StandardEntry({
  entry,
  level,
  variant
}: {
  entry: WordlistEntry;
  level: CEFRLevel;
  variant: EnglishVariant | null;
}) {
  return (
    <>
      <h2 className="break-words text-2xl font-semibold">{entry.label}</h2>
      {entry.pos.map((pos) => (
        <div key={pos.pos_id} className="mt-4">
          <h3 className="text-sm font-medium text-foreground-muted">
            {pos.pos}
          </h3>
          {pos.senses.map((sense) => {
            const definition = selectDefinition(sense.definitions, level);
            const grammar = pos.grammar_structures.find(
              (g) => g.id === definition?.grammar_structure_id
            );
            return (
              <div
                key={sense.id}
                className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_1fr]"
              >
                <div>
                  {definition ? (
                    <>
                      <span className="mb-2 inline-block rounded-full bg-background px-2 py-1 text-xs">
                        {definition.level}
                      </span>
                      <Texts texts={definition.texts} variant={variant} />
                      {definition.texts.length === 0 && (
                        <p>此释义暂无可用文本</p>
                      )}
                    </>
                  ) : (
                    <p>暂无适合当前等级的释义</p>
                  )}
                </div>
                {grammar && (
                  <div>
                    <p className="mb-2 text-xs text-foreground-muted">
                      语法结构
                    </p>
                    <Texts texts={grammar.variants} variant={variant} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
