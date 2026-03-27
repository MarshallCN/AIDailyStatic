from __future__ import annotations

import datetime as dt
import hashlib
import json
import pathlib
import re
from collections import Counter, defaultdict
from typing import Any, Iterable


FIXED_CATEGORIES = [
    "应用/产业",
    "论文",
    "基础设施",
    "安全",
    "生态",
    "开源",
    "观察",
]

ENTITY_TYPES = [
    "company",
    "organization",
    "person",
    "model",
    "product",
    "paper",
    "tool",
    "hardware",
    "benchmark",
    "policy",
    "topic",
]

EVENT_TYPES = [
    "launch",
    "research",
    "benchmark",
    "partnership",
    "funding",
    "acquisition",
    "open_source",
    "policy",
    "security",
    "infra",
    "trend",
]

EN_STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "being", "by", "for", "from", "has",
    "have", "if", "in", "into", "is", "it", "its", "of", "on", "or", "the", "their", "this",
    "that", "these", "those", "to", "via", "was", "were", "with",
}

ZH_STOP_WORDS = {
    "这个", "这次", "这些", "一种", "一个", "一些", "以及", "继续", "正在", "已经", "相关", "更多",
    "其中", "通过", "同时", "可能", "需要", "系统", "平台", "产品", "模型", "我们", "行业", "技术",
    "公司", "企业", "方面", "消息", "过程", "能力", "部署", "今天", "当前", "发展", "观察", "生态",
}

NOISE_WORDS = {
    "ai", "llm", "llms", "api", "apis", "app", "apps", "agent", "agents", "service", "services",
    "system", "systems", "product", "products", "platform", "platforms", "news", "update", "updates",
    "today", "company", "companies", "industry", "行业", "新闻", "系统", "平台", "产品", "模型",
}

ENTITY_HINTS = {
    "company": [
        "openai", "anthropic", "meta", "microsoft", "google", "nvidia", "apple", "amazon",
        "mistral", "cohere", "bytedance", "shield ai", "conntour", "hugging face", "techcrunch",
    ],
    "organization": [
        "university", "institute", "foundation", "committee", "senate", "government", "lab", "labs",
        "research", "协会", "委员会", "研究院",
    ],
    "model": [
        "gpt", "claude", "gemini", "llama", "qwen", "deepseek", "seedance", "voxtral",
        "transcribe", "hivemind", "model",
    ],
    "product": ["whatsapp", "capcut", "chatgpt", "copilot", "assistant", "dreamina", "north"],
    "tool": ["sdk", "framework", "tool", "tools", "engine", "stack", "vault", "workflow", "litellm"],
    "hardware": ["gpu", "gpus", "h100", "b200", "rtx", "tpu", "accelerator", "chip", "data center", "datacenter"],
    "benchmark": ["benchmark", "leaderboard", "arena", "score", "eval"],
    "policy": ["policy", "regulation", "bill", "act", "soc2", "iso", "compliance", "security policy"],
}

EVENT_PATTERNS = {
    "funding": [r"\b(raise|raises|raised|funding|valuation|series\s+[a-z])\b", r"融资|估值|募资"],
    "acquisition": [r"\b(acquire|acquires|acquired|buying|purchase)\b", r"收购|并购"],
    "partnership": [r"\b(partner|partners|partnership|collaboration|integrates?)\b", r"合作|集成|联手"],
    "open_source": [r"\b(open source|open-source|open weights)\b", r"开源"],
    "research": [r"\b(arxiv|paper|research|study|benchmarking?)\b", r"论文|研究"],
    "benchmark": [r"\b(benchmark|leaderboard|score|ranked?)\b", r"基准|排行|评测"],
    "policy": [r"\b(policy|regulation|government|senator|compliance|audit)\b", r"政策|法案|监管|审计"],
    "security": [r"\b(security|malware|breach|outage|risk|vulnerability)\b", r"安全|恶意软件|漏洞|风险"],
    "infra": [r"\b(gpu|training|inference|latency|throughput|data center|datacenter|infrastructure)\b", r"基础设施|推理|训练|数据中心"],
    "trend": [r"\b(trend|analysis|insight|cracks down|shift)\b", r"观察|趋势|洞察|收紧"],
    "launch": [r"\b(release|releases|released|launch|launches|launched|comes to|introduces?)\b", r"发布|推出|上线|进入"],
}

KG_TEMPLATE_NAME = "kg-extract.md"
INSIGHT_TEMPLATE_NAME = "insights.md"


def normalize_line_endings(value: str) -> str:
    return str(value or "").replace("\r\n", "\n").replace("\r", "\n")


def normalize_text(value: str) -> str:
    return normalize_line_endings(str(value or "")).replace("\u00a0", " ").strip()


def normalize_compare(value: str) -> str:
    return normalize_text(value).lower().replace("_", " ").replace("-", " ")


def trim_token(token: str) -> str:
    token = re.sub(r"^[^0-9A-Za-z\u4e00-\u9fff.+-]+", "", str(token or ""))
    token = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff.+-]+$", "", token)
    return re.sub(r"\s+", " ", token).strip()


def slugify(value: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "-", normalize_text(value).lower())).strip("-")[:64] or "item"


def stable_hash(value: str) -> str:
    return hashlib.sha1(str(value or "").encode("utf-8")).hexdigest()[:12]


def unique(values: Iterable[Any]) -> list[Any]:
    result: list[Any] = []
    seen: set[Any] = set()
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def unique_by(values: Iterable[Any], key_fn) -> list[Any]:
    result: list[Any] = []
    seen: set[Any] = set()
    for value in values:
        key = key_fn(value)
        if key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result


def parse_categories(value: str | list[str]) -> list[str]:
    if isinstance(value, list):
        return [str(part).strip() for part in value if str(part).strip()]
    return [part.strip() for part in str(value or "").split(",") if part.strip()]


