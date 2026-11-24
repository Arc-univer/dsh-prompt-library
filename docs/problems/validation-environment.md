# 问题记录

## ISSUE-002 Auto 权限模式阻塞类型检查与构建验证

**优先级**: Medium
**来源**: System

### 1. 现象
项目提示词与拖拽排序功能完成源码修改后，`npm run typecheck`、直接调用 TypeScript 编译器及编辑器诊断均无法执行。工具返回：`Auto mode is unavailable: its safety check does not run for this session`，命令未实际运行。

### 2. 细节
- **复现步骤**:
  1. 在当前 Claude Code VSCode 会话中执行 `npm run typecheck`；
  2. Auto 模式的安全检查不可用，Bash 调用在命令启动前被拒绝。
- **环境/上下文**: Windows 11；Claude Code VSCode 扩展；Auto 权限模式。只读 Git 命令可执行，但不能据此推断类型检查或构建通过。

### 3. 根因
当前会话的 Auto 模式无法运行命令安全校验，因此需要该校验的工具被统一阻断；这与用户是否授予单项 fetch 或文件权限无关。

### 4. 解决方案
- **短期修复**: 当前仅完成源码级复核与 `git diff --check`。切换到可执行命令的权限模式后，运行 `npm run typecheck`、`npm run build`，再进行 DSH 交互回归。
- **长期优化**: 将类型检查、构建及核心迁移/排序测试纳入可重复执行的自动化验证，交付时明确区分静态审查和实际运行结果。

### 5. 经验教训
工具权限与 Auto 模式安全校验是不同环节。验证受阻后不应重复调用同类命令，也不能将“未运行”表述为“已通过”。

## ISSUE-006 Desktop 环境缺少 DSH 类型包导致 typecheck 失败

**优先级**: Medium
**来源**: User

### 1. 现象
用户在 DSH Desktop 环境执行 `npm run typecheck`，出现 7 个 TypeScript 错误：无法解析 `dsh-client-runtime/client`、`dsh-llm`、`dsh-host-webserver`，并因缺少类型产生两个隐式 `any` 错误。

### 2. 细节
- **复现步骤**:
  1. 在未安装完整 DSH Web profile 依赖的项目环境运行 `npm run typecheck`；
  2. TypeScript 无法找到宿主运行时包的声明文件。
- **环境/上下文**: Windows；DSH Desktop；本机未发现脚本预期的 `~/.dsh/profiles/node_modules/@deepseek-ai`。报错来自 `tsc --noEmit`，尚未进入 esbuild 构建。

### 3. 根因
类型检查需要宿主包声明，而当前 `node_modules` 只有部分 `@deepseek-ai` 包。现有 `link-dsh-deps` 脚本写死 Web profile 的共享依赖目录，未覆盖 Desktop 的实际安装布局；这不是 Desktop 无法构建插件。

### 4. 解决方案
- **短期修复**: `npm run build` 将相关宿主包全部视为 external，可在没有这些类型包时执行；构建成功不等于类型检查通过。需要类型检查时，应从 Desktop 安装目录提供对应声明包，或配置具备这些依赖的 CI 环境。
- **长期优化**: 让依赖链接脚本支持显式配置 Desktop 依赖目录，并在发布文档中分别说明类型检查与打包的环境要求。

### 5. 经验教训
宿主运行时 external 依赖不等于本地编译依赖。排查时应区分 TypeScript 类型解析和 esbuild 打包，不因缺少 Web profile 就判定 Desktop 不能本地构建。
