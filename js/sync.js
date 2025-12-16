// js/sync.js
class SyncManager {
  constructor() {
    this.isSyncing = false;
    this.syncInterval = null;
    this.realtimeSubscription = null;
  }

  init() {
    console.log('Initializing Sync Manager...');

    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Sincronización periódica (cada 30s)
    this.syncInterval = setInterval(() => {
      if (navigator.onLine && !this.isSyncing && supabaseClient.isAvailable()) {
        this.syncAll(false); // false = no mostrar toast en automáticas
      }
    }, 30000);

    // Sincronización INICIAL AL CARGAR
    if (navigator.onLine && supabaseClient.isAvailable()) {
      console.log('Sync: Sincronización inicial...');
      // Ejecutar inmediatamente (apenas 500ms de espera)
      setTimeout(() => {
        this.syncAll(false); 
      }, 500);
    }

    if (navigator.onLine && supabaseClient.isAvailable()) {
      this.setupRealtimeSync();
    }

    this.updateSyncBadge();
  }

  handleOnline() {
    console.log('Conexión restaurada');
    this.hideOfflineIndicator();
    if (supabaseClient.isAvailable()) {
      this.syncAll(true);
      this.setupRealtimeSync();
    }
  }

  handleOffline() {
    console.log('Conexión perdida');
    this.showOfflineIndicator();
    if (this.realtimeSubscription) {
      supabaseClient.unsubscribe(this.realtimeSubscription);
      this.realtimeSubscription = null;
    }
  }

  // Llamado desde app.js al guardar
  async triggerInstantSync() {
    if (navigator.onLine && !this.isSyncing && supabaseClient.isAvailable()) {
      console.log('⚡ Sync inmediata disparada');
      await this.syncAll(true);
    }
  }

  // showToast = true muestra mensajes, false es silencioso
  async syncAll(showMessages = true) {
    if (this.isSyncing || !navigator.onLine || !supabaseClient.isAvailable()) return;

    this.isSyncing = true;
    console.log('Iniciando sincronización bidireccional...');

    try {
      // 1. BAJAR DE LA NUBE (Server -> Local)
      const newDataReceived = await this.syncServerToLocal();

      // 2. SUBIR A LA NUBE (Local -> Server)
      await this.syncLocalToServer();

      // 3. PROCESAR COLA
      await this.processSyncQueue();

      console.log('Sincronización completada');
      if (showMessages) showToast('Sincronización completada', 'success');

      // --- CORRECCIÓN CRÍTICA: ACTUALIZAR UI SIEMPRE AL TERMINAR ---
      // Esto asegura que si bajaron tablets nuevas, aparezcan solas
      if (window.app) {
        console.log('Actualizando vista después de sync...');
        await window.app.loadData(); // Recarga datos de IDB a memoria
        window.app.renderDashboard(); // Pinta la tabla de nuevo
        window.app.updateStatistics(); // Actualiza contadores
      }

    } catch (error) {
      console.error('Error en sync:', error);
      if (showMessages) showToast('Error sincronizando: ' + error.message, 'error');
    } finally {
      this.isSyncing = false;
      await this.updateSyncBadge();
    }
  }

  async syncServerToLocal() {
    if (!supabaseClient.isAvailable()) return false;
    
    try {
      const serverTablets = await supabaseClient.getTablets();
      let changesMade = false;

      for (const serverTablet of serverTablets) {
        const localTablet = await dbManager.getTablet(serverTablet.id);
        
        // Si no existe localmente O existe pero ya estaba sincronizada (sobrescribir)
        if (!localTablet || localTablet.synced) {
           await dbManager.saveTablet({ ...serverTablet, synced: true });
           changesMade = true;
        }
      }
      return changesMade;
    } catch (error) {
      console.error('Error server->local:', error);
      return false;
    }
  }

