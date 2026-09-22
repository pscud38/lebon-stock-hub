// Each document has its own IndexedDB key. Tabs never overwrite a shared array.
export class Queue {
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('lebon-stock-queue-v2', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('documents', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }
  async operation(mode, operation) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', mode);
      const request = operation(tx.objectStore('documents'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('ไม่สามารถเก็บรายการรอส่งได้'));
    });
  }
  async add(user, payload) {
    const doc = { id: crypto.randomUUID(), user, payload, createdAt: new Date().toISOString(), error: '' };
    await this.operation('readwrite', store => store.add(doc));
    return doc;
  }
  async list(user) {
    return (await this.operation('readonly', store => store.getAll())).filter(x => x.user === user).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  }
  async remove(id) { await this.operation('readwrite', store => store.delete(id)); }
  async mark(doc, error) { await this.operation('readwrite', store => store.put({ ...doc, error })); }
}

export async function sendQueue(queue, user, send) {
  const run = async () => {
    let sent = 0;
    for (const doc of await queue.list(user)) {
      try {
        await send(doc);
        await queue.remove(doc.id);
        sent++;
      } catch (error) {
        await queue.mark(doc, error.message);
        // Preserve ordering: a pending receipt may be needed by the next issue.
        break;
      }
    }
    return sent;
  };
  return globalThis.navigator?.locks ? navigator.locks.request(`lebon-sync-${user}`, run) : run();
}
