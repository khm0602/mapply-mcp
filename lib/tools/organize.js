import { listFolders, deleteMindmap, moveMindmap } from '../mindmap-store.js';

export const organizeTools = [
  {
    name: 'list_folders',
    description: '사용자의 마인드맵 폴더 목록을 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      const folders = await listFolders();
      if (!folders.length) return { content: [{ type: 'text', text: '폴더가 없습니다.' }] };
      const text = folders.map(f => `- ${f}`).join('\n');
      return { content: [{ type: 'text', text: `폴더 목록:\n${text}` }] };
    },
  },
  {
    name: 'delete_mindmap',
    description: '마인드맵을 완전히 삭제합니다. 소유자만 가능하며 되돌릴 수 없습니다.',
    inputSchema: {
      type: 'object',
      properties: {
        mindmap_id: { type: 'string', description: '삭제할 마인드맵 ID' },
      },
      required: ['mindmap_id'],
    },
    handler: async ({ mindmap_id }) => {
      await deleteMindmap(mindmap_id);
      return { content: [{ type: 'text', text: `마인드맵 삭제 완료: ${mindmap_id}` }] };
    },
  },
  {
    name: 'move_mindmap',
    description: '마인드맵을 다른 폴더로 이동합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        mindmap_id: { type: 'string', description: '마인드맵 ID' },
        folder_id: { type: 'string', description: '대상 폴더 ID (root = 루트 폴더)' },
      },
      required: ['mindmap_id', 'folder_id'],
    },
    handler: async ({ mindmap_id, folder_id }) => {
      await moveMindmap(mindmap_id, folder_id);
      return { content: [{ type: 'text', text: `마인드맵 이동 완료: ${mindmap_id} → ${folder_id}` }] };
    },
  },
];
