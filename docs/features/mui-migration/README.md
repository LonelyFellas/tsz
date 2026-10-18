# 管理后台与共享语音编辑器迁移 MUI

当前工作：2026-10-18 按用户要求迁回 Ant Design，进展见第 11 节。第 1～10 节保留此前迁移记录。

原迁移更新：2026-10-17。源码基线：前端 `origin/main`，`095bb67e89b1820c41ef7d5108ed1098b1f7c716`。

当前阶段：P0～P5 实施、本地质量门、完整 e2e 与实际 200% 缩放验收完成。用户已授权修复、提交、推送并创建 PR；按 ship 技能执行精确提交的独立审查与原生 hooks。PR #471 已创建；用户进一步授权修复 CI、全绿后合并并部署测试环境，合并与部署均以精确 SHA 的 CI 为门禁。

## 1. 目标、范围与默认决策

目标是让管理后台采用统一的 MUI 视觉与交互，完整移除业务、测试、构建和依赖中的 Ant Design，同时保留现有业务能力、请求语义和已保存数据的可用性。

| 决策          | 本方案采用的做法                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| 迁移范围      | `apps/admin`、`packages/voice-editor` 的交互组件，以及相关测试和构建配置                                |
| C 端          | 保留 `apps/web` 与 `packages/ui` 的现有设计体系；调整共享包入口并回归词典、词单阅读                     |
| 视觉目标      | MUI 自身的组件语言，保留品牌蓝 `#2053FF` 和现有字体；本期以浅色后台为准                                 |
| Material 版本 | 不把完整 Material Design 3 / Material You 实现纳入本期。MUI 官方概览目前说明支持 Material Design 2 [S1] |
| 表格          | MUI Core `Table` 系列与现有服务端分页、查询逻辑；不默认引入 Data Grid                                   |
| 表单          | 普通表单采用 React Hook Form；已有受控业务草稿继续由原模型持有状态                                      |
| 日期          | 免费 MUI X Date Pickers + 现有 Day.js；范围输入由两个日期或日期时间控件组合                             |
| 商业授权      | 默认不采用 Pro/Premium，无新增 MUI 商业组件许可费；工程维护成本计入工期                                 |
| 图标          | 后台改用 `@mui/icons-material`；已有业务专用 SVG 保留；C 端继续使用现有图标体系                         |
| 迁移方式      | 分批、按完整业务页面/流程替换；允许有限期共存，最后统一清除 AntD                                        |
| 数据和后端    | 无计划中的 API、数据库或富文本格式变更；接口发现缺陷另记，不混入 UI 迁移                                |

这是一套可执行的默认方案，不需要先解决商业采购才能开展。若要完整 Material 3、全站视觉统一，或必须保留一体式双日历范围面板，需要在实施相应部分前调整范围和预算。

### 可观察完成条件

1. 后台所有当前可访问路由采用 MUI，登录、会话恢复、列表、编辑、权限和发布流程可用。
2. 语音编辑器的选区、标注、关联、撤销重做、预览和上传行为保持可用，旧富文本可打开并重新保存。
3. 源码、测试和构建无 AntD 运行依赖，包清单和锁文件不再引入 `antd`、`@ant-design/icons`；历史文档不作为删除对象。
4. C 端词典和词单只读显示通过回归；生产构建证实只读入口不引入 MUI 编辑器运行代码。
5. 关键保存流程经真实 API 写入后，独立重新请求或重新打开页面确认结果；mock e2e 与真实联调分别记录。
6. 类型、受影响测试、构建和项目最终质量门通过；视觉、键盘与焦点问题完成验收。

## 2. 已有能力与依赖图

先利用已经在主线的能力，关键路径为：

`兼容依赖与行为基线 → 主题/表单/反馈基础设施 → 用户管理试迁 + 复杂选择器/编辑器验证 → 页面与录入流程迁移 → 共享包隔离与 AntD 清除 → 生产构建、真实链路验收`

复杂选择器和编辑器在第一阶段验证可行性，完整迁移放在后续对应批次。不会等普通页面全部完成后再验证这两个最高风险点。

| 分类                 | 能力                                                                   | 处理方式                                          |
| -------------------- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| 已在主线，可直接复用 | React 19、Vite、React Router、TanStack Query、路由懒加载、版本恢复机制 | 继续使用；不更换框架或路由架构                    |
| 已在主线，可直接复用 | `@tsz/shared` 鉴权内核、`@tsz/api-client`、`@tsz/types`、Day.js        | 不重建服务层，不改 wire 命名                      |
| 已在主线，可直接复用 | V3 草稿模型、operations、校验、关联查询与音频适配器                    | 将 UI 控件换成 MUI，保留领域逻辑                  |
| 小改动               | 主题、基础布局、按钮、图标、状态提示、中文文案                         | 按组件映射迁移                                    |
| 新工作               | 普通表单接入、反馈 Provider、公共表格壳、范围输入、多级候选面板        | 只实现现有页面实际需要的能力                      |
| 高风险适配           | 选区浮层、确认弹窗生命周期、隐藏字段定位、共享包导出与分包             | 首批验证，随后集中迁移                            |
| 实施前验证项         | 依赖组合在本仓库的安装、TypeScript 6 与生产构建兼容性                  | 第一阶段执行，不能仅凭 peer 范围宣称通过          |
| 最终验收依赖         | 指定隔离环境、测试账号、数据和 OSS 清理能力                            | 按项目 dev-env/真实验收要求核实；缺失时明确未验证 |

### 源码规模与重点

静态扫描排除测试后的结果：后台 104 个文件直接导入 AntD 或其图标，其中词典域占 49 个；共享编辑器 5 个文件直接导入。后台包含 24 处 `<Table>`、83 处 `<Form.Item>`、20 处 `Form.useForm`；约 342 处 `.ant-*` 引用分布于样式与业务 DOM 查找。52 个后台测试文件含 AntD 导入或选择器。

数字是定位影响面的线索，包含旧页面和未挂路由模块，不能据此逐行估价。角色管理源码目前未挂入路由；为移除依赖要迁移其保留代码，但不恢复路由、不改变启用条件。

重点证据：

