# 语音编辑器 wire 契约变更 需求评估

## 背景与目标

语音编辑器（`packages/voice-editor`）在 2026-09-05（PR #209）重做为内联标注画布，并接入
V3 词条编辑器 step3 的**语法结构**字段。编辑器工具栏提供 6 个工具：文本、语法结构、连读、
停顿、音色、语速、上传音频。

前端已上线，但**其中多数标注落不进库**。本文列出后端需要配合的契约变更。

判定依据：`tsz-rust/docs/openapi.json`（353 个 schema，逐项核对），以及前端
`packages/api-client/src/admin-word-v3.runtime-schema.json` 的运行时校验规则。

成功的样子：管理员在编辑器里做的标注，保存后重新载入能原样回来。

## 现状核对

| 编辑器工具         | wire 承载                             | 现状                                                |
| ------------------ | ------------------------------------- | --------------------------------------------------- |
| 文本               | `RichTextV2V3.text`                   | ✅ 可用，但长度上限两端不一致（见变更 5）           |
| 停顿               | `{type:"pause", at, duration_ms}`     | ✅ 完整可用                                         |
| 连读               | `{type:"liaison", start, end}`        | ⚠️ 区间可存，**两端锚点各自的宽度丢失**（见变更 2） |
| 语法结构三分类     | `emphasis.level`，枚举仅 `["strong"]` | ❌ 三类塌成一类（见变更 1）                         |
| 音色（启用哪几个） | **无字段**                            | ❌ 不持久化（见变更 3）                             |
| 语速               | **无字段**                            | ❌ 不持久化（见变更 3）                             |
| 上传音频           | **无字段**                            | ❌ 不持久化（见变更 4）                             |

已存在且可用的相关端点：`/speech/voices`（发音人清单）、`/speech/previews`（试听合成）。
这两个只服务**试听**，不承载"这段文本配了什么"。`WordPronunciationV3`
（`actual_pron` / `dict_phonetic` / `style`）是词条读音字段，也不是这个用途。

---

## 变更 1：放开 `RichTextEmphasisLevel`（优先级最高）

### 现状

```json
"RichTextEmphasisLevel": { "type": "string", "enum": ["strong"] }
```

前端界面把语法结构分成**功能词 / 核心词 / 语法词**三类，但落盘时三类一律写成
`"strong"`，读回时一律还原成**核心词**。净效果：**管理员分的三类，保存后全部丢失**。
这是语法结构这个功能的核心价值，目前是残缺的。

### 目标

```json
"RichTextEmphasisLevel": {
  "type": "string",
  "enum": ["strong", "function", "core", "grammar"]
}
```

- `function` / `core` / `grammar` 对应功能词 / 核心词 / 语法词。
- `strong` **保留**，仅用于兼容存量数据；前端读到 `strong` 会映射成核心词。
  后端不必迁移存量数据，也不必再写入 `strong`。

### 上线顺序（重要，不能反）

前端 `admin-word-v3.runtime-schema.json` 里同样写死 `enum: ["strong"]`，且对响应做
**运行时校验**（`additionalProperties: false` 同源机制）。后端一旦返回 `"function"`，
在前端同步 schema 并部署之前，**响应会被前端直接判为非法**。

1. 后端放开枚举，但**先不写入新值**（读写都仍是 `strong`）
2. 前端 `pnpm --filter @tsz/api-client sync:openapi` + 把落盘处硬编码的 `"strong"`
   改为透传 level + 部署
3. 后端开始写入新值

第 2 步前端改动很小（`packages/voice-editor/src/editor/next/tokens.ts` 一处），读回那一侧
（`roles.ts` 的 `normalizeGrammarLevel`）**已经前向兼容**，非 `strong` 的值原样透传。

---

## 变更 2：`liaison` 增加端点宽度（精度问题，可缓）

### 现状

```json
{ "type": "liaison", "start": int, "end": int }
```

一条连读只存得下一段区间。但界面允许两端各自选**多个连续字母**（例如起点选
`centre` 里的 `ce`、终点选 `of` 里的 `o`），这两个宽度存不下。保存后重新载入会退化成
两端各一个字母，弧线端点约偏半个字母。编辑期功能完整，只是持久化有损。

### 目标（二选一，后端定）

- **方案 A**（增量，推荐）：加两个可选字段
  ```json
  { "type": "liaison", "start": int, "end": int,
    "start_len": int (默认 1), "end_len": int (默认 1) }
  ```
- **方案 B**：改成两个区间 `{ start_range: [a,b), end_range: [c,d) }`（破坏性更大）

方案 A 属**新增响应字段**，同样需要前端先同步 schema 再部署。

---

## 变更 3：音色 / 语速持久化（已决策：两者都要存）

### 现状

编辑器里「可选音色」（勾选启用哪几个发音人）和「语速微调」目前是**纯会话状态**，
关掉页面即丢。wire 里没有任何字段承载它们。

2026-09-05 产品决策：**两者都要持久化**，语义是「这段文本将来合成语音时的配置」，
而不只是编辑时的试听参数。

### 目标形状

