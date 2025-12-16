// Main Application - Versión Final Completa
class TabletInventoryApp {
  constructor() {
    this.currentView = 'dashboard';
    this.currentTablet = null;
    this.tablets = [];
    this.filteredTablets = [];
    
    // MAPA DE SEDES: Convierte códigos internos a nombres reales
    this.sedeMap = {
      'Sede Central': 'Sanarate (EP)',
      'Sede Norte': 'La Pedrera (LP)',
      'Sede Sur': 'San Juan Sacatepéquez (SJ)',
      'Sede Este': 'Santo Domingo Xenacoj (SDX)',
      'Sede Oeste': 'Sin sede'
    };
  }

  // --- INICIALIZACIÓN ---
  async init() {
    try {
      console.log('=== INICIANDO APP vFinal ===');
      
      // Timeout de seguridad: Si la app no carga en 5s, fuerza el desbloqueo
      this.forceHideSplashAfterTimeout();
      
      console.log('1. Iniciando BD...');
      await dbManager.init();

      console.log('2. Iniciando Supabase...');
      // Intentar iniciar Supabase sin bloquear si falla (modo offline)
      try {
        if (typeof supabaseClient !== 'undefined') {
            supabaseClient.init();
        }
      } catch (e) {
        console.warn('Supabase offline:', e);
      }

      console.log('3. Verificando Auth...');
      const isAuthenticated = await authManager.init();

      if (!isAuthenticated) {
        console.log('Usuario no autenticado > Login');
        this.hideSplashScreen();
        this.showLoginPage();
        return;
      }

      console.log('Usuario autenticado > Cargando módulos...');
      authManager.setupAuthListener();
      
      // Inicializar SyncManager (Debe ser la versión v3 que te di)
      if (typeof syncManager !== 'undefined') {
          syncManager.init();
      }

      await this.registerServiceWorker();

      console.log('4. Cargando datos...');
      await this.loadData();

      console.log('5. Configurando UI...');
      this.setupEventListeners();

      this.hideSplashScreen();
      this.showApp();
      this.updateUI();
      
      console.log('=== APP LISTA ===');

    } catch (error) {
      console.error('❌ Error Crítico:', error);
      this.hideSplashScreen();
      // Si falla todo, mostrar botón de pánico
      if (!document.getElementById('app') || document.getElementById('app').style.display === 'none') {
          this.showPanicError(error);
      }
    }
  }

  forceHideSplashAfterTimeout() {
    setTimeout(() => {
      const splash = document.getElementById('splash-screen');
      if (splash && splash.style.display !== 'none') {
        console.warn('⚠️ Timeout splash screen');
        this.hideSplashScreen();
        if ((!document.getElementById('app') || document.getElementById('app').style.display === 'none') && !document.getElementById('login-container')) {
             this.showLoginPage();
        }
      }
    }, 5000);
  }

