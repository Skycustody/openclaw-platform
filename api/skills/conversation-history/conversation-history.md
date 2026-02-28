# Conversation History

Look up past conversations between you and the user across all channels (dashboard, Telegram, Discord, WhatsApp, Slack).

## When to use

When the user asks things like:
- "What did we talk about on Friday?"
- "What did I ask you yesterday?"
- "Check our conversation from last week"
- "Find where I mentioned [topic]"
- "Show me our chat history"

## How it works

The platform stores all conversations in a database. You can query them by date, channel, or keyword search.

## Instructions

To look up past conversations, run:

```sh
curl -s -X POST "$PLATFORM_API/webhooks/container/history" \
  -H "Content-Type: application/json" \
  -H "x-container-secret: $CONTAINER_SECRET" \
  -d '{"userId": "'"$USER_ID"'", "date": "2026-02-21", "limit": 50}'
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `userId` | Yes | Always use `$USER_ID` |
| `date` | No | Filter by date (YYYY-MM-DD format) |
| `channel` | No | Filter by channel: `direct`, `telegram`, `discord`, `whatsapp`, `slack` |
| `search` | No | Search for keyword in message content |
| `limit` | No | Max messages to return (default 50, max 200) |

### Examples

Look up conversations from a specific date:
```sh
curl -s -X POST "$PLATFORM_API/webhooks/container/history" \
  -H "Content-Type: application/json" \
  -H "x-container-secret: $CONTAINER_SECRET" \
  -d '{"userId": "'"$USER_ID"'", "date": "2026-02-21"}'
```

Search for a topic:
```sh
curl -s -X POST "$PLATFORM_API/webhooks/container/history" \
  -H "Content-Type: application/json" \
  -H "x-container-secret: $CONTAINER_SECRET" \
  -d '{"userId": "'"$USER_ID"'", "search": "website"}'
```

List available dates (no filters):
```sh
curl -s -X POST "$PLATFORM_API/webhooks/container/history" \
  -H "Content-Type: application/json" \
  -H "x-container-secret: $CONTAINER_SECRET" \
  -d '{"userId": "'"$USER_ID"'"}'
```

### Response format

The API returns JSON with:
- `conversations`: Array of messages with `role`, `channel`, `content`, `model_used`, `created_at`
- `available_dates`: Array of dates with message counts (last 30 days)

Summarize the results for the user. Don't dump raw JSON — give a clear, readable summary of what was discussed.
