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

新增严格枚举导致旧后端拒绝新写入、旧前端拒绝含新标记的响应。先升级所有读取端和后端接受能力，再启用新格式写入。生产默认关闭新增格式写入口，开发默认开放；斜体和清除沿用已有能力。

新写入开放前需处理仍运行旧版本的浏览器标签页。已有新标记数据后，回退应关闭写入口并保留读取能力，不直接回退旧 DTO。此处只记录发布依赖，本轮不部署。
