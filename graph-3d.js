(function (global) {
  function getTypeStyles() {
    return (global.StaticGraphRenderer && global.StaticGraphRenderer.TYPE_STYLES) || {
      entity: { fill: '#eef2ff', stroke: '#a5b4fc', label: '实体' },
      topic: { fill: '#fae8ff', stroke: '#e879f9', label: '知识' }
    };
  }

  function getTypeStyle(node) {
    const styles = getTypeStyles();
    return styles[node && node.type] || styles.entity;
  }

  function truncateLabel(label, maxLength) {
    const text = String(label || '');
    if (!text) {
      return '';
    }
    if (typeof AnalysisUtils === 'object' && typeof AnalysisUtils.isSentenceLikeLabel === 'function' && AnalysisUtils.isSentenceLikeLabel(text)) {
      return '';
    }
    const limit = maxLength || 14;
    return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
  }

  function Graph3DRenderer(container, options) {
    this.container = container;
    this.options = Object.assign({
      compact: false,
      showEdgeLabels: false,
      background: '#f8fafc'
    }, options || {});
    this.graph = null;
    this.dataset = null;
    this.stage = null;
    this.legend = null;
    this.emptyState = null;
    this.caption = null;
    this.labelLayer = null;
    this.nodeLabelEls = new Map();
    this.edgeLabelEls = new Map();
    this.labelRaf = 0;
    this.resizeTimer = 0;
    this.boundHandleResize = null;
    this.boundTickLabels = this.tickOverlayLabels.bind(this);
    this.setup();
  }

  Graph3DRenderer.prototype.setup = function () {
    if (!this.container) {
      return;
    }

    this.container.innerHTML = '';
    this.container.classList.add('graph-3d-root');

    this.stage = document.createElement('div');
    this.stage.className = 'graph-3d-stage';
    this.container.appendChild(this.stage);

    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'graph-3d-labels';
    this.container.appendChild(this.labelLayer);

    this.caption = document.createElement('div');
    this.caption.className = 'graph-3d-caption';
    this.caption.textContent = '拖转旋转 · 滚轮缩放';
    this.container.appendChild(this.caption);

    this.emptyState = document.createElement('div');
    this.emptyState.className = 'dynamic-graph-empty hidden';
    this.emptyState.textContent = '当前图谱暂无可展示的数据。';
    this.container.appendChild(this.emptyState);

    this.legend = document.createElement('div');
    this.legend.className = 'dynamic-graph-legend hidden';
    this.container.appendChild(this.legend);

    this.boundHandleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.boundHandleResize);
  };

  Graph3DRenderer.prototype.handleResize = function () {
    const self = this;
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(function () {
      self.syncSize();
    }, 160);
  };

  Graph3DRenderer.prototype.syncSize = function () {
    if (!this.graph || !this.container) {
      return;
    }
    const width = Math.max(280, this.container.clientWidth || 320);
    const height = Math.max(this.options.compact ? 240 : 420, this.container.clientHeight || (this.options.compact ? 280 : 620));
    this.graph.width(width).height(height);
    this.syncOverlayLabels();
  };

  Graph3DRenderer.prototype.prepareData = function (dataset) {
    if (global.StaticGraphRenderer && typeof global.StaticGraphRenderer.prepareData === 'function') {
      return global.StaticGraphRenderer.prepareData(dataset);
    }
    return { nodes: [], edges: [] };
  };

  Graph3DRenderer.prototype.toGraphData = function (prepared) {
    return {
      nodes: (prepared.nodes || []).map(function (node) {
        const style = getTypeStyle(node);
        return {
          id: node.id,
          name: node.label,
          label: node.label,
          type: node.type,
          color: style.stroke,
          fill: style.fill
        };
      }),
      links: (prepared.edges || []).map(function (edge) {
        return {
          id: edge.id,
          source: edge.source && edge.source.id ? edge.source.id : edge.source,
          target: edge.target && edge.target.id ? edge.target.id : edge.target,
          label: edge.label || '',
          weight: edge.weight || 1
        };
      })
    };
  };

  Graph3DRenderer.prototype.ensureGraph = function () {
    if (this.graph || !this.container) {
      return this.graph;
    }
    if (typeof ForceGraph3D !== 'function') {
      this.emptyState.classList.remove('hidden');
      this.emptyState.textContent = '缺少 3D 图谱依赖。';
      return null;
    }

    const self = this;
    const create = ForceGraph3D({
      controlType: 'orbit',
      rendererConfig: { antialias: true, alpha: true }
    });
    this.graph = create(this.stage)
      .backgroundColor(this.options.background)
      .showNavInfo(false)
      .nodeId('id')
      .nodeLabel(function (node) {
        const full = node.label || node.name || '';
        const shown = truncateLabel(full, self.options.compact ? 10 : 14);
        return shown && shown !== full ? full : '';
      })
      .nodeColor(function (node) { return node.color; })
      .nodeRelSize(this.options.compact ? 5 : 6.4)
      .nodeOpacity(0.94)
      .linkLabel(function (link) { return link.label || ''; })
      .linkColor(function () { return '#64748b'; })
      .linkWidth(function (link) { return Math.max(0.35, Math.min(2.4, 0.35 + Number(link.weight || 1) * 0.28)); })
      .linkOpacity(0.7)
      .linkDirectionalArrowLength(2.8)
      .linkDirectionalArrowRelPos(0.92)
      .cooldownTicks(90)
      .onNodeHover(function (node) {
        if (!self.caption) {
          return;
        }
        self.caption.textContent = node && node.label
          ? node.label
          : '拖转旋转 · 滚轮缩放';
      })
      .onEngineTick(function () {
        self.syncOverlayLabels();
      })
      .onEngineStop(function () {
        self.fitToAll({ animate: false });
        self.syncOverlayLabels();
      });

    this.startLabelLoop();
    this.syncSize();
    return this.graph;
  };

  Graph3DRenderer.prototype.edgeKey = function (link) {
    if (link && link.id) {
      return link.id;
    }
    const source = link && link.source && link.source.id ? link.source.id : link.source;
    const target = link && link.target && link.target.id ? link.target.id : link.target;
    return String(source || '') + '->' + String(target || '');
  };

  Graph3DRenderer.prototype.rebuildOverlayLabels = function () {
    if (!this.labelLayer || !this.graph) {
      return;
    }
    this.labelLayer.innerHTML = '';
    this.nodeLabelEls = new Map();
    this.edgeLabelEls = new Map();
    const data = this.graph.graphData() || { nodes: [], links: [] };
    const compact = this.options.compact;
    (data.nodes || []).forEach(function (node) {
      const text = truncateLabel(node.label || node.name, compact ? 10 : 14);
      if (!text) {
        return;
      }
      const el = document.createElement('span');
      el.className = 'graph-3d-node-label';
      el.textContent = text;
      el.style.borderColor = node.color || '#93c5fd';
      this.labelLayer.appendChild(el);
      this.nodeLabelEls.set(node.id, el);
    }, this);
    this.rebuildEdgeOverlayLabels();
    this.syncOverlayLabels();
  };

  Graph3DRenderer.prototype.rebuildEdgeOverlayLabels = function () {
    if (!this.labelLayer) {
      return;
    }
    this.edgeLabelEls.forEach(function (el) {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    this.edgeLabelEls = new Map();
    if (!this.options.showEdgeLabels || !this.graph) {
      return;
    }
    const data = this.graph.graphData() || { nodes: [], links: [] };
    const self = this;
    (data.links || []).forEach(function (link) {
      if (!link.label) {
        return;
      }
      const el = document.createElement('span');
      el.className = 'graph-3d-edge-label';
      el.textContent = link.label;
      self.labelLayer.appendChild(el);
      self.edgeLabelEls.set(self.edgeKey(link), el);
    });
  };

  Graph3DRenderer.prototype.projectPoint = function (x, y, z) {
    if (!this.graph || typeof this.graph.graph2ScreenCoords !== 'function' || x == null || y == null || z == null) {
      return null;
    }
    return this.graph.graph2ScreenCoords(x, y, z);
  };

  Graph3DRenderer.prototype.isOnScreen = function (pos) {
    if (!pos || !this.graph) {
      return false;
    }
    const width = this.graph.width();
    const height = this.graph.height();
    return pos.x >= -70 && pos.y >= -28 && pos.x <= width + 70 && pos.y <= height + 28;
  };

  Graph3DRenderer.prototype.syncOverlayLabels = function () {
    if (!this.graph || !this.labelLayer) {
      return;
    }
    const data = this.graph.graphData() || { nodes: [], links: [] };
    const self = this;
    (data.nodes || []).forEach(function (node) {
      const el = self.nodeLabelEls.get(node.id);
      if (!el) {
        return;
      }
      const pos = self.projectPoint(node.x, node.y, node.z);
      if (!self.isOnScreen(pos)) {
        el.style.display = 'none';
        return;
      }
      el.style.display = 'block';
      el.style.transform = 'translate(' + Math.round(pos.x + 8) + 'px,' + Math.round(pos.y - 8) + 'px)';
    });
    if (!this.options.showEdgeLabels) {
      return;
    }
    (data.links || []).forEach(function (link) {
      const el = self.edgeLabelEls.get(self.edgeKey(link));
      if (!el) {
        return;
      }
      const source = typeof link.source === 'object' ? link.source : null;
      const target = typeof link.target === 'object' ? link.target : null;
      if (!source || !target) {
        el.style.display = 'none';
        return;
      }
      const pos = self.projectPoint(
        (source.x + target.x) / 2,
        (source.y + target.y) / 2,
        (source.z + target.z) / 2
      );
      if (!self.isOnScreen(pos)) {
        el.style.display = 'none';
        return;
      }
      el.style.display = 'block';
      el.style.transform = 'translate(' + Math.round(pos.x) + 'px,' + Math.round(pos.y) + 'px) translate(-50%,-50%)';
    });
  };

  Graph3DRenderer.prototype.startLabelLoop = function () {
    if (this.labelRaf) {
      return;
    }
    this.tickOverlayLabels();
  };

  Graph3DRenderer.prototype.stopLabelLoop = function () {
    if (this.labelRaf) {
      window.cancelAnimationFrame(this.labelRaf);
      this.labelRaf = 0;
    }
  };

  Graph3DRenderer.prototype.tickOverlayLabels = function () {
    this.syncOverlayLabels();
    if (this.graph) {
      this.labelRaf = window.requestAnimationFrame(this.boundTickLabels);
    } else {
      this.labelRaf = 0;
    }
  };

  Graph3DRenderer.prototype.applyLinkLabels = function () {
    this.rebuildEdgeOverlayLabels();
    this.syncOverlayLabels();
  };

  Graph3DRenderer.prototype.renderLegend = function (nodes) {
    const styles = getTypeStyles();
    const seen = [];
    const used = new Set();
    (nodes || []).forEach(function (node) {
      if (used.has(node.type)) {
        return;
      }
      used.add(node.type);
      seen.push(node.type);
    });
    if (!seen.length) {
      this.legend.classList.add('hidden');
      return;
    }
    this.legend.classList.remove('hidden');
    this.legend.innerHTML = seen.map(function (type) {
      const style = styles[type] || styles.entity;
      return [
        '<span class="dynamic-graph-legend-item">',
        '<span class="dynamic-graph-legend-dot" style="background:',
        style.fill,
        ';border-color:',
        style.stroke,
        '"></span>',
        style.label || type,
        '</span>'
      ].join('');
    }).join('');
  };

  Graph3DRenderer.prototype.render = function (dataset) {
    this.dataset = dataset || { nodes: [], edges: [] };
    const prepared = this.prepareData(this.dataset);
    if (!prepared.nodes.length) {
      if (this.graph && typeof this.graph.pauseAnimation === 'function') {
        this.graph.pauseAnimation();
      }
      this.emptyState.classList.remove('hidden');
      this.legend.classList.add('hidden');
      return;
    }
    this.emptyState.classList.add('hidden');
    this.renderLegend(prepared.nodes);
    if (!this.ensureGraph()) {
      return;
    }
    this.graph.graphData(this.toGraphData(prepared));
    this.rebuildOverlayLabels();
    this.startLabelLoop();
    this.syncSize();
  };

  Graph3DRenderer.prototype.setEdgeLabelsVisible = function (visible) {
    this.options.showEdgeLabels = !!visible;
    this.applyLinkLabels();
  };

  Graph3DRenderer.prototype.syncEdgeLabelVisibility = function () {
    this.applyLinkLabels();
  };

  Graph3DRenderer.prototype.fitToAll = function (options) {
    if (!this.graph || typeof this.graph.zoomToFit !== 'function') {
      return;
    }
    const settings = Object.assign({ animate: true }, options || {});
    this.graph.zoomToFit(settings.animate ? 380 : 0, this.options.compact ? 28 : 48);
  };

  Graph3DRenderer.prototype.setFocus = function () {
    return;
  };

  Graph3DRenderer.prototype.destroy = function () {
    window.clearTimeout(this.resizeTimer);
    if (this.boundHandleResize) {
      window.removeEventListener('resize', this.boundHandleResize);
      this.boundHandleResize = null;
    }
    this.stopLabelLoop();
    this.nodeLabelEls = new Map();
    this.edgeLabelEls = new Map();
    if (this.graph) {
      if (typeof this.graph.pauseAnimation === 'function') {
        this.graph.pauseAnimation();
      }
      if (typeof this.graph._destructor === 'function') {
        this.graph._destructor();
      }
      this.graph = null;
    }
    if (this.container) {
      this.container.innerHTML = '';
      this.container.classList.remove('graph-3d-root');
    }
  };

  global.StaticGraph3DRenderer = {
    create: function (container, options) {
      return new Graph3DRenderer(container, options);
    },
    isAvailable: function () {
      return typeof ForceGraph3D === 'function';
    }
  };
})(window);
