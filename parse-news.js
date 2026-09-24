(function (global) {
  const FIXED_CATEGORIES = [
    '应用/产业',
    '论文',
    '基础设施',
    '安全',
    '生态',
    '开源',
    '观察'
  ];
  const FALLBACK_CATEGORY = '其他';

  function normalizeLineEndings(value) {
    return String(value || '').replace(/\r\n?/g, '\n');
  }

  function unescapeNewsText(value) {
    let text = String(value || '');
    if (!text.includes('\\')) return text;

    // Hermes / JSON 转义常会把 \" \' \\ 原样写进标题和摘要。
    for (let i = 0; i < 3; i += 1) {
      const next = text
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\');
      if (next === text) break;
      text = next;
    }
    return text;
  }

  function parseCategories(categoryString) {
    return String(categoryString || '')
      .split(',')
      .map(cat => cat.trim())
      .filter(cat => cat.length > 0 && cat !== FALLBACK_CATEGORY);
  }

  function normalizeCategoryString(categoryString, summary) {
    const categories = parseCategories(categoryString);
    const seen = new Set(categories);
    const normalizedSummary = normalizeLineEndings(summary);

    // If the summary explicitly mentions a fixed label, append it automatically.
    FIXED_CATEGORIES.forEach((category) => {
      if (normalizedSummary.includes(category) && !seen.has(category)) {
        seen.add(category);
        categories.push(category);
      }
    });

    return categories.length ? categories.join(',') : FALLBACK_CATEGORY;
  }

  function normalizeFieldValue(value) {
    const normalized = normalizeLineEndings(value);

    if (/^\|(?:\s*\n|$)/.test(normalized)) {
      const withoutBlockMarker = normalized.replace(/^\|\s*\n?/, '');
      const lines = withoutBlockMarker.split('\n');
      const indents = lines
        .filter(line => line.trim())
        .map(line => {
          const match = line.match(/^\s*/);
          return match ? match[0].length : 0;
        });
      const minIndent = indents.length ? Math.min.apply(null, indents) : 0;

      return unescapeNewsText(lines
        .map(line => line.slice(Math.min(minIndent, line.length)))
        .join('\n')
        .trim());
    }

    return unescapeNewsText(normalized
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      .trim());
  }

  function parseDayFromFile(fileName) {
    const m = String(fileName || '').match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '1970-01-01';
  }

  function readField(block, key) {
    const normalizedBlock = normalizeLineEndings(block);
    const pattern = new RegExp(`(?:^|\\n)-\\s*${key}:\\s*([\\s\\S]*?)(?=\\n-\\s*[a-z]+:\\s|\\n##\\s+|$)`, 'i');
    const match = normalizedBlock.match(pattern);
    if (!match) return '';
    return normalizeFieldValue(match[1]);
  }

  function parseNewsMarkdown(raw, fallbackDay) {
    const normalizedRaw = normalizeLineEndings(raw);
    const dayMatch = normalizedRaw.match(/^day:\s*(\d{4}-\d{2}-\d{2})\s*$/m);
    const day = dayMatch ? dayMatch[1] : fallbackDay;
    const blocks = normalizedRaw
      .split(/\n##\s+/)
      .map((part, index) => (index === 0 ? part : `## ${part}`))
      .filter(part => part.startsWith('## '));

    const items = blocks.map((block) => {
      const titleMatch = block.match(/^##\s+(.+)$/m);
      const summary = readField(block, 'summary');

      return {
        title: unescapeNewsText(titleMatch ? titleMatch[1].trim() : '无标题'),
        source: readField(block, 'source') || '未知来源',
        date: readField(block, 'date') || day,
        category: normalizeCategoryString(readField(block, 'category'), summary),
        url: readField(block, 'url') || '#',
        summary,
        detail: readField(block, 'detail')
      };
    });

    return { day, items };
  }

  function normalizeItems(day, items) {
    return (items || []).map((item, idx) => ({
      id: `${day}-${idx}`,
      day,
      title: unescapeNewsText(item.title || '无标题'),
      source: unescapeNewsText(item.source || '未知来源'),
      date: item.date || day,
      category: normalizeCategoryString(item.category, item.summary),
      summary: unescapeNewsText(item.summary || ''),
      detail: unescapeNewsText(item.detail || ''),
      url: item.url || '#'
    }));
  }

  function extractArxivId() {
    const text = Array.prototype.slice.call(arguments).join(' ');
    const hosted = String(text || '').match(
      /(?:arxiv\.org\/(?:abs|pdf|html|e-print)\/|papers\.cool\/arxiv\/|huggingface\.co\/papers\/)(\d{4}\.\d{4,5})(?:v\d+)?/i
    );
    if (hosted) return hosted[1];
    if (!/arxiv|papers\.cool/i.test(text)) return '';
    const bare = String(text || '').match(/\b(\d{4}\.\d{4,5})(?:v\d+)?\b/);
    return bare ? bare[1] : '';
  }

  function papersCoolUrl(arxivId) {
    return arxivId ? `https://papers.cool/arxiv/${arxivId}` : '';
  }

  function extraSourceLinks(item) {
    const record = item || {};
    const arxivId = extractArxivId(record.url, record.source, record.title, record.summary);
    if (!arxivId) return [];
    if (/papers\.cool\/arxiv\//i.test(record.url || '')) return [];
    return [{ label: 'papers.cool', href: papersCoolUrl(arxivId) }];
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sourceMetaHtml(item) {
    const record = item || {};
    const extra = extraSourceLinks(record);
    const parts = [`<span>${escapeHtml(record.source || '未知来源')}</span>`];
    extra.forEach((link) => {
      parts.push(
        `<a class="source-extra-link" href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`
      );
    });
    return parts.join('<span class="detail-source-sep"> · </span>');
  }

  global.NewsParser = {
    parseDayFromFile,
    parseNewsMarkdown,
    normalizeItems,
    extractArxivId,
    papersCoolUrl,
    extraSourceLinks,
    sourceMetaHtml
  };
})(window);
