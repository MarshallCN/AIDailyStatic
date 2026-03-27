(function (global) {
  const ENTITY_TYPES = [
    'company',
    'organization',
    'person',
    'model',
    'product',
    'paper',
    'tool',
    'hardware',
    'benchmark',
    'policy',
    'topic'
  ];

  const EVENT_TYPES = [
    'launch',
    'research',
    'benchmark',
    'partnership',
    'funding',
    'acquisition',
    'open_source',
    'policy',
    'security',
    'infra',
    'trend'
  ];

  const EN_STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'by', 'for', 'from', 'has',
    'have', 'if', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'the', 'their', 'this',
    'that', 'these', 'those', 'to', 'via', 'was', 'were', 'with'
  ]);

  const ZH_STOP_WORDS = new Set([
    '这个', '这次', '这些', '一种', '一个', '一些', '以及', '继续', '正在', '已经',
    '相关', '更多', '其中', '通过', '同时', '可能', '需要', '系统', '平台', '产品', '模型'
  ]);

  const NOISE_WORDS = new Set([
    'ai', 'llm', 'llms', 'api', 'apis', 'app', 'apps', 'agent', 'agents', 'service', 'services',
    'system', 'systems', 'product', 'products', 'platform', 'platforms', 'news', 'update', 'updates',
    'today', 'company', 'companies', 'industry', '行业', '新闻', '系统', '平台', '产品', '模型'
  ]);

  const ENTITY_HINTS = {
    company: ['openai', 'anthropic', 'meta', 'microsoft', 'google', 'nvidia', 'apple', 'amazon', 'mistral', 'cohere', 'bytedance', 'shield ai', 'conntour', 'hugging face', 'techcrunch'],
    organization: ['university', 'institute', 'foundation', 'committee', 'senate', 'government', 'lab', 'labs', 'research', '协会', '委员会', '研究院'],
    model: ['gpt', 'claude', 'gemini', 'llama', 'qwen', 'deepseek', 'seedance', 'voxtral', 'transcribe', 'hivemind', 'model'],
    product: ['whatsapp', 'capcut', 'chatgpt', 'copilot', 'assistant', 'dreamina', 'north'],
    tool: ['sdk', 'framework', 'tool', 'tools', 'engine', 'stack', 'vault', 'workflow', 'litellm'],
    hardware: ['gpu', 'gpus', 'h100', 'b200', 'rtx', 'tpu', 'accelerator', 'chip', 'data center', 'datacenter'],
    benchmark: ['benchmark', 'leaderboard', 'arena', 'score', 'eval'],
    policy: ['policy', 'regulation', 'bill', 'act', 'soc2', 'iso', 'compliance', 'security policy']
  };

  const EVENT_PATTERNS = {
    funding: [/\b(raise|raises|raised|funding|valuation|series\s+[a-z])\b/i, /融资|估值|募资/],
    acquisition: [/\b(acquire|acquires|acquired|buying|purchase)\b/i, /收购|并购/],
    partnership: [/\b(partner|partners|partnership|collaboration|integrates?)\b/i, /合作|集成|联手/],
    open_source: [/\b(open source|open-source|open weights)\b/i, /开源/],
    research: [/\b(arxiv|paper|research|study|benchmarking?)\b/i, /论文|研究/],
    benchmark: [/\b(benchmark|leaderboard|score|ranked?)\b/i, /基准|排行|评测/],
    policy: [/\b(policy|regulation|government|senator|compliance|audit)\b/i, /政策|法案|监管|审计/],
    security: [/\b(security|malware|breach|outage|risk|vulnerability)\b/i, /安全|恶意软件|漏洞|风险/],
    infra: [/\b(gpu|training|inference|latency|throughput|data center|datacenter|infrastructure)\b/i, /基础设施|推理|训练|数据中心/],
    trend: [/\b(trend|analysis|insight|cracks down|shift)\b/i, /观察|趋势|洞察|收紧/],
    launch: [/\b(release|releases|released|launch|launches|launched|comes to|introduces?)\b/i, /发布|推出|上线|进入/]
  };

  function normalizeText(value) {
    if (global.AnalysisUtils && typeof global.AnalysisUtils.normalizeText === 'function') {
      return global.AnalysisUtils.normalizeText(value);
    }
    return String(value || '')
      .normalize('NFKC')
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .trim();
  }

  function normalizeCompare(value) {
    if (global.AnalysisUtils && typeof global.AnalysisUtils.normalizeForComparison === 'function') {
      return global.AnalysisUtils.normalizeForComparison(value);
    }
    return normalizeText(value).toLowerCase().replace(/\s+/g, ' ');
  }

  function dedupe(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function uniqueBy(values, mapper) {
    const result = [];
    const seen = new Set();
    (values || []).forEach(function (value) {
      const key = mapper(value);
      if (!key || seen.has(key)) return;
      seen.add(key);
      result.push(value);
    });
    return result;
  }

  function trimToken(token) {
    return String(token || '')
      .replace(/^[^0-9A-Za-z\u4e00-\u9fff.+-]+/, '')
      .replace(/[^0-9A-Za-z\u4e00-\u9fff.+-]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function slugify(value) {
    return normalizeText(value)
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'item';
  }

  function stableHash(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16);
  }

  function isChineseToken(token) {
    return /[\u4e00-\u9fff]/.test(token);
  }

  function shouldKeepToken(token) {
    const lower = normalizeCompare(token);
    if (!lower || NOISE_WORDS.has(lower)) return false;
    if (isChineseToken(token)) {
      return token.length >= 2 && token.length <= 8 && !ZH_STOP_WORDS.has(token);
    }
    return token.length >= 2 && !EN_STOP_WORDS.has(lower);
  }

  function collectEntityCandidates(text) {
    const source = normalizeText(text);
    const candidates = [];
    const seen = new Set();
    const patterns = [
      /\b[A-Z][A-Za-z0-9.+-]*(?:\s+[A-Z][A-Za-z0-9.+-]*){0,3}\b/g,
      /\b(?:GPT-?\d+(?:\.\d+)?|Claude(?:\s+\w+)?|Gemini(?:\s+\w+)?|Llama(?:\s*\d+(?:\.\d+)?)?|Qwen(?:\s*\d+(?:\.\d+)?)?|DeepSeek(?:\s+\w+)?|Mistral(?:\s+\w+)?|Voxtral(?:\s+\w+)?|Seedance(?:\s+\w+)?|Hivemind|LiteLLM|CapCut|WhatsApp|Wikipedia|TechCrunch|OpenAI|Anthropic|NVIDIA|Meta|Microsoft|Cohere|Shield AI|Conntour)\b/g,
      /[\u4e00-\u9fff]{2,8}/g
    ];

    patterns.forEach(function (pattern) {
      const matches = source.match(pattern) || [];
      matches.forEach(function (match) {
        const cleaned = trimToken(match);
        const key = normalizeCompare(cleaned);
        if (!shouldKeepToken(cleaned) || seen.has(key)) return;
        seen.add(key);
        candidates.push(cleaned);
      });
    });

    return candidates;
  }

  function inferEntityType(name, item) {
    const lower = normalizeCompare(name);
    const categories = Array.isArray(item.category)
      ? item.category
      : (global.AnalysisUtils ? global.AnalysisUtils.parseCategories(item.category) : String(item.category || '').split(','));

    if (categories.indexOf('论文') !== -1 && lower === normalizeCompare(item.title)) return 'paper';
    if (ENTITY_HINTS.model.some(function (hint) { return lower.indexOf(hint) !== -1; })) return /tool|stack|framework|engine|vault|litellm/.test(lower) ? 'tool' : 'model';
    if (ENTITY_HINTS.hardware.some(function (hint) { return lower.indexOf(hint) !== -1; })) return 'hardware';
    if (ENTITY_HINTS.benchmark.some(function (hint) { return lower.indexOf(hint) !== -1; })) return 'benchmark';
    if (ENTITY_HINTS.policy.some(function (hint) { return lower.indexOf(hint) !== -1; })) return 'policy';
    if (ENTITY_HINTS.product.some(function (hint) { return lower.indexOf(hint) !== -1; })) return 'product';
    if (ENTITY_HINTS.tool.some(function (hint) { return lower.indexOf(hint) !== -1; })) return 'tool';
    if (ENTITY_HINTS.company.some(function (hint) { return lower.indexOf(hint) !== -1; })) return 'company';
    if (ENTITY_HINTS.organization.some(function (hint) { return lower.indexOf(hint) !== -1; })) return 'organization';
    if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(name)) return 'person';
    if (categories.indexOf('论文') !== -1 && name.length > 24) return 'paper';
    return isChineseToken(name) ? 'topic' : 'organization';
  }

  function extractMetrics(item) {
    const text = [item.title, item.summary, item.detail].join(' ');
    const results = [];
    const patterns = [
      { name: 'money', pattern: /(?:\$|US\$)?\d+(?:\.\d+)?\s?(?:billion|million|bn|B|M|亿美元|万美金|亿|万)/ig },
      { name: 'latency', pattern: /\d+(?:\.\d+)?\s?(?:ms|秒|s)\b/ig },
      { name: 'ratio', pattern: /\d+(?:\.\d+)?\s?(?:x|倍)\b/ig },
      { name: 'percentage', pattern: /\d+(?:\.\d+)?\s?%/ig },
      { name: 'count', pattern: /\d+(?:\.\d+)?\s?(?:languages|种语言|路|条|个|轮)/ig }
    ];

    patterns.forEach(function (entry) {
      const matches = text.match(entry.pattern) || [];
      matches.forEach(function (match) {
        results.push({ name: entry.name, value: trimToken(match) });
      });
    });

    return uniqueBy(results, function (metric) {
      return metric.name + ':' + metric.value;
    }).slice(0, 6);
  }

  function inferEventTypes(item) {
    const categories = global.AnalysisUtils
      ? global.AnalysisUtils.parseCategories(item.category)
      : String(item.category || '').split(',');
    const text = normalizeText([item.title, item.summary, item.detail].join(' '));
    const scores = new Map();

    Object.keys(EVENT_PATTERNS).forEach(function (eventType) {
      EVENT_PATTERNS[eventType].forEach(function (pattern) {
        if (pattern.test(text)) scores.set(eventType, (scores.get(eventType) || 0) + 1);
      });
    });

    if (categories.indexOf('论文') !== -1) scores.set('research', (scores.get('research') || 0) + 2);
    if (categories.indexOf('基础设施') !== -1) scores.set('infra', (scores.get('infra') || 0) + 2);
    if (categories.indexOf('开源') !== -1) scores.set('open_source', (scores.get('open_source') || 0) + 2);
    if (categories.indexOf('安全') !== -1) scores.set('security', (scores.get('security') || 0) + 2);
    if (categories.indexOf('观察') !== -1) scores.set('trend', (scores.get('trend') || 0) + 2);
    if (categories.indexOf('生态') !== -1) scores.set('partnership', (scores.get('partnership') || 0) + 1);
    if (categories.indexOf('应用/产业') !== -1) scores.set('launch', (scores.get('launch') || 0) + 1);

    const ranked = Array.from(scores.entries()).sort(function (a, b) {
      if (a[1] === b[1]) return a[0].localeCompare(b[0]);
      return b[1] - a[1];
    }).map(function (entry) { return entry[0]; });
    return ranked.length ? ranked.slice(0, 2) : ['launch'];
  }

  function buildWhyItMatters(item, eventTypes, entities) {
    if (item.summary) return item.summary;
    const lead = entities[0] ? entities[0].name : item.source || '该信号';
    const eventType = eventTypes[0] || 'launch';
    const templates = {
      funding: lead + ' 相关融资/估值信号说明资本仍在集中押注该方向。',
      acquisition: lead + ' 的并购动作意味着产业链整合还在继续。',
      partnership: lead + ' 的合作信号说明生态互联仍是落地重点。',
      open_source: lead + ' 的开源动作会继续放大生态扩散速度。',
      research: lead + ' 相关研究结果值得继续跟踪其工程化落地。',
      benchmark: lead + ' 的基准变化反映能力或评测标准正在移动。',
      policy: lead + ' 的政策与合规变化会直接影响后续部署节奏。',
      security: lead + ' 的安全风险提示该方向仍有治理压力。',
      infra: lead + ' 的基础设施信号会影响后续成本与性能拐点。',
      trend: lead + ' 的连续出现说明它已经形成值得跟踪的趋势线索。',
      launch: lead + ' 的发布/上线信号说明产品化推进仍在加速。'
    };
    return templates[eventType] || templates.launch;
  }

  function buildRuleSignalRecord(item) {
    const scoreMap = new Map();
    const titleSummary = normalizeText([item.title, item.summary].join(' '));
    const body = normalizeText(item.detail || '');

    function addEntity(name, weight) {
      const cleaned = trimToken(name);
      const key = normalizeCompare(cleaned);
      if (!cleaned || !shouldKeepToken(cleaned) || NOISE_WORDS.has(key)) return;
      const current = scoreMap.get(key) || {
        name: cleaned,
        score: 0,
        aliases: new Set([cleaned]),
        evidence: new Set()
      };
      current.score += weight;
      current.aliases.add(cleaned);
      current.evidence.add(cleaned);
      scoreMap.set(key, current);
    }

    collectEntityCandidates(titleSummary).forEach(function (candidate) { addEntity(candidate, 3.2); });
    collectEntityCandidates(body).slice(0, 24).forEach(function (candidate) { addEntity(candidate, 1.1); });

    const categories = global.AnalysisUtils
      ? global.AnalysisUtils.parseCategories(item.category)
      : String(item.category || '').split(',');
    if (categories.indexOf('论文') !== -1) addEntity(item.title, 4.5);

    const entities = Array.from(scoreMap.values())
      .sort(function (a, b) {
        if (a.score === b.score) return a.name.localeCompare(b.name, 'zh-Hans-CN');
        return b.score - a.score;
      })
      .slice(0, 8)
      .map(function (entry) {
        const type = inferEntityType(entry.name, item);
        return {
          entity_id: 'entity:' + slugify(type + '-' + entry.name),
          name: entry.name,
          canonical_name: entry.name,
          type: ENTITY_TYPES.indexOf(type) === -1 ? 'topic' : type,
          aliases: Array.from(entry.aliases),
          confidence: Math.min(0.96, 0.42 + entry.score * 0.08),
          evidence: Array.from(entry.evidence).slice(0, 3),
          provenance: 'rule'
        };
      });

    const eventTypes = inferEventTypes(item);
    const primaryEntity = entities[0];
    const events = eventTypes.map(function (eventType) {
      const seed = primaryEntity ? primaryEntity.entity_id : item.article_id;
      return {
        event_id: 'event:' + slugify(eventType + '-' + seed),
        event_type: eventType,
        label: item.title,
        summary: item.summary || item.title,
        participants: entities.slice(0, 4).map(function (entity, entityIndex) {
          return {
            entity_id: entity.entity_id,
            name: entity.name,
            type: entity.type,
            role: entityIndex === 0 ? 'subject' : 'participant'
          };
        }),
        evidence: [item.summary || item.title]
      };
    });

    const relations = [];
    if (entities.length >= 2 && events.length) {
      const mainEventType = events[0].event_type;
      for (let i = 1; i < Math.min(4, entities.length); i += 1) {
        relations.push({
          relation_id: 'relation:' + stableHash(item.article_id + ':' + entities[0].entity_id + ':' + entities[i].entity_id + ':' + mainEventType),
          source_entity_id: entities[0].entity_id,
          target_entity_id: entities[i].entity_id,
          source_name: entities[0].name,
          target_name: entities[i].name,
          relation_type: mainEventType,
          weight: 1,
          evidence: [item.summary || item.title]
        });
      }
    }

    return {
      article_id: item.id || item.article_id,
      title: item.title,
      source: item.source,
      date: item.date,
      category: categories,
      url: item.url,
      summary: item.summary,
      why_it_matters: buildWhyItMatters(item, eventTypes, entities),
      entities: entities,
      events: events,
      relations: relations,
      metrics: extractMetrics(item),
      fallback: {
        used_rule_fallback: true,
        rule_entities: entities.map(function (entity) { return entity.name; }),
        rule_event_types: eventTypes.slice(0)
      }
    };
  }

  function normalizeType(value, allowed, fallback) {
    const candidate = normalizeCompare(value).replace(/\s+/g, '_');
    return allowed.indexOf(candidate) !== -1 ? candidate : fallback;
  }

  function buildEntityLookup(entities) {
    const map = new Map();
    (entities || []).forEach(function (entity) {
      map.set(entity.entity_id, entity);
      map.set(normalizeCompare(entity.name), entity);
      (entity.aliases || []).forEach(function (alias) {
        map.set(normalizeCompare(alias), entity);
      });
    });
    return map;
  }

  function mergeSignalRecordWithLlm(ruleRecord, llmArticle) {
    if (!llmArticle || typeof llmArticle !== 'object') return ruleRecord;
    const merged = JSON.parse(JSON.stringify(ruleRecord));
    const entityLookup = buildEntityLookup(merged.entities);

    function upsertEntity(rawEntity) {
      const name = trimToken(rawEntity && rawEntity.name);
      if (!name) return null;
      const type = normalizeType(rawEntity.type || inferEntityType(name, ruleRecord), ENTITY_TYPES, 'topic');
      const key = type + ':' + normalizeCompare(name);
      let entity = entityLookup.get(key);
      if (!entity) {
        entity = {
          entity_id: rawEntity.entity_id || ('entity:' + slugify(type + '-' + name)),
          name: name,
          canonical_name: rawEntity.canonical_name || name,
          type: type,
          aliases: [],
          confidence: 0.76,
          evidence: [],
          provenance: 'llm'
        };
      }
      entity.aliases = dedupe((entity.aliases || []).concat(rawEntity.aliases || []).concat([name]));
      entity.evidence = dedupe((entity.evidence || []).concat(rawEntity.evidence || []));
      entity.confidence = Math.max(Number(entity.confidence || 0), Number(rawEntity.confidence || 0.8));
      entity.provenance = entity.provenance === 'rule' ? 'merged' : entity.provenance;
      entityLookup.set(key, entity);
      entityLookup.set(normalizeCompare(name), entity);
      entity.aliases.forEach(function (alias) {
        entityLookup.set(normalizeCompare(alias), entity);
      });
      return entity;
    }

    (llmArticle.entities || []).forEach(upsertEntity);
    merged.entities = uniqueBy(Array.from(entityLookup.values()).filter(function (entry) {
      return entry && entry.entity_id;
    }), function (entry) {
      return entry.type + ':' + normalizeCompare(entry.name);
    });

    const lookup = buildEntityLookup(merged.entities);
    const events = (llmArticle.events || []).map(function (event, index) {
      const eventType = normalizeType(event.type || event.event_type, EVENT_TYPES, 'launch');
      const participants = (event.participants || []).map(function (participant) {
        const entity = lookup.get(normalizeCompare(participant.name)) || upsertEntity(participant);
        if (!entity) return null;
        return {
          entity_id: entity.entity_id,
          name: entity.name,
          type: entity.type,
          role: participant.role || 'participant'
        };
      }).filter(Boolean);
      return {
        event_id: event.event_id || ('event:' + slugify(eventType + '-' + (participants[0] ? participants[0].entity_id : merged.article_id) + '-' + index)),
        event_type: eventType,
        label: trimToken(event.label) || merged.title,
        summary: trimToken(event.summary) || merged.summary || merged.title,
        participants: participants.length ? participants : merged.entities.slice(0, 3).map(function (entity, entityIndex) {
          return {
            entity_id: entity.entity_id,
            name: entity.name,
            type: entity.type,
            role: entityIndex === 0 ? 'subject' : 'participant'
          };
        }),
        evidence: dedupe(event.evidence || [])
      };
    });

    const relations = (llmArticle.relations || []).map(function (relation, index) {
      const sourceEntity = lookup.get(normalizeCompare(relation.source || relation.source_name));
      const targetEntity = lookup.get(normalizeCompare(relation.target || relation.target_name));
      if (!sourceEntity || !targetEntity) return null;
      return {
        relation_id: relation.relation_id || ('relation:' + stableHash(merged.article_id + ':' + sourceEntity.entity_id + ':' + targetEntity.entity_id + ':' + index)),
        source_entity_id: sourceEntity.entity_id,
        target_entity_id: targetEntity.entity_id,
        source_name: sourceEntity.name,
        target_name: targetEntity.name,
        relation_type: normalizeType(relation.type || relation.relation_type, EVENT_TYPES, 'trend'),
        weight: Number(relation.weight || 1),
        evidence: dedupe(relation.evidence || [])
      };
    }).filter(Boolean);

    if (events.length) merged.events = events;
    if (relations.length) merged.relations = relations;
    merged.metrics = uniqueBy((merged.metrics || []).concat(llmArticle.metrics || []), function (metric) {
      return (metric.name || '') + ':' + (metric.value || '');
    });
    merged.why_it_matters = trimToken(llmArticle.why_it_matters) || merged.why_it_matters;
    merged.fallback.used_rule_fallback = !(llmArticle.entities && llmArticle.entities.length);
    return merged;
  }

  function buildSignalRecordsFromItems(items, llmPayload) {
    const llmLookup = new Map();
    if (llmPayload && Array.isArray(llmPayload.articles)) {
      llmPayload.articles.forEach(function (article) {
        if (article.article_id) llmLookup.set(article.article_id, article);
      });
    }
    return (items || []).map(function (item) {
      const base = buildRuleSignalRecord(item);
      return mergeSignalRecordWithLlm(base, llmLookup.get(base.article_id));
    });
  }

  function ensureNode(nodeMap, nodes, id, data) {
    if (nodeMap.has(id)) {
      const existing = nodeMap.get(id);
      existing.articleIds = dedupe((existing.articleIds || []).concat(data.articleIds || []));
      if (!existing.summary && data.summary) existing.summary = data.summary;
      if (!existing.subtype && data.subtype) existing.subtype = data.subtype;
      if (data.aliases && data.aliases.length) existing.aliases = dedupe((existing.aliases || []).concat(data.aliases));
      if (data.metrics && data.metrics.length) {
        existing.metrics = uniqueBy((existing.metrics || []).concat(data.metrics), function (metric) {
          return metric.name + ':' + metric.value;
        });
      }
      existing.weight = Math.max(Number(existing.weight || 1), Number(data.weight || 1));
      return existing;
    }
    const node = Object.assign({ id: id, articleIds: [] }, data);
    node.articleIds = dedupe(node.articleIds);
    nodes.push({ data: node });
    nodeMap.set(id, node);
    return node;
  }

  function ensureEdge(edgeMap, edges, id, data) {
    if (edgeMap.has(id)) {
      const existing = edgeMap.get(id);
      existing.weight = Number(existing.weight || 1) + Number(data.weight || 1);
      existing.articleIds = dedupe((existing.articleIds || []).concat(data.articleIds || []));
      return existing;
    }
    const edge = Object.assign({ id: id, weight: 1, articleIds: [] }, data);
    edge.articleIds = dedupe(edge.articleIds);
    edges.push({ data: edge });
    edgeMap.set(id, edge);
    return edge;
  }

  function buildProjection(records) {
    const adjacency = new Map();
    const nodeMeta = new Map();
    function touchNode(id, meta) {
      const current = nodeMeta.get(id) || { id: id, label: meta.label, type: meta.type, articleIds: new Set(), weight: 0 };
      current.weight += Number(meta.weight || 1);
      (meta.articleIds || []).forEach(function (articleId) { current.articleIds.add(articleId); });
      nodeMeta.set(id, current);
      if (!adjacency.has(id)) adjacency.set(id, new Map());
    }
    function addWeight(left, right, weight) {
      if (!left || !right || left === right) return;
      const leftMap = adjacency.get(left) || new Map();
      const rightMap = adjacency.get(right) || new Map();
      leftMap.set(right, (leftMap.get(right) || 0) + weight);
      rightMap.set(left, (rightMap.get(left) || 0) + weight);
      adjacency.set(left, leftMap);
      adjacency.set(right, rightMap);
    }

    (records || []).forEach(function (record) {
      const communityNodes = [];
      (record.entities || []).forEach(function (entity) {
        touchNode(entity.entity_id, { label: entity.name, type: 'entity', articleIds: [record.article_id], weight: entity.confidence || 1 });
        communityNodes.push(entity.entity_id);
      });
      (record.events || []).forEach(function (event) {
        touchNode(event.event_id, { label: event.label, type: 'event', articleIds: [record.article_id], weight: 1.6 });
        communityNodes.push(event.event_id);
        (event.participants || []).forEach(function (participant) {
          touchNode(participant.entity_id, { label: participant.name, type: 'entity', articleIds: [record.article_id], weight: 1 });
          addWeight(event.event_id, participant.entity_id, 3.4);
        });
      });
      (record.relations || []).forEach(function (relation) {
        touchNode(relation.source_entity_id, { label: relation.source_name, type: 'entity', articleIds: [record.article_id], weight: 1 });
        touchNode(relation.target_entity_id, { label: relation.target_name, type: 'entity', articleIds: [record.article_id], weight: 1 });
        addWeight(relation.source_entity_id, relation.target_entity_id, 4 + Number(relation.weight || 1));
      });
      const uniqueNodes = dedupe(communityNodes);
      for (let i = 0; i < uniqueNodes.length; i += 1) {
        for (let j = i + 1; j < uniqueNodes.length; j += 1) {
          addWeight(uniqueNodes[i], uniqueNodes[j], 0.9);
        }
      }
    });
    return { adjacency: adjacency, nodeMeta: nodeMeta };
  }

  function detectCommunities(records) {
    const projection = buildProjection(records);
    const nodeIds = Array.from(projection.nodeMeta.keys()).sort(function (a, b) {
      const left = projection.nodeMeta.get(a);
      const right = projection.nodeMeta.get(b);
      if (left.weight === right.weight) return left.label.localeCompare(right.label, 'zh-Hans-CN');
      return right.weight - left.weight;
    });
    const labels = new Map(nodeIds.map(function (id) { return [id, id]; }));
    for (let iteration = 0; iteration < 8; iteration += 1) {
      let changed = false;
      nodeIds.forEach(function (nodeId) {
        const neighborMap = projection.adjacency.get(nodeId);
        if (!neighborMap || !neighborMap.size) return;
        const labelScores = new Map();
        neighborMap.forEach(function (weight, neighborId) {
          const label = labels.get(neighborId) || neighborId;
          labelScores.set(label, (labelScores.get(label) || 0) + weight);
        });
        const ranked = Array.from(labelScores.entries()).sort(function (a, b) {
          if (a[1] === b[1]) return String(a[0]).localeCompare(String(b[0]));
          return b[1] - a[1];
        });
        const nextLabel = ranked[0] ? ranked[0][0] : labels.get(nodeId);
        if (nextLabel && labels.get(nodeId) !== nextLabel) {
          labels.set(nodeId, nextLabel);
          changed = true;
        }
      });
      if (!changed) break;
    }
    const groups = new Map();
    labels.forEach(function (label, nodeId) {
      const list = groups.get(label) || [];
      list.push(nodeId);
      groups.set(label, list);
    });
    return Array.from(groups.values()).map(function (group) {
      return group.sort();
    }).filter(function (group) {
      return group.length >= 2;
    }).sort(function (a, b) {
      return b.length - a.length;
    });
  }

  function buildKnowledgeGraphFromRecords(records, options) {
    const settings = Object.assign({ rangeLabel: '全部时间', maxClues: 6 }, options || {});
    const nodeMap = new Map();
    const edgeMap = new Map();
    const nodes = [];
    const edges = [];
    const recordMap = new Map((records || []).map(function (record) { return [record.article_id, record]; }));

    (records || []).forEach(function (record) {
      const articleNode = ensureNode(nodeMap, nodes, 'article:' + record.article_id, {
        label: record.title,
        type: 'article',
        summary: record.summary,
        articleIds: [record.article_id],
        subtype: record.category && record.category[0] ? record.category[0] : '',
        weight: 1
      });
      const sourceNode = ensureNode(nodeMap, nodes, 'source:' + slugify(record.source), {
        label: record.source,
        type: 'source',
        articleIds: [record.article_id],
        weight: 1
      });
      ensureEdge(edgeMap, edges, 'edge:' + articleNode.id + '->' + sourceNode.id, {
        source: articleNode.id,
        target: sourceNode.id,
        type: 'article-source',
        label: 'source',
        weight: 1,
        articleIds: [record.article_id]
      });
      (record.category || []).forEach(function (category) {
        const categoryNode = ensureNode(nodeMap, nodes, 'category:' + slugify(category), {
          label: category,
          type: 'category',
          articleIds: [record.article_id],
          weight: 1
        });
        ensureEdge(edgeMap, edges, 'edge:' + articleNode.id + '->' + categoryNode.id, {
          source: articleNode.id,
          target: categoryNode.id,
          type: 'article-category',
          label: category,
          weight: 1,
          articleIds: [record.article_id]
        });
      });
      (record.entities || []).forEach(function (entity) {
        const entityNode = ensureNode(nodeMap, nodes, entity.entity_id, {
          label: entity.name,
          type: 'entity',
          subtype: entity.type,
          summary: record.why_it_matters,
          articleIds: [record.article_id],
          aliases: entity.aliases || [],
          weight: entity.confidence || 1
        });
        ensureEdge(edgeMap, edges, 'edge:' + articleNode.id + '->' + entityNode.id, {
          source: articleNode.id,
          target: entityNode.id,
          type: 'article-entity',
          label: entity.type,
          weight: entity.confidence || 1,
          articleIds: [record.article_id]
        });
      });
      (record.events || []).forEach(function (event) {
        const eventNode = ensureNode(nodeMap, nodes, event.event_id, {
          label: event.label,
          type: 'event',
          subtype: event.event_type,
          summary: event.summary,
          articleIds: [record.article_id],
          weight: 1.4
        });
        ensureEdge(edgeMap, edges, 'edge:' + articleNode.id + '->' + eventNode.id, {
          source: articleNode.id,
          target: eventNode.id,
          type: 'article-event',
          label: event.event_type,
          weight: 1.2,
          articleIds: [record.article_id]
        });
        (event.participants || []).forEach(function (participant) {
          const entityNode = ensureNode(nodeMap, nodes, participant.entity_id, {
            label: participant.name,
            type: 'entity',
            subtype: participant.type,
            articleIds: [record.article_id],
            weight: 1
          });
          ensureEdge(edgeMap, edges, 'edge:' + eventNode.id + '->' + entityNode.id, {
            source: eventNode.id,
            target: entityNode.id,
            type: 'event-entity',
            label: participant.role || 'participant',
            weight: 2,
            articleIds: [record.article_id]
          });
        });
      });
      (record.relations || []).forEach(function (relation) {
        ensureEdge(edgeMap, edges, 'edge:' + relation.source_entity_id + '->' + relation.target_entity_id + ':' + relation.relation_type, {
          source: relation.source_entity_id,
          target: relation.target_entity_id,
          type: 'explicit-relation',
          label: relation.relation_type,
          weight: 2 + Number(relation.weight || 1),
          articleIds: [record.article_id]
        });
      });
    });

    const communities = detectCommunities(records);
    const clues = communities.map(function (community) {
      const communitySet = new Set(community);
      const evidenceRecords = (records || []).filter(function (record) {
        const touched = [];
        (record.entities || []).forEach(function (entity) { touched.push(entity.entity_id); });
        (record.events || []).forEach(function (event) { touched.push(event.event_id); });
        return touched.some(function (nodeId) { return communitySet.has(nodeId); });
      }).sort(function (a, b) {
        return b.date.localeCompare(a.date);
      });
      if (evidenceRecords.length < 2) return null;

      const categoryCounts = new Map();
      const eventTypeCounts = new Map();
      const coreNodes = community.map(function (nodeId) {
        const node = nodeMap.get(nodeId);
        return node ? { id: nodeId, label: node.label, type: node.type, subtype: node.subtype, weight: node.weight || 1 } : null;
      }).filter(Boolean).sort(function (a, b) {
        if (a.weight === b.weight) return a.label.localeCompare(b.label, 'zh-Hans-CN');
        return b.weight - a.weight;
      });
      const titleNodes = coreNodes.filter(function (node) {
        return node.type === 'entity';
      }).slice(0, 4);
      const resolvedTitleNodes = titleNodes.length ? titleNodes : coreNodes.filter(function (node) {
        return node.type === 'event';
      }).slice(0, 3);
      const coreLabels = resolvedTitleNodes.map(function (node) {
        return node.type === 'event' && node.subtype ? node.subtype : node.label;
      });

      evidenceRecords.forEach(function (record) {
        (record.category || []).forEach(function (category) {
          categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
        });
        (record.events || []).forEach(function (event) {
          if (communitySet.has(event.event_id)) {
            eventTypeCounts.set(event.event_type, (eventTypeCounts.get(event.event_type) || 0) + 1);
          }
        });
      });

      const dominantCategory = Array.from(categoryCounts.entries()).sort(function (a, b) {
        if (a[1] === b[1]) return a[0].localeCompare(b[0], 'zh-Hans-CN');
        return b[1] - a[1];
      }).map(function (entry) { return entry[0]; })[0] || '多主题';

      const eventTypes = Array.from(eventTypeCounts.entries()).sort(function (a, b) {
        if (a[1] === b[1]) return a[0].localeCompare(b[0], 'zh-Hans-CN');
        return b[1] - a[1];
      }).map(function (entry) { return entry[0]; });

      const evidenceIds = evidenceRecords.slice(0, 6).map(function (record) { return record.article_id; });
      const focusNodeIds = new Set(community);
      const focusEdgeIds = new Set();
      evidenceIds.forEach(function (articleId) {
        const record = recordMap.get(articleId);
        if (!record) return;
        focusNodeIds.add('article:' + articleId);
        focusNodeIds.add('source:' + slugify(record.source));
        (record.category || []).forEach(function (category) {
          focusNodeIds.add('category:' + slugify(category));
        });
      });
      edges.forEach(function (edge) {
        const data = edge.data;
        if (focusNodeIds.has(data.source) && focusNodeIds.has(data.target)) {
          focusEdgeIds.add(data.id);
        }
      });

      const title = coreLabels.slice(0, 4).join(' / ');
      const signals = [];
      if (eventTypes[0]) signals.push(eventTypes[0] + ' 信号在该主题中最集中。');
      signals.push('证据新闻共 ' + evidenceRecords.length + ' 条，主导分类为 ' + dominantCategory + '。');

      return {
        id: 'clue:' + stableHash(title + ':' + evidenceIds.join(',')),
        title: title,
        summary: '在 ' + settings.rangeLabel + ' 内，' + (coreLabels.slice(0, 3).join('、') || dominantCategory) + ' 围绕重复出现的事件与实体关系形成稳定线索。',
        dominantCategory: dominantCategory,
        eventTypes: eventTypes,
        coreEntities: coreLabels.slice(0, 4),
        evidenceIds: evidenceIds,
        focusNodeIds: Array.from(focusNodeIds),
        focusEdgeIds: Array.from(focusEdgeIds),
        trendSignals: signals,
        score: evidenceRecords.length * 3 + coreNodes.length
      };
    }).filter(Boolean).sort(function (a, b) {
      return b.score - a.score;
    }).slice(0, settings.maxClues);

    return { nodes: nodes, edges: edges, clues: clues };
  }

  global.KGUtils = {
    ENTITY_TYPES: ENTITY_TYPES,
    EVENT_TYPES: EVENT_TYPES,
    buildKnowledgeGraphFromRecords: buildKnowledgeGraphFromRecords,
    buildSignalRecordsFromItems: buildSignalRecordsFromItems,
    buildRuleSignalRecord: buildRuleSignalRecord,
    buildDetailLinkFromArticleId: function (articleId, fromPath) {
      const params = new URLSearchParams({ id: articleId, from: fromPath || 'clues.html' });
      return 'detail.html?' + params.toString();
    }
  };
})(window);
