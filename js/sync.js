// Sync Manager for Offline/Online synchronization
class SyncManager {
  constructor() {
    this.isSyncing = false;
    this.syncInterval = null;
    this.autoSyncEnabled = true;
  }

  // Initialize sync manager
  init() {
    // Listen for online/offline events
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Check initial connection status
    if (navigator.onLine) {
      this.handleOnline();
    } else {
      this.handleOffline();
    }

    // Auto-sync every 5 minutes when online
    this.startAutoSync();

    // Register background sync if supported
    this.registerBackgroundSync();
  }

  // Handle online event
  async handleOnline() {
    console.log('Connection restored - going online');
    this.hideOfflineIndicator();
    showToast('Conexión restaurada. Sincronizando datos...', 'success');
    
    // Wait a bit for connection to stabilize
    setTimeout(() => {
      this.syncAll();
    }, 1000);
  }

  // Handle offline event
  handleOffline() {
    console.log('Connection lost - going offline');
    this.showOfflineIndicator();
    showToast('Sin conexión. Trabajando en modo offline.', 'warning');
  }

  // Show offline indicator
  showOfflineIndicator() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
      indicator.style.display = 'flex';
    }
    this.updateSyncBadge();
  }

  // Hide offline indicator
  hideOfflineIndicator() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
  }

  // Start auto-sync interval
  startAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      if (this.autoSyncEnabled && navigator.onLine) {
        this.syncAll();
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  // Stop auto-sync
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // Register background sync
  async registerBackgroundSync() {
    try {
      if ('serviceWorker' in navigator && 'sync' in navigator.serviceWorker) {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('sync-tablets');
        console.log('Background sync registered');
      }
    } catch (error) {
      console.error('Background sync registration failed:', error);
    }
  }

  // Main sync function
  async syncAll() {
    if (this.isSyncing) {
      console.log('Sync already in progress');
      return;
    }

    if (!navigator.onLine) {
      console.log('Cannot sync - offline');
      return;
    }

    try {
      this.isSyncing = true;
      this.updateSyncButton(true);

      console.log('Starting full sync...');

      // Sync tablets from IndexedDB to Supabase
      await this.syncTabletsToServer();

      // Sync tablets from Supabase to IndexedDB
      await this.syncTabletsFromServer();

      // Process sync queue
      await this.processSyncQueue();

      // Update sync badge
      this.updateSyncBadge();

      console.log('Sync completed successfully');
      showToast('Sincronización completada', 'success');

    } catch (error) {
      console.error('Sync error:', error);
      showToast('Error al sincronizar: ' + error.message, 'error');
    } finally {
      this.isSyncing = false;
      this.updateSyncButton(false);
    }
  }

  // Sync unsynced tablets to server
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

          // Check if tablet exists on server (by codigo_unico)
          const existing = await this.checkTabletExists(tablet.codigo_unico);

          if (existing) {
            // Update existing
            serverTablet = await supabaseClient.updateTablet(existing.id, tablet);
          } else {
            // Create new
            const { id, synced, last_synced_at, ...tabletData } = tablet;
            serverTablet = await supabaseClient.createTablet(tabletData);
          }

          // Update local copy with server data
          tablet.id = serverTablet.id;
          tablet.synced = true;
          tablet.last_synced_at = new Date().toISOString();
          await dbManager.saveTablet(tablet);

          console.log(`Tablet ${tablet.codigo_unico} synced`);

        } catch (error) {
          console.error(`Error syncing tablet ${tablet.codigo_unico}:`, error);
          // Continue with next tablet
        }
      }

    } catch (error) {
      console.error('Error syncing tablets to server:', error);
      throw error;
    }
  }

  // Sync tablets from server to local
  async syncTabletsFromServer() {
    try {
      console.log('Fetching tablets from server...');
      
      const serverTablets = await supabaseClient.getTablets();
      
      console.log(`Received ${serverTablets.length} tablets from server`);

      for (const serverTablet of serverTablets) {
        try {
          const localTablet = await dbManager.getTablet(serverTablet.id);

          if (!localTablet) {
            // New tablet from server - save locally
            await dbManager.saveTablet({
              ...serverTablet,
              synced: true,
              last_synced_at: new Date().toISOString()
            });
          } else {
            // Compare timestamps and update if server is newer
            const serverTime = new Date(serverTablet.updated_at).getTime();
            const localTime = new Date(localTablet.updated_at).getTime();

            if (serverTime > localTime) {
              await dbManager.saveTablet({
                ...serverTablet,
                synced: true,
                last_synced_at: new Date().toISOString()
              });
            }
          }
        } catch (error) {
          console.error(`Error processing tablet ${serverTablet.id}:`, error);
        }
      }

    } catch (error) {
      console.error('Error syncing tablets from server:', error);
      throw error;
    }
  }

  // Process sync queue
  async processSyncQueue() {
    try {
      const queue = await dbManager.getUnsyncedQueue();
      
      if (queue.length === 0) {
        console.log('Sync queue is empty');
        return;
      }

      console.log(`Processing ${queue.length} items in sync queue...`);

      for (const item of queue) {
        try {
          switch (item.operation) {
            case 'INSERT':
              await supabaseClient.createTablet(item.data);
              break;
            case 'UPDATE':
              await supabaseClient.updateTablet(item.record_id, item.data);
              break;
            case 'DELETE':
              await supabaseClient.deleteTablet(item.record_id);
              break;
          }

          // Mark as synced
          await dbManager.markQueueItemSynced(item.id);
          console.log(`Queue item ${item.id} processed`);

        } catch (error) {
          console.error(`Error processing queue item ${item.id}:`, error);
          
          // Increment retry count
          item.retries = (item.retries || 0) + 1;
          
          // Remove from queue if too many retries
          if (item.retries > 5) {
            await dbManager.removeFromSyncQueue(item.id);
            console.log(`Queue item ${item.id} removed after ${item.retries} retries`);
          }
        }
      }

    } catch (error) {
      console.error('Error processing sync queue:', error);
      throw error;
    }
  }

  // Check if tablet exists on server
  async checkTabletExists(codigoUnico) {
    try {
      const tablets = await supabaseClient.getTablets({ search: codigoUnico });
      return tablets.find(t => t.codigo_unico === codigoUnico);
    } catch (error) {
      console.error('Error checking tablet existence:', error);
      return null;
    }
  }

  // Update sync button UI
  updateSyncButton(isSyncing) {
    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
      if (isSyncing) {
        syncBtn.classList.add('syncing');
      } else {
        syncBtn.classList.remove('syncing');
      }
    }
  }

  // Update sync badge with pending count
  async updateSyncBadge() {
    try {
      const unsyncedCount = await dbManager.count('tablets');
      const queueCount = await dbManager.count('syncQueue');
      const total = unsyncedCount + queueCount;

      const badge = document.getElementById('sync-status');
      if (badge) {
        if (total > 0) {
          badge.textContent = total;
          badge.style.display = 'flex';
        } else {
          badge.style.display = 'none';
        }
      }

      // Update stats
      const statPending = document.getElementById('stat-pending');
      if (statPending) {
        statPending.textContent = total;
      }

    } catch (error) {
      console.error('Error updating sync badge:', error);
    }
  }

  // Manual sync trigger
  async manualSync() {
    showToast('Iniciando sincronización...', 'info');
    await this.syncAll();
  }
}

// Export singleton
const syncManager = new SyncManager();

