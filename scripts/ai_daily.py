#!/usr/bin/env python3
from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import html
import json
import pathlib
import re
import sys
import textwrap
import time
import urllib.error
import urllib.request
from typing import Iterable
from urllib.parse import urljoin


ROOT = pathlib.Path(__file__).resolve().parents[1]
PROMPTS_DIR = ROOT / "prompts"
NEWS_DIR = ROOT / "news"
PROMPT_PATH = PROMPTS_DIR / "PROMPT.md"

FIXED_CATEGORIES = [
    "应用/产业",
    "论文",
    "基础设施",
    "安全",
    "生态",
    "开源",
    "观察",
]

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/136.0.0.0 Safari/537.36"
)

ARXIV_KEYWORD_SCORES = [
    (r"\b(llm|large language model|language model)\b", 6),
    (r"\b(agent|agentic|multi-agent)\b", 5),
    (r"\b(inference|decoding|throughput|latency|cache|memory)\b", 5),
    (r"\b(reasoning|benchmark|alignment|safety|jailbreak|refusal)\b", 5),
    (r"\b(multimodal|retrieval|rag|tool use|search|distillation)\b", 4),
    (r"\b(open source|open-source|open weights)\b", 3),
]

GENERAL_AI_KEYWORD_SCORES = [
    (r"\bai\b|artificial intelligence|personal intelligence", 6),
    (r"\b(agent|agents|agentic)\b", 5),
    (r"\b(llm|language model|multimodal|reasoning|prompt)\b", 5),
    (r"\b(inference|training|throughput|latency|cache|memory|gpu|gpus)\b", 5),
    (r"\b(data center|datacenter|robot|robots|robotics|digital twin)\b", 4),
    (r"\b(generative|machine learning|open weights|open source|open-source)\b", 4),
    (r"\b(openai|anthropic|deepmind|gemini|chatgpt|xai|mistral|hugging face|claude|copilot|azure ai|gemma)\b", 3),
]

OFFICIAL_SOURCES = [
    ("OpenAI", "https://openai.com/news/", r"href=[\"']([^\"'#]+/index/[^\"'#]+)[\"']"),
    ("Anthropic", "https://www.anthropic.com/news", r"href=[\"']([^\"'#]+/news/[^\"'#]+)[\"']"),
    ("Hugging Face", "https://huggingface.co/blog", r"href=[\"']([^\"'#]+/blog/[^\"'#]+)[\"']"),
    ("Azure Blog", "https://azure.microsoft.com/en-us/blog/", r'href=["\'](https://azure\.microsoft\.com/[^"\']+/blog/[^"\'#]+)["\']'),
]

MEDIA_SOURCES = [
    ("TechCrunch", "https://techcrunch.com/{year}/{month}/", "month-archive"),
]

HISTORY_HINT_SOURCES = [
    ("Anthropic", "https://www.anthropic.com/news/announcing-our-updated-responsible-scaling-policy"),
    ("TechCrunch", "https://techcrunch.com/2026/03/02/openai-anthropic-department-of-defense-war-hegseth-ai-companies-work-with-us-government/"),
    ("TechCrunch", "https://techcrunch.com/2026/03/02/chatgpt-uninstalls-surged-by-295-after-dod-deal/"),
    ("TechCrunch", "https://techcrunch.com/2026/03/02/anthropics-claude-reports-widespread-outage/"),
    ("TechCrunch", "https://techcrunch.com/2026/03/02/stripe-wants-to-turn-your-ai-costs-into-a-profit-center/"),
    ("TechCrunch", "https://techcrunch.com/2026/03/02/apples-bakes-in-ai-smarts-into-its-new-599-iphone-17e/"),
    ("TechCrunch", "https://techcrunch.com/2026/03/02/cursor-has-reportedly-surpassed-2b-in-annualized-revenue/"),
    ("TechCrunch", "https://techcrunch.com/2026/03/02/users-are-ditching-chatgpt-for-claude-heres-how-to-make-the-switch/"),
]

DEFAULT_REQUEST_TIMEOUT = 8
DEFAULT_COLLECT_BUDGET_SECONDS = 25


class CliError(RuntimeError):
    pass


@dataclasses.dataclass(slots=True)
class CollectConfig:
    request_timeout: int = DEFAULT_REQUEST_TIMEOUT
    budget_seconds: int = DEFAULT_COLLECT_BUDGET_SECONDS
    max_official_links: int = 12
    max_media_links: int = 40
    max_nvidia_links: int = 25
    max_arxiv_items: int = 18


class CollectDeadlineExceeded(RuntimeError):
    pass


@dataclasses.dataclass(slots=True)
class Candidate:
    source: str
    title: str
    url: str
    date: str
    summary: str
    kind: str

    def to_dict(self) -> dict[str, str]:
        return {
            "source": self.source,
            "title": self.title,
            "url": self.url,
            "date": self.date,
            "summary": self.summary,
            "kind": self.kind,
        }


