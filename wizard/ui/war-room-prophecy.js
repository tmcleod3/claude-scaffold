/**
 * Prophecy Visualizer — interactive SVG dependency graph for campaign missions.
 *
 * Reads campaign data from /api/war-room/campaign and renders a node/edge graph.
 * Nodes = missions. Edges = dependency order. Color = status.
 * Clickable nodes show mission details.
 */
(function () {
  'use strict';

  // ── Constants ─────────────────────────────────

  var NODE_RADIUS = 24;
  var NODE_SPACING_X = 120;
  var NODE_SPACING_Y = 80;
  var PADDING = 40;

  var STATUS_COLORS = {
    COMPLETE: '#34d399',
    ACTIVE: '#fbbf24',
    BLOCKED: '#ef4444',
    PENDING: '#555',
    STRUCTURAL: '#6366f1'
  };

  var STATUS_LABELS = {
    COMPLETE: 'Complete',
    ACTIVE: 'In Progress',
    BLOCKED: 'Blocked',
    PENDING: 'Pending',
    STRUCTURAL: 'Structural'
  };

  // ── SVG helpers ───────────────────────────────

  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      for (var key in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, key)) {
          el.setAttribute(key, attrs[key]);
        }
      }
    }
    return el;
  }

  function escapeText(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ── Layout ────────────────────────────────────

  function layoutNodes(missions) {
    // Simple left-to-right grid layout
    var cols = Math.ceil(Math.sqrt(missions.length));
    return missions.map(function (m, i) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      return {
        mission: m,
        x: PADDING + col * NODE_SPACING_X + NODE_RADIUS,
        y: PADDING + row * NODE_SPACING_Y + NODE_RADIUS
      };
    });
  }

  // ── Rendering ─────────────────────────────────

  function renderGraph(container, campaignData) {
    container.innerHTML = '';

    if (!campaignData || !campaignData.missions || campaignData.missions.length === 0) {
      container.innerHTML = '<div style="padding:20px;color:var(--text-dim);font-size:13px;">No campaign data — run /campaign to see the prophecy graph.</div>';
      return;
    }

    var nodes = layoutNodes(campaignData.missions);
    var cols = Math.ceil(Math.sqrt(campaignData.missions.length));
    var rows = Math.ceil(campaignData.missions.length / cols);
    var svgWidth = PADDING * 2 + cols * NODE_SPACING_X;
    var svgHeight = PADDING * 2 + rows * NODE_SPACING_Y;

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + svgWidth + ' ' + svgHeight,
      width: '100%',
      height: Math.min(svgHeight, 400) + 'px',
      role: 'img',
      'aria-label': 'Campaign mission dependency graph'
    });

    // Draw edges (sequential dependency: mission N → mission N+1)
    for (var i = 0; i < nodes.length - 1; i++) {
      var from = nodes[i];
      var to = nodes[i + 1];
      var line = svgEl('line', {
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        stroke: '#444',
        'stroke-width': '2',
        'stroke-dasharray': '4,4'
      });
      svg.appendChild(line);
    }

    // Draw nodes
    nodes.forEach(function (node) {
      var m = node.mission;
      var color = STATUS_COLORS[m.status] || STATUS_COLORS.PENDING;
      var label = STATUS_LABELS[m.status] || m.status;

      // Node group
      var g = svgEl('g', {
        'data-mission': m.number,
        style: 'cursor:pointer',
        role: 'button',
        tabindex: '0',
        'aria-label': 'Mission ' + m.number + ': ' + escapeText(m.name) + ' — ' + label
      });

      // Circle
      var circle = svgEl('circle', {
        cx: node.x,
        cy: node.y,
        r: NODE_RADIUS,
        fill: color,
        opacity: '0.2',
        stroke: color,
        'stroke-width': '2'
      });
      g.appendChild(circle);

      // Mission number
      var text = svgEl('text', {
        x: node.x,
        y: node.y + 1,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        fill: color,
        'font-size': '14',
        'font-weight': '700'
      });
      text.textContent = m.number;
      g.appendChild(text);

      // Mission name label (below node)
      var nameText = svgEl('text', {
        x: node.x,
        y: node.y + NODE_RADIUS + 14,
        'text-anchor': 'middle',
        fill: '#999',
        'font-size': '9'
      });
      // Truncate long names
      var displayName = m.name.length > 18 ? m.name.substring(0, 16) + '…' : m.name;
      nameText.textContent = displayName;
      g.appendChild(nameText);

      // Status dot
      var statusDot = svgEl('circle', {
        cx: node.x + NODE_RADIUS - 4,
        cy: node.y - NODE_RADIUS + 4,
        r: '4',
        fill: color
      });
      g.appendChild(statusDot);

      // Click handler — show details in the detail panel
      g.addEventListener('click', function () { showDetail(m); });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDetail(m); }
      });

      svg.appendChild(g);
    });

    container.appendChild(svg);

    // Legend
    var legend = document.createElement('div');
    legend.style.cssText = 'display:flex;gap:12px;margin-top:8px;font-size:10px;color:var(--text-dim);flex-wrap:wrap;';
    Object.keys(STATUS_COLORS).forEach(function (status) {
      var item = document.createElement('span');
      item.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' +
        STATUS_COLORS[status] + ';margin-right:4px;vertical-align:middle;"></span>' +
        (STATUS_LABELS[status] || status);
      legend.appendChild(item);
    });
    container.appendChild(legend);
  }

  // ── Detail panel ──────────────────────────────

  function showDetail(mission) {
    var panel = document.getElementById('prophecy-detail');
    if (!panel) return;
    var color = STATUS_COLORS[mission.status] || STATUS_COLORS.PENDING;
    var label = STATUS_LABELS[mission.status] || mission.status;
    panel.innerHTML =
      '<div style="font-weight:700;color:' + color + ';">Mission ' + mission.number + '</div>' +
      '<div style="margin:4px 0;font-size:13px;">' + escapeText(mission.name) + '</div>' +
      '<div style="font-size:11px;color:var(--text-dim);">Status: ' + label + '</div>';
  }

  // ── Init ──────────────────────────────────────

  // Expose render function for the main war-room.js to call
  window.renderProphecyGraph = renderGraph;
})();
