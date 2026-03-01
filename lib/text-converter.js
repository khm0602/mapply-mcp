// 마인드맵 노드 데이터 ↔ 트리 텍스트 변환

// --- 노드 → 트리 텍스트 ---

export function nodesToTree(data) {
  const nodes = data?.nodes;
  if (!nodes || Object.keys(nodes).length === 0) return '';

  const rootNode = Object.values(nodes).find(n => n.isRoot || !n.parent);
  if (!rootNode) return '';

  const result = [];

  function walk(node, depth) {
    const indent = '  '.repeat(depth);
    const text = node.displayText || node.text || '';
    result.push(indent + text);

    if (node.children?.length) {
      for (const cid of node.children) {
        const child = nodes[String(cid)];
        if (child) walk(child, depth + 1);
      }
    }
  }

  walk(rootNode, 0);
  return result.join('\n');
}

// --- 트리 텍스트 → 노드 ---

export function treeToNodes(text, layoutType = 'vertical') {
  const lines = text.split('\n').filter(l => l.trim());
  if (!lines.length) throw new Error('텍스트가 비어있습니다.');
  if (lines.length > 500) throw new Error('최대 500줄까지 지원됩니다.');

  // 파싱: 들여쓰기 기반 트리 구조 생성
  const root = parseLines(lines);
  if (!root) throw new Error('텍스트 구조를 파싱할 수 없습니다.');

  // 마인드맵 데이터로 변환
  return structureToMindmapData(root, layoutType);
}

function parseLines(lines) {
  const stack = [];
  let root = null;

  for (const line of lines) {
    const text = line.replace(/^\s+/, '');
    if (!text) continue;

    const leadingSpaces = line.length - text.length;
    // 탭 또는 2-space 들여쓰기 지원
    const indentLevel = line.startsWith('\t')
      ? (line.match(/^\t*/)[0] || '').length
      : Math.floor(leadingSpaces / 2);

    const node = { title: text, children: [] };

    if (indentLevel < stack.length) {
      stack.length = indentLevel;
    }

    if (indentLevel === 0) {
      if (!root) {
        root = node;
        stack[0] = node;
      } else {
        // 루트 레벨 형제 → 첫 루트의 자식으로 처리
        root.children.push(node);
        stack[0] = node;
      }
    } else if (stack[indentLevel - 1]) {
      stack[indentLevel - 1].children.push(node);
      stack[indentLevel] = node;
    }
  }

  return root;
}

// 색상 팔레트 (Mapply 기본)
const COLORS = [
  '#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#84cc16', '#f97316', '#0ea5e9', '#22c55e', '#14b8a6',
];

