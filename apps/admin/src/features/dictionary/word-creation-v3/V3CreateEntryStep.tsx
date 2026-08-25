import type { AdminWordV3, DetectLexiconSurfaceResponseV3 } from "@tsz/types";
import { Alert, Button, Card, Form, Input, Space, Typography } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { canAcknowledgeSurfaceSnapshot } from "../surfaceSnapshot";
import { useSurfaceSnapshotAny } from "../useSurfaceSnapshot";
import { newWordNodeId } from "../word-model/primitives";
import { createV3WordRequests, type V3WordRequests } from "./api";
import { classifyV3Problem } from "./problem";

type CreateRequests = Pick<V3WordRequests, "detect" | "surfacePage" | "create">;

interface Props {
  requests?: CreateRequests;
  onCreated: (word: AdminWordV3) => void;
}

const defaultRequests = createV3WordRequests();

function createErrorMessage(error: unknown): string {
  const problem = classifyV3Problem(error, "create");
  if (problem.kind === "network") {
    return "网络异常，创建失败，可原样重试。";
  }
  if (problem.kind === "authentication") return "登录已失效，请重新登录。";
  if (problem.kind === "authorization") return "当前账号没有创建权限。";
  if (problem.kind === "service_unavailable") {
    return "V3 创建服务暂不可用，请稍后重试。";
  }
  return "创建失败，请按错误提示处理后重试。";
}

