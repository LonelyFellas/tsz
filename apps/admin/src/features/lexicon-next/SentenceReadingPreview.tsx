import { useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type {
  NextSentence,
  NextSentenceTranslation,
  NextSentenceVariant
} from "@tsz/types";
import {
  Alert,
  Button,
  Empty,
  Flex,
  Skeleton,
  Space,
  Tag
} from "@tsz/ui/admin/display";
import { Select, Slider } from "@tsz/ui/admin/forms";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { toRichTextV2 } from "@tsz/voice-editor/core";
import { useAuthStore, usePermission } from "@/lib/auth";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import {
  PronunciationPreviewControls,
  PronunciationPreviewProvider
} from "@/features/dictionary/word-creation/PronunciationPreview";
import { EntryDialectContext } from "@/features/settings/useDialectPreference";
import {
  exampleLevelContext,
  nextTranslation,
  randomTranslation,
  sentenceLevels,
  sentenceStyles,
  sortExamples,
  translationStyle
} from "./sentenceModel";
import "./sentences.css";

type Session = {
  current?: string;
  seen: string[];
  clicks: number;
  missing?: keyof typeof sentenceStyles;
};
function TranslationChoice({
  rows,
  reading,
  sessions,
  scope
}: {
  rows: NextSentenceTranslation[];
  reading: string;
  sessions: Map<string, Session>;
  scope: string;
}) {
  const [state, setState] = useState<Session>(() => {
    const saved = sessions.get(scope);
    if (saved) return saved;
    const preferred = rows.filter(
      (row) => translationStyle(row) === "balanced_fluency"
    );
    const selected = randomTranslation(preferred.length ? preferred : rows);
    const initial = {
      current: selected?.id,
      seen: selected ? [selected.id] : [],
      clicks: 0,
      missing:
        selected && !preferred.length
          ? ("balanced_fluency" as const)
          : undefined
    };
    sessions.set(scope, initial);
    return initial;
  });
  const select = (next: Session) => {
    sessions.set(scope, next);
    setState(next);
  };
  const row = rows.find((row) => row.id === state.current);
  if (!row)
    return <span className="lexicon-next-muted">当前媒介语译文待补充</span>;
  const style = translationStyle(row);
  const freedom = row.metadata?.freedom ?? 0;
  const stops = [
    ...new Set(
      rows.flatMap((row) => (row.metadata ? [row.metadata.freedom ?? 0] : []))
    )
  ].sort((a, b) => a - b);
  const chooseFreedom = (requested: number) => {
    const direction = Math.sign(requested - freedom);
    const value = [...stops].sort(
      (a, b) =>
        Math.abs(a - requested) - Math.abs(b - requested) ||
        (direction > 0 ? b - a : a - b)
    )[0];
    const selected =
      rows.find(
        (candidate) =>
          candidate.id === state.current &&
          (candidate.metadata?.freedom ?? 0) === value
      ) ??
      rows.find((candidate) => (candidate.metadata?.freedom ?? 0) === value);
    if (selected)
      select({
        ...state,
        current: selected.id,
        seen: state.seen.includes(selected.id)
          ? state.seen
          : [...state.seen, selected.id],
        missing: undefined
      });
  };
  return (
    <div>
      <div className="next-sentence-translation">
        <Button
          aria-label="切换译文"
          disabled={rows.length < 2}
          onClick={() => {
            const next = nextTranslation(
              rows,
              state.current,
              state.seen,
              state.clicks,
              reading
            );
            select({
              current: next.row?.id,
              seen: next.seen,
              clicks: state.clicks + 1,
              missing: next.missing
            });
          }}
        >
          <Tag>{style ? sentenceStyles[style] : "自由度无效"}</Tag>
          <RichTextReadOnly value={row.content} />
        </Button>
        {row.metadata && (
          <div
            className="next-sentence-freedom"
            onKeyDownCapture={(event) => {
              if (
                !(event.target instanceof HTMLElement) ||
                event.target.getAttribute("role") !== "slider" ||
                !stops.length ||
                ![
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowLeft",
                  "ArrowDown",
                  "Home",
                  "End"
                ].includes(event.key)
              )
                return;
              event.preventDefault();
              const current = Math.max(0, stops.indexOf(freedom));
              const at =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? stops.length - 1
                    : Math.max(
                        0,
                        Math.min(
                          stops.length - 1,
                          current +
                            (["ArrowRight", "ArrowUp"].includes(event.key)
                              ? 1
                              : -1)
                        )
                      );
              chooseFreedom(stops[at]!);
            }}
          >
            <Slider
              ariaLabelForHandle={`译文自由度：${freedom}%`}
              min={0}
              max={100}
              step={0.1}
              value={freedom}
              disabled={stops.length < 2}
              onChange={chooseFreedom}
              tooltip={{
                formatter: () => `${freedom}%`
              }}
            />
            <span>{`${freedom.toFixed(1)}%`}</span>
          </div>
        )}
      </div>
      {state.missing && (
        <p className="lexicon-next-muted">
          {sentenceStyles[state.missing]}待补，暂显示已有译文。
        </p>
      )}
    </div>
  );
}

export function SentenceReadingPreview({
  ids,
  resources,
  target,
  medium,
  senseLevel,
  requests
}: {
  ids: string[];
  resources?: Record<string, NextSentence>;
  target: string;
  medium: string;
  senseLevel?: string;
  requests: LexiconNextRequests;
}) {
  const actor = useAuthStore((s) => s.profile);
  const canRead = usePermission("sentences.access");
  const [reading, setReading] = useState("C2");
  const [selected, setSelected] = useState<{
    context: string;
    level: string;
  }>();
  const [registers, setRegisters] = useState<string[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [page, setPage] = useState<{ context: string; shown: number }>();
  const sessions = useRef(new Map<string, Session>());
  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["admin-lexicon-next", "sentence", actor?.id, id],
      queryFn: () => requests.sentence(id),
      enabled: canRead && !resources,
      retry: false
    }))
  });
  const catalog = useQuery({
    queryKey: ["admin-lexicon-next", "equivalent-catalog"],
    queryFn: requests.equivalentCatalog,
    enabled: canRead,
    staleTime: 5 * 60 * 1000,
    retry: false
  });
  if (!canRead) return <Alert type="warning" title="没有例句查看权限" />;
  if (!resources && queries.some((q) => q.isPending))
    return <Skeleton active paragraph={{ rows: 3 }} />;
  if (!resources && queries.some((q) => q.isError))
    return (
      <Alert
        type="error"
        title="例句加载失败"
        action={
          <Button
            onClick={() =>
              void Promise.all(
                queries.filter((q) => q.isError).map((q) => q.refetch())
              )
            }
          >
            重试
          </Button>
        }
      />
    );
  const loaded = resources
    ? ids.flatMap((id) => (resources[id] ? [resources[id]!] : []))
    : queries.flatMap((q) => (q.data ? [q.data] : []));
  const variants = loaded.flatMap((q) =>
    q.draft.variants.filter((v) => v.locale === target)
  );
  const rows = variants.filter(
    (row) =>
      (!registers.length ||
        registers.some((id) => row.metadata?.register_ids.includes(id))) &&
      (!domains.length ||
        domains.some((id) => row.metadata?.domain_ids.includes(id)))
  );
  const levels = exampleLevelContext(rows, reading, senseLevel);
  const context = JSON.stringify([
    target,
    medium,
    reading,
    senseLevel,
    registers,
    domains
  ]);
  const level =
    selected?.context === context && levels.selectable.includes(selected.level)
      ? selected.level
      : levels.preferred;
  const sorted = sortExamples(rows.filter((row) => row.level === level));
  const pageContext = JSON.stringify([
    context,
    level,
    sorted.map((row) => row.id)
  ]);
  const shown = page?.context === pageContext ? page.shown : 3;
  const names = (row: NextSentenceVariant) =>
    (["register_ids", "domain_ids"] as const).flatMap(
      (field) =>
        row.metadata?.[field].map((id) => ({
          id,
          name:
            catalog.data?.[
              field === "register_ids" ? "registers" : "domains"
            ].find((item) => item.id === id)?.name_zh ??
            (catalog.isPending
              ? "正在读取标签"
              : catalog.isError
                ? "标签目录不可用"
                : "配置不存在")
        })) ?? []
    );
  return (
    <EntryDialectContext.Provider
      value={target === "en-GB" ? "en-GB" : "en-US"}
    >
      <PronunciationPreviewProvider readOnly>
        <div aria-label="多维例句预览">
          <div className="next-sentence-fields">
            <label>
              英语阅读水平
              <Select
                aria-label="英语阅读水平"
                value={reading}
                options={sentenceLevels.map((value) => ({
                  value,
                  label: value
                }))}
                onChange={setReading}
              />
            </label>
            {(["registers", "domains"] as const).map((kind) => (
              <label key={kind}>
                {kind === "registers" ? "语体色彩" : "行业领域"}
                <Select
                  mode="multiple"
                  aria-label={`筛选${kind === "registers" ? "语体色彩" : "行业领域"}`}
                  value={kind === "registers" ? registers : domains}
                  placeholder="全部"
                  loading={catalog.isPending}
                  disabled={!catalog.data}
                  options={
                    catalog.data?.[kind].map((row) => ({
                      value: row.id,
                      label: row.name_zh
                    })) ?? []
                  }
                  onChange={kind === "registers" ? setRegisters : setDomains}
                />
              </label>
            ))}
          </div>
          {catalog.isError && (
            <Alert
              type="error"
              title="语体与领域目录加载失败"
              action={
                <Button onClick={() => void catalog.refetch()}>重试</Button>
              }
            />
          )}
          <Space wrap role="group" aria-label="例句等级">
            {sentenceLevels.map((grade) => (
              <Button
                key={grade}
                aria-pressed={level === grade}
                disabled={!levels.selectable.includes(grade)}
                onClick={() => setSelected({ context, level: grade })}
              >
                {grade} · {rows.filter((row) => row.level === grade).length}
              </Button>
            ))}
          </Space>
          {levels.fallback && (
            <p className="lexicon-next-muted">
              当前阅读水平暂无可用例句，显示最近等级。
            </p>
          )}
          {!sorted.length && (
            <Empty
              description={
                variants.length
                  ? "当前筛选条件下暂无例句"
                  : "当前目标语言尚未填写例句"
              }
            />
          )}
          {sorted.slice(0, shown).map((row) => {
            const source = loaded.find((q) =>
              q.draft.variants.some((v) => v.id === row.id)
            )!;
            const scope = JSON.stringify([
              actor?.id,
              source.id,
              source.revision,
              target,
              medium,
              reading,
              row.content,
              row.translations
            ]);
            return (
              <div className="next-sentence-reading-row" key={row.id}>
                <Space wrap>
                  <Tag>{row.level}</Tag>
                  <PronunciationPreviewControls
                    pronunciationId={row.id}
                    recommendationArea="example"
                    playbackOnly
                    assetOnly
                    dialect={target === "en-GB" ? "uk" : "us"}
                    ariaLabelPrefix="例句"
                    content={toRichTextV2(row.content)}
                    voiceProfile={row.voice_profile}
                    audioAssets={row.audio_assets}
                  />
                  <RichTextReadOnly className="tsz-words" value={row.content} />
                </Space>
                <Flex gap={8} wrap>
                  {names(row).map(({ id, name }) => (
                    <Tag key={id}>{name}</Tag>
                  ))}
                </Flex>
                <TranslationChoice
                  key={scope}
                  scope={scope}
                  sessions={sessions.current}
                  reading={reading}
                  rows={row.translations.filter(
                    (t) => t.locale === medium && t.content.text.trim()
                  )}
                />
              </div>
            );
          })}
          {sorted.length > shown && (
            <Button
              onClick={() =>
                setPage({ context: pageContext, shown: shown + 3 })
              }
            >
              更多例句
            </Button>
          )}
        </div>
      </PronunciationPreviewProvider>
    </EntryDialectContext.Provider>
  );
}
