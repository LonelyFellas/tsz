import { speechAccentGroup } from "@tsz/shared";
import { PlayCircleOutlined, SearchOutlined } from "@ant-design/icons";
import type { AdminSpeechVoice, AdminVoiceLibraryItem } from "@tsz/types";
import {
  Button,
  Checkbox,
  Flex,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography
} from "antd";
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type ThHTMLAttributes
} from "react";
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
const HeaderContext = createContext(false);
function CatalogHeaderCell({
  children,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th {...props}>
      <HeaderContext.Provider value>{children}</HeaderContext.Provider>
    </th>
  );
}
function ColumnHeader({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  const inHeader = useContext(HeaderContext);
  return inHeader ? (
    <div className="voice-library-column-header">
      <span>{label}</span>
      {children}
    </div>
  ) : (
    label
  );
}
const languages = new Intl.DisplayNames(["zh-CN"], { type: "language" });
const regions = new Intl.DisplayNames(["zh-CN"], { type: "region" });
function language(voice: AdminSpeechVoice) {
  return languages.of(voice.locale.split("-")[0]!) ?? voice.locale;
}
function region(voice: AdminSpeechVoice) {
  const code = new Intl.Locale(voice.locale).region;
  return code ? (regions.of(code) ?? code) : "未提供";
}
function list(
  values: string[] | null | undefined,
  labels: Record<string, string> = {}
) {
  return values?.length
    ? [
        ...new Set(values.map((value) => labels[value.toLowerCase()] ?? value))
      ].join("、")
    : values
      ? "无"
      : "未提供";
}

interface Props {
  voices: AdminSpeechVoice[];
  metadata: Map<string, AdminVoiceLibraryItem>;
  loading: boolean;
  settingsPending: boolean;
  canGenerate: boolean;
  validText: boolean;
  activeVoice?: string;
  pendingVoice: string | null;
  onAudition: (voice: AdminSpeechVoice) => void;
  onSettings: (voice: AdminSpeechVoice) => void;
}

type FilterKey =
  | "language"
  | "region"
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
      return [info?.model ?? missing];
    case "style":
      return ["neutral", ...voice.capabilities.styles];
    case "role":
      return info?.roles == null
        ? [missing]
        : info.roles.length
          ? info.roles
          : [none];
  }
};

