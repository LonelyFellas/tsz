import { LinkOutlined, ReloadOutlined } from "@ant-design/icons";
import { HttpError } from "@tsz/api-client";
import type {
  AdminWordV3,
  PendingSentenceAssociationItemV3,
  WordSenseV3
} from "@tsz/types";
import {
  Alert,
  Button,
  Card,
  Empty,
  Flex,
  Select,
  Space,
  Tag,
  Typography
} from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { newWordNodeId } from "../../word-model/primitives";
import type { V3WordRequests } from "../api";
import {
  dialectLabel,
  formTypeLabel,
  partOfSpeechLabel
} from "../presentation";

interface Props {
  word: AdminWordV3;
  requests: V3WordRequests;
}

function senseGloss(sense: WordSenseV3): string {
  const definition = sense.definitions[0];
  if (!definition) return sense.sub_pos || "未填写释义";
  if ("content_id" in definition) {
    return definition.content.text.trim() || sense.sub_pos || "未填写释义";
  }
  const content = definition.content;
  if (content.mode === "unified") {
    return content.common.value.text.trim() || sense.sub_pos || "未填写释义";
  }
  const preferred = content[content.source_dialect];
  if (preferred.state === "ready" && preferred.variant.value.text.trim()) {
    return preferred.variant.value.text.trim();
  }
  const fallback = content.source_dialect === "uk" ? content.us : content.uk;
  return fallback.state === "ready"
    ? fallback.variant.value.text.trim() || sense.sub_pos || "未填写释义"
    : sense.sub_pos || "未填写释义";
}

