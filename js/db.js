// IndexedDB Manager for Offline Storage
class DBManager {
  constructor() {
    this.dbName = 'TabletInventoryDB';
    this.version = 1;
    this.db = null;
  }

  // Initialize database
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error('IndexedDB error:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB initialized successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log('Upgrading IndexedDB schema...');

        // Tablets store
        if (!db.objectStoreNames.contains('tablets')) {
          const tabletsStore = db.createObjectStore('tablets', { 
            keyPath: 'id' 
          });
          tabletsStore.createIndex('codigo_unico', 'codigo_unico', { unique: true });
          tabletsStore.createIndex('sede', 'sede_procedencia', { unique: false });
          tabletsStore.createIndex('modelo', 'modelo', { unique: false });
          tabletsStore.createIndex('synced', 'synced', { unique: false });
          tabletsStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Sync queue store
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncStore = db.createObjectStore('syncQueue', { 
            keyPath: 'id',
            autoIncrement: true 
          });
          syncStore.createIndex('synced', 'synced', { unique: false });
          syncStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Images store (for offline image caching)
        if (!db.objectStoreNames.contains('images')) {
          const imagesStore = db.createObjectStore('images', { 
            keyPath: 'id' 
          });
          imagesStore.createIndex('tablet_id', 'tablet_id', { unique: false });
          imagesStore.createIndex('synced', 'synced', { unique: false });
        }

        // User profile store
        if (!db.objectStoreNames.contains('profile')) {
          db.createObjectStore('profile', { keyPath: 'id' });
        }

        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }

  // Generic transaction helper
  transaction(storeName, mode = 'readonly') {
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  // Add or update record
  async put(storeName, data) {
    return new Promise((resolve, reject) => {
      try {
        const store = this.transaction(storeName, 'readwrite');
        const request = store.put(data);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Get record by key
  async get(storeName, key) {
    return new Promise((resolve, reject) => {
      try {
        const store = this.transaction(storeName);
        const request = store.get(key);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Get all records
  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      try {
        const store = this.transaction(storeName);
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Get records by index - CORREGIDO
  async getAllByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      try {
        const store = this.transaction(storeName);
        const index = store.index(indexName);
        
        // FIX: Si value es undefined o null, usar getAll() sin parámetros
        let request;
        if (value === undefined || value === null) {
          request = index.getAll();
        } else {
          request = index.getAll(value);
        }
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Delete record
  async delete(storeName, key) {
    return new Promise((resolve, reject) => {
      try {
        const store = this.transaction(storeName, 'readwrite');
        const request = store.delete(key);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Clear store
  async clear(storeName) {
    return new Promise((resolve, reject) => {
      try {
        const store = this.transaction(storeName, 'readwrite');
        const request = store.clear();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Count records
  async count(storeName) {
    return new Promise((resolve, reject) => {
      try {
        const store = this.transaction(storeName);
        const request = store.count();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Search with filters
  async search(storeName, filters = {}) {
    return new Promise((resolve, reject) => {
      try {
        const store = this.transaction(storeName);
        const request = store.openCursor();
        const results = [];

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          
          if (cursor) {
            const value = cursor.value;
            let matches = true;

            // Apply filters
            for (const [key, filterValue] of Object.entries(filters)) {
              if (filterValue && value[key] !== filterValue) {
                matches = false;
                break;
              }
            }

            if (matches) {
              results.push(value);
            }

            cursor.continue();
          } else {
            resolve(results);
          }
        };

        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Tablet-specific operations
  async saveTablet(tablet) {
    tablet.updated_at = new Date().toISOString();
    if (!tablet.created_at) {
      tablet.created_at = tablet.updated_at;
    }
    return this.put('tablets', tablet);
  }

  async getTablet(id) {
    return this.get('tablets', id);
  }

  async getAllTablets() {
    return this.getAll('tablets');
  }

  // CORREGIDO: getUnsyncedTablets
  async getUnsyncedTablets() {
    try {
      const allTablets = await this.getAllTablets();
      // Filtrar manualmente en lugar de usar índice con valor booleano
      return allTablets.filter(tablet => tablet.synced === false || !tablet.synced);
    } catch (error) {
      console.error('Error getting unsynced tablets:', error);
      return [];
    }
  }

  async deleteTablet(id) {
    return this.delete('tablets', id);
  }

  async searchTablets(query) {
    const allTablets = await this.getAllTablets();
    
    if (!query) return allTablets;

    const searchQuery = query.toLowerCase();
    return allTablets.filter(tablet => 
      tablet.codigo_unico?.toLowerCase().includes(searchQuery) ||
      tablet.modelo?.toLowerCase().includes(searchQuery) ||
      tablet.sede_procedencia?.toLowerCase().includes(searchQuery) ||
      tablet.numero_serie?.toLowerCase().includes(searchQuery)
    );
  }

  // Sync queue operations
  async addToSyncQueue(operation, tableName, recordId, data) {
    const queueItem = {
      operation,
      table_name: tableName,
      record_id: recordId,
      data,
      created_at: new Date().toISOString(),
      synced: false,
      retries: 0
    };
    return this.put('syncQueue', queueItem);
  }

  // CORREGIDO: getUnsyncedQueue
  async getUnsyncedQueue() {
    try {
      const allQueue = await this.getAll('syncQueue');
      return allQueue.filter(item => item.synced === false || !item.synced);
    } catch (error) {
      console.error('Error getting unsynced queue:', error);
      return [];
    }
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

  // Image operations
  async saveImage(imageData) {
    return this.put('images', imageData);
  }

  async getImage(id) {
    return this.get('images', id);
  }

  async getImagesByTablet(tabletId) {
    return this.getAllByIndex('images', 'tablet_id', tabletId);
  }

  async deleteImage(id) {
    return this.delete('images', id);
  }

  // Profile operations
  async saveProfile(profile) {
    return this.put('profile', profile);
  }

  async getProfile(id) {
    return this.get('profile', id);
  }

  // Settings operations
  async saveSetting(key, value) {
    return this.put('settings', { key, value });
  }

  async getSetting(key) {
    const result = await this.get('settings', key);
    return result ? result.value : null;
  }

  // Statistics
  async getStats() {
    const tablets = await this.getAllTablets();
    
    const stats = {
      total: tablets.length,
      good: tablets.filter(t => 
        t.estado_pantalla === 'Bueno' || 
        t.estado_pantalla === 'Funcional'
      ).length,
      attention: tablets.filter(t => 
        t.estado_pantalla === 'Regular' || 
        t.estado_pantalla === 'Malo' ||
        t.estado_pantalla === 'Roto' ||
        t.estado_puerto_carga === 'Malo' ||
        t.estado_puerto_carga === 'No funciona'
      ).length,
      pending: tablets.filter(t => !t.synced).length
    };

    return stats;
  }
}

// Export singleton instance
const dbManager = new DBManager();
