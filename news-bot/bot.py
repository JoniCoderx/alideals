#!/usr/bin/env python3
"""מלחמרע (@milhamra) news bot.

Watches public Telegram news channels through their web previews (t.me/s/<name>),
cleans and de-duplicates the posts, optionally rewrites them with Claude, and
publishes text + photo albums to the target channel through the Bot API.

Standard library only: no pip install needed.

Usage:
  python3 bot.py --dry-run          # read live sources, print what would be posted (no token needed)
  python3 bot.py --once             # one poll cycle, then exit
  python3 bot.py                    # run forever (poll every config.poll_seconds)

Environment:
  TELEGRAM_BOT_TOKEN   token from @BotFather (bot must be admin of the target channel)
  TARGET_CHANNEL       optional override of config.target, e.g. @milhamra
  ANTHROPIC_API_KEY    optional. If set, posts are rewritten into unique wording.
  DB_PATH              optional. SQLite file for dedupe state (default: data/state.db)
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import logging
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
UA = "Mozilla/5.0 (compatible; milhamra-bot/1.0)"
CAPTION_LIMIT = 1000  # Telegram caps captions at 1024 chars; stay under it after HTML tags
DUP_WINDOW_SECONDS = 6 * 3600
DUP_THRESHOLD = 0.5  # Jaccard similarity of word sets above which a post is a duplicate

REWRITE_PROMPT = (
    "You rewrite breaking-news items for a Hebrew news channel. "
    "Rewrite the text below in Hebrew, in 1-3 short sentences, with new wording. "
    "Keep every fact, name, number, place and time exactly as given. "
    "Do not add facts, opinions or emojis beyond one leading 🔴. "
    "Output only the rewritten text, nothing else.\n\nText:\n"
)

log = logging.getLogger("milhamra")


# --------------------------------------------------------------------------- models

@dataclass
class Post:
    channel: str
    post_id: int
    text: str
    photos: list[str] = field(default_factory=list)
    ts: dt.datetime | None = None

    @property
    def key(self) -> str:
        return f"{self.channel}/{self.post_id}"


# --------------------------------------------------------------------------- parsing

MSG_SPLIT = '<div class="tgme_widget_message_wrap'
TEXT_RE = re.compile(r'<div class="tgme_widget_message_text js-message_text[^"]*"[^>]*>(.*?)</div>', re.S)
PHOTO_RE = re.compile(r'<a class="[^"]*js-message_photo[^"]*"[^>]*?url\(\'([^\']+)\'\)')
VIDEO_THUMB_RE = re.compile(r'<i class="tgme_widget_message_video_thumb"[^>]*?url\(\'([^\']+)\'\)')
POST_RE = re.compile(r'data-post="[^"/]+/(\d+)"')
TIME_RE = re.compile(r'<time[^>]*datetime="([^"]+)"')


def parse_channel_page(page: str, channel: str) -> list[Post]:
    """Turn a t.me/s/<channel> HTML page into Post objects (oldest first, as on the page)."""
    posts: list[Post] = []
    for chunk in page.split(MSG_SPLIT)[1:]:
        m = POST_RE.search(chunk)
        if not m:
            continue
        text_m = TEXT_RE.search(chunk)
        text = _html_to_text(text_m.group(1)) if text_m else ""
        photos = [html.unescape(u) for u in PHOTO_RE.findall(chunk)]
        if not photos:
            photos = [html.unescape(u) for u in VIDEO_THUMB_RE.findall(chunk)][:1]
        t = TIME_RE.search(chunk)
        ts = dt.datetime.fromisoformat(t.group(1)) if t else None
        posts.append(Post(channel, int(m.group(1)), text, photos, ts))
    return posts


def _html_to_text(fragment: str) -> str:
    fragment = re.sub(r"<br\s*/?>", "\n", fragment)
    fragment = re.sub(r"<[^>]+>", "", fragment)
    return html.unescape(fragment).strip()


# --------------------------------------------------------------------------- cleaning

URL_RE = re.compile(r"https?://\S+|\bt\.me/\S+|\bwww\.\S+")
MENTION_RE = re.compile(r"(?<!\w)@\w+")


def clean_text(text: str, strip_patterns: list[str]) -> str:
    """Remove links, @mentions, and the source's own signature lines."""
    out: list[str] = []
    for line in text.splitlines():
        line = URL_RE.sub("", line)
        line = MENTION_RE.sub("", line)
        for pat in strip_patterns:
            line = re.sub(pat, "", line)
        line = re.sub(r"[ \t]+", " ", line).strip(" -|•·‏‎")
        if not re.search(r"\w", line):  # leftover markup like "##" or "--"
            continue
        if re.fullmatch(r"\d+ תגובות?", line):  # "2 תגובות" comment counters
            continue
        if line:
            out.append(line)
    return "\n".join(out)


def norm_words(text: str) -> set[str]:
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    return {w for w in cleaned.split() if len(w) > 2}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


