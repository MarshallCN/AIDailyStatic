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

      return lines
        .map(line => line.slice(Math.min(minIndent, line.length)))
        .join('\n')
        .trim();
    }

    return normalized
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      .trim();
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
        title: titleMatch ? titleMatch[1].trim() : '无标题',
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
      title: item.title || '无标题',
      source: item.source || '未知来源',
      date: item.date || day,
      category: normalizeCategoryString(item.category, item.summary),
      summary: item.summary || '',
      detail: item.detail || '',
      url: item.url || '#'
    }));
  }

  global.NewsParser = {
    parseDayFromFile,
    parseNewsMarkdown,
    normalizeItems
  };
})(window);
