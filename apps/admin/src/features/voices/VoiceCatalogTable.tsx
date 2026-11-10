import {
  useVoiceTranslation,
  voiceLabel,
  voiceSearchText,
  defaultVoiceTranslation,
  type VoiceTranslation
} from "./i18n";
import { VoiceName } from "./VoiceDisplay";
import {
  VoiceMetadataEditor,
  type MetadataEditorState
} from "./VoiceMetadataEditor";
import { speechAccentGroup } from "@tsz/shared";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  Volume2Icon,
  ListFilterIcon,
  MarsIcon,
  SearchIcon,
  VenusIcon
} from "lucide-react";
import type { AdminSpeechVoice, AdminVoiceLibraryItem } from "@tsz/types";
import { Button, Space, Tag } from "@tsz/ui/admin/display";
import { Checkbox, Input, Select } from "@tsz/ui/admin/forms";
import { Pagination, Table } from "@tsz/ui/admin/table";
import { Popover, Tooltip } from "@tsz/ui/admin/overlays";
import { useState, type ReactNode } from "react";
import { GatedButton } from "@/components/GatedButton";
import { TableEmptyState } from "@/components/TableEmptyState";
import { personalityNames, scenarioNames, styleNames } from "./voice-labels";

export const modelNames: Record<string, string> = {
  hd_flash: "HD Flash · 普通高清",
  neural_hd: "Neural HD",
  multilingual: "Multilingual",
  neural: "Neural",
  hd_omni: "HD Omni"
};
const genderNames: Record<string, string> = {
  female: "女声",
  male: "男声",
  neutral: "中性"
};
const genderIcons: Record<string, ReactNode> = {
  male: <MarsIcon aria-hidden className="voice-catalog-gender-male" />,
  female: <VenusIcon aria-hidden className="voice-catalog-gender-female" />,
  neutral: (
    <span aria-hidden className="voice-catalog-gender-neutral">
      ⚲
    </span>
  )
};
const ageNames: Record<string, string> = {
  Child: "儿童",
  Teen: "青少年",
  YoungAdult: "青年",
  Adult: "成年",
  Senior: "老年"
};
const ageOrder = Object.keys(ageNames);
const missing = "__missing__";
const none = "__none__";
const languages = new Intl.DisplayNames(["zh-CN"], { type: "language" });
const regions = new Intl.DisplayNames(["zh-CN"], { type: "region" });
const englishLanguages = new Intl.DisplayNames(["en"], { type: "language" });
const interfaceNames = {
  "zh-Hans": { language: languages, region: regions },
  "zh-Hant": {
    language: new Intl.DisplayNames(["zh-Hant"], { type: "language" }),
    region: new Intl.DisplayNames(["zh-Hant"], { type: "region" })
  },
  "en-GB": {
    language: new Intl.DisplayNames(["en-GB"], { type: "language" }),
    region: new Intl.DisplayNames(["en-GB"], { type: "region" })
  },
  "en-US": {
    language: new Intl.DisplayNames(["en-US"], { type: "language" }),
    region: new Intl.DisplayNames(["en-US"], { type: "region" })
  }
};
const interfaceNamesFor = (locale: string) =>
  interfaceNames[locale as keyof typeof interfaceNames] ??
  interfaceNames["zh-Hans"];
export const accentNames = { gb: "英式", us: "美式", none: "不归类" };
export function voiceAccent(voice: AdminSpeechVoice) {
  const group = speechAccentGroup(voice.locale, voice.accent);
  return group === "uk" ? "gb" : group === "us" ? "us" : "none";
}
export function language(voice: AdminSpeechVoice, interfaceLocale = "zh-Hans") {
  return (
    interfaceNamesFor(interfaceLocale).language.of(
      voice.locale.split("-")[0]!
    ) ?? voice.locale
  );
}
function region(voice: AdminSpeechVoice, interfaceLocale = "zh-Hans") {
  const code = new Intl.Locale(voice.locale).region;
  return code
    ? (interfaceNamesFor(interfaceLocale).region.of(code) ?? code)
    : "未提供";
}
function list(
  values: string[] | null | undefined,
  labels: Record<string, string> = {},
  t: VoiceTranslation = defaultVoiceTranslation
) {
  return values?.length
    ? [
        ...new Set(
          values.map((value) =>
            voiceLabel(labels[value.toLowerCase()] ?? value, t)
          )
        )
      ].join(t("list_separator"))
    : values
      ? t("none")
      : t("not_provided");
}

