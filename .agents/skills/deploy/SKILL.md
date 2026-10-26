---
name: deploy
description: 将已合入 GitHub main 且精确 CI 成功的前端 Linux 发布包部署到 tshb-test；不在部署端重新构建，保留原生切换、来源与验收门禁。
---

# 前端部署到 tshb-test

通用授权与工作区遵循 [AGENTS.md](../../../AGENTS.md)。明确部署请求才执行远端发布；实现、构建和阅读本技能不授予服务器写入权限。

## 必须保留的约束

- 唯一入口为 [deploy-web.sh](../../../deploy/deploy-web.sh) 与 [deploy-admin.sh](../../../deploy/deploy-admin.sh)。只发布当前 GitHub main 的精确 SHA，最新 `CI` run/attempt 必须 completed/success。失败、无记录、来源未知或变化均停止。
- 发布消费 CI 的 Linux/amd64 制品，不运行本地 pnpm install/build。服务器不拉源码、不编译，不运行旧根 deploy.sh 或旧 Docker Compose。
- 入口从精确 Git 对象导出受信工具；下载包只作为数据安全解包，不导入其中的脚本。工作区脏文件和本地环境文件不进入发布包。
- 原生 candidate manifest、共享远端锁、事务记录、原子切换、静态资源保留、smoke 和来源验证继续生效。不修改后端或数据库。

## 1. 固定候选和发布包

需要配套后端时先按 [配套发布清单](../contract-sync/references/paired-release.md)确认版本组合和顺序。单组件只发目标组件，成功且身份未变的组件不重复发布。

fetch 后记录当前 main SHA，确认改动已合入。入口查询该 SHA 最新 `CI` 工作流；正在运行按 [CI 等待与续跑](references/ci-wait.md)处理，同范围授权沿用。每个组件执行前重新核对，main 前进不自动换包或追新版本。

CI `quality` 在 Ubuntu 22.04 构建并验证 Web standalone/Sharp 与 Admin test-mode 制品。包名为 `tsz-<web|admin>-<sha>-attempt-<producer-attempt>`，必须唯一、未过期、来自精确 run。仅重跑失败测试时可复用该 run 中最近的成功构建包，生产 attempt 不得晚于最终 CI attempt；两者分别记录，包参数仍须匹配。包包含 `release.tar.gz`、原生 `candidate.json`、`release.json`；回执绑定 SHA/tree、run/attempt、构建参数、Node/平台、摘要与验证结果。

部署端核对来源、构建参数、包和候选摘要；解包后做一次完整制品复算，上传前复用该结果，远端传输后独立复算。gzip 只解压一遍，未压缩 TAR 上完成路径与链接检查；校验完成后发布目录设为 0755，临时父目录与下载 ZIP 保持私有。缺包或校验失败即停止，不回退到本地构建，不改 manifest 为旧包换身份。首次上线此流程需先让新 CI 在 main 成功产生包；旧提交没有包时不能强行发布。

## 2. 参数与顺序

先执行 `./deploy/deploy-web.sh`，成功后执行 `./deploy/deploy-admin.sh`；用户只选一个组件则只运行该入口。共享 nginx 和远端发布锁继续串行。

可传入 `DEPLOY_EXPECTED_SHA`、`DEPLOY_EXPECTED_CI_RUN_ID`、`DEPLOY_EXPECTED_CI_RUN_ATTEMPT` 绑定已批准的精确元组；SHA 必须是首次读取的当前 main，CI 两个参数须成对匹配最新成功 run/attempt。不传时自动选择并固定当前元组。

Web 默认 `NEXT_PUBLIC_SITE_URL=https://test.tianshengzhi.com`。Admin 默认 test mode、真实词库/词性/TTS API，四个兼容开关默认 true：`DEPLOY_VOICE_EDITOR`、`DEPLOY_AZURE_PRONUNCIATION_INPUTS`、`DEPLOY_FORM_SPELLING_REGULARITY`、`DEPLOY_SENTENCE_FORMATTING`，只接受 true/false。

参数是**期望包设置**，不是部署时重编译。需要 false 兼容包时，在 main 手动触发 CI，设置相应同名语义的 boolean inputs；完成后部署端传入匹配的 `DEPLOY_*`。输入与包不匹配时在上传前停止。Web 公开站点 URL 改动应先正式调整 CI 构建设置。

旧后端不接受变体 `is_regular` 时先发布 `DEPLOY_FORM_SPELLING_REGULARITY=false` 的包，确认录入人员已保存并刷新/关闭旧标签页后再切 API；后端通过后重新生成并发布 true 包。其他接口不兼容按配套清单处理，不用快速连发替代中间版本验证。

制品发现最多 60 秒、下载最多 300 秒、远端事务调用最多 480 秒，长调用每 30 秒报告状态；rsync 有 180 秒无 IO 超时。断线或超时不代表远端未执行，按原事务核对现场，不盲目重发。

上传前和上传后、事务开始前复核 exact-main 与最新 CI run/attempt。查询与远端锁不是跨系统原子事务；上传后失败可能留下独立暂存，不能报告零远端写入。不删未完成事务记录继续发。

## 3. 验收

Web 在 CI 先验证裁剪包启动与 Sharp，远端继续备用实例验活、HTTPS/版本/API 检查；Admin 继续原子切换及 HTTPS 验收。Node 本地/服务器版本仍按精确提交核对。当前与回退 release 始终保留，旧静态资源保留 30 天。

包内 `version.json` 是包版本的唯一来源，远端在候选校验后读取；每次发布仍使用独立 UUID 事务目录，不生成重复的 `package-id` 文件。

按 [验收清单](references/verification.md)复用已输出的同状态证据，仅补缺项。`release.json` 保存到组件 manifests 下的 `<release-id>.ci.json`，accepted manifest 仍由远端验收后生成。只在 smoke、manifest 复算和清理均通过后报告成功。

汇报组件实际 SHA、CI run/attempt、制品 ID/摘要、构建参数、HTTP/服务及 manifest 结果、阶段耗时和 `local build=0`。失败说明已完成组件、暂存及回退状态。不得强制 nginx reload、重启后端、补造 manifest 或绕过门禁。
