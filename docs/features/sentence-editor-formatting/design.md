# 释义与例句格式实现

## 依赖与复用

前端基线 `7b0f0e5`，后端基线 `3ef1ea9`。前端任务 checkout 为 `/Users/darwish/.codex/worktrees/36f6/tsz`，后端为 `/Users/darwish/.codex/worktrees/sentence-formatting/tsz-rust`，均使用 `codex/sentence-editor-formatting`。

已有能力：连读、停顿、撤销、草稿取消、音色折叠与两类业务关联。小改动：association 开放斜体、清除，统一工具排布。新增：bold/underline 契约和三态展示。关键路径：格式契约 → 生成同步 → 共用编辑/收起/阅读 → 宿主与浏览器验证。

## 数据与交互

沿用 RichText version 2，新增 `{ type: "bold", start, end }` 与 `{ type: "underline", start, end }`，偏移为 Unicode 码点的非空 `[start, end)`。复用 italic 的合并、跨行拆分、局部取消和改字裁切规则。不同格式可交叠，同类相邻/重叠合并；新类型排序追加于旧类型之后。

后端 core 与 V3 DTO 同步支持，沿用 JSONB 与发布快照，无新增数据库结构。OpenAPI 与前端 runtime bundle 用原生导出/同步生成，保持未知类型拒绝。

不借用 emphasis 的语法分类表达普通粗体。视觉格式不生成 SSML；既有缓存指纹仍包含全部标注，改格式可能使试听缓存失效。

association 保留单词/短语关联。释义继续保存 variant.text_links，共享例句继续保存 content.annotations 与 source_dialect。工具布局复用 grammar 的排布但不切换业务模式、不开放语法分类。

编辑显示层沿用隐藏粗体字形占位保持原生 textarea 的字宽，叠加格式只改变可见字形。收起态复用 RichTextReadOnly 覆盖展示，保留原输入节点、Tab、错误定位和降级；停顿收起隐藏但数据保留。阅读组件统一渲染格式。

清除模式只删连读/停顿；已有清空标注语义保持，新格式随清空移除，关联和历史透传标注沿用现有处理。

## 兼容与发布

安全开启任务基于前端 main `7a4cc16`、后端 main `3e8fe50`，两个隔离 worktree 使用 `codex/sentence-formatting-client-compatibility`。

已有：B/I/U 编辑、保存和读取。复用：HTTP 自定义头、拼写响应投影、事务锁/版本核对、原生契约生成及发布流程。新工作：句子格式响应协商与旧写保护、混合版本测试。无迁移和 DTO body 变更。

新客户端沿用原 typed JSON 序列化，不增加中间副本；旧客户端在共用响应边界将 typed body 序列化为独立 JSON 副本，只访问带 version=2、text 和 annotations 的 RichText 叶子。旧响应移除 bold/underline；V1 spans 和其它 annotations 原样。词条响应保留两个能力对应的 Vary，例句/词表响应设置句子格式 Vary。投影发生在服务/缓存返回之后，不能提前裁剪 canonical。

新 api-client 对完整词条、例句和词表 items 声明 `X-TSZ-Sentence-Formatting: v1`，GET 保留 AbortSignal，写请求保留 Idempotency-Key。该头只声明表示/保存能力，不代替鉴权或输入验证，不进入幂等摘要。

词义整步保存在锁住 entry 且再次验证 revision 后，检查被替换内容；旧客户端遇到新格式拒绝，不自动把旧标注嫁接到改动的正文。独立例句在已有锁顺序、revision 校验之后检查当前内容，删除关联和覆盖正文之前拒绝。词形保存仅在覆盖词形自身的新格式或删除带新格式的 POS 时拒绝，其余沿用服务器词义内容。

旧词条 UI 丢弃普通 400 的 detail，因此复用其已识别的 422 validation/meanings_storage_unsafe（显示刷新提示）；独立例句用既有 400 invalid_request_body 和中文 detail。保留草稿，不触发自动刷新或伪造 revision conflict。

验证：冻结 #379 前的严格 annotation schema；响应三种能力组合、全部富文本嵌套；真实 handler/数据库中的读取、拒写无副作用、新写清除、旧普通写、历史与跨能力幂等重放；词表公开/用户/审核消费；前端头与信号/幂等键；旧 UI 提示与草稿保留。

发布顺序：两仓精确 main CI 通过 → 兼容后端验收 → 新读取客户端 → 后台 `DEPLOY_SENTENCE_FORMATTING=true`。词表新客户端在 web 发布时声明能力；过渡旧 web/后台使用兼容视图。无需人工确认全部标签页刷新。出现问题关闭后台入口，保留兼容后端与读取能力；不能回退到会向旧客户端泄漏新增注解的 API。