function structureToMindmapData(root, layoutType) {
  let nodeIdCounter = 1;
  const nodes = {};
  const connections = [];
  const hierarchy = []; // { nodeInfo, parent, level }

  const startX = 500;
  const startY = 400;

  // 1단계: 트리를 flat 목록으로 변환
  function collect(item, parentInfo, level) {
    const info = { item, parentInfo, level, children: [] };
    hierarchy.push(info);
    if (parentInfo) parentInfo.children.push(info);
    for (const child of item.children) {
      collect(child, info, level + 1);
    }
    return info;
  }

  const rootInfo = collect(root, null, 0);

  // 2단계: 레벨별 카운트 및 하위 리프 수 계산
  function leafCount(info) {
    if (!info.children.length) return 1;
    let sum = 0;
    for (const c of info.children) sum += leafCount(c);
    return sum;
  }

  // 3단계: 위치 계산
  if (layoutType === 'horizontal') {
    assignHorizontalPositions(rootInfo, startX, startY);
  } else {
    assignVerticalPositions(rootInfo, startX, startY);
  }

  function assignVerticalPositions(info, cx, baseY) {
    // 리프 기반 위치 할당
    const spacing = 130;
    const levelGap = 100;
    let cursor = { x: cx - (leafCount(info) - 1) * spacing / 2 };

    function assign(item, y) {
      if (!item.children.length) {
        item.x = cursor.x;
        item.y = y;
        cursor.x += spacing;
      } else {
        const childY = y + levelGap;
        for (const c of item.children) assign(c, childY);
        // 부모 = 자식 평균
        const xs = item.children.map(c => c.x);
        item.x = (Math.min(...xs) + Math.max(...xs)) / 2;
        item.y = y;
      }
    }

    assign(info, baseY);
  }

  function assignHorizontalPositions(info, baseX, cy) {
    const spacing = 70;
    const levelGap = 160;
    let cursor = { y: cy - (leafCount(info) - 1) * spacing / 2 };

    function assign(item, x) {
      if (!item.children.length) {
        item.x = x;
        item.y = cursor.y;
        cursor.y += spacing;
      } else {
        const childX = x + levelGap;
        for (const c of item.children) assign(c, childX);
        const ys = item.children.map(c => c.y);
        item.x = x;
        item.y = (Math.min(...ys) + Math.max(...ys)) / 2;
      }
    }

    assign(info, baseX);
  }

  // 4단계: 노드 생성
  function createNodes(info) {
    const id = nodeIdCounter++;
    info.nodeId = id;
    const { item, level } = info;
    const textLen = item.title.length;

    let width, height, fontSize;
    if (level === 0) {
      width = Math.max(112, Math.min(textLen * 10 + 40, 300));
      height = 52;
      fontSize = 16;
    } else {
      width = Math.max(80, Math.min(textLen * 8 + 30, 280));
      height = 46;
      fontSize = 12;
    }

    let color;
    if (level === 0) {
      color = '#3b82f6';
    } else if (level === 1) {
      const idx = info.parentInfo.children.indexOf(info);
      color = COLORS[idx % COLORS.length];
    } else {
      // 가장 가까운 레벨1 조상의 색상 사용
      let ancestor = info;
      while (ancestor.parentInfo?.level >= 1) ancestor = ancestor.parentInfo;
      color = nodes[ancestor.nodeId]?.color || '#3b82f6';
    }

    nodes[String(id)] = {
      id,
      x: Math.round(info.x),
      y: Math.round(info.y),
      width,
      height,
      text: item.title,
      displayText: item.title,
      color,
      textColor: '#ffffff',
      fontSize,
      borderRadius: level === 0 ? 12 : 8,
      nodeShape: 'box',
      isRoot: level === 0,
      parent: info.parentInfo?.nodeId || null,
      children: [],
      tags: [],
      tagLines: '[]',
      hasCollapseMarker: false,
      isCollapsed: false,
      collapsedText: '',
      expandedText: '',
      isImageNode: false,
      imageId: null,
      originalImageSize: null,
    };

    for (const child of info.children) {
      createNodes(child);
    }
  }

  createNodes(rootInfo);

  // 5단계: 연결선 + children 배열 연결
  for (const info of hierarchy) {
    if (info.parentInfo && info.nodeId && info.parentInfo.nodeId) {
      connections.push({
        from: info.parentInfo.nodeId,
        to: info.nodeId,
        color: '#666666',
        arrowSide: 'end',
        virtualPoints: [],
      });
      const parentNode = nodes[String(info.parentInfo.nodeId)];
      if (parentNode) parentNode.children.push(info.nodeId);
    }
  }

  return {
    version: '1.0',
    mindmap: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      nodeIdCounter: nodeIdCounter,
      connectionType: 'bezier',
      showArrows: true,
      arrowPosition: 'end',
      lineWidth: 2,
    },
    nodes,
    connections,
  };
}

// --- 노드 데이터 → CSV ---

export function nodesToCsv(data) {
  const nodes = data?.nodes || {};
  const lines = ['id,text,parent,children,color,isRoot'];

  for (const [nid, node] of Object.entries(nodes)) {
    const row = [
      nid,
      `"${(node.text || '').replace(/"/g, '""')}"`,
      node.parent ?? '',
      (node.children || []).join(';'),
      node.color || '',
      node.isRoot ? 'true' : 'false',
    ];
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

// --- JSON 형식 (간소화) ---

export function nodesToJson(data) {
  const nodes = data?.nodes || {};
  const connections = data?.connections || [];

  const simplified = {};
  for (const [nid, node] of Object.entries(nodes)) {
    simplified[nid] = {
      id: node.id,
      text: node.displayText || node.text,
      parent: node.parent,
      children: node.children || [],
      color: node.color,
      isRoot: !!node.isRoot,
    };
  }

  return { nodes: simplified, connections };
}