- [主题配置](../../../apps/admin/src/antd-theme.ts)、[Providers](../../../apps/admin/src/providers.tsx)、[路由](../../../apps/admin/src/router.tsx)：错误页和启动兜底处于原主题 Provider 外。
- [动态发音列表](../../../apps/admin/src/features/dictionary/word-creation-v3/components/V3PronunciationList.tsx)：`Form.List` 和业务草稿同时参与排序、增加和删除。
- [录入向导](../../../apps/admin/src/features/dictionary/word-creation-v3/V3WordCreationWizard.tsx)：错误字段展开与定位直接依赖 AntD 折叠、Tabs DOM。
- [词义候选面板](../../../apps/admin/src/features/dictionary/word-creation-v3/components/V3TargetCascader.tsx)、[词形关联面板](../../../apps/admin/src/features/dictionary/word-creation-v3/components/V3GrammarFormPicker.tsx)：多级选择、异步加载和叶子提交，不是普通下拉框。
- [权限提交弹窗](../../../apps/admin/src/features/permissions/PermissionChangeDialog.tsx)：版本冲突和结果未知时回读事实，不允许简单重试旧提交。
- [语音编辑器](../../../packages/voice-editor/src/editor/next/VoiceEditor.tsx)：选区、快捷键、浮层和富文本操作存在关联。
- [Vite 配置](../../../apps/admin/vite.config.ts)：存在 AntD 专用 chunk 分组，不能只删 package.json 依赖。

## 3. 技术栈与版本策略

新增依赖限制为实际用途：

| 包                                     | 用途                         | 安装位置                                                   |
| -------------------------------------- | ---------------------------- | ---------------------------------------------------------- |
| `@mui/material`、`@mui/icons-material` | 后台和编辑器交互组件、图标   | admin 普通依赖；voice-editor 对应 optional peer + 开发依赖 |
| `@emotion/react`、`@emotion/styled`    | 使用 MUI 默认样式引擎        | admin 普通依赖；voice-editor 按实际导入和 peer 要求声明    |
| `react-hook-form`                      | 普通后台表单状态、校验与提交 | admin                                                      |
| `@mui/x-date-pickers`                  | 日期、时间选择               | admin                                                      |
| `dayjs`                                | 日期适配与原有查询转换       | 复用现有 admin 依赖                                        |

不引入新的通用 UI workspace 包、不将 admin 合并进 `@tsz/ui`、不增加 Tailwind、第二套表格引擎或全新的校验体系。基础控件直接导入 MUI，只为重复业务行为做少量组合组件。

### 版本核查结论

2026-10-17 查询 npm 官方 registry 得到：

- `@mui/material` / `@mui/icons-material` 的 `latest` 为 `9.5.0`，支持 React 19。
- `@mui/x-date-pickers` 的 `latest` 为 `8.29.5`，其 `@mui/material` / `@mui/system` peer 范围为 `^5.15.14 || ^6.0.0 || ^7.0.0`，不含 Core 9。
- 两个 Core 包的 `latest-v7` 为 `7.3.11`；`react-hook-form` 稳定版为 `7.90.0`，支持 React 19。

因此，本方案当前候选组合为 **MUI Core / Icons 7.3.11 + Date Pickers 8.29.5 + React Hook Form 7.90.0 + Emotion 11**，继续使用仓库现有 React、Day.js 和工具链。MUI 官方支持页将 Core 7 列为 LTS [S2]。这是一套 peer 范围相容的候选，尚未安装验证。

第一批实施先重新核实 registry、支持状态及同一版本文档，再冻结准确版本和锁文件。若届时已有兼容 Core 9 的稳定日期包，可在该批整体选择新版；不混用不兼容 `latest`、不依赖 RC、不通过放宽 peer 检查绕过问题。选定组合后，本迁移期间不叠加框架/TypeScript 大版本升级。

MUI X 的固定列与日期范围高级组件属于商业能力 [S3]。本方案选择 Core Table 和两个免费 Date Picker，是明确的维护成本取舍；后续确需 Data Grid Pro 时另作采购和实施决策，不能在开发中默默引入商业包。

## 4. 视觉与基础设施

### 4.1 主题

在 `apps/admin/src` 建立 `mui-theme.ts`，集中配置品牌色、字体、字号层级、间距、圆角、密度、状态色与必要的组件默认值。

- 保留品牌蓝 `#2053FF` 与 `var(--tsz-font-text)`，不额外下载 Roboto 或加载远程字体。
- 表格、工具栏和编辑表单采用紧凑密度；正文和交互目标保持可读，不把所有页面套入宽松模板。
- 圆角以现有 8px 为基础；按钮默认不全大写；状态颜色使用具有明确语义和足够对比度的配色。
- 通过主题 `components`、`sx` 和公开 `slotProps` 调整外观。业务状态通过显式 props / `data-*` 表达，不把 `.ant-*` 查找机械换成 `.Mui-*` 查找。
- 先提供浅色版本；不额外开发深色模式、主题切换器或完整 Material 3 token 系统。
- 现有 Recharts 图表保留，按新主题调色，不另迁 MUI X Charts。

### 4.2 Provider 与共存规则

`main.tsx` 在 `RouterProvider` 外放置 MUI 样式与主题 Provider，使 BootFallback、路由错误页、登录和后台共享主题。Query/Auth 的单例及恢复监听继续位于现有边界。

业务反馈 Provider 放在可随账号身份变化重置的边界，保留当前 `AntApp key={identity}` 避免跨账号遗留消息/弹窗的效果。过渡期旧 `ConfigProvider` / `AntApp` 继续服务未迁移页面，最后一批删除。

- 共存期间维持现有全局样式，不提前引入全局 `CssBaseline` 改变旧页面。MUI 控件通过主题统一；必要 reset 局部施加，并检查其 portal 内容。
- MUI 样式注入顺序按官方方案固定；只保留一种 Emotion cache 策略 [S4]。
- 记录并统一 Drawer、Dialog、Popper、Tooltip 的层级规则。跨库嵌套浮层在首批试点实测，不默认两套库的 z-index 和滚动锁能兼容。
- 同一业务弹窗及内部复杂流程尽量整组迁移，避免两个 modal 同时争夺焦点。
- Portal 容器和焦点边界按用途处理；不要全局关闭焦点锁或自动聚焦来“修好”编辑器。
- 版本恢复 bootstrap 在 React 树外运行，继续保留其 CSS 变量及资源失败恢复能力。