@dataclasses.dataclass(slots=True)
class NewsItem:
    title: str
    source: str
    date: str
    category: list[str]
    url: str
    summary: str
    detail: list[str]

    def render_markdown(self) -> str:
        detail_body = "\n\n".join(f"    {paragraph}" for paragraph in self.detail)
        return "\n".join(
            [
                f"## {self.title}",
                f"- source: {self.source}",
                f"- date: {self.date}",
                f"- category: {','.join(self.category)}",
                f"- url: {self.url}",
                f"- summary: {self.summary}",
                "- detail: |",
                detail_body,
            ]
        )


def ensure_within_deadline(deadline: float | None) -> None:
    if deadline is not None and time.monotonic() >= deadline:
        raise CollectDeadlineExceeded()



def fetch_text(url: str, timeout: int = DEFAULT_REQUEST_TIMEOUT, deadline: float | None = None) -> str:
    ensure_within_deadline(deadline)
    request = urllib.request.Request(url, headers={"User-Agent": DEFAULT_USER_AGENT})
    effective_timeout = timeout
    if deadline is not None:
        remaining = max(0.1, deadline - time.monotonic())
        effective_timeout = min(timeout, remaining)
    with urllib.request.urlopen(request, timeout=effective_timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, "ignore")


def parse_target_date(raw: str | None) -> str:
    if not raw or raw == "today":
        return dt.date.today().isoformat()
    try:
        return dt.date.fromisoformat(raw).isoformat()
    except ValueError as exc:
        raise CliError(f"无效日期: {raw!r}，请使用 YYYY-MM-DD") from exc


def dedupe_candidates(candidates: Iterable[Candidate]) -> list[Candidate]:
    seen: set[str] = set()
    items: list[Candidate] = []
    for item in candidates:
        key = item.url.rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        items.append(item)
    return items


def candidate_relevance_score(title: str, summary: str) -> int:
    haystack = f"{title} {summary}".lower()
    score = 0
    for pattern, points in GENERAL_AI_KEYWORD_SCORES:
        if re.search(pattern, haystack, re.IGNORECASE):
            score += points
    return score


def sort_candidates(candidates: Iterable[Candidate]) -> list[Candidate]:
    kind_order = {"official": 0, "media": 1, "paper": 2}
    return sorted(
        candidates,
        key=lambda item: (
            kind_order.get(item.kind, 99),
            -candidate_relevance_score(item.title, item.summary),
            item.title.lower(),
        ),
    )


def clean_html_text(value: str) -> str:
    text = html.unescape(value)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_meta(html_text: str, property_name: str) -> str:
    patterns = [
        rf'<meta[^>]+property=["\']{re.escape(property_name)}["\'][^>]+content=["\']([^"\']+)',
        rf'<meta[^>]+name=["\']{re.escape(property_name)}["\'][^>]+content=["\']([^"\']+)',
        rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']{re.escape(property_name)}["\']',
        rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']{re.escape(property_name)}["\']',
    ]
    for pattern in patterns:
        match = re.search(pattern, html_text, re.IGNORECASE)
        if match:
            return clean_html_text(match.group(1))
    return ""


def normalize_page_date(raw: str) -> str:
    match = re.search(r"(\d{4}-\d{2}-\d{2})", raw)
    if match:
        return match.group(1)
    match = re.search(r"(\d{4}/\d{2}/\d{2})", raw)
    if match:
        return match.group(1).replace("/", "-")
    return raw.strip()


def extract_title_and_summary(page: str) -> tuple[str, str]:
    title = extract_meta(page, "og:title") or extract_meta(page, "twitter:title")
    summary = extract_meta(page, "description") or extract_meta(page, "og:description")
    return title, summary


def extract_published_date(page: str) -> str:
    raw = (
        extract_meta(page, "article:published_time")
        or extract_meta(page, "datePublished")
        or extract_meta(page, "article:modified_time")
        or extract_meta(page, "publish-date")
        or extract_meta(page, "parsely-pub-date")
    )
    return normalize_page_date(raw)


