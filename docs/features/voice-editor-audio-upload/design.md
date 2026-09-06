# 语音编辑器上传音频持久化 技术设计文档

## 方案概述

复用后端已有的两套机制，不发明新东西：

1. **对象存储底座**（tsz-rust `docs/object-storage-design.md`）新增一个 `audio` 空间，
   与试听用的 `speech` 空间同一套配置形状（`OBJECT_STORAGE_AUDIO_*`）。
2. **预签名直传三步**（`../docs/web-avatar-upload-frontend-integration.md`，web 头像已全链路跑通）：
   前端向后端申请上传许可 → 文件字节直接 PUT 到 OSS → 回头 confirm；confirm 时后端到 OSS `stat`
   核验大小 / 类型后落库，返回一条**音频资产**（服务端生成 id 与对象键）。

前端拿到资产后，把资产写进 `GrammarVariantV3.audio_assets[]`，随 meanings 草稿一起保存；
试听时按资产 id 向后端要一张短期签名 URL。资产的对象生命周期（引用计数、发布快照引用、
归档 / 删除回收）全部在后端，前端只负责"引用"与"取消引用"。

**不选的备选方案**

- _后端代理 multipart 上传_：文件走 API 进程，占连接与内存；底座设计明确是直传 + 预签名，
  头像已经验证了这条路。
- _把 `audio_url` 直接存在节点上_：`smart-lexicon-v3/design.md` 已规定"若未来要保存真人或持久
  音频，另建 `audio_asset_id` 与资产生命周期，不复用临时 URL 字段"；签名 URL 会过期，
  也不该进 aggregate / publication / 审计日志。
- _编辑器自己调 api-client_：违反包边界（`architecture.test.ts` 禁止 voice-editor 依赖
  `@tsz/api-client`），仍用"宿主注入适配器"的老路子，和 `previewAdapter` 同款。

## 代码影响范围

### `@tsz/types`（`packages/types/src`）

- `admin-word-v3.ts`
  - 新增
    ```ts
    export type AudioAssetLocaleV3 = "en-GB" | "en-US";
    export type AudioAssetGenderV3 = "female" | "male";
    /** 一条已上传的音频资产；只读元数据由服务端在 confirm 时生成，前端原样回传。 */
    export interface AudioAssetV3 {
      id: string; // 服务端 UUIDv7
      locale: AudioAssetLocaleV3;
      gender: AudioAssetGenderV3;
      content_type: string; // 白名单内的 MIME
      size_bytes: number;
      duration_ms?: number | null; // 服务端能探到才有
      original_name: string; // 展示用，≤ 120 码点
      created_at: string;
    }
    ```
  - `GrammarVariantV3` 增加 `audio_assets?: AudioAssetV3[]`（缺省 / 空数组 = 没有音频）。
  - `RichTextVariantV3` 同形预留 `audio_assets?: AudioAssetV3[]`（本期 admin 不写入，见开放问题 1）。
  - `V3_VALIDATION_ISSUE_CODES` 增加 `audio_asset_invalid`——**随后端契约同步时再加**：
    契约测试要求这个列表与 openapi 的枚举完全相等，提前加会红。
- 新文件 `admin-audio-asset.ts`：上传流程的请求 / 响应 wire
  ```ts
  export const AUDIO_ASSET_CONTENT_TYPES = [
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/ogg"
  ] as const;
  export interface CreateAudioUploadInput {
    content_type: string;
    size: number;
  }
  export interface AudioUploadTicket {
    key: string;
    url: string;
    headers: Record<string, string>;
    expires_in: number;
    max_bytes: number;
  }
  export interface CreateAudioUploadResponse {
    upload: AudioUploadTicket;
  }
  export interface ConfirmAudioAssetInput {
    key: string;
    locale: AudioAssetLocaleV3;
    gender: AudioAssetGenderV3;
    original_name: string;
  }
  export interface ConfirmAudioAssetResponse {
    asset: AudioAssetV3;
  }
  export interface AudioAssetUrlResponse {
    url: string;
    expires_at: string;
    url_expires_in_seconds: number;
  }
  ```
  形状刻意与头像的 `AvatarUpload` 和试听的 `AdminSpeechPreviewResponse` 对齐，减少前端两套心智。

### `@tsz/api-client`（`packages/api-client/src`）

