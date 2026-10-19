# 临时 OSS 资源清理

已授权测试的清理直接执行，不逐次询问或通知。正常结果合并进最终验收；仅实际残留、权限失败、归属不明或正常数据风险单独报告。

## 固定范围与一次配置

测试 bucket 固定为 `tshb-test-assets`，根前缀固定为 `temporary-tests/`。每批使用独占的 `run-id`，建议 `YYYYMMDD-任务名-随机标识`，只允许 8–80 位小写字母、数字、下划线及连字符：

```text
temporary-tests/<run-id>/audio/...
temporary-tests/<run-id>/images/...
```

OSS 前缀无需先创建目录对象。不要把正常的 `speech/`、`audio/`、`avatars/` 改作测试目录；现有接口若固定写入正常前缀，先实现隔离路由再开始测试。该脚本不会修改线上 API、存储配置、bucket 策略或生命周期。

将 [受限 RAM 策略](../../../../scripts/oss-test-cleanup-policy.json) 一次授予专用测试身份。对象写入、读取及版本删除只限 `temporary-tests/*`，列举权限用 `oss:Prefix` 限制到同一根；不授予 bucket 管理或正常资源删除权限。授权机制见 [OSS 官方策略示例](https://www.alibabacloud.com/help/en/oss/user-guide/block-public-access)。

在 Git 之外配置 `~/.config/tsz/test-oss.env`，权限设为 `0600`，包含以下环境变量；不要把凭据放入命令行、回执或仓库：

- `OSS_ENDPOINT`：对应区域的阿里云 HTTPS endpoint。
- `OSS_REGION`：对应区域，如 `cn-heyuan`。
- `OSS_BUCKET=tshb-test-assets`。
- `OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`，可配 `OSS_SESSION_TOKEN` 使用短期凭据。

脚本内联固定官方 SDK `oss2==2.19.1`，通过 `uv run` 自动安装并复用本机缓存；也可在专用虚拟环境安装同版本后用 `python3` 运行。SDK 使用 V4 签名和环境凭据，见 [官方配置说明](https://www.alibabacloud.com/help/en/oss/developer-reference/python-sdk-v1/)。

## 自动测试流程

先记录批次、将使用的对象前缀和相关数据库/缓存 ID。创建任何测试资源之前运行：

```bash
uv run --env-file ~/.config/tsz/test-oss.env scripts/cleanup-test-oss.py \
  --run-id 20261017-ups-019a1122 --check-permissions
```

探测只列举空批次，并对随机、并不存在的 `null` 版本执行 GET/DELETE；GET 指定版本才能验证 `oss:GetObjectVersion`，不能以仅需普通读取权限的 HEAD 替代。不会上传文件或创建删除标记。已有资源说明这是恢复中的批次，先核实归属、恢复原任务或清理，不把它当新批次覆盖。探测失败时不继续创建资源，也不反复向用户申请单个对象权限。

无参数开关时只预演，列出精确版本并写脱敏 JSON 回执：

```bash
uv run --env-file ~/.config/tsz/test-oss.env scripts/cleanup-test-oss.py \
  --run-id 20261017-ups-019a1122
```

验证结束（包括失败或中断恢复）后先停止本批次写入，再自动清理，无交互确认：

```bash
uv run --env-file ~/.config/tsz/test-oss.env scripts/cleanup-test-oss.py \
  --run-id 20261017-ups-019a1122 --apply
```

脚本先完整分页列举并验证所有 key 和版本 ID，再并发删除精确版本，覆盖语音、图片、历史版本和删除标记。禁止省略 `versionId`；普通删除会在版本化 bucket 留下历史数据，见 [OSS 永久删除说明](https://www.alibabacloud.com/help/en/oss/developer-reference/delete-objects-1)。

脚本独立重新列举全部分页，只有无错误且剩余为空时返回 `clean`/退出码 0；403、部分删除、并发新写入或复查失败均非零退出。正常的重复执行是幂等的。回执默认在 `test-results/oss-cleanup/<run-id>.json`，权限 `0600`；可用 `--receipt` 改路径。每次删除前已写计划，期间持续记录进度，失败后以重新列举结果为准，不按时间或文件扩展名猜归属。

对象清理成功后，再按精确 ID 删除该批次专属的数据库登记、试听缓存、上传暂存等，并复查正常数据仍在。脚本只处理 OSS，不自动删除数据库或 Redis 记录；对象删除失败时保留必要登记，方便继续定向清理。

正常目录里的历史测试遗留必须依据已有精确 key/版本清单一次性处理，不能给本脚本增加普通前缀、任意 manifest 或“清整个 bucket”的绕过选项。权限不足只报告实际残留；不会假称已清理，也不创建定时回收来代替本次彻底删除。

## 本地验证

```bash
python3 -B -m unittest discover -s scripts -p 'test_cleanup_test_oss.py' -v
uv run scripts/cleanup-test-oss.py --help
```

测试使用内存 OSS 替身，覆盖范围隔离、完整分页预检、历史版本与删除标记、403 残留、并发写入、权限探测和回执失败时禁止删除。真实云权限和实际永久删除需在专用前缀完成验收，不能用替身通过代替。

## 真实页面的批次接入

已支持的后端版本可通过白名单账号和 `X-TSZ-Test-Run` 将新资源写入固定测试前缀。Web/Admin 专用标签页用 `?tsz_test_run=<run-id>` 开启，`?tsz_test_run=off` 退出；在操作前确认线上实际后端已部署该能力，旧后端会忽略未知请求头。先权限预检，再创建资源，最后在 finally/trap 中执行清理；不能仅设置 URL 参数就把清理视为完成。配置、覆盖端点和读取/回滚约束见 [临时资源接入](../../../../docs/features/test-resource-isolation/README.md)。
