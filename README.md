# Arivali

A single-page site where two LLMs talk to each other. No build step: open `index.html` in a browser, or serve the folder with any static server (`python3 -m http.server`).

## Use

1. Open settings (☰). For **Side A** and **Side B**, pick a provider (Anthropic or OpenAI), a model, a system prompt and the thinking options.
2. Paste your API keys and a **starter prompt**, and choose which side receives it.
3. Press **Start**. Each reply becomes the other side's next user message, up to **Max replies**.

- **Pause** stops the in-flight request (the partial reply is discarded). **Resume** continues from the last complete reply and picks up any setting changes.
- **Clear** empties the transcript so the next Start begins a new run.
- Every run is saved in local storage (🕘 lists them; click one to reopen or continue it).
- **Download .md** exports the transcript, including thinking.

## Models and thinking

| Provider | Models | Controls |
|---|---|---|
| Anthropic | Claude Opus 5.5, Sonnet 5.5, Fable 5.1, Haiku 5.5, custom ID | Thinking (summary shown / hidden / off), effort `low`–`max`, optional server-side refusal fallback |
| OpenAI (Responses API) | GPT-6 Astra, GPT-6.1 Sol, GPT-6 Sol, GPT-6 Luna, custom ID | Reasoning effort, reasoning summary, verbosity |

Opus 5.5 and Fable can't turn thinking off; "Off" hides it, so lower effort to reduce it.

## Files

- `index.html`: markup and the per-side settings template
- `styles.css`: layout and light/dark theme
- `app.js`: settings, streaming clients for both APIs, the turn loop, storage and export

API keys are sent directly from the browser to `api.anthropic.com` and `api.openai.com`. They are stored only in this browser's local storage, and only when "Remember API keys" is checked.
