# 下线 V1/V2 词条创建向导：技术设计文档

## 方案概述

**产品只保留 V3 一套词条创建向导，V1/V2 整条下线。**

前提由用户给定：不再兼容 V1/V2，且库里没有 V2 词条（本地库实测 13 条全是
`content_schema_version = 3`）。既然存量为零，就没有「保留旧向导给旧数据兜底」的
理由，而两套向导长期并存的维护成本是实打实的——`word-creation/` 目录 60 个文件
约 3.5 万行里，绝大多数只服务 V2。

**下线的判定口径**：不是「删掉入口」，而是「删到没有孤儿」。入口、页面、路由、
步骤组件、各自的模型与校验、只被它们引用的样式与测试夹具，一并清掉；凡是留下来的
文件，都必须能指出当前谁在用。

## 三分清单

### 一、删除（仅 V2 使用）

| 层         | 文件                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------- |
| 页面与路由 | `pages/WordWizard.tsx`；`router.tsx` 的 `words/:wordId/wizard/:step`                                |
| 向导壳     | `word-creation/WordCreationWizard.tsx`                                                              |
| 四个步骤   | `CreateEntryStep` `FormsAndPronunciationStep` `MeaningsAndExamplesStep` `PreviewAndPublishStep`     |
| 内容补全   | `ContentCompletionPanel` `contentCompletion` `contentLimits`（AI 内容补全本就未启用）               |
| 模型与校验 | `model` `readiness` `formsValidation` `formVariantIdentity` `formsImpactSummary` `nodeIssueMessage` |
| 请求层     | `word-creation/api.ts`（`useDetectWordV2` / `useSaveFormsStep` 等 12 个 V2 hook）                   |
| 交互 hook  | `useUnsavedWordChanges` `useWordValidationIssueFocus`                                               |
| 例句关联   | `meaningsAndExamples/` 的 `SentenceAssociationEditor` `mapping` `validation`                        |
| 测试       | 上述模块各自的 `*.test.*`                                                                           |
| e2e        | `e2e/tests/support/mockAdminApi.ts` 与 `admin-word-creation.spec.ts` 里 7 个走 V2 向导的用例        |

共删 41 个 admin 源文件约 2.77 万行，外加 e2e 的 V2 mock 1381 行；
`word-creation/` 目录从 60 个文件（约 3.5 万行）降到 20 个（约 9800 行）。

### 二、保留（V3 或创建页仍在用）

| 文件                                                  | 当前使用方                                       |
| ----------------------------------------------------- | ------------------------------------------------ |
| `UnifiedCreateEntryStep`                              | `pages/WordCreate.tsx` 的创建第一步              |
| `WordCreationLayout`                                  | 创建页 + `V3BasicsStep` + `V3WordCreationLayout` |
| `PronunciationPreview`                                | V3 词形步、词义步、语音字段等 6 处               |
| `CreationSourceNotice`                                | `pages/WordWizardV3.tsx`                         |
| `entryClassification` `headwordValidation`            | V3 词义步与统一创建步                            |
| `baseFormDetection`                                   | 统一创建步                                       |
| `word-creation.css`                                   | `V3BasicsStep` 直接引入，样式对整个向导全局生效  |
| `meaningsAndExamples/sentenceAssociation*`            | `dataSource.ts` 与 `mock/adminWordsMock.ts`      |
| `partOfSpeech.test.helper` `wordCreation.test.helper` | V3 与词库层的测试                                |

目录名是 `word-creation`（不是 `word-creation-v2`），本身不含版本语义，留在原处；
这一批文件也确实是「创建流程共用件」，没有为了改名而移动。

### 三、改写

- **`wordRouting.ts` 的 `getWordRowRoute`**：原先按 `schema_version` 分流，2 走
  `/wizard`，其余 `throw`。现在只认 3，其它版本返回 `undefined`——列表用它置灰行
  入口并用 Tooltip 说明原因。抛异常会把整张表一起炸掉，这是本次必须一起改的原因。
- **`WordCreationLayout`**：删掉 `word` / `draftHeadwords` / `readinessDraft` /
  `partOfSpeechLookup` / `onReadinessNavigate` / `entryKind` 六个 V2 专用 prop 及其
  兜底分支（`HeadwordSummary`、`ProgressSummary`）。`presentation` 由可选改为必填。
  这一步是 `model.ts` 与 `readiness.ts` 能被删掉的前提——它们最后的存活点就是这里。
- **`pages/WordCreate.tsx`**：草稿尚未创建，左栏清单改用 V3 的
  `buildV3ProductProgress` 喂一份空草稿构造。原先走 V2 `buildWordReadiness`，
  显示的是「方言识别 / 原形发音」等 8 行；改后与进入向导后看到的 7 行口径一致。
- **`SmartDictionary.test.tsx`**：默认行夹具由 V2 改为 V3，另留一个 `legacyWord`
  夹具专门验证「旧结构行照常渲染、但入口置灰」。

## 顺带解决

`word-creation.css` 里 40 个类随组件删除而失去引用（`.word-preview-*`、
`.word-form-variant`、`.word-progress-wait` 等），一并删掉对应规则共 350 行。
判定方法：逐类比对「改动前有人引用、改动后无人引用」，只删由本次改动造成的孤儿。

另有 18 个类在本次改动**之前**就已无人引用（`dialect-grid`、`word-sense-editor-a2`
等），属于既有死样式，不在本次范围内，原样保留。

用户提到的 `.word-pronunciation-actions` 竖排问题（V2 的 DOM 顺序与 V3 相反，导致
删除按钮一上一下）随 V2 页面删除自然消失，未单独修改。

## 与后端的交接

前端合入后即**不再产生任何 V2 数据**：创建入口只有 `/words/new`，它只调 V3 创建
接口；V2 的保存/发布 hook 已随 `word-creation/api.ts` 删除。

后端「读 V2 发布快照」的路径可以在此之后再动。注意仍有两处前端还会碰到 V2 结构，
删后端接口时要对齐：

1. 列表接口仍可能返回 `schema_version = 2` 的行——前端照常渲染、只是不给入口，
   `AdminWordListItemAny` 的 V2 分支要继续保留，否则列表会 fail closed 报错。
2. V3 词条的发布历史里可能存有 V2 快照（`V3PublicationHistory` 仍在展示），
   对应的读取路径不能一起删。

## 遗留

`dataSource.ts` / `mock/adminWordsMock.ts` 的 V2 面（`AdminWordsDataSource` 的
step 保存、V2 发布等方法）在本次之后已无应用侧调用方，只剩 mock 自己闭环。
按用户划定的范围保留，可作为后续单独一轮清理。
