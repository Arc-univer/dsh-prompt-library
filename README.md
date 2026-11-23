<div align="center">

[🇨🇳 中文](./README.md) | 🌐 **English**

</div>

> **Fork Notice**
>
> This repository is a fork of [master1Sun/dsh-prompt-library](https://github.com/master1Sun/dsh-prompt-library).
>
> **Changes in this fork:**
> - **Persona (SOUL) feature removed entirely**: the upstream plugin injected its default "prompt library assistant" persona into **every** conversation's system prompt (shadowing the host identity slot), polluting all chats. Persona injection, storage, bindings and management UI have been removed; conversations keep the host's native identity again.
> - **Dead code with no references removed**: `PersonaManagerModal`, `PromptInjectPanel`, `HarnessSkillPanel`, `SubPanelModal`, `enrichPromptProfessional`.
> - AI polish and all other AI capabilities are unchanged; the only system-prompt injection left is skill injection (explicitly bound by the user).

# dsh-prompt-library

DSH (DeepSeek Harness) prompt library plugin: provides **prompt management** and **AI polish** in the chat bar, helping you accumulate, reuse and continuously improve prompts.

## Key Features

### Prompt Library

- Manage frequently-used prompts (title + body + tags), with search, sorting, tag grouping and usage-count statistics
- Entry 1: the "Library" menu button above the settings button in the sidebar opens a centered panel whose navigation reaches Data Management, Import/Export, Tags and Recycle Bin
- Entry 2: the prompt-library button beside the chat input opens recent/frequent prompts with one click
- **Insert**: appends to the existing content in the input box
- **Overwrite**: directly replaces the whole draft with this prompt
- **Insert & Send**: fills in template variables and sends with one click (uses the variable dialog when it contains `{{}}`); outside `#` scenarios it is only available when the draft is empty, avoiding accidentally carrying existing content; when triggered by `#`, the trigger word is filtered out while the preceding text is kept and sent along
- Type `#` to quickly trigger selection with real-time filtering
- When the input is empty, matching prompts are recommended above the input based on recent chat context; click to insert into the draft
- The bottom shows the total number of tags and prompts in real time

### Generate Skills

- Select prompts in "Library menu → Skill Manager" (skill import dialog) to generate DSH Skills in batch
- AI generates an English skill name and description from the prompt content; the skill is written to `~/.dsh/skills/<name>/SKILL.md`, and can be triggered by typing `/skill-name` in the chat box, or auto-matched by the model from the description
- A link between the prompt and the skill is created automatically; regenerating the same prompt **overwrites the original skill directory** instead of adding endlessly
- If the body contains `{{variables}}`, the "placeholder auto-fill" capability is marked at generation time — when using the skill, AI infers and fills them automatically from the current semantic context, no manual input needed

### AI Polish

- The "AI Polish" button in the chat bar optimizes text with one click, then replaces it back into the input box with one click

### Settings

Under DSH Settings → Prompt Library, adjust: AI model selection, panel size, library-menu button visibility, chat-bar button visibility/icon-only, `#` triggering, context recommendations, add-prompt-from-selection, maximum stored prompts, etc. Changes take effect immediately.

## Data Storage

The library uses **SQLite** (`node:sqlite`); all other configs and logs are stored under `~/.dsh/prompt-library/`:

```
~/.dsh/prompt-library/
├── db/prompts.db      # prompt library & bindings (SQLite)
├── settings.json      # plugin settings (prompt-library namespace)
└── log/
    └── ai-YYYY-MM-DD.log   # AI diagnostic logs (per-day files)
```

## Installation

```bash
dsh plugin --profile web add @sunjuntao/dsh-prompt-library
```

## Usage

Start `dsh web`, click the "Library" menu button above the settings button in the sidebar to reach every feature panel; or use the prompt-library button beside the chat input, type `#` for the quick picker, and click "AI Polish" to polish your input with one click.

## Development / Build

```bash
npm install
npm run deploy   # type check + build + sync to DSH (restart dsh web to take effect)
```

## Screenshots

![1789779289907](images/README/1789779289907.png)![1789779291686](images/README/1789779291686.png)![1789779294779](images/README/1789779294779.png)

## Author

**master1Sun**

- GitHub: [https://github.com/master1Sun/dsh-prompt-library](https://github.com/master1Sun/dsh-prompt-library)
