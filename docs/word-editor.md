# 词条编辑指南

本页汇总仍有效的前端规则，不再为已经落地的每个编辑器改动维护一组需求、设计和测试矩阵。接口结构由后端 [OpenAPI](https://github.com/LonelyFellas/tsz-rust/blob/main/docs/openapi.json)维护，业务模型见 [V3 模型](https://github.com/LonelyFellas/tsz-rust/blob/main/docs/word-data-model.md)。

## 编辑与完成情况

- 只维护 V3 创建和编辑流程，不恢复已移除的 V1/V2 向导。主入口为 `apps/admin/src/features/dictionary/word-creation-v3/V3WordCreationWizard.tsx`。
- 完成情况基于有效内容，不把空数组节点、空释义容器或一次生成请求成功当作已经完成；相关计算在 `posCompletion.ts`，步骤访问规则在 `stepAccess.ts`。
- 词频是选填项，不因缺少可信词频而阻断完成与发布，也不能为了通过校验编造数据。
- 管理员方言偏好是账号设置，不等同于词条本身的地区拼写事实；不要重新引入旧第 3 步的英美内容双份编辑流程。
- 表单状态、草稿内容与服务器修订号共同决定能否安全保存。切页、刷新、恢复草稿不能静默丢弃未保存内容，也不能将过期草稿覆盖新版本。
- 跨步骤保存先保存 forms，再用响应中的新修订号保存 meanings；后者失败时保留已保存的 forms 与本地 meanings，允许重试，不宣称两次请求具备数据库级原子性。

## 词形与词义

- 具体词形与词形组成员是不同概念；稳定节点 ID 不能因排序、切换展示或保存而随意重建。
- 通用组与专用组按当前 `scope` 和绑定关系处理；专用组允许多词义绑定，不沿用早期只绑定一个词义的设计。
- 细分词性不再限制为五个基础词性的子项。目录维护与词条引用校验交给当前 API，不能从旧种子清单恢复此限制。
- 关联候选展示顺序遵循目标词条配置，不按全局词形类型顺序重新排序。
- 同一源词义下，相同目标词条的派生词关系可合并为一行多选词义；wire 仍是一条目标词义对应一条 relation，并保留既有 relation ID。分组逻辑见 `relationGroups.ts`。

## 引用与发布

- 候选搜索仅返回当前发布内容，不能再发送 `include_drafts`，包括 `false`。现有草稿引用的回显与新候选搜索是两回事，兼容边界见[对接指南](https://github.com/LonelyFellas/tsz-rust/blob/main/docs/frontend-integration.md)。
- 候选分页需使用服务端游标，不把首批结果当成全量，也不在前端硬截断结果集。
- 被引用节点的编辑或删除受后端引用保护约束；前端不能靠换 UUID 或仅隐藏控件绕过校验。
- 保存、校验、发布、历史版本回退、归档和永久删除是不同操作，各自遵守权限、修订号和能力响应，不能只改变页面状态模拟成功。
- 例句正文、译文和句内关联由共享例句能力维护；词条选择例句不等于复制或发布该例句。

## 语音与音频

- 复用 `@tsz/voice-editor`，字典音标、实际发音、Azure IPA/UPS 的边界见后端[IPA/UPS 指南](https://github.com/LonelyFellas/tsz-rust/blob/main/docs/ipa-ups-integration.md)；不重新加入 SAPI 或旧来源选择链。
- 临时 TTS 试听与持久化音频资产不同。上传必须完成“申请许可 → 直传 → 确认”，对象上传成功不等于业务已关联。
- 音色语速与勾选状态分别处理，试听、调速不应意外改变业务选择。请求失败或部分完成时保留人工输入。
- 上传与生命周期规则见后端[对象存储](https://github.com/LonelyFellas/tsz-rust/blob/main/docs/object-storage-design.md)和[音频资产运维](https://github.com/LonelyFellas/tsz-rust/blob/main/ops/audio-asset-lifecycle/README.md)。

## 验证

相关组件和模型已有就近测试，新增改动先运行对应回归，再按项目规范进行真实浏览器验收。测试要覆盖保存重开、并发修订、引用保护和失败后输入保留；旧报告、mock 通过或历史截图都不能替代本次验收。