  showPanicError(error) {
      document.body.innerHTML = `
        <div style="padding:20px; text-align:center; font-family:sans-serif;">
          <h2 style="color:red">Error de Carga</h2>
          <p>${error.message}</p>
          <button onclick="window.location.reload()" style="padding:10px 20px; margin:10px">Recargar</button>
          <button onclick="localStorage.clear(); window.location.reload()" style="padding:10px 20px; background:red; color:white">Reset Total</button>
        </div>
      `;
  }

  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        // Usar ruta relativa segura
        const swPath = window.location.hostname === 'localhost' ? '/sw.js' : './sw.js';
        const reg = await navigator.serviceWorker.register(swPath);
        
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('¡Nueva versión! Recargando...', 'success');
              setTimeout(() => window.location.reload(), 1500);
            }
          });
        });
      } catch (e) { console.log('SW Error:', e); }
    }
  }

  // --- PANTALLAS Y NAVEGACIÓN ---
  showLoginPage() {
    const splash = document.getElementById('splash-screen');
    const app = document.getElementById('app');
    if (splash) splash.style.display = 'none';
    if (app) app.style.display = 'none';

    if (document.getElementById('login-container')) return;

    const div = document.createElement('div');
    div.id = 'login-container';
    div.className = 'login-container';
    div.innerHTML = `
        <div class="login-card">
          <div style="font-size: 40px; margin-bottom: 15px;">📱</div>
          <h1>Inventario Tablets</h1>
          <form id="login-form">
            <div class="form-group">
              <label>Email</label>
              <input type="email" id="login-email" required autocomplete="email">
            </div>
            <div class="form-group">
              <label>Contraseña</label>
              <input type="password" id="login-password" required autocomplete="current-password">
            </div>
            <button type="submit" class="btn-primary btn-block">Entrar</button>
          </form>
          <div id="login-error" style="display:none; color:red; margin-top:10px"></div>
        </div>
    `;
    document.body.appendChild(div);

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleLogin();
    });
  }

  async handleLogin() {
    try {
      const email = document.getElementById('login-email').value;
      const pass = document.getElementById('login-password').value;
      showToast('Entrando...', 'info');
      
      await authManager.signIn(email, pass);
      window.location.reload();
    } catch (error) {
      const errDiv = document.getElementById('login-error');
      errDiv.textContent = error.message;
      errDiv.style.display = 'block';
    }
  }

  showApp() {
    const app = document.getElementById('app');
    if (app) app.style.display = 'block';
    const login = document.getElementById('login-container');
    if (login) login.remove();
  }

  hideSplashScreen() {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.style.opacity = '0';
      setTimeout(() => splash.style.display = 'none', 300);
    }
  }

  showView(viewName) {
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    const view = document.getElementById(`${viewName}-view`);
    if (view) {
      view.classList.add('active');
      this.currentView = viewName;
      if (viewName === 'dashboard') this.renderDashboard();
      if (viewName === 'form') this.renderForm();
    }
  }

  // --- GESTIÓN DE DATOS ---
  async loadData() {
    try {
      this.tablets = await dbManager.getAllTablets();
      this.filteredTablets = [...this.tablets];
      console.log(`Datos cargados: ${this.tablets.length} tablets`);
      
      // Intentar disparar sync silencioso si hay red
      if (navigator.onLine && typeof syncManager !== 'undefined') {
         syncManager.triggerInstantSync().catch(e => console.log('Sync bg:', e));
      }
    } catch (error) {
      console.error('Error loadData:', error);
      showToast('Error cargando datos locales', 'error');
    }
  }

  // --- TARJETAS (DISEÑO CORREGIDO) ---
  createTabletCard(tablet) {
    const card = document.createElement('div');
    card.className = 'tablet-card';
    card.onclick = () => this.showTabletDetail(tablet.id);

    const statusClass = this.getStatusClass(tablet.estado_pantalla);
    
    // Icono nube: Muestra nube si está sincronizado, reloj si está pendiente
    const syncIcon = tablet.synced ? '' : '<span title="Pendiente subir">☁️⏳</span>';
    
    // Nombre Sede Real
    const nombreSede = this.sedeMap[tablet.sede_procedencia] || tablet.sede_procedencia || 'Sin sede';
    
    // Título: Nombre Producto > Modelo > Código
    const titulo = tablet.nombre_producto || tablet.modelo || tablet.codigo_unico;
    
    // Subtítulo: Serie
    const serie = tablet.numero_serie ? `Serie: ${tablet.numero_serie}` : 'Sin N/S';

    card.innerHTML = `
      <div class="tablet-card-header">
        <h3>${titulo}</h3>
        ${syncIcon}
      </div>
      <div class="tablet-card-body">
        <p style="font-weight:bold; color:#444; margin-bottom:5px;">${serie}</p>
        <p class="tablet-sede">${nombreSede}</p>
        <div class="tablet-status">
          <span class="status-badge ${statusClass}">${tablet.estado_pantalla}</span>
        </div>
      </div>
      <div class="tablet-card-footer">
        <span class="tablet-date">${this.formatDate(tablet.fecha_mantenimiento)}</span>
        <span class="tablet-battery">${tablet.nivel_bateria || 0}%</span>
      </div>
    `;
    return card;
  }

  renderTabletsList() {
    const container = document.getElementById('tablets-list');
    const emptyState = document.getElementById('empty-state');
    if (!container) return;
    
    container.innerHTML = '';

    if (this.filteredTablets.length === 0) {
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    this.filteredTablets.forEach(tablet => {
      container.appendChild(this.createTabletCard(tablet));
    });
  }

  // --- FORMULARIO Y GUARDADO (CON SYNC INMEDIATO) ---
  async handleFormSubmit(e) {
    e.preventDefault();

    try {
      const formData = new FormData(e.target);
      // Construir objeto manualmente para asegurar tipos
      const tabletData = {
        codigo_unico: formData.get('codigo_unico'),
        numero_serie: formData.get('numero_serie'),
        modelo: formData.get('modelo'),
        nombre_producto: formData.get('nombre_producto') || null,
        numero_modelo: formData.get('numero_modelo') || null,
        sede_procedencia: formData.get('sede_procedencia'),
        version_android: formData.get('version_android') || null,
        nivel_bateria: parseInt(formData.get('nivel_bateria')) || 0,
        estado_pantalla: formData.get('estado_pantalla'),
        estado_pantalla_otro: formData.get('estado_pantalla_otro') || null,
        estado_puerto_carga: formData.get('estado_puerto_carga'),
        estado_fisico_general: formData.get('estado_fisico_general'),
        estado_fisico_otro: formData.get('estado_fisico_otro') || null,
        tiene_cargador: formData.get('tiene_cargador') === 'on',
        tiene_cable: formData.get('tiene_cable') === 'on',
        observaciones: formData.get('observaciones') || null,
        hallazgos_relevantes: formData.get('hallazgos_relevantes') || null,
        fecha_mantenimiento: formData.get('fecha_mantenimiento'),
        synced: false // Importante: Empieza falso para forzar subida
      };

      if (this.currentTablet) {
        // ACTUALIZAR
        tabletData.id = this.currentTablet.id;
        tabletData.created_at = this.currentTablet.created_at; // Mantener fecha creación
        
        await dbManager.saveTablet(tabletData);
        await dbManager.addToSyncQueue('UPDATE', 'tablets', tabletData.id, tabletData);
        showToast('Actualizado localmente', 'success');
      } else {
        // CREAR NUEVO
        tabletData.id = this.generateUUID();
        
        // Verificar duplicado local
        const exists = await dbManager.searchTablets(tabletData.codigo_unico);
        if (exists.length > 0) {
            if (!confirm('Este código ya existe localmente. ¿Sobrescribir?')) return;
            tabletData.id = exists[0].id; // Usar ID existente
            await dbManager.saveTablet(tabletData);
            await dbManager.addToSyncQueue('UPDATE', 'tablets', tabletData.id, tabletData);
        } else {
            await dbManager.saveTablet(tabletData);
            await dbManager.addToSyncQueue('INSERT', 'tablets', tabletData.id, tabletData);
        }
        showToast('Guardado. Subiendo...', 'success');
      }

      // SYNC INMEDIATO (Dispara la subida a Supabase ya mismo)
      if (typeof syncManager !== 'undefined') {
          syncManager.triggerInstantSync().catch(console.error);
      }

      this.showView('dashboard');

    } catch (error) {
      console.error('Save error:', error);
      showToast('Error al guardar: ' + error.message, 'error');
    }
  }

  // --- OCR Y CÁMARA (CORREGIDO) ---
  async processOCR(imageSource) {
    try {
      // Mostrar preview
      const preview = document.getElementById('ocr-preview');
      const previewImg = document.getElementById('ocr-preview-image');
      if (preview && previewImg) {
        preview.style.display = 'block';
        previewImg.src = URL.createObjectURL(imageSource instanceof Blob ? imageSource : imageSource);
      }

      const info = await ocrManager.processImage(imageSource);

      // ASIGNACIÓN DE CAMPOS (Reglas estrictas)
      const setVal = (id, val) => { if (document.getElementById(id) && val) document.getElementById(id).value = val; };

      setVal('modelo', info.modelo);
      setVal('numero_serie', info.numero_serie);
      setVal('version_android', info.version_android);

      if (info.nombre_producto) {
          setVal('nombre_producto', info.nombre_producto);
          // Regla: Nombre producto va también a número de modelo
          setVal('numero_modelo', info.nombre_producto);
      }

      // Si OCR encontró un num modelo explícito diferente, úsalo
      if (info.numero_modelo && info.numero_modelo !== info.nombre_producto) {
          setVal('numero_modelo', info.numero_modelo);
      }

      showToast('Datos leídos. Verifica los campos.', 'success');

    } catch (error) {
      console.error('OCR Error:', error);
      showToast('No se pudieron leer datos (OCR falló)', 'warning');
    }
  }

  // --- DETALLES Y EDICIÓN ---
  async showTabletDetail(id) {
    this.currentTablet = await dbManager.getTablet(id);
    if (!this.currentTablet) return showToast('Tablet no encontrada', 'error');

    this.showView('detail');
    
    const content = document.getElementById('tablet-detail-content');
    if (content) {
        // Reutilizamos la lógica de la tarjeta para mostrar info básica en el detalle
        // Pero idealmente aquí va el HTML detallado completo.
        // Por brevedad, genero el HTML detallado aquí:
        const t = this.currentTablet;
        const nombreSede = this.sedeMap[t.sede_procedencia] || t.sede_procedencia;
        
        content.innerHTML = `
          <div class="detail-section">
            <h3>Datos Principales</h3>
            <p><strong>Producto:</strong> ${t.nombre_producto || '-'}</p>
            <p><strong>Serie:</strong> ${t.numero_serie || '-'}</p>
            <p><strong>Modelo:</strong> ${t.modelo || '-'}</p>
            <p><strong>Sede:</strong> ${nombreSede}</p>
            <p><strong>Código:</strong> ${t.codigo_unico}</p>
          </div>
          <div class="detail-section">
            <h3>Estado</h3>
            <p><strong>Pantalla:</strong> <span class="status-badge ${this.getStatusClass(t.estado_pantalla)}">${t.estado_pantalla}</span></p>
            <p><strong>Puerto Carga:</strong> ${t.estado_puerto_carga || '-'}</p>
            <p><strong>Físico General:</strong> ${t.estado_fisico_general || '-'}</p>
            <p><strong>Batería:</strong> ${t.nivel_bateria}%</p>
          </div>
          <div class="detail-section">
            <h3>Sincronización</h3>
            <p>${t.synced ? '✅ Sincronizado' : '⚠️ Pendiente de subir'}</p>
            <p><small>ID: ${t.id}</small></p>
          </div>
        `;
    }

    // Botones editar/borrar
    const editBtn = document.getElementById('edit-tablet-btn');
    if (editBtn) {
        editBtn.onclick = () => this.editTablet(id);
        editBtn.style.display = authManager.canEdit() ? 'block' : 'none';
    }
    const delBtn = document.getElementById('delete-tablet-btn');
    if (delBtn) {
        delBtn.onclick = () => this.deleteTablet(id);
        delBtn.style.display = authManager.isAdmin() ? 'block' : 'none';
    }
  }

  async editTablet(id) {
    this.currentTablet = await dbManager.getTablet(id);
    this.showView('form');
    this.populateForm(this.currentTablet);
  }

  async deleteTablet(id) {
    if (!confirm('¿Seguro que deseas eliminarla?')) return;
    await dbManager.deleteTablet(id);
    await dbManager.addToSyncQueue('DELETE', 'tablets', id, null);
    
    if (typeof syncManager !== 'undefined') syncManager.triggerInstantSync();
    
    showToast('Eliminada', 'success');
    this.showView('dashboard');
  }

  // --- FILTROS Y ESTADÍSTICAS ---
  async renderDashboard() {
    await this.loadData();
    this.updateStatistics();
    this.updateFilterOptions();
    this.renderTabletsList();
  }

  async updateStatistics() {
    const s = await dbManager.getStats();
    if(document.getElementById('stat-total')) document.getElementById('stat-total').textContent = s.total;
    if(document.getElementById('stat-good')) document.getElementById('stat-good').textContent = s.good;
    if(document.getElementById('stat-attention')) document.getElementById('stat-attention').textContent = s.attention;
    if(document.getElementById('stat-pending')) document.getElementById('stat-pending').textContent = s.pending;
  }

  updateFilterOptions() {
    const sel = document.getElementById('filter-sede');
    if (!sel) return;
    const sedes = [...new Set(this.tablets.map(t => t.sede_procedencia))];
    sel.innerHTML = '<option value="">Todas las sedes</option>';
    sedes.forEach(s => {
      const op = document.createElement('option');
      op.value = s;
      op.textContent = this.sedeMap[s] || s;
      sel.appendChild(op);
    });
  }

  handleSearch(query) {
    const q = query.toLowerCase();
    const sede = document.getElementById('filter-sede')?.value || '';
    const estado = document.getElementById('filter-estado')?.value || '';

    this.filteredTablets = this.tablets.filter(t => {
      if (sede && t.sede_procedencia !== sede) return false;
      if (estado && t.estado_pantalla !== estado) return false;
      if (q) {
        const text = JSON.stringify(t).toLowerCase();
        // Buscar también en nombre de sede mapeado
        const sedeReal = (this.sedeMap[t.sede_procedencia] || '').toLowerCase();
        if (!text.includes(q) && !sedeReal.includes(q)) return false;
      }
      return true;
    });
    this.renderTabletsList();
  }

  applyFilters() { this.handleSearch(document.getElementById('search-input')?.value); }

  // --- BOILERPLATE Y EVENT LISTENERS ---
  setupEventListeners() {
    // Nav
    document.getElementById('back-btn')?.addEventListener('click', () => this.showView('dashboard'));
    document.getElementById('cancel-form-btn')?.addEventListener('click', () => this.showView('dashboard'));
    document.getElementById('fab')?.addEventListener('click', () => { this.currentTablet = null; this.showView('form'); });
    
    // Form
    document.getElementById('tablet-form')?.addEventListener('submit', (e) => this.handleFormSubmit(e));
    
    // Sync
    document.getElementById('sync-btn')?.addEventListener('click', () => {
        if (typeof syncManager !== 'undefined') syncManager.manualSync();
    });

    // Filtros
    document.getElementById('filter-sede')?.addEventListener('change', () => this.applyFilters());
    document.getElementById('filter-estado')?.addEventListener('change', () => this.applyFilters());
    document.getElementById('search-input')?.addEventListener('input', (e) => this.handleSearch(e.target.value));

    // Cámara/Imagen
    document.getElementById('start-camera-btn')?.addEventListener('click', () => this.startCamera());
    document.getElementById('capture-btn')?.addEventListener('click', () => this.capturePhoto());
    document.getElementById('upload-image-btn')?.addEventListener('click', () => document.getElementById('image-upload-input').click());
    document.getElementById('image-upload-input')?.addEventListener('change', (e) => this.handleImageUpload(e));

    // Otros
    document.getElementById('logout-btn')?.addEventListener('click', () => this.handleLogout());
    document.getElementById('user-menu-btn')?.addEventListener('click', () => this.toggleUserMenu());
    document.getElementById('export-btn')?.addEventListener('click', () => this.showExportModal());
    document.querySelectorAll('.btn-close').forEach(b => b.addEventListener('click', (e) => document.getElementById(e.target.dataset.modal).style.display = 'none'));
    
    // UI Helpers (Sliders, "Otro" inputs)
    this.setupUIHelpers();
  }

  setupUIHelpers() {
    // Slider batería
    const s = document.getElementById('nivel_bateria_slider');
    const n = document.getElementById('nivel_bateria');
    const d = document.getElementById('nivel_bateria_display');
    if (s && n) {
      s.oninput = (e) => { n.value = e.target.value; d.textContent = e.target.value + '%'; };
      n.oninput = (e) => { s.value = e.target.value; d.textContent = e.target.value + '%'; };
    }
    // Campos "Otro"
    const toggleOther = (idSelect, idGroup) => {
        const el = document.getElementById(idSelect);
        if(el) el.addEventListener('change', (e) => {
            document.getElementById(idGroup).style.display = e.target.value === 'Otro' ? 'block' : 'none';
        });
    };
    toggleOther('estado_pantalla', 'estado_pantalla_otro_group');
    toggleOther('estado_fisico_general', 'estado_fisico_otro_group');
  }

  // --- UTILS ---
  renderForm() {
    const f = document.getElementById('tablet-form');
    f.reset();
    if (this.currentTablet) {
      document.getElementById('form-title').textContent = 'Editar Tablet';
      this.populateForm(this.currentTablet);
    } else {
      document.getElementById('form-title').textContent = 'Agregar Tablet';
      document.getElementById('codigo_unico').value = this.generateTabletCode();
      document.getElementById('fecha_mantenimiento').value = new Date().toISOString().split('T')[0];
    }
  }

  populateForm(t) {
    const val = (id, v) => { if(document.getElementById(id)) document.getElementById(id).value = v || ''; };
    val('codigo_unico', t.codigo_unico);
    val('numero_serie', t.numero_serie);
    val('modelo', t.modelo);
    val('nombre_producto', t.nombre_producto);
    val('numero_modelo', t.numero_modelo);
    val('sede_procedencia', t.sede_procedencia);
    val('version_android', t.version_android);
    val('nivel_bateria', t.nivel_bateria);
    val('estado_pantalla', t.estado_pantalla);
    val('estado_puerto_carga', t.estado_puerto_carga);
    val('estado_fisico_general', t.estado_fisico_general);
    val('observaciones', t.observaciones);
    val('hallazgos_relevantes', t.hallazgos_relevantes);
    val('fecha_mantenimiento', t.fecha_mantenimiento);

    if (document.getElementById('tiene_cargador')) document.getElementById('tiene_cargador').checked = t.tiene_cargador;
    if (document.getElementById('tiene_cable')) document.getElementById('tiene_cable').checked = t.tiene_cable;
    
    // Disparar eventos change para mostrar campos "Otro" si aplica
    if(t.estado_pantalla === 'Otro') document.getElementById('estado_pantalla').dispatchEvent(new Event('change'));
    if(t.estado_fisico_general === 'Otro') document.getElementById('estado_fisico_general').dispatchEvent(new Event('change'));
  }

  startCamera() { if(typeof cameraManager !== 'undefined') cameraManager.start(); }
  capturePhoto() { 
      const b = cameraManager.capturePhoto(); 
      cameraManager.stop(); 
      this.processOCR(b); 
  }
  handleImageUpload(e) { if(e.target.files[0]) this.processOCR(e.target.files[0]); }
  
  toggleUserMenu() { const m = document.getElementById('user-menu'); m.style.display = m.style.display === 'none' ? 'block' : 'none'; }
  async handleLogout() { await authManager.signOut(); window.location.reload(); }
  updateUI() { 
      const p = authManager.getCurrentProfile(); 
      if(p) { 
          if(document.getElementById('user-name')) document.getElementById('user-name').textContent = p.full_name || p.email;
          if(document.getElementById('user-role')) document.getElementById('user-role').textContent = p.role;
      }
  }

  showExportModal() { document.getElementById('export-modal').style.display = 'flex'; }
  async exportData(type) { 
      document.getElementById('export-modal').style.display = 'none';
      exportManager.setData(this.filteredTablets);
      if(type==='excel') exportManager.exportToExcel();
      if(type==='csv') exportManager.exportToCSV();
      if(type==='pdf') exportManager.exportToPDF();
  }

  generateUUID() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(); }
  generateTabletCode() { return `TAB-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*9999)}`; }
  formatDate(d) { return d ? new Date(d).toLocaleDateString() : '-'; }
  getStatusClass(s) { return ['Bueno','Funcional'].includes(s)?'status-good':(['Malo','Roto'].includes(s)?'status-danger':'status-warning'); }
}

// Helper Toast Global
function showToast(msg, type='info') {
  const c = document.getElementById('toast-container');
  if(!c) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(()=>t.classList.add('show'),10);
  setTimeout(()=>{t.classList.remove('show'); setTimeout(()=>t.remove(),300);}, 3000);
}

// INICIO SEGURO
(function() {
    const start = () => { 
        window.app = new TabletInventoryApp(); 
        window.app.init(); 
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