### 4.3 最小公共组件

优先复用现有文件，只在多处确有相同行为时建立：`FeedbackProvider`、`ConfirmDialog`、`AdminTable`、`DateRangeField`、少量表单字段适配。多级词义/词形选择器留在词典域；语音编辑器的浮层组件留在共享编辑器包。

不建立 `AntdCompat`，不实现一套完整 AntD API 模拟层，也不包装每个 Button/Box。暂时共存的组件边界必须在最后一批清单中有明确删除点。

## 5. 组件替代与行为要求

| AntD 能力                                   | 目标实现                                    | 必须保留的行为                                                  |
| ------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| `ConfigProvider` / theme                    | MUI ThemeProvider + zhCN locale             | 品牌、错误页、加载态、中文分页；日期文案另外配置                |
| `Layout` / `Menu` / `Dropdown`              | Box、Drawer、AppBar、List、Menu             | 服务端菜单权限、当前路由高亮、折叠和退出入口                    |
| `Space` / `Flex` / `Row` / `Col`            | Stack、Box、CSS grid                        | 换行、宽度约束、嵌套面板和窄屏行为                              |
| `Button` / `Tag` / `Badge`                  | Button、IconButton、Chip、Badge             | pending、禁用、危险动作、可访问名称与权限提示                   |
| `Typography` / `Descriptions`               | Typography、Link、语义化 `dl` / grid        | 拷贝、长文本省略、换行、标题层级                                |
| `Alert` / `Spin` / `Result` / `Empty`       | Alert、Progress、现有页面内组合             | 加载、失败、空态、重试入口，不把失败显示为空数据                |
| `Input` / `InputNumber`                     | TextField、受控数值输入                     | 空值与零值区分、范围/精度、密码显示、中文输入法                 |
| `Select` / `AutoComplete`                   | Select 或 Autocomplete                      | 搜索、清空、分组、禁用、稳定 ID；远端候选不重复做不等价本地过滤 |
| `Form` / `Form.Item`                        | RHF `useForm` / Controller + MUI 字段       | 原提交时机、校验文案、重置、异步错误和初始值                    |
| `Form.List`                                 | 现有草稿模型直接渲染                        | 业务 ID 稳定、排序/删除后的错误映射；不另建第二份草稿           |
| `Table` / `Pagination`                      | Core Table、TablePagination、Checkbox       | 服务端分页、固定列、行选择、横向滚动、行操作                    |
| `DatePicker` / `RangePicker`                | X DatePicker / DateTimePicker + 范围组合    | 日期与日期时间区别、清空、输入错误、原有区间和时区转换          |
| `Modal` / `Drawer` / `Popconfirm`           | Dialog、Drawer、确认弹窗                    | pending、取消、成功关闭、失败保留、焦点恢复                     |
| `App.useApp` / message                      | FeedbackProvider + Snackbar / Alert         | 错误反馈、必要的持续消息、账号切换清理；不覆盖原业务恢复状态    |
| `Popover` / `Tooltip`                       | 按用途选 Popover、Popper、Tooltip           | 锚点、边缘避让、点击外部、Esc、选区和可交互内容                 |
| `Tabs` / `Collapse` / `Steps` / `Segmented` | Tabs、Accordion、Stepper、ToggleButtonGroup | 未完成草稿不丢失、隐藏字段定位、选择状态和键盘访问              |
| `Cascader.Panel`                            | 词典域 MUI 多列候选面板                     | 多级展开、异步加载、仅叶子提交、候选分页、旧关联回显            |
| `ColorPicker`                               | MUI 文本输入 + 原生色盘入口 + 现有预设色    | HEX 校验、不透明色、预设业务值与自定义色的区别                  |
| `Image`                                     | 业务图片 + Dialog 预览                      | 加载失败、alt、原尺寸查看和关闭                                 |

### 5.1 表单：保留数据所有权

登录、用户编辑、管理员创建、筛选、标签和金币操作等普通表单使用 RHF；已有校验规则迁移为相应字段校验，不为了引入 RHF 重写领域校验或强制引入 Zod resolver。

- 初始值只在实际切换对象或完成回填时 `reset`，不能因 Query 背景刷新覆盖正在编辑的内容。
- 明确原来关闭弹窗后是保留还是销毁表单，逐个保持；受控字段规范处理 `undefined`、`null`、空字符串。
- 表单提交显式通过 `handleSubmit`；非提交按钮显式指定 `type="button"`。保留回车、中文输入组合态和防重复提交行为。
- 服务端字段错误关联到正确控件；跨字段错误和提交结果未知不简化成一个 toast。
- V3 草稿、关联和音频字段继续由原 `content` / `operations` 驱动。`V3PronunciationList` 删除 `Form.List` 包装后直接按业务 ID 渲染，不复制到 `useFieldArray` 再同步。
- 错误定位先通过状态展开目标 Tab/Accordion，再定位业务字段 ref / `data-v3-node-id`；不要依赖 MUI 私有 DOM。

### 5.2 表格：保留当前查询能力

本次读取的表格以服务端分页、业务列渲染、筛选工具栏、选择和固定操作列为主，尚未发现需要完整 Data Grid 引擎的表格虚拟化或列内编辑用法。

公共表格壳只负责重复的展示行为：列标题、cell render、稳定行 ID、加载/空态、分页、选择、滚动和实际用到的固定列。查询、权限和批量操作留在各业务模块。

- MUI `TablePagination` 使用从 0 开始的页码，现有 API 通常从 1 开始；在单一边界转换并测试，避免每页各自转换。
- 固定列使用明确列宽与 sticky 偏移；检查复选列、左右固定列、水平滚动、阴影和背景遮挡。
- 保留每页条数、筛选后回首页、删除后末页修正，以及现有跨页选择/清空策略。
- 同时显示已有数据与后台刷新状态；不在每次请求时卸载整张表导致跳动或焦点丢失。
- 使用现有分页上限验证渲染性能。若试点证明需要 Data Grid，先修改本节的方案与预算，不在后续页面临时混入第二套表格体系。

