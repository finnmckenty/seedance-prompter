# Seedance Prompter

A local web app for writing and iterating on Seedance 2.5 prompts with Claude. Runs entirely in your browser. Your API key never leaves your machine.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5182, click **Add API key**, and paste an Anthropic API key. The key is stored in your browser's local storage only.

If the API responds that your key "is not scoped to a workspace", enter your Workspace ID in Settings. It starts with `wrkspc_` and is listed in the Anthropic Console under Settings, then Workspaces. The app sends it as the `anthropic-workspace-id` header.

A double-clickable launcher is at `scripts/launch.command`. Copy it to your Desktop to start the app without a terminal.

## How it works

- **Shots.** Each chat is a shot with its own references, story context, and prompt versions. Switch shots in the header dropdown. **New** starts a shot as a copy of the current one's references and context, so the next scene in the same story needs no re-upload. **Rename** names a shot.
- **References** go in the left rail. Drop images, videos, or audio. Give each one a name. The name becomes the subject in the prompt, and the app numbers them `@Image 1`, `@Video 1`, `@Audio 1` in list order, which is the order you upload them to Seedance.
- **Context** is the second tab in the left rail. Paste or load a `.txt` or `.md` file with the bigger picture: logline, character bios and relationships, visual language, dialogue conventions. It goes out with the first message of the shot and again whenever you change it. The model treats it as background facts; the scene you describe always wins on conflict.
- **Chat** in the middle. Describe the shot. After a generation, paste a frame from the result and say what went wrong. The model revises the prompt and keeps what worked.
- **Prompt** panel on the right always shows the latest prompt with a copy button. Earlier versions stay available.
- Videos are sent to Claude as a four-frame contact sheet. Audio cannot be heard, so describe it in the note.
- Images pasted into the chat are treated as feedback, not references.
- To mention a reference in your message, type `@` and pick it, or click a reference's label in the left rail or the upload-order list. It inserts `Name (@Image N)`, which is unambiguous to the model.

## Model and cost

Pick a model in the header. Claude Fable 5.1 is the default. Effort controls thinking depth. The prompt rules come from the official Seedance 2.5 skill, embedded as the system prompt and cached between turns, so revisions are cheap. The estimated cost of each reply and the running total of the chat are shown in the UI.

Claude Fable 5.1 needs an API account with standard data retention. It is not available on zero-data-retention accounts.

## Updating the skill

The system prompt is built from `src/skill/sd25-pe.md`, a copy of the skill at `~/.claude/skills/sd25-pe/SKILL.md`. After updating the skill, run:

```bash
scripts/sync-skill.sh
```

## Notes

- All data lives in IndexedDB and local storage in your browser, including the reference images themselves (resized copies, not file paths), so a shot stays intact if you move the source files. Clearing site data erases everything.
- Settings has a refusal fallback toggle. When on, Anthropic re-runs a request on a fallback model if a safety classifier declines it.
- Set `VITE_ANTHROPIC_API_KEY` in a `.env.local` file to pre-fill the key field. That file is gitignored.
