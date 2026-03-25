# Switch AI Model

Switch the AI model that powers your responses. The user can ask you to use a specific model by name.

## When to use

When the user says things like:
- "Switch to Sonnet" / "Use Claude" / "Switch to GPT-4o"
- "Use a cheaper model" / "Use the best model"
- "Switch to auto" / "Let the system pick"

## How it works

Your platform has a smart router that picks the best model per task. This skill overrides that by locking to a specific model, or switches back to auto mode.

## Available models

| Shortcut | Model | Best for |
|----------|-------|----------|
| `auto` | Smart auto-routing | Best balance of cost and quality (default) |
| `sonnet` | Claude Sonnet 4 | Complex tasks, coding, tool use |
| `opus` | Claude Opus 4 | Most powerful, expensive |
| `haiku` | Claude 3.5 Haiku | Fast, cheap Claude |
| `gpt-4o` | GPT-4o | Smart, balanced |
| `gpt-4.1` | GPT-4.1 | Latest OpenAI, 1M context |
| `gpt-4.1-mini` | GPT-4.1 Mini | Fast, cheap OpenAI |
| `gpt-4.1-nano` | GPT-4.1 Nano | Ultra cheap |
| `gemini-pro` | Gemini 2.5 Pro | Google's best, 1M context |
| `gemini-flash` | Gemini 2.5 Flash | Fast Google model |
| `deepseek` | DeepSeek V3 | Strong and very cheap |
| `deepseek-r1` | DeepSeek R1 | Reasoning, cheap |
| `grok` | Grok 3 | xAI's model |
| `o3` | o3-mini | OpenAI reasoning |

## Instructions

To switch models, run this command (replace MODEL with the shortcut from the table above):

```sh
curl -s -X POST "$PLATFORM_API/webhooks/container/switch-model" \
  -H "Content-Type: application/json" \
  -H "x-container-secret: $CONTAINER_SECRET" \
  -d "{\"userId\": \"$USER_ID\", \"model\": \"MODEL\"}"
```

The API returns JSON with the result. Tell the user which model you switched to.

IMPORTANT: The model change takes effect on the NEXT message, not your current response. Always tell the user: "Done — starting from the next message, I'll use [model name]."

If the user says "switch to auto" or "let the system pick", use `auto` as the model name. This re-enables smart routing which picks the cheapest capable model per task.
