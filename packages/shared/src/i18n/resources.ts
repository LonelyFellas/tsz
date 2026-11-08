const zhHans = {
  actions: {
    save: "保存",
    cancel: "取消",
    close: "关闭",
    retry: "重试",
    confirm: "确定",
    clear: "清除",
    remove: "移除",
    edit: "编辑",
    copy: "复制",
    copied: "已复制",
    copyFailed: "复制失败，点击重试",
    editVoice: "语音编辑"
  },
  status: { loading: "加载中…", noData: "暂无数据", notEntered: "未填写" },
  controls: {
    pagination: "分页",
    previous: "上一页",
    next: "下一页",
    perPage: "每页条数",
    selectPage: "选择本页",
    selectRow: "选择 {{id}}",
    collapseRow: "收起行",
    expandRow: "展开行",
    date: "请选择日期",
    dateStart: "开始日期",
    dateEnd: "结束日期",
    dateClear: "清除日期",
    showPassword: "显示密码",
    hidePassword: "隐藏密码",
    search: "搜索",
    moreTabs: "更多标签页",
    closeNotification: "关闭通知",
    confirmAction: "确认操作",
    closePreview: "关闭预览",
    imagePrevious: "上一张",
    imageNext: "下一张",
    flipHorizontal: "水平翻转",
    flipVertical: "垂直翻转",
    rotateLeft: "向左旋转",
    rotateRight: "向右旋转",
    zoomOut: "缩小",
    zoomIn: "放大",
    imagePreview: "图片预览",
    required: "请填写${label}",
    whitespace: "${label}不能只包含空格"
  },
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
    retry: "重試",
    confirm: "確定",
    clear: "清除",
    remove: "移除",
    edit: "編輯",
    copy: "複製",
    copied: "已複製",
    copyFailed: "複製失敗，點擊重試",
    editVoice: "語音編輯"
  },
  status: { loading: "載入中…", noData: "暫無資料", notEntered: "未填寫" },
  controls: {
    pagination: "分頁",
    previous: "上一頁",
    next: "下一頁",
    perPage: "每頁筆數",
    selectPage: "選取本頁",
    selectRow: "選取 {{id}}",
    collapseRow: "收起列",
    expandRow: "展開列",
    date: "請選擇日期",
    dateStart: "開始日期",
    dateEnd: "結束日期",
    dateClear: "清除日期",
    showPassword: "顯示密碼",
    hidePassword: "隱藏密碼",
    search: "搜尋",
    moreTabs: "更多分頁",
    closeNotification: "關閉通知",
    confirmAction: "確認操作",
    closePreview: "關閉預覽",
    imagePrevious: "上一張",
    imageNext: "下一張",
    flipHorizontal: "水平翻轉",
    flipVertical: "垂直翻轉",
    rotateLeft: "向左旋轉",
    rotateRight: "向右旋轉",
    zoomOut: "縮小",
    zoomIn: "放大",
    imagePreview: "圖片預覽",
    required: "請填寫${label}",
    whitespace: "${label}不能只包含空格"
  },
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
    retry: "Retry",
    confirm: "OK",
    clear: "Clear",
    remove: "Remove",
    edit: "Edit",
    copy: "Copy",
    copied: "Copied",
    copyFailed: "Copy failed. Try again.",
    editVoice: "Edit voice"
  },
  status: { loading: "Loading…", noData: "No data", notEntered: "Not entered" },
  controls: {
    pagination: "Pagination",
    previous: "Previous page",
    next: "Next page",
    perPage: "Items per page",
    selectPage: "Select this page",
    selectRow: "Select {{id}}",
    collapseRow: "Collapse row",
    expandRow: "Expand row",
    date: "Select a date",
    dateStart: "Start date",
    dateEnd: "End date",
    dateClear: "Clear date",
    showPassword: "Show password",
    hidePassword: "Hide password",
    search: "Search",
    moreTabs: "More tabs",
    closeNotification: "Dismiss notification",
    confirmAction: "Confirm action",
    closePreview: "Close preview",
    imagePrevious: "Previous image",
    imageNext: "Next image",
    flipHorizontal: "Flip horizontally",
    flipVertical: "Flip vertically",
    rotateLeft: "Rotate left",
    rotateRight: "Rotate right",
    zoomOut: "Zoom out",
    zoomIn: "Zoom in",
    imagePreview: "Image preview",
    required: "Enter ${label}",
    whitespace: "${label} cannot contain only spaces"
  },
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
