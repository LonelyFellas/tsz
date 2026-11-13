import { Button } from "@tsz/ui/admin/display";
import { DatePicker, Form, Input, Select } from "@tsz/ui/admin/forms";
import {
  SearchIcon,
  SlidersHorizontalIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  XIcon
} from "lucide-react";
import type { AdminWordKind } from "@tsz/types";
import { CEFR_OPTIONS } from "./labels";
import { useLexiconListTranslation } from "./i18n/list";
import type { WordFilterValues } from "./listQuery";
const { RangePicker } = DatePicker;
interface Options {
  value: string;
  label: string;
}
interface QueryState {
  isError: boolean;
  isPending: boolean;
  refetch: () => unknown;
}
export function WordListFilters({
  form,
  filters,
  applyFilters,
  trashMode,
  advancedExpanded,
  setAdvancedExpanded,
  advancedPanelId,
  kindOptions,
  partOfSpeechOptions,
  partOfSpeechCatalog,
  creators,
  creatorOptions,
  kindLabel,
  posDisplayName,
  languages
}: {
  form: ReturnType<typeof Form.useForm<WordFilterValues>>[0];
  filters: WordFilterValues;
  applyFilters: (values: WordFilterValues) => void;
  trashMode: boolean;
  advancedExpanded: boolean;
  setAdvancedExpanded: (update: (current: boolean) => boolean) => void;
  advancedPanelId: string;
  kindOptions: Options[];
  partOfSpeechOptions: Options[];
  partOfSpeechCatalog: QueryState;
  creators: QueryState;
  creatorOptions: Options[];
  kindLabel: (kind: AdminWordKind) => string;
  posDisplayName: (code: string) => string;
  languages?: {
    targets: Options[];
    media: Options[];
    onTargetChange: (target?: string) => void;
  };
}) {
  const { t } = useLexiconListTranslation();
  const filterSummaries: Array<{ key: keyof WordFilterValues; label: string }> =
    [
      ...(languages && filters.targetLanguage
        ? [
            {
              key: "targetLanguage" as const,
              label: t("filter_target_language", {
                value:
                  languages.targets.find(
                    (item) => item.value === filters.targetLanguage
                  )?.label ?? filters.targetLanguage
              })
            }
          ]
        : []),
      ...(languages && filters.mediumLocale
        ? [
            {
              key: "mediumLocale" as const,
              label: t("filter_medium_language", {
                value:
                  languages.media.find(
                    (item) => item.value === filters.mediumLocale
                  )?.label ?? filters.mediumLocale
              })
            }
          ]
        : []),
      ...(filters.headword || filters.keyword
        ? [
            {
              key: "headword" as const,
              label: t("filter_entry", {
                value: filters.headword || filters.keyword
              })
            }
          ]
        : []),
      ...(filters.gloss
        ? [
            {
              key: "gloss" as const,
              label: t("filter_gloss", { value: filters.gloss })
            }
          ]
        : []),
      ...(filters.kind
        ? [
            {
              key: "kind" as const,
              label: t("filter_kind", { value: kindLabel(filters.kind) })
            }
          ]
        : []),
      ...(filters.pos
        ? [
            {
              key: "pos" as const,
              label: t("filter_pos", {
                value: posDisplayName(filters.pos)
              })
            }
          ]
        : []),
      ...(filters.level
        ? [
            {
              key: "level" as const,
              label: t("filter_level", { value: filters.level })
            }
          ]
        : []),
      ...(filters.createdBy
        ? [
            {
              key: "createdBy" as const,
              label: t("filter_creator", {
                value:
                  creatorOptions.find(
                    (item) => item.value === filters.createdBy
                  )?.label ?? filters.createdBy.slice(-8)
              })
            }
          ]
        : []),
      ...(filters.range?.some(Boolean)
        ? [
            {
              key: "range" as const,
              label: t("filter_date", {
                zone: filters.rangeTimezone ? t("beijing_parenthesis") : "",
                start: filters.range[0]?.format("YYYY-MM-DD") ?? t("unlimited"),
                end: filters.range[1]?.format("YYYY-MM-DD") ?? t("unlimited")
              })
            }
          ]
        : [])
    ];
  return (
    <section
      className="word-list-panel word-list-filter-panel"
      aria-label={t("filters")}
    >
      {!trashMode && (
        <div
          className="word-status-filters"
          role="group"
          aria-label={t("status_filters")}
        >
          {(
            [
              { value: undefined, label: t("all_entries") },
              { value: "draft", label: t("status_draft") },
              { value: "published", label: t("status_published") }
            ] as const
          ).map((item) => (
            <button
              key={item.value ?? "all"}
              type="button"
              aria-pressed={filters.status === item.value}
              onClick={() =>
                applyFilters({ ...form.getFieldsValue(), status: item.value })
              }
            >
              {item.label}
            </button>
          ))}
          {filters.status === "archived" && (
            <button type="button" aria-pressed="true">
              {t("status_archived")}
            </button>
          )}
        </div>
      )}
      <Form
        form={form}
        initialValues={{
          ...filters,
          headword: filters.headword ?? filters.keyword
        }}
        layout="horizontal"
        labelCol={{ flex: "72px" }}
        wrapperCol={{ flex: 1 }}
        labelAlign="left"
        colon={false}
        onFinish={applyFilters}
        className="word-search-form"
      >
        {languages && (
          <div className="word-search-languages">
            <Form.Item name="targetLanguage" label={t("target_language")}>
              <Select
                placeholder={t("all")}
                options={languages.targets}
                allowClear
                onChange={languages.onTargetChange}
              />
            </Form.Item>
            <Form.Item name="mediumLocale" label={t("medium_language")}>
              <Select
                placeholder={t("all")}
                options={languages.media}
                allowClear
              />
            </Form.Item>
          </div>
        )}
        <div className="word-search-main">
          <Form.Item
            name="headword"
            label={t("entry")}
            labelCol={{ flex: "none" }}
          >
            <Input
              type="search"
              className="tsz-words"
              placeholder={t("search_entry")}
            />
          </Form.Item>
          <Form.Item
            name="gloss"
            label={t("meaning")}
            labelCol={{ flex: "none" }}
          >
            <Input type="search" placeholder={t("search_meaning")} />
          </Form.Item>
          <div className="word-search-actions">
            <Button type="primary" htmlType="submit" icon={<SearchIcon />}>
              {t("search")}
            </Button>
            <Button
              type="text"
              onClick={() => {
                form.resetFields();
                applyFilters({});
              }}
            >
              {t("reset")}
            </Button>
            <Button
              type="text"
              icon={<SlidersHorizontalIcon />}
              className="word-search-toggle"
              aria-expanded={advancedExpanded}
              aria-controls={advancedPanelId}
              onClick={() => setAdvancedExpanded((value) => !value)}
            >
              {advancedExpanded ? t("collapse_filters") : t("more_filters")}
              {advancedExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </Button>
          </div>
        </div>
        <div
          id={advancedPanelId}
          className="word-search-advanced"
          hidden={!advancedExpanded}
          aria-hidden={!advancedExpanded}
          inert={!advancedExpanded}
        >
          <Form.Item name="kind" label={t("entry_kind")}>
            <Select placeholder={t("all")} options={kindOptions} allowClear />
          </Form.Item>
          <Form.Item name="pos" label={t("pos")}>
            <Select
              placeholder={t("all")}
              options={partOfSpeechOptions}
              loading={partOfSpeechCatalog.isPending}
              disabled={partOfSpeechCatalog.isError}
              allowClear
            />
          </Form.Item>
          <Form.Item name="level" label={t("meaning_level")}>
            <Select placeholder={t("all")} options={CEFR_OPTIONS} allowClear />
          </Form.Item>
          {!trashMode && (
            <Form.Item name="status" hidden>
              <input type="hidden" />
            </Form.Item>
          )}
          <Form.Item
            name="createdBy"
            label={t("creator")}
            help={
              creators.isError ? (
                <span>
                  {t("creators_failed")}
                  <Button
                    type="link"
                    size="small"
                    onClick={() => void creators.refetch()}
                  >
                    {t("reload_creators")}
                  </Button>
                </span>
              ) : undefined
            }
          >
            <Select
              placeholder={t("unlimited")}
              options={creatorOptions}
              allowClear
              showSearch={{ optionFilterProp: "label" }}
              loading={creators.isPending}
            />
          </Form.Item>
          <Form.Item name="rangeTimezone" hidden>
            <input type="hidden" />
          </Form.Item>
          <Form.Item
            name="range"
            label={t("created_at")}
            className="word-search-date"
            help={filters.rangeTimezone ? t("beijing_time") : undefined}
          >
            <RangePicker style={{ width: "100%" }} />
          </Form.Item>
          <div className="word-search-advanced-actions">
            <Button htmlType="submit" type="primary" size="small">
              {t("apply_filters")}
            </Button>
          </div>
        </div>
      </Form>
      {filterSummaries.length > 0 && (
        <div className="word-active-filters" aria-label={t("active_filters")}>
          <span>{t("filtered")}</span>
          {filterSummaries.map((item) => (
            <button
              type="button"
              key={item.key}
              aria-label={t("remove_filter", { label: item.label })}
              onClick={() => {
                const next = { ...filters };
                delete next[item.key];
                if (item.key === "headword") delete next.keyword;
                if (item.key === "range") delete next.rangeTimezone;
                applyFilters(next);
              }}
            >
              {item.label}
              <XIcon aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            className="word-clear-filters"
            onClick={() => {
              form.resetFields();
              applyFilters({});
            }}
          >
            {t("clear_filters")}
          </button>
        </div>
      )}
    </section>
  );
}