def collect_official_site(
    index_url: str,
    source: str,
    link_pattern: str,
    date_str: str,
    limit: int = 12,
    *,
    timeout: int = DEFAULT_REQUEST_TIMEOUT,
    deadline: float | None = None,
) -> list[Candidate]:
    try:
        index_html = fetch_text(index_url, timeout=timeout, deadline=deadline)
    except (urllib.error.URLError, TimeoutError, CollectDeadlineExceeded):
        return []

    urls = []
    for raw_url in re.findall(link_pattern, index_html, re.IGNORECASE):
        absolute = urljoin(index_url, html.unescape(raw_url)).rstrip('/')
        if absolute.startswith('mailto:'):
            continue
        urls.append(absolute)
    urls = sorted(set(urls))[:limit]

    results: list[Candidate] = []
    for url in urls:
        try:
            page = fetch_text(url, timeout=timeout, deadline=deadline)
        except (urllib.error.URLError, TimeoutError, CollectDeadlineExceeded):
            continue

        published = extract_published_date(page)
        if published and published != date_str:
            continue

        title, summary = extract_title_and_summary(page)
        if not title:
            continue
        if candidate_relevance_score(title, summary) < 4:
            continue

        results.append(
            Candidate(
                source=source,
                title=title.strip(),
                url=url,
                date=published or date_str,
                summary=summary,
                kind='official',
            )
        )
    return results


def collect_techcrunch(
    date_str: str,
    *,
    timeout: int = DEFAULT_REQUEST_TIMEOUT,
    deadline: float | None = None,
    max_urls: int = 40,
) -> list[Candidate]:
    archive_url = f"https://techcrunch.com/{date_str[:4]}/{date_str[5:7]}/"
    archive_html = fetch_text(archive_url, timeout=timeout, deadline=deadline)
    pattern = rf"https://techcrunch\.com/{date_str[:4]}/{date_str[5:7]}/{date_str[8:10]}/[^\"'\s<>]+"
    urls = sorted(set(re.findall(pattern, archive_html)))[:max_urls]
    results: list[Candidate] = []

    for url in urls:
        try:
            page = fetch_text(url, timeout=timeout, deadline=deadline)
        except (urllib.error.URLError, TimeoutError, CollectDeadlineExceeded):
            continue

        title, summary = extract_title_and_summary(page)
        published = extract_published_date(page)

        if not title:
            continue

        if published and published != date_str:
            continue

        if candidate_relevance_score(title, summary) < 4:
            continue

        results.append(
            Candidate(
                source="TechCrunch",
                title=title.replace(" | TechCrunch", "").strip(),
                url=url,
                date=published or date_str,
                summary=summary,
                kind="media",
            )
        )
    return results


def collect_nvidia(
    date_str: str,
    *,
    timeout: int = DEFAULT_REQUEST_TIMEOUT,
    deadline: float | None = None,
    max_urls: int = 25,
) -> list[Candidate]:
    homepage = fetch_text("https://blogs.nvidia.com/", timeout=timeout, deadline=deadline)
    urls = []
    for url in re.findall(r"https://blogs\.nvidia\.com/blog/[^\"'\s<>]+", homepage):
        if any(marker in url for marker in ("/category/", "/tag/")):
            continue
        urls.append(url.rstrip("/"))
    urls = sorted(set(urls))

    results: list[Candidate] = []
    for url in urls[:max_urls]:
        try:
            page = fetch_text(url + "/", timeout=timeout, deadline=deadline)
        except (urllib.error.URLError, TimeoutError, CollectDeadlineExceeded):
            continue

        published = extract_published_date(page)
        if published != date_str:
            continue

        title, summary = extract_title_and_summary(page)
        if not title:
            continue

        if candidate_relevance_score(title, summary) < 4:
            continue

        results.append(
            Candidate(
                source="NVIDIA Blog",
                title=title,
                url=url + "/",
                date=published,
                summary=summary,
                kind="official",
            )
        )
    return results


def arxiv_interest_score(title: str, summary: str) -> int:
    haystack = f"{title} {summary}".lower()
    score = 0
    for pattern, points in ARXIV_KEYWORD_SCORES:
        if re.search(pattern, haystack, re.IGNORECASE):
            score += points
    return score


def collect_media_month_archive(
    source: str,
    date_str: str,
    *,
    timeout: int = DEFAULT_REQUEST_TIMEOUT,
    deadline: float | None = None,
    max_urls: int = 40,
) -> list[Candidate]:
    archive_url = f"https://techcrunch.com/{date_str[:4]}/{date_str[5:7]}/"
    try:
        archive_html = fetch_text(archive_url, timeout=timeout, deadline=deadline)
    except (urllib.error.URLError, TimeoutError, CollectDeadlineExceeded):
        return []
    pattern = rf"https://techcrunch\.com/{date_str[:4]}/{date_str[5:7]}/{date_str[8:10]}/[^\"'\s<>]+"
    urls = sorted(set(re.findall(pattern, archive_html)))[:max_urls]
    results: list[Candidate] = []
    for url in urls:
        try:
            page = fetch_text(url, timeout=timeout, deadline=deadline)
        except (urllib.error.URLError, TimeoutError, CollectDeadlineExceeded):
            continue
        title, summary = extract_title_and_summary(page)
        published = extract_published_date(page)
        if published and published != date_str:
            continue
        if not title:
            continue
        if candidate_relevance_score(title, summary) < 4:
            continue
        results.append(
            Candidate(
                source=source,
                title=title.replace(" | TechCrunch", "").strip(),
                url=url,
                date=published or date_str,
                summary=summary,
                kind="media",
            )
        )
    return results


