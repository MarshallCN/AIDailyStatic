(function (global) {
  const TYPE_STYLES = {
    article: { fill: '#eff6ff', stroke: '#93c5fd', radius: 12, label: '文章' },
    entity: { fill: '#eef2ff', stroke: '#a5b4fc', radius: 15, label: '实体' },
    event: { fill: '#ecfeff', stroke: '#67e8f9', radius: 13, label: '事件' },
    source: { fill: '#fef3c7', stroke: '#fbbf24', radius: 11, label: '来源' },
    category: { fill: '#dcfce7', stroke: '#4ade80', radius: 10, label: '分类' }
  };

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function dedupe(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function getTypeStyle(node) {
    return TYPE_STYLES[node.type] || TYPE_STYLES.entity;
  }

  function formatList(values, formatter) {
    const entries = dedupe(values).slice(0, 8);
    if (!entries.length) {
      return '<span class="graph-detail-muted">暂无</span>';
    }
    return entries.map(function (value) {
      return '<span class="graph-detail-tag">' + escapeHtml(formatter ? formatter(value) : value) + '</span>';
    }).join('');
  }

  function GraphRenderer(container, options) {
    this.container = container;
    this.options = Object.assign({
      compact: false,
      enableDetail: true,
      showEdgeLabels: false,
      fitPadding: 64,
      showControls: true
    }, options || {});
    this.simulation = null;
    this.zoomBehavior = null;
    this.dataset = null;
    this.focus = null;
    this.currentTransform = null;
    this.selectedNodeId = '';
    this.selectedEdgeId = '';
    this.resizeTimer = 0;
    this.nodeElements = null;
    this.edgeElements = null;
    this.edgeLabelElements = null;
    this.edgeLabelBgElements = null;
    this.svg = null;
    this.g = null;
    this.detailPanel = null;
    this.legend = null;
    this.emptyState = null;
    this.controls = null;
    this.hasUserZoomed = false;
    this.isProgrammaticZoom = false;
    this.autofitTick = 0;
    this.boundHandleResize = null;
    this.setup();
  }

  GraphRenderer.prototype.setup = function () {
    if (!this.container) {
      return;
    }

    this.container.innerHTML = '';
    this.container.classList.add('dynamic-graph-root');

    if (typeof d3 !== 'object') {
      this.container.innerHTML = '<div class="dynamic-graph-empty">缺少本地图谱渲染依赖。</div>';
      return;
    }

    this.svg = d3.select(this.container)
      .append('svg')
      .attr('class', 'dynamic-graph-svg');

    this.g = this.svg.append('g').attr('class', 'dynamic-graph-layer');
    this.g.append('g').attr('class', 'graph-links');
    this.g.append('g').attr('class', 'graph-label-bgs');
    this.g.append('g').attr('class', 'graph-edge-labels');
    this.g.append('g').attr('class', 'graph-nodes');
    this.g.append('g').attr('class', 'graph-node-labels');

    this.emptyState = document.createElement('div');
    this.emptyState.className = 'dynamic-graph-empty hidden';
    this.emptyState.textContent = '当前图谱暂无可展示的数据。';
    this.container.appendChild(this.emptyState);

    this.legend = document.createElement('div');
    this.legend.className = 'dynamic-graph-legend hidden';
    this.container.appendChild(this.legend);

    if (!this.options.compact && this.options.showControls !== false) {
      this.controls = document.createElement('div');
      this.controls.className = 'dynamic-graph-controls';
      this.controls.innerHTML = [
        '<button type="button" class="ghost-button ghost-button-compact" data-graph-action="fit">重置视图</button>',
        '<button type="button" class="ghost-button ghost-button-compact" data-graph-action="labels">',
        this.options.showEdgeLabels ? '隐藏边标签' : '显示边标签',
        '</button>'
      ].join('');
      this.container.appendChild(this.controls);
      this.controls.addEventListener('click', this.handleControlClick.bind(this));
    }

    if (this.options.enableDetail) {
      this.detailPanel = document.createElement('aside');
      this.detailPanel.className = 'graph-detail-panel hidden';
      this.container.appendChild(this.detailPanel);
    }

    this.zoomBehavior = d3.zoom()
      .scaleExtent([0.2, 4])
      .on('zoom', this.handleZoom.bind(this));

    this.svg.call(this.zoomBehavior);
    this.svg.on('click', this.handleCanvasClick.bind(this));

    this.boundHandleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.boundHandleResize);
  };

  GraphRenderer.prototype.handleResize = function () {
    const self = this;
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(function () {
      if (self.dataset) {
        self.render(self.dataset);
      }
    }, 160);
  };

  GraphRenderer.prototype.handleZoom = function (event) {
    if (!this.isProgrammaticZoom) {
      this.hasUserZoomed = true;
    }
    this.currentTransform = event.transform;
    if (this.g) {
      this.g.attr('transform', event.transform);
    }
  };

  GraphRenderer.prototype.handleControlClick = function (event) {
    const button = event.target.closest('button[data-graph-action]');
    if (!button) return;
    const action = button.getAttribute('data-graph-action');
    if (action === 'fit') {
      this.fitToAll();
      return;
    }
    if (action === 'labels') {
      this.options.showEdgeLabels = !this.options.showEdgeLabels;
      button.textContent = this.options.showEdgeLabels ? '隐藏边标签' : '显示边标签';
      this.syncEdgeLabelVisibility();
    }
  };

  GraphRenderer.prototype.handleCanvasClick = function (event) {
    if (event.defaultPrevented) {
      return;
    }
    this.selectedNodeId = '';
    this.selectedEdgeId = '';
    this.syncHighlightState();
    this.renderDetail(null);
  };

  GraphRenderer.prototype.prepareData = function (dataset) {
    const nodes = (dataset.nodes || []).map(function (entry) {
      const data = Object.assign({}, entry.data || entry);
      return {
        id: data.id,
        label: data.label || data.name || data.id,
        type: data.type || 'entity',
        subtype: data.subtype || data.entityType || data.eventType || '',
        summary: data.summary || '',
        articleIds: data.articleIds || [],
        aliases: data.aliases || [],
        metrics: data.metrics || [],
        rawData: data
      };
    });

    const nodeMap = new Map(nodes.map(function (node) {
      return [node.id, node];
    }));

    const grouped = new Map();
    const rawEdges = (dataset.edges || []).map(function (entry) {
      return Object.assign({}, entry.data || entry);
    }).filter(function (edge) {
      return nodeMap.has(edge.source) && nodeMap.has(edge.target);
    });

    rawEdges.forEach(function (edge) {
      const key = edge.source <= edge.target
        ? edge.source + '::' + edge.target
        : edge.target + '::' + edge.source;
      const list = grouped.get(key) || [];
      list.push(edge);
      grouped.set(key, list);
    });

    const edges = [];
    grouped.forEach(function (list) {
      list.forEach(function (edge, index) {
        const total = list.length;
        const middle = (total - 1) / 2;
        const curvature = total === 1 ? 0 : (index - middle) * 0.26;
        edges.push({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type || 'relation',
          label: edge.label || edge.type || '',
          weight: Number(edge.weight || 1),
          articleIds: edge.articleIds || [],
          rawData: edge,
          curvature: curvature
        });
      });
    });

    return { nodes: nodes, edges: edges };
  };

  GraphRenderer.prototype.render = function (dataset) {
    this.dataset = dataset || { nodes: [], edges: [] };
    if (!this.svg || typeof d3 !== 'object') {
      return;
    }
    const self = this;
    this.hasUserZoomed = false;
    this.autofitTick = 0;
    this.currentTransform = null;

    if (this.simulation) {
      this.simulation.stop();
    }

    const prepared = this.prepareData(this.dataset);
    const width = Math.max(320, this.container.clientWidth || 320);
    const height = Math.max(this.options.compact ? 240 : 480, this.container.clientHeight || (this.options.compact ? 240 : 480));

    this.svg
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', '0 0 ' + width + ' ' + height);

    this.g.selectAll('*').remove();
    this.g.append('g').attr('class', 'graph-links');
    this.g.append('g').attr('class', 'graph-label-bgs');
    this.g.append('g').attr('class', 'graph-edge-labels');
    this.g.append('g').attr('class', 'graph-nodes');
    this.g.append('g').attr('class', 'graph-node-labels');

    if (!prepared.nodes.length) {
      this.emptyState.classList.remove('hidden');
      this.legend.classList.add('hidden');
      this.renderDetail(null);
      return;
    }

    this.emptyState.classList.add('hidden');
    this.renderLegend(prepared.nodes);

    const linksLayer = this.g.select('.graph-links');
    const labelBgLayer = this.g.select('.graph-label-bgs');
    const edgeLabelLayer = this.g.select('.graph-edge-labels');
    const nodesLayer = this.g.select('.graph-nodes');
    const nodeLabelLayer = this.g.select('.graph-node-labels');

    const simulation = d3.forceSimulation(prepared.nodes)
      .force('link', d3.forceLink(prepared.edges).id(function (d) { return d.id; }).distance(function (edge) {
        if (edge.type === 'article-source' || edge.type === 'article-category') return 84;
        if (edge.type === 'article-entity' || edge.type === 'article-event') return 112;
        if (edge.type === 'event-entity') return 128;
        return 154;
      }).strength(0.42))
      .force('charge', d3.forceManyBody().strength(this.options.compact ? -240 : -420))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(function (node) {
        return getTypeStyle(node).radius + (node.type === 'article' ? 10 : 8);
      }))
      .force('x', d3.forceX(width / 2).strength(0.04))
      .force('y', d3.forceY(height / 2).strength(0.04));

    this.simulation = simulation;

    const edgeElements = linksLayer.selectAll('path')
      .data(prepared.edges, function (d) { return d.id; })
      .enter()
      .append('path')
      .attr('class', function (d) {
        return 'graph-edge graph-edge-' + d.type.replace(/[^a-z0-9-]/gi, '-');
      })
      .style('stroke-width', function (d) {
        return Math.max(1.4, Math.min(5.2, 1.1 + d.weight * 0.55));
      })
      .on('click', this.handleEdgeClick.bind(this));

    const edgeLabelBgElements = labelBgLayer.selectAll('rect')
      .data(prepared.edges, function (d) { return d.id; })
      .enter()
      .append('rect')
      .attr('class', 'graph-edge-label-bg')
      .attr('rx', 4)
      .attr('ry', 4)
      .on('click', this.handleEdgeClick.bind(this));

    const edgeLabelElements = edgeLabelLayer.selectAll('text')
      .data(prepared.edges, function (d) { return d.id; })
      .enter()
      .append('text')
      .attr('class', 'graph-edge-label')
      .text(function (d) { return d.label; })
      .on('click', this.handleEdgeClick.bind(this));

    const nodeGroups = nodesLayer.selectAll('g')
      .data(prepared.nodes, function (d) { return d.id; })
      .enter()
      .append('g')
      .attr('class', function (d) {
        return 'graph-node graph-node-' + d.type;
      })
      .call(d3.drag()
        .on('start', this.handleDragStart.bind(this, simulation))
        .on('drag', this.handleDrag.bind(this))
        .on('end', this.handleDragEnd.bind(this, simulation)))
      .on('click', this.handleNodeClick.bind(this));

    nodeGroups.append('circle')
      .attr('r', function (node) {
        return getTypeStyle(node).radius;
      })
      .attr('fill', function (node) {
        return getTypeStyle(node).fill;
      })
      .attr('stroke', function (node) {
        return getTypeStyle(node).stroke;
      })
      .attr('stroke-width', 2.4);

    nodeGroups.append('circle')
      .attr('class', 'graph-node-ring')
      .attr('r', function (node) {
        return getTypeStyle(node).radius + 3;
      });

    const nodeLabelElements = nodeLabelLayer.selectAll('text')
      .data(prepared.nodes, function (d) { return d.id; })
      .enter()
      .append('text')
      .attr('class', 'graph-node-label')
      .text(function (node) {
        return node.label.length > 16 ? node.label.slice(0, 15) + '…' : node.label;
      });

    simulation.on('tick', function () {
      edgeElements.attr('d', function (edge) {
        return buildEdgePath(edge);
      });

      edgeLabelElements.each(function (edge) {
        const mid = getEdgeMidpoint(edge);
        d3.select(this)
          .attr('x', mid.x)
          .attr('y', mid.y);
      });

      edgeLabelBgElements.each(function (edge, index) {
        const mid = getEdgeMidpoint(edge);
        const labelNode = edgeLabelElements.nodes()[index];
        if (!labelNode) return;
        const bbox = labelNode.getBBox();
        d3.select(this)
          .attr('x', mid.x - bbox.width / 2 - 5)
          .attr('y', mid.y - bbox.height / 2 - 2)
          .attr('width', bbox.width + 10)
          .attr('height', bbox.height + 4);
      });

      nodeGroups.attr('transform', function (node) {
        return 'translate(' + node.x + ',' + node.y + ')';
      });

      nodeLabelElements
        .attr('x', function (node) { return node.x + getTypeStyle(node).radius + 8; })
        .attr('y', function (node) { return node.y + 4; });

      self.autofitTick += 1;
      if (!self.hasUserZoomed && !self.focus && self.autofitTick === 18) {
        self.fitToAll({ animate: false });
      }
    });

    simulation.on('end', function () {
      if (!self.hasUserZoomed && !self.focus) {
        self.fitToAll({ animate: false });
      }
    });

    this.nodeElements = nodeGroups;
    this.edgeElements = edgeElements;
    this.edgeLabelElements = edgeLabelElements;
    this.edgeLabelBgElements = edgeLabelBgElements;

    this.syncEdgeLabelVisibility();
    this.syncHighlightState();

    if (this.currentTransform) {
      this.svg.call(this.zoomBehavior.transform, this.currentTransform);
    } else {
      this.fitToAll({ animate: false });
    }

    if (this.focus) {
      this.setFocus(this.focus);
    }

    function buildEdgePath(edge) {
      const sx = edge.source.x;
      const sy = edge.source.y;
      const tx = edge.target.x;
      const ty = edge.target.y;
      if (edge.source.id === edge.target.id) {
        const loop = 28;
        return 'M' + (sx + 6) + ',' + (sy - 4) + 'A' + loop + ',' + loop + ' 0 1,1 ' + (tx + 6) + ',' + (ty + 4);
      }
      if (!edge.curvature) {
        return 'M' + sx + ',' + sy + 'L' + tx + ',' + ty;
      }
      const dx = tx - sx;
      const dy = ty - sy;
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const offsetScale = Math.max(26, distance * 0.24);
      const cx = (sx + tx) / 2 + (-dy / distance) * edge.curvature * offsetScale * 2.4;
      const cy = (sy + ty) / 2 + (dx / distance) * edge.curvature * offsetScale * 2.4;
      return 'M' + sx + ',' + sy + 'Q' + cx + ',' + cy + ' ' + tx + ',' + ty;
    }

    function getEdgeMidpoint(edge) {
      const sx = edge.source.x;
      const sy = edge.source.y;
      const tx = edge.target.x;
      const ty = edge.target.y;
      if (edge.source.id === edge.target.id) {
        return { x: sx + 54, y: sy - 4 };
      }
      if (!edge.curvature) {
        return { x: (sx + tx) / 2, y: (sy + ty) / 2 };
      }
      const dx = tx - sx;
      const dy = ty - sy;
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const offsetScale = Math.max(26, distance * 0.24);
      const cx = (sx + tx) / 2 + (-dy / distance) * edge.curvature * offsetScale * 2.4;
      const cy = (sy + ty) / 2 + (dx / distance) * edge.curvature * offsetScale * 2.4;
      return {
        x: 0.25 * sx + 0.5 * cx + 0.25 * tx,
        y: 0.25 * sy + 0.5 * cy + 0.25 * ty
      };
    }
  };

  GraphRenderer.prototype.handleDragStart = function (simulation, event, node) {
    if (!event.active) {
      simulation.alphaTarget(0.22).restart();
    }
    node.fx = node.x;
    node.fy = node.y;
  };

  GraphRenderer.prototype.handleDrag = function (event, node) {
    node.fx = event.x;
    node.fy = event.y;
  };

  GraphRenderer.prototype.handleDragEnd = function (simulation, event, node) {
    if (!event.active) {
      simulation.alphaTarget(0);
    }
    node.fx = null;
    node.fy = null;
  };

  GraphRenderer.prototype.handleNodeClick = function (event, node) {
    event.stopPropagation();
    this.selectedNodeId = node.id;
    this.selectedEdgeId = '';
    this.syncHighlightState();
    this.renderDetail({ type: 'node', data: node.rawData, node: node });
  };

  GraphRenderer.prototype.handleEdgeClick = function (event, edge) {
    event.stopPropagation();
    this.selectedNodeId = '';
    this.selectedEdgeId = edge.id;
    this.syncHighlightState();
    this.renderDetail({ type: 'edge', data: edge.rawData, edge: edge });
  };

  GraphRenderer.prototype.renderLegend = function (nodes) {
    const legendTypes = [];
    const seen = new Set();
    nodes.forEach(function (node) {
      if (seen.has(node.type)) return;
      seen.add(node.type);
      legendTypes.push(node.type);
    });
    if (!legendTypes.length) {
      this.legend.classList.add('hidden');
      return;
    }
    this.legend.classList.remove('hidden');
    this.legend.innerHTML = legendTypes.map(function (type) {
      const style = TYPE_STYLES[type] || TYPE_STYLES.entity;
      return [
        '<span class="dynamic-graph-legend-item">',
        '<span class="dynamic-graph-legend-dot" style="background:',
        style.fill,
        ';border-color:',
        style.stroke,
        '"></span>',
        escapeHtml(style.label),
        '</span>'
      ].join('');
    }).join('');
  };

  GraphRenderer.prototype.syncEdgeLabelVisibility = function () {
    if (!this.edgeLabelElements || !this.edgeLabelBgElements) {
      return;
    }
    const display = this.options.showEdgeLabels ? null : 'none';
    this.edgeLabelElements.style('display', display);
    this.edgeLabelBgElements.style('display', display);
  };

  GraphRenderer.prototype.syncHighlightState = function () {
    if (!this.nodeElements || !this.edgeElements) {
      return;
    }

    const selectedNodeId = this.selectedNodeId;
    const selectedEdgeId = this.selectedEdgeId;

    this.nodeElements.classed('is-selected', function (node) {
      return node.id === selectedNodeId;
    });

    this.edgeElements.classed('is-selected', function (edge) {
      if (selectedEdgeId) {
        return edge.id === selectedEdgeId;
      }
      if (!selectedNodeId) {
        return false;
      }
      return edge.source.id === selectedNodeId || edge.target.id === selectedNodeId;
    });

    this.edgeLabelElements.classed('is-selected', function (edge) {
      return edge.id === selectedEdgeId;
    });
    this.edgeLabelBgElements.classed('is-selected', function (edge) {
      return edge.id === selectedEdgeId;
    });
  };

  GraphRenderer.prototype.renderDetail = function (selection) {
    if (!this.detailPanel) {
      return;
    }

    if (!selection) {
      this.detailPanel.classList.add('hidden');
      this.detailPanel.innerHTML = '';
      return;
    }

    if (selection.type === 'node') {
      const data = selection.data || {};
      this.detailPanel.classList.remove('hidden');
      this.detailPanel.innerHTML = [
        '<div class="graph-detail-head">',
        '<div>',
        '<div class="graph-detail-kicker">节点详情</div>',
        '<h3>', escapeHtml(data.label || data.name || data.id || ''), '</h3>',
        '</div>',
        '<button type="button" class="graph-detail-close" data-detail-close="1">×</button>',
        '</div>',
        '<div class="graph-detail-body">',
        '<div class="graph-detail-row"><strong>类型</strong><span>', escapeHtml(data.type || ''), '</span></div>',
        data.subtype ? '<div class="graph-detail-row"><strong>子类型</strong><span>' + escapeHtml(data.subtype) + '</span></div>' : '',
        data.summary ? '<div class="graph-detail-section"><strong>摘要</strong><p>' + escapeHtml(data.summary) + '</p></div>' : '',
        '<div class="graph-detail-section"><strong>相关文章</strong><div class="graph-detail-tags">' + formatList(data.articleIds) + '</div></div>',
        data.aliases && data.aliases.length ? '<div class="graph-detail-section"><strong>别名</strong><div class="graph-detail-tags">' + formatList(data.aliases) + '</div></div>' : '',
        data.metrics && data.metrics.length ? '<div class="graph-detail-section"><strong>指标</strong><div class="graph-detail-tags">' + formatList(data.metrics, function (metric) { return metric.name + ': ' + metric.value; }) + '</div></div>' : '',
        '</div>'
      ].join('');
    } else {
      const edge = selection.data || {};
      this.detailPanel.classList.remove('hidden');
      this.detailPanel.innerHTML = [
        '<div class="graph-detail-head">',
        '<div>',
        '<div class="graph-detail-kicker">连线详情</div>',
        '<h3>', escapeHtml(edge.label || edge.type || edge.id || ''), '</h3>',
        '</div>',
        '<button type="button" class="graph-detail-close" data-detail-close="1">×</button>',
        '</div>',
        '<div class="graph-detail-body">',
        '<div class="graph-detail-row"><strong>类型</strong><span>', escapeHtml(edge.type || ''), '</span></div>',
        '<div class="graph-detail-row"><strong>权重</strong><span>', escapeHtml(String(edge.weight || 1)), '</span></div>',
        '<div class="graph-detail-row"><strong>来源</strong><span>', escapeHtml(edge.source || ''), '</span></div>',
        '<div class="graph-detail-row"><strong>目标</strong><span>', escapeHtml(edge.target || ''), '</span></div>',
        '<div class="graph-detail-section"><strong>相关文章</strong><div class="graph-detail-tags">' + formatList(edge.articleIds) + '</div></div>',
        '</div>'
      ].join('');
    }

    const close = this.detailPanel.querySelector('[data-detail-close]');
    if (close) {
      close.addEventListener('click', this.renderDetail.bind(this, null));
    }
  };

  GraphRenderer.prototype.fitToAll = function (options) {
    if (!this.dataset || !this.simulation || !this.svg) {
      return;
    }
    const settings = Object.assign({ animate: true }, options || {});
    const bounds = this.g.node() && this.g.node().getBBox ? this.g.node().getBBox() : null;
    if (!bounds || !isFinite(bounds.width) || !isFinite(bounds.height) || !bounds.width || !bounds.height) {
      return;
    }
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    const padding = this.options.fitPadding;
    const scale = Math.max(0.25, Math.min(1.8, 0.9 / Math.max(bounds.width / (width - padding), bounds.height / (height - padding))));
    const translateX = width / 2 - scale * (bounds.x + bounds.width / 2);
    const translateY = height / 2 - scale * (bounds.y + bounds.height / 2);
    const transform = d3.zoomIdentity.translate(translateX, translateY).scale(scale);
    this.currentTransform = transform;
    this.isProgrammaticZoom = true;
    if (settings.animate) {
      this.svg.transition().duration(280).call(this.zoomBehavior.transform, transform).on('end', this.clearProgrammaticZoom.bind(this));
      return;
    }
    this.svg.call(this.zoomBehavior.transform, transform);
    this.clearProgrammaticZoom();
  };

  GraphRenderer.prototype.clearProgrammaticZoom = function () {
    this.isProgrammaticZoom = false;
  };

  GraphRenderer.prototype.setFocus = function (focus) {
    this.focus = focus || null;
    if (!this.nodeElements || !this.edgeElements) {
      return;
    }
    if (!focus) {
      this.nodeElements.classed('is-dim', false);
      this.edgeElements.classed('is-dim', false);
      return;
    }
    const nodeIds = new Set(focus.nodeIds || []);
    const edgeIds = new Set(focus.edgeIds || []);
    this.nodeElements.classed('is-dim', function (node) {
      return !nodeIds.has(node.id);
    });
    this.edgeElements.classed('is-dim', function (edge) {
      return !edgeIds.has(edge.id);
    });
  };

  GraphRenderer.prototype.destroy = function () {
    window.clearTimeout(this.resizeTimer);
    if (this.boundHandleResize) {
      window.removeEventListener('resize', this.boundHandleResize);
      this.boundHandleResize = null;
    }
    if (this.simulation) {
      this.simulation.stop();
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
  };

  global.StaticGraphRenderer = {
    create: function (container, options) {
      return new GraphRenderer(container, options);
    },
    TYPE_STYLES: TYPE_STYLES
  };
})(window);
