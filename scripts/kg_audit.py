"""知识图谱抽取质量审计。

对 `kg_llm/YYYY-MM-DD.json` 打分，给出可执行的改进项，
让每天的抽取质量可度量、可对比、可逐步提升。
"""

from __future__ import annotations

import datetime as dt
import json
import pathlib
import re
from collections import Counter, defaultdict
from typing import Any

import static_pipeline

# 每篇文章期望的最低产出，低于此值说明抽取偷懒。
TARGET_RELATIONS_PER_ARTICLE = 2.5
TARGET_EVENTS_PER_ARTICLE = 1.4
MAX_ORPHAN_RATIO = 0.25
EVIDENCE_MATCH_THRESHOLD = 0.55
PASS_SCORE = 80

GENERIC_NAMES = {
    "ai", "a i", "人工智能", "模型", "大模型", "平台", "产品", "技术", "行业", "公司",
    "系统", "服务", "工具", "数据", "用户", "市场", "生态", "研究", "论文", "新闻",
    "llm", "llms", "agent", "agents", "api", "开源", "安全", "基础设施",
}

GENERIC_WHY_PATTERNS = [
    r"值得关注",
    r"值得持续跟踪",
    r"具有重要意义",
    r"产生深远影响",
    r"引发广泛关注",
    r"是一个重要信号",
]


def normalize_name(value: str) -> str:
    return re.sub(r"[\s\-_·.]+", "", str(value or "").strip().lower())


def normalize_for_match(value: str) -> str:
    return re.sub(r"[^0-9a-z\u4e00-\u9fff]+", "", str(value or "").lower())


def text_tokens(value: str) -> list[str]:
    text = str(value or "").lower()
    latin = re.findall(r"[a-z][a-z0-9.+-]{1,}", text)
    digits = re.findall(r"\d+(?:\.\d+)?", text)
    cjk = re.findall(r"[\u4e00-\u9fff]", text)
    bigrams = ["".join(pair) for pair in zip(cjk, cjk[1:])]
    return latin + digits + bigrams


def evidence_match_ratio(evidence: str, haystack_norm: str, haystack_tokens: set[str]) -> float:
    """证据片段能在原文中被验证的比例，用于发现杜撰。"""
    snippet = str(evidence or "").strip()
    if not snippet:
        return 0.0
    if normalize_for_match(snippet) and normalize_for_match(snippet) in haystack_norm:
        return 1.0
    tokens = text_tokens(snippet)
    if not tokens:
        return 0.0
    hit = sum(1 for token in tokens if token in haystack_tokens)
    return hit / len(tokens)


def article_text(article: dict[str, Any]) -> str:
    return " ".join(
        [
            article.get("title", ""),
            article.get("summary", ""),
            article.get("source", ""),
            " ".join(article.get("detail", [])),
        ]
    )


def relation_endpoints(relation: dict[str, Any]) -> tuple[str, str]:
    source = relation.get("source") or relation.get("source_name") or ""
    target = relation.get("target") or relation.get("target_name") or ""
    return str(source), str(target)


def collect_llm_articles(payload: Any) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    if isinstance(payload, dict):
        entries = payload.get("articles")
    elif isinstance(payload, list):
        entries = payload
    else:
        entries = None
    for entry in entries or []:
        if isinstance(entry, dict) and entry.get("article_id"):
            lookup[str(entry["article_id"])] = entry
    return lookup