### 5.3 日期和颜色：明确界面变化

日期范围以“开始日期 / 结束日期”两个带中文标签的控件呈现，金币记录使用对应的日期时间控件。这会改变原来一体式 RangePicker 的选取方式，但保留可输入的范围和查询含义。

- 范围组件维护编辑中的中间态；对于原先即时查询页面，只有完整有效范围或明确清空才向业务层提交，不因只选了开始日期就发出半成品查询。
- 原先点击“搜索”生效的页面继续由搜索按钮提交。
- 保留各业务原来的边界规则。例如用户注册日期为 `[当日 00:00, 次日 00:00)`；例句当前使用 `endOf("day")`；金币使用输入的准确时间。不得统一替换成一种规则而改变结果。
- 配置 Day.js `zh-cn`、Picker localeText、MUI locale；不把显示格式误当成传输格式，不硬改为 UTC 午夜。
- 颜色继续传递原预设标识或 `#RRGGBB`；自定义色提供文本与色盘两种入口，禁止透明度，输入非法时阻止提交。

### 5.4 确认框和反馈

现有多个 `modal.confirm` 调用会动态更新内容/按钮，手动关闭并处理失败。迁移成显式状态的受控 Dialog，公共层只共享展示与基本生命周期，不重建 AntD 的 `update/destroy` API。

确认后等待请求结果：成功才关闭；已知失败保留错误与重试路径；结果未知、409 和权限变化沿用现有回读/恢复逻辑。请求中不能因为 Esc、遮罩或双击产生第二次操作。敏感操作提交快照保持稳定，取消不发送请求。

Snackbar 用于普通反馈；权限预览、离线恢复、结果未知等状态继续显示在对应业务界面。组件卸载/账号切换时清理弹窗和延迟消息，避免旧账号结果出现在新会话。

## 6. 复杂选择器与共享编辑器

### 6.1 多级关联选择

`V3TargetCascader` 的数据读取、缓存、重试、分页和 target 结构直接复用；替换 `Cascader.Panel` 展示部分。`V3GrammarFormPicker` 复用同类多列展示，但保留其“选中后确认/清除”的业务边界。

面板按真实层级显示候选列，父节点只展开、合法叶子才提交。保留草稿/已发布标识、地区与词形信息、禁用原因、旧关联回显、当前数据中不存在的关联状态，以及加载失败后原关联不受影响的行为。支持键盘进入、方向切换、确认和返回，焦点与“已选中”分开表达。

首批验证必须覆盖异步成分加载、空词义、已选候选不在当前分页、清除后取消，以及只读状态。不得用一个扁平 Autocomplete 把层级和选择规则压掉。

### 6.2 编辑器交互

只替换 `MarkupPanel`、`AnnotationStrip`、`ToolPanels`、`VoiceEditor`、`VoiceRichTextField` 的 UI 及必要样式；富文本模型、渲染算法、音频数据源、上传协议继续复用。

MUI Popover 基于 Modal，默认会影响滚动和焦点；Popper 适合需要维持编辑上下文的非模态浮层 [S5]。因此不能把所有 AntD Popover 直接替换成 MUI Popover。

- 标注工具和选区面板优先采用 Popper + Paper + 明确的点击外部/键盘处理；保存业务选区，操作完成后按原行为恢复。
- 可输入的浮层允许用户进入其字段；在适当时刻恢复编辑区选区，不能通过一律 `preventDefault` 阻止所有控件获取焦点。
- 确认弹窗使用 Dialog，保留焦点锁；根据浮层类型处理 portal 容器，验证 Dialog 内 Popper 不被焦点边界拒绝。
- Esc 一次只关闭最上层有效浮层；Tab 顺序、外部点击、滚动定位、边缘避让、中文输入法和长文本编辑实测。
- 覆盖跨行选区、连读、停顿、重音/语法标注、撤销重做、语音切换和试听；上传只使用授权的临时测试资源。

### 6.3 C 端隔离

当前 `@tsz/voice-editor/reader` 同时导出纯只读的 `RichTextReadOnly` 和使用组件库的 `VoiceRichTextField`。迁移时将交互字段导出移到 editor 入口或独立交互子入口，并更新仓内消费者，让 reader 的依赖图在源码层面保持纯只读。

保留 `RichTextReadOnly` 公开入口和已有富文本格式；reader 不依赖 MUI、Emotion、RHF 或后台反馈 Provider。现有 `.tsz-ve-*` 业务渲染样式继续使用，按实际需要把 editor 专用样式从只读样式入口分离。

voice-editor 对 MUI/Emotion 采用明确 optional peer 边界，admin 满足交互依赖；不因为共享包迁移就给 web 添加 MUI。最终以 Next 生产构建的模块依赖与浏览器网络结果验证 tree-shaking/入口隔离，不能只凭源码中没有 `import "antd"` 得出结论。

## 7. 实施批次、交付物与退出条件

各批次按依赖顺序落地，相关公共文件由同一实施者集中处理。每个 PR 都应可构建、可测试，不提交留待下批修复的半成品页面。以下为后续交付组织建议；本次方案不执行提交、推送、合并或部署。

| 批次                | 范围与交付物                                                                                                         | 退出条件                                                                                       | 估算人日 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------: |
| P0 基础与风险验证   | 固定依赖组合；建立主题、表单/反馈最小能力；试迁用户管理完整路径；验证发音动态列表、候选面板、编辑器浮层的代表性场景  | 安装/类型/构建通过；用户筛选、固定列、编辑回填可用；三个复杂点有可重复的验证结果；校准后续估算 |     3～5 |
| P1 壳与账号         | 登录、强制改密、导航、首页、错误/加载/恢复、个人设置、管理员、权限与保留的角色源码；沉淀公共表格/确认框              | 账号切换、会话过期、权限预览/冲突、取消与重试通过；共享壳不污染未迁移页面                      |     4～6 |
| P2 列表与设置       | 词典列表/回收站、教师审核、词性设置、金币、评价、词单管理、例句列表及详情类面板                                      | 各列表筛选分页、选择、危险操作和日期边界与基线一致；复用表格和表单方案                         |     3～5 |
| P3 复杂录入         | 单词创建入口、V3 词形/发音/词义/例句、关联面板、预览、草稿保存与发布；同步相关样式和 DOM 定位                        | 原数据可回填；动态增删排序、校验定位、关联确认/取消、保存重开与发布链路通过                    |     5～8 |
| P4 编辑器与依赖清除 | 完成共享编辑器；reader 隔离；移除剩余 AntD 类型/图标/CSS/Provider/测试包装；更新 Vite 分包、包清单、锁文件、开发约定 | 源码/依赖残留检查通过，admin 与 web 生产构建成功，C 端只读不引入 MUI 编辑器                    |     3～5 |
| P5 最终验收与收尾   | 全仓最终门、关键真实链路、键盘/视觉/性能检查、修复与回退演练记录                                                     | 达成第 1 节完成条件，明确真实环境与 CI 的实际结果                                              |     2～3 |

