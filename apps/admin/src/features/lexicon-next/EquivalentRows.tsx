import { useRef, useState } from "react";
import type {
  LexiconTaxonomy,
  NextEquivalent,
  NextEquivalentCatalog,
  NextSense
} from "@tsz/types";
import {
  Alert,
  Button,
  Empty,
  Skeleton,
  Space,
  Tag
} from "@tsz/ui/admin/display";
import { Checkbox, Input, Select } from "@tsz/ui/admin/forms";
import { Popover, Tooltip } from "@tsz/ui/admin/overlays";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { SenseSection } from "@/features/dictionary/word-creation-v3/components/V3SenseSection";
import {
  commonnessUnits,
  emptyEquivalentMetadata,
  equivalentKey,
  equivalentScore,
  parseEquivalentBatch,
  setEquivalentScore,
  sortedEquivalents
} from "./equivalents";
import { localeLabels } from "./model";
import "./equivalents.css";

function TaxonomyPicker({
  values,
  options,
  label,
  disabled,
  onChange
}: {
  values: string[];
  options: LexiconTaxonomy[];
  label: string;
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  const { t, i18n } = useLexiconEditorTranslation();
  const [open, setOpen] = useState(false);
  const all =
    options.length > 0 && options.every((option) => values.includes(option.id));
  const missing = values.some(
    (id) => !options.some((option) => option.id === id)
  );
  return (
    <Popover
      title={label}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomLeft"
      content={
        <div className="lexicon-next-taxonomy-options">
          <Checkbox
            aria-label={`${label} ${t("eq_general")}`}
            checked={all}
            indeterminate={!all && values.length > 0}
            disabled={disabled || !options.length || missing}
            onChange={(event) =>
              onChange(
                event.target.checked ? options.map((option) => option.id) : []
              )
            }
          >
            {t("eq_general")}
          </Checkbox>
          {options.map((option) => (
            <Checkbox
              key={option.id}
              checked={values.includes(option.id)}
              disabled={disabled || missing}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...values, option.id]
                    : values.filter((id) => id !== option.id)
                )
              }
            >
              {i18n.language.startsWith("en") ? option.name_en : option.name_zh}
            </Checkbox>
          ))}
          <Button size="small" onClick={() => setOpen(false)}>
            {t("eq_close")}
          </Button>
        </div>
      }
    >
      <Button
        className="lexicon-next-taxonomy-trigger"
        aria-label={label}
        disabled={disabled || !options.length || missing}
        aria-expanded={open}
      >
        {all
          ? t("eq_general")
          : !values.length
            ? t("eq_unselected")
            : values.length === 1
              ? i18n.language.startsWith("en")
                ? options.find((option) => option.id === values[0])?.name_en
                : options.find((option) => option.id === values[0])?.name_zh
              : t("eq_partial", { count: values.length })}
        <ChevronDown aria-hidden size={14} />
      </Button>
    </Popover>
  );
}

