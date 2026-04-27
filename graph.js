(function () {
  const session = window.MOCK_SESSION;

  const NODE_R_MAIN = 14;
  const NODE_R_TANGENT = 10;
  const ROW_H = 70;
  const COL_W = 110;

  const state = {
    nodeStates: {},
    selectedId: null,
    showPruned: false,
  };
  session.nodes.forEach(n => state.nodeStates[n.id] = 'active');

  const nodeById = {};
  const childrenMap = {};
  session.nodes.forEach(n => {
    nodeById[n.id] = n;
    if (n.parent_id) {
      if (!childrenMap[n.parent_id]) childrenMap[n.parent_id] = [];
      childrenMap[n.parent_id].push(n.id);
    }
  });

  function getDescendants(id) {
    const out = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      out.push(cur);
      (childrenMap[cur] || []).forEach(c => stack.push(c));
    }
    return out;
  }

  function isVisible(id) {
    const s = state.nodeStates[id];
    if (s === 'destructively_pruned') return state.showPruned;
    return true;
  }
  function isActive(id) { return state.nodeStates[id] === 'active'; }

  function computeBranchColumns() {
    const cols = { main: 0 };
    const branchParents = {};
    for (const n of session.nodes) {
      if (branchParents[n.branch] === undefined) {
        const p = n.parent_id ? nodeById[n.parent_id] : null;
        branchParents[n.branch] = p ? p.branch : null;
      }
    }
    let leftMax = 0, rightMax = 0;
    for (const n of session.nodes) {
      if (cols[n.branch] !== undefined) continue;
      const parentBranch = branchParents[n.branch];
      const parentCol = cols[parentBranch] != null ? cols[parentBranch] : 0;
      if (parentCol === 0) {
        if (Math.abs(leftMax) <= rightMax) { leftMax -= 1; cols[n.branch] = leftMax; }
        else { rightMax += 1; cols[n.branch] = rightMax; }
      } else if (parentCol < 0) {
        leftMax = Math.min(leftMax, parentCol - 1);
        cols[n.branch] = leftMax;
      } else {
        rightMax = Math.max(rightMax, parentCol + 1);
        cols[n.branch] = rightMax;
      }
    }
    return cols;
  }

  const branchCols = computeBranchColumns();
  // Layout in graph-space (zoom/pan handles screen mapping)
  session.nodes.forEach((n, i) => {
    n._row = i;
    n._col = branchCols[n.branch];
    n._x = n._col * COL_W;
    n._y = n._row * ROW_H;
  });

  function computeSecondaryEdges() {
    const edges = [];
    const byTag = {};
    for (const n of session.nodes) {
      if (!byTag[n.tag]) byTag[n.tag] = [];
      byTag[n.tag].push(n);
    }
    for (const tag in byTag) {
      const arr = byTag[tag];
      for (let i = 0; i < arr.length - 1; i++) {
        const a = arr[i], b = arr[i + 1];
        if (b.parent_id === a.id || a.parent_id === b.id) continue;
        edges.push({ source: a, target: b, tag });
      }
    }
    return edges;
  }
  const secondaryEdges = computeSecondaryEdges();

  document.getElementById('objective-text').textContent = session.objective;

  function renderLegend() {
    const list = document.getElementById('legend-list');
    list.innerHTML = '';
    const counts = {};
    session.nodes.forEach(n => counts[n.tag] = (counts[n.tag] || 0) + 1);
    for (const tag in session.tags) {
      const cfg = session.tags[tag];
      const li = document.createElement('li');
      const sw = document.createElement('span');
      sw.className = 'legend-swatch';
      sw.style.background = cfg.color;
      const lbl = document.createElement('span');
      lbl.textContent = cfg.label || tag;
      const cnt = document.createElement('span');
      cnt.className = 'legend-count';
      const c = counts[tag] || 0;
      cnt.textContent = c + (c === 1 ? ' node' : ' nodes');
      li.appendChild(sw); li.appendChild(lbl); li.appendChild(cnt);
      list.appendChild(li);
    }
  }

  function updateStats() {
    let active = 0, soft = 0, destructive = 0;
    Object.values(state.nodeStates).forEach(s => {
      if (s === 'active') active++;
      else if (s === 'soft_pruned') soft++;
      else if (s === 'destructively_pruned') destructive++;
    });
    document.getElementById('stat-total').textContent = session.nodes.length;
    document.getElementById('stat-active').textContent = active;
    document.getElementById('stat-soft').textContent = soft;
    document.getElementById('stat-destructive').textContent = destructive;
  }

  function updateScore() {
    const activeNodes = session.nodes.filter(n => isActive(n.id));
    const avg = activeNodes.length
      ? activeNodes.reduce((s, n) => s + n.relevance, 0) / activeNodes.length
      : 0;
    const rot = Math.round((1 - avg) * 100);
    const level = rot < 25 ? 'low' : rot < 55 ? 'mid' : 'high';
    const valueEl = document.getElementById('rotten-value');
    const fillEl = document.getElementById('rotten-bar-fill');
    valueEl.textContent = rot + '%';
    valueEl.dataset.level = level;
    fillEl.style.width = rot + '%';
    fillEl.dataset.level = level;
  }

  // ============ SVG / Zoom ============
  const svg = d3.select('#graph-svg');
  let zoomLayer, gPrimary, gSecondary, gNodes;
  let zoom;

  function initSvg() {
    svg.selectAll('*').remove();
    zoomLayer = svg.append('g').attr('class', 'zoom-layer');
    gSecondary = zoomLayer.append('g').attr('class', 'edges-secondary');
    gPrimary = zoomLayer.append('g').attr('class', 'edges-primary');
    gNodes = zoomLayer.append('g').attr('class', 'nodes');

    zoom = d3.zoom()
      .scaleExtent([0.3, 3])
      .filter(event => !event.button && event.type !== 'dblclick')
      .on('zoom', event => zoomLayer.attr('transform', event.transform));
    svg.call(zoom).on('dblclick.zoom', null);
  }

  function resizeSvg() {
    const wrapper = document.getElementById('canvas-wrapper');
    svg.attr('width', wrapper.clientWidth).attr('height', wrapper.clientHeight);
  }

  function fitToContent(animate) {
    const wrapper = document.getElementById('canvas-wrapper');
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;
    if (!w || !h) return;
    const padding = 60;
    const xs = session.nodes.map(n => n._x);
    const ys = session.nodes.map(n => n._y);
    const minX = Math.min.apply(null, xs) - padding;
    const maxX = Math.max.apply(null, xs) + padding;
    const minY = Math.min.apply(null, ys) - padding;
    const maxY = Math.max.apply(null, ys) + padding;
    const scale = Math.min(w / (maxX - minX), h / (maxY - minY), 1.5);
    const tx = w / 2 - (minX + maxX) / 2 * scale;
    const ty = h / 2 - (minY + maxY) / 2 * scale;
    const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
    if (animate) svg.transition().duration(450).call(zoom.transform, t);
    else svg.call(zoom.transform, t);
  }

  function primaryPathD(s, t) {
    if (s._x === t._x) return `M${s._x},${s._y} L${t._x},${t._y}`;
    return `M${s._x},${s._y} C${s._x},${(s._y + t._y) / 2} ${t._x},${(s._y + t._y) / 2} ${t._x},${t._y}`;
  }
  function secondaryPathD(e) {
    const s = e.source, t = e.target;
    const dx = t._x - s._x, dy = t._y - s._y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const sign = (s._col + t._col) <= 0 ? -1 : 1;
    const bow = sign * Math.min(90, dist * 0.45);
    const midX = (s._x + t._x) / 2 + bow;
    const midY = (s._y + t._y) / 2;
    return `M${s._x},${s._y} Q${midX},${midY} ${t._x},${t._y}`;
  }

  function render() {
    const primaryData = session.nodes
      .filter(n => n.parent_id)
      .map(n => ({ source: nodeById[n.parent_id], target: n, id: n.parent_id + '->' + n.id }))
      .filter(e => isVisible(e.source.id) && isVisible(e.target.id));

    const pSel = gPrimary.selectAll('path').data(primaryData, d => d.id);
    pSel.exit().remove();
    pSel.enter().append('path').merge(pSel)
      .attr('class', d => {
        const cls = ['edge-primary'];
        const ss = state.nodeStates[d.source.id];
        const ts = state.nodeStates[d.target.id];
        if (ss === 'destructively_pruned' || ts === 'destructively_pruned') cls.push('ghost');
        else if (ss === 'soft_pruned' || ts === 'soft_pruned') cls.push('soft');
        return cls.join(' ');
      })
      .attr('d', d => primaryPathD(d.source, d.target));

    const secData = secondaryEdges.filter(e => isActive(e.source.id) && isActive(e.target.id));
    const sSel = gSecondary.selectAll('path').data(secData, d => d.source.id + '~' + d.target.id);
    sSel.exit().remove();
    sSel.enter().append('path').merge(sSel)
      .attr('class', 'edge-secondary')
      .attr('stroke', d => session.tags[d.tag].color)
      .attr('d', d => secondaryPathD(d));

    const visibleNodes = session.nodes.filter(n => isVisible(n.id));
    const nSel = gNodes.selectAll('g.node-group').data(visibleNodes, d => d.id);
    nSel.exit().remove();

    const nEnter = nSel.enter().append('g');
    nEnter.append('circle').attr('class', 'node-circle');
    nEnter.append('text').attr('class', 'node-label');
    nEnter.append('text').attr('class', 'oos-badge').text('OUT OF SCOPE');

    const nMerge = nEnter.merge(nSel);
    nMerge.attr('transform', d => `translate(${d._x},${d._y})`);
    nMerge.attr('class', d => {
      const cls = ['node-group'];
      const s = state.nodeStates[d.id];
      if (s === 'soft_pruned') cls.push('node-soft');
      if (s === 'destructively_pruned') cls.push('node-ghost');
      return cls.join(' ');
    });

    nMerge.select('.node-circle')
      .attr('class', d => {
        const cls = ['node-circle'];
        cls.push(d.is_main_path ? 'main-path' : 'tangent');
        if (d.id === state.selectedId) cls.push('selected');
        return cls.join(' ');
      })
      .attr('r', d => d.is_main_path ? NODE_R_MAIN : NODE_R_TANGENT)
      .attr('fill', d => state.nodeStates[d.id] === 'destructively_pruned' ? 'transparent' : session.tags[d.tag].color);

    nMerge.select('.node-label')
      .attr('y', d => (d.is_main_path ? NODE_R_MAIN : NODE_R_TANGENT) + 14)
      .attr('text-anchor', 'middle')
      .text(d => d.id);

    nMerge.select('.oos-badge')
      .attr('y', d => -(d.is_main_path ? NODE_R_MAIN : NODE_R_TANGENT) - 6)
      .attr('text-anchor', 'middle')
      .style('display', d => state.nodeStates[d.id] === 'soft_pruned' ? null : 'none');

    nMerge
      .on('mouseenter', (ev, d) => { showTooltip(ev, d); highlightSubtree(d.id); })
      .on('mousemove', moveTooltip)
      .on('mouseleave', () => { hideTooltip(); clearHighlight(); })
      .on('click', (ev, d) => { ev.stopPropagation(); selectNode(d.id); });
  }

  function highlightSubtree(rootId) {
    const ids = new Set(getDescendants(rootId));
    gNodes.selectAll('g.node-group').classed('subtree-hover', d => ids.has(d.id));
    gPrimary.selectAll('path').classed('subtree-hover', d => ids.has(d.source.id) && ids.has(d.target.id));
  }
  function clearHighlight() {
    gNodes.selectAll('g.node-group.subtree-hover').classed('subtree-hover', false);
    gPrimary.selectAll('path.subtree-hover').classed('subtree-hover', false);
  }

  const tooltip = document.getElementById('tooltip');
  function showTooltip(ev, d) {
    const cfg = session.tags[d.tag];
    const txt = d.content_user.length > 90 ? d.content_user.slice(0, 90) + '…' : d.content_user;
    tooltip.innerHTML = `<div class="tooltip-tag" style="color:${cfg.color}">${cfg.label || d.tag} · ${d.id}</div><div>${txt}</div>`;
    tooltip.classList.remove('hidden');
    moveTooltip(ev);
  }
  function moveTooltip(ev) {
    const wrapper = document.getElementById('canvas-wrapper');
    const rect = wrapper.getBoundingClientRect();
    let x = ev.clientX - rect.left + 14;
    let y = ev.clientY - rect.top + 14;
    if (x + 280 > rect.width) x = ev.clientX - rect.left - 280;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }
  function hideTooltip() { tooltip.classList.add('hidden'); }

  function selectNode(id) { state.selectedId = id; renderDetail(); render(); }
  function deselect() {
    state.selectedId = null;
    document.getElementById('panel-default').classList.remove('hidden');
    document.getElementById('panel-detail').classList.add('hidden');
    render();
  }

  function renderDetail() {
    const n = nodeById[state.selectedId];
    if (!n) return deselect();
    document.getElementById('panel-default').classList.add('hidden');
    document.getElementById('panel-detail').classList.remove('hidden');
    const cfg = session.tags[n.tag];
    const tagBadge = document.getElementById('detail-tag');
    tagBadge.textContent = cfg.label || n.tag;
    tagBadge.style.background = cfg.color + '33';
    tagBadge.style.color = cfg.color;
    tagBadge.style.borderLeft = `3px solid ${cfg.color}`;
    document.getElementById('detail-branch').textContent =
      `branch: ${n.branch}${n.is_main_path ? ' · main path' : ''} · ${n.id}`;
    document.getElementById('detail-relevance-num').textContent = Math.round(n.relevance * 100) + '%';
    document.getElementById('detail-relevance-fill').style.width = (n.relevance * 100) + '%';
    document.getElementById('detail-user').textContent = n.content_user;
    document.getElementById('detail-assistant').textContent = n.content_assistant;
    const descendants = getDescendants(n.id);
    document.getElementById('detail-affected').textContent = descendants.length;
    const cur = state.nodeStates[n.id];
    document.getElementById('btn-prune-destructive').disabled = cur === 'destructively_pruned';
    document.getElementById('btn-prune-soft').disabled = cur === 'soft_pruned';
    document.getElementById('btn-restore').disabled = cur === 'active';
  }

  function applyPruning(rootId, newState) {
    const ids = getDescendants(rootId);
    ids.forEach(id => state.nodeStates[id] = newState);
    updateStats(); updateScore(); renderDetail(); render();
  }

  document.getElementById('btn-prune-destructive').addEventListener('click', () => {
    if (state.selectedId) applyPruning(state.selectedId, 'destructively_pruned');
  });
  document.getElementById('btn-prune-soft').addEventListener('click', () => {
    if (state.selectedId) applyPruning(state.selectedId, 'soft_pruned');
  });
  document.getElementById('btn-restore').addEventListener('click', () => {
    if (state.selectedId) applyPruning(state.selectedId, 'active');
  });
  document.getElementById('toggle-show-pruned').addEventListener('change', e => {
    state.showPruned = e.target.checked;
    render();
  });
  document.getElementById('btn-fit-view').addEventListener('click', () => fitToContent(true));

  svg.on('click', function (event) { if (event.target === svg.node()) deselect(); });
  window.addEventListener('resize', () => resizeSvg());

  initSvg();
  resizeSvg();
  renderLegend();
  updateStats();
  updateScore();
  render();
  requestAnimationFrame(() => fitToContent(false));
})();