def audit_day(root: pathlib.Path, day: str, kg_llm_dir: pathlib.Path | None = None) -> dict[str, Any]:
    kg_llm_dir = kg_llm_dir or (root / "kg_llm")
    payload_path = kg_llm_dir / f"{day}.json"
    _, articles_by_day, _ = static_pipeline.load_articles(root / "news")
    articles = articles_by_day.get(day, [])

    if not articles:
        raise FileNotFoundError(f"news day not found: {day}")
    if not payload_path.exists():
        raise FileNotFoundError(f"kg_llm payload not found: {payload_path}")

    llm_articles = collect_llm_articles(json.loads(payload_path.read_text(encoding="utf-8")))

    issues: list[str] = []
    fixes: list[str] = []

    missing_articles: list[str] = []
    no_event_articles: list[str] = []
    thin_relation_articles: list[str] = []
    missing_why: list[str] = []
    generic_why: list[str] = []
    unverified_evidence: list[str] = []
    missing_evidence: list[str] = []
    generic_entities: list[str] = []
    duplicate_entities: list[str] = []
    dangling_relations: list[str] = []
    missing_metrics: list[str] = []

    entity_total = 0
    event_total = 0
    relation_total = 0
    evidence_total = 0
    evidence_ok = 0
    orphan_total = 0
    relation_types: Counter[str] = Counter()
    entity_day_index: defaultdict[str, set[str]] = defaultdict(set)
    why_texts: list[str] = []

    for article in articles:
        article_id = article["article_id"]
        record = llm_articles.get(article_id)
        if not record:
            missing_articles.append(article_id)
            continue

        raw_text = article_text(article)
        haystack_norm = normalize_for_match(raw_text)
        haystack_tokens = set(text_tokens(raw_text))

        entities = [e for e in record.get("entities", []) if isinstance(e, dict)]
        events = [e for e in record.get("events", []) if isinstance(e, dict)]
        relations = [r for r in record.get("relations", []) if isinstance(r, dict)]
        metrics = [m for m in record.get("metrics", []) if isinstance(m, dict)]

        entity_total += len(entities)
        event_total += len(events)
        relation_total += len(relations)

        if not events:
            no_event_articles.append(article_id)
        if len(relations) < 2:
            thin_relation_articles.append(f"{article_id}({len(relations)})")

        entity_keys: dict[str, str] = {}
        seen_norm: dict[str, str] = {}
        for entity in entities:
            name = str(entity.get("name") or "").strip()
            key = normalize_name(name)
            if not key:
                continue
            entity_keys[key] = name
            entity_day_index[key].add(article_id)
            if key in GENERIC_NAMES or normalize_for_match(name) in GENERIC_NAMES:
                generic_entities.append(f"{article_id}:{name}")
            squashed = re.sub(r"\d+(\.\d+)?", "#", key)
            if squashed in seen_norm and seen_norm[squashed] != name:
                duplicate_entities.append(f"{article_id}:{seen_norm[squashed]} / {name}")
            seen_norm.setdefault(squashed, name)

            evidences = [str(x) for x in entity.get("evidence", []) if str(x).strip()]
            if not evidences:
                missing_evidence.append(f"{article_id}:entity:{name}")
            for snippet in evidences:
                evidence_total += 1
                if evidence_match_ratio(snippet, haystack_norm, haystack_tokens) >= EVIDENCE_MATCH_THRESHOLD:
                    evidence_ok += 1
                else:
                    unverified_evidence.append(f"{article_id}:{name}:{snippet[:40]}")

        linked_keys: set[str] = set()
        for event in events:
            for participant in event.get("participants", []):
                if isinstance(participant, dict):
                    linked_keys.add(normalize_name(participant.get("name", "")))
            for snippet in [str(x) for x in event.get("evidence", []) if str(x).strip()]:
                evidence_total += 1
                if evidence_match_ratio(snippet, haystack_norm, haystack_tokens) >= EVIDENCE_MATCH_THRESHOLD:
                    evidence_ok += 1
                else:
                    unverified_evidence.append(f"{article_id}:event:{snippet[:40]}")

        for relation in relations:
            source, target = relation_endpoints(relation)
            relation_types[str(relation.get("type") or relation.get("relation_type") or "")] += 1
            source_key, target_key = normalize_name(source), normalize_name(target)
            linked_keys.update({source_key, target_key})
            if source_key not in entity_keys or target_key not in entity_keys:
                dangling_relations.append(f"{article_id}:{source}->{target}")

        orphan_total += sum(1 for key in entity_keys if key not in linked_keys)

        why = str(record.get("why_it_matters") or "").strip()
        if not why:
            missing_why.append(article_id)
        else:
            why_texts.append(why)
            if any(re.search(pattern, why) for pattern in GENERIC_WHY_PATTERNS) or len(why) < 12:
                generic_why.append(f"{article_id}:{why[:30]}")

        if not metrics and re.search(r"\d+(?:\.\d+)?\s*(?:%|亿|万|倍|美元|billion|million|ms|B\b)", raw_text):
            missing_metrics.append(article_id)

    covered = max(1, len(articles) - len(missing_articles))
    relations_per_article = relation_total / covered
    events_per_article = event_total / covered
    orphan_ratio = orphan_total / entity_total if entity_total else 1.0
    evidence_ratio = evidence_ok / evidence_total if evidence_total else 0.0
    cross_article_entities = sum(1 for ids in entity_day_index.values() if len(ids) >= 2)
    duplicate_why = len(why_texts) - len(set(why_texts))

    # --- 打分 ---
    coverage_score = 15.0
    if missing_articles:
        coverage_score -= min(15.0, 15.0 * len(missing_articles) / len(articles))
    if missing_why:
        coverage_score -= min(5.0, len(missing_why))
    coverage_score = max(0.0, coverage_score)

    relation_score = 20.0 * min(1.0, relations_per_article / TARGET_RELATIONS_PER_ARTICLE)
    if len(relation_types) >= 4:
        relation_score = min(20.0, relation_score + 2.0)
    relation_score -= min(5.0, len(dangling_relations) * 1.0)
    relation_score = max(0.0, relation_score)

    event_score = 10.0 * min(1.0, events_per_article / TARGET_EVENTS_PER_ARTICLE)
    event_score -= min(5.0, len(no_event_articles) * 1.5)
    event_score = max(0.0, event_score)

    connectivity_score = 15.0
    if orphan_ratio > MAX_ORPHAN_RATIO:
        connectivity_score -= min(10.0, (orphan_ratio - MAX_ORPHAN_RATIO) * 40)
    connectivity_score = max(0.0, connectivity_score * (0.7 + 0.3 * min(1.0, cross_article_entities / 3)))

    evidence_score = 20.0 * evidence_ratio
    evidence_score -= min(6.0, len(missing_evidence) * 0.5)
    evidence_score = max(0.0, evidence_score)

    precision_score = 10.0
    precision_score -= min(5.0, len(generic_entities) * 1.0)
    precision_score -= min(5.0, len(duplicate_entities) * 1.0)
    precision_score = max(0.0, precision_score)

    substance_score = 10.0
    substance_score -= min(4.0, len(missing_metrics) * 0.8)
    substance_score -= min(4.0, len(generic_why) * 1.0)
    substance_score -= min(2.0, duplicate_why * 1.0)
    substance_score = max(0.0, substance_score)

    score = round(
        coverage_score
        + relation_score
        + event_score
        + connectivity_score
        + evidence_score
        + precision_score
        + substance_score,
        1,
    )

    def add_issue(condition: bool, issue: str, fix: str) -> None:
        if condition:
            issues.append(issue)
            fixes.append(fix)

    add_issue(
        bool(missing_articles),
        f"{len(missing_articles)} 篇新闻没有抽取记录：{', '.join(missing_articles[:5])}",
        "为每篇 news 条目补齐 article_id 对应的抽取记录。",
    )
    add_issue(
        relations_per_article < TARGET_RELATIONS_PER_ARTICLE,
        f"关系密度偏低：平均每篇 {relations_per_article:.2f} 条（目标 ≥{TARGET_RELATIONS_PER_ARTICLE}）",
        "为每篇补足主体→客体的显式关系：谁发布了什么、谁与谁合作、谁在什么基准上被评测。",
    )
    add_issue(
        bool(thin_relation_articles),
        f"关系不足 2 条的文章：{', '.join(thin_relation_articles[:6])}",
        "针对这些文章补充关系，不要只列实体。",
    )
    add_issue(
        events_per_article < TARGET_EVENTS_PER_ARTICLE,
        f"事件覆盖偏低：平均每篇 {events_per_article:.2f} 个（目标 ≥{TARGET_EVENTS_PER_ARTICLE}）",
        "一篇新闻往往含多个事件（发布 + 评测 + 合作），分别建模而不是合并成一个。",
    )
    add_issue(
        orphan_ratio > MAX_ORPHAN_RATIO,
        f"孤立实体比例 {orphan_ratio:.0%}（目标 ≤{MAX_ORPHAN_RATIO:.0%}）",
        "每个实体都要出现在某个事件 participants 或关系端点上，否则删掉它。",
    )
    add_issue(
        cross_article_entities < 3,
        f"跨文章共享实体仅 {cross_article_entities} 个",
        "同一主体在多篇出现时使用完全一致的 name 和 type，让图谱跨文章连起来。",
    )
    add_issue(
        evidence_ratio < 0.8,
        f"证据可验证率 {evidence_ratio:.0%}（目标 ≥80%）",
        "evidence 必须摘自原文，不要改写或概括。",
    )
    add_issue(
        bool(unverified_evidence),
        f"{len(unverified_evidence)} 条证据无法在原文匹配：{unverified_evidence[0] if unverified_evidence else ''}",
        "把这些证据替换成原文里的真实片段。",
    )
    add_issue(
        bool(dangling_relations),
        f"{len(dangling_relations)} 条关系端点不在实体表：{', '.join(dangling_relations[:4])}",
        "relations 的 source/target 必须与本篇 entities 的 name 完全一致。",
    )
    add_issue(
        bool(generic_entities),
        f"存在泛化实体：{', '.join(generic_entities[:5])}",
        "删除 AI / 模型 / 平台 这类无信息量节点，换成具体主体。",
    )
    add_issue(
        bool(duplicate_entities),
        f"疑似重复实体：{', '.join(duplicate_entities[:4])}",
        "同一实体合并为一个规范名，变体放进 aliases。",
    )
    add_issue(
        bool(missing_metrics),
        f"{len(missing_metrics)} 篇有数字但没抽 metrics：{', '.join(missing_metrics[:5])}",
        "把分数、金额、倍数、延迟等关键数字抽进 metrics。",
    )
    add_issue(
        bool(generic_why) or duplicate_why > 0,
        f"{len(generic_why)} 条 why_it_matters 空洞、{duplicate_why} 条重复",
        "why_it_matters 要写出这条信息改变了什么判断，不要写“值得关注”。",
    )

    # 单项崩盘不能被其他项的满分掩盖：这些是图谱可用性的下限。
    blockers: list[str] = []
    if missing_articles:
        blockers.append(f"{len(missing_articles)} 篇新闻完全没有抽取记录")
    if relations_per_article < 2.0:
        blockers.append(f"关系密度 {relations_per_article:.2f} 低于硬下限 2.0")
    if no_event_articles:
        blockers.append(f"{len(no_event_articles)} 篇没有任何事件")
    if orphan_ratio > 0.4:
        blockers.append(f"孤立实体比例 {orphan_ratio:.0%} 超过硬上限 40%")
    if evidence_ratio < 0.8:
        blockers.append(f"证据可验证率 {evidence_ratio:.0%} 低于硬下限 80%")
    if len(dangling_relations) > 2:
        blockers.append(f"{len(dangling_relations)} 条关系端点无法在实体表中解析，会被构建流程丢弃")

    return {
        "date": day,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "score": score,
        "passed": score >= PASS_SCORE and not blockers,
        "blockers": blockers,
        "pass_score": PASS_SCORE,
        "breakdown": {
            "coverage": round(coverage_score, 1),
            "relations": round(relation_score, 1),
            "events": round(event_score, 1),
            "connectivity": round(connectivity_score, 1),
            "evidence": round(evidence_score, 1),
            "precision": round(precision_score, 1),
            "substance": round(substance_score, 1),
        },
        "stats": {
            "articles": len(articles),
            "articles_extracted": covered,
            "entities": entity_total,
            "events": event_total,
            "relations": relation_total,
            "relations_per_article": round(relations_per_article, 2),
            "events_per_article": round(events_per_article, 2),
            "orphan_entity_ratio": round(orphan_ratio, 3),
            "evidence_verified_ratio": round(evidence_ratio, 3),
            "cross_article_entities": cross_article_entities,
            "relation_types": dict(relation_types),
        },
        "issues": issues,
        "fixes": fixes,
    }


