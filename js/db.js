// js/db.js - Versión Corregida y Completa
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
        
        // Store Tablets
        if (!db.objectStoreNames.contains('tablets')) {
          const store = db.createObjectStore('tablets', { keyPath: 'id' });
          store.createIndex('codigo_unico', 'codigo_unico', { unique: true });
          store.createIndex('sede_procedencia', 'sede_procedencia', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // Store SyncQueue
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        }

        // Store Profile
        if (!db.objectStoreNames.contains('profile')) {
          db.createObjectStore('profile', { keyPath: 'id' });
        }

        // Store Images (para caché offline de evidencias)
        if (!db.objectStoreNames.contains('images')) {
          const imgStore = db.createObjectStore('images', { keyPath: 'id' });
          imgStore.createIndex('tablet_id', 'tablet_id', { unique: false });
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
    tablet.synced = !!tablet.synced; // Asegurar booleano
    return this.put('tablets', tablet);
  }

  // 🔥 RESTAURADO: Este método faltaba y causaba el error en sync.js
  async getTablet(id) {
    return this.get('tablets', id);
  }

  async getAllTablets() {
    return this.getAll('tablets');
  }

  // 🔥 RESTAURADO: Necesario para eliminar tablets
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
  
  // 🔥 RESTAURADO: sync.js suele usar esto para marcar éxito
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

  // --- Imágenes (Caché Offline) ---
  
  async saveImage(imageData) {
    return this.put('images', imageData);
  }

  async getImage(id) {
    return this.get('images', id);
  }

  // --- Profile & Stats ---

  async saveProfile(profile) { return this.put('profile', profile); }
  
  async getProfile(id) { 
    return this.get('profile', id);
  }

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

// Export singleton
const dbManager = new DBManager();
