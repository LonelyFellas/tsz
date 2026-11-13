# 禅道 #195：配音来源设置

当前阶段：三批实施、真实页面/云音频/发布消费验收及临时资源清理已完成，协调聊天接管唯一写入权，进入提交、精确提交独立审查、PR/CI 和 Admin 测试服发布。用户已明确授权自动推进全部批次并上线 `tshb-test`；本次不涉及 Web 或后端发布。实际交付结果以文末记录为准。

## 范围与依赖

- 需求：<http://47.121.142.19/zentao/index.php?m=task&f=view&taskID=195>；配图 fileID=264。#165 默认词形分组已搁置。
- 工作树：`/Users/darwish/.codex/worktrees/77f6/tsz`；分支 `codex/task-195-speech-source-settings`；基线 `94292dad86cf458a4518e3323032b463eae33cdf`（开始时 fetch 后的最新 origin/main）。三批复用同一工作树，一次一个写入者。
- 已有可复用能力：`V3VoiceTextField` 的本地编辑会话、取消、VoiceSaveContext 保存与音频任务；`V3ConcreteFormRow` 的拼写所有者及 ID 回写；现有 spelling_speech wire 与共享内容草稿。均不重造。
- 第一批小改动：来源行入口 → 真实拼写所有者 → 按口音编辑及合并回写 → 定向风险验证。无后端改动、wire 变更或迁移。
- 第二批已完成：整体迁移 IPA/UPS 设置按钮、整理完整来源区、非活动音素来源试听、统一录音入口及词形文本入口收拢。详见第二批交接。
- 第三批已完成：保存与音频生命周期回归、真实页面/云/发布消费及彻底清理；修复单侧保存误改另一侧继承的实际回归。三批仍未提交/暂存，写入权交还协调聊天；精确提交审查、原生类型hooks、PR/main CI和Admin发布由协调聊天接续。

## 产品与数据约束

- 文本区负责拼写、字典音标、实际发音及音素输入、标注、转换；来源区负责配音设置。第一批保留文本区必要能力，其他入口收拢留第二批。
- 打开设置不改变活动来源；选择来源不立即保存。非活动来源缓存保留，英美音色独立。
- spelling_speech 属于共享内容的拼写变体，多个读法访问同一真实所有者；ipa_speech/ups_speech 仍属于具体读法及口音。不按名称或数组位置匹配，不创建读法专属拼写配音。
- 停顿内容仍按现有 wire 共享；设置中说明共享影响。音色和音频资产按当前口音合并最新状态，保留另一侧及其他读法配置。
- “保存修改”调用 VoiceSaveContext，可能保存完整词形草稿；失败保留输入并支持重试。保存成功后外层取消不能回滚已保存数据。
- 同一拼写所有者只保留一个字段编辑器及生成任务；打开设置本身不物化默认继承、不触发额外生成。保留保存等待与迟到结果保护。

## 第一批成果与写入交接

第一批完成，全部改动未提交，index 未写入。工作树及分支不归档。没有提交、推送、PR、合并、部署或禅道修改；后端 checkout 未修改。第一批停止写入，可由第二批接手。

- `V3ConcreteFormRow.tsx`：在拼写真实所有者注册唯一设置入口。通用和统一拼写的多个读法复用该入口；英美分开、多拼写布局分别按稳定变体 ID 定位。同名拼写不混淆。
- `V3PronunciationList.tsx` / `V3SynthesisInputs.tsx` / `V3SynthesisInputs.css`：将入口传到来源行，排列为单选圆环 → 设置按钮 → 来源名称/预览；设置按钮与 Radio 为同级元素，避免点击设置触发来源选择。遵守编辑权限和功能开关。
- `V3VoiceTextField.tsx`：复用现有本地编辑会话，设置按口音打开，禁止从这里改拼写文本；取消不应用。默认继承不因打开而物化。提交时合并最新草稿，继续调用宿主 VoiceSaveContext；失败保留输入并允许重试。目标 ID 或拼写变化时拒绝陈旧设置写入。
- `spellingSpeech.ts`：按当前口音合并音色与录音，保留另一口音的并发更新、最新文本标注和其他读法的独立配置。共享停顿变化使两侧旧合成引用失效。录音仍归拼写的 spelling_speech.audio_assets。
- `packages/voice-editor/src/types.ts`、`editor/next/VoiceEditor.tsx`、`MarkupPanel.tsx`：增加仅用于本入口的 `spelling-settings` 模式，只开放配音相关工具；不改变语法、释义、例句等原模式。设置内保留试听，正式音频生成统一由所有者在提交后执行并等待，防止编辑器与折叠字段重复生成。
- `i18n/editor.tsx`：补齐简中、繁中、英文设置名称、目标变化提示及共享读法/停顿说明；共享标签复用现有提示。
- 新增 `V3SpellingSettings.test.tsx`、`spellingSpeech.test.ts`，扩展 `V3VoiceTextField.test.tsx`，覆盖取消、失败重试、多个读法/同名多拼写精确回写、英美及音素隔离、并发录音、默认继承、唯一音频任务与两侧保存等待。