- `admin.ts` 增加三个端点封装：
  - `createAudioUpload(input)` → `POST /admin/lexicon/audio-assets/upload-url`
  - `confirmAudioAsset(input)` → `POST /admin/lexicon/audio-assets`
  - `getAudioAssetUrl(id)` → `GET /admin/lexicon/audio-assets/{id}/url`
- `sync:openapi` 同步快照；`admin-word-v3.runtime-schema.json` 收进 `AudioAssetV3`
  与 `GrammarVariantV3.audio_assets`（响应严格校验，见风险）。
- `endpoints.contract.test.ts` / `admin-word-schema.test.ts` 补三个端点与新字段的对账。

### `@tsz/voice-editor`（`packages/voice-editor/src`）

- `types.ts`
  - 新增宿主注入的适配器（与 `VoicePreviewAdapter` 同款，本包不碰 HTTP）：
    ```ts
    export interface AudioUploadAdapter {
      /** 三步合一：申请许可 → 直传（可报进度）→ confirm；任一步失败抛 AudioUploadError。 */
      upload(input: {
        file: File;
        locale: AudioAssetLocaleV3;
        gender: AudioAssetGenderV3;
        signal?: AbortSignal;
        onProgress?: (ratio: number) => void;
      }): Promise<AudioAsset>;
      /** 试听用短期签名 URL；调用方在 expiresAt 前使用，过期重取。 */
      resolveUrl(
        assetId: string,
        options?: { signal?: AbortSignal }
      ): Promise<{ url: string; expiresAt: string }>;
      /** 本会话是否已探测到存储未开通（501）：适配器记一次，编辑器每次渲染直接问。 */
      isStorageUnavailable?(): boolean;
    }
    export class AudioUploadError extends Error {
      code:
        | "unsupported_type"
        | "too_large"
        | "too_many"
        | "storage_unavailable"
        | "upload_failed"
        | "confirm_failed"
        | "unavailable"
        | "unknown";
      retryable: boolean;
    }
    export type AudioAsset = AudioAssetV3;
    ```
    直接用 wire 形状（与包内 `VoiceProfile` 的处理一致）：宿主进出都不必转换，少一层映射与一处
    `useMemo`；编辑器只读 `id` / `original_name` / `locale` / `gender`。
  - `VoiceEditorProps` 增加 `audioUploadAdapter?: AudioUploadAdapter`、
    `audioAssets?: AudioAsset[]`、`onAudioAssetsChange?: (next: AudioAsset[]) => void`、
    `audioAssetLimit?: number`（默认 8）。没传适配器 = 维持现在的"本地试听"行为？——**不**，
    改为面板置灰提示"音频上传未启用"，避免两套语义并存（本地 object URL 那套整体下线）。
- `editor/next/VoiceEditor.tsx`
  - 删掉本地 object URL 的 `uploads` 状态、`releaseUploads`、`addUploads`；改为受控的 `audioAssets`
    进出通道（与 `voiceProfile` 同款：外部值变化时灌入，内部改动实时抛出）。
  - 新增上传队列状态 `pendingUploads: Array<{ id; name; locale; gender; progress; error? }>`，
    成功一条就把资产追加进 `audioAssets` 并抛 `onAudioAssetsChange`；失败留在队列里可重试 / 移除。
  - 移除资产 = 从 `audioAssets` 去掉并抛出。不进撤销栈：音频不属于 `EditorSnapshot`（文本 + 标注），
    硬塞进去会让两套历史打架；改用列表上「移除」的 `Popconfirm` 二次确认兜底（requirements 已按此写）。
  - 试听：`playAsset(asset)` 先看内存里的 `{url, expiresAt}` 缓存，没有或已过期就 `resolveUrl`
    （带 `signal`），再 `new Audio(url)` 播放；取 URL 期间就算「在播」（再点是停止，连点不起第二路）；
    与 TTS 试听互斥；卸载 / 外部回灌把正在播的那条拿掉时停播；试听失败的说明只显示在音频面板里，
    不走「标注非法」那条阻断性 Alert。
  - 上传完成回调走 ref 取**最新的** `onAudioAssetsChange`：上传是异步的，直接用发起那一帧捕获的
    回调会把上传期间的编辑（宿主 `change` 克隆的是旧草稿）整体冲掉。
