---
name: deploy
description: 将已合入 GitHub main 且精确 CI 成功的 tsz 前端部署到 tshb-test，使用仓库导出构建与 rsync 脚本，验证页面、API 和制品来源。用于明确的前端部署请求；不部署后端。
---

# 前端部署到 tshb-test

## 必须保留的约束

- 只部署 GitHub 当前 main；精确 SHA 的最新 `CI` 工作流必须 `completed/success`。零散 check 的 skipped/neutral、无 CI、查询失败或状态未知都不能放行。
- 唯一入口是 [deploy-web.sh](../../../deploy/deploy-web.sh) 和 [deploy-admin.sh](../../../deploy/deploy-admin.sh)，具体构建门禁见 [deploy-source.sh](../../../deploy/deploy-source.sh)。
- 脚本从目标 Git 对象导出临时构建树。无需切 main、stash 或移动用户 .env；本地脏文件不进入制品。若部署入口脚本本身有未经核实的改动，先从目标提交取得可信入口，不能执行来历不明的修改。
- 不在服务器创建 Git checkout，不运行废弃根 deploy.sh/Docker Compose；不修改后端服务、数据库或运行数据。
- 部署请求已授权这次前端发布及必要验证；未授权的合并、后端部署和真实业务变更不包含在内。

## 1. 确认目标与 CI

本次依赖配套后端变更时，读取本仓 [配套发布清单](../contract-sync/references/paired-release.md)，先核实实际版本组合及兼容顺序；单组件发布不强制走双仓清单，不擅自扩展部署范围。

检查本地状态和脚本，fetch 后记录 main SHA，确认用户要求的改动已合入。
CI 的 owner/repo 从 GitHub remote 解析，按脚本查询该 SHA 的最新 `CI` workflow run：
`repos/<owner>/<repo>/actions/runs?branch=main&head_sha=<sha>&per_page=100`。

- 成功：记录 SHA、run ID 与链接后继续。
- 正在运行：使用 [CI 等待与续跑](references/ci-wait.md)，成功后沿用原部署授权。
- 失败、取消、超时、无记录或无法确定：停止并报告具体状态，不手动豁免脚本门禁。

每个组件部署前重新核对 main 与 CI。main 前进时对新目标重新验证，不能沿用旧绿色结果。
同时部署 web/admin 时记录各自实际 SHA；中途目标变化须重新协调版本，不能把不同 SHA 误报成一次一致发布。

## 2. 顺序部署

从仓库根执行 `./deploy/deploy-web.sh`；其全部检查通过后再执行 `./deploy/deploy-admin.sh`。
用户仅指定一个组件时只运行该组件。

需要先发兼容前端时，可用 `DEPLOY_VOICE_EDITOR=false ./deploy/deploy-admin.sh` 暂关语音编辑入口；后端验收后再按默认 `true` 重发 admin。开关只接受 `true` / `false`，不影响精确 main、CI、隔离构建或 manifest 门禁。

规则变化标记配套发布：旧后端不接受变体 `is_regular`。先用
`DEPLOY_FORM_SPELLING_REGULARITY=false ./deploy/deploy-admin.sh` 发布兼容前端；它隐藏新开关，不向旧后端生成新字段，但保留新后端已返回的值。
兼容 admin 验收后、切换 API 前，必须确认录入人员已保存并刷新/关闭全部旧标签页；无法确认时保持兼容 admin + 旧 API，不执行后端切换。后端完成验收后，用 `DEPLOY_FORM_SPELLING_REGULARITY=true ./deploy/deploy-admin.sh` 开启录入。此开关默认 true，只接受 true/false，不替代 main/CI/manifest 门禁。

脚本负责 Node 版本核对、隔离构建、写服务器前 exact-main 校验、独立 release 上传、远端发布锁、原子入口切换、服务/nginx、smoke 和 manifest 验证；
历史静态资源保留 30 天，当前与回滚版本始终保留。web 使用双端口 systemd 实例，当前端口记录在 `/opt/tsz-releases/web/port`。
存在 `/opt/tsz-frontend-transaction` 时先核对其中记录的暂存目录、旧版本与备份，不直接删除记录继续发布。
web 还必须先启动裁剪后的 standalone 制品确认可运行。使用可继续读取的长命令会话，不因工具提前返回而误判完成。
脚本非零退出立即停止；已完成组件明确列为部分部署，不手工拼产物、补写 manifest 或跳过验证。

## 3. 验收与汇报

按 [验收清单](references/verification.md) 复核脚本已输出的验收证据；仅缺项、状态变化或结果不明时补查对应项，不重复同状态的 smoke 或制品复算。
报告每个组件的 SHA、CI run、HTTP/服务结果、manifest verify 结果及未完成部分。
故障先只读检查；nginx 配置无效不强制 reload，API 失败不擅自重启后端。
