import { loadMindmap } from '../mindmap-store.js';
import { nodesToTree, nodesToJson, nodesToCsv } from '../text-converter.js';

export const exportTools = [
  {
    name: 'export_mindmap',
    description: '마인드맵을 다양한 형식으로 내보냅니다: tree (트리 텍스트), json (구조화), csv.',
    inputSchema: {
      type: 'object',
      properties: {
        mindmap_id: { type: 'string', description: '마인드맵 ID' },
        format: { type: 'string', enum: ['tree', 'json', 'csv'], description: '내보내기 형식' },
      },
      required: ['mindmap_id', 'format'],
    },
    handler: async ({ mindmap_id, format }) => {
      const mm = await loadMindmap(mindmap_id);

      let body;
      switch (format) {
        case 'json':
          body = JSON.stringify(nodesToJson(mm.data), null, 2);
          break;
        case 'csv':
          body = nodesToCsv(mm.data);
          break;
        case 'tree':
        default:
          body = nodesToTree(mm.data);
          break;
      }

      return {
        content: [{ type: 'text', text: `# ${mm.title} (${format})\n\n${body}` }],
      };
    },
  },
];
