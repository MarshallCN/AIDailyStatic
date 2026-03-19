(function (global) {
  const FIXED_CATEGORIES = [
    '应用/产业',
    '论文',
    '基础设施',
    '观察',
    '安全',
    '生态',
    '开源'
  ];

  const EN_STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'by', 'for', 'from', 'has',
    'have', 'if', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 's', 'such', 't', 'that',
    'the', 'their', 'then', 'there', 'these', 'this', 'to', 'via', 'was', 'were', 'will', 'with'
  ]);

  const ZH_STOP_WORDS = new Set([
    '一个', '一些', '一种', '一项', '一次', '一条', '已经', '以及', '以上', '之后',
    '企业', '公司', '今天', '今年', '仍然', '从而', '他们', '作为', '使得', '使用',
    '例如', '其中', '具有', '其实', '再次', '出现', '包括', '同时', '因为', '围绕',
    '如果', '对于', '并且', '并非', '形成', '当前', '很多', '正在', '开始', '带来',
    '意味着', '我们', '或许', '技术', '持续', '提供', '提到', '提升', '推动', '数据',
    '方面', '显示', '更多', '未来', '模式', '此次', '流程', '相关', '看到', '真正',
    '研究', '系统', '继续', '能力', '落地', '表明', '观察', '这次', '这个', '这些',
    '这一', '这种', '这样', '还会', '还在', '还是', '通过', '那个', '那么', '进行',
    '部分', '需要', '非常'
  ]);

  const ANALYSIS_NOISE_WORDS = new Set([
    'ai', 'llm', 'llms', 'api', 'apis', 'app', 'apps', 'demo', 'agent', 'agents', 'assistant',
    'assistants', 'chat', 'model', 'models', 'news', 'service', 'services', 'system', 'systems',
    'workflow', 'workflows', 'today', 'update', 'updates', '产品', '体验', '功能', '问题',
    '工作', '市场', '部署', '表现', '路线', '过程', '方案', '消息', '行业', '需求'
  ]);

  const ENTITY_NOISE_WORDS = new Set([
    'ai', 'llm', 'api', 'gpu', 'gpus', 'ga', 'uk', 'us', 'app', 'apps', 'chat', 'prime',
    '产品', '功能', '服务', '平台', '系统', '能力', '部署', '新闻', '行业', '公司', '模型'
  ]);

  const segmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('zh-CN', { granularity: 'word' })
    : null;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFKC')
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .trim();
  }

  function normalizeForComparison(value) {
    return normalizeText(value)
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  const FIXED_CATEGORY_KEYS = new Set(FIXED_CATEGORIES.map((category) => normalizeForComparison(category)));

  function parseCategories(categoryString) {
    return String(categoryString || '')
      .split(',')
      .map((category) => category.trim())
      .filter(Boolean);
  }

  function uniqueStrings(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function buildDetailLink(item, fromPath) {
    const params = new URLSearchParams({
      id: item.id || '',
      from: fromPath || 'index.html'
    });
    return `detail.html?${params.toString()}`;
  }

  function trimToken(token) {
    return String(token || '')
      .replace(/^[^0-9A-Za-z\u4e00-\u9fff.+-]+/, '')
      .replace(/[^0-9A-Za-z\u4e00-\u9fff.+-]+$/, '')
      .trim();
  }

  function isNumericToken(token) {
    return /^\d+(?:[.:/-]\d+)*$/.test(token);
  }

  function isYearToken(token) {
    return /^(?:19|20)\d{2}$/.test(String(token || ''));
  }

  function isChineseToken(token) {
    return /[\u4e00-\u9fff]/.test(token);
  }

  function shouldKeepToken(token, mode) {
    if (!token) {
      return false;
    }

    if (isNumericToken(token) && !isYearToken(token)) {
      return false;
    }

    if (isChineseToken(token)) {
      if (token.length < 2 || token.length > 6) {
        return false;
      }
      if (ZH_STOP_WORDS.has(token)) {
        return false;
      }
      if (mode !== 'search' && ANALYSIS_NOISE_WORDS.has(token)) {
        return false;
      }
      return true;
    }

    if (token.length < 2) {
      return false;
    }
    if (EN_STOP_WORDS.has(token)) {
      return false;
    }
    if (mode !== 'search' && ANALYSIS_NOISE_WORDS.has(token)) {
      return false;
    }
    return true;
  }

  function collectRawSegments(text) {
    const source = normalizeText(text);
    const segments = [];

    if (segmenter) {
      const iterator = segmenter.segment(source);
      for (const part of iterator) {
        segments.push(part.segment);
      }
    } else {
      segments.push.apply(segments, source.split(/\s+/));
    }

    const latinMatches = source.match(/[A-Za-z][A-Za-z0-9.+-]*/g) || [];
    segments.push.apply(segments, latinMatches);

    return segments;
  }

  function tokenizeText(text, options) {
    const mode = (options && options.mode) || 'search';
    const segments = collectRawSegments(text);
    const tokens = [];

    segments.forEach((segment) => {
      const normalized = trimToken(segment).toLowerCase();
      if (!shouldKeepToken(normalized, mode)) {
        return;
      }
      tokens.push(normalized);
    });

    return tokens;
  }

  function tokenizeSearchText(text) {
    return uniqueStrings(tokenizeText(text, { mode: 'search' }));
  }

  function tokenizeAnalysisText(text) {
    return tokenizeText(text, { mode: 'analysis' });
  }

  function tokenizeEntityText(text) {
    return uniqueStrings(tokenizeText(text, { mode: 'entity' }));
  }

  function buildHighlightTerms(query, exactMatch) {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) {
      return [];
    }
    if (exactMatch) {
      return [normalizedQuery];
    }
    const tokens = tokenizeSearchText(normalizedQuery);
    return tokens.length ? tokens : [normalizedQuery];
  }

  function buildHighlightPattern(terms) {
    const cleaned = uniqueStrings((terms || []).map((term) => normalizeText(term)).filter(Boolean))
      .sort((a, b) => b.length - a.length)
      .map(escapeRegex);

    if (!cleaned.length) {
      return null;
    }

    return new RegExp(cleaned.join('|'), 'gi');
  }

  function highlightText(text, terms) {
    const raw = String(text || '');
    const pattern = buildHighlightPattern(terms);

    if (!pattern) {
      return escapeHtml(raw);
    }

    let result = '';
    let lastIndex = 0;

    raw.replace(pattern, function (match, offset) {
      result += escapeHtml(raw.slice(lastIndex, offset));
      result += `<mark>${escapeHtml(match)}</mark>`;
      lastIndex = offset + match.length;
      return match;
    });

    result += escapeHtml(raw.slice(lastIndex));
    return result;
  }

  function findFirstMatch(text, terms) {
    const raw = String(text || '');
    const pattern = buildHighlightPattern(terms);
    if (!pattern) {
      return null;
    }
    const match = pattern.exec(raw);
    if (!match) {
      return null;
    }
    return {
      index: match.index,
      length: match[0].length
    };
  }

  function extractSnippet(text, terms, maxLength) {
    const raw = normalizeText(text);
    if (!raw) {
      return '';
    }

    const limit = Math.max(80, maxLength || 160);
    const match = findFirstMatch(raw, terms);

    if (!match || raw.length <= limit) {
      return raw.length > limit ? `${raw.slice(0, limit - 1)}…` : raw;
    }

    const padding = Math.max(24, Math.floor((limit - match.length) / 2));
    const start = Math.max(0, match.index - padding);
    const end = Math.min(raw.length, match.index + match.length + padding);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < raw.length ? '…' : '';

    return `${prefix}${raw.slice(start, end).trim()}${suffix}`;
  }

  function countOccurrences(text, term) {
    const haystack = normalizeForComparison(text);
    const needle = normalizeForComparison(term);
    if (!needle) {
      return 0;
    }

    let count = 0;
    let cursor = 0;
    while (cursor >= 0) {
      const index = haystack.indexOf(needle, cursor);
      if (index === -1) {
        break;
      }
      count += 1;
      cursor = index + needle.length;
    }
    return count;
  }

  function buildQueryProfile(rawQuery, exactMatch) {
    const query = normalizeText(rawQuery);
    const terms = buildHighlightTerms(query, exactMatch);

    return {
      raw: query,
      exactMatch: Boolean(exactMatch),
      terms,
      normalizedQuery: normalizeForComparison(query),
      highlightTerms: terms
    };
  }

  function buildSearchSnippet(item, terms) {
    const summaryMatch = findFirstMatch(item.summary, terms);
    if (summaryMatch) {
      return extractSnippet(item.summary, terms, 180);
    }

    const detailSnippet = extractSnippet(item.detail, terms, 180);
    if (detailSnippet) {
      return detailSnippet;
    }

    return extractSnippet(item.summary || item.detail, terms, 180);
  }

  function scoreExactItem(item, queryProfile) {
    const normalizedTitle = normalizeForComparison(item.title);
    const normalizedSummary = normalizeForComparison(item.summary);
    const normalizedDetail = normalizeForComparison(item.detail);
    const phrase = queryProfile.normalizedQuery;

    const titleIndex = normalizedTitle.indexOf(phrase);
    const summaryIndex = normalizedSummary.indexOf(phrase);
    const detailIndex = normalizedDetail.indexOf(phrase);

    if (titleIndex === -1 && summaryIndex === -1 && detailIndex === -1) {
      return null;
    }

    let score = 0;
    if (titleIndex !== -1) {
      score += 300 - Math.min(titleIndex, 120);
    }
    if (summaryIndex !== -1) {
      score += 200 - Math.min(summaryIndex, 120);
    }
    if (detailIndex !== -1) {
      score += 100 - Math.min(detailIndex, 120);
    }

    let matchedField = 'detail';
    if (titleIndex !== -1) {
      matchedField = 'title';
    } else if (summaryIndex !== -1) {
      matchedField = 'summary';
    }

    return {
      item,
      score,
      matchedField,
      snippet: buildSearchSnippet(item, queryProfile.terms)
    };
  }

  function scoreFuzzyItem(item, queryProfile) {
    const terms = queryProfile.terms;
    if (!terms.length) {
      return null;
    }

    const combined = normalizeForComparison([item.title, item.summary, item.detail].join('\n'));
    const matchedTerms = terms.filter((term) => combined.includes(normalizeForComparison(term)));

    if (matchedTerms.length !== terms.length) {
      return null;
    }

    let score = 0;
    matchedTerms.forEach((term) => {
      score += countOccurrences(item.title, term) * 7;
      score += countOccurrences(item.summary, term) * 4;
      score += countOccurrences(item.detail, term) * 2;
    });

    if (normalizeForComparison(item.title).includes(queryProfile.normalizedQuery)) {
      score += 20;
    }
    if (normalizeForComparison(item.summary).includes(queryProfile.normalizedQuery)) {
      score += 12;
    }

    return {
      item,
      score,
      matchedField: normalizeForComparison(item.title).includes(queryProfile.normalizedQuery)
        ? 'title'
        : (normalizeForComparison(item.summary).includes(queryProfile.normalizedQuery) ? 'summary' : 'detail'),
      snippet: buildSearchSnippet(item, matchedTerms)
    };
  }

  function rankSearchResults(items, queryProfile) {
    const scored = items
      .map((item) => {
        return queryProfile.exactMatch
          ? scoreExactItem(item, queryProfile)
          : scoreFuzzyItem(item, queryProfile);
      })
      .filter(Boolean);

    return scored.sort((a, b) => {
      if (a.score === b.score) {
        if (a.item.date === b.item.date) {
          return a.item.title.localeCompare(b.item.title, 'zh-Hans-CN');
        }
        return b.item.date.localeCompare(a.item.date);
      }
      return b.score - a.score;
    });
  }

  function buildSeedTokenMap(items) {
    const counts = new Map();
    items.forEach((item) => {
      const tokens = tokenizeAnalysisText([item.title, item.summary, item.detail].join('\n'));
      uniqueStrings(tokens).forEach((token) => {
        counts.set(token, (counts.get(token) || 0) + 1);
      });
    });
    return counts;
  }

  function buildRelatedResults(allItems, searchResults, queryProfile, options) {
    const limit = (options && options.limit) || 8;
    if (!searchResults.length) {
      return [];
    }

    const directIds = new Set(searchResults.map((entry) => entry.item.id));
    const seedItems = searchResults.slice(0, 6).map((entry) => entry.item);
    const tokenCounts = buildSeedTokenMap(seedItems);
    const topTokens = Array.from(tokenCounts.entries())
      .sort((a, b) => {
        if (a[1] === b[1]) return a[0].localeCompare(b[0], 'zh-Hans-CN');
        return b[1] - a[1];
      })
      .slice(0, 12)
      .map((entry) => entry[0]);

    const sourceSet = new Set(seedItems.map((item) => item.source));
    const categorySet = new Set();
    seedItems.forEach((item) => {
      parseCategories(item.category).forEach((category) => categorySet.add(category));
    });

    return allItems
      .filter((item) => !directIds.has(item.id))
      .map((item) => {
        const itemTokenSet = new Set(tokenizeAnalysisText([item.title, item.summary, item.detail].join('\n')));
        const sharedTokens = topTokens.filter((token) => itemTokenSet.has(token));
        const sharedCategories = parseCategories(item.category).filter((category) => categorySet.has(category));
        let score = 0;

        score += sharedTokens.length * 3;
        score += sharedCategories.length * 2;
        if (sourceSet.has(item.source)) {
          score += 2;
        }

        queryProfile.terms.forEach((term) => {
          if (itemTokenSet.has(normalizeForComparison(term))) {
            score += 1;
          }
        });

        if (score < 3) {
          return null;
        }

        return {
          item,
          score,
          sharedTokens,
          sharedCategories,
          snippet: buildSearchSnippet(item, queryProfile.terms.length ? queryProfile.terms : topTokens.slice(0, 3))
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.score === b.score) {
          return b.item.date.localeCompare(a.item.date);
        }
        return b.score - a.score;
      })
      .slice(0, limit);
  }

  function filterItems(items, filters) {
    const startDate = filters && filters.startDate ? filters.startDate : '';
    const endDate = filters && filters.endDate ? filters.endDate : '';
    const category = filters && filters.category ? filters.category : '';

    return (items || []).filter((item) => {
      const day = item.day || item.date || '';
      if (startDate && day < startDate) {
        return false;
      }
      if (endDate && day > endDate) {
        return false;
      }
      if (category && category !== '全部' && category !== '全部分类') {
        return parseCategories(item.category).includes(category);
      }
      return true;
    });
  }

  function formatDateRangeLabel(startDate, endDate) {
    if (startDate && endDate) {
      return startDate === endDate ? startDate : `${startDate} 至 ${endDate}`;
    }
    return startDate || endDate || '全部时间';
  }

  function buildWordCloudStats(items) {
    const termMap = new Map();

    (items || []).forEach((item) => {
      const tokens = tokenizeAnalysisText([item.title, item.summary, item.detail].join('\n'));
      tokens.forEach((token) => {
        let entry = termMap.get(token);
        if (!entry) {
          entry = {
            term: token,
            count: 0,
            articleIds: new Set(),
            dayCounts: new Map()
          };
          termMap.set(token, entry);
        }

        entry.count += 1;
        entry.articleIds.add(item.id);
        entry.dayCounts.set(item.day, (entry.dayCounts.get(item.day) || 0) + 1);
      });
    });

    const terms = Array.from(termMap.values())
      .map((entry) => ({
        term: entry.term,
        count: entry.count,
        articleIds: Array.from(entry.articleIds),
        articleCount: entry.articleIds.size,
        dayCounts: Array.from(entry.dayCounts.entries()).sort((a, b) => b[0].localeCompare(a[0]))
      }))
      .sort((a, b) => {
        if (a.count === b.count) {
          if (a.articleCount === b.articleCount) {
            return a.term.localeCompare(b.term, 'zh-Hans-CN');
          }
          return b.articleCount - a.articleCount;
        }
        return b.count - a.count;
      });

    return {
      terms,
      termMap: new Map(terms.map((entry) => [entry.term, entry]))
    };
  }

  function normalizeEntityName(value) {
    return normalizeText(value)
      .replace(/^[^0-9A-Za-z\u4e00-\u9fff.+-]+/, '')
      .replace(/[^0-9A-Za-z\u4e00-\u9fff.+-]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildEntityScoreMap(item) {
    const scoreMap = new Map();
    const titleSummary = [item.title, item.summary].join(' ');
    const body = item.detail || '';

    function addEntity(name, weight) {
      const displayName = normalizeEntityName(name);
      const key = normalizeForComparison(displayName);
      if (!displayName || !key || ENTITY_NOISE_WORDS.has(key)) {
        return;
      }
      if (FIXED_CATEGORY_KEYS.has(key)) {
        return;
      }
      if (isNumericToken(key) && !isYearToken(key)) {
        return;
      }
      const current = scoreMap.get(key) || { key, name: displayName, score: 0 };
      current.score += weight;
      if (displayName.length > current.name.length) {
        current.name = displayName;
      }
      scoreMap.set(key, current);
    }

    const englishPatterns = [
      /\b[A-Z][A-Za-z0-9.+-]*(?:\s+[A-Z][A-Za-z0-9.+-]*){0,2}\b/g,
      /\b[A-Z0-9]{2,}(?:[.+-][A-Z0-9]+)*\b/g,
      /\b[A-Za-z]+[+][A-Za-z0-9.+-]*\b/g
    ];

    englishPatterns.forEach((pattern) => {
      const titleMatches = titleSummary.match(pattern) || [];
      titleMatches.forEach((match) => addEntity(match, 3));
      const bodyMatches = body.match(pattern) || [];
      bodyMatches.forEach((match) => addEntity(match, 1));
    });

    tokenizeEntityText(titleSummary).forEach((token) => addEntity(token, 2));
    tokenizeEntityText(body).slice(0, 12).forEach((token) => addEntity(token, 1));

    return scoreMap;
  }

  function buildClueGraph(items, options) {
    const maxEntities = (options && options.maxEntities) || 40;
    const minEntityEdgeWeight = (options && options.minEntityEdgeWeight) || 2;
    const maxClues = (options && options.maxClues) || 5;
    const rangeLabel = (options && options.rangeLabel) || '全部时间';

    const itemEntityMap = new Map();
    const entityDocCount = new Map();
    const entityScoreSum = new Map();
    const entityNameMap = new Map();

    (items || []).forEach((item) => {
      const entityScores = buildEntityScoreMap(item);
      const ranked = Array.from(entityScores.values())
        .sort((a, b) => {
          if (a.score === b.score) {
            return a.name.localeCompare(b.name, 'zh-Hans-CN');
          }
          return b.score - a.score;
        })
        .slice(0, 8);

      itemEntityMap.set(item.id, ranked);
      ranked.forEach((entry) => {
        entityDocCount.set(entry.key, (entityDocCount.get(entry.key) || 0) + 1);
        entityScoreSum.set(entry.key, (entityScoreSum.get(entry.key) || 0) + entry.score);
        entityNameMap.set(entry.key, entry.name);
      });
    });

    const retainedEntityKeys = Array.from(entityDocCount.keys())
      .sort((a, b) => {
        const docDelta = (entityDocCount.get(b) || 0) - (entityDocCount.get(a) || 0);
        if (docDelta !== 0) return docDelta;
        const scoreDelta = (entityScoreSum.get(b) || 0) - (entityScoreSum.get(a) || 0);
        if (scoreDelta !== 0) return scoreDelta;
        return (entityNameMap.get(a) || '').localeCompare(entityNameMap.get(b) || '', 'zh-Hans-CN');
      })
      .slice(0, maxEntities);

    const retainedEntitySet = new Set(retainedEntityKeys);
    const nodes = [];
    const edges = [];
    const nodeIds = new Set();
    const sourceNodeIds = new Map();
    const categoryNodeIds = new Map();
    const entityNodeIds = new Map();
    const articleEntityKeyMap = new Map();

    function ensureNode(id, data) {
      if (nodeIds.has(id)) {
        return;
      }
      nodeIds.add(id);
      nodes.push({ data: Object.assign({ id: id }, data) });
    }

    (items || []).forEach((item) => {
      const articleNodeId = `article:${item.id}`;
      ensureNode(articleNodeId, {
        label: item.title,
        type: 'article',
        day: item.day,
        category: item.category,
        source: item.source
      });

      const sourceNodeId = `source:${encodeURIComponent(item.source)}`;
      sourceNodeIds.set(item.source, sourceNodeId);
      ensureNode(sourceNodeId, {
        label: item.source,
        type: 'source'
      });
      edges.push({
        data: {
          id: `edge:${articleNodeId}->${sourceNodeId}`,
          source: articleNodeId,
          target: sourceNodeId,
          type: 'article-source'
        }
      });

      parseCategories(item.category).forEach((category) => {
        const categoryNodeId = `category:${encodeURIComponent(category)}`;
        categoryNodeIds.set(category, categoryNodeId);
        ensureNode(categoryNodeId, {
          label: category,
          type: 'category'
        });
        edges.push({
          data: {
            id: `edge:${articleNodeId}->${categoryNodeId}`,
            source: articleNodeId,
            target: categoryNodeId,
            type: 'article-category'
          }
        });
      });

      const retainedKeys = (itemEntityMap.get(item.id) || [])
        .filter((entry) => retainedEntitySet.has(entry.key))
        .map((entry) => entry.key);

      articleEntityKeyMap.set(item.id, retainedKeys);
      retainedKeys.forEach((entityKey) => {
        const label = entityNameMap.get(entityKey) || entityKey;
        const entityNodeId = `entity:${encodeURIComponent(entityKey)}`;
        entityNodeIds.set(entityKey, entityNodeId);
        ensureNode(entityNodeId, {
          label: label,
          type: 'entity'
        });
        edges.push({
          data: {
            id: `edge:${articleNodeId}->${entityNodeId}`,
            source: articleNodeId,
            target: entityNodeId,
            type: 'article-entity'
          }
        });
      });
    });

    const entityEdgeMap = new Map();
    (items || []).forEach((item) => {
      const uniqueKeys = uniqueStrings(articleEntityKeyMap.get(item.id) || []).sort();
      for (let i = 0; i < uniqueKeys.length; i += 1) {
        for (let j = i + 1; j < uniqueKeys.length; j += 1) {
          const left = uniqueKeys[i];
          const right = uniqueKeys[j];
          const pairKey = `${left}__${right}`;
          let entry = entityEdgeMap.get(pairKey);
          if (!entry) {
            entry = {
              left,
              right,
              weight: 0,
              articleIds: new Set()
            };
            entityEdgeMap.set(pairKey, entry);
          }
          entry.weight += 1;
          entry.articleIds.add(item.id);
        }
      }
    });

    const entityEdges = Array.from(entityEdgeMap.values())
      .filter((entry) => entry.weight >= minEntityEdgeWeight)
      .map((entry) => {
        const source = entityNodeIds.get(entry.left);
        const target = entityNodeIds.get(entry.right);
        return {
          data: {
            id: `edge:${source}<->${target}`,
            source: source,
            target: target,
            type: 'entity-entity',
            weight: entry.weight,
            articleIds: Array.from(entry.articleIds)
          }
        };
      });

    edges.push.apply(edges, entityEdges);

    const adjacency = new Map();
    retainedEntityKeys.forEach((entityKey) => adjacency.set(entityKey, new Set()));
    entityEdges.forEach((edge) => {
      const sourceKey = decodeURIComponent(edge.data.source.replace(/^entity:/, ''));
      const targetKey = decodeURIComponent(edge.data.target.replace(/^entity:/, ''));
      adjacency.get(sourceKey).add(targetKey);
      adjacency.get(targetKey).add(sourceKey);
    });

    const seen = new Set();
    const components = [];

    retainedEntityKeys.forEach((entityKey) => {
      const neighbors = adjacency.get(entityKey);
      if (!neighbors || !neighbors.size || seen.has(entityKey)) {
        return;
      }

      const queue = [entityKey];
      const component = [];
      seen.add(entityKey);

      while (queue.length) {
        const current = queue.shift();
        component.push(current);
        adjacency.get(current).forEach((next) => {
          if (seen.has(next)) {
            return;
          }
          seen.add(next);
          queue.push(next);
        });
      }

      components.push(component);
    });

    const articleMap = new Map((items || []).map((item) => [item.id, item]));
    const clueList = components
      .map((component) => {
        const entityKeySet = new Set(component);
        const evidenceArticles = (items || []).filter((item) => {
          const keys = articleEntityKeyMap.get(item.id) || [];
          return keys.some((key) => entityKeySet.has(key));
        });

        if (!evidenceArticles.length) {
          return null;
        }

        const categoryCounts = new Map();
        evidenceArticles.forEach((item) => {
          parseCategories(item.category).forEach((category) => {
            categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
          });
        });

        const dominantCategory = Array.from(categoryCounts.entries())
          .sort((a, b) => {
            if (a[1] === b[1]) return a[0].localeCompare(b[0], 'zh-Hans-CN');
            return b[1] - a[1];
          })
          .map((entry) => entry[0])[0] || '多主题';

        const coreEntities = component
          .slice()
          .sort((a, b) => {
            const docDelta = (entityDocCount.get(b) || 0) - (entityDocCount.get(a) || 0);
            if (docDelta !== 0) return docDelta;
            return (entityScoreSum.get(b) || 0) - (entityScoreSum.get(a) || 0);
          })
          .slice(0, 3)
          .map((key) => entityNameMap.get(key) || key);

        const evidenceIds = evidenceArticles
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 5)
          .map((item) => item.id);

        const focusNodeIds = new Set();
        const focusEdgeIds = new Set();

        component.forEach((key) => {
          const entityNodeId = entityNodeIds.get(key);
          if (entityNodeId) {
            focusNodeIds.add(entityNodeId);
          }
        });

        evidenceIds.forEach((itemId) => {
          const item = articleMap.get(itemId);
          if (!item) return;
          const articleNodeId = `article:${item.id}`;
          focusNodeIds.add(articleNodeId);
          focusEdgeIds.add(`edge:${articleNodeId}->${sourceNodeIds.get(item.source)}`);
          focusNodeIds.add(sourceNodeIds.get(item.source));
          parseCategories(item.category).forEach((category) => {
            const categoryNodeId = categoryNodeIds.get(category);
            if (!categoryNodeId) return;
            focusNodeIds.add(categoryNodeId);
            focusEdgeIds.add(`edge:${articleNodeId}->${categoryNodeId}`);
          });
          (articleEntityKeyMap.get(item.id) || []).forEach((entityKey) => {
            if (!entityKeySet.has(entityKey)) return;
            const entityNodeId = entityNodeIds.get(entityKey);
            if (!entityNodeId) return;
            focusNodeIds.add(entityNodeId);
            focusEdgeIds.add(`edge:${articleNodeId}->${entityNodeId}`);
          });
        });

        entityEdges.forEach((edge) => {
          const sourceKey = decodeURIComponent(edge.data.source.replace(/^entity:/, ''));
          const targetKey = decodeURIComponent(edge.data.target.replace(/^entity:/, ''));
          if (entityKeySet.has(sourceKey) && entityKeySet.has(targetKey)) {
            focusEdgeIds.add(edge.data.id);
          }
        });

        const score = component.reduce((sum, key) => sum + (entityDocCount.get(key) || 0), 0) + evidenceArticles.length * 2;

        return {
          id: `clue:${component[0]}`,
          score,
          title: coreEntities.join(' / '),
          summary: `在 ${rangeLabel} 内，${coreEntities.join('、')} 在 ${dominantCategory} 相关报道中反复共现，构成一条可解释的观察线索。`,
          dominantCategory,
          coreEntities,
          evidenceIds,
          focusNodeIds: Array.from(focusNodeIds),
          focusEdgeIds: Array.from(focusEdgeIds)
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxClues);

    return {
      nodes,
      edges,
      clues: clueList
    };
  }

  global.AnalysisUtils = {
    FIXED_CATEGORIES,
    escapeHtml,
    parseCategories,
    normalizeText,
    normalizeForComparison,
    tokenizeSearchText,
    tokenizeAnalysisText,
    buildQueryProfile,
    rankSearchResults,
    buildRelatedResults,
    highlightText,
    extractSnippet,
    filterItems,
    formatDateRangeLabel,
    buildWordCloudStats,
    buildClueGraph,
    buildDetailLink
  };
})(window);