def safe_read_json(path: pathlib.Path | None) -> Any:
    if not path or not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def dump_json(path: pathlib.Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def read_template(prompts_dir: pathlib.Path, name: str) -> str:
    path = prompts_dir / name
    return path.read_text(encoding="utf-8") if path.exists() else ""


def render_template(template: str, replacements: dict[str, str]) -> str:
    result = template
    for key, value in replacements.items():
        result = result.replace("{{" + key + "}}", value)
    return result


def parse_date(date_str: str) -> dt.date:
    return dt.date.fromisoformat(date_str)


def read_field(block: str, key: str) -> str:
    pattern = re.compile(
        rf"(?:^|\n)-\s*{re.escape(key)}:\s*([\s\S]*?)(?=\n-\s*[a-z]+:\s|\n##\s+|$)",
        re.IGNORECASE,
    )
    match = pattern.search(block)
    if not match:
        return ""
    raw = normalize_line_endings(match.group(1))
    if re.match(r"^\|(?:\s*\n|$)", raw):
        body = re.sub(r"^\|\s*\n?", "", raw, count=1)
        lines = body.split("\n")
        meaningful = [line for line in lines if line.strip()]
        min_indent = min((len(re.match(r"^\s*", line).group(0)) for line in meaningful), default=0)
        return "\n".join(line[min_indent:] if len(line) >= min_indent else "" for line in lines).strip()
    return "\n".join(part.strip() for part in raw.split("\n")).strip()


def parse_news_markdown(raw: str, fallback_day: str) -> tuple[str, list[dict[str, Any]]]:
    normalized = normalize_line_endings(raw)
    day_match = re.search(r"^day:\s*(\d{4}-\d{2}-\d{2})\s*$", normalized, re.MULTILINE)
    day = day_match.group(1) if day_match else fallback_day
    parts = re.split(r"\n##\s+", normalized)
    blocks = ["## " + part for index, part in enumerate(parts) if index > 0]
    items: list[dict[str, Any]] = []
    for block in blocks:
        title_match = re.search(r"^##\s+(.+)$", block, re.MULTILINE)
        detail = read_field(block, "detail")
        items.append(
            {
                "title": title_match.group(1).strip() if title_match else "无标题",
                "source": read_field(block, "source"),
                "date": read_field(block, "date") or day,
                "category": parse_categories(read_field(block, "category")),
                "url": read_field(block, "url"),
                "summary": read_field(block, "summary"),
                "detail": [paragraph.strip() for paragraph in re.split(r"\n\s*\n", detail) if paragraph.strip()],
            }
        )
    return day, items


def load_articles(news_dir: pathlib.Path) -> tuple[list[str], dict[str, list[dict[str, Any]]], dict[str, dict[str, Any]]]:
    files = sorted(news_dir.glob("*.md"), key=lambda path: path.name)
    days: list[str] = []
    articles_by_day: dict[str, list[dict[str, Any]]] = {}
    article_lookup: dict[str, dict[str, Any]] = {}
    for path in files:
        match = re.search(r"(\d{4}-\d{2}-\d{2})", path.name)
        fallback_day = match.group(1) if match else "1970-01-01"
        parsed_day, items = parse_news_markdown(path.read_text(encoding="utf-8"), fallback_day)
        normalized_items: list[dict[str, Any]] = []
        for index, item in enumerate(items):
            article = {
                "article_id": f"{parsed_day}-{index}",
                "day": parsed_day,
                "title": item["title"],
                "source": item["source"],
                "date": item["date"] or parsed_day,
                "category": parse_categories(item["category"]),
                "url": item["url"],
                "summary": item["summary"],
                "detail": item["detail"],
            }
            normalized_items.append(article)
            article_lookup[article["article_id"]] = article
        days.append(parsed_day)
        articles_by_day[parsed_day] = normalized_items
    return days, articles_by_day, article_lookup


def is_chinese_token(token: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", token))


def should_keep_token(token: str) -> bool:
    cleaned = trim_token(token)
    lower = normalize_compare(cleaned)
    if not cleaned or lower in NOISE_WORDS:
        return False
    if is_chinese_token(cleaned):
        return 2 <= len(cleaned) <= 8 and cleaned not in ZH_STOP_WORDS
    return len(cleaned) >= 2 and lower not in EN_STOP_WORDS


def collect_entity_candidates(text: str) -> list[str]:
    source = normalize_text(text)
    patterns = [
        r"\b[A-Z][A-Za-z0-9.+-]*(?:\s+[A-Z][A-Za-z0-9.+-]*){0,3}\b",
        r"\b(?:GPT-?\d+(?:\.\d+)?|Claude(?:\s+\w+)?|Gemini(?:\s+\w+)?|Llama(?:\s*\d+(?:\.\d+)?)?|Qwen(?:\s*\d+(?:\.\d+)?)?|DeepSeek(?:\s+\w+)?|Mistral(?:\s+\w+)?|Voxtral(?:\s+\w+)?|Seedance(?:\s+\w+)?|Hivemind|LiteLLM|CapCut|WhatsApp|Wikipedia|TechCrunch|OpenAI|Anthropic|NVIDIA|Meta|Microsoft|Cohere|Shield AI|Conntour)\b",
        r"[\u4e00-\u9fff]{2,8}",
    ]
    candidates: list[str] = []
    seen: set[str] = set()
    for pattern in patterns:
        for match in re.findall(pattern, source):
            cleaned = trim_token(match)
            key = normalize_compare(cleaned)
            if not should_keep_token(cleaned) or key in seen:
                continue
            seen.add(key)
            candidates.append(cleaned)
    return candidates


def infer_entity_type(name: str, article: dict[str, Any]) -> str:
    lower = normalize_compare(name)
    categories = parse_categories(article.get("category", []))
    if "论文" in categories and lower == normalize_compare(article.get("title", "")):
        return "paper"
    for hint in ENTITY_HINTS["model"]:
        if hint in lower:
            return "tool" if re.search(r"tool|stack|framework|engine|vault|litellm", lower) else "model"
    for label in ("hardware", "benchmark", "policy", "product", "tool", "company", "organization"):
        if any(hint in lower for hint in ENTITY_HINTS[label]):
            return label
    if re.fullmatch(r"[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}", name):
        return "person"
    if "论文" in categories and len(name) > 24:
        return "paper"
    return "topic" if is_chinese_token(name) else "organization"


def extract_metrics(article: dict[str, Any]) -> list[dict[str, str]]:
    text = " ".join([article.get("title", ""), article.get("summary", ""), " ".join(article.get("detail", []))])
    patterns = [
        ("money", r"(?:\$|US\$)?\d+(?:\.\d+)?\s?(?:billion|million|bn|B|M|亿美元|万元|亿元)"),
        ("latency", r"\d+(?:\.\d+)?\s?(?:ms|秒|毫秒)\b"),
        ("ratio", r"\d+(?:\.\d+)?\s?(?:x|倍)\b"),
        ("percentage", r"\d+(?:\.\d+)?\s?%"),
        ("count", r"\d+(?:\.\d+)?\s?(?:languages|种语言|条|路|个|项)\b"),
    ]
    metrics: list[dict[str, str]] = []
    for name, pattern in patterns:
        for match in re.findall(pattern, text, re.IGNORECASE):
            metrics.append({"name": name, "value": trim_token(match)})
    return unique_by(metrics, lambda entry: (entry["name"], entry["value"]))[:6]


def infer_event_types(article: dict[str, Any]) -> list[str]:
    categories = parse_categories(article.get("category", []))
    text = normalize_text(" ".join([article.get("title", ""), article.get("summary", ""), " ".join(article.get("detail", []))]))
    scores: Counter[str] = Counter()
    for event_type, patterns in EVENT_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text, re.IGNORECASE):
                scores[event_type] += 1
    if "论文" in categories:
        scores["research"] += 2
    if "基础设施" in categories:
        scores["infra"] += 2
    if "开源" in categories:
        scores["open_source"] += 2
    if "安全" in categories:
        scores["security"] += 2
    if "观察" in categories:
        scores["trend"] += 2
    if "生态" in categories:
        scores["partnership"] += 1
    if "应用/产业" in categories:
        scores["launch"] += 1
    ranked = [event_type for event_type, _ in sorted(scores.items(), key=lambda item: (-item[1], item[0]))]
    return ranked[:2] or ["launch"]


def build_why_it_matters(article: dict[str, Any], event_types: list[str], entities: list[dict[str, Any]]) -> str:
    if article.get("summary"):
        return article["summary"]
    lead = entities[0]["name"] if entities else article.get("source") or "该信号"
    event_type = event_types[0] if event_types else "launch"
    templates = {
        "funding": f"{lead} 相关融资/估值信号说明资本仍在集中押注该方向。",
        "acquisition": f"{lead} 的并购动作意味着产业链整合还在继续。",
        "partnership": f"{lead} 的合作信号说明生态互联仍是落地重点。",
        "open_source": f"{lead} 的开源动作会继续放大生态扩散速度。",
        "research": f"{lead} 相关研究结果值得继续跟踪其工程化落地。",
        "benchmark": f"{lead} 的基准变化反映能力或评测标准正在移动。",
        "policy": f"{lead} 的政策与合规变化会直接影响后续部署节奏。",
        "security": f"{lead} 的安全风险提示该方向仍有治理压力。",
        "infra": f"{lead} 的基础设施信号会影响后续成本与性能拐点。",
        "trend": f"{lead} 的连续出现说明它已经形成值得跟踪的趋势线索。",
        "launch": f"{lead} 的发布/上线信号说明产品化推进仍在加速。",
    }
    return templates.get(event_type, templates["launch"])


def build_rule_signal_record(article: dict[str, Any]) -> dict[str, Any]:
    score_map: dict[str, dict[str, Any]] = {}

    def add_entity(name: str, weight: float) -> None:
        cleaned = trim_token(name)
        key = normalize_compare(cleaned)
        if not cleaned or not should_keep_token(cleaned) or key in NOISE_WORDS:
            return
        current = score_map.get(key, {"name": cleaned, "score": 0.0, "aliases": {cleaned}, "evidence": {cleaned}})
        current["score"] += weight
        current["aliases"].add(cleaned)
        current["evidence"].add(cleaned)
        score_map[key] = current

    title_summary = normalize_text(" ".join([article.get("title", ""), article.get("summary", "")]))
    body = normalize_text(" ".join(article.get("detail", [])))
    for candidate in collect_entity_candidates(title_summary):
        add_entity(candidate, 3.2)
    for candidate in collect_entity_candidates(body)[:24]:
        add_entity(candidate, 1.1)
    if "论文" in parse_categories(article.get("category", [])):
        add_entity(article.get("title", ""), 4.5)

    entities = []
    for entry in sorted(score_map.values(), key=lambda item: (-item["score"], item["name"]))[:8]:
        entity_type = infer_entity_type(entry["name"], article)
        entities.append(
            {
                "entity_id": "entity:" + slugify(f"{entity_type}-{entry['name']}"),
                "name": entry["name"],
                "canonical_name": entry["name"],
                "type": entity_type if entity_type in ENTITY_TYPES else "topic",
                "aliases": sorted(entry["aliases"]),
                "confidence": min(0.96, 0.42 + entry["score"] * 0.08),
                "evidence": sorted(entry["evidence"])[:3],
                "provenance": "rule",
            }
        )

    event_types = infer_event_types(article)
    primary_entity = entities[0] if entities else None
    events = []
    for event_type in event_types:
        seed = primary_entity["entity_id"] if primary_entity else article["article_id"]
        events.append(
            {
                "event_id": "event:" + slugify(f"{event_type}-{seed}"),
                "event_type": event_type,
                "label": article.get("title", ""),
                "summary": article.get("summary") or article.get("title", ""),
                "participants": [
                    {
                        "entity_id": entity["entity_id"],
                        "name": entity["name"],
                        "type": entity["type"],
                        "role": "subject" if index == 0 else "participant",
                    }
                    for index, entity in enumerate(entities[:4])
                ],
                "evidence": [article.get("summary") or article.get("title", "")],
            }
        )

    relations = []
    if len(entities) >= 2 and events:
        main_event_type = events[0]["event_type"]
        for entity in entities[1:4]:
            relations.append(
                {
                    "relation_id": "relation:" + stable_hash(f"{article['article_id']}:{entities[0]['entity_id']}:{entity['entity_id']}:{main_event_type}"),
                    "source_entity_id": entities[0]["entity_id"],
                    "target_entity_id": entity["entity_id"],
                    "source_name": entities[0]["name"],
                    "target_name": entity["name"],
                    "relation_type": main_event_type,
                    "weight": 1,
                    "evidence": [article.get("summary") or article.get("title", "")],
                }
            )

    return {
        "article_id": article["article_id"],
        "title": article.get("title", ""),
        "source": article.get("source", ""),
        "date": article.get("date", article.get("day", "")),
        "category": parse_categories(article.get("category", [])),
        "url": article.get("url", ""),
        "summary": article.get("summary", ""),
        "why_it_matters": build_why_it_matters(article, event_types, entities),
        "entities": entities,
        "events": events,
        "relations": relations,
        "metrics": extract_metrics(article),
        "fallback": {
            "used_rule_fallback": True,
            "rule_entities": [entry["name"] for entry in entities],
            "rule_event_types": list(event_types),
        },
    }


def normalize_type(value: str, allowed: list[str], fallback: str) -> str:
    candidate = normalize_compare(value).replace(" ", "_")
    return candidate if candidate in allowed else fallback


def build_entity_lookup(entities: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for entity in entities:
        lookup[entity["entity_id"]] = entity
        lookup[normalize_compare(entity["name"])] = entity
        lookup[f"{entity.get('type', 'topic')}:{normalize_compare(entity['name'])}"] = entity
        for alias in entity.get("aliases", []):
            lookup[normalize_compare(alias)] = entity
    return lookup


def merge_signal_record_with_llm(rule_record: dict[str, Any], llm_article: dict[str, Any] | None) -> dict[str, Any]:
    if not llm_article:
        return rule_record
    merged = json.loads(json.dumps(rule_record))
    entity_lookup = build_entity_lookup(merged.get("entities", []))

    def upsert_entity(raw_entity: dict[str, Any]) -> dict[str, Any] | None:
        name = trim_token(raw_entity.get("name"))
        if not name:
            return None
        entity_type = normalize_type(raw_entity.get("type") or infer_entity_type(name, rule_record), ENTITY_TYPES, "topic")
        key = f"{entity_type}:{normalize_compare(name)}"
        entity = entity_lookup.get(key)
        if entity is None:
            entity = {
                "entity_id": raw_entity.get("entity_id") or ("entity:" + slugify(f"{entity_type}-{name}")),
                "name": name,
                "canonical_name": raw_entity.get("canonical_name") or name,
                "type": entity_type,
                "aliases": [],
                "confidence": 0.76,
                "evidence": [],
                "provenance": "llm",
            }
        entity["aliases"] = unique(entity.get("aliases", []) + raw_entity.get("aliases", []) + [name])
        entity["evidence"] = unique(entity.get("evidence", []) + raw_entity.get("evidence", []))
        entity["confidence"] = max(float(entity.get("confidence", 0) or 0), float(raw_entity.get("confidence", 0.8) or 0.8))
        entity["provenance"] = "merged" if entity.get("provenance") == "rule" else entity.get("provenance", "llm")
        entity_lookup[key] = entity
        entity_lookup[normalize_compare(name)] = entity
        for alias in entity.get("aliases", []):
            entity_lookup[normalize_compare(alias)] = entity
        return entity

    for raw_entity in llm_article.get("entities", []):
        upsert_entity(raw_entity)

    merged["entities"] = unique_by(
        [entry for entry in entity_lookup.values() if isinstance(entry, dict) and entry.get("entity_id")],
        lambda entry: f"{entry.get('type', 'topic')}:{normalize_compare(entry.get('name', ''))}",
    )

    lookup = build_entity_lookup(merged["entities"])
    events = []
    for index, event in enumerate(llm_article.get("events", [])):
        event_type = normalize_type(event.get("type") or event.get("event_type"), EVENT_TYPES, "launch")
        participants = []
        for participant in event.get("participants", []):
            entity = lookup.get(normalize_compare(participant.get("name", ""))) or upsert_entity(participant)
            if not entity:
                continue
            participants.append(
                {
                    "entity_id": entity["entity_id"],
                    "name": entity["name"],
                    "type": entity["type"],
                    "role": participant.get("role", "participant"),
                }
            )
        if not participants:
            participants = [
                {
                    "entity_id": entity["entity_id"],
                    "name": entity["name"],
                    "type": entity["type"],
                    "role": "subject" if entity_index == 0 else "participant",
                }
                for entity_index, entity in enumerate(merged["entities"][:3])
            ]
        events.append(
            {
                "event_id": event.get("event_id") or ("event:" + slugify(f"{event_type}-{participants[0]['entity_id'] if participants else merged['article_id']}-{index}")),
                "event_type": event_type,
                "label": trim_token(event.get("label")) or merged.get("title", ""),
                "summary": trim_token(event.get("summary")) or merged.get("summary") or merged.get("title", ""),
                "participants": participants,
                "evidence": unique(event.get("evidence", [])),
            }
        )

    relations = []
    for index, relation in enumerate(llm_article.get("relations", [])):
        source_entity = lookup.get(normalize_compare(relation.get("source") or relation.get("source_name") or ""))
        target_entity = lookup.get(normalize_compare(relation.get("target") or relation.get("target_name") or ""))
        if not source_entity or not target_entity:
            continue
        relations.append(
            {
                "relation_id": relation.get("relation_id") or ("relation:" + stable_hash(f"{merged['article_id']}:{source_entity['entity_id']}:{target_entity['entity_id']}:{index}")),
                "source_entity_id": source_entity["entity_id"],
                "target_entity_id": target_entity["entity_id"],
                "source_name": source_entity["name"],
                "target_name": target_entity["name"],
                "relation_type": normalize_type(relation.get("type") or relation.get("relation_type"), EVENT_TYPES, "trend"),
                "weight": float(relation.get("weight", 1) or 1),
                "evidence": unique(relation.get("evidence", [])),
            }
        )

    if events:
        merged["events"] = events
    if relations:
        merged["relations"] = relations
    merged["metrics"] = unique_by(list(merged.get("metrics", [])) + list(llm_article.get("metrics", [])), lambda metric: f"{metric.get('name')}:{metric.get('value')}")
    merged["why_it_matters"] = trim_token(llm_article.get("why_it_matters")) or merged.get("why_it_matters", "")
    merged["fallback"]["used_rule_fallback"] = not bool(llm_article.get("entities"))
    return merged


def normalize_llm_kg_payload(payload: Any) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    if payload is None:
        return lookup
    if isinstance(payload, list):
        for article in payload:
            if isinstance(article, dict) and article.get("article_id"):
                lookup[article["article_id"]] = article
        return lookup
    if isinstance(payload, dict):
        for key in ("articles", "signal_records"):
            entries = payload.get(key)
            if isinstance(entries, list):
                for article in entries:
                    if isinstance(article, dict) and article.get("article_id"):
                        lookup[article["article_id"]] = article
    return lookup


def build_signal_records(articles: list[dict[str, Any]], llm_payload: Any = None) -> list[dict[str, Any]]:
    llm_lookup = normalize_llm_kg_payload(llm_payload)
    return [merge_signal_record_with_llm(build_rule_signal_record(article), llm_lookup.get(article["article_id"])) for article in articles]


def ensure_node(node_map: dict[str, dict[str, Any]], nodes: list[dict[str, Any]], node_id: str, data: dict[str, Any]) -> dict[str, Any]:
    if node_id in node_map:
        existing = node_map[node_id]
        existing["article_ids"] = unique(existing.get("article_ids", []) + data.get("article_ids", []))
        if not existing.get("summary") and data.get("summary"):
            existing["summary"] = data["summary"]
        if not existing.get("subtype") and data.get("subtype"):
            existing["subtype"] = data["subtype"]
        if data.get("aliases"):
            existing["aliases"] = unique(existing.get("aliases", []) + data["aliases"])
        if data.get("metrics"):
            existing["metrics"] = unique_by(existing.get("metrics", []) + data["metrics"], lambda metric: f"{metric.get('name')}:{metric.get('value')}")
        existing["weight"] = max(float(existing.get("weight", 1) or 1), float(data.get("weight", 1) or 1))
        return existing
    node = {"id": node_id, "article_ids": unique(data.get("article_ids", [])), **data}
    node_map[node_id] = node
    nodes.append({"data": node})
    return node


def ensure_edge(edge_map: dict[str, dict[str, Any]], edges: list[dict[str, Any]], edge_id: str, data: dict[str, Any]) -> dict[str, Any]:
    if edge_id in edge_map:
        existing = edge_map[edge_id]
        existing["weight"] = float(existing.get("weight", 1) or 1) + float(data.get("weight", 1) or 1)
        existing["article_ids"] = unique(existing.get("article_ids", []) + data.get("article_ids", []))
        return existing
    edge = {"id": edge_id, "weight": float(data.get("weight", 1) or 1), "article_ids": unique(data.get("article_ids", [])), **data}
    edge_map[edge_id] = edge
    edges.append({"data": edge})
    return edge


def build_projection(records: list[dict[str, Any]]) -> tuple[dict[str, dict[str, float]], dict[str, dict[str, Any]]]:
    adjacency: dict[str, dict[str, float]] = {}
    node_meta: dict[str, dict[str, Any]] = {}

    def touch_node(node_id: str, meta: dict[str, Any]) -> None:
        current = node_meta.get(node_id, {"id": node_id, "label": meta["label"], "type": meta["type"], "article_ids": set(), "weight": 0.0})
        current["weight"] += float(meta.get("weight", 1) or 1)
        for article_id in meta.get("article_ids", []):
            current["article_ids"].add(article_id)
        node_meta[node_id] = current
        adjacency.setdefault(node_id, {})

    def add_weight(left: str, right: str, weight: float) -> None:
        if not left or not right or left == right:
            return
        adjacency.setdefault(left, {})
        adjacency.setdefault(right, {})
        adjacency[left][right] = adjacency[left].get(right, 0.0) + weight
        adjacency[right][left] = adjacency[right].get(left, 0.0) + weight

    for record in records:
        community_nodes: list[str] = []
        for entity in record.get("entities", []):
            touch_node(entity["entity_id"], {"label": entity["name"], "type": "entity", "article_ids": [record["article_id"]], "weight": entity.get("confidence", 1)})
            community_nodes.append(entity["entity_id"])
        for event in record.get("events", []):
            touch_node(event["event_id"], {"label": event["label"], "type": "event", "article_ids": [record["article_id"]], "weight": 1.6})
            community_nodes.append(event["event_id"])
            for participant in event.get("participants", []):
                touch_node(participant["entity_id"], {"label": participant["name"], "type": "entity", "article_ids": [record["article_id"]], "weight": 1})
                add_weight(event["event_id"], participant["entity_id"], 3.4)
        for relation in record.get("relations", []):
            touch_node(relation["source_entity_id"], {"label": relation["source_name"], "type": "entity", "article_ids": [record["article_id"]], "weight": 1})
            touch_node(relation["target_entity_id"], {"label": relation["target_name"], "type": "entity", "article_ids": [record["article_id"]], "weight": 1})
            add_weight(relation["source_entity_id"], relation["target_entity_id"], 4 + float(relation.get("weight", 1) or 1))
        unique_nodes = unique(community_nodes)
        for index, left in enumerate(unique_nodes):
            for right in unique_nodes[index + 1 :]:
                add_weight(left, right, 0.9)

    for meta in node_meta.values():
        meta["article_ids"] = sorted(meta["article_ids"])
    return adjacency, node_meta


def detect_communities(records: list[dict[str, Any]]) -> list[list[str]]:
    adjacency, node_meta = build_projection(records)
    node_ids = sorted(node_meta, key=lambda node_id: (-float(node_meta[node_id]["weight"]), node_meta[node_id]["label"]))
    labels = {node_id: node_id for node_id in node_ids}
    for _ in range(8):
        changed = False
        for node_id in node_ids:
            neighbor_map = adjacency.get(node_id, {})
            if not neighbor_map:
                continue
            label_scores: Counter[str] = Counter()
            for neighbor_id, weight in neighbor_map.items():
                label_scores[labels.get(neighbor_id, neighbor_id)] += weight
            if not label_scores:
                continue
            next_label = sorted(label_scores.items(), key=lambda item: (-item[1], item[0]))[0][0]
            if next_label != labels.get(node_id):
                labels[node_id] = next_label
                changed = True
        if not changed:
            break
    groups: defaultdict[str, list[str]] = defaultdict(list)
    for node_id, label in labels.items():
        groups[label].append(node_id)
    communities = [sorted(group) for group in groups.values() if len(group) >= 2]
    communities.sort(key=lambda group: (-len(group), group[0]))
    return communities


def build_knowledge_graph(records: list[dict[str, Any]], range_label: str = "全部时间", max_clues: int = 6) -> dict[str, Any]:
    node_map: dict[str, dict[str, Any]] = {}
    edge_map: dict[str, dict[str, Any]] = {}
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    record_map = {record["article_id"]: record for record in records}

    for record in records:
        article_node = ensure_node(
            node_map,
            nodes,
            f"article:{record['article_id']}",
            {
                "label": record.get("title", ""),
                "type": "article",
                "summary": record.get("summary", ""),
                "article_ids": [record["article_id"]],
                "subtype": record.get("category", [""])[0] if record.get("category") else "",
                "weight": 1,
            },
        )
        source_node = ensure_node(
            node_map,
            nodes,
            "source:" + slugify(record.get("source", "")),
            {
                "label": record.get("source", ""),
                "type": "source",
                "article_ids": [record["article_id"]],
                "weight": 1,
            },
        )
        ensure_edge(edge_map, edges, f"edge:{article_node['id']}->{source_node['id']}", {"source": article_node["id"], "target": source_node["id"], "type": "article-source", "label": "source", "weight": 1, "article_ids": [record["article_id"]]})
        for category in record.get("category", []):
            category_node = ensure_node(node_map, nodes, "category:" + slugify(category), {"label": category, "type": "category", "article_ids": [record["article_id"]], "weight": 1})
            ensure_edge(edge_map, edges, f"edge:{article_node['id']}->{category_node['id']}", {"source": article_node["id"], "target": category_node["id"], "type": "article-category", "label": category, "weight": 1, "article_ids": [record["article_id"]]})
        for entity in record.get("entities", []):
            entity_node = ensure_node(node_map, nodes, entity["entity_id"], {"label": entity["name"], "type": "entity", "subtype": entity.get("type"), "summary": record.get("why_it_matters", ""), "article_ids": [record["article_id"]], "aliases": entity.get("aliases", []), "weight": entity.get("confidence", 1)})
            ensure_edge(edge_map, edges, f"edge:{article_node['id']}->{entity_node['id']}", {"source": article_node["id"], "target": entity_node["id"], "type": "article-entity", "label": entity.get("type", "entity"), "weight": entity.get("confidence", 1), "article_ids": [record["article_id"]]})
        for event in record.get("events", []):
            event_node = ensure_node(node_map, nodes, event["event_id"], {"label": event["label"], "type": "event", "subtype": event.get("event_type"), "summary": event.get("summary", ""), "article_ids": [record["article_id"]], "weight": 1.4})
            ensure_edge(edge_map, edges, f"edge:{article_node['id']}->{event_node['id']}", {"source": article_node["id"], "target": event_node["id"], "type": "article-event", "label": event.get("event_type", "event"), "weight": 1.2, "article_ids": [record["article_id"]]})
            for participant in event.get("participants", []):
                ensure_node(node_map, nodes, participant["entity_id"], {"label": participant["name"], "type": "entity", "subtype": participant.get("type"), "article_ids": [record["article_id"]], "weight": 1})
                ensure_edge(edge_map, edges, f"edge:{event_node['id']}->{participant['entity_id']}", {"source": event_node["id"], "target": participant["entity_id"], "type": "event-entity", "label": participant.get("role", "participant"), "weight": 2, "article_ids": [record["article_id"]]})
        for relation in record.get("relations", []):
            ensure_edge(edge_map, edges, f"edge:{relation['source_entity_id']}->{relation['target_entity_id']}:{relation['relation_type']}", {"source": relation["source_entity_id"], "target": relation["target_entity_id"], "type": "explicit-relation", "label": relation.get("relation_type", "relation"), "weight": 2 + float(relation.get("weight", 1) or 1), "article_ids": [record["article_id"]]})

    communities = detect_communities(records)
    clues: list[dict[str, Any]] = []
    for community in communities:
        community_set = set(community)
        evidence_records = [
            record
            for record in records
            if any(entity["entity_id"] in community_set for entity in record.get("entities", []))
            or any(event["event_id"] in community_set for event in record.get("events", []))
        ]
        evidence_records.sort(key=lambda record: (record.get("date", ""), record["article_id"]), reverse=True)
        if len(evidence_records) < 2:
            continue
        category_counts: Counter[str] = Counter()
        event_type_counts: Counter[str] = Counter()
        core_nodes = []
        for node_id in community:
            node = node_map.get(node_id)
            if node:
                core_nodes.append({"id": node_id, "label": node["label"], "type": node["type"], "subtype": node.get("subtype"), "weight": float(node.get("weight", 1) or 1)})
        core_nodes.sort(key=lambda item: (-item["weight"], item["label"]))
        title_nodes = [node for node in core_nodes if node["type"] == "entity"][:4]
        if not title_nodes:
            title_nodes = [node for node in core_nodes if node["type"] == "event"][:3]
        core_labels = [
            (node["subtype"] if node["type"] == "event" and node.get("subtype") else node["label"])
            for node in title_nodes
        ]
        for record in evidence_records:
            category_counts.update(record.get("category", []))
            for event in record.get("events", []):
                if event["event_id"] in community_set:
                    event_type_counts[event.get("event_type", "launch")] += 1
        dominant_category = sorted(category_counts.items(), key=lambda item: (-item[1], item[0]))[0][0] if category_counts else "多主题"
        event_types = [event_type for event_type, _ in sorted(event_type_counts.items(), key=lambda item: (-item[1], item[0]))]
        evidence_ids = [record["article_id"] for record in evidence_records[:6]]
        focus_node_ids = set(community)
        focus_edge_ids: set[str] = set()
        for article_id in evidence_ids:
            record = record_map.get(article_id)
            if not record:
                continue
            focus_node_ids.add("article:" + article_id)
            focus_node_ids.add("source:" + slugify(record.get("source", "")))
            for category in record.get("category", []):
                focus_node_ids.add("category:" + slugify(category))
        for edge in edges:
            data = edge["data"]
            if data["source"] in focus_node_ids and data["target"] in focus_node_ids:
                focus_edge_ids.add(data["id"])
        title = " / ".join(core_labels[:4]) or "未命名线索"
        current_count = len(evidence_records)
        clues.append(
            {
                "id": "clue:" + stable_hash(f"{title}:{','.join(evidence_ids)}"),
                "title": title,
                "summary": f"在 {range_label} 内，{'、'.join(core_labels[:3]) or dominant_category} 围绕重复出现的事件与实体关系形成稳定线索。",
                "dominant_category": dominant_category,
                "event_types": event_types,
                "core_entities": core_labels[:4],
                "evidence_ids": evidence_ids,
                "focus_node_ids": sorted(focus_node_ids),
                "focus_edge_ids": sorted(focus_edge_ids),
                "trend_signals": [
                    (f"{event_types[0]} 信号在该主题中最集中。" if event_types else "实体/事件连接度较高。"),
                    f"证据新闻共 {current_count} 条，主导分类为 {dominant_category}。",
                ],
                "score": current_count * 3 + len(core_nodes),
            }
        )
    clues.sort(key=lambda clue: (-clue["score"], clue["title"]))
    return {"nodes": nodes, "edges": edges, "clues": clues[:max_clues]}


def build_subgraph(graph: dict[str, Any], node_ids: set[str], edge_ids: set[str]) -> dict[str, Any]:
    return {
        "nodes": [node for node in graph.get("nodes", []) if node.get("data", {}).get("id") in node_ids],
        "edges": [edge for edge in graph.get("edges", []) if edge.get("data", {}).get("id") in edge_ids],
    }


def record_matches_clue(record: dict[str, Any], clue: dict[str, Any]) -> bool:
    node_keys = {normalize_compare(name) for name in clue.get("core_entities", [])}
    event_keys = set(clue.get("event_types", []))
    entity_hit = any(normalize_compare(entity.get("name", "")) in node_keys for entity in record.get("entities", []))
    event_hit = any(event.get("event_type") in event_keys for event in record.get("events", []))
    return entity_hit or event_hit


def build_change_summary(current_count: int, previous_count: int) -> tuple[str, str]:
    if previous_count <= 0 and current_count > 0:
        return "new", "该主题在当前窗口内新成型，值得继续观察是否会跨天延续。"
    if current_count > previous_count:
        return "expanding", f"相关证据由上一窗口的 {previous_count} 条增至 {current_count} 条，主题正在升温。"
    if current_count < previous_count:
        return "cooling", f"相关证据由上一窗口的 {previous_count} 条降至 {current_count} 条，主题热度略有回落。"
    return "stable", f"相关证据与上一窗口持平（{current_count} 条），主题仍保持稳定。"


def build_clue_packets(graph: dict[str, Any], previous_records: list[dict[str, Any]], window_start: str, window_end: str) -> list[dict[str, Any]]:
    packets: list[dict[str, Any]] = []
    for clue in graph.get("clues", []):
        current_count = len(clue.get("evidence_ids", []))
        previous_count = sum(1 for record in previous_records if record_matches_clue(record, clue))
        direction, change_summary = build_change_summary(current_count, previous_count)
        packets.append(
            {
                "clue_id": clue["id"],
                "title": clue["title"],
                "time_window": {"start_date": window_start, "end_date": window_end},
                "core_entities": clue.get("core_entities", []),
                "event_types": clue.get("event_types", []),
                "dominant_category": clue.get("dominant_category", "多主题"),
                "summary": clue.get("summary", ""),
                "trend_signals": unique(list(clue.get("trend_signals", [])) + [change_summary]),
                "change": {
                    "direction": direction,
                    "current_article_count": current_count,
                    "previous_article_count": previous_count,
                    "summary": change_summary,
                },
                "evidence_article_ids": clue.get("evidence_ids", []),
                "focus_node_ids": clue.get("focus_node_ids", []),
                "focus_edge_ids": clue.get("focus_edge_ids", []),
                "graph": build_subgraph(graph, set(clue.get("focus_node_ids", [])), set(clue.get("focus_edge_ids", []))),
            }
        )
    return packets


def select_window(days: list[str], end_day: str, window_days: int) -> list[str]:
    end_date = parse_date(end_day)
    start_date = end_date - dt.timedelta(days=window_days - 1)
    return [day for day in days if start_date <= parse_date(day) <= end_date]


def select_previous_window(days: list[str], end_day: str, window_days: int) -> list[str]:
    end_date = parse_date(end_day) - dt.timedelta(days=window_days)
    start_date = end_date - dt.timedelta(days=window_days - 1)
    return [day for day in days if start_date <= parse_date(day) <= end_date]


def flatten_records(kg_payloads: dict[str, dict[str, Any]], days: list[str]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for day in days:
        payload = kg_payloads.get(day)
        if payload:
            records.extend(payload.get("signal_records", []))
    return records


def build_generic_manifest(path: pathlib.Path, var_name: str, files: list[str], version: str, extra: dict[str, Any] | None = None) -> None:
    extra = extra or {}
    lines = [f"window.{var_name} = {{", f"  version: '{version}',", "  files: ["]
    for file_name in files:
        lines.append(f"    '{file_name}',")
    lines.append("  ]")
    for key, value in extra.items():
        lines[-1] += ","
        if isinstance(value, str):
            lines.append(f"  {key}: '{value}'")
        else:
            lines.append(f"  {key}: {json.dumps(value, ensure_ascii=False)}")
    lines.append("};")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def load_day_override(day: str, override_dir: pathlib.Path | None, override_path: pathlib.Path | None) -> Any:
    if override_path and override_path.exists():
        return safe_read_json(override_path)
    if override_dir:
        day_path = override_dir / f"{day}.json"
        if day_path.exists():
            return safe_read_json(day_path)
    return None


def build_kg_artifacts(
    root: pathlib.Path,
    *,
    days_filter: set[str] | None = None,
    window_days: int = 30,
    kg_llm_dir: pathlib.Path | None = None,
    kg_llm_input: pathlib.Path | None = None,
) -> dict[str, dict[str, Any]]:
    news_dir = root / "news"
    kg_dir = root / "kg"
    days, articles_by_day, _ = load_articles(news_dir)
    all_payloads: dict[str, dict[str, Any]] = {}
    for day in days:
        llm_payload = load_day_override(day, kg_llm_dir, kg_llm_input if days_filter and day in days_filter else None)
        signal_records = build_signal_records(articles_by_day.get(day, []), llm_payload)
        all_payloads[day] = {
            "date": day,
            "articles": [
                {
                    "article_id": article["article_id"],
                    "title": article["title"],
                    "source": article["source"],
                    "date": article["date"],
                    "category": article["category"],
                    "summary": article["summary"],
                    "url": article["url"],
                }
                for article in articles_by_day.get(day, [])
            ],
            "signal_records": signal_records,
        }

    for day in days:
        if days_filter and day not in days_filter:
            continue
        window_day_list = select_window(days, day, window_days)
        previous_day_list = select_previous_window(days, day, window_days)
        window_records = flatten_records(all_payloads, window_day_list)
        previous_records = flatten_records(all_payloads, previous_day_list)
        range_label = f"{window_day_list[0]} 至 {window_day_list[-1]}" if window_day_list else day
        graph = build_knowledge_graph(window_records, range_label=range_label, max_clues=6)
        clue_packets = build_clue_packets(graph, previous_records, window_day_list[0] if window_day_list else day, window_day_list[-1] if window_day_list else day)
        all_payloads[day].update(
            {
                "generated_at": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
                "analysis_window": {
                    "start_date": window_day_list[0] if window_day_list else day,
                    "end_date": window_day_list[-1] if window_day_list else day,
                    "days": window_days,
                },
                "clue_packets": clue_packets,
                "graph_stats": {
                    "node_count": len(graph.get("nodes", [])),
                    "edge_count": len(graph.get("edges", [])),
                    "clue_count": len(graph.get("clues", [])),
                },
            }
        )
        dump_json(kg_dir / f"{day}.json", all_payloads[day])

    files = [f"{day}.json" for day in sorted(all_payloads, reverse=True)]
    version = dt.datetime.utcnow().strftime("%Y%m%d%H%M%S")
    build_generic_manifest(kg_dir / "manifest.js", "KG_MANIFEST", files, version)
    return all_payloads


def summarize_record_window(records: list[dict[str, Any]]) -> dict[str, Any]:
    entity_counts: Counter[str] = Counter()
    event_counts: Counter[str] = Counter()
    category_counts: Counter[str] = Counter()
    article_ids: list[str] = []
    for record in records:
        article_ids.append(record["article_id"])
        category_counts.update(record.get("category", []))
        for entity in record.get("entities", []):
            entity_counts[entity.get("name", "")] += 1
        for event in record.get("events", []):
            event_counts[event.get("event_type", "")] += 1
    return {
        "core_entities": [name for name, _ in entity_counts.most_common(6) if name],
        "event_types": [name for name, _ in event_counts.most_common(4) if name],
        "categories": [name for name, _ in category_counts.most_common(4) if name],
        "article_ids": article_ids,
    }


def build_recent_memory_snapshot(
    kg_payloads: dict[str, dict[str, Any]],
    insight_reports: dict[str, dict[str, Any]],
    end_day: str,
    window_days: int,
) -> dict[str, Any]:
    days = sorted(kg_payloads)
    window_day_list = select_window(days, end_day, window_days)
    signals = flatten_records(kg_payloads, window_day_list)
    clue_packets = []
    for day in window_day_list:
        for packet in kg_payloads.get(day, {}).get("clue_packets", []):
            clue_packets.append({"date": day, **packet})
    report_refs = []
    for day in window_day_list:
        report = insight_reports.get(day)
        if not report:
            continue
        report_refs.append(
            {
                "date": day,
                "headline": report.get("overview", {}).get("headline", ""),
                "theme_ids": [theme.get("theme_id", "") for theme in report.get("themes", [])],
            }
        )
    return {
        "updated_at": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "window_days": window_days,
        "start_date": window_day_list[0] if window_day_list else "",
        "end_date": window_day_list[-1] if window_day_list else "",
        "signals": signals,
        "clue_packets": clue_packets,
        "report_refs": report_refs,
    }


def build_archive_memory_snapshot(kg_payloads: dict[str, dict[str, Any]], end_day: str, window_days: int) -> dict[str, Any]:
    end_date = parse_date(end_day)
    recent_start = end_date - dt.timedelta(days=window_days - 1)
    old_days = [day for day in sorted(kg_payloads) if parse_date(day) < recent_start]
    grouped: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for day in old_days:
        day_date = parse_date(day)
        iso_year, iso_week, _ = day_date.isocalendar()
        grouped[f"{iso_year}-W{iso_week:02d}"].extend(kg_payloads.get(day, {}).get("signal_records", []))
    periods = []
    for period_id in sorted(grouped):
        records = grouped[period_id]
        if not records:
            continue
        dates = sorted(record.get("date", "") for record in records if record.get("date"))
        summary_stats = summarize_record_window(records)
        core_entities = summary_stats["core_entities"][:4]
        event_types = summary_stats["event_types"][:3]
        representative_article_ids = unique(summary_stats["article_ids"])[:5]
        periods.append(
            {
                "period_id": period_id,
                "period_type": "week",
                "start_date": dates[0] if dates else "",
                "end_date": dates[-1] if dates else "",
                "summary": f"{dates[0]} 至 {dates[-1]} 期间，{'、'.join(core_entities[:3]) or '多个主体'} 主要围绕 {'、'.join(event_types[:2]) or '产品发布'} 持续出现，形成可沿时间延续的周级趋势。",
                "core_entities": core_entities,
                "event_types": event_types,
                "trend_signals": [
                    f"核心实体：{'、'.join(core_entities[:3])}" if core_entities else "核心实体仍需继续积累。",
                    f"主事件类型：{'、'.join(event_types[:2])}" if event_types else "事件结构较分散。",
                ],
                "representative_article_ids": representative_article_ids,
            }
        )
    return {
        "updated_at": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "periods": periods,
    }


def build_evidence_index(themes: list[dict[str, Any]], article_lookup: dict[str, dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    flat: list[str] = []
    for theme in themes:
        flat.extend(theme.get("evidence_article_ids", []))
    ordered_ids = unique(flat)
    evidence_index = []
    article_to_index: dict[str, int] = {}
    for index, article_id in enumerate(ordered_ids, start=1):
        article = article_lookup.get(article_id, {})
        article_to_index[article_id] = index
        evidence_index.append(
            {
                "report_index": index,
                "article_id": article_id,
                "title": article.get("title", article_id),
                "source": article.get("source", ""),
                "date": article.get("date", ""),
                "summary": article.get("summary", ""),
            }
        )
    themed = []
    for theme in themes:
        themed.append(
            {
                **theme,
                "evidence": [
                    {
                        "report_index": article_to_index[article_id],
                        "article_id": article_id,
                        "title": article_lookup.get(article_id, {}).get("title", article_id),
                        "source": article_lookup.get(article_id, {}).get("source", ""),
                        "date": article_lookup.get(article_id, {}).get("date", ""),
                        "summary": article_lookup.get(article_id, {}).get("summary", ""),
                    }
                    for article_id in theme.get("evidence_article_ids", [])
                    if article_id in article_to_index
                ],
            }
        )
    return evidence_index, themed


def build_theme_conclusion(packet: dict[str, Any]) -> str:
    direction = packet.get("change", {}).get("direction", "stable")
    focus = "、".join(packet.get("core_entities", [])[:2]) or packet.get("dominant_category", "该主题")
    if direction == "new":
        return f"{focus} 在最近窗口内刚形成可重复验证的连接，后续最值得看它是否会继续跨源、跨天扩张。"
    if direction == "expanding":
        return f"{focus} 的证据面正在扩张，这通常意味着技术或产品路线开始进入更明确的放大阶段。"
    if direction == "cooling":
        return f"{focus} 仍在近期新闻中出现，但热度开始回落，接下来要观察它是暂时降温还是进入下一轮验证。"
    return f"{focus} 仍保持稳定重复出现，说明它已经具备持续跟踪的价值，而不只是单篇新闻噪声。"


def build_heuristic_report(
    day: str,
    kg_payload: dict[str, Any],
    article_lookup: dict[str, dict[str, Any]],
    recent_memory: dict[str, Any],
    archive_memory: dict[str, Any],
) -> dict[str, Any]:
    clue_packets = kg_payload.get("clue_packets", [])[:6]
    themes = []
    for packet in clue_packets:
        themes.append(
            {
                "theme_id": packet["clue_id"],
                "title": packet["title"],
                "summary": packet["summary"],
                "conclusion": build_theme_conclusion(packet),
                "trend_signals": packet.get("trend_signals", []),
                "core_entities": packet.get("core_entities", []),
                "event_types": packet.get("event_types", []),
                "dominant_category": packet.get("dominant_category", "多主题"),
                "evidence_article_ids": packet.get("evidence_article_ids", []),
                "graph": packet.get("graph", {"nodes": [], "edges": []}),
            }
        )
    if not themes:
        return {
            "date": day,
            "analysis_window": kg_payload.get("analysis_window", {}),
            "overview": {
                "headline": f"{day} 暂无足够稳定的主题簇",
                "summary": "当前窗口内还没有形成足够稳定的跨文章知识图谱簇，建议继续积累更多新闻再做趋势判断。",
                "key_observations": ["当前图谱以单篇弱连接为主。"],
            },
            "themes": [],
            "evidence_index": [],
            "memory_refs": {
                "recent_window": {"start_date": recent_memory.get("start_date", ""), "end_date": recent_memory.get("end_date", "")},
                "archive_refs": [period["period_id"] for period in archive_memory.get("periods", [])[:6]],
            },
        }

    evidence_index, themed = build_evidence_index(themes, article_lookup)
    archive_refs = [period["period_id"] for period in archive_memory.get("periods", [])[:6]]
    lead_titles = "；".join(theme["title"] for theme in themed[:2])
    return {
        "date": day,
        "analysis_window": kg_payload.get("analysis_window", {}),
        "overview": {
            "headline": f"{day} 的线索图显示 {len(themed)} 条可追踪主题：{lead_titles}",
            "summary": f"最近窗口中最稳定的结构不再是随机共现，而是围绕 {'、'.join(themed[0]['core_entities'][:3]) or themed[0]['dominant_category']} 形成的重复事件链条。",
            "key_observations": unique(
                [theme["trend_signals"][0] for theme in themed if theme.get("trend_signals")]
                + ([f"长期压缩记忆参考：{archive_refs[0]}"] if archive_refs else [])
            )[:4],
        },
        "themes": themed,
        "evidence_index": evidence_index,
        "memory_refs": {
            "recent_window": {"start_date": recent_memory.get("start_date", ""), "end_date": recent_memory.get("end_date", "")},
            "archive_refs": archive_refs,
        },
    }


def merge_insight_report(base_report: dict[str, Any], llm_payload: Any) -> dict[str, Any]:
    if not isinstance(llm_payload, dict):
        return base_report
    merged = json.loads(json.dumps(base_report))
    if isinstance(llm_payload.get("overview"), dict):
        overview = llm_payload["overview"]
        merged["overview"]["headline"] = overview.get("headline") or merged["overview"].get("headline", "")
        merged["overview"]["summary"] = overview.get("summary") or merged["overview"].get("summary", "")
        if isinstance(overview.get("key_observations"), list) and overview["key_observations"]:
            merged["overview"]["key_observations"] = overview["key_observations"][:6]

    llm_themes = llm_payload.get("themes")
    if isinstance(llm_themes, list) and merged.get("themes"):
        next_themes = []
        for index, base_theme in enumerate(merged["themes"]):
            llm_theme = llm_themes[index] if index < len(llm_themes) and isinstance(llm_themes[index], dict) else {}
            next_theme = dict(base_theme)
            for key in ("theme_id", "title", "summary", "conclusion", "dominant_category"):
                if llm_theme.get(key):
                    next_theme[key] = llm_theme[key]
            for key in ("trend_signals", "core_entities", "event_types"):
                if isinstance(llm_theme.get(key), list) and llm_theme[key]:
                    next_theme[key] = llm_theme[key]
            if isinstance(llm_theme.get("graph"), dict) and llm_theme["graph"].get("nodes"):
                next_theme["graph"] = llm_theme["graph"]
            if isinstance(llm_theme.get("evidence"), list) and llm_theme["evidence"]:
                existing_ids = {entry["article_id"]: entry for entry in base_theme.get("evidence", [])}
                rebuilt = []
                for entry in llm_theme["evidence"]:
                    article_id = entry.get("article_id")
                    if article_id and article_id in existing_ids:
                        merged_entry = dict(existing_ids[article_id])
                        for subkey in ("title", "source", "date", "summary"):
                            if entry.get(subkey):
                                merged_entry[subkey] = entry[subkey]
                        rebuilt.append(merged_entry)
                if rebuilt:
                    next_theme["evidence"] = rebuilt
            next_themes.append(next_theme)
        merged["themes"] = next_themes

    if isinstance(llm_payload.get("memory_refs"), dict):
        memory_refs = llm_payload["memory_refs"]
        if isinstance(memory_refs.get("recent_window"), dict):
            merged["memory_refs"]["recent_window"].update({k: v for k, v in memory_refs["recent_window"].items() if v})
        if isinstance(memory_refs.get("archive_refs"), list) and memory_refs["archive_refs"]:
            merged["memory_refs"]["archive_refs"] = memory_refs["archive_refs"]

    evidence_index = []
    for theme in merged.get("themes", []):
        evidence_index.extend(theme.get("evidence", []))
    merged["evidence_index"] = unique_by(evidence_index, lambda entry: entry["article_id"])
    return merged


def build_insight_artifacts(
    root: pathlib.Path,
    kg_payloads: dict[str, dict[str, Any]] | None = None,
    *,
    days_filter: set[str] | None = None,
    window_days: int = 30,
    insight_input_dir: pathlib.Path | None = None,
    insight_input: pathlib.Path | None = None,
) -> dict[str, dict[str, Any]]:
    news_dir = root / "news"
    insights_dir = root / "insights"
    days, _, article_lookup = load_articles(news_dir)
    if kg_payloads is None:
        kg_payloads = build_kg_artifacts(root, window_days=window_days)
    insight_reports: dict[str, dict[str, Any]] = {}
    for day in days:
        if days_filter and day not in days_filter:
            existing = safe_read_json(insights_dir / f"{day}.json")
            if existing:
                insight_reports[day] = existing
            continue
        recent_memory = build_recent_memory_snapshot(kg_payloads, insight_reports, day, window_days)
        archive_memory = build_archive_memory_snapshot(kg_payloads, day, window_days)
        base_report = build_heuristic_report(day, kg_payloads[day], article_lookup, recent_memory, archive_memory)
        llm_payload = load_day_override(day, insight_input_dir, insight_input if days_filter and day in days_filter else None)
        report = merge_insight_report(base_report, llm_payload)
        dump_json(insights_dir / f"{day}.json", report)
        insight_reports[day] = report

    files = [f"{day}.json" for day in sorted(insight_reports, reverse=True)]
    latest = max(insight_reports) if insight_reports else ""
    version = dt.datetime.utcnow().strftime("%Y%m%d%H%M%S")
    build_generic_manifest(insights_dir / "manifest.js", "INSIGHT_MANIFEST", files, version, extra={"latest": latest})
    return insight_reports


def refresh_memory(
    root: pathlib.Path,
    *,
    end_day: str | None = None,
    kg_payloads: dict[str, dict[str, Any]] | None = None,
    insight_reports: dict[str, dict[str, Any]] | None = None,
    window_days: int = 30,
) -> dict[str, Any]:
    memory_dir = root / "memory"
    if kg_payloads is None:
        kg_payloads = {path.stem: safe_read_json(path) for path in (root / "kg").glob("*.json") if path.name != "manifest.js"}
    if not kg_payloads:
        recent = {"updated_at": "", "window_days": window_days, "start_date": "", "end_date": "", "signals": [], "clue_packets": [], "report_refs": []}
        archive = {"updated_at": "", "periods": []}
        dump_json(memory_dir / "recent.json", recent)
        dump_json(memory_dir / "archive.json", archive)
        return {"recent": recent, "archive": archive}
    if insight_reports is None:
        insight_reports = {path.stem: safe_read_json(path) for path in (root / "insights").glob("*.json") if path.name != "manifest.js"}
    target_day = end_day or max(kg_payloads)
    recent = build_recent_memory_snapshot(kg_payloads, insight_reports, target_day, window_days)
    archive = build_archive_memory_snapshot(kg_payloads, target_day, window_days)
    dump_json(memory_dir / "recent.json", recent)
    dump_json(memory_dir / "archive.json", archive)
    return {"recent": recent, "archive": archive}


def rebuild_static_outputs(
    root: pathlib.Path,
    *,
    window_days: int = 30,
    kg_llm_dir: pathlib.Path | None = None,
    insight_input_dir: pathlib.Path | None = None,
) -> dict[str, Any]:
    kg_payloads = build_kg_artifacts(root, window_days=window_days, kg_llm_dir=kg_llm_dir)
    insight_reports = build_insight_artifacts(root, kg_payloads, window_days=window_days, insight_input_dir=insight_input_dir)
    memory_payloads = refresh_memory(root, kg_payloads=kg_payloads, insight_reports=insight_reports, window_days=window_days)
    return {"kg_payloads": kg_payloads, "insight_reports": insight_reports, "memory": memory_payloads}


def prompt_article_block(articles: list[dict[str, Any]]) -> str:
    payload = {
        "articles": [
            {
                "article_id": article["article_id"],
                "title": article["title"],
                "source": article["source"],
                "date": article["date"],
                "category": article["category"],
                "url": article["url"],
                "summary": article["summary"],
                "detail": article["detail"],
            }
            for article in articles
        ]
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


def render_kg_prompt(root: pathlib.Path, day: str) -> str:
    _, articles_by_day, _ = load_articles(root / "news")
    if day not in articles_by_day:
        raise FileNotFoundError(f"news day not found: {day}")
    template = read_template(root / "prompts", KG_TEMPLATE_NAME) or "{{ARTICLE_BLOCK}}"
    return render_template(template, {"DATE": day, "ARTICLE_BLOCK": prompt_article_block(articles_by_day[day])})


def render_insight_prompt(
    root: pathlib.Path,
    day: str,
    *,
    window_days: int = 30,
    kg_payloads: dict[str, dict[str, Any]] | None = None,
    insight_reports: dict[str, dict[str, Any]] | None = None,
) -> str:
    template = read_template(root / "prompts", INSIGHT_TEMPLATE_NAME) or "{{TODAY_SIGNALS}}\n{{CLUE_PACKETS}}\n{{RECENT_MEMORY}}\n{{ARCHIVE_MEMORY}}"
    if kg_payloads is None:
        kg_payloads = {path.stem: safe_read_json(path) for path in (root / "kg").glob("*.json") if path.name != "manifest.js"}
        if day not in kg_payloads:
            kg_payloads = build_kg_artifacts(root, window_days=window_days)
    if insight_reports is None:
        insight_reports = {path.stem: safe_read_json(path) for path in (root / "insights").glob("*.json") if path.name != "manifest.js"}
    recent_memory = build_recent_memory_snapshot(kg_payloads, insight_reports, day, window_days)
    archive_memory = build_archive_memory_snapshot(kg_payloads, day, window_days)
    day_payload = kg_payloads[day]
    return render_template(
        template,
        {
            "DATE": day,
            "TODAY_SIGNALS": json.dumps(day_payload.get("signal_records", []), ensure_ascii=False, indent=2),
            "CLUE_PACKETS": json.dumps(day_payload.get("clue_packets", []), ensure_ascii=False, indent=2),
            "RECENT_MEMORY": json.dumps(recent_memory, ensure_ascii=False, indent=2),
            "ARCHIVE_MEMORY": json.dumps(archive_memory, ensure_ascii=False, indent=2),
        },
    )


def write_text_output(text: str, output: pathlib.Path | None) -> None:
    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(text, encoding="utf-8", newline="\n")