## 实际验证与证据

证据目录：`/Users/darwish/.codex/visualizations/2026/11/13/01a1d26d-eb9e-70a0-b274-5cd81d3fc37f/task-195-first-batch/`。

- `pnpm install --frozen-lockfile`：成功，Node 24.19.0 / pnpm 10.33.0；锁文件未变，原生 hooks 正常安装。
- `pnpm --filter @tsz/admin typecheck`、`pnpm --filter @tsz/voice-editor typecheck`：通过。
- `pnpm --filter @tsz/admin exec eslint` 后接本次 admin TS/TSX 文件；`pnpm --filter @tsz/voice-editor exec eslint src/types.ts src/editor/next/VoiceEditor.tsx src/editor/next/MarkupPanel.tsx`：通过。
- `pnpm check:admin-ui`：42 个样式检查与 4 个脚本用例通过；`git diff --check` 与改动文件 Prettier 检查通过。
- 下面的受影响测试共 14 文件、530 用例。首次并行运行 13 文件通过，1 项既有音素设置用例未找到“当前音色语速”参数弹窗；未修改该测试或弱化断言，单独复跑 `V3SynthesisInputs.test.tsx` 后 51/51 通过。保留首次失败 `focused-tests.log` 与复跑 `synthesis-rerun.log`，不能把首次结果写成全绿。
- 最后针对当前设置改动复跑 `V3SpellingSettings.test.tsx`、`spellingSpeech.test.ts`、`V3VoiceTextField.test.tsx`：3 文件、84/84 通过，见 `final-settings-tests.log`。其余有效结果复用；未运行全仓统一门，该门按三批约定留第三批。

实际定向测试命令（花括号是 shell 展开，列出同一批文件）：

```sh
pnpm exec vitest run \
  apps/admin/src/features/dictionary/word-creation-v3/components/{V3SpellingSettings,V3SynthesisInputs,V3PronunciationList,V3ConcreteFormRow.required,V3ConcreteFormRow.playback,V3VoiceTextField,V3FormContentModal}.test.tsx \
  apps/admin/src/features/dictionary/word-creation-v3/{spellingSpeech,operations}.test.ts \
  packages/voice-editor/src/editor/next/{VoiceEditor,PauseInteraction,InlinePause,KeyboardShortcuts,LocalVoicePool}.test.tsx
pnpm --filter @tsz/admin exec vitest run src/features/dictionary/word-creation-v3/components/V3SynthesisInputs.test.tsx
pnpm --filter @tsz/admin exec vitest run \
  src/features/dictionary/word-creation-v3/components/V3SpellingSettings.test.tsx \
  src/features/dictionary/word-creation-v3/spellingSpeech.test.ts \
  src/features/dictionary/word-creation-v3/components/V3VoiceTextField.test.tsx
```

Codex 内置浏览器（真实组件、本地内存 fixture，非真实后端）：

- 1440×1000：确认按钮位置；打开非活动英式拼写设置后来源保持“本侧暂不配置”；修改语速为 0.80×，模拟第一次宿主保存失败，输入保留，重试成功；从第二读法重新打开可见同一 0.80× 配置。
- 1024×900：英美分开布局的美式入口打开 `center` 与美式音色，关闭、取消、保存按钮可达，音色池按现有固定宽度横向访问。
- 截图：`sources-1440.png`、`spelling-settings-1440.png`、`save-failure-1440.png`、`shared-reading-1440.png`、`split-sources-1024.png`、`split-settings-1024.png`；另存 `split-settings-1024-ax.txt`。
- 控制台观察到既有 `wrapClassName` 弃用提示；临时 fixture 的 HMR 过程出现重复 createRoot/height NaN 警告，刷新后完成上述流程。fixture 已删除，不将其热更新警告当作产品验收通过或失败的替代证据。

## 环境与清理

- 页面运行于本次独占的 `127.0.0.1:43195`，使用内存草稿和假保存；真实 API 被本地中间件拒绝，语音生成及上传关闭，未连接业务库、Redis 或 OSS。
- 已关闭本次浏览器标签并恢复 viewport，停止临时 Vite 服务（复查端口无监听），删除 `apps/admin/.task-195-fixture/` 及任务临时日志，仅保留脱敏测试日志/截图。没有创建账号、词条、音频对象、对象版本、删除标记或专属登记，因此未运行 OSS 创建预检或删除脚本。
- 保留 pnpm 依赖供后续批次复用；无凭据、原始录音或完整业务数据副本。
- 真实后端持久化、真实语音云及发布消费均未验收；本地 fixture 和 mock 断言不代表这些链路已通过。PR/CI、部署未运行。

## 第二批具体接手点

