class SyncManager {
  constructor() {
    this.isSyncing = false;
    this.syncInterval = null;
    this.realtimeSubscription = null;
  }

  init() {
    console.log('SyncManager Init');
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Sync periódica (cada 30s)
    this.syncInterval = setInterval(() => {
      if (navigator.onLine && !this.isSyncing) this.syncAll(false);
    }, 30000);

    if (navigator.onLine) {
        // Sync inicial rápida
        setTimeout(() => this.syncAll(false), 1000);
        this.setupRealtimeSync();
    }
    this.updateSyncBadge();
  }

  handleOnline() {
    this.updateGlobalStatus('online');
    this.syncAll(true);
    this.setupRealtimeSync();
  }

  handleOffline() {
    this.updateGlobalStatus('offline');
    if(this.realtimeSubscription) {
        supabaseClient.unsubscribe(this.realtimeSubscription);
        this.realtimeSubscription = null;
    }
  }

  // --- CORRECCIÓN: Indicador Visual Global ---
  // Busca o crea un elemento en el header para mostrar estado
  updateGlobalStatus(state) {
      let statusEl = document.getElementById('global-sync-status');
      if (!statusEl) {
          // Si no existe, lo inyectamos en el header acciones
          const actions = document.querySelector('.header-actions');
          if (actions) {
              statusEl = document.createElement('div');
              statusEl.id = 'global-sync-status';
              statusEl.style.marginRight = '10px';
              statusEl.style.fontSize = '12px';
              statusEl.style.fontWeight = 'bold';
              actions.insertBefore(statusEl, actions.firstChild);
          }
      }
      
      if(!statusEl) return;

      if (state === 'syncing') {
          statusEl.textContent = '🔄 Sincronizando...';
          statusEl.style.color = 'orange';
      } else if (state === 'offline') {
          statusEl.textContent = '⚠️ Offline';
          statusEl.style.color = 'gray';
      } else if (state === 'online') {
          statusEl.textContent = '☁️ Conectado';
          statusEl.style.color = 'green';
      } else if (state === 'error') {
          statusEl.textContent = '❌ Error Sync';
          statusEl.style.color = 'red';
      }
  }

  async triggerInstantSync() {
    if (navigator.onLine && !this.isSyncing) {
        await this.syncAll(true);
    }
  }

  // --- CORRECCIÓN: Bloque finally para evitar que se "quede así" ---
  async syncAll(showToastMsg = true) {
    if (this.isSyncing || !navigator.onLine) return;
    
    this.isSyncing = true;
    this.updateGlobalStatus('syncing'); // Actualizar indicador visual

    try {
      if (!supabaseClient.isAvailable()) throw new Error('Supabase no disponible');

      // 1. Descargar cambios (Server -> Local)
      const serverTablets = await supabaseClient.getTablets();
      for (const st of serverTablets) {
          const lt = await dbManager.getTablet(st.id);
          // Si no existe o ya estaba sincronizado, sobrescribir con el servidor
          if (!lt || lt.synced) {
              await dbManager.saveTablet({ ...st, synced: true });
          }
      }

      // 2. Subir cambios (Local -> Server)
      const pending = await dbManager.getUnsyncedTablets();
      for (const t of pending) {
          await this.syncTabletToServer(t);
      }

      // 3. Procesar cola de eliminaciones/updates
      await this.processSyncQueue();

      if (showToastMsg) showToast('Sincronización completada', 'success');
      this.updateGlobalStatus('online');

      // 4. Actualizar UI
      if (window.app) {
          await window.app.loadData();
          window.app.renderDashboard();
          window.app.updateStatistics();
      }

    } catch (error) {
      console.error('Sync Error:', error);
      this.updateGlobalStatus('error');
      if (showToastMsg) showToast('Error al sincronizar (revisar consola)', 'error');
    } finally {
      this.isSyncing = false;
      this.updateSyncBadge();
    }
  }

  async syncTabletToServer(t) {
      const { id, synced, last_synced_at, ...data } = t;
      let res;
      
      // Intentar update primero
      try {
          const check = await supabaseClient.getTablet(id);
          if (check) {
              res = await supabaseClient.updateTablet(id, data);
          } else {
              res = await supabaseClient.createTablet(data);
          }
      } catch (e) {
          // Si falla creación por duplicado, intentar update buscando por código
          if (e.code === '23505') {
              const serverItems = await supabaseClient.getTablets({ search: data.codigo_unico });
              const match = serverItems.find(i => i.codigo_unico === data.codigo_unico);
              if (match) {
                  res = await supabaseClient.updateTablet(match.id, data);
              }
          }
      }

      if (res) {
          await dbManager.saveTablet({ ...t, id: res.id, synced: true });
      }
  }

  async processSyncQueue() {
      const queue = await dbManager.getUnsyncedQueue();
      for (const item of queue) {
          try {
              if (item.operation === 'DELETE') {
                  await supabaseClient.deleteTablet(item.record_id);
              }
              await dbManager.markQueueItemSynced(item.id);
          } catch (e) { console.error('Queue error', e); }
      }
  }

  updateSyncBadge() { /* ... (igual que antes) ... */ }
  
  setupRealtimeSync() {
      if(!supabaseClient.isAvailable()) return;
      this.realtimeSubscription = supabaseClient.subscribeToTablets(async (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              await dbManager.saveTablet({ ...payload.new, synced: true });
          } else if (payload.eventType === 'DELETE') {
              await dbManager.deleteTablet(payload.old.id);
          }
          if (window.app) {
             await window.app.loadData();
             window.app.renderDashboard();
          }
      });
  }
}

const syncManager = new SyncManager();