# --------------------------------------------------------------------------- filtering

def skip_reason(post: Post, source: dict, cfg: dict, now: dt.datetime) -> str | None:
    if post.ts is not None and (now - post.ts).total_seconds() > cfg["max_age_minutes"] * 60:
        return "too old"
    if not post.text and not post.photos:
        return "empty"
    low = post.text.lower()
    for word in cfg.get("global_skip", []) + source.get("skip", []):
        if word.lower() in low:
            return f"ad/filter word: {word}"
    return None


# --------------------------------------------------------------------------- rewriting

def rewrite(text: str, cfg: dict) -> str:
    """Optional Claude rewrite for unique wording. Falls back to the cleaned text."""
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key or not text or not cfg.get("rewrite", True):
        return text
    body = {
        "model": cfg.get("rewrite_model", "claude-haiku-5-5"),
        "max_tokens": 400,
        "messages": [{"role": "user", "content": REWRITE_PROMPT + text}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode(),
        headers={
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            out = json.load(r)["content"][0]["text"].strip()
        return out or text
    except Exception as exc:  # network or API error: publish the cleaned original
        log.warning("rewrite failed, using original text: %s", exc)
        return text


# --------------------------------------------------------------------------- formatting

def build_caption(text: str, source: str, cfg: dict) -> str:
    lines = [ln for ln in text.splitlines() if ln.strip()]
    body_html = []
    for i, ln in enumerate(lines):
        esc = html.escape(ln)
        # Bold the lead line (headline feel) when it is short enough to be a headline.
        if i == 0 and len(ln) <= 110:
            esc = f"<b>{esc}</b>"
        body_html.append(esc)
    footer = cfg.get("footer", "📡 מקור: @{source}").format(source=source)
    prefix = cfg.get("prefix", "🔴 ")
    body = "\n".join(body_html)
    if body_html:
        body = prefix + body
    return f"{body}\n\n{html.escape(footer)}" if body else html.escape(footer)


# --------------------------------------------------------------------------- state

class State:
    def __init__(self, path: str):
        self.db = sqlite3.connect(path)
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS seen (key TEXT PRIMARY KEY, status TEXT, words TEXT, ts INTEGER)"
        )
        self.db.commit()

    def is_seen(self, key: str) -> bool:
        return self.db.execute("SELECT 1 FROM seen WHERE key=?", (key,)).fetchone() is not None

    def mark(self, key: str, status: str, words: set[str] | None = None) -> None:
        self.db.execute(
            "INSERT OR REPLACE INTO seen VALUES (?,?,?,?)",
            (key, status, " ".join(sorted(words or [])), int(time.time())),
        )
        self.db.commit()

    def is_duplicate(self, words: set[str]) -> bool:
        since = int(time.time()) - DUP_WINDOW_SECONDS
        rows = self.db.execute(
            "SELECT words FROM seen WHERE status='posted' AND ts>? AND words!=''", (since,)
        ).fetchall()
        return any(jaccard(words, set(r[0].split())) >= DUP_THRESHOLD for r in rows)


# --------------------------------------------------------------------------- telegram

class TelegramError(RuntimeError):
    pass


def encode_multipart(fields: dict[str, str], files: dict[str, tuple[str, bytes, str]]) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
        )
    for name, (filename, data, ctype) in files.items():
        chunks.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
            f"Content-Type: {ctype}\r\n\r\n".encode()
            + data
            + b"\r\n"
        )
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


class Telegram:
    def __init__(self, token: str, target: str):
        self.token = token
        self.target = target

    def call(self, method: str, fields: dict[str, str], files: dict | None = None) -> dict:
        body, ctype = encode_multipart({"chat_id": self.target, **fields}, files or {})
        url = f"https://api.telegram.org/bot{self.token}/{method}"
        for _ in range(4):
            req = urllib.request.Request(url, data=body, headers={"Content-Type": ctype})
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    data = json.load(r)
            except urllib.error.HTTPError as e:
                data = json.loads(e.read() or b"{}")
            if data.get("ok"):
                return data["result"]
            if data.get("error_code") == 429:
                wait = data.get("parameters", {}).get("retry_after", 5)
                log.warning("rate limited, sleeping %ss", wait)
                time.sleep(wait + 1)
                continue
            raise TelegramError(f"{method}: {data.get('description')}")
        raise TelegramError(f"{method}: gave up after retries")


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def publish(tg: Telegram, post: Post, text: str, caption: str) -> None:
    """Send the post. Photos go as an album (or single photo); long text follows as a message."""
    caption_fits = len(caption) <= CAPTION_LIMIT
    photo_urls = post.photos[:10]

    files: dict[str, tuple[str, bytes, str]] = {}
    for i, url in enumerate(photo_urls):
        try:
            files[f"p{i}"] = (f"p{i}.jpg", fetch_bytes(url), "image/jpeg")
        except Exception as exc:
            log.warning("photo download failed (%s), skipping that photo", exc)

    sent_with_caption = False
    if files and caption_fits:
        if len(files) == 1:
            tg.call("sendPhoto", {"caption": caption, "parse_mode": "HTML"}, {"photo": files["p0"]})
        else:
            media = []
            for i, name in enumerate(files):
                item: dict = {"type": "photo", "media": f"attach://{name}"}
                if i == 0:
                    item.update({"caption": caption, "parse_mode": "HTML"})
                media.append(item)
            tg.call("sendMediaGroup", {"media": json.dumps(media)}, files)
        sent_with_caption = True
    elif files:
        if len(files) == 1:
            tg.call("sendPhoto", {}, {"photo": files["p0"]})
        else:
            tg.call("sendMediaGroup", {"media": json.dumps(
                [{"type": "photo", "media": f"attach://{n}"} for n in files])}, files)

    if not sent_with_caption:
        tg.call("sendMessage", {"text": caption, "parse_mode": "HTML",
                                "disable_web_page_preview": "true"})