1. 直接复用本工作树、分支和未提交 diff；勿重新从主线另起分支，也勿覆盖第一批改动。共享文本、来源选择、宿主保存仍按上文约束。
2. 在 `V3SynthesisInputs.tsx` 将现有 IPA/UPS 设置入口迁到来源行，参照本批设置按钮与 Radio 同级的结构，沿用 `V3PhonemeSpeechSettings`，不新建音素配置模型。
3. 完整整理来源区、补非活动音素来源试听、统一录音入口；保留非活动缓存及各源真实所有者。上方文本拼写编辑器当前仍保留原综合编辑能力，本批仅限制新来源入口，整体入口收拢由第二批继续。
4. 复用 `V3VoiceTextField.spellingSettingsRef` 与所有者音频任务，不按读法重复挂字段。`spelling-settings` 内不直接生成正式音频；提交后所有者通过 VoiceSaveContext 等待音频任务，这一边界应保留。
5. 第一批有效证据继续复用；若更改保存/音频路径，定向重跑相关测试。第三批负责整体生命周期、真实云与发布消费及统一质量门，不能将它们标为本批已完成。

## 第二批成果与写入交接

第二批已完成，第一批未提交差异完整保留；仍使用 `/Users/darwish/.codex/worktrees/77f6/tsz`、`codex/task-195-speech-source-settings`、基线 `94292dad86cf458a4518e3323032b463eae33cdf`。所有改动均未提交、未暂存；没有提交、推送、PR、合并、部署、禅道修改或后端 checkout 写入。第二批停止写入，可由第三批接手。

- `V3SynthesisInputs.tsx`：IPA/UPS 设置从音素输入连体控件迁到常驻来源行，统一为单选圆环 → 设置按钮 → 来源名称和内容预览。设置按钮与 Radio/来源 label 同级，点击或键盘打开设置不切换来源；“暂不配置”无设置按钮。字典音标、实际发音、音素输入、转换与字段播放保留，字段主动试听按自身候选构造内容，不再被 `none/upload` 阻断。旧 UPS 短语无 `use_spelling` 的兼容行为保留。
- `V3PhonemeSpeechSettings.tsx`：弹窗 resolve/synthesize 使用正在编辑的音素来源和口音，候选处于非活动状态也可配置、主动试听和保存；写回仍保留真实 `candidate.source`。只有活动来源向编辑器注入正式生成能力、要求完成正式音频及注册折叠音频任务，非活动候选不加入自动生成/保存必需任务。无 locale 的历史 fallback 音色通过既有目录校对到当前口音。设置组件不再属于 UPS 折叠输入区，首次展开前就存在，折叠不卸载设置器或音频任务。
- `V3PronunciationAudioUpload.tsx`：复用原上传面板，在每侧人工录音来源行使用同尺寸设置图标；无录音时仍能打开，来源 Radio 继续禁用。每侧入口固定对应 locale，上传校验、失败重试、已有录音管理和 pending 保存门禁保持；只传 `pronunciation.audio_assets`，不接入 `spelling_speech.audio_assets`。
- `V3ConcreteFormRow.tsx` / `V3VoiceTextField.tsx` / voice-editor `types.ts`、`VoiceEditor.tsx`：只在这三个词形拼写所有者入口启用 `spellingTextOnly`；文本入口保留拼写输入、斜体、连读和清除等展示标注，隐藏停顿、读法、配音池和上传，不自动推荐或在正文编辑器中生成。来源行的 `spelling-settings` 模式保留完整配音能力。新增 `speechSettingsEnabled` 默认 true，其他语法、释义、例句和原有 spelling 调用方行为不变。
- 文本入口保存保留最新配音/录音配置，音频内容变化时清除旧合成引用，沿用第一批 `settingsCommitting` 路径让唯一所有者注册任务并等待 VoiceSaveContext 保存。定向回归实际复现了收拢前实现会把旧文本音频引用写回的问题，修复后验证改字只生成一次，宿主持久化读到新音频；展示标注不参与音频内容比较。失败保留与重试、设置取消和迟到目标保护沿用现有会话。
- 未修改 wire、后端协议、迁移或发布消费规则；未将共享拼写复制为读法配置，#165 仍不在范围。

## 第二批验证与证据

证据目录：`/Users/darwish/.codex/visualizations/2026/11/13/01a1d27e-a1c3-7c93-8312-3689815337eb/task-195-second-batch/`。

