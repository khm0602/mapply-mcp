import { getDb, getUserId, admin } from './firebase.js';

// --- 접근 제어 ---

function checkAccess(doc, requireOwner = false) {
  const userId = getUserId();
  const data = doc.data();

  if (data.ownerId === userId) return 'owner';
  if (requireOwner) throw new Error('소유자만 수행할 수 있는 작업입니다.');

  if (data.isPublic) return 'viewer';
  const collabs = data.collaborators || [];
  if (collabs.includes(userId)) return data.permissions?.[userId] || 'editor';

  throw new Error('마인드맵에 접근할 권한이 없습니다.');
}

// --- 목록 조회 ---

export async function listMindmaps({ folderId, includeShared } = {}) {
  const db = getDb();
  const userId = getUserId();

  // 소유한 마인드맵
  let query = db.collection('mindmaps').where('ownerId', '==', userId);
  if (folderId) {
    query = query.where('folderId', '==', folderId);
  }
  const ownedSnap = await query.orderBy('updatedAt', 'desc').limit(100).get();

  const mindmaps = [];
  ownedSnap.forEach(doc => {
    const d = doc.data();
    mindmaps.push({
      id: doc.id,
      title: d.title,
      folderId: d.folderId || 'root',
      nodeCount: d.data?.nodes ? Object.keys(d.data.nodes).length : 0,
      isPublic: !!d.isPublic,
      createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: d.updatedAt?.toDate?.()?.toISOString() || null,
      role: 'owner',
    });
  });

  // 협업 마인드맵
  if (includeShared) {
    const collabSnap = await db.collection('mindmaps')
      .where('collaborators', 'array-contains', userId)
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get();

    const existingIds = new Set(mindmaps.map(m => m.id));
    collabSnap.forEach(doc => {
      if (existingIds.has(doc.id)) return;
      const d = doc.data();
      mindmaps.push({
        id: doc.id,
        title: d.title,
        folderId: d.folderId || 'root',
        nodeCount: d.data?.nodes ? Object.keys(d.data.nodes).length : 0,
        isPublic: !!d.isPublic,
        createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: d.updatedAt?.toDate?.()?.toISOString() || null,
        role: d.permissions?.[userId] || 'editor',
      });
    });
  }

  return mindmaps;
}

// --- 단일 마인드맵 로드 ---

async function loadDataFromChunks(mindmapId) {
  const db = getDb();
  const snap = await db.collection('mindmap_chunks')
    .where('mindmapId', '==', mindmapId)
    .get();

  if (snap.empty) return null;

  const chunks = [];
  snap.forEach(doc => chunks.push(doc.data()));
  chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

  const merged = { nodes: {}, connections: {} };

  for (const chunk of chunks) {
    if (chunk.chunkType === 'nodes') {
      Object.assign(merged.nodes, chunk.data);
    } else if (chunk.chunkType === 'connections') {
      Object.assign(merged.connections, chunk.data);
    } else if (chunk.chunkType === 'metadata') {
      Object.assign(merged, chunk.data);
    }
  }

  return merged;
}

export async function loadMindmap(mindmapId) {
  const db = getDb();
  const doc = await db.collection('mindmaps').doc(mindmapId).get();
  if (!doc.exists) throw new Error('마인드맵을 찾을 수 없습니다.');

  checkAccess(doc);

  const data = doc.data();
  let mindmapData;

  // 청크 확인
  let isChunked = data.isChunked;
  if (!isChunked) {
    try {
      const metaDoc = await db.collection('mindmap_metadata').doc(mindmapId).get();
      if (metaDoc.exists && metaDoc.data().isChunked) isChunked = true;
    } catch (_) { /* ignore */ }
  }

  if (isChunked) {
    mindmapData = await loadDataFromChunks(mindmapId);
    if (!mindmapData) mindmapData = data.data;
  } else {
    mindmapData = data.data;
  }

  return {
    id: doc.id,
    title: data.title,
    ownerId: data.ownerId,
    folderId: data.folderId || 'root',
    isPublic: !!data.isPublic,
    collaborators: data.collaborators || [],
    createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
    data: mindmapData,
  };
}

// --- 노드 조회 ---

export async function getNode(mindmapId, nodeId) {
  const mm = await loadMindmap(mindmapId);
  const nodes = mm.data?.nodes || {};
  const node = nodes[String(nodeId)];
  if (!node) throw new Error(`노드 ${nodeId}를 찾을 수 없습니다.`);

  const children = (node.children || []).map(cid => {
    const child = nodes[String(cid)];
    return child ? { id: child.id, text: child.text, childCount: (child.children || []).length } : null;
  }).filter(Boolean);

  return {
    id: node.id,
    text: node.text,
    color: node.color,
    parent: node.parent,
    isRoot: !!node.isRoot,
    children,
  };
}

// --- 검색 ---

