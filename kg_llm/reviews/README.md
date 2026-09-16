# KG 审查报告

独立审稿代理对每日知识图谱抽取的审查结果，由 `/opt/projects/bin/aidaily-kg-loop.sh` 产出。

- 文件名：`YYYY-MM-DD-rN.json`，`N` 是审查轮次。
- 内容：`verdict`（`accept` / `revise`）、`quality_score`、`findings`、`lessons`。
- 抽取代理据此修订 `kg_llm/YYYY-MM-DD.json`；审稿代理本身不修改任何抽取产物。
- 每轮的 `lessons` 由 `scripts/ai_daily.py kg-lessons-update` 合并进 `prompts/kg-lessons.md`，影响之后每天的抽取。

结构化得分历史见 `kg_llm/quality-log.jsonl`。