合计 **20～32 人日**，安排时预留到 **约 20～35 人日**。这包含定向测试、必要的样式调整和集成验收，不包含全站改版、Material 3 专项实现或商业采购。单人全职约 4～7 个工作周；AI 辅助能减少机械改写，但在 P0 前不承诺按固定倍数压缩日历工期。

P0 的试迁代码应直接成为最终实现的一部分；若复杂验证证明方向不合适，先修订相应局部设计，再扩散到后续页面。批次是依赖分组，不要求机械地“一批只能一个 PR”；只有确有独立验收边界时才拆分。实施用时或范围超过估计 50% 时，报告原因、剩余关键路径和修订估算后继续已授权范围。

## 8. 验收设计

沿用项目 [test 技能](../../../.agents/skills/test/SKILL.md) 和 [真实后端验收要求](../../../.agents/skills/test/references/real-backend-acceptance.md)。本节保留验收设计；已执行结果与未验证项见第 10 节。

### 8.1 风险与证据

| 场景         | 必须证明                                                                      | 首选证据                                 |
| ------------ | ----------------------------------------------------------------------------- | ---------------------------------------- |
| 表单和请求   | 空值、0、取消、回填、重置、错误位置、重复点击；method/path/payload 与基线一致 | 现有组件测试与请求断言，针对迁移风险补缺 |
| 表格与筛选   | 页码边界、每页条数、固定列、横向滚动、选择、末页删除、日期区间                | 纯映射/组件测试 + 浏览器布局验证         |
| 权限与确认框 | 无权限禁用、提交中不重复、409/未知结果回读、不使用旧版本再次提交              | 现有权限集成测试 + 隔离账号真实操作      |
| V3 录入      | 增删排序不串值、切换区域不丢草稿、隐藏字段可展开定位、关联取消不落库          | 现有 V3 测试 + 浏览器保存后重开          |
| 编辑器       | 选区、焦点、IME、Esc、撤销、标注和音频操作                                    | 现有单元/组件测试 + Codex 内置浏览器     |
| 共享只读     | 已有富文本渲染、连读弧线、换行和字体；reader 不带交互 UI 包                   | reader 测试 + Next 生产构建/页面网络     |
| 全局边界     | 账号切换、路由错误、旧资源恢复、过渡期跨库浮层                                | 现有恢复/会话测试 + 冷启动浏览器验证     |

优先把依赖 `.ant-*` 的测试改为业务可观察结果、role/label 或稳定的业务 `data-*`。保留大表格测试的性能约束，必要时限定查询范围；不改成全局 `.Mui-*` 快照，不删除失败断言、不降低质量门。

### 8.2 可执行检查

以下命令均在前端任务 worktree 根目录运行，Node/pnpm 使用根 package.json 规定版本。依赖初次引入时正常更新锁文件；之后验证复现使用 `pnpm install --frozen-lockfile`。

按本批实际改动选择定向检查，例如：

```bash
pnpm exec vitest run --project admin apps/admin/src/features/users/UserManagement.test.tsx --maxWorkers=2
pnpm exec vitest run --project admin apps/admin/src/features/dictionary/word-creation-v3/components/V3PronunciationList.test.tsx --maxWorkers=2
pnpm exec vitest run --project voice-editor --maxWorkers=2
pnpm --filter @tsz/admin typecheck
pnpm --filter @tsz/voice-editor typecheck
```

预期：对应行为断言与类型检查通过；失败按首次失败路径修复并定向重跑。用户管理试迁还应运行同目录受影响表单/查询测试，示例单文件不代表完整覆盖。

接近完成统一执行最终门；若紧接已授权 ship，由原生 pre-push 承接其中 typecheck / 普通测试，不额外手工重复：

```bash
pnpm typecheck
pnpm lint
pnpm exec vitest run --maxWorkers=2
pnpm --filter @tsz/admin build
pnpm --filter @tsz/web build
# CI 下载产物后：
pnpm ci:validate-test-inventories <full-inventory.json> <inventory-dir> <report-dir>
```

预期：检查退出码为 0，两个生产构建可运行；新增或移动测试纳入现有 CI 分区；hooks 和 CI 正常执行。格式只检查本次改动文件，不全仓自动格式化。

保留现有 Playwright mock e2e 作为自动回归；关键风险需要本地重跑时使用项目原配置，默认由 CI 承接完整套件：

```bash
pnpm test:e2e:admin
pnpm --filter @tsz/e2e test:e2e:web
```

它们不能替代真实联调。手工操作和真实页面验收使用 Codex 内置浏览器；web 必须生产构建后 `next start`。现有 e2e 可能复用监听服务，运行前核实其来源，避免测到其他 checkout；preview 的 API 路由也必须单独核实。

最终依赖检查示例：

```bash
rg -n 'antd|@ant-design|\.ant-' apps/admin packages/voice-editor e2e --glob '*.{ts,tsx,css,json}'
rg -n 'antd|@ant-design' --glob 'package.json' --glob 'pnpm-lock.yaml'
pnpm -r why antd
pnpm -r why @ant-design/icons
```

预期：无有效运行/类型/测试/样式依赖，无安装依赖链；`rg` 无匹配时退出码 1 是预期。个别历史文字若保留，要说明其不构成依赖。迁移不再需要的 rc/样式子依赖由锁文件自然移除，不手工批删仍被其他库使用的依赖。

### 8.3 真实链路与测试数据

