import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Card, Space, Tag } from "@tsz/ui/admin/display";
import { Form, Input } from "@tsz/ui/admin/forms";
import { Search, Plus } from "lucide-react";
import type { NextDetection } from "@tsz/types";
import { usePermission } from "@/lib/auth";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import { validateEntryInput } from "@/features/dictionary/word-creation/entryClassification";
import { usePartOfSpeechLabel } from "@/features/dictionary/part-of-speech/PartOfSpeechLabels";
import { EntryLayout } from "./EntryLayout";

export function EntryStart({ requests }: { requests: LexiconNextRequests }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canCreate = usePermission("words.create");
  const posLabel = usePartOfSpeechLabel();
  const [value, setValue] = useState("");
  const [detection, setDetection] = useState<NextDetection>();
  const [busy, setBusy] = useState<"detect" | "create">();
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
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
    try {
      const result = await requests.detect({
        target_language: "en",
        surface: input.normalized
      });
      if (current !== generation.current) return;
      if (
        result.surface.normalize("NFKC") !==
          input.normalized.normalize("NFKC") ||
        result.kind !== input.kind
      ) {
        throw new Error("检测结果与当前输入不一致，请重新检测。");
      }
      setDetection({ ...result, surface: input.normalized });
    } catch (error) {
      if (current === generation.current)
        setError(error instanceof Error ? error.message : "检测失败，请重试。");
    } finally {
      lock.current = false;
      if (current === generation.current) setBusy(undefined);
    }
  }

  async function create() {
    if (lock.current || !canCreate || !detection || uncertain) return;
    lock.current = true;
    setBusy("create");
    setError(undefined);
    try {
      const entry = await requests.create({
        target_language: "en",
        kind: detection.kind,
        headword: detection.surface
      });
      await Promise.all(
        ["list", "stats", "creators"].map((key) =>
          queryClient.invalidateQueries({
            queryKey: ["admin-lexicon-next", key],
            refetchType: "all"
          })
        )
      );
      navigate(`/lexicon-next/${entry.id}`);
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

  return (
    <EntryLayout step="basics" exists={false}>
      <div className="lexicon-next lexicon-next-create">
        {!canCreate && <Alert type="info" title="当前账号没有创建词条权限" />}
        {error && <Alert type="error" showIcon title={error} />}
        <Card title="录入与检测">
          <Form layout="vertical" onFinish={() => void detect()}>
            <Form.Item
              label="词头"
              required
              validateStatus={fieldError ? "error" : undefined}
              help={fieldError}
            >
              <Input
                value={value}
                autoComplete="off"
                placeholder="输入英语单词或短语"
                className="tsz-words"
                disabled={Boolean(busy) || !canCreate || uncertain}
                onChange={(event) => {
                  setValue(event.target.value);
                  setDetection(undefined);
                  setError(undefined);
                  setFieldError(undefined);
                }}
              />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              icon={<Search aria-hidden />}
              loading={busy === "detect"}
              disabled={!canCreate || busy === "create" || uncertain}
            >
              检测词条
            </Button>
          </Form>
        </Card>
        {detection && (
          <>
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
                        <Tag>{posLabel(match.part_of_speech)}</Tag>
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
                          {match.glosses.map((gloss, index) => (
                            <li key={index}>{gloss}</li>
                          ))}
                        </ul>
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
                ”创建，词典结果仅供参考。
              </span>
              <Button
                type="primary"
                icon={<Plus aria-hidden />}
                loading={busy === "create"}
                disabled={!canCreate || Boolean(busy) || uncertain}
                onClick={() => void create()}
              >
                确认创建
              </Button>
            </div>
          </>
        )}
      </div>
    </EntryLayout>
  );
}
