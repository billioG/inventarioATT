// Sync Manager for Online/Offline Synchronization
class SyncManager {
  constructor() {
    this.isSyncing = false;
    this.syncInterval = null;
    this.realtimeSubscription = null;
  }

  // Initialize sync manager
  init() {
    console.log('Initializing Sync Manager...');

    // Listen for online/offline events
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Check initial connection state
    if (navigator.onLine) {
      this.handleOnline();
    } else {
      this.handleOffline();
    }

    // FORZAR SINCRONIZACIÓN INICIAL AL CARGAR
    if (navigator.onLine && supabaseClient.isAvailable()) {
      console.log('Sync: Iniciando sincronización automática inicial...');
      setTimeout(() => {
        this.syncAll();
      }, 2000); // Esperar 2 segundos para que todo esté listo
    }

    // Setup periodic sync (MEJORADO: Cada 30 segundos en lugar de 5 minutos)
    this.syncInterval = setInterval(() => {
      if (navigator.onLine && !this.isSyncing && supabaseClient.isAvailable()) {
        console.log('Sync: Ejecutando sincronización periódica...');
        this.syncAll();
      }
    }, 30 * 1000); // 30 segundos

    // Setup realtime subscription if online
    if (navigator.onLine && supabaseClient.isAvailable()) {
      this.setupRealtimeSync();
    }

    // Update sync badge on init
    this.updateSyncBadge();
  }

  // Handle online event
  handleOnline() {
    console.log('Connection restored - going online');
    this.hideOfflineIndicator();
    
    // Sync after a short delay (solo si Supabase está disponible)
    if (supabaseClient.isAvailable()) {
      setTimeout(() => {
        this.syncAll();
      }, 1000);

      // Setup realtime sync
      this.setupRealtimeSync();
    } else {
      console.log('Supabase not available, working in offline mode');
    }
  }

  // Handle offline event
  handleOffline() {
    console.log('Connection lost - going offline');
    this.showOfflineIndicator();

    // Unsubscribe from realtime updates
    if (this.realtimeSubscription) {
      supabaseClient.unsubscribe(this.realtimeSubscription);
      this.realtimeSubscription = null;
    }
  }

  // NUEVO: Disparador de sincronización instantánea (llamado desde app.js al guardar)
  async triggerInstantSync() {
    if (navigator.onLine && !this.isSyncing && supabaseClient.isAvailable()) {
      console.log('⚡ Sync: Sincronización inmediata disparada');
      try {
        await this.syncAll();
      } catch (error) {
        console.warn('Sync background error:', error);
      }
    }
  }