def collect_history_hints(
    date_str: str,
    *,
    timeout: int = DEFAULT_REQUEST_TIMEOUT,
    deadline: float | None = None,
) -> list[Candidate]:
    results: list[Candidate] = []
    for source, url in HISTORY_HINT_SOURCES:
        if date_str not in url:
            continue
        try:
            page = fetch_text(url, timeout=timeout, deadline=deadline)
        except (urllib.error.URLError, TimeoutError, CollectDeadlineExceeded):
            continue
        title, summary = extract_title_and_summary(page)
        published = extract_published_date(page)
        if published and published != date_str:
            continue
        if not title:
            continue
        if candidate_relevance_score(title, summary) < 4:
            continue
        results.append(
            Candidate(
                source=source,
                title=title.replace(" | TechCrunch", "").strip(),
                url=url,
                date=published or date_str,
                summary=summary,
                kind="official" if source != "TechCrunch" else "media",
            )
        )
    return results


def collect_arxiv(
    date_str: str,
    *,
    timeout: int = DEFAULT_REQUEST_TIMEOUT,
    deadline: float | None = None,
    max_items: int = 18,
) -> list[Candidate]:
    target_heading = dt.date.fromisoformat(date_str).strftime("%A, %d %B %Y")
    pages = [
        ("cs.AI", "https://arxiv.org/list/cs.AI/new"),
        ("cs.CL", "https://arxiv.org/list/cs.CL/new"),
        ("cs.LG", "https://arxiv.org/list/cs.LG/new"),
    ]
    results: list[Candidate] = []

    for category_name, url in pages:
        try:
            raw = fetch_text(url, timeout=timeout, deadline=deadline)
        except (urllib.error.URLError, TimeoutError, CollectDeadlineExceeded):
            continue

        if target_heading not in raw:
            continue

        article_pattern = re.compile(
            r"<dt>(?P<dt>.*?)</dt>\s*<dd>(?P<dd>.*?)</dd>",
            re.IGNORECASE | re.DOTALL,
        )
        for match in article_pattern.finditer(raw):
            dt_html = match.group("dt")
            dd_html = match.group("dd")
            id_match = re.search(r"/abs/(\d+\.\d+)", dt_html)
            title_match = re.search(
                r"<div class='list-title mathjax'>.*?<span class='descriptor'>Title:</span>\s*(.*?)\s*</div>",
                dd_html,
                re.IGNORECASE | re.DOTALL,
            )
            abstract_match = re.search(
                r"<p class='mathjax'>(.*?)</p>",
                dd_html,
                re.IGNORECASE | re.DOTALL,
            )

            if not id_match or not title_match or not abstract_match:
                continue

            title = clean_html_text(title_match.group(1))
            summary = clean_html_text(abstract_match.group(1))
            if arxiv_interest_score(title, summary) < 4:
                continue

            paper_id = id_match.group(1)
            results.append(
                Candidate(
                    source=f"arXiv ({category_name})",
                    title=title,
                    url=f"https://arxiv.org/abs/{paper_id}",
                    date=date_str,
                    summary=summary,
                    kind="paper",
                )
            )

    results.sort(key=lambda item: (-arxiv_interest_score(item.title, item.summary), item.title))
    return results[:max_items]


def collect_candidates(date_str: str, config: CollectConfig | None = None) -> list[Candidate]:
    config = config or CollectConfig()
    deadline = time.monotonic() + config.budget_seconds if config.budget_seconds > 0 else None
    candidates = []

    for source, index_url, link_pattern in OFFICIAL_SOURCES:
        if deadline is not None and time.monotonic() >= deadline:
            break
        candidates.extend(
            collect_official_site(
                index_url,
                source,
                link_pattern,
                date_str,
                limit=config.max_official_links,
                timeout=config.request_timeout,
                deadline=deadline,
            )
        )

    for source, _template, mode in MEDIA_SOURCES:
        if deadline is not None and time.monotonic() >= deadline:
            break
        if mode == "month-archive":
            candidates.extend(
                collect_media_month_archive(
                    source,
                    date_str,
                    timeout=config.request_timeout,
                    deadline=deadline,
                    max_urls=config.max_media_links,
                )
            )

    if deadline is None or time.monotonic() < deadline:
        candidates.extend(collect_history_hints(date_str, timeout=config.request_timeout, deadline=deadline))
    if deadline is None or time.monotonic() < deadline:
        try:
            candidates.extend(
                collect_techcrunch(
                    date_str,
                    timeout=config.request_timeout,
                    deadline=deadline,
                    max_urls=config.max_media_links,
                )
            )
        except (urllib.error.URLError, TimeoutError, CollectDeadlineExceeded):
            pass
    if deadline is None or time.monotonic() < deadline:
        try:
            candidates.extend(
                collect_nvidia(
                    date_str,
                    timeout=config.request_timeout,
                    deadline=deadline,
                    max_urls=config.max_nvidia_links,
                )
            )
        except (urllib.error.URLError, TimeoutError, CollectDeadlineExceeded):
            pass
    if deadline is None or time.monotonic() < deadline:
        candidates.extend(
            collect_arxiv(
                date_str,
                timeout=config.request_timeout,
                deadline=deadline,
                max_items=config.max_arxiv_items,
            )
        )
    return sort_candidates(dedupe_candidates(candidates))


