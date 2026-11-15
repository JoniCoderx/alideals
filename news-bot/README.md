# מלחמרע news bot (@milhamra)

Reads public news channels, cleans and de-duplicates the posts, and publishes them to
@milhamra as headline + photo albums with a source tag. Stdlib only, no `pip install`.

- Sources: `@abualiexpress`, `@raknetoooooo` (set in `config.json`)
- Speed: polls every 20s (`poll_seconds`). Only posts from the last 15 minutes are published, so a restart never floods the channel.
- Filters: ad and promo keywords (per source and global), empty posts, link-only posts.
- Uniqueness: links, @mentions and source signatures are removed. Near-duplicate stories seen in the last 6 hours (same story on both channels) are published once. With `ANTHROPIC_API_KEY` set, each post is rewritten into new Hebrew wording with Claude, facts unchanged.

## 1. Try it without any token (live dry-run)

```bash
cd news-bot
python3 bot.py --dry-run --max-age-minutes 240   # prints what would be posted, sends nothing
python3 -m unittest -v test_bot                  # offline tests
```

## 2. Set up the bot and channel

1. In Telegram, open **@BotFather** → `/newbot` → copy the token.
2. Open **@milhamra** → channel settings → **Administrators** → add your bot with the
   **Post messages** permission.
3. Set the env vars (copy `.env.example` to `.env`, or export them):

   ```bash
   export TELEGRAM_BOT_TOKEN=123456:ABC...
   export ANTHROPIC_API_KEY=...        # optional, for unique rewriting
   ```

4. Run it:

   ```bash
   python3 bot.py --once     # one cycle, to check
   python3 bot.py            # run forever
   ```

### Keep it running (Linux server)

```ini
# /etc/systemd/system/milhamra-bot.service
[Unit]
Description=milhamra news bot
After=network-online.target

[Service]
WorkingDirectory=/opt/alideals/news-bot
EnvironmentFile=/opt/alideals/news-bot/.env
ExecStart=/usr/bin/python3 bot.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now milhamra-bot
journalctl -u milhamra-bot -f
```

Note: GitHub Actions cron runs at most every 5 minutes, which is too slow for breaking news.
Use a small always-on server (VPS, Fly.io, Railway, Render) instead.

## 3. Channel bio and setup (to match the look of the big news channels)

These are written for this channel. They are not copies of anyone else's text.

**Channel name:** `מלחמרע | חדשות מלחמה בזמן אמת`

**Channel description (≤255 chars):**
> מלחמרע 🔴 עדכוני מלחמה בזמן אמת, בקצרה ובתמונות. מסכמים את הדיווחים החמים מכמה ערוצים, בלי פאניקה ובלי רעש. כל ידיעה כוללת מקור.

**Pinned post:**
> 🔴 מלחמרע: כל הדיווחים החמים במקום אחד.
> עדכונים בזמן אמת, עם תמונות ומקור לכל ידיעה.
> שאלה או טעות? כתבו לנו.

**Post style (what makes news channels feel "fast and clean"):**
- Every post: one bold headline line, then 1–3 short lines of facts, then the source tag. No link spam.
- Photos as albums when there are several. Video posts use their thumbnail.
- Post fast: the bot checks every 20 seconds. Quiet hours: fewer posts, not filler.
- Never repost ads, sales or affiliate content. The filter does this; add words to `skip` if you see new ones.
- Keep one emoji style (🔴 for breaking) and don't stack emojis.

**Channel settings:** turn *Sign messages* off (the source tag already names the outlet), keep the channel public with the handle `@milhamra`, and add the bot as admin only.

## Editorial and legal notes

- Each post carries a `מקור: @channel` tag, and the bot never claims a story as its own reporting.
- Reposting another outlet's text or photos can conflict with its rights. The rewrite option and the source tag reduce this, but you should decide your own policy for copying photos and check the source channels' terms.
- Verify anything before it goes out. This bot relays what it reads and does not check facts. For graphic war footage, consider skipping photo posts (set `send_photos` to `false` in `config.json` to post text only).

## Config reference (`config.json`)

| key | meaning |
|---|---|
| `target` | target channel, e.g. `@milhamra` (or env `TARGET_CHANNEL`) |
| `poll_seconds` | how often to check the sources |
| `max_age_minutes` | ignore posts older than this |
| `sources[].channel` | public channel name, without `@` |
| `sources[].skip` | extra ad/filter words for that source |
| `global_skip` | filter words for all sources |
| `strip_patterns` | regexes removed from each line (signatures, CTA lines) |
| `send_photos` | `false` posts text only |
| `prefix`, `footer` | decoration around each post (`{source}` is replaced) |
| `rewrite`, `rewrite_model` | Claude rewrite on/off and model (needs `ANTHROPIC_API_KEY`) |

## Limits

- Only public channels can be read, through their web preview (`t.me/s/<name>`), which shows roughly the latest 20 posts. A very long outage can miss older posts.
- Photos are downloaded and uploaded, so Telegram's size limits apply (about 10 MB per photo, 10 per album).
