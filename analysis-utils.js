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
    'the', 'their', 'then', 'there', 'these', 'this', 'to', 'via', 'was', 'were', 'will', 'with',
    'about', 'after', 'also', 'but', 'can', 'could', 'do', 'does', 'how', 'just', 'may', 'more',
    'most', 'new', 'not', 'now', 'only', 'over', 'so', 'than', 'up', 'we', 'when', 'which', 'who',
    'would', 'you', 'your'
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
    '部分', '需要', '非常', '可能', '成为', '进入', '达到', '变成', '发现', '采用',
    '表示', '说明', '指出', '认为', '宣布', '发布', '报道', '据报', '这项', '当天',
    '全球', '某些', '真实', '长期', '影响', '进展', '执行', '检验', '开发', '测试',
    '任务', '机制', '商业', '竞争', '成本', '入口', '中心', '机器', '人工', '美元',
    '收购', '融资', '边界', '身份', '初创', '扩展', '环境', '动态', '前沿', '社区',
    '风险', '控制', '生成', '工具', '工程', '网络', '治理', '可靠性', '实验', '延伸到'
  ]);

  const CATEGORY_NOISE_WORDS = new Set([
    '应用', '产业', '应用产业', '应用/产业', 'ai应用', 'ai应用产业',
    '论文', 'paper', 'papers', 'arxiv',
    '基础设施', '基础', '设施', 'infra', 'infrastructure', 'ai基础设施', 'ai infra', 'aiinfra',
    '观察', '行业观察', 'insight', 'insights', 'trend', 'trends',
    '安全', 'ai安全', 'security',
    '生态', '硬件生态', 'ai硬件生态', 'ecosystem',
    '开源', 'opensource', 'open-source', 'open source',
    '行业', 'industry',
    '公司', 'ai公司', 'company', 'companies',
    '硬件', 'hardware', 'ai硬件',
    '人工智能', '生成式'
  ]);

  const SOURCE_NOISE_WORDS = new Set([
    'techcrunch', 'reuters', 'bloomberg', 'forbes', 'wired', 'verge', 'theverge',
    'bbc', 'cnn', 'nytimes', 'wsj', 'ft', 'axios', 'semafor', 'theinformation',
    'cyberscoop', 'techtimes', 'rcrwireless', 'rcr', 'daily', 'papers',
    '未知来源', '官方博客', 'blog'
  ]);

  const ANALYSIS_NOISE_WORDS = new Set([
    'ai', 'llm', 'llms', 'api', 'apis', 'app', 'apps', 'demo', 'agent', 'agents', 'assistant',
    'assistants', 'chat', 'model', 'models', 'news', 'service', 'services', 'system', 'systems',
    'workflow', 'workflows', 'today', 'update', 'updates', 'product', 'products', 'platform',
    'platforms', 'user', 'users', 'team', 'teams', 'report', 'reports', 'said', 'says',
    'according', 'reported', 'release', 'released', 'launch', 'launched', 'introduces',
    '产品', '体验', '功能', '问题', '工作', '市场', '部署', '表现', '路线', '过程',
    '方案', '消息', '行业', '需求', '模型', '智能', '平台', '服务', '新闻', '美元'
  ]);

  const ENTITY_NOISE_WORDS = new Set([
    'ai', 'llm', 'api', 'ga', 'uk', 'us', 'app', 'apps', 'chat', 'prime', 'token', 'tokens',
    '产品', '功能', '服务', '平台', '系统', '能力', '部署', '新闻', '行业', '公司', '模型',
    '智能', '工具', '训练', '测试', '开发', '发布', '收购', '美元', '人工', '英伟',
    'hugging', 'face', 'techcrunch'
  ]);

  const TECHNICAL_KEEP_WORDS = new Set([
    '推理', '训练', '算力', '芯片', '评测', '基准', '对齐', '幻觉', '漏洞', '智驾',
    '集群', '带宽', '延迟', '显卡', '加速器', '智能体', '数据中心', '自动驾驶',
    '机器人', '开源权重', '多模态', '机器人出租车',
    'gpu', 'gpus', 'tpu', 'h100', 'h200', 'b200', 'blackwell', 'cuda', 'nvlink',
    'robotaxi', 'spacex', 'openai', 'anthropic', 'nvidia', '英伟达', 'deepmind',
    'huggingface', 'hugging face', 'chatgpt', 'claude', 'gemini', 'llama', 'qwen',
    'deepseek', 'mistral', 'cohere', 'astra', 'cursor', 'fable', 'litellm'
  ]);

  const TERM_ALIASES = {
    'hugging face': 'Hugging Face',
    'huggingface': 'Hugging Face',
    'openai': 'OpenAI',
    'open ai': 'OpenAI',
    'anthropic': 'Anthropic',
    'nvidia': 'NVIDIA',
    '英伟达': 'NVIDIA',
    'google': 'Google',
    'meta': 'Meta',
    'microsoft': 'Microsoft',
    'deepmind': 'DeepMind',
    'chatgpt': 'ChatGPT',
    'claude': 'Claude',
    'gemini': 'Gemini',
    'llama': 'Llama',
    'qwen': 'Qwen',
    'deepseek': 'DeepSeek',
    'mistral': 'Mistral',
    'cohere': 'Cohere',
    'astra': 'Astra',
    'spacex': 'SpaceX',
    'robotaxi': 'Robotaxi',
    'blackwell': 'Blackwell',
    'cuda': 'CUDA',
    'cursor': 'Cursor',
    'fable': 'Fable',
    'litellm': 'LiteLLM',
    'amd': 'AMD',
    'instinct': 'Instinct',
    '字节跳动': '字节跳动',
    '阿里巴巴': '阿里巴巴',
    '腾讯': '腾讯',
    '百度': '百度',
    '华为': '华为',
    '商汤': '商汤',
    '智谱': '智谱',
    '月之暗面': '月之暗面',
    '科大讯飞': '科大讯飞',
    'waymo': 'Waymo',
    'uber': 'Uber',
    'stripe': 'Stripe',
    'apple': 'Apple',
    'amazon': 'Amazon',
    'tesla': 'Tesla',
    'ibm': 'IBM',
    'github': 'GitHub',
    'linux': 'Linux',
    'visa': 'Visa',
    'grok': 'Grok',
    'kimi': 'Kimi',
    'andreessen horowitz': 'Andreessen Horowitz',
    'a16z': 'Andreessen Horowitz'
  };

  const DISCOURSE_NOISE_WORDS = new Set([
    '而不是', '会不会', '不只是', '越来越', '能不能', '不仅是', '可能是',
    '而不能', '跟不上', '不再是', '不需要', '不透明', '是不是', '并不是',
    '并没有', '之所以', '进一步', '一方面', '另一方面', '不仅仅', '与其说',
    '上半年', '下半年', '下一代', '新一代', '现阶段', '一系列', '齐聚一堂',
    '前所未有', '吸引力', '独角兽', '研究者', '大规模', '反作用', '齐聚',
    'ceo', 'cto', 'cfo', 'coo', 'sec', 'token', 'tokens', 'inherent',
    'thinking', 'machines', 'street', 'spark', 'muse', 'docs', 'keep',
    'human', 'official', 'global', 'public', 'private', 'next', 'large',
    'alpha', 'beta', 'depth', 'bench', 'cli', 'pics', 'slides',
    '必要性', '出版商', '在一起', '稳定性', '通用性', '华尔街', '阿拉巴马州',
    '毫不在意', '第一人称', '合伙人', 'general', 'intuition', 'creation', 'evolution',
    'teens', 'kids', 'people', 'users', 'daily', 'papers', 'mobility', 'disrupt',
    'studio', 'banana', 'docs', 'keep', 'horizo'
  ]);

  const COMPOUND_PATTERNS = [
    { pattern: /hugging\s*face(?:\s+daily(?:\s+papers)?)?/ig, token: 'HuggingFace' },
    { pattern: /open\s*ai/ig, token: 'OpenAI' },
    { pattern: /英伟达/g, token: '英伟达' },
    { pattern: /基础设施/g, token: '基础设施' },
    { pattern: /人工智能/g, token: '人工智能' },
    { pattern: /智能体/g, token: '智能体' },
    { pattern: /数据中心/g, token: '数据中心' },
    { pattern: /开源权重/g, token: '开源权重' },
    { pattern: /大语言模型/g, token: '大语言模型' },
    { pattern: /自动驾驶/g, token: '自动驾驶' },
    { pattern: /机器人出租车/g, token: 'Robotaxi' },
    { pattern: /行业观察/g, token: '行业观察' },
    { pattern: /硬件生态/g, token: '硬件生态' },
    { pattern: /thinking\s+machines/ig, token: 'ThinkingMachines' },
    { pattern: /muse\s+spark/ig, token: 'MuseSpark' },
    { pattern: /jane\s+street/ig, token: 'JaneStreet' },
    { pattern: /jalape[ñn]o/ig, token: 'Jalapeno' }
  ];

  Object.assign(TERM_ALIASES, {
    thinkingmachines: 'Thinking Machines',
    'thinking machines': 'Thinking Machines',
    musespark: 'Muse Spark',
    'muse spark': 'Muse Spark',
    janestreet: 'Jane Street',
    'jane street': 'Jane Street',
    jalapeno: 'Jalapeño',
    jalape: 'Jalapeño',
    'jalapeño': 'Jalapeño'
  });

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

  function protectCompounds(text) {
    let source = normalizeText(text);
    COMPOUND_PATTERNS.forEach((entry) => {
      source = source.replace(entry.pattern, ' ' + entry.token + ' ');
    });
    return source;
  }

  function canonicalizeTerm(token) {
    const key = normalizeForComparison(token);
    if (key === 'hugging face' || key === 'huggingface' || key === 'hugging face daily' || key === 'hugging face daily papers') {
      return 'Hugging Face';
    }
    if (key.indexOf('techcrunch') !== -1) {
      return '';
    }
    if (Object.prototype.hasOwnProperty.call(TERM_ALIASES, key)) {
      return TERM_ALIASES[key];
    }
    return token;
  }

  const KNOWN_ENTITY_FRAGMENTS = [
    'hugging face', 'thinking machines', 'jane street', 'muse spark',
    'openai', 'anthropic', 'google', 'deepmind', 'nvidia', '英伟达',
    'meta', 'microsoft', 'apple', 'amazon', 'tesla', 'spacex', 'amd',
    'chatgpt', 'claude', 'gemini', 'deepseek', 'llama', 'qwen',
    'mistral', 'cohere', 'waymo', 'uber', 'stripe', 'astra',
    'cursor', 'robotaxi', 'blackwell', 'fable'
  ];

  function containsKnownEntityFragment(text, fragment) {
    const source = normalizeForComparison(text);
    const needle = normalizeForComparison(fragment);
    if (!source || !needle) {
      return false;
    }
    if (/[\u4e00-\u9fff]/.test(needle)) {
      return source.indexOf(needle) !== -1;
    }
    return new RegExp('(?:^|[^a-z0-9])' + escapeRegex(needle) + '(?:[^a-z0-9]|$)').test(source);
  }

  function splitConcatenatedEntityNames(value) {
    const text = canonicalizeTerm(normalizeEntityName(value));
    if (!text) {
      return [];
    }
    const hits = [];
    KNOWN_ENTITY_FRAGMENTS.forEach((fragment) => {
      if (containsKnownEntityFragment(text, fragment)) {
        hits.push(canonicalizeTerm(fragment));
      }
    });
    return uniqueStrings(hits);
  }

  function looksLikeConcatenatedEntities(value) {
    return splitConcatenatedEntityNames(value).length >= 2;
  }

  function isCategoryOrMetaTerm(token) {
    const key = normalizeForComparison(token);
    if (!key) {
      return true;
    }
    if (FIXED_CATEGORY_KEYS.has(key) || CATEGORY_NOISE_WORDS.has(key) || SOURCE_NOISE_WORDS.has(key)) {
      return true;
    }
    if (DISCOURSE_NOISE_WORDS.has(key) || ANALYSIS_NOISE_WORDS.has(key) || ZH_STOP_WORDS.has(token) || ZH_STOP_WORDS.has(key)) {
      return true;
    }
    return false;
  }

  function isMeaningfulAnalysisTerm(token) {
    const key = normalizeForComparison(token);
    if (!key || isCategoryOrMetaTerm(key)) {
      return false;
    }
    if (TECHNICAL_KEEP_WORDS.has(key) || Object.prototype.hasOwnProperty.call(TERM_ALIASES, key)) {
      return true;
    }
    if (/美元|据报|报道|融资|估值|收购|入口|产业|讲师|分身|猜测/.test(key)) {
      return false;
    }
    if (isChineseToken(token)) {
      if (token.length < 2 || token.length > 8) {
        return false;
      }
      if (token.length === 2 && !TECHNICAL_KEEP_WORDS.has(key)) {
        return false;
      }
      if (/^(不|而|是|并|还|也|就|都|更|越|能|可|只|会|但|将|其|和|与|比|作为|对|从|把|被|让)/.test(token)) {
        return false;
      }
      if (/[的了在将和与把被让]/.test(token)) {
        return false;
      }
      return !/到$|了$|着$|的$/.test(token);
    }
    if (key.length < 3) {
      return false;
    }
    if (EN_STOP_WORDS.has(key)) {
      return false;
    }
    return /[a-z]/.test(key) && !isNumericToken(key);
  }

  function isMeaningfulEntityName(value) {
    const displayName = canonicalizeTerm(normalizeEntityName(value));
    const key = normalizeForComparison(displayName);
    if (!displayName || !key) {
      return false;
    }
    if (isSentenceLikeLabel(displayName)) {
      return false;
    }
    if (looksLikeConcatenatedEntities(displayName)) {
      return false;
    }
    if (ENTITY_NOISE_WORDS.has(key) || isCategoryOrMetaTerm(key) || SOURCE_NOISE_WORDS.has(key)) {
      return false;
    }
    if (TECHNICAL_KEEP_WORDS.has(key) || Object.prototype.hasOwnProperty.call(TERM_ALIASES, key)) {
      return true;
    }
    if (/美元|据报|报道|融资|估值|收购|入口|产业|讲师|分身|猜测/.test(key)) {
      return false;
    }
    if (/^\d/.test(key) && !/^(gpt|llama|claude|qwen|h100|h200|b200)/i.test(key)) {
      return false;
    }
    if (isChineseToken(displayName)) {
      if (displayName.length < 3 || displayName.length > 8) {
        return false;
      }
      const suffixMatch = displayName.match(/^(.*?)(模型|芯片|智能体|机器人|基准|算力|集群|加速器|对齐|幻觉|漏洞)$/);
      if (!suffixMatch) {
        return false;
      }
      const prefix = suffixMatch[1];
      if (!prefix || prefix.length > 4) {
        return false;
      }
      if (/[的了在将和与把被让以出为]|生产|中心|获得|声称|表示|报道|据报|人工|智能/.test(prefix)) {
        return false;
      }
      if (isCategoryOrMetaTerm(prefix)) {
        return false;
      }
      if (/州$|市$|华尔街|公司|功能|平台|阈值|^伟达/.test(displayName)) {
        return false;
      }
      if (/[性商者]$/.test(displayName) && !TECHNICAL_KEEP_WORDS.has(key)) {
        return false;
      }
      if (/^(不|而|是|并|还|也|就|都|更|越|能|可|只|会|但|将|其|和|与|比|作为|对|从|把|被|让|已|正|提)/.test(displayName)) {
        return false;
      }
      if (/[的了在将和与把被让]/.test(displayName)) {
        return false;
      }
      if (/[以出为取约成否够]$/.test(displayName)) {
        return false;
      }
      return !/到$|了$|着$|的$/.test(displayName);
    }
    if (isSentenceLikeLabel(displayName)) {
      return false;
    }
    return key.length >= 3 && !EN_STOP_WORDS.has(key) && !isNumericToken(key);
  }

  const EVENT_TYPE_LABELS = {
    launch: '发布',
    acquisition: '收购',
    funding: '融资',
    partnership: '合作',
    open_source: '开源',
    research: '研究',
    benchmark: '评测',
    policy: '监管',
    security: '风险',
    infra: '算力',
    trend: '动向'
  };

  function isSentenceLikeLabel(value) {
    const text = normalizeText(value);
    if (!text) {
      return true;
    }
    const spaces = (text.match(/\s/g) || []).length;
    if (/[。！？；]|观察：|据报|声称|表示|认为|称，|破坏了|带来无限/.test(text)) {
      return true;
    }
    if (spaces >= 3 || text.length > 28) {
      return true;
    }
    if (spaces >= 2 && text.length > 22) {
      return true;
    }
    if (/[\u4e00-\u9fff]/.test(text) && text.length > 12) {
      return true;
    }
    if (/^(在|并|的|了|与|将|把|被|从|对|为|以|其)/.test(text) && text.length >= 4) {
      return true;
    }
    return false;
  }

  function shortEventLabel(eventType, entityName) {
    const action = EVENT_TYPE_LABELS[eventType] || String(eventType || '').trim();
    const entity = canonicalizeTerm(entityName || '');
    if (entity && isMeaningfulEntityName(entity)) {
      return action ? action + ' · ' + entity : entity;
    }
    return action || '';
  }

  function cleanClueTitle(title) {
    const parts = [];
    String(title || '').split(/\s*\/\s*/).forEach((part) => {
      const trimmed = part.trim();
      const split = splitConcatenatedEntityNames(trimmed);
      if (split.length >= 2) {
        parts.push.apply(parts, split);
        return;
      }
      parts.push(canonicalizeTerm(trimmed));
    });
    return uniqueStrings(parts.filter((part) => part && isMeaningfulEntityName(part))).slice(0, 4).join(' / ');
  }

  function rewriteConcatenatedMentions(text) {
    return String(text || '').replace(/\b[A-Z][A-Za-z0-9.+-]*(?:\s+[A-Z][A-Za-z0-9.+-]*)+\b/g, (match) => {
      const parts = splitConcatenatedEntityNames(match);
      return parts.length >= 2 ? parts.join('、') : match;
    });
  }

  function eventTypeLabel(eventType) {
    const key = String(eventType || '').trim();
    return EVENT_TYPE_LABELS[key] || key;
  }

  function cleanInsightSignal(signal) {
    const text = normalizeText(signal);
    if (!text) {
      return '';
    }
    const mapped = text.replace(/^([a-z_]+)\s+信号在该主题中最集中[。.]?$/i, function (_, type) {
      const label = eventTypeLabel(type);
      return label ? label + ' 是该主题里最集中的关系。' : '';
    });
    if (/^[a-z_]+(\s|$)/i.test(mapped) && !/[\u4e00-\u9fff]/.test(mapped.slice(0, 12))) {
      return '';
    }
    return mapped;
  }

  function unwrapGraphItem(entry) {
    return Object.assign({}, entry && (entry.data || entry));
  }

  function sanitizeGraphDataset(dataset, options) {
    const settings = Object.assign({
      keepTypes: ['entity'],
      maxNodes: 48
    }, options || {});
    const keepTypes = new Set(settings.keepTypes || ['entity']);
    const source = dataset || { nodes: [], edges: [], clues: [] };
    const rawNodes = (source.nodes || []).map(unwrapGraphItem);
    const rawEdges = (source.edges || []).map(unwrapGraphItem);
    const aliasToIds = new Map();
    const nodes = [];
    const nodeMap = new Map();

    function rememberAlias(fromId, toIds) {
      const next = uniqueStrings((aliasToIds.get(fromId) || []).concat(toIds));
      aliasToIds.set(fromId, next);
    }

    function resolveIds(id) {
      return aliasToIds.get(id) || [];
    }

    function mergeSingleEntity(node, label) {
      const type = node.type || 'entity';
      const key = type + ':' + normalizeForComparison(label);
      if (aliasToIds.has(key)) {
        const existingId = aliasToIds.get(key)[0];
        const existing = nodeMap.get(existingId);
        existing.articleIds = uniqueStrings((existing.articleIds || []).concat(node.articleIds || node.article_ids || []));
        existing.weight = Number(existing.weight || 1) + Number(node.weight || 1);
        rememberAlias(node.id, [existing.id]);
        return existing;
      }
      const next = {
        id: node.id,
        label: label,
        type: type,
        subtype: node.subtype || '',
        summary: '',
        articleIds: uniqueStrings(node.articleIds || node.article_ids || []),
        aliases: node.aliases || [],
        weight: Number(node.weight || 1)
      };
      rememberAlias(key, [next.id]);
      rememberAlias(node.id, [next.id]);
      nodeMap.set(next.id, next);
      nodes.push(next);
      return next;
    }

    function mergeNode(node) {
      const rawLabel = node.label || node.name || '';
      const label = canonicalizeTerm(rawLabel);
      const type = node.type || 'entity';
      if (!keepTypes.has(type)) {
        return null;
      }
      if (type === 'entity') {
        const split = splitConcatenatedEntityNames(rawLabel);
        if (split.length >= 2) {
          const kept = [];
          split.forEach((part, index) => {
            if (!isMeaningfulEntityName(part)) {
              return;
            }
            const created = mergeSingleEntity({
              id: node.id + '::' + normalizeForComparison(part) + '-' + index,
              type: 'entity',
              articleIds: node.articleIds || node.article_ids || [],
              weight: node.weight || 1
            }, part);
            if (created) {
              kept.push(created.id);
            }
          });
          rememberAlias(node.id, kept);
          return null;
        }
        if (!label || !isMeaningfulEntityName(label) || isSentenceLikeLabel(label)) {
          return null;
        }
        return mergeSingleEntity(node, label);
      }
      if (type === 'event') {
        const shortLabel = isSentenceLikeLabel(rawLabel)
          ? shortEventLabel(node.subtype || node.event_type, '')
          : label;
        if (!shortLabel || isSentenceLikeLabel(shortLabel)) {
          return null;
        }
        return mergeSingleEntity(Object.assign({}, node, { label: shortLabel }), shortLabel);
      }
      if (!label || isSentenceLikeLabel(label) || isCategoryOrMetaTerm(label)) {
        return null;
      }
      return mergeSingleEntity(node, label);
    }

    rawNodes.forEach(mergeNode);

    const neighborMap = new Map();
    rawEdges.forEach((edge) => {
      const leftIds = resolveIds(edge.source);
      const rightIds = resolveIds(edge.target);
      if (!leftIds.length || !rightIds.length) {
        if (leftIds.length) {
          const list = neighborMap.get(edge.source) || [];
          list.push(edge.target);
          neighborMap.set(edge.source, list);
        }
        if (rightIds.length) {
          const list = neighborMap.get(edge.target) || [];
          list.push(edge.source);
          neighborMap.set(edge.target, list);
        }
      }
    });

    const edges = [];
    const edgeIds = new Set();

    function addEdge(sourceId, targetId, edge) {
      if (!sourceId || !targetId || sourceId === targetId) {
        return;
      }
      const pairKey = sourceId < targetId ? sourceId + '::' + targetId : targetId + '::' + sourceId;
      if (edgeIds.has(pairKey)) {
        return;
      }
      const rawLabel = edge.label || edge.type || '';
      const label = EVENT_TYPE_LABELS[rawLabel] || eventTypeLabel(rawLabel);
      if (label && isSentenceLikeLabel(label)) {
        return;
      }
      const cleanLabel = label && !isCategoryOrMetaTerm(label) && !isSentenceLikeLabel(label) ? label : '';
      edgeIds.add(pairKey);
      edges.push({
        id: edge.id || ('edge:' + pairKey),
        source: sourceId,
        target: targetId,
        type: edge.type || 'entity-entity',
        label: cleanLabel,
        weight: Number(edge.weight || 1),
        articleIds: uniqueStrings(edge.articleIds || edge.article_ids || [])
      });
    }

    rawEdges.forEach((edge) => {
      resolveIds(edge.source).forEach((sourceId) => {
        resolveIds(edge.target).forEach((targetId) => {
          addEdge(sourceId, targetId, edge);
        });
      });
    });

    rawNodes.forEach((node) => {
      const splitIds = resolveIds(node.id);
      if (splitIds.length >= 2) {
        for (let i = 0; i < splitIds.length; i += 1) {
          for (let j = i + 1; j < splitIds.length; j += 1) {
            addEdge(splitIds[i], splitIds[j], { type: 'entity-entity', label: '', weight: 1, articleIds: node.articleIds || node.article_ids || [] });
          }
        }
      }
      if (keepTypes.has(node.type || 'entity')) {
        return;
      }
      const links = neighborMap.get(node.id) || [];
      const keptNeighbors = uniqueStrings(links.flatMap((other) => resolveIds(other)));
      for (let i = 0; i < keptNeighbors.length; i += 1) {
        for (let j = i + 1; j < keptNeighbors.length; j += 1) {
          addEdge(keptNeighbors[i], keptNeighbors[j], {
            type: 'entity-entity',
            label: EVENT_TYPE_LABELS[node.subtype] || '',
            weight: 1,
            articleIds: node.articleIds || node.article_ids || []
          });
        }
      }
    });

    const connected = new Set();
    edges.forEach((edge) => {
      connected.add(edge.source);
      connected.add(edge.target);
    });
    const priorityLabels = new Set();
    (source.clues || []).forEach((clue) => {
      String(clue.title || '').split(/\s*\/\s*/).forEach((part) => {
        const split = splitConcatenatedEntityNames(part);
        (split.length >= 2 ? split : [canonicalizeTerm(part)]).forEach((label) => {
          if (label && isMeaningfulEntityName(label)) {
            priorityLabels.add(normalizeForComparison(label));
          }
        });
      });
      (clue.coreEntities || clue.core_entities || []).forEach((entry) => {
        const split = splitConcatenatedEntityNames(entry);
        (split.length >= 2 ? split : [canonicalizeTerm(entry)]).forEach((label) => {
          if (label && isMeaningfulEntityName(label)) {
            priorityLabels.add(normalizeForComparison(label));
          }
        });
      });
    });
    const rankedNodes = nodes
      .filter((node) => connected.has(node.id) || (node.articleIds || []).length >= 2 || priorityLabels.has(normalizeForComparison(node.label)))
      .sort((a, b) => Number(b.weight || 1) - Number(a.weight || 1));
    const priorityNodes = rankedNodes.filter((node) => priorityLabels.has(normalizeForComparison(node.label)));
    const fillerNodes = rankedNodes.filter((node) => !priorityLabels.has(normalizeForComparison(node.label)));
    const filteredNodes = priorityNodes.concat(fillerNodes).slice(0, settings.maxNodes);
    const keptIds = new Set(filteredNodes.map((node) => node.id));
    const filteredEdges = edges.filter((edge) => keptIds.has(edge.source) && keptIds.has(edge.target));

    const clues = (source.clues || []).map((clue) => {
      const splitEntities = [];
      (clue.coreEntities || clue.core_entities || []).forEach((entry) => {
        const split = splitConcatenatedEntityNames(entry);
        if (split.length >= 2) {
          splitEntities.push.apply(splitEntities, split);
          return;
        }
        splitEntities.push(canonicalizeTerm(entry));
      });
      const coreEntities = uniqueStrings(splitEntities.filter((entry) => isMeaningfulEntityName(entry)));
      const title = cleanClueTitle(clue.title) || coreEntities.slice(0, 3).join(' / ');
      const labelSet = new Set(coreEntities.map((entry) => normalizeForComparison(entry)));
      const mappedFocus = uniqueStrings((clue.focusNodeIds || []).flatMap((id) => resolveIds(id)))
        .filter((id) => keptIds.has(id));
      const titleFocus = filteredNodes
        .filter((node) => labelSet.has(normalizeForComparison(node.label)))
        .map((node) => node.id);
      const focusSet = new Set(mappedFocus.concat(titleFocus));
      const seedEdgeCount = filteredEdges.filter((edge) => focusSet.has(edge.source) && focusSet.has(edge.target)).length;
      if (focusSet.size && seedEdgeCount === 0) {
        filteredEdges.forEach((edge) => {
          if (focusSet.has(edge.source) || focusSet.has(edge.target)) {
            focusSet.add(edge.source);
            focusSet.add(edge.target);
          }
        });
      }
      const focusNodeIds = Array.from(focusSet).filter((id) => keptIds.has(id));
      const focusNodeSet = new Set(focusNodeIds);
      const focusEdgeIds = filteredEdges
        .filter((edge) => focusNodeSet.has(edge.source) && focusNodeSet.has(edge.target))
        .map((edge) => edge.id);
      const eventTypes = uniqueStrings((clue.eventTypes || clue.event_types || []).map(eventTypeLabel));
      const trendSignals = uniqueStrings((clue.trendSignals || clue.trend_signals || []).map(cleanInsightSignal).filter(Boolean));
      return Object.assign({}, clue, {
        title: title,
        coreEntities: coreEntities,
        eventTypes: eventTypes,
        trendSignals: trendSignals,
        focusNodeIds: focusNodeIds,
        focusEdgeIds: focusEdgeIds
      });
    }).filter((clue) => clue.title && clue.focusNodeIds.length >= 2);

    return {
      nodes: filteredNodes.map((node) => ({ data: node })),
      edges: filteredEdges.map((edge) => ({ data: edge })),
      clues: clues
    };
  }

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

  function bindFullscreenToggle(button, element, options) {
    if (!button || !element || !global.document || typeof global.document.addEventListener !== 'function') {
      return function () {};
    }

    const onChange = options && options.onChange;
    const enterLabel = (options && options.enterLabel) || '全屏';
    const exitLabel = (options && options.exitLabel) || '退出全屏';
    const doc = global.document;
    const supportsFullscreen = typeof element.requestFullscreen === 'function';

    if (!supportsFullscreen) {
      button.disabled = true;
      return function () {};
    }

    element.classList.add('is-fullscreen-enabled');
    button.classList.add('ghost-button', 'ghost-button-compact');

    function syncState() {
      const isFullscreen = doc.fullscreenElement === element;
      element.classList.toggle('is-fullscreen-view', isFullscreen);
      button.classList.toggle('is-active', isFullscreen);
      button.textContent = isFullscreen ? exitLabel : enterLabel;
      button.setAttribute('aria-pressed', isFullscreen ? 'true' : 'false');
      if (typeof onChange === 'function') {
        onChange(isFullscreen);
      }
    }

    function handleClick(event) {
      if (event) {
        event.preventDefault();
      }
      if (doc.fullscreenElement === element) {
        const exit = doc.exitFullscreen && doc.exitFullscreen();
        if (exit && typeof exit.catch === 'function') {
          exit.catch(function () {});
        }
        return;
      }
      if (doc.fullscreenElement) {
        return;
      }
      const request = element.requestFullscreen();
      if (request && typeof request.catch === 'function') {
        request.catch(function () {});
      }
    }

    button.addEventListener('click', handleClick);
    doc.addEventListener('fullscreenchange', syncState);
    syncState();

    return function () {
      button.removeEventListener('click', handleClick);
      doc.removeEventListener('fullscreenchange', syncState);
      element.classList.remove('is-fullscreen-enabled', 'is-fullscreen-view');
      button.classList.remove('is-active', 'ghost-button', 'ghost-button-compact');
    };
  }

  function trimToken(token) {
    return String(token || '')
      .replace(/^[^0-9A-Za-z\u4e00-\u9fff.+-]+/, '')
      .replace(/[^0-9A-Za-z\u4e00-\u9fff.+-]+$/, '')
      .trim();
  }

  function isNumericToken(token) {
    const compact = String(token || '').replace(/[,$]/g, '');
    return /^\d+(?:\.\d+)?(?:[bmk]|bn)?$/i.test(compact) || /^\d+(?:[.:/-]\d+)*$/.test(compact);
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

    if (mode === 'analysis') {
      return isMeaningfulAnalysisTerm(token);
    }

    if (mode === 'entity') {
      return isMeaningfulEntityName(token);
    }

    if (isChineseToken(token)) {
      if (token.length < 2 || token.length > 6) {
        return false;
      }
      if (ZH_STOP_WORDS.has(token)) {
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
    return true;
  }

  function collectRawSegments(text) {
    const source = protectCompounds(text);
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
      tokens.push(canonicalizeTerm(normalized));
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

  function addWordCloudToken(termMap, rawToken, item, weight) {
    const canonical = canonicalizeTerm(trimToken(rawToken).toLowerCase());
    const key = normalizeForComparison(canonical);
    if (!canonical || !key || !isMeaningfulAnalysisTerm(canonical)) {
      return;
    }

    let entry = termMap.get(key);
    if (!entry) {
      entry = {
        term: canonical,
        count: 0,
        articleIds: new Set(),
        dayCounts: new Map()
      };
      termMap.set(key, entry);
    }

    entry.count += weight;
    entry.articleIds.add(item.id);
    entry.dayCounts.set(item.day, (entry.dayCounts.get(item.day) || 0) + weight);
    if (canonical.length > entry.term.length) {
      entry.term = canonical;
    }
  }

  function buildWordCloudStats(items) {
    const termMap = new Map();

    (items || []).forEach((item) => {
      tokenizeAnalysisText(item.title || '').forEach((token) => addWordCloudToken(termMap, token, item, 3));
      tokenizeAnalysisText(item.summary || '').forEach((token) => addWordCloudToken(termMap, token, item, 2));
      tokenizeAnalysisText(item.detail || '').forEach((token) => addWordCloudToken(termMap, token, item, 1));
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
      const displayName = canonicalizeTerm(normalizeEntityName(name));
      const key = normalizeForComparison(displayName);
      if (!displayName || !key || !isMeaningfulEntityName(displayName)) {
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
    buildDetailLink,
    bindFullscreenToggle,
    isMeaningfulAnalysisTerm,
    isMeaningfulEntityName,
    isSentenceLikeLabel,
    canonicalizeTerm,
    cleanClueTitle,
    cleanInsightSignal,
    rewriteConcatenatedMentions,
    eventTypeLabel,
    shortEventLabel,
    splitConcatenatedEntityNames,
    sanitizeGraphDataset,
    EVENT_TYPE_LABELS
  };
})(window);