  async syncLocalToServer() {
    if (!supabaseClient.isAvailable()) return;
    const unsyncedTablets = await dbManager.getUnsyncedTablets();
    
    for (const tablet of unsyncedTablets) {
      try {
        await this.syncTabletToServer(tablet);
      } catch (error) {
        console.error(`Error subiendo tablet ${tablet.codigo_unico}:`, error);
      }
    }
  }

  async syncTabletToServer(tablet) {
    // Lógica de upsert (insertar o actualizar)
    const { id, synced, last_synced_at, ...tabletData } = tablet;
    
    // Intentar buscar por ID primero
    let exists = false;
    try {
      const check = await supabaseClient.getTablet(id);
      if (check) exists = true;
    } catch (e) {}

    let result;
    if (exists) {
      result = await supabaseClient.updateTablet(id, tabletData);
    } else {
      // Intentar crear (si falla por duplicado de código, actualizar)
      try {
        result = await supabaseClient.createTablet(tabletData);
      } catch (error) {
        if (error.code === '23505') { // Duplicado
            // Buscar el ID real del servidor usando el código único
            const serverItems = await supabaseClient.getTablets({search: tabletData.codigo_unico});
            const actualItem = serverItems.find(t => t.codigo_unico === tabletData.codigo_unico);
            if (actualItem) {
                result = await supabaseClient.updateTablet(actualItem.id, tabletData);
            } else {
                throw error;
            }
        } else {
            throw error;
        }
      }
    }

    // Marcar como sincronizado localmente con el ID correcto
    if (result) {
        await dbManager.saveTablet({ 
            ...tablet, 
            id: result.id, 
            synced: true,
            last_synced_at: new Date().toISOString()
        });
    }
  }

  async processSyncQueue() {
    if (!supabaseClient.isAvailable()) return;
    const queueItems = await dbManager.getUnsyncedQueue();
    
    for (const item of queueItems) {
      try {
        const { operation, record_id, data } = item;
        
        if (operation === 'DELETE') {
           await supabaseClient.deleteTablet(record_id);
        } else if (operation === 'INSERT' || operation === 'UPDATE') {
           // Reutilizamos la lógica robusta de syncTabletToServer
           if (data) await this.syncTabletToServer(data);
        }
        
        await dbManager.markQueueItemSynced(item.id);
      } catch (error) {
        console.error(`Error procesando cola ${item.id}:`, error);
        // Eliminar de la cola si falla mucho para no trabar
        const updated = await dbManager.get('syncQueue', item.id);
        if (updated && (updated.retries || 0) > 3) {
            await dbManager.removeFromSyncQueue(item.id);
        } else if (updated) {
            updated.retries = (updated.retries || 0) + 1;
            await dbManager.put('syncQueue', updated);
        }
      }
    }
  }

  // Helpers de UI
  showOfflineIndicator() {
    const el = document.getElementById('offline-indicator');
    if (el) el.style.display = 'flex';
  }
  hideOfflineIndicator() {
    const el = document.getElementById('offline-indicator');
    if (el) el.style.display = 'none';
  }
  
  async updateSyncBadge() {
    try {
      const count = (await dbManager.getUnsyncedTablets()).length;
      const badge = document.getElementById('sync-status');
      const stat = document.getElementById('stat-pending');
      
      if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
      }
      if (stat) stat.textContent = count;
    } catch (e) {}
  }

  setupRealtimeSync() {
    // (Igual que antes, solo suscribe y llama a handleRealtimeUpdate)
    try {
        this.realtimeSubscription = supabaseClient.subscribeToTablets(async (payload) => {
            const { eventType, new: newRec, old: oldRec } = payload;
            if (eventType === 'DELETE') {
                await dbManager.deleteTablet(oldRec.id);
            } else {
                await dbManager.saveTablet({ ...newRec, synced: true });
            }
            if (window.app) {
                await window.app.loadData();
                window.app.renderDashboard();
            }
        });
    } catch(e) { console.error(e); }
  }
}

const syncManager = new SyncManager();