export async function searchNodes(query, mindmapId) {
  const lowerQ = query.toLowerCase();
  const results = [];

  async function searchInMindmap(mmId) {
    const mm = await loadMindmap(mmId);
    const nodes = mm.data?.nodes || {};
    for (const [nid, node] of Object.entries(nodes)) {
      const text = (node.displayText || node.text || '').toLowerCase();
      if (text.includes(lowerQ)) {
        results.push({
          mindmapId: mmId,
          mindmapTitle: mm.title,
          nodeId: node.id,
          text: node.displayText || node.text,
          isRoot: !!node.isRoot,
        });
      }
    }
  }

  if (mindmapId) {
    await searchInMindmap(mindmapId);
  } else {
    const maps = await listMindmaps();
    // 최대 10개 마인드맵에서 검색
    for (const m of maps.slice(0, 10)) {
      try { await searchInMindmap(m.id); } catch (_) { /* skip */ }
    }
  }

  return results;
}

// --- 폴더 ---

export async function listFolders() {
  const maps = await listMindmaps();
  const folderSet = new Set(maps.map(m => m.folderId));
  return [...folderSet].sort();
}

// --- 생성 ---

export async function createMindmap({ title, data, folderId }) {
  const db = getDb();
  const userId = getUserId();

  const docData = {
    title,
    ownerId: userId,
    ownerName: '',
    data: optimizeForFirestore(data),
    collaborators: [],
    permissions: {},
    isPublic: false,
    hasImages: false,
    folderId: folderId || 'root',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // 크기 확인 — 800KB 초과 시 청크 분할
  const jsonSize = Buffer.byteLength(JSON.stringify(docData), 'utf-8');
  if (jsonSize > 800 * 1024) {
    // 메인 문서에서 data 제거하고 별도 청크 저장
    const mainDoc = { ...docData, data: {}, isChunked: true };
    const ref = await db.collection('mindmaps').add(mainDoc);
    await saveDataInChunks(ref.id, data);
    return ref.id;
  }

  const ref = await db.collection('mindmaps').add(docData);
  return ref.id;
}

// --- 업데이트 ---

export async function updateMindmap(mindmapId, { title, data }) {
  const db = getDb();
  const doc = await db.collection('mindmaps').doc(mindmapId).get();
  if (!doc.exists) throw new Error('마인드맵을 찾을 수 없습니다.');

  const role = checkAccess(doc);
  if (role === 'viewer') throw new Error('편집 권한이 없습니다.');

  const update = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (title) update.title = title;
  if (data) {
    const optimized = optimizeForFirestore(data);
    const jsonSize = Buffer.byteLength(JSON.stringify(optimized), 'utf-8');
    if (jsonSize > 800 * 1024) {
      update.data = {};
      update.isChunked = true;
      await db.collection('mindmaps').doc(mindmapId).update(update);
      await saveDataInChunks(mindmapId, data);
      return;
    }
    update.data = optimized;
  }

  await db.collection('mindmaps').doc(mindmapId).update(update);
}

// --- 노드 추가 ---

export async function addNodes(mindmapId, parentNodeId, newNodes) {
  const mm = await loadMindmap(mindmapId);
  const nodes = mm.data?.nodes || {};
  const connections = mm.data?.connections || [];

  const parent = nodes[String(parentNodeId)];
  if (!parent) throw new Error(`부모 노드 ${parentNodeId}를 찾을 수 없습니다.`);

  // nodeIdCounter 계산
  let maxId = 0;
  for (const n of Object.values(nodes)) {
    if (typeof n.id === 'number' && n.id > maxId) maxId = n.id;
  }

  const addedIds = [];
  for (const newNode of newNodes) {
    maxId++;
    const nodeId = maxId;
    nodes[String(nodeId)] = {
      ...newNode,
      id: nodeId,
      parent: parent.id,
      children: [],
    };
    parent.children = parent.children || [];
    parent.children.push(nodeId);

    connections.push({
      from: parent.id,
      to: nodeId,
      color: '#666666',
      arrowSide: 'end',
      virtualPoints: [],
    });

    addedIds.push(nodeId);
  }

  // mindmap 메타데이터 업데이트
  const mmData = mm.data || {};
  mmData.nodes = nodes;
  mmData.connections = connections;
  if (mmData.mindmap) mmData.mindmap.nodeIdCounter = maxId + 1;

  await updateMindmap(mindmapId, { data: mmData });
  return addedIds;
}

// --- 노드 수정 ---

export async function modifyNode(mindmapId, nodeId, updates) {
  const mm = await loadMindmap(mindmapId);
  const nodes = mm.data?.nodes || {};
  const node = nodes[String(nodeId)];
  if (!node) throw new Error(`노드 ${nodeId}를 찾을 수 없습니다.`);

  const allowed = ['text', 'displayText', 'color', 'textColor', 'fontSize', 'nodeShape', 'borderRadius', 'isCollapsed'];
  for (const [key, val] of Object.entries(updates)) {
    if (allowed.includes(key)) {
      node[key] = val;
      if (key === 'text') node.displayText = val;
    }
  }

  mm.data.nodes = nodes;
  await updateMindmap(mindmapId, { data: mm.data });
}

// --- 노드 삭제 ---

export async function deleteNodes(mindmapId, nodeIds) {
  const mm = await loadMindmap(mindmapId);
  const nodes = mm.data?.nodes || {};
  const connections = mm.data?.connections || [];

  const toDelete = new Set();

  function collectDescendants(nid) {
    toDelete.add(String(nid));
    const node = nodes[String(nid)];
    if (node?.children) {
      for (const cid of node.children) {
        collectDescendants(cid);
      }
    }
  }

  for (const nid of nodeIds) {
    if (nodes[String(nid)]?.isRoot) throw new Error('루트 노드는 삭제할 수 없습니다.');
    collectDescendants(nid);
  }

  // 부모 children 배열에서 제거
  for (const nid of nodeIds) {
    const node = nodes[String(nid)];
    if (node?.parent) {
      const parent = nodes[String(node.parent)];
      if (parent?.children) {
        parent.children = parent.children.filter(cid => !toDelete.has(String(cid)));
      }
    }
  }

  // 노드 삭제
  for (const nid of toDelete) {
    delete nodes[nid];
  }

  // 연결선 정리
  const filtered = connections.filter(c =>
    !toDelete.has(String(c.from)) && !toDelete.has(String(c.to))
  );

  mm.data.nodes = nodes;
  mm.data.connections = filtered;
  await updateMindmap(mindmapId, { data: mm.data });
  return [...toDelete].map(Number);
}

// --- 삭제 ---

export async function deleteMindmap(mindmapId) {
  const db = getDb();
  const doc = await db.collection('mindmaps').doc(mindmapId).get();
  if (!doc.exists) throw new Error('마인드맵을 찾을 수 없습니다.');
  checkAccess(doc, true); // 소유자만

  // 청크 삭제
  const chunkSnap = await db.collection('mindmap_chunks')
    .where('mindmapId', '==', mindmapId)
    .get();
  const batch = db.batch();
  chunkSnap.forEach(d => batch.delete(d.ref));

  // 이미지 메타데이터 삭제
  const imgSnap = await db.collection('mindmap_images')
    .where('mindmapId', '==', mindmapId)
    .get();
  imgSnap.forEach(d => batch.delete(d.ref));

  // 메타데이터 삭제
  const metaRef = db.collection('mindmap_metadata').doc(mindmapId);
  batch.delete(metaRef);

  // 메인 문서 삭제
  batch.delete(db.collection('mindmaps').doc(mindmapId));

  await batch.commit();
}

// --- 이동 ---

export async function moveMindmap(mindmapId, folderId) {
  const db = getDb();
  const doc = await db.collection('mindmaps').doc(mindmapId).get();
  if (!doc.exists) throw new Error('마인드맵을 찾을 수 없습니다.');
  checkAccess(doc, true);

  await db.collection('mindmaps').doc(mindmapId).update({
    folderId: folderId || 'root',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// --- 유틸 ---

function optimizeForFirestore(data) {
  const skipKeys = new Set([
    'isDragging', 'isSelected', 'isEditing', 'mouseOffset',
    'dragOffset', 'animationState', 'renderCache', 'domElement',
  ]);

  function clean(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(clean);

    const out = {};
    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith('_') || key.startsWith('temp') || skipKeys.has(key)) continue;
      if (key === 'imageSrc' && typeof val === 'string' && val.length > 10000) continue;
      if (key === 'label' && (!val || (typeof val === 'string' && !val.trim()))) continue;
      out[key] = clean(val);
    }
    return out;
  }

  return clean(JSON.parse(JSON.stringify(data)));
}

async function saveDataInChunks(mindmapId, data) {
  const db = getDb();
  const MAX_PER_CHUNK = 50;
  const chunks = [];
  let idx = 0;

  // 노드 청크
  if (data.nodes) {
    const ids = Object.keys(data.nodes);
    for (let i = 0; i < ids.length; i += MAX_PER_CHUNK) {
      const slice = {};
      ids.slice(i, i + MAX_PER_CHUNK).forEach(id => { slice[id] = data.nodes[id]; });
      chunks.push({ type: 'nodes', index: idx++, data: slice });
    }
  }

  // 연결선 청크
  if (data.connections && typeof data.connections === 'object' && !Array.isArray(data.connections)) {
    const ids = Object.keys(data.connections);
    for (let i = 0; i < ids.length; i += MAX_PER_CHUNK) {
      const slice = {};
      ids.slice(i, i + MAX_PER_CHUNK).forEach(id => { slice[id] = data.connections[id]; });
      chunks.push({ type: 'connections', index: idx++, data: slice });
    }
  }

  // 메타데이터
  const meta = { ...data };
  delete meta.nodes;
  delete meta.connections;
  chunks.push({ type: 'metadata', index: idx++, data: meta });

  // 기존 청크 삭제
  const oldSnap = await db.collection('mindmap_chunks')
    .where('mindmapId', '==', mindmapId)
    .get();
  if (!oldSnap.empty) {
    const batch = db.batch();
    oldSnap.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  // 새 청크 저장
  const promises = chunks.map(chunk => {
    const docId = `${mindmapId}_chunk_${chunk.index}`;
    return db.collection('mindmap_chunks').doc(docId).set({
      mindmapId,
      chunkType: chunk.type,
      chunkIndex: chunk.index,
      totalChunks: chunks.length,
      data: chunk.data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await Promise.all(promises);
}