固定前后端实际版本、代理、账号、数据隔离和 mock 开关后，在本任务 fixture 上验证：

1. 登录 → 用户筛选/编辑 → 保存 → 独立请求并重开确认。
2. 权限预览 → 提交 → 重新读取；验证无权限与版本冲突路径，避免修改正常业务账号。
3. 词条草稿 → 增删排序发音 → 关联词义/词形/例句 → 富文本标注 → 保存 → 重开；具备授权测试数据时验证发布和 C 端读取。
4. 金币日期时间查询与一项被迁移的变更表单在专属 fixture 中验证；不对正常余额做试探性操作。

按实际风险选最小有效数据集，不为覆盖数量创建大量记录。涉及 OSS 的语音/图片先确认列举、版本读取和永久删除能力，使用专用前缀和唯一批次；成功、失败或中断恢复后清除全部对象版本、删除标记和登记。缺少环境或权限时记录缺口，不把“已写好测试”记成真实验收通过。

### 8.4 视觉、可访问性与性能

用登录、用户表格、权限弹窗、单词录入和语音编辑器作为代表页面，对比迁移前后生产构建：桌面常用宽度、窄视口及浏览器 200% 缩放。检查表头/固定列、长中文、长单词、音标字体、弹窗溢出、错误文案、disabled、loading、empty 和 focus-visible。

键盘可完成进入筛选、选择候选、提交/取消和关闭浮层；明确焦点回到何处。颜色不是唯一状态提示。基础控件中文化和危险操作确认文案完整。

记录登录首屏、用户列表和编辑器路由的资源体积、请求数量及冷启动表现，使用同环境同 fixture 比较。不预先宣称换库能提速；登录页不得因静态导入带入全量编辑器/图表。若体积或关键交互明显回退，定位模块归属与渲染原因后处理，不用删功能降低指标。

## 9. 分批合入、发布与回退

- 每批随代码更新相应测试，保持其他页面可用。路由级迁移记录留在本文件；不建立长期维护的 AntD/MUI 功能开关，也不保留两份完整编辑器。
- 开始实施时同步前端 `AGENTS.md`：允许迁移期共存并规定新增 UI 使用 MUI；最终清除后更新为 MUI 约定，连同 test 技能中的 AntD 特定建议一起修订。历史功能文档无需批量改写。
- 保留路由 lazy 和版本恢复机制；调整 AntD 专用 Vite 分包后，核实库 chunk 与入口不会因错误相互引用而破坏冷启动/缓存。
- 默认保持 wire、草稿/富文本和浏览器持久化格式不变，因此无计划中的后端发布或数据迁移。若实现发现必须改变其中任意项，先修订本方案并验证混合版本，不把它藏在组件替换里。
- 代码可分批合入；是否每批发布依照用户的部署授权。未迁移页面与新壳共存时，完整验证跨库浮层后才发布该批。
- 每次发布保留上一份精确前端产物和版本记录，按前端 deploy 技能发布。失败时恢复上一份产物，不回滚数据库、不清理正常业务数据。
- 如前端批次同时改变 admin 和 C 端构建，分别记录各自产物与验收状态；只影响 reader 内部入口且 C 端展示未变，也要先完成 C 端构建回归再决定部署范围。
- 回退判据：关键写入字段/结果变化、权限或确认绕过、草稿损失、编辑器不能正确标注、持续白屏/资源恢复失败。纯视觉问题按影响修复；影响使用时同样可回退。

## 10. 实施与验收结果（2026-10-17）

P0–P5 实施与本地验收完成。改动位于 `codex/mui-migration` worktree；初始基线 `095bb67e89b1820c41ef7d5108ed1098b1f7c716`，交付前已同步主线 `7ce616b424a33363cd7cfb28775fa8fb5c0f989f` 并保留 #470 的发音按钮右端对齐改动。PR #471 已提交；本轮继续修复 CI，并按新增授权在全绿后合并、部署测试环境。

### 实现范围

- Core / Icons 7.3.11、Pickers 8.29.5、RHF 7.90.0、Emotion React 11.14.0 / Styled 11.14.1，严格 peer 与全 workspace 冻结锁文件安装通过。
- 登录、账号/权限、导航、列表/设置、V3 全部录入与发布/历史、多维例句与共享编辑器使用 MUI。表格分页选择、日期范围、普通表单 RHF、危险确认和结果未知重试保留原业务行为；无兼容 AntD facade。
- 登录三项采用 TextField 浮动标签；400px 表单、20px 间距、验证码内嵌发码入口。生产预览发现内容区 width 与 padding 相加导致溢出，已使用 border-box 修复。
- reader 改为原生 React/DOM，拆分 reader.css / editor.css；web 只读入口不引入编辑器。传递依赖测试及 Next 生产 chunk 扫描均未发现 MUI/Emotion/RHF 编辑器泄漏。
- 移除 AntD、图标及 rc util 补丁；安装依赖链中无 AntD。旧 e2e 私有 class 已迁移到公开状态/业务选择器，保留行为与布局断言。项目开发约定及 test 技能同步更新。
- 修复真实键盘操作发现的语速 Enter 关闭后重新打开、嵌套面板 Esc/焦点恢复，以及空表单 HTML 嵌套问题。校验定位可展开隐藏词义并聚焦真正输入控件。

### 代码验证