- 第一轮本批测试保留在 `initial-tests.log`：5 文件、132 通过 / 11 失败，主要是旧用例仍假定非活动候选自动生成和旧上传入口，以及旧 UPS 短语试听的兼容回归。已修复兼容分支；生成用例明确先启用相应来源，上传用例改用对应口音的入口，不弱化原音频/隔离断言。随后原 `V3SynthesisInputs.test.tsx` 51/51 通过（`synthesis-tests.log`）。
- 新增三种活动来源 spelling/upload/none × IPA/UPS 的配置、主动试听、保存不切源、不生成/不注册候选音频任务回归；UPS 首次展开前的任务与折叠保活回归；文本入口保留配音/录音和失败重试回归。初次新增测试的 Radio DOM 断言与历史隐式 upload 源断言不符，已按实际可观察行为修正；保留 `new-regressions.log`、`new-regressions-rerun.log`，不将其表述为首次全绿。
- 受影响的 11 文件、447/447 通过，见 `final-focused-tests.log`，覆盖本批来源区、第一批拼写设置/字段/真实所有者播放、读法列表，以及共享编辑器的 VoiceEditor、停顿、键盘和音色池。该轮后额外发现并补齐文本改字保存的音频等待回归：修复前 `text-save-before-fix.log` 明确保存了 `old-text-audio`；修复后结果见下文最终保存回归。
- 本批受影响 admin 文件 ESLint、voice-editor `src/types.ts` / `VoiceEditor.tsx` ESLint 通过；`pnpm check:admin-ui` 42 个样式检查及 4 个脚本用例通过。最终保存回归 4 文件、149/149 通过（`final-save-regressions.log`），最后来源区 58/58 通过（`final-source-tests.log`）；最终受影响 admin ESLint（`final-eslint-admin.log`）、所有改动文件 Prettier 检查（`final-format.log`）及 `git diff --check` 均通过。最后新增的文本音频等待回归加入后，复用未变的其他 7 文件结果，不重复整轮 11 文件。
- 按三批分工，本批没有重复执行全仓 typecheck 或全仓普通测试；最终类型门由交付阶段原生 hooks 承接，全量普通测试由后续 CI 执行。第一批此前类型结果仅适用于当时输入，不声称它证明本批新增改动。

内置浏览器使用真实组件与隔离内存 fixture，非真实后端：

- 1440×1000：来源设置按钮顺序正确；UPS 输入未展开时打开英式非活动 UPS，修改音素、模拟试听完成并保存，保存计数为 1，来源仍为“本侧暂不配置”，来源预览更新。截图 `sources-1440.png`、`inactive-ups-1440.png`、`saved-candidate-1440.png`。
- 1440×1000：上方拼写文本编辑器只有文本/斜体/连读等工具，没有完整音色池及上传入口；截图 `spelling-text-1440.png`。
- 1024×900：无录音时可打开英式人工录音设置，口音固定为 BrE，来源 Radio 保持不可用且未切源；fixture 禁用真实上传，面板明确显示“音频上传未启用”。截图 `upload-empty-1024.png`。
- 1024×900：通过 Enter 打开美式非活动 IPA，来源仍为词形拼写，弹窗显示对应美式音色，关闭、取消、保存均可达，固定宽度池沿既有规则横向访问；截图 `ipa-settings-1024.png`、结构 `ipa-settings-1024-ax.txt`。
- 浏览器仅观察到已有 `wrapClassName` 弃用提示；测试日志中保留既有 jsdom 伪元素 getComputedStyle 提示。

## 第二批环境与清理

- 本批临时服务为 `127.0.0.1:43196`；使用内存草稿、假保存及明确标记的本地试听 mock。fixture alias 隔离鉴权/语音数据源，Vite 中间件拒绝 `/api/` 请求；真实上传关闭，没有连接业务库、Redis 或 OSS。
- 已关闭本批内置浏览器标签、恢复 viewport，停止临时 Vite 服务，复查 43196 无监听，删除 `apps/admin/.task-195-fixture/` 和 `/tmp/task-195-second-vite.log`。仅保留上述脱敏日志、截图和结构证据，依赖继续复用。
- 没有创建账号、词条、录音、OSS 对象、版本、删除标记或登记，因此未触发 OSS 创建预检或删除脚本，无临时云资源残留。
- 真实后端保存/重开、真实语音云、发布消费、PR/CI 与部署均未执行，不以 fixture 或 mock 通过替代。

## 第三批具体接手点

1. 继续复用同一工作树、分支和全部未提交差异；本批不另开分支，不创建新 worktree，不交付外部变更。此记录第一批、第二批历史证据均保留，勿将首次失败写成全绿。
2. 做整体 VoiceSaveContext / 音频生命周期验收：共享拼写唯一所有者、非活动候选保存后仍不切源、不纳入必须生成列表；启用候选才等待对应音频；UPS 收起不卸载任务；拼写改字及共享停顿修改后旧音频失效、宿主保存读取最新完整草稿；失败/重试/取消/迟到结果与并发英美配置保持。
3. 准备真实环境时核实实际版本、代理、权限与 mock 状态，验证真实云及发布消费的链路，保存后重新请求/重新打开确认存储。按现有测试资源前缀、唯一 run-id 和清理预检要求创建临时数据并彻底清理；本批没有遗留 fixture 或云资源可接续。
4. 复用有效定向结果，按剩余风险补验；最终统一类型门/普通测试、精确提交独立审查、提交/推送/PR/CI/合并/tshb-test 部署由协调聊天授权路径接续。本批不自行启动第三批或联系其他聊天。

