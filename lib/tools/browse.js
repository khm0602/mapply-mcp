import { listMindmaps, loadMindmap, getNode, searchNodes } from '../mindmap-store.js';
import { nodesToTree, nodesToJson } from '../text-converter.js';

export const browseTools = [
  {
    name: 'list_mindmaps',
    description: '마인드맵 목록을 조회합니다. 제목, 폴더, 노드 수 등 메타데이터를 반환합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        folder_id: { type: 'string', description: '특정 폴더의 마인드맵만 조회 (생략 시 전체)' },
        include_shared: { type: 'boolean', description: '공유받은 마인드맵 포함 여부 (기본: false)' },
      },
    },
    handler: async ({ folder_id, include_shared }) => {
      const maps = await listMindmaps({ folderId: folder_id, includeShared: include_shared });
      if (!maps.length) return { content: [{ type: 'text', text: '마인드맵이 없습니다.' }] };

      const lines = maps.map(m =>
        `- **${m.title}** (${m.nodeCount}개 노드) [${m.role}]\n  ID: ${m.id} | 폴더: ${m.folderId} | 수정: ${m.updatedAt || '?'}`
      );
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  },
  {
    name: 'get_mindmap',
    description: '마인드맵의 전체 내용을 조회합니다. 기본 형식은 트리 텍스트(토큰 효율적)이며, json 형식도 지원합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        mindmap_id: { type: 'string', description: '마인드맵 ID' },
        format: { type: 'string', enum: ['tree', 'json'], description: '출력 형식 (기본: tree)' },
      },
      required: ['mindmap_id'],
    },
    handler: async ({ mindmap_id, format }) => {
      const mm = await loadMindmap(mindmap_id);
      const fmt = format || 'tree';

      let body;
      if (fmt === 'json') {
        body = JSON.stringify(nodesToJson(mm.data), null, 2);
      } else {
        body = nodesToTree(mm.data);
      }

      const header = `# ${mm.title}\nID: ${mm.id} | 폴더: ${mm.folderId} | 노드: ${Object.keys(mm.data?.nodes || {}).length}개\n\n`;
      return { content: [{ type: 'text', text: header + body }] };
    },
  },
  {
    name: 'get_node',
    description: '마인드맵의 특정 노드와 직계 자식 정보를 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        mindmap_id: { type: 'string', description: '마인드맵 ID' },
        node_id: { type: ['string', 'number'], description: '노드 ID' },
      },
      required: ['mindmap_id', 'node_id'],
    },
    handler: async ({ mindmap_id, node_id }) => {
      const node = await getNode(mindmap_id, node_id);
      const childList = node.children.map(c => `  - ${c.text} (ID: ${c.id}, 자식: ${c.childCount}개)`).join('\n');
      const text = `**${node.text}** (ID: ${node.id})\n색상: ${node.color} | 루트: ${node.isRoot} | 부모: ${node.parent ?? 'none'}\n\n자식 노드:\n${childList || '  (없음)'}`;
      return { content: [{ type: 'text', text }] };
    },
  },
  {
    name: 'search_nodes',
    description: '텍스트로 노드를 검색합니다. 특정 마인드맵 또는 전체에서 검색할 수 있습니다.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색어' },
        mindmap_id: { type: 'string', description: '특정 마인드맵에서만 검색 (생략 시 최근 10개 마인드맵)' },
      },
      required: ['query'],
    },
    handler: async ({ query, mindmap_id }) => {
      const results = await searchNodes(query, mindmap_id);
      if (!results.length) return { content: [{ type: 'text', text: `"${query}" 검색 결과가 없습니다.` }] };

      const lines = results.map(r =>
        `- **${r.text}** (노드 ID: ${r.nodeId}${r.isRoot ? ', 루트' : ''})\n  마인드맵: ${r.mindmapTitle} (${r.mindmapId})`
      );
      return { content: [{ type: 'text', text: `"${query}" 검색 결과 (${results.length}건):\n\n${lines.join('\n')}` }] };
    },
  },
];
