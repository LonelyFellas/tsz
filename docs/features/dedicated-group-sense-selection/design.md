# 专用词形组：多组词义绑定、Popover 与引用保护

2026-09-17 修订。沿用原任务工作树，前端交付分支 `codex/multi-group-sense-bindings`、后端交付分支 `dev`；旧版验收不代表本次通过。

## 依赖与方案

已有可复用能力：组 scope、一形一组、原子保存、词形允许词义筛选、入站引用接口、引用来源列表和保存保护。
关键路径：关系存储与契约 → 校验/保存/引用 → 前端选择和回显 → 回归与契约验证。

- 词义与专用组采用多对多关系。同一词义可被本基本词性多个组绑定。
- `WordSenseV3`、写入词义、内部 V2 投影和 `SenseFormGroupBindingV3` 增加可选 `form_group_ids`。
- 新字段存在时以其为准（包括空数组）；缺省时读取历史 `form_group_id`。新前端写数组并移除旧字段；不将多绑定压成首组，也不将两个字段合并。
- 每个 sense patch 替换该词义的完整绑定集合；未提交该 sense 不修改。绑定数组按集合比较，重复组和跨词性/通用组绑定拒绝。
- `allowed_form_senses` 按集合包含筛选；沿用正文、短语成分、多维例句、保存和发布的既有调用链。历史发布快照不改写，旧单值仍可读取。
- reconcile 只清理已删除或恢复通用的组，保留其他绑定；部分解绑也进入影响预览。

## 存储与迁移

新增 `20260917120000_multi_group_sense_bindings` up/down。关系表 `sense_form_group_bindings` 每个 `(sense_id, form_group_id)` 一行，双方复合外键保证同词性同词条。
从原 senses 单列回填；保留旧列兼容旧单组数据。组外键延迟校验且不得级联删除，因为保存事务会删后重插组。
词义投影同事务写入全部边；词义删除级联清理边，但删除前必须执行引用保护。
down 在存在新数组 JSON 时拒绝，避免旧程序读不懂或丢绑定；不自动清数据或改不可变发布快照。

## 引用与删除

`GET /entries/{id}/inbound-references` 新增 `form_group_sense_binding` 类型，每组对每义一条，source.node_id 为组 ID。
候选从已保存关系及 legacy 单列合并去重读取，兼容迁移后旧写实例尚未补关系表的窗口，累计入词义节点引用数；不增加按外部词条去重的列表引用词条数。
复用 `Rule::Sense` 和 `ensure_inbound_references`：正常解绑允许，但删除仍被组绑定的词义被拒绝。词义保存、词形保存/影响预览均检查；组绑定属于草稿来源，不干扰历史发布版本切换。
删除必须先解除引用并保存，再删除词义；短语、多维例句等已有保护保留。

## 前端

复用 antd Popover 与词义选择组件。点击头部入口打开浮层，不展开卡片；编辑控件和确认/取消位于浮层，取消或点外部关闭不修改草稿。
其他组已选词义仍可选，更新当前组仅增删当前边。词义页多选与预览展示全部绑定。
引用列表显示词形组来源并链接到 forms 对应组；删除按钮沿用引用保护，后端防止绕过。

## 契约和兼容

相关词条读取/保存/预览响应及请求的词义字段扩展；入站引用 kind 增加枚举值；capabilities 增加 `multi_group_sense_bindings`。
通过后端导出 OpenAPI、前端 sync:openapi 生成严格运行时 schema 和端点快照。
新前端读取两种绑定形状，仅新能力为 true 时开放多组编辑；旧后端阶段保留原词义单组编辑。
先更新兼容前端，再迁移及更新后端；旧浏览器必须刷新。旧前端全量保存不能默默截断多组，后端应明确拒绝缺少数组的旧写入。
本轮已授权提交、推送与 PR；不执行合并或部署。

## 验收

前端：`pnpm --filter @tsz/admin typecheck`、词形组绑定/meaningsModel/词义页/引用保护回归，以及 `pnpm --filter @tsz/api-client test`。
后端：`SQLX_OFFLINE=true cargo test --locked --lib`，隔离 PostgreSQL/Redis 下运行 `cargo test --locked --test lexicon_handler --test shared_sentences`；最后 fmt/clippy。
迁移在任务隔离数据库验证 up/down；不对未知或共享数据库运行迁移。
关键判据：同义两组保存后仍共存；解除一组保留另一组；跨词性及重复绑定拒绝；两个组都能关联同义；引用按组累计；直接请求删除绑定词义被拒；解除后可删；旧单值兼容；Popover 位于卡片外且卡片折叠不变。