def render_candidates_markdown(candidates: Iterable[Candidate]) -> str:
    groups = [
        ("official", "官方来源"),
        ("media", "媒体来源"),
        ("paper", "论文来源"),
    ]
    lines: list[str] = []
    candidate_list = list(candidates)
    for group_key, group_title in groups:
        group_items = [item for item in candidate_list if item.kind == group_key]
        if not group_items:
            continue
        lines.append(f"## {group_title}")
        lines.append("")
        for index, item in enumerate(group_items, start=1):
            lines.append(f"{index}. [{item.source}] {item.title}")
            lines.append(f"   - date: {item.date}")
            lines.append(f"   - url: {item.url}")
            if item.summary:
                lines.append(f"   - summary: {item.summary}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def build_compact_prompt(date_str: str, candidates: list[Candidate]) -> str:
    lines = [
        f"请生成 `news/{date_str}.md` 的最终内容。",
        "",
        "硬性约束：",
        "- 只输出纯 Markdown，不要解释、前言、代码块。",
        "- 总条数 7 到 10 条。",
        f"- 每条 date 必须是 {date_str}，除非正文明确说明“旧闻在当天继续发酵”的背景。",
        "- 固定分类仅允许：应用/产业、论文、基础设施、安全、生态、开源、观察。",
        "- 至少覆盖：应用/产业、论文、基础设施，并至少有 1 条观察。",
        "- 每条必须包含：标题、source、date、category、url、summary、detail。",
        "- summary 必须是一句话；detail 必须 2 到 4 段。",
        "- 如果 summary 里直接出现固定分类名，category 必须同步包含该标签。",
        "- 观察类最后一段必须显式写：参考来源：来源A；来源B；来源C（至少 2 个）。",
        "",
        "输出结构：",
        f"day: {date_str}",
        "",
        "## 新闻标题",
        "- source: 来源",
        f"- date: {date_str}",
        "- category: 应用/产业",
        "- url: https://example.com",
        "- summary: 一句话摘要",
        "- detail: |",
        "    第一段",
        "",
        "    第二段",
        "",
        "    第三段",
        "",
        "优先参考以下候选；若不足，可补充可信一手来源，但不要编造。",
        "",
    ]

    for index, item in enumerate(candidates, start=1):
        lines.append(f"{index}. [{item.source}] {item.title}")
        lines.append(f"   URL: {item.url}")
        if item.summary:
            lines.append(f"   摘要: {item.summary}")

    return "\n".join(lines).rstrip() + "\n"


def normalize_line_endings(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n")


def normalize_field_value(value: str) -> str:
    normalized = normalize_line_endings(value)
    if re.match(r"^\|(?:\s*\n|$)", normalized):
        body = re.sub(r"^\|\s*\n?", "", normalized, count=1)
        lines = body.split("\n")
        meaningful = [line for line in lines if line.strip()]
        min_indent = min((len(re.match(r"^\s*", line).group(0)) for line in meaningful), default=0)
        cleaned = "\n".join(line[min_indent:] if len(line) >= min_indent else "" for line in lines)
        return cleaned.strip()

    return "\n".join(part.strip() for part in normalized.split("\n")).strip()


def read_field(block: str, key: str) -> str:
    pattern = re.compile(
        rf"(?:^|\n)-\s*{re.escape(key)}:\s*([\s\S]*?)(?=\n-\s*[a-z]+:\s|\n##\s+|$)",
        re.IGNORECASE,
    )
    match = pattern.search(block)
    if not match:
        return ""
    return normalize_field_value(match.group(1))


def parse_news_markdown(raw: str, fallback_day: str) -> tuple[str, list[NewsItem]]:
    normalized = normalize_line_endings(raw)
    day_match = re.search(r"^day:\s*(\d{4}-\d{2}-\d{2})\s*$", normalized, re.MULTILINE)
    day = day_match.group(1) if day_match else fallback_day
    parts = re.split(r"\n##\s+", normalized)
    blocks = []
    for index, part in enumerate(parts):
        if index == 0:
            continue
        blocks.append("## " + part)

    items: list[NewsItem] = []
    for block in blocks:
        title_match = re.search(r"^##\s+(.+)$", block, re.MULTILINE)
        detail = read_field(block, "detail")
        detail_paragraphs = [paragraph.strip() for paragraph in re.split(r"\n\s*\n", detail) if paragraph.strip()]
        categories = [part.strip() for part in read_field(block, "category").split(",") if part.strip()]
        items.append(
            NewsItem(
                title=title_match.group(1).strip() if title_match else "无标题",
                source=read_field(block, "source"),
                date=read_field(block, "date") or day,
                category=categories,
                url=read_field(block, "url"),
                summary=read_field(block, "summary"),
                detail=detail_paragraphs,
            )
        )
    return day, items


def render_news_markdown(day: str, items: list[NewsItem]) -> str:
    blocks = [f"day: {day}", ""]
    for index, item in enumerate(items):
        if index:
            blocks.append("")
        blocks.append(item.render_markdown())
    return "\n".join(blocks).rstrip() + "\n"


def validate_news(day: str, items: list[NewsItem], expected_day: str | None, strict_count: bool = True) -> list[str]:
    errors: list[str] = []
    actual_day = expected_day or day

    if expected_day and day != expected_day:
        errors.append(f"day 头部为 {day}，预期为 {expected_day}")

    if strict_count and not (7 <= len(items) <= 10):
        errors.append(f"新闻条数为 {len(items)}，预期应在 7 到 10 条之间")

    if not any("观察" in item.category for item in items):
        errors.append("缺少至少 1 条“观察”类条目")

    seen_urls: set[str] = set()
    for index, item in enumerate(items, start=1):
        prefix = f"第 {index} 条《{item.title}》"
        if not item.title:
            errors.append(f"{prefix} 缺少标题")
        if not item.source:
            errors.append(f"{prefix} 缺少 source")
        if not item.url:
            errors.append(f"{prefix} 缺少 url")
        if not item.summary:
            errors.append(f"{prefix} 缺少 summary")
        if not item.detail:
            errors.append(f"{prefix} 缺少 detail")
        if expected_day and item.date != actual_day:
            errors.append(f"{prefix} 的 date 为 {item.date}，预期为 {actual_day}")
        if len(item.detail) < 2 or len(item.detail) > 4:
            errors.append(f"{prefix} 的 detail 段落数为 {len(item.detail)}，预期为 2 到 4 段")
        if "\n" in item.summary:
            errors.append(f"{prefix} 的 summary 不是单句单行")

        invalid_categories = [category for category in item.category if category not in FIXED_CATEGORIES]
        if invalid_categories:
            errors.append(f"{prefix} 含有非法分类：{', '.join(invalid_categories)}")
        if not item.category:
            errors.append(f"{prefix} 缺少 category")

        for category in FIXED_CATEGORIES:
            if category in item.summary and category not in item.category:
                errors.append(f"{prefix} 的 summary 提到了“{category}”，但 category 未包含该标签")

        if "观察" in item.category:
            last_paragraph = item.detail[-1] if item.detail else ""
            if "参考来源：" not in last_paragraph:
                errors.append(f"{prefix} 是观察类，但最后一段未写“参考来源：...”")

        if item.url:
            key = item.url.rstrip("/")
            if key in seen_urls:
                errors.append(f"{prefix} 的 url 与其他条目重复：{item.url}")
            seen_urls.add(key)

    covered = {category for item in items for category in item.category}
    for required in ("应用/产业", "论文", "基础设施"):
        if required not in covered:
            errors.append(f"整体缺少必需分类：{required}")

    return errors


def load_items_from_json(raw: str, expected_day: str) -> tuple[str, list[NewsItem]]:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise CliError(f"JSON 解析失败：{exc}") from exc

    if not isinstance(payload, dict):
        raise CliError("JSON 顶层必须是对象")

    day = payload.get("day") or expected_day
    items_payload = payload.get("items")
    if not isinstance(items_payload, list):
        raise CliError("JSON 中必须包含 items 数组")

    items: list[NewsItem] = []
    for index, item in enumerate(items_payload, start=1):
        if not isinstance(item, dict):
            raise CliError(f"第 {index} 条 JSON item 不是对象")
        detail = item.get("detail", [])
        if isinstance(detail, str):
            detail = [paragraph.strip() for paragraph in re.split(r"\n\s*\n", normalize_line_endings(detail)) if paragraph.strip()]
        if not isinstance(detail, list):
            raise CliError(f"第 {index} 条 JSON item 的 detail 必须是数组或字符串")
        category = item.get("category", [])
        if isinstance(category, str):
            category = [part.strip() for part in category.split(",") if part.strip()]
        if not isinstance(category, list):
            raise CliError(f"第 {index} 条 JSON item 的 category 必须是数组或字符串")

        items.append(
            NewsItem(
                title=str(item.get("title", "")).strip(),
                source=str(item.get("source", "")).strip(),
                date=str(item.get("date", day)).strip(),
                category=[str(part).strip() for part in category if str(part).strip()],
                url=str(item.get("url", "")).strip(),
                summary=str(item.get("summary", "")).strip(),
                detail=[str(part).strip() for part in detail if str(part).strip()],
            )
        )

    return day, items


def update_manifest(date_str: str) -> None:
    manifest_path = NEWS_DIR / "manifest.js"
    target_version = date_str.replace("-", "")

    files = [path.name for path in NEWS_DIR.glob("*.md") if path.is_file()]

    def sort_key(name: str) -> tuple[int, str]:
        match = re.fullmatch(r"(\d{4}-\d{2}-\d{2})\.md", name)
        if match:
            return (0, match.group(1))
        return (1, name)

    files = sorted(set(files), key=sort_key, reverse=True)
    rendered_files = ",\n".join(f"    '{name}'" for name in files)
    content = (
        "window.NEWS_MANIFEST = {\n"
        "  // 每次更新新闻后修改 version，可强制浏览器重新拉取最新资源\n"
        f"  version: '{target_version}',\n"
        "  files: [\n"
        f"{rendered_files}\n"
        "  ]\n"
        "};\n"
    )
    manifest_path.write_text(content, encoding="utf-8")


def read_input_text(path: str | None) -> str:
    if path:
        return pathlib.Path(path).read_text(encoding="utf-8")
    return sys.stdin.read()


def build_collect_config(args: argparse.Namespace) -> CollectConfig:
    return CollectConfig(
        request_timeout=args.request_timeout,
        budget_seconds=args.budget_seconds,
        max_official_links=args.max_official_links,
        max_media_links=args.max_media_links,
        max_nvidia_links=args.max_nvidia_links,
        max_arxiv_items=args.max_arxiv_items,
    )



def cmd_collect(args: argparse.Namespace) -> int:
    date_str = parse_target_date(args.date)
    candidates = collect_candidates(date_str, build_collect_config(args))
    if args.output:
        output_path = pathlib.Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if args.format == "json":
            output_path.write_text(
                json.dumps([item.to_dict() for item in candidates], ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
        else:
            output_path.write_text(render_candidates_markdown(candidates), encoding="utf-8")

    if args.format == "json":
        json.dump([item.to_dict() for item in candidates], sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
    else:
        sys.stdout.write(render_candidates_markdown(candidates))
    return 0


def cmd_prompt(args: argparse.Namespace) -> int:
    date_str = parse_target_date(args.date)
    candidates = collect_candidates(date_str, build_collect_config(args))
    prompt_candidates = candidates[:18]
    if args.style == "full":
        template = PROMPT_PATH.read_text(encoding="utf-8").replace("{{DATE}}", date_str)
        if prompt_candidates:
            prompt = (
                template.rstrip()
                + "\n\n候选素材（优先参考，可自行补充可信一手来源）：\n\n"
                + render_candidates_markdown(prompt_candidates)
            )
        else:
            prompt = template
    else:
        prompt = build_compact_prompt(date_str, prompt_candidates)
    sys.stdout.write(prompt)
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    date_str = parse_target_date(args.date) if args.date else None
    raw = read_input_text(args.input)
    input_format = args.input_format
    if input_format == "auto" and args.input:
        suffix = pathlib.Path(args.input).suffix.lower()
        input_format = "json" if suffix == ".json" else "markdown"
    elif input_format == "auto":
        input_format = "markdown"

    if input_format == "json":
        day, items = load_items_from_json(raw, date_str or dt.date.today().isoformat())
    else:
        day, items = parse_news_markdown(raw, date_str or dt.date.today().isoformat())

    errors = validate_news(day, items, date_str, strict_count=not args.allow_any_count)
    if errors:
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"验证通过：day={day}，items={len(items)}")
    return 0


def cmd_publish(args: argparse.Namespace) -> int:
    date_str = parse_target_date(args.date)
    raw = read_input_text(args.input)
    input_format = args.input_format
    if input_format == "auto" and args.input:
        suffix = pathlib.Path(args.input).suffix.lower()
        input_format = "json" if suffix == ".json" else "markdown"
    elif input_format == "auto":
        input_format = "markdown"

    if input_format == "json":
        day, items = load_items_from_json(raw, date_str)
        markdown = render_news_markdown(day, items)
    else:
        day, items = parse_news_markdown(raw, date_str)
        markdown = render_news_markdown(day, items)

    errors = validate_news(day, items, date_str, strict_count=not args.allow_any_count)
    if errors and not args.force:
        raise CliError("发布失败，校验未通过：\n" + "\n".join(f"- {error}" for error in errors))

    news_path = NEWS_DIR / f"{date_str}.md"
    news_path.write_text(markdown, encoding="utf-8")
    update_manifest(date_str)

    print(f"已写入 {news_path}")
    print(f"已更新 {(NEWS_DIR / 'manifest.js')}")
    if errors:
        print("注意：已使用 --force 发布，以下校验问题仍然存在：")
        for error in errors:
            print(f"- {error}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="AI Daily 日报辅助脚本：抓候选、生成 prompt、校验并发布新闻。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent(
            """\
            示例：
              python scripts/ai_daily.py collect --date 2026-03-17
              python scripts/ai_daily.py prompt --date 2026-03-17 > prompt.txt
              python scripts/ai_daily.py validate --input news/2026-03-17.md
              python scripts/ai_daily.py publish --date 2026-03-17 --input draft.md
            """
        ),
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    collect_parser = subparsers.add_parser("collect", help="抓取当天候选新闻")
    collect_parser.add_argument("--date", help="目标日期，格式 YYYY-MM-DD，默认 today")
    collect_parser.add_argument(
        "--format",
        choices=("markdown", "json"),
        default="markdown",
        help="输出格式",
    )
    collect_parser.add_argument("--output", help="可选：把结果额外写入文件")
    collect_parser.add_argument("--request-timeout", type=int, default=DEFAULT_REQUEST_TIMEOUT, help="单个网络请求超时秒数")
    collect_parser.add_argument("--budget-seconds", type=int, default=DEFAULT_COLLECT_BUDGET_SECONDS, help="整轮抓取总预算秒数；超时后跳过剩余慢源")
    collect_parser.add_argument("--max-official-links", type=int, default=12, help="每个官方源最多检查多少链接")
    collect_parser.add_argument("--max-media-links", type=int, default=40, help="媒体归档最多检查多少链接")
    collect_parser.add_argument("--max-nvidia-links", type=int, default=25, help="NVIDIA 首页最多检查多少链接")
    collect_parser.add_argument("--max-arxiv-items", type=int, default=18, help="arXiv 最多保留多少条论文")
    collect_parser.set_defaults(func=cmd_collect)

    prompt_parser = subparsers.add_parser("prompt", help="生成给 AI 的 prompt")
    prompt_parser.add_argument("--date", help="目标日期，格式 YYYY-MM-DD，默认 today")
    prompt_parser.add_argument(
        "--style",
        choices=("compact", "full"),
        default="compact",
        help="compact 为精简提示词，full 为 PROMPT.md 原文加候选素材",
    )
    prompt_parser.add_argument("--request-timeout", type=int, default=DEFAULT_REQUEST_TIMEOUT, help="单个网络请求超时秒数")
    prompt_parser.add_argument("--budget-seconds", type=int, default=DEFAULT_COLLECT_BUDGET_SECONDS, help="整轮抓取总预算秒数；超时后跳过剩余慢源")
    prompt_parser.add_argument("--max-official-links", type=int, default=12, help="每个官方源最多检查多少链接")
    prompt_parser.add_argument("--max-media-links", type=int, default=40, help="媒体归档最多检查多少链接")
    prompt_parser.add_argument("--max-nvidia-links", type=int, default=25, help="NVIDIA 首页最多检查多少链接")
    prompt_parser.add_argument("--max-arxiv-items", type=int, default=18, help="arXiv 最多保留多少条论文")
    prompt_parser.set_defaults(func=cmd_prompt)

    validate_parser = subparsers.add_parser("validate", help="校验日报 Markdown 或 JSON")
    validate_parser.add_argument("--date", help="目标日期，格式 YYYY-MM-DD")
    validate_parser.add_argument("--input", help="输入文件路径；不传则从 stdin 读取")
    validate_parser.add_argument(
        "--input-format",
        choices=("auto", "markdown", "json"),
        default="auto",
        help="输入格式",
    )
    validate_parser.add_argument(
        "--allow-any-count",
        action="store_true",
        help="不强制限制 7 到 10 条",
    )
    validate_parser.set_defaults(func=cmd_validate)

    publish_parser = subparsers.add_parser("publish", help="发布日报并更新 manifest")
    publish_parser.add_argument("--date", required=True, help="目标日期，格式 YYYY-MM-DD")
    publish_parser.add_argument("--input", help="输入文件路径；不传则从 stdin 读取")
    publish_parser.add_argument(
        "--input-format",
        choices=("auto", "markdown", "json"),
        default="auto",
        help="输入格式",
    )
    publish_parser.add_argument(
        "--allow-any-count",
        action="store_true",
        help="不强制限制 7 到 10 条",
    )
    publish_parser.add_argument(
        "--force",
        action="store_true",
        help="即使校验失败也继续写入文件和 manifest",
    )
    publish_parser.set_defaults(func=cmd_publish)

    return parser


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except CliError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("操作已取消", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
