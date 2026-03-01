import { updateMindmap, addNodes, modifyNode, deleteNodes, loadMindmap } from '../mindmap-store.js';
import { treeToNodes, nodesToTree } from '../text-converter.js';
import { layoutNewNodes } from '../layout-engine.js';

// 재귀적으로 트리 텍스트의 노드를 부모에 추가하는 헬퍼
async function addTreeNodes(mindmapId, parentNodeId, content) {
  const mm = await loadMindmap(mindmapId);
  const existingNodes = mm.data?.nodes || {};

  const lines = content.split('\n').filter(l => l.trim());
  const topTexts = [];
  const subTree = {};

  let currentParentIdx = -1;
  for (const line of lines) {
    const text = line.replace(/^\s+/, '');
    const spaces = line.length - text.length;
    const level = Math.floor(spaces / 2);

    if (level === 0) {
      currentParentIdx = topTexts.length;
      topTexts.push(text);
      subTree[currentParentIdx] = [];
    } else if (currentParentIdx >= 0) {
      subTree[currentParentIdx].push(line);
    }
  }

  if (!topTexts.length) return { ids: [], total: 0 };

  const newNodes = layoutNewNodes(existingNodes, parentNodeId, topTexts);
  const ids = await addNodes(mindmapId, parentNodeId, newNodes);

  let totalAdded = ids.length;
  for (let i = 0; i < ids.length; i++) {
    if (subTree[i]?.length) {
      const subContent = subTree[i].map(l => l.replace(/^  /, '')).join('\n');
      const sub = await addTreeNodes(mindmapId, ids[i], subContent);
      totalAdded += sub.total;
    }
  }

  return { ids, total: totalAdded };
}

export const editTools = [
  {
    name: 'update_mindmap',
    description: '마인드맵의 전체 내용을 교체합니다. 제목만 변경하거나, 내용 전체를 새 트리 텍스트/JSON으로 덮어쓸 수 있습니다.',
    inputSchema: {
      type: 'object',
      properties: {
        mindmap_id: { type: 'string', description: '마인드맵 ID' },
        content: { type: 'string', description: '새 마인드맵 내용 (트리 텍스트 또는 JSON). 생략 시 제목만 변경.' },
        format: { type: 'string', enum: ['tree', 'json'], description: '입력 형식 (기본: tree)' },
        title: { type: 'string', description: '새 제목 (생략 시 유지)' },
      },
      required: ['mindmap_id'],
    },
    handler: async ({ mindmap_id, content, format, title }) => {
      let data;
      if (content) {
        const fmt = format || 'tree';
        if (fmt === 'json') {
          data = typeof content === 'string' ? JSON.parse(content) : content;
        } else {
          data = treeToNodes(content);
        }
      }

      await updateMindmap(mindmap_id, { title, data });

      const parts = [];
      if (title) parts.push(`제목: ${title}`);
      if (data) parts.push(`노드: ${Object.keys(data.nodes || {}).length}개`);

      return {
        content: [{ type: 'text', text: `마인드맵 업데이트 완료 (${mindmap_id})\n${parts.join(' | ')}` }],
      };
    },
  },
  {
    name: 'add_nodes',
    description: '부모 노드에 자식 노드를 추가합니다. 트리 텍스트로 여러 레벨의 노드를 한번에 추가할 수 있습니다.',
    inputSchema: {
      type: 'object',
      properties: {
        mindmap_id: { type: 'string', description: '마인드맵 ID' },
        parent_node_id: { type: ['string', 'number'], description: '부모 노드 ID' },
        content: { type: 'string', description: '추가할 노드 (트리 텍스트 또는 JSON)' },
        format: { type: 'string', enum: ['tree', 'json'], description: '입력 형식 (기본: tree)' },
      },
      required: ['mindmap_id', 'parent_node_id', 'content'],
    },
    handler: async ({ mindmap_id, parent_node_id, content, format }) => {
      const fmt = format || 'tree';

      if (fmt === 'json') {
        const mm = await loadMindmap(mindmap_id);
        const existingNodes = mm.data?.nodes || {};
        const nodeList = typeof content === 'string' ? JSON.parse(content) : content;
        const arr = Array.isArray(nodeList) ? nodeList : [nodeList];
        const newNodes = layoutNewNodes(existingNodes, parent_node_id, arr.map(n => n.text || n));
        arr.forEach((n, i) => {
          if (typeof n === 'object') Object.assign(newNodes[i], n, { x: newNodes[i].x, y: newNodes[i].y });
        });
        const ids = await addNodes(mindmap_id, parent_node_id, newNodes);
        return {
          content: [{ type: 'text', text: `${ids.length}개 노드 추가 완료 (ID: ${ids.join(', ')})` }],
        };
      }

      const { ids, total } = await addTreeNodes(mindmap_id, parent_node_id, content);
      return {
        content: [{ type: 'text', text: `${total}개 노드 추가 완료 (최상위 ID: ${ids.join(', ')})` }],
      };
    },
  },
  {
    name: 'modify_node',
    description: '마인드맵 노드의 속성을 수정합니다 (텍스트, 색상 등).',
    inputSchema: {
      type: 'object',
      properties: {
        mindmap_id: { type: 'string', description: '마인드맵 ID' },
        node_id: { type: ['string', 'number'], description: '노드 ID' },
        text: { type: 'string', description: '새 텍스트' },
        color: { type: 'string', description: '새 배경색 (hex, 예: #3b82f6)' },
        text_color: { type: 'string', description: '새 텍스트 색상 (hex)' },
        font_size: { type: 'number', description: '폰트 크기' },
        node_shape: { type: 'string', enum: ['box', 'circle', 'diamond', 'rounded'], description: '노드 모양' },
      },
      required: ['mindmap_id', 'node_id'],
    },
    handler: async ({ mindmap_id, node_id, text, color, text_color, font_size, node_shape }) => {
      const updates = {};
      if (text !== undefined) updates.text = text;
      if (color !== undefined) updates.color = color;
      if (text_color !== undefined) updates.textColor = text_color;
      if (font_size !== undefined) updates.fontSize = font_size;
      if (node_shape !== undefined) updates.nodeShape = node_shape;

      if (!Object.keys(updates).length) {
        return { content: [{ type: 'text', text: '수정할 속성이 지정되지 않았습니다.' }] };
      }

      await modifyNode(mindmap_id, node_id, updates);
      return {
        content: [{ type: 'text', text: `노드 ${node_id} 수정 완료: ${Object.keys(updates).join(', ')}` }],
      };
    },
  },
  {
    name: 'delete_nodes',
    description: '마인드맵에서 노드와 그 하위 노드를 삭제합니다. 루트 노드는 삭제할 수 없습니다.',
    inputSchema: {
      type: 'object',
      properties: {
        mindmap_id: { type: 'string', description: '마인드맵 ID' },
        node_ids: {
          type: 'array',
          items: { type: ['string', 'number'] },
          description: '삭제할 노드 ID 배열',
        },
      },
      required: ['mindmap_id', 'node_ids'],
    },
    handler: async ({ mindmap_id, node_ids }) => {
      const deleted = await deleteNodes(mindmap_id, node_ids);
      return {
        content: [{ type: 'text', text: `${deleted.length}개 노드 삭제 완료 (하위 포함): ${deleted.join(', ')}` }],
      };
    },
  },
];
