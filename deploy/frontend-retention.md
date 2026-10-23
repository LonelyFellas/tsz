# 前端发布资源每日清理

`tsz-frontend-retention.timer` 每天按服务器本地时区 04:17 触发，增加最多 5 分钟随机延迟。`Persistent=true` 在关机错过计划后补触发一次。普通前端发布仍按既有流程清理该组件；本任务补上长期不发布时的清理。

## 保留范围

- 固定保留 current、previous，以及 `history/*.json` 中 `usedAt` 距今不足 30 天的版本；30 天按最后使用/退役记录计算，不看构建时间或文件 mtime。
- 静态资源只删除已到期版本记录中的文件，且不能被任一保留版本引用；共享资源保留。
- 未知文件、无记录的版本、发布暂存、manifest、日志、业务数据和运维备份不清理。无记录版本或保留记录异常时整次停止，需人工核实。
- 运行前取得 `/opt/tsz-frontend-deploy.lock`，与发布使用同一把锁。锁被占用时本次正常跳过；下次计划或发布后再清理。
- 存在 `/opt/tsz-frontend-transaction` 时失败退出，不删除事务记录或自动恢复发布。
- 完整预检 Web/Admin 的目录、current/previous、history 与保留静态文件摘要后才开始删除。任一端预检失败，两端都不删除。
- 删除顺序为到期独占静态资源、到期制品、最后 history。中断后保留记录可供重试，不把部分删除当成全部成功。两端删除不是跨目录原子事务；执行中的 I/O 错误会停止并报失败。

服务仅允许写 `/opt/tsz-releases` 与发布锁，最长运行 15 分钟。成功在 journal 输出两端删除的版本数、静态文件数；失败由 systemd 记录。它不提供容量告警，也不缩短保留期，不能代替磁盘扩容。

## 安装与更新（单独授权后）

本 PR 不自动安装或启用服务器任务。安装前遵守项目精确 main/CI 门禁：fetch，确认 GitHub 当前 main 的最新 `CI` run/attempt 为 `completed/success`，记录完整 SHA、run ID、attempt，并在远端写入和安装前重新核对。

从该提交 `git archive` 导出可信部署目录，将以下文件按目录结构上传至一个新建的、root 所有的 `/opt/tsz-retention-install.XXXXXX/deploy/`：

- `releases.mjs`、`frontend-retention.mjs`
- `prune-frontend.sh`、`install-frontend-retention.sh`
- `systemd/tsz-frontend-retention.service`、`systemd/tsz-frontend-retention.timer`

不要使用带未提交改动的工作目录直接安装，不上传 `.env`。安装前确认前端 current/history 已由正常发布初始化，磁盘有足够余量，且没有未完成发布。

在实际暂存目录执行（以下路径需替换为本次生成的目录）：

```bash
sudo bash /opt/tsz-retention-install.XXXXXX/deploy/install-frontend-retention.sh
```

安装程序也持有发布锁，先检查语法、systemd 单元和两端清理计划；不执行删除。工具安装在 `/opt/tsz-deploy-tools/frontend-retention/`，unit 安装在 `/etc/systemd/system/`。更新时替换整套模块；普通命令失败会恢复原工具、单元及 timer 启用/运行状态，恢复失败则报告并保留 `.frontend-retention.*` 备份。断电/SIGKILL 不保证自动恢复；安装前必须检查并处理遗留安装备份，不直接删除。

首次启用 `Persistent` timer 可能补触发；若安装还持有发布锁，清理会正常跳过。验收可在安装退出后显式运行一次服务：

```bash
sudo systemctl start tsz-frontend-retention.service
```

```bash
systemctl list-timers --all tsz-frontend-retention.timer
```

```bash
journalctl -u tsz-frontend-retention.service --since today --no-pager
```

复查 current/previous、两站 HTTPS、可用磁盘与删除计数，并记录 SHA/CI、实际安装路径及回滚位置。安装及验收成功后只清理本次确切的上传暂存目录，不删除其他会话的暂存或备份。

## 停用

```bash
sudo systemctl disable --now tsz-frontend-retention.timer
```

这会停止后续调度，不撤销已发生的过期资源删除，也不停止已经运行的 service。需要中断当前清理时单独 `systemctl stop tsz-frontend-retention.service`，然后检查 journal 和保留记录；不要同时手工操作发布目录。

## 验证

```bash
pnpm test:deploy-provenance
```

新测试使用临时目录覆盖保留边界、跨版本共享文件、坏记录、两端预检、事务拦截、锁竞争和安装失败恢复，不触碰 `/opt` 或服务器。Linux CI 另使用真实 `flock` 验证互斥，并执行 `systemd-analyze verify`。macOS 无 systemd，真实锁测试明确跳过，不将 mock 结果当成服务已安装运行。