- 全仓普通测试：281 个文件，累计 **3966 通过、2 项既有 skip**。admin 首次全量 1950 通过/5 失败，逐项修复后定向通过，未跳过失败用例；其余 workspace 全量 2011 通过。后续调整断言的 150 项后台测试与 116 项编辑器测试均通过。
- 全仓 typecheck、lint 通过；lint 保留既有 web 整页跳转警告。格式检查通过；admin / web 生产构建通过。最终追加的样式及断言修订再次检查，具体日志见下方本地证据。
- 共享编辑器完整 398 项、词形/词义强化选择状态 181 项、向导 108 项通过，覆盖权限、动态编辑、取消、冲突与结果未知重试。
- 完整 e2e：C 端 65 项、后台 62 项，合计 **127 项通过、无 skip**。后台显式启用 `VITE_VOICE_EDITOR=true` / `VITE_SENTENCE_FORMATTING=true`，CI 对应步骤也开启这两项，避免编辑器用例被环境条件跳过。命令沿用原 Playwright 配置，使用独立 3400/3404 端口，没有复用真实登录服务。
- 首轮 e2e 发现并修复：原生文本域字号/拼写粗体、释义前缀裁字与同行对齐、通栏按钮虚线边框、Accordion 标题选择器、Dialog 内候选被裁切、异步候选尺寸变化后的 Popper 定位，以及禁用工具的快捷键提示。普通确认与例句取消测试改用当前可访问名称；动画断言覆盖 MUI 淡入过程的连读几何，不再假定 AntD 缩放动画。没有降低几何误差、改为跳过或移除失败用例。
- 同步主线后发音相关 91 项定向测试通过；工具提示相关 117 项和最终浮层焦点回归通过。额外独立 e2e tsc 探查的 21 条诊断与初始基线一致；该探查不是通过结果。`ci:validate-test-inventories` 需要 CI 产物参数，无参数调用仅返回 usage；CI 分区清单静态校验通过。远端 CI 状态以 PR 为准。
- 同基线、同 Node/pnpm 的生产静态 import 图比较：首屏 JS gzip 从 277494 降到 197380 bytes（约 -28.9%）；静态 JS 模块 13→19。登录入口不带编辑器/图表。该结果是构建体积，未据此宣称实测冷启动延迟改善。

### 真实后端链路

后台 dev 3301 与生产静态验收 3302 均代理 `https://admin-test.tianshengzhi.com/api/v1`；TTS mock=false，无浏览器 route/SW 拦截。C 端使用生产 build + next start 3300。后端进程 PID 1394729，启动时间 2026-10-17 22:35:21 CST；运行制品 SHA256 `f511018913327d00865e1cdda2b30ed18dee4bd210e01a05ef88da911f9b3e61`，源提交归属未证明。数据库为共享测试 RDS 的 tsz，Redis 为服务器 DB 0。

用户分别真实登录后台和 C 端；经用户确认，C 端测试账号完成 A1/美式英语引导。未读取或输出密码、验证码、token。只写本批专属 fixture，没有修改正常账号权限、余额或正常词条。

批次 `20261017-mui-86a964a28b`，独占 surface `muiverifyigkjge`：

1. 实际检测后创建词条，保存原形/音标/实际发音、Aria 语速 0.83；刷新后重开，回填一致。实际 TTS 试听生成成功。
2. 保存语义区间、带固定核心强调标注的语法结构、中英文定义与频率 0.83；删除空项后刷新确认。清空频率触发真实后端校验，点击“去处理首项”展开词义并聚焦频率输入框；修复后可完成。
3. 检查发布条件并发布第一版；生产后台重新读取已发布词条。独立例句正文/译文关联本词义，保存后刷新重开确认，再从例句库发布成功。
4. C 端生产词典查询命中该词；详情展示音标、语法强调与已发布例句/译文，保留 TSZ 字体，页面无 MUI 样式节点或编辑器。
5. 桌面 1280px 与窄屏 375px 生产预览无横向溢出；嵌套弹窗/Popper 输入、Enter、Esc 和焦点恢复已验证。内置浏览器没有实际页面缩放控制，快捷键无效、原生 Codex 菜单控制不可用，已说明原因后用独立 Chrome 窗口验收实际 200%。浏览器工具栏确认 `Zoom: 200%`；登录、词义字段选择器/Esc、词库表格行选择、语音编辑弹窗与取消操作通过，控件保持可用。截图保留浏览器上下文；结束恢复 100% 并关闭本次 Chrome 窗口。复杂页面使用独立本地 mock API fixture，没有复制真实登录凭据或写入远端。

真实链路采用最小独占词条与例句，账号切换/权限冲突/金币等风险依赖现有组件和请求测试；未对共享正常业务账户做写入试验，不宣称所有后台页面均完成真实写入。

### 清理与证据

OSS 创建前通过列举、版本读取与永久删除预检，所有对象使用专属批次前缀。结束后删除 1 个对象及其全部版本/删除标记，独立复核无残留；再次 apply 为 clean、remaining=0。

事务清理独占词条、例句、双方发布版本、节点/投影及其专属登记，同时删除 3 条幂等记录、14 条 outbox、13 条审计记录、1 条 TTS 缓存；归属与外部引用预检通过。独立查询 entry / sentence / publications / TTS cache 均为 0，精确 Redis detection / speech lock 均为 0。正常 `worker` 词条仍存在，用户登录会话和 3301 评审服务保留。

脱敏本地证据位于 `/tmp/tsz-mui-migration-evidence/`，包含登录、嵌套编辑器和 C 端发布详情截图。清理 receipt 为 `test-results/oss-cleanup/20261017-mui-86a964a28b.json`（gitignored）。代码/构建日志在 `/tmp/mui-p5-*.log`；批次 manifest 为 `/tmp/tsz-mui-test-run.json`。实际 200% 的截图为 `chrome-login-200-percent.png`、`chrome-fields-200-percent.png`、`chrome-table-200-percent.png` 和 `chrome-editor-200-percent.png`。临时基线导出、转换脚本、缩放 fixture 服务与窗口在收尾删除/关闭，不进入仓库。后续完整 e2e 全部使用 mock，没有新增业务或 OSS 资源。

交付推进：PR #471 的后台覆盖率分片发现过期用例在按钮准备完成前点击。现等待按钮真正可交互后再推进测试时钟，过期提示、禁止创建请求和移除创建入口的断言保留；该文件采用 CI 覆盖率配置的 56 项验证通过。随后按精确 SHA 独立增量审查、原生 pre-push、PR 全绿、合并后 main 精确 CI 成功的顺序推进 web/admin 测试环境部署。部署结果以原生来源 manifest 和本次会话回执为准。

## 11. Ant Design 回迁（2026-10-18）

用户授权仅将 UI 组件库迁回 Ant Design，保留现有业务能力。任务工作树 `restore-ant-design/tsz`，分支 `codex/restore-ant-design`，基线 `3f54cce3`。当前阶段：实现与本地验收完成；用户已授权审查、提交、推送并创建 PR，按精确提交独立审查及原生 hooks 推进。本次不包含合并或部署。

