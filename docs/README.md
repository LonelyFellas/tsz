# 前端文档

## 日常入口

- [开发规范](../AGENTS.md)、[本地环境](../.agents/skills/dev-env/SKILL.md)、[部署流程](../.agents/skills/deploy/SKILL.md)。
- [词条编辑指南](word-editor.md)：保留跨任务仍有效的交互和数据约束。
- [契约同步](../.agents/skills/contract-sync/SKILL.md)、[后端对接](https://github.com/LonelyFellas/tsz-rust/blob/main/docs/frontend-integration.md)、[OpenAPI](https://github.com/LonelyFellas/tsz-rust/blob/main/docs/openapi.json)。
- 产品范围与品牌规范统一维护在配套总文档仓库的 `product.md`、`visual.md`；该仓库暂无远端，需取得本地 checkout 后阅读。

## 尚未关闭或需重新核实的事项

- [账号身份与权限分批计划](account-identity-permissions-batches.md)、[注册登录](features/web-auth-register/)：保留分批范围与配套依赖。
- [V3 待评审方案](features/smart-lexicon-v3-pending-review/)：独立需求，不从旧实现工作区推断已完成。
- [自动生成词条内容](features/auto-generate-word-content/)：旧验收对应当时实现；当前后端 OpenAPI 未提供该生成接口，需重新确认 V3 方案和后端配套，不据旧报告宣称可用。
- [词形重复检测矩阵](features/smart-lexicon-inflection-duplicate-detection/)、[词形列表审计矩阵](features/smart-lexicon-inflection-list-audit/)：尚未逐项确认关闭，保留其待核实场景。

已落地的一次性实施计划、旧验收报告和过时调研不再保留副本，通过 Git 历史查询。不要在新任务中复制接口定义、通用门禁或再新建历史归档目录。