export function EquivalentRows({
  sense,
  locale,
  disabled,
  catalog,
  loading,
  catalogError,
  remaining,
  onRetry,
  onChange
}: {
  sense: NextSense;
  locale: string;
  disabled: boolean;
  catalog?: NextEquivalentCatalog;
  loading: boolean;
  catalogError: boolean;
  remaining: number;
  onRetry: () => void;
  onChange: (patch: Partial<NextSense>) => void;
}) {
  const { t, i18n } = useLexiconEditorTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<"text" | "count" | undefined>();
  const [domain, setDomain] = useState("");
  const [editing, setEditing] = useState(false);
  const pinnedOrder = useRef<string[]>([]);
  const composing = useRef(false);
  const visible = sense.equivalents.filter((row) => row.locale === locale);
  const sorted = sortedEquivalents(visible, domain || undefined);
  const rows = editing
    ? [...visible].sort(
        (a, b) =>
          pinnedOrder.current.indexOf(a.id) - pinnedOrder.current.indexOf(b.id)
      )
    : sorted;
  const update = (row: NextEquivalent) =>
    onChange({
      equivalents: sense.equivalents.map((item) =>
        item.id === row.id ? row : item
      )
    });
  const remove = (id: string) =>
    onChange({ equivalents: sense.equivalents.filter((row) => row.id !== id) });
  const title = t("eq_title", { language: localeLabels[locale] ?? locale });
  const missing =
    catalog &&
    visible.some(
      (row) =>
        row.metadata?.register_ids.some(
          (id) => !catalog.registers.some((option) => option.id === id)
        ) ||
        row.metadata?.domain_ids.some(
          (id) => !catalog.domains.some((option) => option.id === id)
        ) ||
        row.metadata?.commonness.some(
          (score) =>
            score.domain_id &&
            !catalog.domains.some((option) => option.id === score.domain_id)
        )
    );
  function add(value = input) {
    const batch = parseEquivalentBatch(value, sense.equivalents, locale);
    if (batch.error) {
      setInput(value);
      setError("text");
      return;
    }
    if (batch.words.length > remaining) {
      setInput(value);
      setError("count");
      return;
    }
    if (batch.words.length)
      onChange({
        equivalents: [
          ...sense.equivalents,
          ...batch.words.map((text) => ({
            id: crypto.randomUUID(),
            locale,
            text,
            metadata: emptyEquivalentMetadata()
          }))
        ],
        no_equivalents: (sense.no_equivalents ?? []).filter(
          (item) => item !== locale
        )
      });
    setInput("");
    setError(undefined);
  }
  function focusRow() {
    pinnedOrder.current = sorted.map((row) => row.id);
    setEditing(true);
  }
  return (
    <SenseSection
      label={title}
      count={visible.length}
      unit="条"
      collapsed={collapsed}
      onToggle={() => setCollapsed(!collapsed)}
    >
      <div className="lexicon-next-equivalents">
        {catalogError && (
          <Alert
            type="error"
            title={t("eq_catalog_error")}
            action={<Button onClick={onRetry}>{t("eq_retry")}</Button>}
          />
        )}
        {loading && <Skeleton active paragraph={{ rows: 1 }} />}
        {missing && (
          <Alert
            type="error"
            title={t("eq_catalog_missing")}
            action={<Button onClick={onRetry}>{t("eq_retry")}</Button>}
          />
        )}
        {catalog && !catalog.registers.length && !catalog.domains.length && (
          <Alert type="info" title={t("eq_catalog_empty")} />
        )}
        <div className="lexicon-next-equivalent-tokens">
          {sorted.map((row) => (
            <Tag key={row.id}>
              {row.text}
              <Button
                type="text"
                size="small"
                aria-label={t("eq_remove", { word: row.text })}
                disabled={disabled}
                icon={<X aria-hidden size={12} />}
                onClick={() => remove(row.id)}
              />
            </Tag>
          ))}
        </div>
        <Space.Compact block>
          <Input
            aria-label={t("eq_input")}
            placeholder={t("eq_input_hint")}
            value={input}
            disabled={disabled}
            onChange={(event) => {
              setInput(event.target.value);
              setError(undefined);
            }}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !composing.current &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229
              ) {
                event.preventDefault();
                add();
              }
            }}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              if (/[,，、;；\n\r]/u.test(text) && !input) {
                event.preventDefault();
                add(text);
              }
            }}
            onBlur={() => {
              if (!composing.current && input.trim()) add();
            }}
          />
          <Button
            icon={<Plus aria-hidden size={14} />}
            disabled={disabled || !input.trim()}
            onClick={() => add()}
          >
            {t("eq_add")}
          </Button>
        </Space.Compact>
        <span className="lexicon-next-muted">{t("eq_separators")}</span>
        {error && (
          <Alert
            type="error"
            title={t(error === "text" ? "eq_invalid_text" : "eq_too_many")}
          />
        )}
        <div className="lexicon-next-equivalent-domain">
          <label>
            {t("eq_domain")}
            <Select
              aria-label={t("eq_domain")}
              value={domain}
              onChange={setDomain}
              options={[
                { value: "", label: t("eq_general") },
                ...(catalog?.domains ?? []).map((option) => ({
                  value: option.id,
                  label: i18n.language.startsWith("en")
                    ? option.name_en
                    : option.name_zh
                }))
              ]}
            />
          </label>
        </div>
        {!visible.length ? (
          <>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("eq_empty")}
            />
            <Checkbox
              disabled={disabled}
              checked={sense.no_equivalents?.includes(locale) ?? false}
              onChange={(event) =>
                onChange({
                  no_equivalents: [
                    ...(sense.no_equivalents ?? []).filter(
                      (item) => item !== locale
                    ),
                    ...(event.target.checked ? [locale] : [])
                  ]
                })
              }
            >
              {t("eq_no_suitable")}
            </Checkbox>
          </>
        ) : (
          <div className="lexicon-next-equivalent-scroll">
            <table className="lexicon-next-equivalent-table">
              <colgroup>
                <col className="equivalent-col-word" />
                <col className="equivalent-col-score" />
                <col className="equivalent-col-tags" />
                <col className="equivalent-col-tags" />
                <col className="equivalent-col-action" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">{t("eq_word")}</th>
                  <th scope="col">{t("eq_score")}</th>
                  <th scope="col">{t("eq_registers")}</th>
                  <th scope="col">{t("eq_domains")}</th>
                  <th scope="col" aria-label={t("eq_actions")} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const score = equivalentScore(row, domain || undefined);
                  const duplicate = visible.some(
                    (other) =>
                      other.id !== row.id &&
                      equivalentKey(other.text) === equivalentKey(row.text)
                  );
                  const textError = !row.text.trim()
                    ? "eq_required_text"
                    : [...row.text].length > 200 || /\p{Cc}/u.test(row.text)
                      ? "eq_invalid_text"
                      : duplicate
                        ? "eq_duplicate"
                        : undefined;
                  const invalidScore =
                    !!score.value && commonnessUnits(score.value) === undefined;
                  return (
                    <tr key={row.id}>
                      <td>
                        <Input
                          aria-label={t("eq_edit", { index: index + 1 })}
                          value={row.text}
                          disabled={disabled}
                          status={textError ? "error" : undefined}
                          onFocus={focusRow}
                          onBlur={() => setEditing(false)}
                          onChange={(event) =>
                            update({ ...row, text: event.target.value })
                          }
                        />
                        {textError && <span role="alert">{t(textError)}</span>}
                      </td>
                      <td>
                        <Tooltip
                          trigger={["hover", "focus"]}
                          title={
                            score.inherited ? t("eq_inherited_hint") : undefined
                          }
                        >
                          <Input
                            className="lexicon-next-commonness-input"
                            aria-label={t("eq_score_label", {
                              word: row.text
                            })}
                            aria-description={
                              score.inherited
                                ? t("eq_inherited_hint")
                                : undefined
                            }
                            inputMode="decimal"
                            value={score.value}
                            placeholder={t("eq_unassessed")}
                            disabled={disabled}
                            status={invalidScore ? "error" : undefined}
                            onFocus={focusRow}
                            onChange={(event) =>
                              update(
                                setEquivalentScore(
                                  row,
                                  domain || undefined,
                                  event.target.value
                                )
                              )
                            }
                            onBlur={() => {
                              const own = row.metadata?.commonness.find(
                                (item) =>
                                  item.domain_id === (domain || undefined)
                              );
                              const units = own && commonnessUnits(own.score);
                              if (units !== undefined)
                                update(
                                  setEquivalentScore(
                                    row,
                                    domain || undefined,
                                    (units / 10).toFixed(1)
                                  )
                                );
                              setEditing(false);
                            }}
                          />
                        </Tooltip>
                        {invalidScore && (
                          <span role="alert">{t("eq_invalid_score")}</span>
                        )}
                      </td>
                      {(["register_ids", "domain_ids"] as const).map(
                        (field) => (
                          <td key={field}>
                            <TaxonomyPicker
                              values={row.metadata?.[field] ?? []}
                              options={
                                catalog?.[
                                  field === "register_ids"
                                    ? "registers"
                                    : "domains"
                                ] ?? []
                              }
                              label={t("eq_select", {
                                word: row.text,
                                kind: t(
                                  field === "register_ids"
                                    ? "eq_registers"
                                    : "eq_domains"
                                )
                              })}
                              disabled={disabled || loading || catalogError}
                              onChange={(ids) =>
                                update({
                                  ...row,
                                  metadata: {
                                    ...(row.metadata ??
                                      emptyEquivalentMetadata()),
                                    [field]: ids
                                  }
                                })
                              }
                            />
                          </td>
                        )
                      )}
                      <td>
                        <Button
                          type="text"
                          danger
                          disabled={disabled}
                          aria-label={t("eq_remove", { word: row.text })}
                          icon={<Trash2 aria-hidden size={14} />}
                          onClick={() => remove(row.id)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SenseSection>
  );
}