function preview(text: string) {
  return (
    <Tooltip title={text}>
      <span className="voice-catalog-cell-preview">{text}</span>
    </Tooltip>
  );
}

interface Props {
  canEditMetadata?: boolean;
  metadataEditing?: boolean;
  onMetadataEditorChange?: (
    id: string,
    state: MetadataEditorState | null
  ) => void;
  voices: AdminSpeechVoice[];
  metadata: Map<string, AdminVoiceLibraryItem>;
  loading: boolean;
  settingsPending: boolean;
  canGenerate: boolean;
  isVoiceTextValid?: (voice: AdminSpeechVoice) => boolean;
  trialVoiceAliases?: ReadonlySet<string>;
  validText: boolean;
  activeVoice?: string;
  pendingVoice: string | null;
  onAudition: (voice: AdminSpeechVoice) => void;
  onDetails: (voice: AdminSpeechVoice) => void;
}

type FilterKey =
  | "language"
  | "region"
  | "accent"
  | "gender"
  | "age"
  | "scenario"
  | "model"
  | "style"
  | "role";
type Filters = Partial<Record<FilterKey, string[]>>;

const filterValues = (voice: AdminSpeechVoice, key: FilterKey): string[] => {
  const info = voice.metadata;
  switch (key) {
    case "language":
      return [language(voice)];
    case "region":
      return [region(voice)];
    case "accent":
      return [voiceAccent(voice)];
    case "gender":
      return [voice.gender.toLowerCase() || missing];
    case "age":
      return [info?.age_group ?? missing];
    case "scenario":
      return info?.scenarios == null
        ? [missing]
        : info.scenarios.length
          ? [
              ...new Set(
                info.scenarios.map(
                  (value) => scenarioNames[value.toLowerCase()] ?? value
                )
              )
            ]
          : [none];
    case "model":
      return [info?.model ?? voice.capability_evidence?.model ?? missing];
    case "style":
      return ["neutral", ...voice.capabilities.styles];
    case "role": {
      const roles = voice.capability_evidence
        ? voice.capability_evidence.roles
        : info?.roles;
      return roles == null ? [missing] : roles.length ? roles : [none];
    }
  }
};

