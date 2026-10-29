import type { Journal } from '../../supabase/functions/_shared/agentJournal';
export interface JournalSession { draft: Journal; history: Journal[] }
const database = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('rfa-agent-journals', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('sessions');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
export async function loadJournalSession(owner: string): Promise<JournalSession | null> {
  const db = await database();
  try { return await new Promise((resolve, reject) => { const r = db.transaction('sessions').objectStore('sessions').get(owner); r.onsuccess = () => resolve(r.result ?? null); r.onerror = () => reject(r.error); }); }
  finally { db.close(); }
}
export async function saveJournalSession(owner: string, data: JournalSession) {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('sessions', 'readwrite'); tx.objectStore('sessions').put(data, owner); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }
  finally { db.close(); }
}
