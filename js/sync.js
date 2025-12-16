// js/sync.js - Versión Final Corregida (Incluye manualSync)
class SyncManager {
  constructor() {
    this.isSyncing = false;
    this.syncInterval = null;
    this.realtimeSubscription = null;
  }

  init() {
    console.log('Initializing Sync Manager v3.2...'); 

    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // 1. Sincronización INMEDIATA al cargar
    if (navigator.onLine && this.isSupabaseAvailable()) {
      setTimeout(() => {
        console.log('Sync: Ejecutando carga inicial...');
        this.syncAll(false); // false = silencioso
      }, 1000);
    }

    // 2. Sincronización PERIÓDICA (Cada 30 segundos)
    this.syncInterval = setInterval(() => {
      if (navigator.onLine && !this.isSyncing && this.isSupabaseAvailable()) {
        this.syncAll(false);
      }
    }, 30000);

    if (navigator.onLine && this.isSupabaseAvailable()) {
      this.setupRealtimeSync();
    }

    this.updateSyncBadge();
  }

  isSupabaseAvailable() {
    return typeof supabaseClient !== 'undefined' && supabaseClient.isAvailable();
  }

  handleOnline() {
    console.log('Online detectado');
    this.hideOfflineIndicator();
    if (this.isSupabaseAvailable()) {
      this.syncAll(true);
      this.setupRealtimeSync();
    }
  }

  handleOffline() {
    console.log('Offline detectado');
    this.showOfflineIndicator();
  }

  // --- ESTA ES LA FUNCIÓN QUE FALTABA ---
  async manualSync() {
    if (!navigator.onLine) {
        showToast('Sin conexión a internet', 'warning');
        return;
    }
    if (this.isSyncing) {
        showToast('Ya se está sincronizando...', 'info');
        return;
    }
    
    showToast('Iniciando sincronización...', 'info');
    await this.syncAll(true); // true = mostrar mensajes de éxito/error
  }
  // --------------------------------------

  // Método para llamar tras guardar (silencioso pero inmediato)
  async triggerInstantSync() {
    if (navigator.onLine && !this.isSyncing && this.isSupabaseAvailable()) {
      console.log('⚡ Sync inmediata disparada');
      await this.syncAll(true);
    }
  }

  async syncAll(showMessages = true) {
    if (this.isSyncing || !navigator.onLine || !this.isSupabaseAvailable()) return;

    this.isSyncing = true;
    console.log(' Iniciando Sincronización...');

    try {
      // 1. BAJAR (Server -> Local)
      // Obtenemos tablets del servidor
      const serverTablets = await supabaseClient.getTablets();
      if (serverTablets && serverTablets.length > 0) {
        for (const t of serverTablets) {
          // Guardar y marcar como sincronizado
          await dbManager.saveTablet({ ...t, synced: true });
        }
      }

      // 2. SUBIR (Local -> Server)
      const pending = await dbManager.getUnsyncedTablets();
      if (pending.length > 0) {
        console.log(`Subiendo ${pending.length} tablets...`);
        for (const t of pending) {
          await this.syncTabletToServer(t);
        }
      }

      // 3. COLA (Borrados/Updates pendientes)
      await this.processSyncQueue();

      console.log('Sync completado.');
      if (showMessages) showToast('Sincronización completada', 'success');

      // 4. ACTUALIZAR PANTALLA (Para ver los cambios reflejados)
      if (window.app) {
        await window.app.loadData();
        window.app.renderDashboard();
        window.app.updateStatistics();
      }

    } catch (error) {
      console.error('Error Sync:', error);
      if (showMessages && !error.message.includes('fetch')) {
         showToast('Error sincronizando (revisa consola)', 'warning');
      }
    } finally {
      this.isSyncing = false;
      await this.updateSyncBadge();
    }
  }

  async syncTabletToServer(tablet) {
    try {
      // Limpiar campos internos antes de enviar (evitar enviar synced, etc al server si no existen en tabla)
      const { id, synced, last_synced_at, ...cleanData } = tablet;
      
      // Intentar Insertar/Actualizar (Upsert)
      const { data, error } = await supabaseClient.client
        .from('tablets')
        .upsert({ ...cleanData, id: id }) 
        .select()
        .single();

      if (error) throw error;

      // Si éxito, marcar como sync localmente
      await dbManager.saveTablet({ ...tablet, synced: true });

    } catch (e) {
      console.error('Error subiendo tablet:', e);
    }
  }

  async processSyncQueue() {
    const queue = await dbManager.getUnsyncedQueue();
    for (const item of queue) {
      if (item.operation === 'DELETE') {
        await supabaseClient.deleteTablet(item.record_id);
      }
      // UPDATE e INSERT ya se manejan en el paso 2 al subir unsyncedTablets,
      // pero si quedó algo en cola específico, lo marcamos:
      await dbManager.markQueueItemSynced(item.id);
    }
  }

  // UI Helpers
  showOfflineIndicator() { const el = document.getElementById('offline-indicator'); if(el) el.style.display='flex'; }
  hideOfflineIndicator() { const el = document.getElementById('offline-indicator'); if(el) el.style.display='none'; }
  
  async updateSyncBadge() {
    const count = (await dbManager.getUnsyncedTablets()).length;
    const badge = document.getElementById('sync-status');
    const stat = document.getElementById('stat-pending');
    if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
    if (stat) stat.textContent = count;
  }

  setupRealtimeSync() {
    try {
        supabaseClient.subscribeToTablets(async (payload) => {
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
    } catch(e) { console.warn(e); }
  }
}

const syncManager = new SyncManager();