  // Show offline indicator
  showOfflineIndicator() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
      indicator.style.display = 'flex';
    }
  }

  // Hide offline indicator
  hideOfflineIndicator() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
  }

  // Setup realtime synchronization
  setupRealtimeSync() {
    if (!navigator.onLine || !supabaseClient.isAvailable()) {
      console.log('Cannot setup realtime sync: offline or Supabase not available');
      return;
    }

    try {
      this.realtimeSubscription = supabaseClient.subscribeToTablets((payload) => {
        console.log('Realtime update received:', payload);
        this.handleRealtimeUpdate(payload);
      });
    } catch (error) {
      console.error('Error setting up realtime sync:', error);
    }
  }

  // Handle realtime update
  async handleRealtimeUpdate(payload) {
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload;

      switch (eventType) {
        case 'INSERT':
          await dbManager.saveTablet({ ...newRecord, synced: true });
          showToast('Nueva tablet sincronizada desde el servidor', 'info');
          break;

        case 'UPDATE':
          await dbManager.saveTablet({ ...newRecord, synced: true });
          showToast('Tablet actualizada desde el servidor', 'info');
          break;

        case 'DELETE':
          await dbManager.deleteTablet(oldRecord.id);
          showToast('Tablet eliminada desde el servidor', 'info');
          break;
      }

      // Reload data in app
      if (window.app) {
        await window.app.loadData();
      }

    } catch (error) {
      console.error('Error handling realtime update:', error);
    }
  }

  // Sync all data - BIDIRECCIONAL MEJORADO
  async syncAll() {
    if (this.isSyncing || !navigator.onLine || !supabaseClient.isAvailable()) {
      if (!navigator.onLine) {
        console.log('Cannot sync: offline');
      } else if (!supabaseClient.isAvailable()) {
        console.log('Cannot sync: Supabase not available');
      }
      return;
    }

    this.isSyncing = true;
    console.log('Starting full bidirectional sync...');

    try {
      // PASO 1: Sincronizar cambios del servidor a local PRIMERO (Server -> Local)
      await this.syncServerToLocal();

      // PASO 2: Sincronizar cambios locales al servidor (Local -> Server)
      await this.syncLocalToServer();

      // PASO 3: Procesar cola de sincronización pendiente
      await this.processSyncQueue();

      console.log('Full bidirectional sync completed successfully');
      // showToast('Sincronización completada', 'success'); // Comentado para no spamear al usuario cada 30s

    } catch (error) {
      console.error('Sync error:', error);
      // showToast('Error en la sincronización: ' + error.message, 'error');
    } finally {
      this.isSyncing = false;
      await this.updateSyncBadge();
    }
  }

  // PASO 1: Sincronizar cambios del servidor a local (MEJORADO)
  async syncServerToLocal() {
    if (!supabaseClient.isAvailable()) {
      console.log('Skipping server to local sync: Supabase not available');
      return;
    }

    try {
      console.log('Fetching tablets from server...');
      const serverTablets = await supabaseClient.getTablets();
      console.log(`Received ${serverTablets.length} tablets from server`);

      for (const serverTablet of serverTablets) {
        try {
          await this.syncTabletToLocal(serverTablet);
        } catch (error) {
          console.error(`Error syncing tablet ${serverTablet.codigo_unico} to local:`, error);
        }
      }

      console.log('Server to local sync completed');

    } catch (error) {
      console.error('Error in server to local sync:', error);
      throw error;
    }
  }

  // Sincronizar una tablet del servidor a local
  async syncTabletToLocal(serverTablet) {
    try {
      const localTablet = await dbManager.getTablet(serverTablet.id);

      if (!localTablet) {
        // No existe localmente - crear
        console.log(`Adding new tablet ${serverTablet.codigo_unico} from server to local`);
        await dbManager.saveTablet({ ...serverTablet, synced: true });
      } else {
        // Existe - siempre actualizar con datos del servidor si no hay cambios locales pendientes
        if (localTablet.synced) {
          // Ya está sincronizado, actualizar con versión del servidor
          // console.log(`Updating tablet ${serverTablet.codigo_unico} from server`);
          await dbManager.saveTablet({ ...serverTablet, synced: true });
        } else {
          // Tiene cambios locales no sincronizados, no sobrescribir
          console.log(`Local has unsynced changes for ${localTablet.codigo_unico}, keeping local version`);
        }
      }
    } catch (error) {
      console.error(`Error syncing tablet ${serverTablet.codigo_unico} to local:`, error);
      throw error;
    }
  }

  // PASO 2: Sincronizar cambios locales al servidor
  async syncLocalToServer() {
    if (!supabaseClient.isAvailable()) {
      console.log('Skipping local to server sync: Supabase not available');
      return;
    }

    try {
      const unsyncedTablets = await dbManager.getUnsyncedTablets();
      
      if (unsyncedTablets.length === 0) {
        // console.log('No local changes to sync to server');
        return;
      }

      console.log(`Syncing ${unsyncedTablets.length} local tablets to server...`);

      for (const tablet of unsyncedTablets) {
        try {
          await this.syncTabletToServer(tablet);
        } catch (error) {
          console.error(`Error syncing tablet ${tablet.codigo_unico}:`, error);
        }
      }

      console.log('Local to server sync completed');

    } catch (error) {
      console.error('Error in local to server sync:', error);
      throw error;
    }
  }

  // Sincronizar una tablet individual al servidor
  async syncTabletToServer(tablet) {
    if (!supabaseClient.isAvailable()) {
      throw new Error('Supabase not available');
    }

    try {
      // Buscar si existe en el servidor
      const existing = await this.findTabletOnServer(tablet);

      let serverTablet;

      if (existing) {
        // Ya existe - actualizar
        console.log(`Tablet ${tablet.codigo_unico} exists on server, updating...`);
        serverTablet = await supabaseClient.updateTablet(existing.id, tablet);
      } else {
        // No existe - crear nuevo
        console.log(`Creating new tablet ${tablet.codigo_unico} on server...`);
        const { id, synced, last_synced_at, ...tabletData } = tablet;
        serverTablet = await supabaseClient.createTablet(tabletData);
      }

      // Actualizar local con ID del servidor y marcar como sincronizado
      const updatedTablet = {
        ...tablet,
        id: serverTablet.id,
        synced: true,
        last_synced_at: new Date().toISOString()
      };
      
      await dbManager.saveTablet(updatedTablet);
      console.log(`Tablet ${tablet.codigo_unico} synced to server successfully`);

    } catch (error) {
      // Manejo especial de duplicados
      if (error.code === '23505') {
        console.log(`Duplicate key error for ${tablet.codigo_unico}, attempting recovery...`);
        const existing = await this.findTabletOnServer(tablet);
        if (existing) {
          await supabaseClient.updateTablet(existing.id, tablet);
          const updatedTablet = {
            ...tablet,
            id: existing.id, // IMPORTANTE: Usar ID del servidor
            synced: true,
            last_synced_at: new Date().toISOString()
          };
          await dbManager.saveTablet(updatedTablet);
          console.log(`Recovered from duplicate error for ${tablet.codigo_unico}`);
        }
      } else {
        throw error;
      }
    }
  }

  // PASO 3: Procesar cola de sincronización
  async processSyncQueue() {
    if (!supabaseClient.isAvailable()) {
      console.log('Skipping sync queue: Supabase not available');
      return;
    }

    try {
      const queueItems = await dbManager.getUnsyncedQueue();

      if (queueItems.length === 0) {
        // console.log('No items in sync queue');
        return;
      }

      console.log(`Processing ${queueItems.length} items from sync queue...`);

      for (const item of queueItems) {
        try {
          await this.processSyncQueueItem(item);
          await dbManager.markQueueItemSynced(item.id);
        } catch (error) {
          console.error(`Error processing queue item ${item.id}:`, error);
          
          // Incrementar contador de reintentos
          const updatedItem = await dbManager.get('syncQueue', item.id);
          if (updatedItem) {
            updatedItem.retries = (updatedItem.retries || 0) + 1;
            
            if (updatedItem.retries >= 3) {
              console.log(`Max retries reached for queue item ${item.id}, removing...`);
              await dbManager.removeFromSyncQueue(item.id);
            } else {
              await dbManager.put('syncQueue', updatedItem);
            }
          }
        }
      }

      console.log('Sync queue processed successfully');

    } catch (error) {
      console.error('Error processing sync queue:', error);
      throw error;
    }
  }

  // Procesar un item individual de la cola
  async processSyncQueueItem(item) {
    if (!supabaseClient.isAvailable()) {
      throw new Error('Supabase not available');
    }

    const { operation, table_name, record_id, data } = item;

    try {
      switch (operation) {
        case 'INSERT':
          const existing = await this.findTabletOnServer(data);
          if (existing) {
            console.log(`Tablet already exists, updating instead of inserting`);
            await supabaseClient.updateTablet(existing.id, data);
            // Actualizar local con el ID correcto
            await dbManager.saveTablet({ ...data, id: existing.id, synced: true });
          } else {
            const created = await supabaseClient.createTablet(data);
            // Actualizar local con el ID del servidor
            await dbManager.saveTablet({ ...data, id: created.id, synced: true });
          }
          break;

        case 'UPDATE':
          await supabaseClient.updateTablet(record_id, data);
          await dbManager.saveTablet({ ...data, id: record_id, synced: true });
          break;

        case 'DELETE':
          await supabaseClient.deleteTablet(record_id);
          break;

        default:
          console.warn(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      if (error.code === '23505' && operation === 'INSERT') {
        console.log(`Duplicate key error, attempting update...`);
        const existing = await this.findTabletOnServer(data);
        if (existing) {
          await supabaseClient.updateTablet(existing.id, data);
          await dbManager.saveTablet({ ...data, id: existing.id, synced: true });
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
  }

  // Buscar tablet en el servidor por múltiples criterios
  async findTabletOnServer(tablet) {
    if (!supabaseClient.isAvailable()) {
      return null;
    }

    try {
      // Buscar por ID si existe
      if (tablet.id) {
        try {
          const found = await supabaseClient.getTablet(tablet.id);
          if (found) return found;
        } catch (error) {
          // No existe con ese ID, continuar buscando
        }
      }

      // Buscar por código único
      if (tablet.codigo_unico) {
        const tablets = await supabaseClient.getTablets({ search: tablet.codigo_unico });
        const found = tablets.find(t => t.codigo_unico === tablet.codigo_unico);
        if (found) return found;
      }

      // Buscar por número de serie
      if (tablet.numero_serie) {
        const tablets = await supabaseClient.getTablets({ search: tablet.numero_serie });
        const found = tablets.find(t => t.numero_serie === tablet.numero_serie);
        if (found) return found;
      }

      return null;
    } catch (error) {
      console.error('Error finding tablet on server:', error);
      return null;
    }
  }

  // Manual sync triggered by user
  async manualSync() {
    if (!navigator.onLine) {
      showToast('No hay conexión a internet', 'warning');
      return;
    }

    if (!supabaseClient.isAvailable()) {
      showToast('Supabase no está disponible. Recarga la página.', 'warning');
      return;
    }

    if (this.isSyncing) {
      showToast('Sincronización en proceso...', 'info');
      return;
    }

    showToast('Iniciando sincronización...', 'info');
    await this.syncAll();
    
    // Recargar vista después de sincronizar
    if (window.app) {
      await window.app.loadData();
      window.app.renderDashboard();
    }
  }

  // Update sync badge
  async updateSyncBadge() {
    try {
      const unsyncedCount = (await dbManager.getUnsyncedTablets()).length;
      const badge = document.getElementById('sync-status');

      if (badge) {
        if (unsyncedCount > 0) {
          badge.textContent = unsyncedCount;
          badge.style.display = 'flex';
        } else {
          badge.style.display = 'none';
        }
      }

      // Update stats
      const statPending = document.getElementById('stat-pending');
      if (statPending) {
        statPending.textContent = unsyncedCount;
      }

    } catch (error) {
      console.error('Error updating sync badge:', error);
    }
  }

  // Cleanup
  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    if (this.realtimeSubscription) {
      supabaseClient.unsubscribe(this.realtimeSubscription);
    }

    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }
}

// Export singleton
const syncManager = new SyncManager();
