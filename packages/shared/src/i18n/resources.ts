const zhHans = {
  actions: {
    save: "保存",
    cancel: "取消",
    close: "关闭",
    retry: "重试"
  },
  status: { loading: "加载中…" },
  pagination: {
    page: "第 {{page}} 页",
    item_count_other: "共 {{count}} 项"
  }
};

const zhHant = {
  actions: {
    save: "儲存",
    cancel: "取消",
    close: "關閉",
    retry: "重試"
  },
  status: { loading: "載入中…" },
  pagination: {
    page: "第 {{page}} 頁",
    item_count_other: "共 {{count}} 項"
  }
};

const en = {
  actions: {
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    retry: "Retry"
  },
  status: { loading: "Loading…" },
  pagination: {
    page: "Page {{page}}",
    item_count_one: "{{count}} item",
    item_count_other: "{{count}} items"
  }
};

/** 英美共用基础英文，地区资源只放实际差异；实例初始化时复制，避免跨请求修改。 */
export const interfaceResources = {
  "zh-Hans": { common: zhHans },
  "zh-Hant": { common: zhHant },
  en: { common: en },
  "en-GB": { common: {} },
  "en-US": { common: {} }
};