第二批最后实际运行的定向命令：

```sh
pnpm exec vitest run \
  apps/admin/src/features/dictionary/word-creation-v3/components/{V3VoiceTextField,V3SynthesisInputs,V3SpellingSettings,V3ConcreteFormRow.playback}.test.tsx
pnpm exec vitest run \
  apps/admin/src/features/dictionary/word-creation-v3/components/V3SynthesisInputs.test.tsx
```

## 第三批进行中：真实隔离环境与浏览器交接

复用同一前端工作树、分支与全部未提交差异。后端 `origin/main` fetch 后仍为 `d8d4ab02272150ca476917e64ef698f3fb13f0ea`，与测试服 accepted manifest 一致；使用只读 `git archive` 的独立源码构建，不修改后端主 checkout 或其他工作树。构建后二进制复制到本批私有目录，SHA-256 为 `4bd2698102397ec221c8dee676195c4030031e3bb089d162362726c612678da6`。

- 唯一 run-id：`20261113-task195-b3-73c92a`；OSS 列举、版本 GET 和永久删除预检通过，开始时对象数为 0。回执：`/Users/darwish/.codex/visualizations/2026/11/13/01a1d288-1ac9-71a3-a8ef-2b92b831161d/task195-third/oss-preflight.json`。
- 专属 PostgreSQL 容器 `tsz-task195-b3-73c92a-pg`，`127.0.0.1:62195/task195_b3`；Redis 容器 `tsz-task195-b3-73c92a-redis`，`127.0.0.1:62196/0`。所有 fixture/登记/会话只在此独占环境，结束整体销毁并复查。未接管现有服务。
- API `http://127.0.0.1:62197/api/v1`，PID 55711；Admin `http://localhost:43197`，launcher PID 56855，Vite 同源代理到上述 API。业务 mocks、TTS mock、local speech mock 全部显式 false；VOICE_EDITOR、VOICE_PREVIEW、AZURE_PRONUNCIATION_INPUTS 和上传能力 true。真实 Azure 目录同步 126 个音色；仅登录 OTP 使用后端现有 Mock sender。
- 词条 `01a1d28a-fb18-76bc-b476-6e1280939897`，centre、noun/base、共享拼写及两个读法，保存 revision 2 后独立 GET 完全一致；英美拼写各有真实正式音频。非活动 IPA 有独立 -20% 配置、没有正式资产。创建脚本早期请求因本地脚本缺少 version_name / 使用展开格式 / 字段不符被服务端拒绝，修正 fixture 后保存成功；这些是验收脚本准备错误，不记为产品缺陷。
- 页面：`http://localhost:43197/words/01a1d28a-fb18-76bc-b476-6e1280939897/v3/wizard/forms?tsz_test_run=20261113-task195-b3-73c92a`；亦可用 `/lexicon-next/<entry-id>`。专属凭据 `/tmp/tsz-task195-b3-73c92a/browser-credentials.json`（0600），父聊天读取使用、不写入证据；点击获取验证码后使用现有 mock sender 的 `000000`。
- 本聊天尝试 `cua.createBrowserTab("iab")` 明确返回 Browser is not available: iab，inventory 只有 Chrome。协调聊天已确认其自身 IAB 可用，故由协调聊天操作内置浏览器；本聊天未创建或使用 Chrome 标签，页面结果等待其回报。需保持服务，浏览器完成后再统一清理。
- 本批新增风险验证 `saveFlow.test.ts`、`useSelectedVoiceAudio.test.tsx`：2 文件 38 项通过，日志 `task195-third/lifecycle-tests.log`。复用前两批未变代码的有效结果，未手工重跑全仓测试/类型门。

待浏览器证明：共享拼写两个入口一致、单侧配置保存隔离、取消不写入、非活动 IPA/UPS 保存不切源/不生成、启用后生成保存和刷新重开；真实 revision 冲突可由本聊天配合，HTTP/云/发布证据与页面证据分别记录。当前仍在进行，尚未宣称清理或真实页面验收完成。

### 第三批真实验收发现并修复的回归

父聊天使用其可用的内置浏览器真实登录，在 centre revision 2 修改第一个读法的英式拼写设置：Sonia 0.90× → 0.85×，保存到 revision 3。两个读法英式同步正确，但美式从 Jenny 0.95×变成默认 Jimmie 1.00×。本聊天独立 GET 确认旧 Jenny 被存成 enabled=false、新增 us.mode=inherit 和默认音色；不是仅 UI 显示问题。首次截图 `summary-after-uk-save.png` 位于父证据目录 `/Users/darwish/.codex/visualizations/2026/11/13/01a1d25f-2fc2-7791-8636-6b107f5407df/task195-browser/`。

