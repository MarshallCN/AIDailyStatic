(function (global) {
  function parseDayFromFile(fileName) {
    const m = String(fileName || '').match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '1970-01-01';
  }

  function readField(block, key) {
    const pattern = new RegExp(`^-\\s*${key}:\\s*([\\s\\S]*?)(?=\\n-\\s*[a-z]+:\\s|\\n##\\s+|$)`, 'mi');
    const match = block.match(pattern);
    if (!match) return '';
    return match[1]
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      .trim();
  }

  function parseNewsMarkdown(raw, fallbackDay) {
    const dayMatch = raw.match(/^day:\s*(\d{4}-\d{2}-\d{2})\s*$/m);
    const day = dayMatch ? dayMatch[1] : fallbackDay;
    const blocks = raw
      .split(/\n##\s+/)
      .map((part, index) => (index === 0 ? part : `## ${part}`))
      .filter(part => part.startsWith('## '));

    const items = blocks.map((block) => {
      const titleMatch = block.match(/^##\s+(.+)$/m);

      return {
        title: titleMatch ? titleMatch[1].trim() : '无标题',
        source: readField(block, 'source') || '未知来源',
        date: readField(block, 'date') || day,
        category: readField(block, 'category') || '其他',
        url: readField(block, 'url') || '#',
        summary: readField(block, 'summary'),
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
      category: item.category || '其他',
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