- `editor/next/ToolPanels.tsx` `UploadPanel`
  - 列表改为两段：进行中（进度条 / 失败原因 + 重试 / 移除）与已保存（试听 / 移除）。
  - 未注入适配器或适配器报 `storage_unavailable`：整块置灰 + 一句说明，选文件按钮禁用。
  - 选文件后先做本地预检（MIME 归一后在白名单、`File.size ≤ max`、总数 ≤ limit），不合格的直接进
    失败列表，不发请求。MIME 归一（`@tsz/types` 的 `audioAssetContentTypeOf`）：浏览器报的
    `audio/x-m4a` / `audio/x-wav` / `video/ogg` 换算成白名单值，type 缺失或不认识时按扩展名降级
    （与 web 头像上传同款）；`accept` 同时列 MIME 与扩展名，否则 Chrome 会把 `.m4a` 置灰。
- `styles.css`：进度条与失败态样式（沿用 antd 变量），不引入新色。
- `editor/next/VoiceEditor.test.tsx`、新增 `audioAssets.test.tsx`：见测试策略。

### `apps/admin`

- `src/features/dictionary/voice-editor/audioUploadAdapter.ts`（新）：实现 `AudioUploadAdapter`
  - `upload`：`createAudioUpload`（`content_type` 为归一后的白名单值）→ `XMLHttpRequest` PUT
    （要进度，fetch 不行）原样带 `headers`、不带 Authorization / cookie、超时取许可的 `expires_in`
    → `confirmAudioAsset`；把 413 / 415 / 501 / 网络错误映射到 `AudioUploadError.code`；
    OSS 返回 403 视为许可过期 → `upload_failed(retryable)`；其余 4xx 归 `unknown` 但**可重试**且
    文案带状态码（端点未上线时 404 最常见，只能「移除再重选」太差）。
  - `resolveUrl`：`getAudioAssetUrl`。
  - 501 结果在模块内记一次（会话内不再反复请求），与头像文档 §6 的建议一致。
- `src/features/dictionary/voice-editor/dataSource.ts`：导出 `adminAudioUploadAdapter`
  （沿用 mock 开关模式：`VITE_ADMIN_TTS_MOCK` 为 true 时给一个内存 mock，便于 jsdom / 无后端联调）。
- `src/features/dictionary/word-creation-v3/components/V3VoiceTextField.tsx`：
  透传 `audioUploadAdapter` / `audioAssets` / `onAudioAssetsChange`（包内即 wire 形状，不转换）。
- `meaningsModel.ts`：`toWritableMeanings` 与拼写模式切换的 `normalizeGrammarVariants` 重建变体时
  带上 `voice_profile` / `audio_assets`（此前两处都只搬 `id/dialect/content`，保存一次 `voice_profile`
  就丢，本次一并修）；common → uk/us 拆分时音频按归属语种分到对应一侧，uk/us → common 合并时两侧拼接。
- `V3MeaningsAndExamplesStep.tsx`：语法结构变体挂点把 `variant.audio_assets` 接进来，
  `onAudioAssetsChange` 写回 `draft.pos[..].grammar_structures[..].variants[..].audio_assets`。
- `presentationErrors.ts`：`audio_asset_invalid` 的中文文案（随 issue code 一起在契约同步时加）；
  `issueNavigation` 按 `node_id` 定位到变体（沿用 `voice_profile_invalid` 的路径，无需改动）。
- `V3MeaningsPreview.tsx` / 发布预览：变体旁显示"音频 N 条"（只读，不做播放）。
- `src/lib/env.ts`：新增 `VITE_VOICE_AUDIO_UPLOAD`。**后端契约落地前默认 `false`**（dev 也关）：
  开着会把后端还不认识的 `audio_assets` 随草稿送过去被 422。后端上线后改默认为 `!PROD`。
- `apps/admin/.env.example`：补上开关说明。

## 后端对接（需用户转达后端）

依据：tsz-rust `docs/object-storage-design.md`（空间 / 预签名 / 领域层职责）、
`docs/tts-preview-api-design.md`（签名 URL 与缓存编排）、
`../docs/web-avatar-upload-frontend-integration.md`（三步直传契约与错误对照）。
以下为**建议**，字段最终以后端更新后的 `docs/openapi.json` 为准。

### 存储空间