export function V3PendingSentenceAssociationsPanel({ word, requests }: Props) {
  const [items, setItems] = useState<PendingSentenceAssociationItemV3[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string>();
  const [currentPublicationId, setCurrentPublicationId] = useState<string>();
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string>();
  const [selectedSense, setSelectedSense] = useState<Record<string, string>>(
    {}
  );
  const [selectedVariant, setSelectedVariant] = useState<
    Record<string, string>
  >({});
  const [claimingId, setClaimingId] = useState<string>();
  const requestIdRef = useRef(0);
  const claimKeysRef = useRef(new Map<string, string>());
  const posLabelById = useMemo(
    () =>
      new Map(
        word.forms.pos.map((pos) => [pos.pos_id, partOfSpeechLabel(pos.pos)])
      ),
    [word.forms.pos]
  );
  const senseOptions = useMemo(
    () =>
      word.meanings.pos.flatMap((pos) =>
        pos.senses.map((sense, index) => ({
          label: `${posLabelById.get(pos.pos_id) ?? partOfSpeechLabel("unknown")} · 释义 ${index + 1} · ${senseGloss(sense)}`,
          posId: pos.pos_id,
          value: sense.id
        }))
      ),
    [posLabelById, word.meanings.pos]
  );
  const variantOptions = useMemo(
    () =>
      word.forms.pos.flatMap((pos) =>
        pos.forms.flatMap((form) => {
          const variants =
            form.regional_variants.mode === "common"
              ? [form.regional_variants.common]
              : [form.regional_variants.uk, form.regional_variants.us];
          return variants.map((variant) => ({
            label: `${partOfSpeechLabel(pos.pos)} · ${dialectLabel(variant.dialect)} · ${formTypeLabel(form.form_type)} · ${variant.spelling}`,
            posId: pos.pos_id,
            spelling: variant.spelling.normalize("NFKC").trim().toLowerCase(),
            value: variant.id
          }));
        })
      ),
    [word.forms.pos]
  );
  const variantsFor = (item: PendingSentenceAssociationItemV3) =>
    variantOptions.filter(
      (variant) =>
        variant.spelling ===
          item.pending_target_headword.normalize("NFKC").trim().toLowerCase() &&
        (!selectedSense[item.association_id] ||
          variant.posId ===
            senseOptions.find(
              (sense) => sense.value === selectedSense[item.association_id]
            )?.posId)
    );
  const selectedVariantFor = (item: PendingSentenceAssociationItemV3) => {
    const matching = variantsFor(item);
    return (
      selectedVariant[item.association_id] ??
      (matching.length === 1 ? matching[0]!.value : undefined)
    );
  };

  const load = async (append = false) => {
    if (
      word.capabilities.sentence_associations === false ||
      word.status !== "published" ||
      word.has_unpublished_changes
    )
      return;
    const requestId = ++requestIdRef.current;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setCurrentPublicationId(undefined);
    }
    setError(undefined);
    try {
      const [response, publications] = await Promise.all([
        requests.listPendingSentenceAssociations(word.id, {
          page_size: 20,
          ...(append && nextCursor ? { cursor: nextCursor } : {})
        }),
        requests.listPublications(word.id)
      ]);
      if (requestId !== requestIdRef.current) return;
      const currentPublication = publications.publications.find(
        (publication) =>
          publication.entry_id === word.id &&
          publication.schema_version === 3 &&
          publication.is_current
      );
      if (!currentPublication) {
        throw new Error("当前词条缺少可认领的发布版本，请刷新后重试");
      }
      setCurrentPublicationId(currentPublication.publication_id);
      setItems((current) =>
        Array.from(
          new Map(
            [...(append ? current : []), ...response.results].map((item) => [
              item.association_id,
              item
            ])
          ).values()
        )
      );
      setTotal(response.total);
      setNextCursor(response.next_cursor ?? undefined);
      setHidden(false);
    } catch (reason) {
      if (
        reason instanceof HttpError &&
        (reason.status === 404 || reason.status === 503)
      ) {
        setHidden(true);
      } else {
        setError(
          reason instanceof Error ? reason.message : "待认领例句加载失败"
        );
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    void load();
    // word identity/status change defines a new query session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    word.capabilities.sentence_associations,
    word.has_unpublished_changes,
    word.id,
    word.status
  ]);

  if (
    word.capabilities.sentence_associations === false ||
    word.status !== "published" ||
    word.has_unpublished_changes ||
    hidden
  )
    return null;

  const claim = async (item: PendingSentenceAssociationItemV3) => {
    const targetSenseId = selectedSense[item.association_id];
    const targetVariantId = selectedVariantFor(item);
    if (
      !targetSenseId ||
      !currentPublicationId ||
      !targetVariantId ||
      claimKeysRef.current.has(item.association_id)
    )
      return;
    const idempotencyKey = newWordNodeId();
    claimKeysRef.current.set(item.association_id, idempotencyKey);
    setClaimingId(item.association_id);
    setError(undefined);
    try {
      await requests.claimPendingSentenceAssociation(
        item.owner_entry_id,
        item.association_id,
        idempotencyKey,
        {
          target_word_id: word.id,
          target_sense_id: targetSenseId,
          target_publication_id: currentPublicationId,
          target_form_variant_id: targetVariantId,
          base_owner_entry_revision: item.owner_entry_revision,
          base_owner_lifecycle_revision: item.owner_lifecycle_revision
        }
      );
      setItems((current) =>
        current.filter(
          (candidate) => candidate.association_id !== item.association_id
        )
      );
      setTotal((current) => Math.max(0, current - 1));
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "例句关联认领失败";
      await load();
      setError(message);
    } finally {
      claimKeysRef.current.delete(item.association_id);
      setClaimingId(undefined);
    }
  };

  return (
    <Card
      className="word-sense-groups-card"
      extra={<Tag color={total > 0 ? "orange" : "default"}>{total} 条</Tag>}
      loading={loading}
      title="待认领多维例句"
    >
      {error ? (
        <Alert
          action={
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>
              重试
            </Button>
          }
          showIcon
          title={error}
          type="error"
        />
      ) : items.length === 0 ? (
        <Empty
          description="当前词条没有待认领的多维例句"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <Space orientation="vertical" size={10} style={{ width: "100%" }}>
          {items.map((item) => (
            <Card key={item.association_id} size="small" type="inner">
              <Space orientation="vertical" size={8} style={{ width: "100%" }}>
                <Flex align="center" gap={8} wrap>
                  <LinkOutlined aria-hidden />
                  <Tag color="orange">待认领</Tag>
                  <Typography.Text strong>
                    {item.pending_target_headword}
                  </Typography.Text>
                  {item.pending_target_gloss ? (
                    <Typography.Text type="secondary">
                      {item.pending_target_gloss}
                    </Typography.Text>
                  ) : null}
                </Flex>
                <Typography.Text>{item.sentence_text}</Typography.Text>
                <Typography.Text type="secondary">
                  {`位置：${item.source_segments
                    .map(
                      (segment) =>
                        `${segment.surface} [${segment.start}, ${segment.end})`
                    )
                    .join(" … ")}`}
                </Typography.Text>
                <Flex gap={8} wrap>
                  <Select
                    aria-label={`为待认领例句 ${item.association_id} 选择具体词义`}
                    onChange={(senseId) => {
                      setSelectedSense((current) => ({
                        ...current,
                        [item.association_id]: senseId
                      }));
                      const nextPosId = senseOptions.find(
                        (sense) => sense.value === senseId
                      )?.posId;
                      setSelectedVariant((current) => {
                        const selectedId = current[item.association_id];
                        if (
                          !selectedId ||
                          variantOptions.find(
                            (variant) => variant.value === selectedId
                          )?.posId === nextPosId
                        ) {
                          return current;
                        }
                        const next = { ...current };
                        delete next[item.association_id];
                        return next;
                      });
                    }}
                    options={senseOptions}
                    placeholder="选择当前词条的具体词义"
                    style={{ flex: 1, minWidth: 280 }}
                    value={selectedSense[item.association_id]}
                  />
                  {variantsFor(item).length !== 1 ? (
                    <Select
                      aria-label={`为待认领例句 ${item.association_id} 选择具体词形`}
                      onChange={(variantId) =>
                        setSelectedVariant((current) => ({
                          ...current,
                          [item.association_id]: variantId
                        }))
                      }
                      options={variantsFor(item)}
                      placeholder={
                        variantsFor(item).length === 0
                          ? "当前发布版本没有匹配词形"
                          : "选择当前词条的具体英美词形"
                      }
                      style={{ flex: 1, minWidth: 280 }}
                      value={selectedVariant[item.association_id]}
                    />
                  ) : null}
                  <Button
                    disabled={
                      !selectedSense[item.association_id] ||
                      !currentPublicationId ||
                      !selectedVariantFor(item)
                    }
                    loading={claimingId === item.association_id}
                    onClick={() => void claim(item)}
                    type="primary"
                  >
                    正式认领
                  </Button>
                </Flex>
              </Space>
            </Card>
          ))}
          {nextCursor ? (
            <Button block loading={loadingMore} onClick={() => void load(true)}>
              加载更多
            </Button>
          ) : null}
        </Space>
      )}
    </Card>
  );
}