def append_quality_log(root: pathlib.Path, report: dict[str, Any]) -> pathlib.Path:
    log_path = root / "kg_llm" / "quality-log.jsonl"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    entry: dict[str, Any] = {
        "date": report["date"],
        "generated_at": report["generated_at"],
        "score": report["score"],
        "passed": report["passed"],
        "breakdown": report["breakdown"],
        "stats": report["stats"],
        "issues": report["issues"],
        "fixes": report["fixes"],
        "blockers": report["blockers"],
    }
    # 同一天只保留最后一次结果，重跑不会污染趋势线。
    kept: list[dict[str, Any]] = []
    if log_path.exists():
        for line in log_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                existing = json.loads(line)
            except json.JSONDecodeError:
                continue
            if existing.get("date") != entry["date"]:
                kept.append(existing)
    kept.append(entry)
    kept.sort(key=lambda item: str(item.get("date", "")))
    log_path.write_text(
        "".join(json.dumps(item, ensure_ascii=False) + "\n" for item in kept),
        encoding="utf-8",
        newline="\n",
    )
    return log_path


def recent_scores(root: pathlib.Path, limit: int = 7) -> list[dict[str, Any]]:
    log_path = root / "kg_llm" / "quality-log.jsonl"
    if not log_path.exists():
        return []
    entries: list[dict[str, Any]] = []
    for line in log_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return entries[-limit:]