# --------------------------------------------------------------------------- main loop

def load_config() -> dict:
    cfg = json.loads((HERE / "config.json").read_text(encoding="utf-8"))
    if os.environ.get("TARGET_CHANNEL"):
        cfg["target"] = os.environ["TARGET_CHANNEL"]
    return cfg


def fetch_source(channel: str) -> list[Post]:
    page = fetch_bytes(f"https://t.me/s/{channel}").decode("utf-8", "replace")
    return parse_channel_page(page, channel)


def run_cycle(cfg: dict, state: State, tg: Telegram | None, dry_run: bool) -> int:
    now = dt.datetime.now(dt.timezone.utc)
    pending: list[tuple[dict, Post]] = []
    for src in cfg["sources"]:
        try:
            posts = fetch_source(src["channel"])
        except Exception as exc:
            log.warning("could not read @%s: %s", src["channel"], exc)
            continue
        for post in posts:
            if not state.is_seen(post.key):
                pending.append((src, post))

    # Oldest first, so the channel reads in chronological order.
    pending.sort(key=lambda sp: sp[1].ts or now)
    published = 0
    for src, post in pending:
        reason = skip_reason(post, src, cfg, now)
        if reason:
            (log.debug if reason == "too old" else log.info)("skip %s (%s)", post.key, reason)
            if not dry_run:
                state.mark(post.key, f"skipped: {reason}")
            continue

        text = rewrite(clean_text(post.text, cfg.get("strip_patterns", [])), cfg)
        if not cfg.get("send_photos", True):
            post.photos = []
        if not text and not post.photos:
            if not dry_run:
                state.mark(post.key, "skipped: nothing left after cleaning")
            continue
        words = norm_words(text)
        if state.is_duplicate(words):
            log.info("skip %s (duplicate of a recent post)", post.key)
            if not dry_run:
                state.mark(post.key, "duplicate")
            continue

        caption = build_caption(text, src["channel"], cfg)
        if dry_run:
            print(f"--- {post.key}  photos={len(post.photos)}\n{caption}\n")
            published += 1
            continue

        try:
            publish(tg, post, text, caption)
        except Exception as exc:
            log.error("publish failed for %s: %s", post.key, exc)
            continue  # leave unmarked so it is retried next cycle
        state.mark(post.key, "posted", words)
        published += 1
        log.info("posted %s", post.key)
        time.sleep(1)  # stay well under Telegram's per-chat rate limit
    return published


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--once", action="store_true", help="run one cycle and exit")
    ap.add_argument("--dry-run", action="store_true", help="print posts instead of sending; no state change")
    ap.add_argument("--max-age-minutes", type=int, help="override config max_age_minutes (handy for dry-runs)")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cfg = load_config()
    if args.max_age_minutes:
        cfg["max_age_minutes"] = args.max_age_minutes

    if args.dry_run:
        state = State(":memory:")
        tg = None
    else:
        token = os.environ.get("TELEGRAM_BOT_TOKEN")
        if not token:
            log.error("TELEGRAM_BOT_TOKEN is not set (use --dry-run to test without it)")
            return 2
        db_path = os.environ.get("DB_PATH", str(HERE / "data" / "state.db"))
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        state = State(db_path)
        tg = Telegram(token, cfg["target"])

    if args.once or args.dry_run:
        n = run_cycle(cfg, state, tg, args.dry_run)
        log.info("cycle done, %d post(s) %s", n, "previewed" if args.dry_run else "published")
        return 0

    log.info("watching %s -> %s every %ss", [s["channel"] for s in cfg["sources"]],
             cfg["target"], cfg["poll_seconds"])
    while True:
        try:
            run_cycle(cfg, state, tg, dry_run=False)
        except Exception:
            log.exception("cycle crashed, continuing")
        time.sleep(cfg["poll_seconds"])


if __name__ == "__main__":
    sys.exit(main())
