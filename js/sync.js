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

    // Setup periodic sync (every 5 minutes)
    this.syncInterval = setInterval(() => {
      if (navigator.onLine && !this.isSyncing) {
        this.syncAll();
      }
    }, 5 * 60 * 1000);

    // Setup realtime subscription if online
    if (navigator.onLine) {
      this.setupRealtimeSync();
    }

    // Update sync badge on init
    this.updateSyncBadge();
  }

  // Handle online event
  handleOnline() {
    console.log('Connection restored - going online');
    this.hideOfflineIndicator();
    
    // Sync after a short delay
    setTimeout(() => {
      this.syncAll();
    }, 1000);

    // Setup realtime sync
    this.setupRealtimeSync();
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
    if (!navigator.onLine) return;

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

  // Sync all data
  async syncAll() {
    if (this.isSyncing || !navigator.onLine) {
      return;
    }

    this.isSyncing = true;
    console.log('Starting full sync...');

    try {
      // Sync tablets to server
      await this.syncTabletsToServer();

      // Sync tablets from server
      await this.syncTabletsFromServer();

      // Process sync queue
      await this.processSyncQueue();

      console.log('Full sync completed successfully');
      showToast('Sincronización completada', 'success');

    } catch (error) {
      console.error('Sync error:', error);
      showToast('Error en la sincronización: ' + error.message, 'error');
    } finally {
      this.isSyncing = false;
      await this.updateSyncBadge();
    }
  }

  // Sync unsynced tablets to server - CORREGIDO CON MANEJO DE DUPLICADOS
  async syncTabletsToServer() {
    try {
      const unsyncedTablets = await dbManager.getUnsyncedTablets();
      
      if (unsyncedTablets.length === 0) {
        console.log('No unsynced tablets to upload');
        return;
      }

      console.log(`Syncing ${unsyncedTablets.length} tablets to server...`);

      for (const tablet of unsyncedTablets) {
        try {
          let serverTablet;

          // Check if tablet exists on server (by codigo_unico o numero_serie)
          const existing = await this.checkTabletExistsByMultipleFields(tablet);

          if (existing) {
            console.log(`Tablet ${tablet.codigo_unico} already exists on server, updating...`);
            // Update existing
            serverTablet = await supabaseClient.updateTablet(existing.id, tablet);
          } else {
            // Create new - remover campos que no deben enviarse
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

          console.log(`Tablet ${tablet.codigo_unico} synced successfully`);

        } catch (error) {
          console.error(`Error syncing tablet ${tablet.codigo_unico}:`, error);
          
          // Si es error de duplicado, buscar y actualizar
          if (error.code === '23505') {
            console.log(`Duplicate detected for ${tablet.codigo_unico}, attempting to find and update...`);
            try {
              const existing = await this.checkTabletExistsByMultipleFields(tablet);
              if (existing) {
                const serverTablet = await supabaseClient.updateTablet(existing.id, tablet);
                const updatedTablet = {
                  ...tablet,
                  id: serverTablet.id,
                  synced: true,
                  last_synced_at: new Date().toISOString()
                };
                await dbManager.saveTablet(updatedTablet);
                console.log(`Tablet ${tablet.codigo_unico} updated after duplicate detection`);
              }
            } catch (retryError) {
              console.error(`Failed to recover from duplicate:`, retryError);
            }
          }
        }
      }

    } catch (error) {
      console.error('Error syncing tablets to server:', error);
      throw error;
    }
  }

  // Check if tablet exists on server by multiple fields - NUEVO
  async checkTabletExistsByMultipleFields(tablet) {
    try {
      // Buscar por código único primero
      let tablets = await supabaseClient.getTablets({ search: tablet.codigo_unico });
      let found = tablets.find(t => t.codigo_unico === tablet.codigo_unico);
      
      if (found) return found;

      // Si no se encuentra, buscar por número de serie
      if (tablet.numero_serie) {
        tablets = await supabaseClient.getTablets({ search: tablet.numero_serie });
        found = tablets.find(t => t.numero_serie === tablet.numero_serie);
      }
      
      return found || null;
    } catch (error) {
      console.error('Error checking tablet existence:', error);
      return null;
    }
  }

  // Check if tablet exists on server - MANTENER POR COMPATIBILIDAD
  async checkTabletExists(codigoUnico) {
    return this.checkTabletExistsByMultipleFields({ codigo_unico: codigoUnico });
  }

  // Sync tablets from server
  async syncTabletsFromServer() {
    try {
      console.log('Fetching tablets from server...');

      const serverTablets = await supabaseClient.getTablets();
      console.log(`Received ${serverTablets.length} tablets from server`);

      for (const serverTablet of serverTablets) {
        const localTablet = await dbManager.getTablet(serverTablet.id);

        if (!localTablet) {
          // New tablet from server
          await dbManager.saveTablet({ ...serverTablet, synced: true });
        } else {
          // Check if server version is newer
          const serverDate = new Date(serverTablet.updated_at || serverTablet.created_at);
          const localDate = new Date(localTablet.updated_at || localTablet.created_at);

          if (serverDate > localDate) {
            // Server version is newer, update local
            await dbManager.saveTablet({ ...serverTablet, synced: true });
          }
        }
      }

      console.log('Tablets synced from server successfully');

    } catch (error) {
      console.error('Error syncing tablets from server:', error);
      throw error;
    }
  }

  // Process sync queue
  async processSyncQueue() {
    try {
      const queueItems = await dbManager.getUnsyncedQueue();

      if (queueItems.length === 0) {
        console.log('No items in sync queue');
        return;
      }

      console.log(`Processing ${queueItems.length} items from sync queue...`);

      for (const item of queueItems) {
        try {
          await this.processSyncQueueItem(item);
          await dbManager.markQueueItemSynced(item.id);
        } catch (error) {
          console.error(`Error processing queue item ${item.id}:`, error);
          
          // Increment retry count
          item.retries = (item.retries || 0) + 1;
          
          // Remove from queue if max retries reached
          if (item.retries >= 3) {
            console.log(`Max retries reached for queue item ${item.id}, removing...`);
            await dbManager.removeFromSyncQueue(item.id);
          }
        }
      }

      console.log('Sync queue processed successfully');

    } catch (error) {
      console.error('Error processing sync queue:', error);
      throw error;
    }
  }

  // Process individual sync queue item - CORREGIDO CON MANEJO DE DUPLICADOS
  async processSyncQueueItem(item) {
    const { operation, table_name, record_id, data } = item;

    try {
      switch (operation) {
        case 'INSERT':
          // Verificar si ya existe antes de insertar
          const existing = await this.checkTabletExistsByMultipleFields(data);
          if (existing) {
            console.log(`Tablet already exists, updating instead of inserting`);
            await supabaseClient.updateTablet(existing.id, data);
          } else {
            await supabaseClient.createTablet(data);
          }
          break;

        case 'UPDATE':
          await supabaseClient.updateTablet(record_id, data);
          break;

        case 'DELETE':
          await supabaseClient.deleteTablet(record_id);
          break;

        default:
          console.warn(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      // Si es error de duplicado en INSERT, intentar UPDATE
      if (error.code === '23505' && operation === 'INSERT') {
        console.log(`Duplicate key error, attempting update...`);
        const existing = await this.checkTabletExistsByMultipleFields(data);
        if (existing) {
          await supabaseClient.updateTablet(existing.id, data);
        } else {
          throw error; // Re-lanzar si no se puede recuperar
        }
      } else {
        throw error; // Re-lanzar otros errores
      }
    }
  }

  // Manual sync triggered by user
  async manualSync() {
    if (!navigator.onLine) {
      showToast('No hay conexión a internet', 'warning');
      return;
    }

    if (this.isSyncing) {
      showToast('Sincronización en proceso...', 'info');
      return;
    }

    showToast('Iniciando sincronización...', 'info');
    await this.syncAll();
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