根因是本次 `mergeSpellingSettings` 在旧本地音色池首次产生 dubbing 元数据时把未编辑侧错误初始化为 inherit。修复仅修改该 fallback：通过已有 `withDefaultVoiceProfile` 区分真正缺省继承和有显式音色的旧本地池；旧本地池保留 local，两侧已有元数据继续原样合并。新增最小纯函数回归；修复前 1 失败/2 通过（`legacy-side-before-fix.log`），修复后与拼写设置/字段测试 3 文件 87 项通过（`legacy-side-after-fix.log`）。最后改动 ESLint、Prettier、diff 检查通过。

真实复验前由 API 把本批 fixture 恢复到原配置（revision 4），父聊天刷新并沿原路径英式改0.85×保存到 revision 5，两个英式一致、美式仍 Jenny0.95×。独立 GET 中美式整条配置前后 SHA-256 均为 `d9c3afb68c69532830623e73fdf78073b480fb88e9fd7d65e200db9aa6596fc0`，原资产 `01a1d28b-a163-70d4-a48e-188222b80861` 保持，us.mode=local。脱敏回执 `task195-third/uk-save-independent-get.json`。首次失败、恢复与复验分别记录，不改写历史。

### 第三批独立 HTTP / 云证据（页面其余链路进行中）

- 两条真实 Azure 拼写正式音频保存成功，分别22,464字节；通过真实签名 URL 独立读到字节并校验SHA-256、数据库key与URL均在本批 audio前缀，见 `cloud-audio.json`。未将字节读取表述为已经浏览器播放。
- 旧base_revision真实PUT返回409，独立GET证明内容与revision未变，见 `real-save-conflict.json`；UI失败保留/重试尚待父聊天证明。
- 为避免并发写浏览器fixture，另建 central 发布fixture `01a1d28d-79bc-70cf-91ff-30b640e14ca1`。真实生成英式IPA与美式拼写音频，存储于同一批次；完整词形/中文释义通过真实validate（valid=true、issues=[]）。`publication-audio/check` 的ready清单恰好2项，分别活动英式IPA和美式拼写；保留的非活动英式UPS/美式IPA配置没有资产且不成为必需项。发布首次被审听确认门正确阻止（409），等待父聊天实际播放及确认发布，不绕过该门。
- 已注册一个独占本地测试用户（OTP使用既有Mock sender）准备消费者GET；发布前该用户读取central得到404。真实消费者音频选择及读取待发布后补证。
- 清理脚本已准备但尚未执行；需等父聊天交还页面写入，停止写入后清OSS全部版本/删除标记、独立列举为0，再销毁专属PG/Redis和匿名卷、删除私有目录内凭据/完整fixture/二进制，保留脱敏回执。

### 第三批页面验收与发布消费结果

协调聊天在其内置浏览器完成真实页面链路（本聊天无IAB、未使用Chrome），页面全程连接上述专属真实API：

- 第一个读法英式拼写单侧保存回归修复后成功（revision4→5），第二读法打开同一共享设置读取0.85×；临时改0.75×后取消，重新打开仍0.85×，取消没有写入存储。
- 第一个读法英式非活动IPA原0.80×，真实试听显示“试听完毕”；改0.82×保存到revision6后，四侧来源仍为spelling。父聊天随后立即启用IPA，我的独立GET到达时已是revision7，故没有把revision7读回冒充成revision6的“无资产”独立证据；非活动阶段由父当时的页面实测与定向测试证明。
- 启用第一个读法英式IPA后发生真实正式生成，确认应用到草稿并页面保存到revision7；刷新回读第一个英式IPA0.82×、第二英式共享拼写0.85×、两个美式Jenny0.95×。点击第一个英式播放出现“播放中（正式音频）”。独立GET确认仅第一个英式source=ipa、其余三侧spelling、IPA rate=-18及新资产；独立签名GET读到22,464字节，见 `active-ipa-independent-get.json`。
- 页面revision冲突没有强制注入；真实HTTP旧revision返回409且存储不变，UI失败保留/重试沿用前两批定向回归，不写作本批页面已完成故障注入。UPS入口/首次展开/收起任务及非活动UPS行为沿用前两批组件回归，本批真实页面重点覆盖IPA。
- 父浏览器证据目录见上文，保留 `summary-after-uk-save.png`（修复前异常）、`accepted-summary.png`（修复后revision7）、`accepted-sources.png`（最终来源布局）。

独立central发布fixture已经真实HTTP完成清单check/confirm及发布（revision3，201），不是页面发布/人工审听结论。check要求仅2项：活动英式IPA资产 `01a1d28d-7d49-7539-8c0e-9fcc916cf0cc`、活动美式拼写资产 `01a1d28d-79ec-71a4-a582-8e51e4b799f9`；保留的非活动英式UPS与美式IPA没有正式音频、没有进入必需清单。见 `publication-api.json`。

