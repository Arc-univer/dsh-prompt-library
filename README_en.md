<div align="center">

🌐 **English** | [🇨🇳 中文](./README.md) 

</div>

> **Fork Notice**
>
> This repository is a fork of [master1Sun/dsh-prompt-library](https://github.com/master1Sun/dsh-prompt-library).
>
> **Changes in this fork:**
> - **Persona (SOUL) feature removed entirely**: the upstream plugin injected its default "prompt library assistant" persona into **every** conversation's system prompt (shadowing the host identity slot), polluting all chats. Persona injection, storage, bindings and management UI have been removed; conversations keep the host's native identity again.
> - **Dead code with no references removed**: `PersonaManagerModal`, `PromptInjectPanel`, `HarnessSkillPanel`, `SubPanelModal`, `enrichPromptProfessional`.
> - AI polish and all other AI capabilities are unchanged; the only system-prompt injection left is skill injection (explicitly bound by the user).
> - **Project-scoped prompt isolation**: prompts can be global or project-specific. "Current project" includes only global prompts and prompts belonging to the current project; `#` selection and context recommendations exclude other projects. Data Management supports project filters, grouping and path relinking.
> - **Manual drag ordering**: drag ordering persists across sessions, with confirmation before smart sort is disabled and a one-click re-enable entry. Recycle Bin and JSON / CSV import/export preserve project ownership and manual order.

# dsh-prompt-library

DSH (DeepSeek Harness) prompt library plugin: provides **prompt management** and **AI polish** in the chat bar, helping you accumulate, reuse and continuously improve prompts.

## Key Features

### Prompt Library

- Manage frequently-used prompts (title + body + tags), with search, sorting, tag grouping and usage-count statistics
- **Project scopes**: save prompts globally or for a specific project. "Current project" shows global prompts plus the current project's prompts; `#` selection and context recommendations never include prompts private to other projects
- **Manual drag ordering**: switch to manual sort to drag prompts into a persistent order. Turning smart sort off requires confirmation, and the panel keeps a one-click re-enable entry while it is off
- Data Management supports project filters, project grouping and relinking project paths; JSON / CSV import and export preserve project ownership and manual order
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

### npm

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

### Production build

```bash
npm install
npm run build   # outputs lib/index.js and lib/client.js
```

Run `npm run typecheck` before release when the DSH host type declarations are available. Type checking and bundling have different requirements:

- `npm run build` treats `@deepseek-ai/*` packages as external runtime dependencies. It works without a local DSH Web profile and does not require those packages to be installed locally.
- `npm run typecheck` needs their TypeScript declarations. `TS2307` errors on Desktop usually mean the declarations are missing, not that Desktop cannot build the plugin.
- `npm run link-dsh-deps` only links declarations from `~/.dsh/profiles/node_modules/@deepseek-ai`; it currently expects that Web-profile directory layout and is not a generic Desktop dependency locator.

For local Web-profile development, `npm run deploy` performs a **development build** and syncs it to the local profile. It does **not** run TypeScript type checking and is not a substitute for the production build above. Restart `dsh web` after syncing.

### GitHub distribution and updates

1. Bump `package.json` / `package-lock.json` before building, for example with `npm version minor --no-git-tag-version` for a feature release. The version is embedded into both bundles.
2. Run `npm run typecheck` when host declarations are available, then always run `npm run build`.
3. Commit both the source changes and the regenerated `lib/index.js` / `lib/client.js`. Pushing only `src/` leaves GitHub installations running the previous bundles.
4. Push the commit and a new `v<version>` tag. Do not reuse an old tag for different code.
5. Update or reinstall the plugin from the new commit/tag in DSH, then restart DSH/Desktop. Pushing to GitHub alone does not update an installed copy.

A separate npm package is **not required** for GitHub distribution. If you choose npm distribution under a new package name, update both `name` in `package.json` and the plugin name in `cordis.patch.yml`, then rebuild; `prepublishOnly` runs the production build during `npm publish`.

`npm run release` only creates and pushes the version tag after checking for a clean worktree. It does not build or commit `lib/`, nor publish to npm. This repository currently has no GitHub Actions workflow that builds release artifacts automatically.

## Screenshots

![1789779289907](images/README/1789779289907.png)![1789779291686](images/README/1789779291686.png)![1789779294779](images/README/1789779294779.png)

## Author

**master1Sun**

- GitHub: [https://github.com/master1Sun/dsh-prompt-library](https://github.com/master1Sun/dsh-prompt-library)
