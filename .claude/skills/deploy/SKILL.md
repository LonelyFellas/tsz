---
name: deploy
description: 将已合入 GitHub main 且精确 CI 成功的 tsz 前端部署到 tshb-test，使用仓库导出构建与 rsync 脚本，验证页面、API 和制品来源。用于明确的前端部署请求；不部署后端。 兼容入口，规则复用本仓库 .agents 技能。
---

# deploy 项目入口

执行前读取 [项目 deploy 技能](../../../.agents/skills/deploy/SKILL.md)，并按其中要求读取相关引用文件。
该文件是流程的唯一维护位置；本入口不维护独立的授权、分支、测试、审查或部署规则。

- 从当前 checkout 解析链接，不能读取另一 worktree 的同名文件。
- 当前会话已加载对应项目技能时沿用其流程，不重复执行。
- 使用当前宿主可调用的工具；不凭空执行 slash command，不冒充不可用的独立 reviewer 或指定部署 agent。
- 若要求的工具确实缺失，先完成允许的准备工作，再准确报告受阻步骤；不能以兼容为由跳过质量门。
