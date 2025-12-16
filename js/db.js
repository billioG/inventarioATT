// js/db.js - COMPLETO Y CORREGIDO
class DBManager {
  constructor() {
    this.dbName = 'TabletInventoryDB';
    this.version = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error('❌ Error crítico BD:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains('tablets')) {
          const store = db.createObjectStore('tablets', { keyPath: 'id' });
          store.createIndex('codigo_unico', 'codigo_unico', { unique: true });
          store.createIndex('sede_procedencia', 'sede_procedencia', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        }

        if (!db.objectStoreNames.contains('profile')) {
          db.createObjectStore('profile', { keyPath: 'id' });
        }
        
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images', { keyPath: 'id' });
        }
      };
    });
  }

  transaction(storeName, mode = 'readonly') {
    if (!this.db) throw new Error("Base de datos no inicializada");
    return this.db.transaction(storeName, mode).objectStore(storeName);
  }

  // --- Operaciones Genéricas ---
  async put(storeName, data) {
    return new Promise((resolve, reject) => {
      const request = this.transaction(storeName, 'readwrite').put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(storeName, key) {
    return new Promise((resolve, reject) => {
      const request = this.transaction(storeName).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const request = this.transaction(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName, key) {
    return new Promise((resolve, reject) => {
      const request = this.transaction(storeName, 'readwrite').delete(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // --- Métodos Específicos para Tablets ---
  async saveTablet(tablet) {
    tablet.updated_at = new Date().toISOString();
    if (!tablet.created_at) tablet.created_at = tablet.updated_at;
    tablet.synced = !!tablet.synced;
    return this.put('tablets', tablet);
  }

  // ESTE ES EL MÉTODO QUE FALTABA Y CAUSABA EL ERROR
  async getTablet(id) {
    return this.get('tablets', id);
  }

  async getAllTablets() {
    return this.getAll('tablets');
  }

  async deleteTablet(id) {
    return this.delete('tablets', id);
  }

  async searchTablets(query) {
    const all = await this.getAllTablets();
    if (!query) return all;
    const q = query.toLowerCase();
    return all.filter(t => 
      (t.codigo_unico && t.codigo_unico.toLowerCase().includes(q)) ||
      (t.modelo && t.modelo.toLowerCase().includes(q)) ||
      (t.sede_procedencia && t.sede_procedencia.toLowerCase().includes(q))
    );
  }

  async getUnsyncedTablets() {
    const all = await this.getAllTablets();
    return all.filter(t => t.synced === false);
  }

  // --- Sync Queue ---
  async addToSyncQueue(operation, tableName, recordId, data) {
    return this.put('syncQueue', {
      operation,
      table_name: tableName,
      record_id: recordId,
      data,
      created_at: new Date().toISOString(),
      synced: false
    });
  }

  async getUnsyncedQueue() {
    const all = await this.getAll('syncQueue');
    return all.filter(item => !item.synced);
  }
  
  async markQueueItemSynced(id) {
    const item = await this.get('syncQueue', id);
    if (item) {
      item.synced = true;
      item.synced_at = new Date().toISOString();
      return this.put('syncQueue', item);
    }
  }

  async removeFromSyncQueue(id) {
    return this.delete('syncQueue', id);
  }

  // --- Profile & Images ---
  async saveProfile(profile) { return this.put('profile', profile); }
  async getProfile(id) { return this.get('profile', id); }
  async saveImage(img) { return this.put('images', img); }
  async getImage(id) { return this.get('images', id); }

  async getStats() {
    const tablets = await this.getAllTablets();
    return {
      total: tablets.length,
      good: tablets.filter(t => ['Bueno', 'Funcional', 'Excelente'].includes(t.estado_pantalla)).length,
      attention: tablets.filter(t => ['Malo', 'Roto', 'Dañado'].includes(t.estado_pantalla) || t.estado_puerto_carga === 'Dañado').length,
      pending: tablets.filter(t => !t.synced).length
    };
  }
}

const dbManager = new DBManager();