export function V3CreateEntryStep({
  requests = defaultRequests,
  onCreated
}: Props) {
  const [surface, setSurface] = useState("");
  const [detection, setDetection] = useState<DetectLexiconSurfaceResponseV3>();
  const [detecting, setDetecting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();
  const [reconciliationRequired, setReconciliationRequired] = useState(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const detectAttempt = useRef<symbol | undefined>(undefined);
  const createAttempt = useRef<symbol | undefined>(undefined);
  const createKey = useRef<string | undefined>(undefined);
  const initialPage = detection?.surface_match_page;
  const snapshot = useSurfaceSnapshotAny(
    initialPage,
    `${detection?.detection_id ?? "none"}:${initialPage?.snapshot_id ?? "none"}`,
    requests.surfacePage
  );
  const acknowledgement = useMemo(
    () =>
      detection?.requires_acknowledgement
        ? canAcknowledgeSurfaceSnapshot(snapshot)
        : true,
    [detection?.requires_acknowledgement, snapshot]
  );
  const canCreate = Boolean(detection && acknowledgement && createKey.current);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      detectAttempt.current = undefined;
      createAttempt.current = undefined;
      createKey.current = undefined;
    };
  }, []);

  const handleSurfaceChange = (value: string) => {
    if (createAttempt.current) return;
    generation.current += 1;
    detectAttempt.current = undefined;
    createKey.current = undefined;
    setSurface(value);
    setDetection(undefined);
    setDetecting(false);
    setError(undefined);
  };

  const handleDetect = async () => {
    const value = surface.trim();
    if (!value || detectAttempt.current || createAttempt.current) return;
    const requestGeneration = generation.current + 1;
    const attempt = Symbol("detect");
    generation.current = requestGeneration;
    detectAttempt.current = attempt;
    createAttempt.current = undefined;
    createKey.current = undefined;
    setDetecting(true);
    setCreating(false);
    setDetection(undefined);
    setError(undefined);
    try {
      const response = await requests.detect({
        schema_version: 3,
        language: "en",
        kind: "word",
        surface: value
      });
      if (
        !mounted.current ||
        generation.current !== requestGeneration ||
        detectAttempt.current !== attempt
      ) {
        return;
      }
      createKey.current = newWordNodeId();
      setDetection(response);
      setReconciliationRequired(false);
    } catch (requestError) {
      if (
        !mounted.current ||
        generation.current !== requestGeneration ||
        detectAttempt.current !== attempt
      ) {
        return;
      }
      setError(createErrorMessage(requestError));
    } finally {
      if (
        mounted.current &&
        generation.current === requestGeneration &&
        detectAttempt.current === attempt
      ) {
        detectAttempt.current = undefined;
        setDetecting(false);
      }
    }
  };

  const handleCreate = async () => {
    const idempotencyKey = createKey.current;
    if (!detection || !canCreate || !idempotencyKey || createAttempt.current) {
      return;
    }
    const attempt = Symbol("create");
    createAttempt.current = attempt;
    setCreating(true);
    setError(undefined);
    try {
      const response = await requests.create(idempotencyKey, {
        schema_version: 3,
        detection_id: detection.detection_id,
        kind: "word",
        ...(detection.requires_acknowledgement &&
        snapshot.surface_confirmation_token
          ? {
              confirmed_surface_match_token: snapshot.surface_confirmation_token
            }
          : {})
      });
      if (!mounted.current || createAttempt.current !== attempt) {
        return;
      }
      onCreated(response.word);
    } catch (requestError) {
      if (!mounted.current || createAttempt.current !== attempt) {
        return;
      }
      const problem = classifyV3Problem(requestError, "create");
      const page =
        problem.kind === "surface_confirmation"
          ? problem.meta?.surface_match_page
          : undefined;
      if (problem.kind === "idempotency_conflict") {
        generation.current += 1;
        detectAttempt.current = undefined;
        createKey.current = undefined;
        setDetecting(false);
        setDetection(undefined);
        setReconciliationRequired(true);
      } else if (page?.schema_version === 3) {
        setDetection((current) =>
          current
            ? {
                ...current,
                requires_acknowledgement: true,
                surface_match_page: page
              }
            : current
        );
      }
      if (
        problem.kind === "surface_confirmation" &&
        problem.requires_new_idempotency_key
      ) {
        createKey.current = newWordNodeId();
      }
      setError(
        problem.kind === "idempotency_conflict"
          ? undefined
          : createErrorMessage(requestError)
      );
    } finally {
      if (mounted.current && createAttempt.current === attempt) {
        createAttempt.current = undefined;
        setCreating(false);
      }
    }
  };

  return (
    <Card title="创建 Smart Lexicon V3 草稿">
      <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
        <Form.Item label="待创建词面" style={{ marginBottom: 0 }}>
          <Input
            aria-label="待创建词面"
            disabled={creating}
            value={surface}
            onChange={(event) => handleSurfaceChange(event.target.value)}
            onPressEnter={() => void handleDetect()}
          />
        </Form.Item>
        <Button
          loading={detecting}
          disabled={creating || !surface.trim()}
          onClick={() => void handleDetect()}
        >
          检测 V3 词面
        </Button>
        {detection ? (
          <Alert
            showIcon
            type="info"
            title={`检测有效：${detection.normalized_surface}`}
            description={`内置词典：${detection.builtin_dictionary.status}`}
          />
        ) : null}
        {detection?.requires_acknowledgement ? (
          <Alert
            showIcon
            type={snapshot.phase === "disabled" ? "error" : "warning"}
            title={`同形提示已加载 ${snapshot.items.length}/${snapshot.total}`}
            description={
              snapshot.phase === "disabled"
                ? snapshot.policy_block_code
                : snapshot.phase === "loading"
                  ? "正在顺序加载完整确认快照。"
                  : snapshot.phase === "error" || snapshot.phase === "expired"
                    ? "确认快照不可用，请重新检测。"
                    : "创建请求只会携带服务端终页签发的确认 token。"
            }
          />
        ) : null}
        {reconciliationRequired ? (
          <Alert
            showIcon
            type="warning"
            title="创建状态已变化，请重新检测并确认后再创建。"
          />
        ) : null}
        {error ? <Alert showIcon type="error" title={error} /> : null}
        {detection ? (
          <Button
            type="primary"
            loading={creating}
            disabled={creating || !canCreate}
            onClick={() => void handleCreate()}
          >
            {detection.requires_acknowledgement
              ? "确认并创建 V3 草稿"
              : "创建 V3 草稿"}
          </Button>
        ) : null}
        <Typography.Text type="secondary">
          当前仅创建 V3 word 草稿；检测与创建成功均以真实 API 响应为准。
        </Typography.Text>
      </Space>
    </Card>
  );
}

export type { CreateRequests as V3CreateEntryRequests };
