import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBlocker, useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { Form, Input } from "@tsz/ui/admin/forms";
import { Search, Plus } from "lucide-react";
import type {
  EntryAnnotationGroup,
  NextDetection,
  NextEntryMatches,
  NextWorkspaceEntry
} from "@tsz/types";
import { Modal } from "@tsz/ui/admin/overlays";
import { usePermission } from "@/lib/auth";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import { validateEntryInput } from "@/features/dictionary/word-creation/entryClassification";
import { usePartOfSpeechLabel } from "@/features/dictionary/part-of-speech/PartOfSpeechLabels";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import {
  EntryAnnotationModal,
  type AnnotationRow
} from "@/features/dictionary/EntryAnnotationModal";
import { useLexiconLanguages } from "./LanguageSelection";
import { EntryLayout } from "./EntryLayout";
import { ExistingEntryMatches } from "./ExistingEntryMatches";
import { usePartOfSpeechCatalog } from "@/features/dictionary/part-of-speech/api";
import { dictionaryMatchPosLabel } from "./dictionaryPosLabel";

export interface LexiconNextCreationNavigationState {
  lexiconNextSuggestedPartOfSpeech?: string[];
}

export function EntryStart({ requests }: { requests: LexiconNextRequests }) {
  const navigate = useNavigate();
  const {
    search: languageSearch,
    targetLanguage,
    medium,
    setLocked
  } = useLexiconLanguages();
  const queryClient = useQueryClient();
  const canCreate = usePermission("words.create");
  const canEdit = usePermission("words.edit");
  const posLabel = usePartOfSpeechLabel();
  const partOfSpeechCatalog = usePartOfSpeechCatalog();
  const { t, i18n } = useLexiconEditorTranslation();
  const [value, setValue] = useState("");
  const [detection, setDetection] = useState<NextDetection>();
  const [expandedGlosses, setExpandedGlosses] = useState<Set<string>>(
    new Set()
  );
  const [entryMatches, setEntryMatches] = useState<NextEntryMatches>();
  const [busy, setBusy] = useState<"detect" | "create" | "matches">();
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();
  const [uncertain, setUncertain] = useState(false);
  const [annotationEntries, setAnnotationEntries] = useState<
    NextWorkspaceEntry[]
  >([]);
  const [annotationEntryId, setAnnotationEntryId] = useState<string>();
  const [annotationRevision, setAnnotationRevision] = useState(1);
  const lock = useRef(false);
  const generation = useRef(0);
  const blocker = useBlocker(() => lock.current);
  useEffect(() => {
    setLocked(Boolean(busy) || annotationEntries.length > 0);
    return () => setLocked(false);
  }, [annotationEntries.length, busy, setLocked]);
  useEffect(() => {
    generation.current += 1;
    setDetection(undefined);
    setEntryMatches(undefined);
    setAnnotationEntries([]);
    setAnnotationEntryId(undefined);
    setAnnotationRevision(1);
    setExpandedGlosses(new Set());
    if (!uncertain) setError(undefined);
    setFieldError(undefined);
  }, [targetLanguage, medium, uncertain]);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    []
  );

  async function detect() {
    if (lock.current || !canCreate || uncertain) return;
    const input = validateEntryInput(value);
    if (input.issue) {
      setFieldError(input.issue);
      return;
    }
    const current = ++generation.current;
    lock.current = true;
    setValue(input.normalized);
    setBusy("detect");
    setError(undefined);
    setFieldError(undefined);
    setDetection(undefined);
    setExpandedGlosses(new Set());
    setEntryMatches(undefined);
    setAnnotationEntries([]);
    setAnnotationEntryId(undefined);
    setAnnotationRevision(1);
    try {
      const query = {
        target_language: targetLanguage,
        surface: input.normalized
      };
      const [result, entries] = await Promise.all([
        requests.detect(query),
        requests.matchEntries({
          ...query,
          medium_locale: medium,
          page: 1,
          page_size: 20
        })
      ]);
      if (current !== generation.current) return;
      if (
        result.surface.normalize("NFKC") !==
          input.normalized.normalize("NFKC") ||
        result.kind !== input.kind ||
        entries.surface.normalize("NFKC") !== input.normalized.normalize("NFKC")
      ) {
        throw new Error("检测结果与当前输入不一致，请重新检测。");
      }
      setDetection({ ...result, surface: input.normalized });
      setEntryMatches(entries);
    } catch (error) {
      if (current === generation.current)
        setError(error instanceof Error ? error.message : "检测失败，请重试。");
    } finally {
      lock.current = false;
      if (current === generation.current) setBusy(undefined);
    }
  }

  async function matchPage(page: number) {
    if (lock.current || !detection || !entryMatches || !canCreate || uncertain)
      return;
    const current = generation.current;
    lock.current = true;
    setBusy("matches");
    setError(undefined);
    try {
      const result = await requests.matchEntries({
        target_language: targetLanguage,
        medium_locale: medium,
        surface: detection.surface,
        page,
        page_size: entryMatches.pagination.page_size
      });
      if (current !== generation.current) return;
      if (
        result.surface.normalize("NFKC") !== detection.surface.normalize("NFKC")
      )
        throw new Error("检测结果与当前输入不一致，请重新检测。");
      setEntryMatches(result);
    } catch (error) {
      if (current === generation.current)
        setError(
          error instanceof Error ? error.message : "读取已有词条失败，请重试。"
        );
    } finally {
      lock.current = false;
      if (current === generation.current) setBusy(undefined);
    }
  }

  function activeMatches() {
    return (entryMatches?.items ?? []).filter(
      (entry) => entry.status !== "archived"
    );
  }

  async function create(annotation?: string) {
    if (lock.current || !canCreate || !detection || !entryMatches || uncertain)
      return;
    const current = generation.current;
    lock.current = true;
    setBusy("create");
    setError(undefined);
    try {
      const entryId = annotationEntryId;
      const entry = entryId
        ? undefined
        : await requests.create({
            target_language: targetLanguage,
            medium_locale: medium,
            kind: detection.kind,
            headword: detection.surface
          });
      const createdId = entry?.id ?? entryId;
      if (!createdId) return;
      if (annotation !== undefined) {
        try {
          await requests.annotation(createdId, {
            annotation: annotation || null,
            base_annotation_revision: annotationRevision
          });
        } catch (annotationError) {
          try {
            const latest = await requests.workspaceEntry(createdId);
            if ((latest.annotation ?? null) !== (annotation || null)) {
              setUncertain(true);
              setError("词条标注已发生变化，请返回词库核实后再处理。");
              return;
            }
            setAnnotationRevision(latest.annotation_revision);
          } catch {
            setUncertain(true);
            setError("词条已创建，但无法确认标注状态，请返回词库核实。");
            return;
          }
          setAnnotationEntryId(createdId);
          setError(
            `词条已创建，但标注保存失败：${annotationError instanceof Error ? annotationError.message : "请求失败，请重试。"}`
          );
          return;
        }
      }
      await Promise.all(
        ["list", "stats", "creators"].map((key) =>
          queryClient.invalidateQueries({
            queryKey: ["admin-lexicon-next", key],
            refetchType: "all"
          })
        )
      );
      if (current !== generation.current) return;
      setAnnotationEntries([]);
      setAnnotationEntryId(undefined);
      lock.current = false;
      const suggestedPartOfSpeech = [
        ...new Set(detection.matches.map((match) => match.part_of_speech))
      ];
      navigate(`/lexicon-next/${createdId}?${languageSearch}`, {
        state: {
          lexiconNextSuggestedPartOfSpeech: suggestedPartOfSpeech
        } satisfies LexiconNextCreationNavigationState
      });
    } catch (error) {
      setUncertain(true);
      setError(
        `${error instanceof Error ? error.message : "请求失败。"} 创建结果未确认，请返回词库核实，勿重复创建。`
      );
    } finally {
      lock.current = false;
      setBusy(undefined);
    }
  }

  function requestCreate() {
    const matches = activeMatches();
    if (matches.length > 0) {
      if (!canEdit) {
        setError(
          t("creation_this_account_cannot_change_this_entry_s_annotation")
        );
        return;
      }
      setAnnotationEntries(matches);
      setAnnotationRevision(1);
      return;
    }
    void create();
  }

  const annotationRows: AnnotationRow[] = annotationEntries.map((entry) => {
    const labels = [
      entry.headword,
      ...entry.forms.map((form) => form.text)
    ].filter(
      (label, index, values) => label && values.indexOf(label) === index
    );
    return {
      key: entry.id,
      label: labels.join(" / "),
      annotation: entry.annotation,
      posLabels: entry.part_of_speech,
      glossPreviews: entry.gloss ? [entry.gloss] : [],
      createdByName: entry.created_by_name,
      updatedAt: entry.updated_at,
      href: `/lexicon-next/${entry.id}?${languageSearch}`,
      readOnly: true
    };
  });

  const annotationGroups: EntryAnnotationGroup[] = [
    {
      dialect_scope: "common",
      normalized_surface: detection?.surface ?? value,
      entry_ids: annotationEntries.map((entry) => entry.id)
    }
  ];

  return (
    <EntryLayout step="basics" exists={false} languageSearch={languageSearch}>
      <Modal
        open={blocker.state === "blocked"}
        title="请求尚未完成"
        closable={false}
        footer={
          <Button
            onClick={() => blocker.state === "blocked" && blocker.reset()}
          >
            继续编辑
          </Button>
        }
      >
        请等待当前请求完成后再离开。
      </Modal>
      <div
        className={`lexicon-next lexicon-next-create word-basics-workflow${detection ? " is-detected" : ""}`}
      >
        <div className="word-step-heading">
          <span className="word-step-number">STEP 01</span>
          <Typography.Title level={2} style={{ margin: 0 }}>
            {t("assistant_step_basics")}
          </Typography.Title>
        </div>
        {!canCreate && <Alert type="info" title="当前账号没有创建词条权限" />}
        {error && <Alert type="error" showIcon title={error} />}
        <Card
          className="word-basics-input-card"
          size="small"
          title={t("creation_input_and_detection")}
        >
          <Form layout="vertical" onFinish={() => void detect()}>
            <Form.Item
              label={t("creation_entry_text")}
              validateStatus={fieldError ? "error" : undefined}
              help={fieldError}
            >
              <Input.Search
                value={value}
                autoComplete="off"
                autoFocus
                placeholder={t("creation_e_g_center_or_give_up")}
                className="tsz-words"
                size="large"
                status={fieldError ? "error" : undefined}
                disabled={Boolean(busy) || !canCreate || uncertain}
                loading={busy === "detect"}
                enterButton={
                  <Space size={6}>
                    <Search aria-hidden />
                    {t("creation_dictionary_detection")}
                  </Space>
                }
                onSearch={() => void detect()}
                onChange={(event) => {
                  setValue(event.target.value);
                  setDetection(undefined);
                  setEntryMatches(undefined);
                  setAnnotationEntries([]);
                  setAnnotationEntryId(undefined);
                  setAnnotationRevision(1);
                  setError(undefined);
                  setFieldError(undefined);
                }}
              />
            </Form.Item>
            <Typography.Text type="secondary" className="word-field-help">
              {t(
                "creation_press_enter_to_run_detection_then_confirm_to_create"
              )}
            </Typography.Text>
          </Form>
        </Card>
        {detection && (
          <>
            {entryMatches && (
              <ExistingEntryMatches
                result={entryMatches}
                languageSearch={languageSearch}
                disabled={Boolean(busy) || uncertain}
                loading={busy === "matches"}
                onPageChange={(page) => void matchPage(page)}
              />
            )}
            <Card
              title="内置词典"
              extra={
                <Space>
                  <Tag>{detection.kind === "word" ? "单词" : "短语"}</Tag>
                  <span>{detection.matches.length} 条匹配</span>
                </Space>
              }
            >
              {detection.matches.length ? (
                <div className="lexicon-next-matches">
                  {detection.matches.map((match) => (
                    <article key={match.id} className="lexicon-next-match">
                      <Space wrap>
                        <strong className="tsz-words">{match.term}</strong>
                        <Tag>
                          {dictionaryMatchPosLabel(
                            match.part_of_speech,
                            partOfSpeechCatalog.data?.items,
                            posLabel,
                            i18n.language
                          )}
                        </Tag>
                      </Space>
                      {match.phonetics.length > 0 && (
                        <ul className="lexicon-next-phonetics">
                          {match.phonetics.map((phonetic, index) => (
                            <li key={index}>
                              <span className="tsz-phonetics">
                                {phonetic.ipa}
                              </span>
                              {phonetic.tags.length > 0 &&
                                ` · ${phonetic.tags.join("、")}`}
                            </li>
                          ))}
                        </ul>
                      )}
                      {match.glosses.length > 0 && (
                        <ul>
                          {match.glosses
                            .slice(
                              0,
                              expandedGlosses.has(match.id) ? undefined : 3
                            )
                            .map((gloss, index) => (
                              <li key={index}>{gloss}</li>
                            ))}
                        </ul>
                      )}
                      {match.glosses.length > 3 && (
                        <Button
                          type="link"
                          size="small"
                          aria-expanded={expandedGlosses.has(match.id)}
                          onClick={() => {
                            setExpandedGlosses((previous) => {
                              const next = new Set(previous);
                              if (next.has(match.id)) next.delete(match.id);
                              else next.add(match.id);
                              return next;
                            });
                          }}
                        >
                          {expandedGlosses.has(match.id)
                            ? "收起"
                            : `展开全部（共 ${match.glosses.length} 条）`}
                        </Button>
                      )}
                      {match.forms.length > 0 && (
                        <dl>
                          <dt>词形</dt>
                          <dd>
                            {match.forms.map((form, index) => (
                              <span
                                key={index}
                                className="lexicon-next-dictionary-form"
                              >
                                <span className="tsz-words">{form.text}</span>
                                {form.tags.length > 0 &&
                                  `（${form.tags.join("、")}）`}
                              </span>
                            ))}
                          </dd>
                        </dl>
                      )}
                      <p className="lexicon-next-muted">
                        {match.source_name} · {match.source_version}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <Alert
                  type="info"
                  showIcon
                  title="未找到内置词典匹配，可继续创建空白草稿。"
                />
              )}
            </Card>
            <div className="lexicon-next-create-actions">
              <span>
                按输入“<span className="tsz-words">{detection.surface}</span>
                ”创建，内置词典结果仅供参考。
              </span>
              <Button
                type="primary"
                icon={<Plus aria-hidden />}
                loading={busy === "create"}
                disabled={!canCreate || Boolean(busy) || uncertain}
                onClick={requestCreate}
              >
                确认创建
              </Button>
            </div>
          </>
        )}
      </div>
      {annotationEntries.length > 0 && (
        <EntryAnnotationModal
          creating
          groups={annotationGroups}
          rows={[
            ...annotationRows,
            {
              key: "incoming",
              incoming: true,
              label: detection?.surface ?? value,
              annotation: null
            }
          ]}
          onClose={() => {
            setAnnotationEntries([]);
            setAnnotationEntryId(undefined);
            setAnnotationRevision(1);
            setError(undefined);
          }}
          onSave={(values) => {
            void create(values.incoming?.trim());
          }}
          busy={busy === "create"}
          error={error}
        />
      )}
    </EntryLayout>
  );
}
