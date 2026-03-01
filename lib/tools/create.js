import { createMindmap } from '../mindmap-store.js';
import { treeToNodes } from '../text-converter.js';

export const createTools = [
  {
    name: 'create_mindmap',
    description: '새 마인드맵을 생성합니다. 트리 텍스트 또는 JSON 형식으로 내용을 전달합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '마인드맵 제목' },
        content: { type: 'string', description: '마인드맵 내용 (트리 텍스트 또는 JSON)' },
        format: { type: 'string', enum: ['tree', 'json'], description: '입력 형식 (기본: tree)' },
        folder_id: { type: 'string', description: '저장할 폴더 ID (기본: root)' },
      },
      required: ['title', 'content'],
    },
    handler: async ({ title, content, format, folder_id }) => {
      const fmt = format || 'tree';
      let data;

      if (fmt === 'json') {
        data = typeof content === 'string' ? JSON.parse(content) : content;
      } else {
        data = treeToNodes(content);
      }

      const id = await createMindmap({ title, data, folderId: folder_id });
      const nodeCount = data.nodes ? Object.keys(data.nodes).length : 0;
      return {
        content: [{
          type: 'text',
          text: `마인드맵 생성 완료!\n\nID: ${id}\n제목: ${title}\n노드 수: ${nodeCount}\n폴더: ${folder_id || 'root'}\n\nhttps://mapply.web.app/mindmap.html?id=${id}`,
        }],
      };
    },
  },
];
