# papers.cool Kimi FAQ cache

Static snapshots of `GET/POST https://papers.cool/arxiv/kimi?paper=<arxiv-id>`.
Only stored when `/arxiv/progress?paper=<id>` returns `1`.

Refreshed by `python3 scripts/ai_daily.py kimi-fetch` and by `publish`.