挂在 `RichTextVariantV3` 上，与 `value` 同级（**不要**塞进 `RichTextV2V3` 内部——
那个类型在多处复用，且是 `additionalProperties: false`）：

```json
"RichTextVariantV3": {
  "required": ["id", "value", "origin"],
  "properties": {
    "id": {...}, "value": {...}, "origin": {...},
    "voice_profile": { "$ref": "#/components/schemas/VoiceProfileV3" }   // 可选，可为 null
  }
}

"VoiceProfileV3": {
  "type": "object",
  "required": ["voice_ids", "rate_percent"],
  "properties": {
    "voice_ids":    { "type": "array", "items": { "type": "string" }, "maxItems": 20 },
    "rate_percent": { "type": "integer", "minimum": -50, "maximum": 100 }
  },
  "additionalProperties": false
}
```

### 字段口径（重要）

- **`voice_ids` 里存的是 `VoiceResponse.alias`**（`/speech/voices` 返回的那个字段）。
  前端 `VoiceOption.id` 就是直接取 `alias`（见 admin 的 `voice-editor/adapter.ts`）。
  发音人清单是外部 TTS 供应商给的，alias 可能随供应商变动 —— 因此**后端不要对
  `voice_ids` 做外键式强校验**，读到已下线的 alias 时原样返回，由前端在界面上标为失效。
- **`rate_percent` 不要按单个音色的范围校验。** `VoiceCapabilities` 里
  `min_rate_percent` / `max_rate_percent` 是**逐音色不同**的，而一个 profile 可以同时
  启用多个音色。正确做法是：存储层只校验 `-50..100` 这个全局区间（对应前端 0.50×–2.00×），
  真正的夹取发生在合成时（前端试听已经这么做了：按当前音色的范围 clamp）。
- `voice_profile` 缺省 / `null` 表示「未配置」，按系统默认音色与原速处理。

### 上线顺序

属**新增响应字段**。前端对响应做 `additionalProperties: false` 的运行时校验，
所以顺序同变更 1：后端先加字段但不返回 → 前端 `sync:openapi` + 部署 → 后端开始返回。

### 前端待办（本变更落地后）

编辑器目前把 `enabledVoiceIds` / `ratePercent` 留在组件内部状态，没有出口。前端需要给
`VoiceEditor` 增加一条 profile 的进出通道，并接到 V3 的变体上。

## 变更 4：上传音频持久化 —— 建议单独立项

「上传音频」当前只做到浏览器本地 object URL 试听，刷新即丢。要真正可用需要一整套：

- 文件上传端点（音频格式/大小限制、病毒扫描或格式校验）
- 对象存储与访问鉴权
- 与词形变体 / 文本的关联字段
- 生命周期：词条归档或删除时音频如何处置
- 与 TTS 合成的关系：自定义音频是覆盖合成，还是并列可选

工作量远大于变更 1、2，**建议独立排期，不要与 1、2 同批**。

---

## 变更 5：文本长度上限两端不一致 —— 待确认哪边是对的

|                                  | 上限             |
| -------------------------------- | ---------------- |
| 后端 `RichTextV2V3.text`         | `maxLength: 200` |
| 前端 `MAX_RICH_TEXT_CODE_POINTS` | 5000             |

语法结构文本超过 200 字时，前端校验放行、保存时后端 422，且编辑器会显示
「正文不能超过 5000 个码点」这种不符实际的提示。

- 若 200 是有意的业务上限 → **前端改**，对 V3 路径按 200 限并修正提示文案，后端不动。
- 若 200 是遗留值 → 后端放宽到与前端一致。

请后端确认 200 的来历。

---

## 推进建议

| 变更                 | 状态              | 建议                 |
| -------------------- | ----------------- | -------------------- |
| 1 放开 emphasis 枚举 | ✅ 可直接实施     | 优先，按上述三步上线 |
| 2 liaison 端点宽度   | ✅ 可直接实施     | 可与 1 同批          |
| 5 长度上限对齐       | ❓ 待后端确认口径 | 确认后多半是前端改   |
| 3 音色 / 语速持久化  | ⚠️ 待产品决策     | 决策前不动工         |
| 4 上传音频持久化     | ⚠️ 工作量大       | 单独立项             |

## 验收清单

变更 1 上线后，在 admin 第 3 步「语法结构」字段：

- [ ] 把某个词标成**功能词**，保存草稿，刷新页面 → 仍是功能词（当前会变成核心词）
- [ ] 同上，分别验证**语法词**
- [ ] 打开一条存量数据（`level: "strong"`）→ 显示为核心词，不报错
- [ ] 前端 `pnpm --filter @tsz/api-client sync:openapi` 后契约测试通过

变更 2 上线后：

- [ ] 起点选 2 个字母、终点选 1 个字母，保存后刷新 → 弧线端点位置与保存前一致

变更 3 上线后：

- [ ] 勾选 2 个音色、语速调成 1.25×，保存后刷新 → 勾选与语速原样回来
- [ ] `voice_ids` 里放一个已下线的 alias → 接口正常返回，不 4xx
- [ ] `rate_percent` 传 -50 与 100 → 接受；传 -60 或 120 → 拒绝
- [ ] 不传 `voice_profile` → 接受，视为未配置
