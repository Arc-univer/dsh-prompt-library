<div align="center">

🇨🇳 **中文** | [🌐 English](./README_en.md)

</div>

> **Fork 说明**
>
> 本仓库是 [master1Sun/dsh-prompt-library](https://github.com/master1Sun/dsh-prompt-library) 的 fork。
>
> **本 fork 相对上游的改动：**
> - **彻底移除人格（SOUL / Persona）功能**：上游插件会把默认「词库助手」人格注入**每一个会话**的系统提示词（并顶掉宿主的身份设定），导致所有对话都被插件文案污染；现已移除人格注入、存储、绑定与管理 UI，会话恢复宿主原生身份。
> - **删除无引用的死代码**：`PersonaManagerModal`、`PromptInjectPanel`、`HarnessSkillPanel`、`SubPanelModal`、`enrichPromptProfessional`。
> - AI 优化（润色）等其余 AI 能力保持不变；系统提示词仅保留技能注入（由用户显式绑定）。

# dsh-prompt-library

DSH（DeepSeek Harness）词库插件：在聊天栏提供**提示词管理**与 **AI 优化**能力，帮你沉淀、复用和持续优化提示词。

## 主要功能

### 词库

- 管理常用提示词（标题 + 正文 + 标签），支持搜索、排序、标签分组、使用次数统计
- **按项目归属**：提示词可设为全局或项目专属；“当前项目”同时显示全局与当前项目内容，`#` 快速选择和上下文推荐不会混入其他项目的专属提示词
- **手动拖拽排序**：切换到手动排序后可拖动提示词调整顺序并持久保存；关闭智能排序前会二次提醒，关闭后面板内保留一键恢复入口
- 数据管理支持按项目筛选、按项目分组和重新关联项目路径；JSON / CSV 导入导出保留项目归属与手动顺序
- 入口一：侧边栏设置按钮上方的「词库」菜单按钮，打开居中面板，左侧导航含数据管理、导入导出、标签、回收站
- 入口二：聊天输入框旁的词库按钮，一键打开最近/常用提示词列表
- **插入**：追加到输入框已有内容之后
- **覆盖**：用该提示词直接替换整段草稿
- **插入并发送**：填写模板变量后一键直接发出（含 `{{}}` 时走变量弹窗），非 `#` 场景下仅在草稿为空时可用，避免误带已有内容；`#` 触发时会过滤触发词、保留其前正文一并发送
- 输入 `#` 快速触发选择，实时筛选
- 输入框为空时按最近聊天上下文推荐提示词，点击即插入草稿
- 底部实时显示标签总数与提示词总数

### 生成 Skill

- 在「词库菜单 → 技能管理」的技能导入弹窗中勾选提示词后批量生成 DSH 技能（Skill）
- 由 AI 根据提示词内容生成英文技能名与描述，技能写盘到 `~/.dsh/skills/<name>/SKILL.md`，聊天框输入 `/技能名` 即可触发，模型也会按描述自动匹配
- 生成时自动建立提示词与技能的关联；同一提示词再次生成会**覆盖原技能目录**，不会无限新增
- 若正文含 `{{变量}}`，生成时会标注「占位符自动补全」能力——使用该技能时 AI 依据当前语义场景自动推断并补全，无需手动填值

### AI 优化

- 聊天栏「AI 优化」按钮一键优化文字，完成后一键替换回输入框

### 设置

在 DSH 设置 → 词库调整：AI 模型选择、面板大小、词库菜单按钮显隐、聊天框按钮显隐/仅图标、`#` 触发、上下文推荐、选中添加提示词、提示词最大存储数量等，修改即时生效。

## 数据存储

词库采用 **SQLite**（`node:sqlite`），其余配置与日志统一存放在 `~/.dsh/prompt-library/`：

```
~/.dsh/prompt-library/
├── db/prompts.db      # 词库 + 技能绑定（SQLite）/ prompt library & bindings (SQLite)
├── settings.json      # 插件设置（prompt-library 命名空间）
└── log/
    └── ai-YYYY-MM-DD.log   # AI 调用诊断日志（按日期分文件）
```

## Installation

```bash
dsh plugin --profile web add @sunjuntao/dsh-prompt-library
```

### GitHub (including DSH Desktop)

In DSH Desktop, choose GitHub installation and enter your fork's repository URL. The repository must already contain the compiled `lib/` files; GitHub installation does not build `src/` automatically.

To install a specific tag through the CLI:

```bash
dsh plugin add github:<owner>/<repository>#v1.1.0
```

Replace the owner, repository and tag with your own. See the distribution steps below before installing your modified source.

## Usage

Start `dsh web`, click the "Library" menu button above the settings button in the sidebar to reach every feature panel; or use the prompt-library button beside the chat input, type `#` for the quick picker, and click "AI Polish" to polish your input with one click.

## Development / Build

```bash
npm install
npm run deploy   # type check + build + sync to DSH (restart dsh web to take effect)
```

## Screenshots

![1789779289907](images/README/1789779289907.png)![1789779291686](images/README/1789779291686.png)![1789779294779](images/README/1789779294779.png)

## 作者

**master1Sun**

- GitHub: [https://github.com/master1Sun/dsh-prompt-library](https://github.com/master1Sun/dsh-prompt-library)