export function VoiceCatalogTable({
  canEditMetadata = false,
  metadataEditing = false,
  onMetadataEditorChange,
  voices,
  metadata,
  loading,
  settingsPending,
  canGenerate,
  isVoiceTextValid,
  trialVoiceAliases,
  validText,
  activeVoice,
  pendingVoice,
  onAudition,
  onDetails
}: Props) {
  const { t, i18n } = useVoiceTranslation();
  const [query, setQuery] = useState("");
  const [commonOnly, setCommonOnly] = useState(false);
  const [sort, setSort] = useState("recommended");
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editingRows, setEditingRows] = useState<AdminSpeechVoice[] | null>(
    null
  );
  const rows = (() => {
    const search = query.trim().toLowerCase();
    return voices
      .filter((voice) => {
        const info = metadata.get(voice.alias);
        return (
          (!search ||
            [
              voice.display_name,
              ...Object.keys(interfaceNames).map((locale) =>
                language(voice, locale)
              ),
              voice.locale,
              englishLanguages.of(voice.locale.split("-")[0]!),
              new Intl.DisplayNames([voice.locale], { type: "language" }).of(
                voice.locale.split("-")[0]!
              ),
              ...Object.keys(interfaceNames).map((locale) =>
                region(voice, locale)
              ),
              voiceSearchText(accentNames[voiceAccent(voice)]),
              voice.alias,
              voice.metadata?.provider_voice_id,
              info?.description_zh,
              info?.notes,
              voice.metadata?.description,
              ...(voice.metadata?.personalities ?? []),
              ...(voice.metadata?.personalities ?? []).map((value) =>
                voiceSearchText(personalityNames[value.toLowerCase()] ?? value)
              )
            ]
              .join(" ")
              .toLowerCase()
              .includes(search)) &&
          (!commonOnly || voice.is_common) &&
          (Object.entries(filters) as [FilterKey, string[]][]).every(
            ([key, selected]) =>
              !selected.length ||
              filterValues(voice, key).some((value) => selected.includes(value))
          )
        );
      })
      .sort((a, b) => {
        if (sort.startsWith("age")) {
          const aAge = ageOrder.indexOf(a.metadata?.age_group ?? "");
          const bAge = ageOrder.indexOf(b.metadata?.age_group ?? "");
          if (aAge === -1 || bAge === -1) {
            if (aAge !== bAge) return aAge === -1 ? 1 : -1;
          } else if (aAge !== bAge)
            return (sort === "age-desc" ? -1 : 1) * (aAge - bAge);
        }
        if (sort === "recommended" && a.is_common !== b.is_common)
          return Number(b.is_common) - Number(a.is_common);
        const order = a.display_name.localeCompare(b.display_name, "en", {
          numeric: true
        });
        return (
          (sort === "name-desc" ? -order : order) ||
          a.alias.localeCompare(b.alias)
        );
      });
  })();
  // 编辑期间固定结果集与顺序，避免异步资料更新卸载未保存的行内草稿。
  if (metadataEditing && editingRows === null) setEditingRows(rows);
  if (!metadataEditing && editingRows !== null) setEditingRows(null);
  const latestVoices = new Map(voices.map((voice) => [voice.alias, voice]));
  const displayedRows =
    metadataEditing && editingRows
      ? editingRows.map((voice) => latestVoices.get(voice.alias) ?? voice)
      : rows;
  const hasFilters =
    !!query ||
    commonOnly ||
    Object.values(filters).some((value) => value.length) ||
    sort !== "recommended";
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(displayedRows.length / pageSize))
  );
  function reset() {
    setQuery("");
    setCommonOnly(false);
    setFilters({});
    setSort("recommended");
    setPage(1);
  }
  function options(key: FilterKey, labels: Record<string, string> = {}) {
    return [...new Set(voices.flatMap((voice) => filterValues(voice, key)))]
      .sort()
      .map((value) => {
        const canonicalLabel =
          value === missing
            ? defaultVoiceTranslation("not_provided")
            : value === none
              ? defaultVoiceTranslation("none")
              : (labels[value] ?? value);
        const label = voiceLabel(canonicalLabel, t);
        const matching = voices.find((voice) =>
          filterValues(voice, key).includes(value)
        );
        const localizedLabel =
          matching && key === "language"
            ? language(matching, i18n.language)
            : matching && key === "region"
              ? voiceLabel(region(matching, i18n.language), t)
              : label;
        return {
          value,
          searchText: [
            localizedLabel,
            label,
            value,
            voiceSearchText(canonicalLabel),
            ...(matching && (key === "language" || key === "region")
              ? Object.keys(interfaceNames).map((locale) =>
                  key === "language"
                    ? language(matching, locale)
                    : region(matching, locale)
                )
              : [])
          ].join(" "),
          label:
            key === "gender" ? (
              <Space size={6}>
                {genderIcons[value]}
                {localizedLabel}
              </Space>
            ) : (
              localizedLabel
            )
        };
      });
  }
  function filter(
    key: FilterKey,
    label: string,
    labels?: Record<string, string>
  ) {
    const single = key === "style" || key === "role";
    return (
      <div className="voice-catalog-heading">
        <div className="voice-catalog-heading-label">
          <span>{label}</span>
          {key === "age" && sortButton("age")}
        </div>
        <Select
          mode={single ? undefined : "multiple"}
          disabled={metadataEditing}
          aria-label={label}
          placeholder={t("all")}
          allowClear
          showSearch
          maxTagCount="responsive"
          value={single ? filters[key]?.[0] : (filters[key] ?? [])}
          options={options(key, labels)}
          optionFilterProp="searchText"
          onChange={(value) => {
            setFilters((old) => ({
              ...old,
              [key]: typeof value === "string" ? [value] : (value ?? [])
            }));
            setPage(1);
          }}
        />
      </div>
    );
  }
  function sortOrder(key: "name" | "age") {
    return sort === `${key}-asc`
      ? ("ascending" as const)
      : sort === `${key}-desc`
        ? ("descending" as const)
        : ("none" as const);
  }
  function sortButton(key: "name" | "age") {
    const order = sortOrder(key);
    const next =
      order === "none"
        ? `${key}-asc`
        : order === "ascending"
          ? `${key}-desc`
          : "recommended";
    return (
      <Tooltip
        title={t(
          order === "descending"
            ? "common_voices_first"
            : key === "name"
              ? order === "none"
                ? "name_ascending"
                : "name_descending"
              : order === "none"
                ? "age_ascending"
                : "age_descending"
        )}
      >
        <Button
          type="text"
          size="small"
          className="voice-catalog-sort"
          aria-label={t(key === "name" ? "name_order" : "age_order")}
          aria-pressed={order !== "none"}
          disabled={metadataEditing}
          icon={
            order === "ascending" ? (
              <ArrowUpIcon />
            ) : order === "descending" ? (
              <ArrowDownIcon />
            ) : (
              <ArrowUpDownIcon />
            )
          }
          onClick={() => {
            setSort(next);
            setPage(1);
          }}
        />
      </Tooltip>
    );
  }
  return (
    <section className="voice-catalog" aria-label={t("voice_library")}>
      <Table<AdminSpeechVoice>
        className="voice-catalog-table"
        aria-label={t("voices")}
        rowKey="alias"
        size="small"
        tableLayout="fixed"
        scroll={{ x: 1900 }}
        loading={loading}
        pagination={false}
        dataSource={displayedRows.slice(
          (currentPage - 1) * pageSize,
          currentPage * pageSize
        )}
        rowClassName={(voice) =>
          voice.alias === activeVoice ? "voice-catalog-row-active" : ""
        }
        locale={{
          emptyText: (
            <TableEmptyState
              filtered={hasFilters && !!voices.length}
              onResetFilters={reset}
              message={t(
                "no_voices_are_available_ask_an_administrator_to_check_the_speech_"
              )}
            />
          )
        }}
        columns={[
          {
            key: "actions",
            title: (
              <div className="voice-catalog-heading">
                <span>{t("actions")}</span>
                {hasFilters && (
                  <Button
                    className="voice-catalog-reset"
                    type="link"
                    size="small"
                    disabled={metadataEditing}
                    onClick={reset}
                  >
                    {t("clear_filters")}
                  </Button>
                )}
              </div>
            ),
            width: 112,
            fixed: "left",
            render: (_, voice) => (
              <Space size={4} className="voice-catalog-actions">
                <GatedButton
                  className="voice-catalog-play"
                  shape="circle"
                  classNames={{ root: `voice-accent-${voiceAccent(voice)}` }}
                  color="default"
                  variant={voice.alias === activeVoice ? "solid" : "outlined"}
                  icon={<Volume2Icon />}
                  aria-label={t("audition_voice", { name: voice.display_name })}
                  disabled={
                    !canGenerate ||
                    !(isVoiceTextValid?.(voice) ?? validText) ||
                    settingsPending ||
                    voice.synthesis_available === false
                  }
                  reason={
                    voice.synthesis_available === false
                      ? t(
                          "synthesis_is_not_enabled_for_this_voice_or_language_its_capabilit"
                        )
                      : !canGenerate
                        ? t(
                            "lexicon_viewing_and_speech_generation_permissions_are_required"
                          )
                        : settingsPending
                          ? t("loading_personal_voice_settings")
                          : t("enter_1_500_characters_of_preview_text")
                  }
                  loading={pendingVoice === voice.alias}
                  onClick={() => onAudition(voice)}
                />
                <Button
                  size="small"
                  aria-label={t("adjust_voice", { name: voice.display_name })}
                  disabled={settingsPending}
                  onClick={() => onDetails(voice)}
                >
                  {t("adjust")}
                </Button>
              </Space>
            )
          },
          {
            key: "voice",
            title: (
              <div className="voice-catalog-heading">
                <div className="voice-catalog-heading-label">
                  <span>{t("voice")}</span>
                  <Space size={0}>
                    {sortButton("name")}
                    <Popover
                      trigger="click"
                      placement="bottomLeft"
                      content={
                        <Checkbox
                          checked={commonOnly}
                          disabled={metadataEditing}
                          onChange={(event) => {
                            setCommonOnly(event.target.checked);
                            setPage(1);
                          }}
                        >
                          {t("common_voices_only")}
                        </Checkbox>
                      }
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<ListFilterIcon />}
                        aria-label={t("common_voice_filter")}
                        aria-pressed={commonOnly}
                        disabled={metadataEditing}
                      />
                    </Popover>
                  </Space>
                </div>
                <Input
                  type="search"
                  prefix={<SearchIcon />}
                  aria-label={t("search_voices")}
                  disabled={metadataEditing}
                  placeholder={t(
                    "search_names_descriptions_or_listening_notes"
                  )}
                  value={query}
                  allowClear
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                />
              </div>
            ),
            width: 264,
            fixed: "left",
            onHeaderCell: () => ({ "aria-sort": sortOrder("name") }),
            render: (_, voice) => (
              <div className="voice-catalog-identity">
                <Tooltip
                  title={voice.metadata?.provider_voice_id ?? voice.alias}
                >
                  <span className="voice-catalog-name">
                    <VoiceName voice={voice} />
                  </span>
                </Tooltip>
                <Space size={4} wrap>
                  {voice.is_common && (
                    <Tag color="blue" variant="filled">
                      {t("common")}
                    </Tag>
                  )}
                  {trialVoiceAliases?.has(voice.alias) && (
                    <Tooltip
                      title={t(
                        "this_voice_s_preview_draft_is_kept_for_this_page_session"
                      )}
                    >
                      <Tag>{t("current_preview")}</Tag>
                    </Tooltip>
                  )}
                </Space>
              </div>
            )
          },
          {
            key: "language",
            title: filter("language", t("language")),
            width: 112,
            render: (_, voice) => language(voice, i18n.language)
          },
          {
            key: "region",
            title: filter("region", t("official_region")),
            width: 128,
            render: (_, voice) => voiceLabel(region(voice, i18n.language), t)
          },
          {
            key: "accent",
            title: filter("accent", t("accent_classification"), accentNames),
            width: 112,
            render: (_, voice) => {
              const content = (
                <Space size={6}>
                  <span
                    className={`voice-accent-dot voice-accent-${voiceAccent(voice)}`}
                    aria-hidden
                  />
                  {voiceLabel(accentNames[voiceAccent(voice)], t)}
                </Space>
              );
              return canEditMetadata ? (
                <VoiceMetadataEditor
                  voice={voice}
                  item={metadata.get(voice.alias)}
                  field="accent"
                  disabled={settingsPending}
                  onStateChange={onMetadataEditorChange}
                >
                  {content}
                </VoiceMetadataEditor>
              ) : (
                content
              );
            }
          },
          {
            key: "gender",
            title: filter("gender", t("gender"), genderNames),
            width: 112,
            render: (_, voice) => (
              <Space size={4}>
                {genderIcons[voice.gender.toLowerCase()]}
                {voiceLabel(
                  genderNames[voice.gender.toLowerCase()] ??
                    t("gender_not_provided"),
                  t
                )}
              </Space>
            )
          },
          {
            key: "age",
            title: filter("age", t("age_group"), ageNames),
            width: 112,
            onHeaderCell: () => ({ "aria-sort": sortOrder("age") }),
            render: (_, voice) =>
              voiceLabel(
                ageNames[voice.metadata?.age_group ?? ""] ??
                  voice.metadata?.age_group ??
                  t("age_not_provided"),
                t
              )
          },
          {
            key: "description",
            title: (
              <div className="voice-catalog-heading">
                <span>{t("description")}</span>
              </div>
            ),
            width: 300,
            render: (_, voice) => {
              const info = metadata.get(voice.alias);
              const description =
                info?.description_zh ??
                voice.metadata?.description ??
                t("no_description_yet_preview_the_voice_to_hear_it");
              return (
                <div className="voice-catalog-summary">
                  {!!voice.metadata?.personalities?.length && (
                    <div className="voice-catalog-tags">
                      {voice.metadata.personalities.map((value) => (
                        <Tag key={value}>
                          {voiceLabel(
                            personalityNames[value.toLowerCase()] ?? value,
                            t
                          )}
                        </Tag>
                      ))}
                    </div>
                  )}
                  {canEditMetadata ? (
                    <VoiceMetadataEditor
                      voice={voice}
                      item={info}
                      field="description"
                      disabled={settingsPending}
                      onStateChange={onMetadataEditorChange}
                    >
                      {preview(description || t("description_cleared"))}
                    </VoiceMetadataEditor>
                  ) : (
                    preview(description || t("description_cleared"))
                  )}
                  {!!info?.notes && (
                    <p className="voice-catalog-notes">
                      {preview(t("listening_notes", { notes: info.notes }))}
                    </p>
                  )}
                </div>
              );
            }
          },
          {
            key: "scenario",
            title: filter("scenario", t("suggested_scenarios")),
            width: 160,
            render: (_, voice) =>
              preview(list(voice.metadata?.scenarios, scenarioNames, t))
          },
          {
            key: "model",
            title: filter("model", t("model"), modelNames),
            width: 160,
            render: (_, voice) => {
              const model =
                voice.metadata?.model ?? voice.capability_evidence?.model;
              return model
                ? voiceLabel(modelNames[model] ?? model, t)
                : t("not_provided");
            }
          },
          {
            key: "style",
            title: filter("style", t("available_styles"), styleNames),
            width: 160,
            render: (_, voice) =>
              preview(
                list(["neutral", ...voice.capabilities.styles], styleNames, t)
              )
          },
          {
            key: "role",
            title: filter("role", t("available_roles")),
            width: 160,
            render: (_, voice) =>
              preview(
                list(
                  voice.capability_evidence
                    ? voice.capability_evidence.roles
                    : voice.metadata?.roles,
                  {},
                  t
                )
              )
          }
        ]}
      />
      {!!displayedRows.length && (
        <div className="voice-catalog-footer">
          <Pagination
            disabled={metadataEditing}
            className="voice-catalog-pagination"
            current={currentPage}
            pageSize={pageSize}
            total={displayedRows.length}
            onChange={(next, size) => {
              setPage(size === pageSize ? next : 1);
              setPageSize(size);
            }}
            showSizeChanger
            pageSizeOptions={[10, 20, 50]}
            showTotal={(total) => t("voice_count", { count: total })}
          />
        </div>
      )}
    </section>
  );
}
