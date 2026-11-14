# 配套发布入口

跨仓候选、兼容性组合、发布顺序与恢复规则统一维护在本任务所选 `tsz-rust` checkout 的 `.agents/skills/contract-sync/references/paired-release.md`。

从用户目标、Git 身份和工作树列表核实后端 checkout，再读取该文件；相邻主仓只是候选，不固定绝对目录，也不把历史版本当作当前规则。已加载同一份清单时直接沿用，不再执行一遍。

前端执行细节仍以本仓 [deploy](../../deploy/SKILL.md) 为准；Web/Admin 保留各自 SHA、精确 CI run/attempt、CI 制品、构建开关及验收状态，部署端不重新构建。
配套文件不可用时完成本仓准备并报告缺项，不猜发布顺序或绕过本仓门禁。单组件且没有兼容依赖的任务不强制跨仓发布。
