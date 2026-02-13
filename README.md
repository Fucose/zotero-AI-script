# Zotero AI Summary Script

Generate paper summaries in Zotero with an OpenAI-compatible LLM API.

For Chinese documentation, see [README_CN.md](README_CN.md).

## Script File

Use `zotero_ai_script.js`.

## Credits

This project is based on [cs-qyzhang/zotero-ai-summary](https://github.com/cs-qyzhang/zotero-ai-summary), adapted into a simplified script workflow for Zotero Actions & Tags.

## Features

- No external server required
- Works with OpenAI-compatible Chat Completions APIs
- Supports running from a top-level item and from a PDF/HTML attachment
- Saves summary as a Zotero note

## Quick Start

### 1. Install plugin

Install [zotero-actions-tags](https://github.com/windingwind/zotero-actions-tags).

### 2. Add action

1. go to `edit ->setting->Actions & Tags`
2. Click `Add a new action`
3. Configure:
- `Name`: `Summarize Paper`
- `Menu Label`: `Summarize Paper`
- `Event`: `None`
- `Operation`: `Script`
- `Data`: paste the full content of `zotero_ai_script.js`

### 3. Configure API

Edit the configuration section in `zotero_ai_script.js` and enter your own:
- LLM Base URL
- Model name
- API key

Example:

```javascript
let openaiBaseUrl = "https://your-llm-endpoint/v1";
let modelName = "your-model-name";
let apiKey = "your-api-key";
```

### 4. Customize prompt

You can modify `userPromptInstructions` to change:
- output language
- summary structure
- detail level
- writing style

## Usage

1. Select a top-level paper item, or select a PDF/HTML attachment.
2. Right-click -> `Actions & Tags` -> `Summarize Paper`.
3. Wait for generation.
4. Check the newly created note.

## Troubleshooting

### No extractable text

The PDF may not be indexed yet by Zotero, or it may be image-based without selectable text.

### HTTP / network errors

Check:
- API URL
- API key
- Model name
- Network connectivity
- API quota

### Invalid LLM response

Your provider may return an incompatible or empty response format.

## Notes

- The script sends extracted text, not raw PDF files.
- If advanced `temperature` is not enabled, default value `0.3` is used.
- Optional advanced params (`maxTokens`, `topP`) are sent only when enabled.

## Requirements

- Zotero 6+
- [zotero-actions-tags](https://github.com/windingwind/zotero-actions-tags)
- Internet access
- Valid API credentials

## License

MIT License
