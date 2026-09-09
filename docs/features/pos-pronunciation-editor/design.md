# 接入方案

## 已核对基线

前端：`/Users/darwish/Dev/tsz-pos-pronunciation/tsz`，`999b134`。
后端：相邻 `tsz-rust`，`1fcaf32`。均为 `codex/pos-pronunciation-editor`。

## 依赖与关键路径

- 可复用：`V3VoiceTextField`、`VoiceEditor`、现有 RichTextV3 / VoiceProfileV3 / AudioAsset、试听和上传适配器。
- 前端小改动：`V3PronunciationList` 接入编辑入口；`model.ts` 的严格 shape 检查和 wire 输出保留新增字段。
- 新契约工作：发音 DTO 当前只有 id/dict_phonetic/actual_pron/style，严格拒绝额外字段。需扩展契约、后端校验和显式构造发音对象的复制路径。
- 音频新接线：草稿与发布引用收集目前只覆盖 meanings，需覆盖 forms 中 pronunciation 节点。
- 外部依赖未就绪：当前隔离环境没有真实 TTS、对象存储配置。

关键路径：DTO 与后端校验/往返保存 → 导出 OpenAPI 与前端契约 → 接入 UI → 定向回归与真实页面保存恢复。预计实现与验证约 2–3 小时，不含外部语音服务配置；超出估计 50% 时重新说明剩余路径。

## 数据设计

保留 `dict_phonetic: string` 及现有规范化/去重语义，新增可选 `dict_phonetic_rich: RichTextV3`、`voice_profile: VoiceProfileV3`、`audio_assets: AudioAsset[]`。

未配置字段不输出；旧记录无需批量数据迁移。`dict_phonetic_rich.text` 必须等于 `dict_phonetic`，文本只有一个编辑来源，由前端同时更新，后端拒绝不一致。标注结构、范围、音色配置复用现有校验；音标仍遵守 200 码点限制。

音频资产以服务端元数据为准，使用 pronunciation.id 作为引用节点。保存 forms 和 meanings 都统一收集两部分的引用，防止保存词义时误删发音引用并被 GC 回收。发布也收集两部分。forms 原生保存和发布快照会完整序列化 V3，直接保留新增字段；显式构造发音 DTO 的复制路径需同步携带新增内容。结构化关系投影仍使用原字符串。

## 前端

编辑器默认使用 pronunciation 模式，不附带语法结构工具。Step 3 语法结构区域（V2/V3）显式传入 grammar 模式；正文关联区域继续使用 association 模式。

复用 `V3VoiceTextField`，保持 data-v3-node-id / data-v3-field 与可访问名称、错误定位。缺失 rich 字段时用 dict_phonetic 构造无标注正文。不要把编辑器输出再次降为字符串而丢弃标注。

按用户最终要求，普通输入模式左侧显示播放按钮，右侧保留麦克风编辑入口，不显示获取语音按钮。左侧播放使用当前标注、选定音色和语速；展开编辑器时隐藏左侧播放，完成编辑后恢复。编辑器保持全宽且标签顶部对齐，其他页面的旧试听行为保持原样。

## 兼容与发布

OpenAPI 必须由选定后端导出，前端使用显式 OPENAPI_SOURCE 同步，不手改生成物。

发布顺序：前端先部署兼容读取能力，后端再部署，最后启用新写入入口（前端兼容部署阶段保持 `VITE_VOICE_EDITOR=false`，后端就绪后再开启）。普通音标输入在未有标注时保持旧字符串 wire，不主动写空富文本。新前端向旧后端发送扩展字段会失败，因此入口启用必须与后端支持配套；已有用户数据含新增字段后不能直接回滚至严格旧 reader。当前仅实施本地，不自动提交、推送或部署。

## 风险验证

- Rust：可选字段兼容、音标正文一致性、标注范围；真实草稿保存读取与发布往返保留；forms/meanings 交替保存不丢音频引用。
- 前端：标注与配置写入 payload、读取恢复、多行隔离、空值错误定位和改字后撤销。
- 契约：新增字段由原生生成链进入 runtime schema；旧 payload 与新 payload 分别验证。
- 页面：使用本任务 3301/8584 环境保存后刷新，验证编辑器内容恢复。

验收命令：`pnpm --filter @tsz/api-client test && pnpm --filter @tsz/admin typecheck && pnpm exec vitest run apps/admin/src/features/dictionary/word-creation-v3/model.test.ts apps/admin/src/features/dictionary/word-creation-v3/components/V3VoiceTextField.test.tsx apps/admin/src/pages/WordWizardV3.test.tsx`

## 实施与验收记录（2026-09-09）

- 已接入现有编辑器并保存富文本、语音配置及音频资产。普通音标输入未标注时保持旧字符串 wire。
- 已按用户补充要求把默认模式改为 pronunciation；V2/V3 Step 3 语法结构区域显式使用 grammar；关联正文仍使用 association。
- 后端全量测试 1020 passed / 2 ignored，Clippy 与格式检查通过。音频集成测试覆盖 forms 保存、meanings 保存后引用保留和发布快照；非法标注与音色配置有精确字段定位断言。
- API-client 419 项测试通过；同步产物的来源 SHA-256 与本任务后端 OpenAPI 一致。
- 真实页面：本任务 3301 → 8584 → 独立 PostgreSQL。center 草稿保存了音标标注与 0.75× 配置，刷新后恢复；按最新工具栏要求移除了本次验证添加的语法标注，保留语速示例。未发布该词条。
- 未验证外部服务：本环境未配置 Azure TTS 和音频对象存储；存储链路通过独立数据库与 MemoryAdapter 集成验证，不冒充真实外部服务验收。
- 前端基础实现覆盖率回归：189 个文件通过，3098 passed / 3 skipped；使用原生 coverage lock 执行 `node scripts/run-coverage-locked.mjs --maxWorkers=2 --testTimeout=15000`，未修改断言、覆盖率配置或阈值。初轮并发测试中的既有 5 秒超时在低并发复验通过。类型、lint、Prettier 检查通过。日志位于本任务 run/final-coverage.log。

## 发音工具合并

按用户后续要求，所有共享编辑器的音色与语速入口合并为「发音」。同一面板左侧保留音色启用与逐音色试听，右侧调整语速；试听使用最新文本、标注与语速。保持现有 TTS 请求取消、缓存和音色速率限制，不增加自动播放。编辑器回归 90 项通过，覆盖不关闭面板改速后再次试听的请求。

## 本地有声 Mock 与交付边界

开发模式同时开启 `VITE_ADMIN_TTS_MOCK=true` 与 `VITE_LOCAL_SPEECH_MOCK=true` 时，Vite 本地插件使用 macOS 系统音色生成 WAV。支持演示音色、语速与停顿；center 的 IPA 使用读词样本映射。它不代表正式 Azure 音色、完整 IPA 或连读合成能力。其他平台不启用该本机演示，生产构建不安装该中间件。

本地开关、账号凭据和日志不提交。正式 TTS、对象存储配置与上线仍未验收；本次交付为功能代码和本地演示，不包含部署。最后 UI/Mock 调整按受影响文件定向复验，保持基础全量测试证据的适用范围。
