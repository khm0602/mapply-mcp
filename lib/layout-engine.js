// 기존 마인드맵에 새 노드 추가 시 위치 계산

const COLORS = [
  '#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#84cc16', '#f97316', '#0ea5e9', '#22c55e', '#14b8a6',
];

export function layoutNewNodes(existingNodes, parentId, newTexts) {
  const parent = existingNodes[String(parentId)];
  if (!parent) throw new Error(`부모 노드 ${parentId}를 찾을 수 없습니다.`);

  // 기존 자식 위치 분석
  const existingChildren = (parent.children || [])
    .map(cid => existingNodes[String(cid)])
    .filter(Boolean);

  // 배치 방향 결정: 부모와 기존 자식의 관계에서 추론
  let direction = 'below'; // 기본: 아래
  if (existingChildren.length > 0) {
    const avgDx = existingChildren.reduce((s, c) => s + (c.x - parent.x), 0) / existingChildren.length;
    const avgDy = existingChildren.reduce((s, c) => s + (c.y - parent.y), 0) / existingChildren.length;
    if (Math.abs(avgDx) > Math.abs(avgDy)) {
      direction = avgDx > 0 ? 'right' : 'left';
    } else {
      direction = avgDy > 0 ? 'below' : 'above';
    }
  }

  // 점유된 위치 맵 (충돌 방지)
  const occupied = new Set();
  for (const n of Object.values(existingNodes)) {
    occupied.add(`${Math.round(n.x / 10) * 10},${Math.round(n.y / 10) * 10}`);
  }

  const spacing = 70;
  const levelGap = 120;
  const results = [];

  // 부모의 레벨 파악 (색상 결정용)
  let parentLevel = 0;
  let ancestor = parent;
  while (ancestor.parent && existingNodes[String(ancestor.parent)]) {
    parentLevel++;
    ancestor = existingNodes[String(ancestor.parent)];
  }

  for (let i = 0; i < newTexts.length; i++) {
    const text = newTexts[i];
    const textLen = text.length;
    const width = Math.max(80, Math.min(textLen * 8 + 30, 280));
    const height = 46;

    // 색상: 부모가 루트면 팔레트에서, 아니면 부모 색상 계승
    let color;
    if (parentLevel === 0) {
      const colorIdx = (existingChildren.length + i) % COLORS.length;
      color = COLORS[colorIdx];
    } else {
      color = parent.color || '#3b82f6';
    }

    // 위치 계산
    const offset = existingChildren.length + i;
    let x, y;

    if (direction === 'right' || direction === 'left') {
      const sign = direction === 'right' ? 1 : -1;
      x = parent.x + sign * levelGap;
      y = parent.y + (offset - (existingChildren.length + newTexts.length - 1) / 2) * spacing;
    } else {
      const sign = direction === 'below' ? 1 : -1;
      y = parent.y + sign * levelGap;
      x = parent.x + (offset - (existingChildren.length + newTexts.length - 1) / 2) * spacing;
    }

    // 충돌 방지
    const key = `${Math.round(x / 10) * 10},${Math.round(y / 10) * 10}`;
    if (occupied.has(key)) {
      // 약간 오프셋
      x += 20;
      y += 20;
    }
    occupied.add(`${Math.round(x / 10) * 10},${Math.round(y / 10) * 10}`);

    results.push({
      x: Math.round(x),
      y: Math.round(y),
      width,
      height,
      text,
      displayText: text,
      color,
      textColor: '#ffffff',
      fontSize: 12,
      borderRadius: 8,
      nodeShape: 'box',
      isRoot: false,
      tags: [],
      tagLines: '[]',
      hasCollapseMarker: false,
      isCollapsed: false,
      collapsedText: '',
      expandedText: '',
      isImageNode: false,
      imageId: null,
      originalImageSize: null,
    });
  }

  return results;
}