```text
OBJECT_STORAGE_SPACES=speech,audio
OBJECT_STORAGE_AUDIO_BACKEND=oss
OBJECT_STORAGE_AUDIO_OSS_ROOT=/audio            # 与 /speech 相邻不重叠
OBJECT_STORAGE_AUDIO_PRIVACY=private
OBJECT_STORAGE_AUDIO_MAX_OBJECT_SIZE_BYTES=10485760
OBJECT_STORAGE_AUDIO_PRESIGN_TTL_SECONDS=300
OBJECT_STORAGE_AUDIO_CACHE_CONTROL=private, max-age=86400
```

bucket CORS 放行 admin 来源（`http://localhost:3001`、测试服 admin、生产 admin）的 `PUT` 与
`Content-Type` 头；未配置 `audio` 空间时三个端点返回 `501 audio_storage_not_configured`。

### 端点

| 方法 | 路径                                            | 请求                                     | 响应                                                       | 备注                                                                                                                                                                                                                 |
| ---- | ----------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST | `/api/v1/admin/lexicon/audio-assets/upload-url` | `{ content_type, size }`                 | `{ upload: { key, url, headers, expires_in, max_bytes } }` | 白名单 / 大小预检；key 形如 `uploads/audio/<admin_id>/<uuidv7>.<ext>`，暂存前缀，未 confirm 的次日回收                                                                                                               |
| POST | `/api/v1/admin/lexicon/audio-assets`            | `{ key, locale, gender, original_name }` | `201 { asset: AudioAssetV3 }`                              | `stat` 核验真实大小 / 类型，晋升正式键 `audio/<uuidv7>.<ext>`；落库 `lexicon.audio_assets`（id、key、content_type、size、duration、locale、gender、original_name、created_by、created_at）；此时**未被任何节点引用** |
| GET  | `/api/v1/admin/lexicon/audio-assets/{id}/url`   | —                                        | `{ url, expires_at, url_expires_in_seconds }`              | `presign_read`，TTL 取空间策略；要求调用者能读该资产所在词条（未绑定的资产只有创建者可读）                                                                                                                           |

错误码沿 RFC 9457 现有体系：`unsupported_audio_content_type`(400)、`audio_file_too_large`(413)、
`audio_upload_not_completed`(400)、`invalid_audio_key`(400)、`audio_storage_not_configured`(501)、
`audio_asset_not_found`(404)。

### meanings 草稿与发布

- `GrammarVariantV3.audio_assets: AudioAssetV3[]`（可选，缺省空）。保存时校验：每个 `id` 存在；
  资产要么未绑定、要么已绑定在**本词条**（禁止跨词条引用）；`locale` / `gender` 与库中一致
  （前端不能改归属，改了返回 422）；条数 ≤ 8。失败返回 422 `audio_asset_invalid`，
  `field: "audio_assets"`，`node_id` 为变体 id。
- 保存成功后更新绑定关系：本次草稿引用的资产标记为绑定到该词条；被草稿去掉引用且没有任何发布快照
  引用的资产进入"待回收"，由现有的孤儿回收任务删对象与行（与 speech 缓存的补偿机制同类）。
- 发布快照原样带 `audio_assets`（引用同一资产，不复制对象）；激活历史发布不受草稿改动影响。
- 词条删除 / 归档：解除绑定，走同一回收路径。
- V3 → V2 往返：`audio_assets` 必须像 `voice_profile` 一样在服务端的 V2 往返中保留，
  否则保存即丢（这是 `voice_profile` 落地时踩过的点，见 frontend-integration.md §21）。

### 部署顺序

新增响应字段 → **前端先** `sync:openapi` 并部署 admin，再上后端（或同批）；否则严格 runtime
schema 会把新字段当未知属性拒掉。

## 复用与约定

- 类型 → `@tsz/types`（snake_case，1:1 镜像后端）；请求 → `@tsz/api-client`；
  编辑器包保持无 HTTP 依赖，宿主注入适配器（与 `previewAdapter` 同构）。
- 直传的 XHR 不经过 admin `HttpClient`（那是给 API 用的，会带 Authorization 与 cookie，直传恰恰不能带）。
- 鉴权：申请许可 / confirm / 取 URL 走 admin 鉴权内核（`@/lib/auth` 的 `api`）。
- UI：antd v6（`Progress`、`Button`、`Alert`，`Alert` 用 `title`）；voice-editor 里 antd 是可选 peer，
  面板内已在用 `Button` / `Radio`，加 `Progress` 不改变依赖形状。
