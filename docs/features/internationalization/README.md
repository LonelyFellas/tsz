# 多语言国际化

本任务沿用已确认的五批方案：国际化基础 → 语言目录与偏好 → Admin → Web → 后端本地化输出。词库内容多语言依赖[新词库设计](../smart-lexicon-reconstruction/design.md#62-多语言与数值约束)，单独推进。

首批内置界面语言为 `zh-Hans`、`zh-Hant`、`en-GB`、`en-US`。界面语言、学习目标语、内容语言和语音地区保持独立；界面切换不转换正文、不重写草稿或发布快照、不修改学习或方言设置。

## 当前范围与依赖

| 部分                                  | 状态           | 本次处理                                        |
| ------------------------------------- | -------------- | ----------------------------------------------- |
| 默认中文、现有鉴权与方言偏好          | 已在主线       | 保持现有行为                                    |
| 共享翻译、匹配、格式化与 React 上下文 | 新工作，第一批 | 本地实现并验证                                  |
| 语言目录、账号偏好及数据库迁移        | 第二批         | [兼容契约定稿](phase-2-contract.md)，本批不实施 |
| 公共控件与业务页面文案迁移            | 第三、四批     | 本批只接入两端根 Provider，不开放切换入口       |
| 后端错误、通知与模板本地化            | 第五批         | 本批不改 API 文案或请求头                       |
| 其他目标语、媒介语的内容生产和审核    | 依赖新词库     | 不放宽现有 V3 语言约束                          |

基线：前端 `b6ec415f3e63aacf8d8a69b90aca227e9be14bf0`，后端契约核对基于 `origin/main` 的 `9b7eb8e8833de74b73fb6e504f872922f64ddf6e`。后端本地 checkout 落后且有无关未跟踪文件，未修改该工作区。

## 第一批实现约定

- 从 `@tsz/shared/i18n` 导入无 React 依赖的实例工厂、界面语言匹配与格式化方法；React 调用方使用 `@tsz/shared/i18n/react` 的 `InterfaceI18nProvider`、`useTranslation`。
- 每个 Provider/服务端调用创建自己的 i18next 实例和资源副本。不使用模块级活动语言或默认 React i18next 实例，防止请求与根节点之间串语言。
- 资源随包加载并同步初始化。当前仅包含少量 `common` 文案，后续业务模块按命名空间接入；不加入运行时翻译下载服务、自动翻译或浏览器语言检测。
- 翻译键由 TypeScript 资源类型约束；资源测试检查各语言的逻辑键、占位符和所需复数形式，英美地区允许只提供差异覆盖。
- Web 和 Admin 根 Provider 都固定使用默认简体中文。Web 原有 `<html lang="zh-CN">`、路由、SEO、会话恢复和鉴权逻辑保持原状；第四批再统一服务器与浏览器语言输入。
- `normalizeInterfaceLocale` 只做界面匹配：中文显式文字优先于地区，`TW/HK/MO` 匹配繁体，其他中文匹配简体；美式英语匹配 `en-US`，其他英语匹配 `en-GB`。未知语言、损坏标签返回无匹配。它不是 HTTP `Accept-Language` 解析器，也不是内容语言或 API 写入校验器。
- `resolveInterfaceLocale` 按调用方给出的优先级选择第一个匹配值，没有候选时返回 `zh-Hans`。第二批需先结合服务端可用目录过滤，不能把内置资源等同于已开放语言。
- 地区英语先查本地区覆盖，再查基础 `en`，最后回退简体中文；繁体中文缺失时回退简体。空字符串也视为缺失。发布前通过资源检查阻止缺键、空译文、占位符错配和缺复数形式。
- 翻译函数的插值供 React 文本渲染使用，不写入 `innerHTML` 或 `dangerouslySetInnerHTML`。用户内容保持原文。
- 数字格式化保留 `bigint` 精度；日期格式化必须显式提供时区，不从语言推导时区。现有金额、学习日期与业务格式化函数不改。

使用示例：

```tsx
import { useTranslation } from "@tsz/shared/i18n/react";

function SaveButton() {
  const { t } = useTranslation("common");
  return <button>{t("actions.save")}</button>;
}
```

示例用于后续页面迁移，本批不批量替换业务文案。服务端纯逻辑调用 `createInterfaceI18n(locale)`，不要把返回值缓存在模块作用域。

## 验收与交付边界

- `pnpm test:i18n`：语言匹配、缺失回退、插值/复数、实例和资源隔离、时区/大整数、翻译资源完整性、React Provider 更新、默认中文和英文 SSR/水合一致性。
- `pnpm --filter @tsz/shared test`：共享包已有逻辑回归；全仓类型检查、lint 和格式检查；Web/Admin 生产构建。
- 如执行页面冒烟，使用 Codex 内置浏览器检查默认中文与页面错误；不以此代替第二批真实账号偏好的持久化验收。
- 当前无 API、数据库、远端环境或业务数据变化。第二批契约是实施规范，接口尚不存在，混合版本和迁移验收仍待第二批实现后执行。
- 本次终点为本地实现、验证和汇报，不含提交、推送、PR、合并或部署。

本批验证结果：

- `pnpm test:i18n`：3 文件、25 项通过。`pnpm --filter @tsz/shared test`：22 文件、399 项通过；`pnpm --filter @tsz/api-client test`：36 文件、676 项通过。计数存在重叠，不累加为独立用例总数。
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm build` 均通过。lint 有 2 条既有整页跳转警告，位置为 Web `providers.tsx` 与 `useLogout.ts`，对应代码未修改；沿用项目鉴权整页跳转约定。
- 初次共享包类型检查发现实例工厂导出类型无法命名，补充显式 `i18n` 返回类型后通过；未修改质量门或跳过检查。锁文件只新增国际化直接及传递依赖，安装时带出的无关 peer 引用变化已还原，`pnpm install --frozen-lockfile` 通过。
- Codex 内置浏览器访问 Web 生产构建的 `next start` 与 Admin 生产包预览：两个 `/login` 均显示原中文表单、`html.lang=zh-CN`，浏览器 warn/error 日志为空。未启动后端、未注入 API mock，预期显示连接恢复/不可用提示；服务端 refresh 代理记录 `ECONNREFUSED`，不把此冒烟记为真实登录或持久化联调。未提交表单、创建账号或上传文件，验收标签页与本地监听均已关闭。
- 生产构建中 Admin 的 i18next 初始分块为 47,919 字节、gzip 15,101 字节，React 绑定初始分块 gzip 240 字节；这是接入基础的新增加载成本，不是全站性能对比。后续业务资源应按命名空间加载，避免全部词库翻译进入首包。
- 文档相对引用和 `git diff --check` 通过。第一批本地实现完成；第二批仅定稿契约，未修改 Rust、OpenAPI 或数据库。未执行全仓普通测试、提交、PR、CI、合并和部署。