export function VoiceCatalogTable({
  voices,
  metadata,
  loading,
  settingsPending,
  canGenerate,
  validText,
  activeVoice,
  pendingVoice,
  onAudition,
  onSettings
}: Props) {
  const [nameQuery, setNameQuery] = useState("");
  const [descriptionQuery, setDescriptionQuery] = useState("");
  const [commonOnly, setCommonOnly] = useState(false);
  const [sort, setSort] = useState("recommended");
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const rows = (() => {
    const name = nameQuery.trim().toLowerCase();
    const description = descriptionQuery.trim().toLowerCase();
    return voices
      .filter((voice) => {
        const info = metadata.get(voice.alias);
        return (
          (!name ||
            `${voice.display_name} ${voice.alias} ${voice.metadata?.provider_voice_id ?? ""}`
              .toLowerCase()
              .includes(name)) &&
          (!description ||
            [
              info?.description_zh,
              info?.notes,
              voice.metadata?.description,
              ...(voice.metadata?.personalities ?? []),
              list(voice.metadata?.personalities, personalityNames)
            ]
              .join(" ")
              .toLowerCase()
              .includes(description)) &&
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
  const hasFilters =
    !!nameQuery ||
    !!descriptionQuery ||
    commonOnly ||
    Object.values(filters).some((value) => value.length) ||
    sort !== "recommended";
  function reset() {
    setNameQuery("");
    setDescriptionQuery("");
    setCommonOnly(false);
    setFilters({});
    setSort("recommended");
    setPage(1);
  }
  function options(key: FilterKey, labels: Record<string, string> = {}) {
    return [...new Set(voices.flatMap((voice) => filterValues(voice, key)))]
      .sort()
      .map((value) => ({
        value,
        label:
          value === missing
            ? "未提供"
            : value === none
              ? "无"
              : (labels[value] ?? value)
      }));
  }
  function filter(
    key: FilterKey,
    label: string,
    labels?: Record<string, string>
  ) {
    return (
      <Select
        mode="multiple"
        popupAlign={{
          overflow: { adjustX: true, adjustY: true, shiftX: true }
        }}
        size="small"
        aria-label={label}
        placeholder="全部"
        allowClear
        maxTagCount="responsive"
        value={filters[key] ?? []}
        options={options(key, labels)}
        onChange={(value) => {
          setFilters((old) => ({ ...old, [key]: value }));
          setPage(1);
        }}
      />
    );
  }
  function header(label: string, controls: ReactNode) {
    return <ColumnHeader label={label}>{controls}</ColumnHeader>;
  }
  const text = (value: string | null | undefined) => (
    <Typography.Text type={value ? undefined : "secondary"}>
      {value || "未提供"}
    </Typography.Text>
  );
  return (
    <>
      <div className="voice-library-list-heading">
        <Typography.Title level={4}>音色列表</Typography.Title>
        <Typography.Text type="secondary">
          在表头查找音色，可横向滚动查看全部资料。
        </Typography.Text>
        <Button type="link" disabled={!hasFilters} onClick={reset}>
          清除筛选
        </Button>
      </div>
      {voices.some((voice) => !voice.metadata) && (
        <Typography.Paragraph type="secondary">
          部分目录扩展资料未提供，仍可浏览和试听现有音色。
        </Typography.Paragraph>
      )}
      <Table<AdminSpeechVoice>
        aria-label="音色列表"
        components={{ header: { cell: CatalogHeaderCell } }}
        size="middle"
        rowKey="alias"
        dataSource={rows}
        loading={loading}
        scroll={{ x: 2310 }}
        rowClassName={(voice) =>
          voice.alias === activeVoice ? "voice-library-row-active" : ""
        }
        pagination={{
          current: page,
          pageSize,
          onChange: (next, size) => {
            setPage(size === pageSize ? next : 1);
            setPageSize(size);
          },
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50],
          showTotal: (total) => `共 ${total} 个音色`
        }}
        locale={{
          emptyText: (
            <TableEmptyState
              filtered={hasFilters && !!voices.length}
              onResetFilters={reset}
              message="暂无可用音色，请联系管理员检查语音服务配置。"
            />
          )
        }}
        columns={[
          {
            title: "操作",
            key: "actions",
            width: 120,
            render: (_, voice) => (
              <Space size={4}>
                <GatedButton
                  shape="circle"
                  color={
                    speechAccentGroup(voice.locale) === "uk"
                      ? "danger"
                      : speechAccentGroup(voice.locale) === "us"
                        ? "primary"
                        : "default"
                  }
                  variant="outlined"
                  icon={<PlayCircleOutlined />}
                  aria-label={`试听 ${voice.display_name}`}
                  disabled={!canGenerate || !validText || settingsPending}
                  reason={
                    !canGenerate
                      ? "需要词库查看和语音生成权限"
                      : settingsPending
                        ? "正在加载个人音色设置"
                        : "请输入 1–500 个字符的试听文本"
                  }
                  loading={pendingVoice === voice.alias}
                  onClick={() => onAudition(voice)}
                />
                <Button
                  type="link"
                  size="small"
                  aria-label={`调整 ${voice.display_name} 参数`}
                  disabled={settingsPending}
                  onClick={() => onSettings(voice)}
                >
                  设置
                </Button>
              </Space>
            )
          },
          {
            title: header(
              "音色",
              <>
                <Input
                  type="search"
                  size="small"
                  prefix={<SearchOutlined />}
                  aria-label="搜索音色"
                  placeholder="名称或标识"
                  value={nameQuery}
                  allowClear
                  onChange={(event) => {
                    setNameQuery(event.target.value);
                    setPage(1);
                  }}
                />
                <Select
                  size="small"
                  aria-label="名称排序"
                  value={sort.startsWith("age") ? "recommended" : sort}
                  options={[
                    { value: "recommended", label: "常用优先" },
                    { value: "name-asc", label: "名称升序" },
                    { value: "name-desc", label: "名称倒序" }
                  ]}
                  onChange={(value) => {
                    setSort(value);
                    setPage(1);
                  }}
                />
                <Checkbox
                  checked={commonOnly}
                  onChange={(event) => {
                    setCommonOnly(event.target.checked);
                    setPage(1);
                  }}
                >
                  只看常用
                </Checkbox>
              </>
            ),
            key: "voice",
            width: 230,
            render: (_, voice) => (
              <Space size={4} wrap>
                <Tooltip
                  title={voice.metadata?.provider_voice_id ?? voice.alias}
                >
                  <Typography.Text strong>{voice.display_name}</Typography.Text>
                </Tooltip>
                {voice.is_common && <Tag color="blue">常用</Tag>}
              </Space>
            )
          },
          {
            title: header("语言", filter("language", "语言")),
            key: "language",
            width: 130,
            render: (_, voice) => language(voice)
          },
          {
            title: header("口音／地区", filter("region", "口音／地区")),
            key: "region",
            width: 145,
            render: (_, voice) => (
              <Flex vertical>
                <span>{region(voice)}</span>
                <Typography.Text type="secondary">
                  {voice.locale}
                </Typography.Text>
              </Flex>
            )
          },
          {
            title: header("性别", filter("gender", "性别", genderNames)),
            key: "gender",
            width: 125,
            render: (_, voice) => text(genderNames[voice.gender.toLowerCase()])
          },
          {
            title: header(
              "年龄",
              <>
                {filter("age", "年龄组", ageNames)}
                <Select
                  size="small"
                  aria-label="年龄排序"
                  value={sort.startsWith("age") ? sort : "none"}
                  options={[
                    { value: "none", label: "年龄不排序" },
                    { value: "age-asc", label: "年龄升序" },
                    { value: "age-desc", label: "年龄倒序" }
                  ]}
                  onChange={(value) => {
                    setSort(value === "none" ? "recommended" : value);
                    setPage(1);
                  }}
                />
              </>
            ),
            key: "age",
            width: 140,
            render: (_, voice) =>
              text(
                ageNames[voice.metadata?.age_group ?? ""] ??
                  voice.metadata?.age_group
              )
          },
          {
            title: header(
              "介绍、特征与听感",
              <Input
                type="search"
                size="small"
                prefix={<SearchOutlined />}
                aria-label="搜索介绍与听感"
                placeholder="介绍、特征或听感"
                value={descriptionQuery}
                allowClear
                onChange={(event) => {
                  setDescriptionQuery(event.target.value);
                  setPage(1);
                }}
              />
            ),
            key: "description",
            width: 340,
            render: (_, voice) => {
              const info = metadata.get(voice.alias);
              const official = voice.metadata;
              return (
                <Flex vertical gap={4}>
                  {info?.description_zh && text(info.description_zh)}
                  <Typography.Text type="secondary">
                    官方原文：{official?.description || "未提供"}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    特征：{list(official?.personalities, personalityNames)}
                  </Typography.Text>
                  {!!info?.notes && (
                    <Typography.Text type="secondary">
                      我的听感：{info.notes}
                    </Typography.Text>
                  )}
                  {official?.source_url && (
                    <Typography.Link
                      href={official.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      官方资料 · {official.checked_at.slice(0, 10)}
                    </Typography.Link>
                  )}
                </Flex>
              );
            }
          },
          {
            title: header("推荐场景", filter("scenario", "推荐场景")),
            key: "scenarios",
            width: 230,
            render: (_, voice) =>
              text(list(voice.metadata?.scenarios, scenarioNames))
          },
          {
            title: header("模型", filter("model", "模型", modelNames)),
            key: "model",
            width: 210,
            render: (_, voice) =>
              text(
                modelNames[voice.metadata?.model ?? ""] ?? voice.metadata?.model
              )
          },
          {
            title: header(
              "可选风格",
              filter("style", "可选风格", { ...styleNames, neutral: "自然" })
            ),
            key: "styles",
            width: 280,
            render: (_, voice) =>
              [
                "自然",
                ...voice.capabilities.styles.map(
                  (value) => styleNames[value] ?? value
                )
              ].join("、")
          },
          {
            title: header("可选角色", filter("role", "可选角色")),
            key: "roles",
            width: 260,
            render: (_, voice) => text(list(voice.metadata?.roles))
          }
        ]}
      />
    </>
  );
}