依赖与关键路径：复用迁移前 AntD 组件和主题 → 保留后续词表删除影响、自定义词汇及审核能力 → 恢复共享编辑器并保留 native reader 隔离 → 定向回归与最终质量门、生产浏览器验收。

### 范围与实现

- 后台与交互编辑器恢复 AntD 6.6.1 / Icons 6.3.2，普通表单使用 AntD Form，复杂草稿继续由原业务模型持有。保留品牌色、中文 locale、日期和字体配置；移除 MUI、Emotion React/Styled 与 RHF。AntD cssinjs 自身使用的 `@emotion/hash`、`@emotion/unitless` 属于其正常依赖，不做人工删除。
- 当前业务请求、权限判断、wire、草稿、富文本和持久化格式不变；`apps/web`、`packages/types`、`packages/shared`、`packages/api-client` 无代码差异，不涉及后端。
- 保留删除词表前的任务影响预览与过期请求保护、自定义词汇与作者注展示、审核快照版本/分页、未授权操作禁用和失败后的输入保留。已下线的旧发音设置保持下线，IPA/UPS 各自的 TTS 设置器继续可用。
- 保留空状态重置筛选、侧栏深层路由唯一选中、窄容器解除固定列、窄屏两列步骤、词性 tab 内新增入口和例句更多操作/取消选择。紧凑的新增控件使用 AntD 公开语义样式槽，实际可聚焦输入区有完整尺寸。
- 共享 reader 继续使用原生 React/DOM 与独立 `reader.css`；包边界测试保留。编辑器浮层使用 AntD Popover，保留 Esc、焦点恢复和 Enter 行为；嵌套弹窗的浮层显式启用指针事件，不关闭外层焦点约束。

### 验证与限制

- 冻结锁文件安装、全仓 typecheck/lint、admin/web 生产构建通过；后续增量对 admin/voice-editor 重新 typecheck/lint。web lint 的既有警告保留，未绕过 hooks 或修改测试门槛。
- 首轮全仓普通测试 282 个文件：4010 通过、19 失败、2 项既有 skip。失败涉及库更换后的角色/虚拟列表/动画选择器、已下线旧设置和保留交互；后续针对受影响文件修正并回归，未通过 skip、删业务断言或放宽几何阈值处理。共享编辑器全量 397 通过后，SelectionPanel 的焦点/关闭修复定向通过；公共浮层最终变更另跑编辑、停顿、关联和选区测试，关联用例按关闭后重开当前选择器的真实行为验证，最终 18 项关联测试通过。初始失败文件及公共浮层的后续定向回归均已通过；没有重复全仓套件。
- C 端完整 mock e2e：65 项通过，无跳过。生产静态 chunk 扫描无 `MuiButton`、`MuiTypography`、AntD 弹窗/选择器及编辑器代码特征；reader 边界测试通过。
- 后台首轮完整 mock e2e：60 通过、4 失败。修复窄屏布局与库选择器后复验，公共编辑器浮层的实际点击穿透问题已修复。大量候选在 1000/600/480px 和 E01a 复杂建词/保存刷新/422 定位/发布阻断共 4 项通过；后者增加未激活词性 tab 的新增控件可见且不切 tab 的真实浏览器断言。其余 39 项最终回归中 38 项通过；专用词形取消按钮的库选择器修正后定向 1 项通过。后台 64 个用例均已取得通过结果，部分采用修复后的定向复验。
- 窄屏滚动断言先等待连续三帧稳定，再比较加载更多前后的滚动值，消除 `mouse.wheel()` 返回时浏览器仍在平滑滚动的竞态；保留原滚动值、选择和视口几何断言。
- Codex 内置浏览器检查生产登录页面，截图 `/tmp/ant-restore-evidence/login.png`；该独立预览的 API 只返回未登录响应。完整业务 e2e 使用项目 mock API，未连接真实后端做写入验收，不将 mock 记作真实联调。
- 本次未创建数据库、Redis、OSS 或远端业务数据。临时服务、独立浏览器页和专用非忽略测试目录已清理，只保留脱敏截图与 `/tmp/ant-restore-*.log` 验证日志。实施验收时尚未执行 PR/CI；交付进度以本次 PR 与会话回执为准，合并及部署不在本次范围。

交付审查：初审提交 `210031aa` 发现三类 P2：确认操作失败后提前关闭、标签/审核弹窗 pending 编辑保护遗漏、已处理审核的决定时间遗漏。管理员状态/重置、用户状态、角色与标签删除恢复受控 Modal；失败保留目标及错误，pending 禁止取消或重复提交。标签名称/颜色、驳回原因在请求期间禁用，审核详情恢复决定时间。新增失败重试与慢请求回归，并保留原请求/权限/状态语义；修复提交由同一 reviewer 增量复查后再推送，最终门由原生 pre-push 执行。

## 参考来源

- [S1：Material UI 概览与 Material Design 支持](https://mui.com/material-ui/getting-started/)
- [S2：Material UI 支持版本](https://mui.com/material-ui/getting-started/support/)
- [S3：MUI X Community / Pro / Premium 授权边界](https://mui.com/x/introduction/licensing/)
- [S4：样式库共存与注入顺序](https://mui.com/material-ui/integrations/interoperability/)
- [S5：Popover](https://mui.com/material-ui/react-popover/) 与 [Popper](https://mui.com/material-ui/react-popper/)
- [Core 安装与 Emotion / React 要求](https://mui.com/material-ui/getting-started/installation/)
- [Core Table](https://mui.com/material-ui/react-table/)、[Date Pickers](https://mui.com/x/react-date-pickers/quickstart/)、[中文 locale](https://mui.com/material-ui/guides/localization/)
- [React Hook Form 官方仓库](https://github.com/react-hook-form/react-hook-form)
- npm 元数据：[Core 7.3.11](https://registry.npmjs.org/@mui%2fmaterial/7.3.11)、[Icons 7.3.11](https://registry.npmjs.org/@mui%2ficons-material/7.3.11)、[Date Pickers 8.29.5](https://registry.npmjs.org/@mui%2fx-date-pickers/8.29.5)、[RHF 7.90.0](https://registry.npmjs.org/react-hook-form/7.90.0)。查询日期为 2026-10-17，实施时复核。
