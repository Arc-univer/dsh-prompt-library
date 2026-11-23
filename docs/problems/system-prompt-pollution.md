# 问题记录

## ISSUE-001 人格注入污染所有会话的系统提示词

**优先级**: High
**来源**: User

### 1. 现象
用户反馈：安装插件后，**每一次对话**的系统提示词中都带有一段插件文案（"你是「词库助手」，一款帮助用户收集、整理、润色和复用提示词……"），助手身份被插件劫持，严重影响正常使用。用户最初怀疑是「AI 润色」功能的提示词泄漏。

### 2. 细节
- **复现步骤**:
  1. 安装插件并启动 `dsh web`；
  2. 打开任意会话（任意工作区），查看系统提示词组装结果；
  3. 每个会话的 system prompt 均以「词库助手」人格开头（order 0）。
- **环境/上下文**: 插件 `src/index.ts` 的 `agent/created` 处理中注册 `deployment:persona` section（order 0），正文为 `personaSectionText()` → `soulSystemSync()` 读取的默认人格模板。

### 3. 根因
- **直接原因**：host 入口在每个 agent 创建时**无条件**注册同名 section `deployment:persona`（order 0），scoped layer 同名 section 会 **shadow 宿主的默认人格槽位**，把插件默认人格（`src/host/character.ts` 的 `DEFAULT_PERSONA_SOUL`）注入所有会话。
- **深层原因**：人格注入设计为"默认即注入"而非"显式绑定才注入"。人格功能的唯一价值是按会话塑造身份，但未绑定任何人格的会话也应保持宿主原生身份——原实现把"默认值"和"注入行为"耦合在一起。
- **排除项**：「AI 润色」的提示词（"你是一名专业的提示词润色助手……"）仅作为一次性 `llm.stream()` 调用的 `system` 参数存在，插件内无任何持久化路径（不写库、不注册 section），**经确认与本问题无关**，该功能予以保留。

### 4. 解决方案
- **短期修复（已实施）**：按用户决定**整体移除人格功能**：
  - 删除人格注入（`deployment:persona` section）、默认人格模板与 SOUL 存储（`character.ts`、`persona-service.ts`）；
  - 删除人格管理 UI 及其 API 路由（`/personas*`、`/session-prompts/session/persona`、会话解析诊断路由、`/ai/draft` 的 soul 分支）；
  - AI 调用不再附带人格约束（移除 `withSoulSystem`）；会话系统提示词恢复宿主原生身份，仅保留用户显式绑定的技能注入。
- **长期优化**：人格相关数据表（`personas`、`persona_scope_bindings`、`session_scope_bindings.personaId` 列）保留不动（惰性残留，不影响功能）；若未来需要类似能力，应改为"显式绑定才注入"，且不得占用宿主 `deployment:persona` 槽位。

### 5. 经验教训
- **占用宿主核心槽位（order 0 身份段）是高危操作**：任何"默认值 + 全局注入"的组合都会把插件文案强加给所有用户场景；注入类功能必须默认关闭、显式开启。
- **顺带的死代码清理**：本次还删除了全仓库无引用的 `PersonaManagerModal`、`PromptInjectPanel`、`HarnessSkillPanel`、`SubPanelModal`、`enrichPromptProfessional`（历史界面改版后未回收的残留）。教训：界面改版时应同步清理被替换组件及其 API/i18n 键，避免"僵尸代码"长期残留。
- **排查顺序**：先确认用户实际看到的污染文本（本例为默认人格模板原文），再沿"谁写入系统提示词"的完整链路定位，避免凭功能名称（"润色"）先入为主怀疑无关模块。
