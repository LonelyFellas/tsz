# 智能词库第二阶段测试矩阵

| ID     | 层级                 | 场景                       | 输入/前置                                                         | 预期                                                                                | 优先级 |
| ------ | -------------------- | -------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------ |
| P2-01  | Handler/集成         | matched phrase 全链路      | active dictionary phrase + catalog                                | detect/create/forms/meanings/publish 均返回 kind=phrase 的 V2 聚合                  | P0     |
| P2-02  | Handler/集成         | not_found phrase 创建      | 多词输入、无 dictionary term                                      | 创建空 forms 的 phrase 草稿；单词 not_found 仍 422                                  | P0     |
| P2-03  | Handler              | create 幂等重放/冲突       | 相同 key 同/不同 body                                             | 同 body 返回首次资源；不同 body 409 idempotency_conflict                            | P0     |
| P2-04  | Handler/DB           | 归档已发布词条             | 无 active inbound refs                                            | 200 archived；revision/current publication/history数量不变；列表/related/stats 隐藏 | P0     |
| P2-05  | Handler/DB           | 恢复已发布词条             | 已归档                                                            | 200 published；稳定 ID/publication/history恢复可见                                  | P0     |
| P2-06  | Handler/DB           | 归档未发布草稿             | draft                                                             | 200 archived；无物理删除；恢复后仍 draft                                            | P0     |
| P2-07  | Handler              | 生命周期幂等重放/冲突      | 相同 key 同/不同 target/body                                      | 重放首次响应；复用 key 409                                                          | P0     |
| P2-08  | Handler              | revision 并发              | stale base_revision                                               | 409 revision_conflict + current_revision                                            | P0     |
| P2-09  | Handler/DB           | 当前入站引用阻止归档       | active source current publication 引用 target current publication | 409 entry_has_inbound_publication_refs，引用位置稳定                                | P0     |
| P2-10  | Handler/DB           | 历史/归档来源引用不阻止    | 引用仅在 source 历史 publication 或 source 已归档                 | target 可归档；历史 ref 行保留                                                      | P0     |
| P2-10A | Handler/DB           | 恢复重新激活出站引用       | source 已归档且 target 仍归档/无当前词义                          | 单条恢复 409；将依赖目标纳入同一批恢复则原子成功                                    | P0     |
| P2-11  | Handler/DB           | 归档目标不可再被新发布引用 | target archived                                                   | source save/validate/publish 报稳定 target unavailable                              | P0     |
| P2-12  | Handler              | 批量归档原子性             | 两条中一条 stale/被引用                                           | 全批回滚，返回 409                                                                  | P0     |
| P2-13  | Handler              | 批量输入边界               | 空、重复、101 项                                                  | 422；无副作用                                                                       | P0     |
| P2-14  | Handler              | 生命周期 header/path/JSON  | 缺失/非 UUID key、错误 UUID path、坏 JSON                         | 稳定 400 Problem Details                                                            | P0     |
| P2-15  | Handler              | 归档写保护                 | archived 后 save/validate/publish                                 | 409 entry_archived                                                                  | P0     |
| P2-16  | Unit/Handler         | 方言 form evidence         | color↔colour evidence                                             | 只返回 evidence-backed counterpart 与 provider 元数据                               | P0     |
| P2-17  | Unit/Handler         | 方言 RichText offset       | 替换导致码点变化、范围/暂停标注                                   | 文本和边界正确；canonical 校验通过                                                  | P0     |
| P2-18  | Unit/Handler         | 音素/内部边界保护          | phoneme 覆盖 token 或 pause 位于 token 内                         | 跳过该 token，不伪造发音标注                                                        | P0     |
| P2-19  | Handler              | 方言语义非法               | source=target、空 items、重复 client_id、过长、非法 RichText      | 422 validation_failed                                                               | P0     |
| P2-20  | Handler              | 无方言 evidence            | 合法未知文本                                                      | 200、suggestions 少于输入/为空，不伪造结果                                          | P0     |
| P2-21  | Contract             | 新路径与 header            | api-client 方法调用                                               | 精确命中 OpenAPI path，幂等键只在 header                                            | P0     |
| P2-22  | Frontend integration | phrase 入口                | real capability                                                   | 列表筛选与创建短语进入 V2 wizard，不打开 legacy modal                               | P0     |
| P2-23  | Frontend integration | 单条归档双击               | 连续点击确认/按钮 pending                                         | 只发一次，成功后失效列表并清选择                                                    | P0     |
| P2-24  | Frontend integration | 批量归档双击/失败          | 多选，pending 或 409                                              | 只发一次；失败保留选择并展示错误                                                    | P0     |
| P2-25  | Frontend integration | 归档筛选与恢复             | status=archived                                                   | 显示恢复操作，不允许编辑/发布                                                       | P0     |
| P2-26  | Frontend integration | 方言建议失败重试           | 首次网络失败、再次成功                                            | 原文保留、解除锁定、可重试并写入建议                                                | P0     |
| P2-27  | Contract             | Problem Details 精简解析   | 400/409/422 新 code/meta                                          | HttpError 保留 code、current_revision 与 reference locations                        | P1     |
| P2-28  | Full regression      | 第一阶段单词流程           | 现有全部 fixtures                                                 | 覆盖率门槛不降，单词创建/编辑/发布/引用测试全绿                                     | P0     |
| P2-29  | Manual/UI            | 向导响应式摘要             | Step 1–4，1200/1440px                                             | Step 2–4 顶部两行摘要一致且无左栏；Step 1 无摘要但主内容同宽                        | P1     |
