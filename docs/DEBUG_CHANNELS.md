# Debug Channels & Bots (WhatsApp, Telegram)

Use when:
- Bots not running on WhatsApp or Telegram
- WhatsApp bot shows Telegram bot's identity (or vice versa)
- Need to reset and separate channel identities

## 1. Find user and inspect state

On the **control plane** (where the API runs), from the project root:

```bash
cd /path/to/openclaw-platform
npx tsx api/scripts/debug_channels.ts "Fumf Coms"
```

Or from the api directory:

```bash
cd api
npx tsx scripts/debug_channels.ts "Fumf Coms"
```

Or by userId:

```bash
npx tsx scripts/debug_channels.ts <userId>
```

This prints:
- User info (email, subdomain, container)
- Agents (name, openclaw_id)
- Agent channels (which channel is bound to which agent)
- SSH commands to check container logs and openclaw.json

## 2. Check PM2 logs

```bash
pm2 logs openclaw-api --lines 100 --nostream
```

Look for errors related to channels, WhatsApp, Telegram, or the user's container.

## 3. Check container (on worker)

```bash
# Replace WORKER_IP and CONTAINER_NAME from debug script output
ssh -i ~/.ssh/openclaw_worker root@WORKER_IP "docker logs CONTAINER_NAME --tail 50 2>&1"
```

## 4. View openclaw.json channels

```bash
ssh -i ~/.ssh/openclaw_worker root@WORKER_IP "cat /opt/openclaw/instances/USER_ID/openclaw.json | python3 -c \"import json,sys; d=json.load(sys.stdin); print(json.dumps({'channels': d.get('channels',{}), 'bindings': d.get('bindings',[])}, indent=2))\""
```

## 5. Fix: Separate identities

If both WhatsApp and Telegram are bound to the same agent (e.g. `main`), they share identity. To separate:

### Option A: Create dedicated agents (recommended)

1. Run the debug script to get channel IDs and agent IDs
2. In psql (or admin DB tool):

```sql
-- Create "WhatsApp Bot" agent
INSERT INTO agents (id, user_id, name, purpose, status, ram_mb, is_primary, openclaw_agent_id)
SELECT gen_random_uuid(), 'USER_ID', 'WhatsApp Bot', 'WhatsApp assistant', 'active', 512, false, 'whatsapp-bot'
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE user_id = 'USER_ID' AND openclaw_agent_id = 'whatsapp-bot');

-- Create "Telegram Bot" agent
INSERT INTO agents (id, user_id, name, purpose, status, ram_mb, is_primary, openclaw_agent_id)
SELECT gen_random_uuid(), 'USER_ID', 'Telegram Bot', 'Telegram assistant', 'active', 512, false, 'telegram-bot'
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE user_id = 'USER_ID' AND openclaw_agent_id = 'telegram-bot');

-- List channels to get IDs
SELECT ac.id, ac.channel_type, a.name as agent_name FROM agent_channels ac JOIN agents a ON a.id = ac.agent_id WHERE ac.user_id = 'USER_ID';

-- Reassign WhatsApp channel to whatsapp-bot
UPDATE agent_channels SET agent_id = (SELECT id FROM agents WHERE user_id = 'USER_ID' AND openclaw_agent_id = 'whatsapp-bot') WHERE id = 'WHATSAPP_CHANNEL_ID';

-- Reassign Telegram channel to telegram-bot
UPDATE agent_channels SET agent_id = (SELECT id FROM agents WHERE user_id = 'USER_ID' AND openclaw_agent_id = 'telegram-bot') WHERE id = 'TELEGRAM_CHANNEL_ID';
```

3. Re-sync via admin API:

```bash
curl -X POST https://api.valnaa.com/admin/inject-keys \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "USER_ID"}'
```

### Option B: Full reset (user re-pairs from dashboard)

```sql
UPDATE agent_channels SET connected = false, token = NULL, config = '{}' WHERE user_id = 'USER_ID';
```

Then POST /admin/inject-keys with userId. User will need to re-pair WhatsApp (QR) and Telegram (bot token) from the dashboard.
