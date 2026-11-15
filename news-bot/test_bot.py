"""Offline tests: python3 -m unittest -v test_bot"""
import datetime as dt
import json
import unittest
from unittest import mock

import bot

PAGE = """
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="chan/101">
<div class="tgme_widget_message_reply"><div class="tgme_widget_message_text js-message_reply_text" dir="auto">OLD QUOTE</div></div>
<a class="tgme_widget_message_photo_wrap grouped_media_wrap blured js-message_photo" style="width:10px;background-image:url('https://cdn.example/a.jpg?x=1&amp;y=2')"></a>
<a class="tgme_widget_message_photo_wrap grouped_media_wrap blured js-message_photo" style="background-image:url('https://cdn.example/b.jpg')"></a>
<div class="tgme_widget_message_text js-message_text" dir="auto">כותרת חשובה<br/>שורה שניה @someone https://t.me/x<br/>🔻ערוץ: נוסף</div>
<span class="tgme_widget_message_meta"><time datetime="2026-11-15T10:02:00+00:00">10:02</time></span>
</div></div>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="chan/102">
<i class="tgme_widget_message_video_thumb" style="background-image:url('https://cdn.example/v.jpg')"></i>
<div class="tgme_widget_message_text js-message_text" dir="auto">סרטון</div>
<time datetime="2026-11-15T10:03:00+00:00">10:03</time>
</div></div>
"""


class ParseTests(unittest.TestCase):
    def test_parse_ids_text_photos_and_time(self):
        posts = bot.parse_channel_page(PAGE, "chan")
        self.assertEqual([p.post_id for p in posts], [101, 102])
        first = posts[0]
        self.assertIn("כותרת חשובה", first.text)
        self.assertNotIn("OLD QUOTE", first.text)  # reply quote must be ignored
        self.assertEqual(first.photos, ["https://cdn.example/a.jpg?x=1&y=2", "https://cdn.example/b.jpg"])
        self.assertEqual(first.ts, dt.datetime(2026, 11, 15, 10, 2, tzinfo=dt.timezone.utc))

    def test_video_falls_back_to_thumbnail(self):
        self.assertEqual(bot.parse_channel_page(PAGE, "chan")[1].photos, ["https://cdn.example/v.jpg"])


class CleanTests(unittest.TestCase):
    def test_clean_removes_links_mentions_and_signature(self):
        with open("config.json", encoding="utf-8") as f:
            patterns = json.load(f)["strip_patterns"]
        out = bot.clean_text("כותרת חשובה\nשורה שניה @someone https://t.me/x\n🔻ערוץ: נוסף\n##\n2 תגובות\nכדי להגיב לכתבה לחצו כאן", patterns)
        self.assertEqual(out, "כותרת חשובה\nשורה שניה")

    def test_norm_and_jaccard(self):
        a = bot.norm_words("הזרוע הצבאית של חמאס אישרה את החיסול")
        b = bot.norm_words("הזרוע הצבאית של חמאס אישרה את חיסולו!")
        self.assertGreaterEqual(bot.jaccard(a, b), bot.DUP_THRESHOLD)
        self.assertLess(bot.jaccard(a, bot.norm_words("מזג אוויר נעים מחר בבוקר")), bot.DUP_THRESHOLD)


class FilterTests(unittest.TestCase):
    cfg = {"max_age_minutes": 15, "global_skip": ["לרכישה"]}
    now = dt.datetime(2026, 11, 15, 10, 10, tzinfo=dt.timezone.utc)

    def post(self, text, minutes_ago=1, photos=None):
        return bot.Post("c", 1, text, photos or [], self.now - dt.timedelta(minutes=minutes_ago))

    def test_reasons(self):
        self.assertEqual(bot.skip_reason(self.post("x", 30), {}, self.cfg, self.now), "too old")
        self.assertEqual(bot.skip_reason(self.post("", 1), {}, self.cfg, self.now), "empty")
        self.assertIn("ad", bot.skip_reason(self.post("לרכישה עכשיו"), {}, self.cfg, self.now))
        self.assertIsNone(bot.skip_reason(self.post("חדשות"), {}, self.cfg, self.now))
        src = {"skip": ["מבצע"]}
        self.assertIsNotNone(bot.skip_reason(self.post("מבצע גדול"), src, self.cfg, self.now))


class FormatTests(unittest.TestCase):
    cfg = {"prefix": "🔴 ", "footer": "📡 מקור: @{source}"}

    def test_caption_bolds_headline_and_escapes_html(self):
        cap = bot.build_caption("כותרת <קצרה>\nפרט & עוד", "src", self.cfg)
        self.assertTrue(cap.startswith("🔴 <b>כותרת &lt;קצרה&gt;</b>\nפרט &amp; עוד"))
        self.assertTrue(cap.endswith("📡 מקור: @src"))

    def test_multipart_encoding(self):
        body, ctype = bot.encode_multipart({"chat_id": "@x"}, {"photo": ("a.jpg", b"DATA", "image/jpeg")})
        self.assertIn("multipart/form-data; boundary=", ctype)
        self.assertIn(b'name="chat_id"\r\n\r\n@x', body)
        self.assertIn(b'filename="a.jpg"', body)
        self.assertIn(b"DATA", body)


class PublishTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.tg = mock.Mock()
        self.tg.call.side_effect = lambda method, fields, files=None: self.calls.append((method, fields, files))
        self.post = bot.Post("c", 1, "t", ["https://x/1.jpg", "https://x/2.jpg"])

    def test_album_with_caption(self):
        with mock.patch.object(bot, "fetch_bytes", return_value=b"img"):
            bot.publish(self.tg, self.post, "t", "cap")
        self.assertEqual(self.calls[0][0], "sendMediaGroup")
        media = json.loads(self.calls[0][1]["media"])
        self.assertEqual(media[0]["caption"], "cap")
        self.assertEqual(set(self.calls[0][2]), {"p0", "p1"})

    def test_single_photo_and_long_caption_goes_to_message(self):
        self.post.photos = ["https://x/1.jpg"]
        with mock.patch.object(bot, "fetch_bytes", return_value=b"img"):
            bot.publish(self.tg, self.post, "t", "y" * 1500)
        self.assertEqual([c[0] for c in self.calls], ["sendPhoto", "sendMessage"])

    def test_text_only(self):
        self.post.photos = []
        bot.publish(self.tg, self.post, "t", "cap")
        self.assertEqual(self.calls[0][0], "sendMessage")


if __name__ == "__main__":
    unittest.main()