- 命中的硬约定：严格 runtime schema 部署顺序；`data-v3-*` 仍落在可聚焦输入框上（音频面板不影响）。

## 数据流 / 时序

**上传**

```
UploadPanel 选文件
  → VoiceEditor 本地预检（类型 / 大小 / 条数）→ 不合格进失败列表
  → adapter.upload(file, {locale, gender})
      ① api.createAudioUpload({content_type, size})            → 501 ⇒ storage_unavailable（面板置灰）
      ② XHR PUT upload.url + upload.headers, body=file, onprogress → 403 ⇒ 许可过期，重走 ①
      ③ api.confirmAudioAsset({key, locale, gender, original_name}) → 500 ⇒ 可直接重试 ③
  → 成功：audioAssets = [...audioAssets, asset]; onAudioAssetsChange → V3 draft.variant.audio_assets
  → 用户「保存草稿」→ PUT /steps/meanings（后端此时才建立绑定）
```

**试听**

```
点击试听 → 内存缓存 {url, expiresAt} 未过期 ⇒ 直接播
         → 否则 adapter.resolveUrl(id) → GET /audio-assets/{id}/url → 播放；过期时间只存内存
```

**回显**：`GET /lexicon/entries/{id}` → `variant.audio_assets` → `V3VoiceTextField` 原样
灌入编辑器；与 `voice_profile` 同一条"外部值变化才重灌"的判定，避免自己 → 父 → 自己
的回路被当成外部改动（`VoiceEditor.test.tsx` 已有该用例，照样覆盖 `audioAssets`）。

## 测试策略（概览）

- **`@tsz/voice-editor` 单测**（jsdom，注入 mock 适配器）：预检拦截（类型 / 大小 / 条数）；
  上传进度与成功追加；失败保留在队列可重试 / 移除；`storage_unavailable` 置灰；
  资产列表回显与移除确认；试听 URL 过期后重取；卸载停播；`audioAssets` 回灌不重置画笔与历史。
- **`@tsz/api-client` 契约测试**：三个端点与 `AudioAssetV3` / `audio_assets` 对账 openapi 快照；
  runtime schema 收进新字段。
- **admin 集成测试**（`V3MeaningsAndExamplesStep.test.tsx`）：上传成功后 `draft…variants[i].audio_assets`
  被写入；`audio_asset_invalid` 定位到变体；`VITE_VOICE_AUDIO_UPLOAD=false` 时面板不出现。
- **适配器单测**：`createAudioUpload` 501 / 400 / 413 / 415 映射；XHR 403 映射为可重试；confirm 500 可重试。
- **手测清单**（真实 OSS）：CORS 预检通过；10 MiB 边界；断网重试；刷新回显；发布快照带引用；
  签名 URL 5 分钟过期后重取。具体用例在动工阶段交给 test skill 展开。

## 风险与回滚

- **CORS**：bucket 没放行 admin 来源时直传静默失败（浏览器只报网络错误）。上线前先在测试服验一次
  OPTIONS；文档里已写明加白名单有延迟。
- **严格 runtime schema**：后端先上会让 admin 读词条 422。按"部署顺序"执行；开关
  `VITE_VOICE_AUDIO_UPLOAD` 只控制入口，不控制 schema——schema 的宽容必须随契约同步一起上。
- **孤儿对象**：confirm 成功但用户没保存草稿 / 关页 → 资产未绑定。由后端回收任务处理（未绑定超过 N 天删），
  前端不做补偿；这是底座文档§6 划定的领域层职责。
- **V2 往返丢字段**：与 `voice_profile` 同一个坑，后端对接建议里已单列；前端契约测试用带
  `audio_assets` 的 fixture 做保存 → 读回对账。
- **本地 object URL 那套整体下线**：没有适配器的环境（如包内 storybook / 单测）面板置灰而不是能选文件，
  行为变化写进 CHANGELOG；老测试里"上传多个音频各自记住语种"的用例改为走 mock 适配器。
- **回滚**：前端关 `VITE_VOICE_AUDIO_UPLOAD` 即隐藏入口；字段是可选的，后端回滚只需停止返回
  `audio_assets`，已存对象由回收任务处置。