通过真实注册的独立本地测试用户，发布前central详情404，发布后GET200；消费者audio恰为上述两个资产、accent_group分别uk/us，没有非活动缓存音频；两个消费URL均200，分别读取22,464字节并保留SHA-256，见 `publication-consumer.json`。浏览器真实播放与HTTP发布/消费证据分别成立，没有把API确认写成页面审听。

父聊天已正常注销、确认登录页、访问 `?tsz_test_run=off` 并关闭首轮专属标签；收到补验拼写正式播放的要求后，正短暂重开补验，服务与凭据继续保留到其退出完成通知。没有变更viewport。

### 第三批最终清理与写入交接

父聊天补验第二读法英式活动spelling0.85×，页面出现“播放中（正式音频）”，保留 `task195-browser/spelling-formal-playback.png`；此前第一个英式IPA0.82×也有正式播放实证。补验后再次正常注销、退出测试模式并关闭专属标签，未改viewport。

清理完成，最终无本批临时资源残留：

- 先停止本批Admin/API进程，再用原生 `cleanup-test-oss.py --apply` 永久删除9个对象版本（8个正式音频、1个试听对象），覆盖本批全部版本及删除标记范围；脚本自身独立复查为空。回执 `oss-cleanup.json`。另一次原生命令重新列举/执行空清理，`oss-independent-recheck.json` 确认planned/deleted/remaining均0，errors为空。
- 本地编排脚本首次将dry-run回执误当成含remaining字段的apply回执，出现KeyError并在销毁DB之前停止；OSS此时已成功清空、服务已停止。修正为原生apply空批次独立复查后继续成功；保留 `cleanup.log` 与 `cleanup-resume.log`，不隐去该脚本错误。没有实际对象删除失败或最终残留。
- 随后销毁本批独占PG/Redis两个容器和两个匿名卷，彻底移除1个管理员、1个测试用户、2个词条、1个发布、8个资产/生成登记、会话/幂等/outbox/关联/审听登记和4个Redis键；专属数据库整体销毁覆盖所有专属依赖。原有6个其他任务容器仍在，未触碰共享库、共享Redis或业务/运维数据。
- 4个端口43197/62195/62196/62197均确认关闭；私有目录 `/tmp/tsz-task195-b3-73c92a` 已整体删除，其中凭据、token、完整响应/fixture、临时源码/二进制、日志副本均移除。音频字节仅在内存读取，没有保留原始音频；预置用户配置凭据文件保持不变，共享Cargo构建缓存未清理。浏览器专属会话已按父回报正常注销/关闭；未声称额外擦除全局HTTP缓存。
- 总回执：`/Users/darwish/.codex/visualizations/2026/11/13/01a1d288-1ac9-71a3-a8ef-2b92b831161d/task195-third/cleanup-final.json`。

本批实际代码新增仅修复 `spellingSpeech.ts` 中旧本地池首次物化元数据的另一侧模式，及 `spellingSpeech.test.ts` 的对应失败回归；此前所有实现完整保留。最终相关3文件87项、生命周期2文件38项通过（分组可能有交叉，不按总数宣称覆盖率）；ESLint、改动格式及diff检查通过。真实页面、独立存储、云音频与发布消费者证据如上；页面revision故障注入、真实UPS全链路、人工录音上传本批未新增复验，分别复用已有对应组件证据，不扩大为全来源/全音色/异常供应商可用性结论。

前端仍为 `/Users/darwish/.codex/worktrees/77f6/tsz`、`codex/task-195-speech-source-settings`、HEAD `94292dad86cf458a4518e3323032b463eae33cdf`；14个tracked修改、2个新增测试和同一主记录均未提交/暂存，index未写入。后端主checkout保留原有HEAD和未跟踪文件，未写入源代码；测试后端来源为上文d8d4ab0归档。没有提交、push、PR、CI触发、合并、远端部署或禅道修改；本批范围内无阻塞和残留。最终交付hooks/PR/main CI与Admin发布尚未执行，交由协调聊天按已授权路径完成。

**第三批停止写入，可由协调聊天接管交付。**

## 交付审查与修复

协调聊天接管后，正常 pre-commit/commit-msg 完成首个提交 `3982d1783515de2453583732147759593b63c663`。独立 reviewer 对基线 `94292dad86cf458a4518e3323032b463eae33cdf` 至该提交完整审查，确认一项 P2：未启用的拼写来源设置仍会注册正式生成并阻塞保存，汇总页也会重新生成该缓存。

按真实拼写所有者聚合各口音活动来源，统一约束字段、保存等待及汇总页的拼写生成；共享停顿仍使另一活动口音补齐。显式来源使用独立的活动 owner，旧行级音色缓存不再重复生成；没有显式来源的旧协议继续保留原发布资产要求。底层音频任务仅在传入活动口音集合时施加该过滤，其他字段默认行为保持。未启用候选修改参数也移除已失效的旧音频引用，稍后启用再生成，不删除其他侧缓存。