def format_report(report: dict[str, Any], root: pathlib.Path | None = None) -> str:
    lines = [
        f"KG 抽取质量审计：{report['date']}",
        f"得分：{report['score']} / 100（及格线 {report['pass_score']}）  {'通过' if report['passed'] else '未通过，需要修订后重新抽取'}",
        "",
        "分项：" + "、".join(f"{key} {value}" for key, value in report["breakdown"].items()),
        "",
        "关键指标：",
    ]
    stats = report["stats"]
    lines.extend(
        [
            f"- 文章 {stats['articles_extracted']}/{stats['articles']}，实体 {stats['entities']}，事件 {stats['events']}，关系 {stats['relations']}",
            f"- 每篇关系 {stats['relations_per_article']}（目标 ≥{TARGET_RELATIONS_PER_ARTICLE}），每篇事件 {stats['events_per_article']}（目标 ≥{TARGET_EVENTS_PER_ARTICLE}）",
            f"- 孤立实体比例 {stats['orphan_entity_ratio']:.0%}，证据可验证率 {stats['evidence_verified_ratio']:.0%}，跨文章共享实体 {stats['cross_article_entities']}",
        ]
    )
    if report["blockers"]:
        lines.append("")
        lines.append("硬性阻断项（任一存在即判不通过）：")
        lines.extend(f"- {item}" for item in report["blockers"])
    if report["issues"]:
        lines.append("")
        lines.append("问题与改进项：")
        for issue, fix in zip(report["issues"], report["fixes"]):
            lines.append(f"- {issue}")
            lines.append(f"  → {fix}")
    if root is not None:
        history = recent_scores(root)
        if len(history) > 1:
            trend = "、".join(f"{item['date']}:{item['score']}" for item in history)
            lines.append("")
            lines.append(f"近期得分趋势：{trend}")
    return "\n".join(lines) + "\n"
