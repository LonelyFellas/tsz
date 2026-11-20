# 前端发布组合状态机

## 目标

让 Web、Admin 和当前线上 API 合约组成一个可恢复的发布组合。发布过程记录候选版本、依赖检查、合约验证、组件发布和最终接受状态，组件发布器继续负责单组件原子切换与回滚。

## 状态

```text
candidate
  -> dependencies-ready
  -> contract-compatible
  -> web-deploying
  -> web-accepted
  -> admin-deploying
  -> accepted
```

任意可执行阶段都可以进入 `failed`。候选在来源门禁发现主线或 CI 身份已过期时进入 `superseded`。

## 发布组合

远端 `/opt/tsz-deploy-manifests/release-composition.json` 保存当前组合，包含候选前端 SHA、CI 身份、实际 API SHA、Web/Admin 已接受版本和组合状态。文件使用临时文件加原子 rename 写入，并在跨仓锁内生成。

## 恢复

组件脚本仍按现有接受 manifest 判断是否需要发布。控制器重跑时，已接受组件可以被识别为 unchanged，后续组件继续推进。状态文件作为 GitHub Actions 制品保留，远端组合 manifest 作为服务器事实记录。

## 验收

- 状态转移拒绝跳过门禁或回到终态。
- 当前 API 合约通过后才开始组件发布。
- Web 成功后 Admin 失败会保留 `web-accepted` 组合状态。
- 两个组件成功且 API 合约已验证后才写入 `accepted` 组合。
- 远端组合 manifest 可独立核对组件 SHA、CI run、制品摘要和 API SHA。