新增真实组件/纯函数回归覆盖候选保存不生成、稍后启用生成、共享读法口音聚合、单侧参数失效与另一侧保留。使用当前回归测试与原提交源码运行，3 个场景在原提交全部失败（错误生成 2/3 次，以及候选保存已获得正式资产）；原源码测试结束自动恢复本次修复。修复后的 7 文件 131 项通过；最后收紧显式来源的目录任务门禁后，受影响汇总页 13 项再次通过。已有目录失败用例改为模拟所有并发目录请求失败，再恢复服务并重试，保留错误/阻止保存/恢复生成断言，不依赖哪个请求先发生。其余有效结果复用，没有重跑全仓普通测试。

该增量仅调整活动来源与音频任务，前述真实页面、云/发布消费及清理证据仍保留其对应代码阶段，不声称重建了已销毁的云验收环境。最终类型检查由原生 pre-push 承接，PR/main CI 将覆盖最终提交。

审查：1 轮；确认缺陷 1（已修，待同一 reviewer 增量复查）；证据排除误报 0；关联回归/回退：未知。

第2轮增量审查固定 `3982d178` → `fe39b8c4151b89b93f539263ac03d2243162185f`，同一P2在缺少locale的历史拼写音色中仍可达。共同根因是把“已启用的缓存音色”视为已知活动口音：即使服务端仅解析返回美式，前端仍可能把未解析的英式旧项追加生成。已收敛为显式活动集合下先确定口音再参与生成；已有accent可确定归属，缺少locale/归属的旧项等待解析结果，解析失败保留草稿并报告，不兜底生成未知口音。未传活动集合的旧调用方规则不变。

将回归中的拼写profile也去除locale，修复前明确错误生成2次而非1次；补解析失败不生成未知项、配置保留的断言。修复后汇总任务、字段和音频核心3文件112项通过，其他输入未变的有效结果复用。日志 `task195-missing-locale-before.log`、`task195-locale-final.log` 在协调聊天的 `task195-ship/` 证据目录。当前待同一reviewer对新精确提交增量复查。

审查：2轮；确认缺陷1（同根因，已修待复查）；证据排除误报0；关联回归/回退：未知。

第3轮增量审查固定 `fe39b8c4` → `1e85534a9374f974c67e474c414eaceb43883936`：原问题缺locale分支已封住，但强制解析成功条件引入纯legacy单侧本地池的新阻断。已重新核对共同边界：活动集合不是“所有可能口音”，而是显式来源协议的约束；纯legacy资料不传活动集合，仍仅按原池已启用项及原发布规则处理，不要求缺声侧解析成功。该区分在拼写所有者聚合处统一确定，字段及汇总页共用，避免在后续各处猜协议。

新增“无显式source、无dubbing、仅英式已有资产、美式解析422仍可保存”的回归，在 `1e85534a` 上先失败，修复后连同字段、拼写设置、汇总任务和音频核心5文件123项通过。其他有效结果复用，未重建云环境。证据 `task195-legacy-pool-before.log` / `task195-legacy-pool-after.log` 已归入协调聊天 `task195-ship/`。当前修复范围为该协议判定、summary fallback locale和对应测试，待同一reviewer增量复查。

审查：3轮；确认缺陷2（原活动来源问题及修复引入的legacy兼容问题，均已修待复查）；证据排除误报0；关联回归/回退：已记录本次legacy兼容回归，未观察线上回退。

第4轮对 `1e85534a` → `8180817e318e9d6423bd39673d30a7b879f472b9` 的增量复查确认，同一legacy兼容根因在统一拼写的混合协议资料仍可达：UK显式spelling、US仍legacy时，不能把legacy允许的整个池升级为US必须解析成功。新增真实字段回归先在原提交稳定失败。

现将策略统一为 `SpellingAudioScope`：`activeLocales` 控制允许生成的范围（有legacy消费者时保留旧池范围），`requiredLocales` 仅收集显式启用spelling的口音，分别约束生成过滤和解析失败；两者都进入音频任务身份以保护来源切换。字段和汇总页复用同一聚合，不在各入口猜协议。无显式source的变体、及同一变体内仍以legacy spelling消费的读法，保留legacy池要求；显式来源独立收集必须解析的口音。其他字段不传这两项时继续原行为。

混合协议回归同时证明：GB成功、legacy US解析失败可继续；显式GB解析失败仍阻止保存。修复后7文件135项通过，最后任务身份增量后的音频核心/字段/汇总3文件115项通过；其余有效结果复用。证据 `task195-mixed-before.log`、`task195-mixed-after.log`、`task195-scope-final.log` 在协调聊天 `task195-ship/`，均未创建新云资源。待同一reviewer对本次策略收敛增量复查。

审查：4轮；确认缺陷2（同根因残留合并计数）；证据排除误报0；关联回归/回退：本地已修复legacy兼容回归，未观察线上回退。
