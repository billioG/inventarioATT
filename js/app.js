// Main Application
class TabletInventoryApp {
  constructor() {
    this.currentView = 'dashboard';
    this.currentTablet = null;
    this.tablets = [];
    this.filteredTablets = [];
    
    // MAPA DE SEDES
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
      console.log('=== INICIANDO APP ===');
      this.forceHideSplashAfterTimeout();
      
      await dbManager.init();
      
      // Intentar inicializar Supabase sin bloquear
      try { 
        if(typeof supabaseClient !== 'undefined') supabaseClient.init(); 
      } catch (e) { 
        console.log('Modo offline forzado o Supabase no configurado'); 
      }

      const isAuthenticated = await authManager.init();

      if (!isAuthenticated) {
        // Si no está autenticado, ocultamos splash y mostramos login
        this.hideSplashScreen();
        this.showLoginPage();
        return;
      }

      // Si está autenticado, cargamos el resto
      authManager.setupAuthListener();
      syncManager.init();
      await this.registerServiceWorker();
      await this.loadData();
      this.setupEventListeners();
      
      // MOSTRAR LA APP (Aquí fallaba antes)
      this.hideSplashScreen();
      this.showApp();
      this.updateUI();

    } catch (error) {
      console.error('Error init:', error);
      this.hideSplashScreen();
      // Mostrar error en pantalla en lugar de alert intrusivo
      document.body.innerHTML = `<div style="padding:20px;color:red"><h3>Error Fatal</h3><p>${error.message}</p></div>`;
    }
  }

  // --- FUNCIONES QUE FALTABAN (SOLUCIÓN AL ERROR) ---
  hideSplashScreen() {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.style.opacity = '0';
      setTimeout(() => {
        splash.style.display = 'none';
      }, 300);
    }
  }

  showApp() {
    const app = document.getElementById('app');
    if (app) app.style.display = 'block';
  }

  forceHideSplashAfterTimeout() {
    setTimeout(() => {
      const splash = document.getElementById('splash-screen');
      if (splash && splash.style.display !== 'none') {
        this.hideSplashScreen();
        if(document.getElementById('app').style.display === 'none') {
            this.showLoginPage();
        }
      }
    }, 5000);
  }
  // ----------------------------------------------------

  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const swPath = window.location.hostname === 'localhost' ? '/sw.js' : './sw.js';
        await navigator.serviceWorker.register(swPath);
      } catch (e) { console.log('SW Fail:', e); }
    }
  }

  // --- GESTIÓN DE VISTAS Y LOGIN ---
  showLoginPage() {
    const splash = document.getElementById('splash-screen');
    const app = document.getElementById('app');
    if (splash) splash.style.display = 'none';
    if (app) app.style.display = 'none';

    if (document.getElementById('login-container')) return;

    document.body.innerHTML += `
      <div id="login-container" class="login-container">
        <div class="login-card">
          <div style="font-size: 40px; margin-bottom: 10px;">📱</div>
          <h1>Inventario Tablets</h1>
          <form id="login-form" class="login-form">
            <div class="form-group">
              <label>Email</label>
              <input type="email" id="login-email" required>
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="login-password" required>
            </div>
            <button type="submit" class="btn-primary btn-block">Entrar</button>
          </form>
          <div id="login-error" class="login-error" style="display: none;"></div>
        </div>
      </div>
    `;

    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });
  }

  async handleLogin() {
    try {
      const email = document.getElementById('login-email').value;
      const pass = document.getElementById('login-password').value;
      
      const btn = document.querySelector('#login-form button');
      btn.textContent = 'Verificando...';
      btn.disabled = true;

      await authManager.signIn(email, pass);
      window.location.reload();
    } catch (error) {
      const btn = document.querySelector('#login-form button');
      btn.textContent = 'Entrar';
      btn.disabled = false;
      
      const errDiv = document.getElementById('login-error');
      errDiv.textContent = error.message;
      errDiv.style.display = 'block';
    }
  }

  // --- CARGA DE DATOS ---
  async loadData() {
    try {
      this.tablets = await dbManager.getAllTablets();
      this.filteredTablets = [...this.tablets];
      if(navigator.onLine) syncManager.triggerInstantSync();
    } catch (error) {
      console.error(error);
    }
  }

  // --- EVENT LISTENERS ---
  setupEventListeners() {
    document.getElementById('back-btn')?.addEventListener('click', () => this.showView('dashboard'));
    document.getElementById('detail-back-btn')?.addEventListener('click', () => this.showView('dashboard'));
    document.getElementById('admin-back-btn')?.addEventListener('click', () => this.showView('dashboard'));
    document.getElementById('fab')?.addEventListener('click', () => {
      this.currentTablet = null;
      this.showView('form');
    });
    
    document.getElementById('search-input')?.addEventListener('input', (e) => this.handleSearch(e.target.value));
    document.getElementById('filter-sede')?.addEventListener('change', () => this.applyFilters());
    document.getElementById('filter-estado')?.addEventListener('change', () => this.applyFilters());
    
    document.getElementById('export-btn')?.addEventListener('click', () => this.showExportModal());
    document.getElementById('sync-btn')?.addEventListener('click', () => syncManager.manualSync());
    document.getElementById('logout-btn')?.addEventListener('click', () => this.handleLogout());
    document.getElementById('user-menu-btn')?.addEventListener('click', () => this.toggleUserMenu());
    
    document.getElementById('tablet-form')?.addEventListener('submit', (e) => this.handleFormSubmit(e));
    document.getElementById('cancel-form-btn')?.addEventListener('click', () => this.showView('dashboard'));
    
    document.getElementById('start-camera-btn')?.addEventListener('click', () => this.startCamera());
    document.getElementById('capture-btn')?.addEventListener('click', () => this.capturePhoto());
    document.getElementById('upload-image-btn')?.addEventListener('click', () => document.getElementById('image-upload-input').click());
    document.getElementById('image-upload-input')?.addEventListener('change', (e) => this.handleImageUpload(e));
    
    document.getElementById('add-evidence-btn')?.addEventListener('click', () => document.getElementById('evidence-upload-input').click());
    document.getElementById('evidence-upload-input')?.addEventListener('change', (e) => this.handleEvidenceUpload(e));
    
    document.getElementById('export-excel')?.addEventListener('click', () => this.exportData('excel'));
    document.getElementById('export-csv')?.addEventListener('click', () => this.exportData('csv'));
    document.getElementById('export-pdf')?.addEventListener('click', () => this.exportData('pdf'));
    
    // UI Helpers
    document.getElementById('estado_pantalla')?.addEventListener('change', (e) => {
        const grp = document.getElementById('estado_pantalla_otro_group');
        if(grp) grp.style.display = e.target.value === 'Otro' ? 'block' : 'none';
    });
    document.getElementById('estado_fisico_general')?.addEventListener('change', (e) => {
        const grp = document.getElementById('estado_fisico_otro_group');
        if(grp) grp.style.display = e.target.value === 'Otro' ? 'block' : 'none';
    });
    
    const slider = document.getElementById('nivel_bateria_slider');
    const input = document.getElementById('nivel_bateria');
    const display = document.getElementById('nivel_bateria_display');
    if(slider && input) {
        slider.addEventListener('input', (e) => { input.value = e.target.value; display.textContent = e.target.value + '%'; });
        input.addEventListener('input', (e) => { slider.value = e.target.value; display.textContent = e.target.value + '%'; });
    }
    
    document.querySelectorAll('.btn-close').forEach(btn => btn.addEventListener('click', (e) => this.hideModal(e.target.dataset.modal)));
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

  // --- RENDERIZADO DE TARJETAS (DISEÑO SOLICITADO) ---
  createTabletCard(tablet) {
    const card = document.createElement('div');
    card.className = 'tablet-card';
    card.onclick = () => this.showTabletDetail(tablet.id);

    const statusClass = this.getStatusClass(tablet.estado_pantalla);
    const nombreSede = this.sedeMap[tablet.sede_procedencia] || tablet.sede_procedencia || 'Sin sede';
    
    // Título: Nombre del Producto
    const titulo = tablet.nombre_producto || tablet.modelo || tablet.codigo_unico;
    // Subtítulo: Número de Serie
    const subtitulo = tablet.numero_serie ? `Serie: ${tablet.numero_serie}` : 'Sin N/S';

    const syncStatusIcon = tablet.synced 
        ? '<span style="color:green; font-size:12px;">☁️ OK</span>' 
        : '<span style="color:orange; font-size:12px;">⌛</span>';

    card.innerHTML = `
      <div class="tablet-card-header">
        <h3 style="font-size:1.1rem">${titulo}</h3>
        ${syncStatusIcon}
      </div>
      <div class="tablet-card-body">
        <p style="font-weight: bold; color: #333; margin-bottom: 5px;">${subtitulo}</p>
        <p class="tablet-model" style="font-size: 0.9em; color: #666;">Modelo: ${tablet.modelo || '-'}</p>
        <p class="tablet-sede">📍 ${nombreSede}</p>
        <div class="tablet-status">
          <span class="status-badge ${statusClass}">${tablet.estado_pantalla}</span>
        </div>
      </div>
      <div class="tablet-card-footer">
        <span class="tablet-date">📅 ${this.formatDate(tablet.fecha_mantenimiento)}</span>
        <span class="tablet-battery">🔋 ${tablet.nivel_bateria || 0}%</span>
      </div>
    `;
    return card;
  }

  // --- PROCESAMIENTO OCR Y FORMULARIO ---
  async processOCR(imageSource) {
    try {
      const preview = document.getElementById('ocr-preview');
      if(preview) preview.style.display = 'block';
      
      const img = document.getElementById('ocr-preview-image');
      if(img) img.src = imageSource instanceof Blob ? URL.createObjectURL(imageSource) : URL.createObjectURL(imageSource);

      const info = await ocrManager.processImage(imageSource);

      // Asignación inteligente de campos
      if (info.nombre_producto) {
        document.getElementById('nombre_producto').value = info.nombre_producto;
        document.getElementById('numero_modelo').value = info.nombre_producto; // Copiar a número de modelo también
      }
      if (info.modelo) document.getElementById('modelo').value = info.modelo;
      if (info.numero_serie) document.getElementById('numero_serie').value = info.numero_serie;
      
      // Si el OCR encontró un 'numero_modelo' distinto al nombre, lo respetamos
      if (info.numero_modelo && info.numero_modelo !== info.nombre_producto) {
          document.getElementById('numero_modelo').value = info.numero_modelo;
      }
      
      if (info.version_android) document.getElementById('version_android').value = info.version_android;

      showToast('Datos leídos. Verifica la información.', 'success');
    } catch (error) {
      console.error(error);
      showToast('No se pudo leer la imagen automáticamente.', 'warning');
    }
  }

  async handleFormSubmit(e) {
    e.preventDefault();
    try {
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());
      
      // Conversiones de tipos
      data.nivel_bateria = parseInt(data.nivel_bateria) || 0;
      data.tiene_cargador = formData.get('tiene_cargador') === 'on';
      data.tiene_cable = formData.get('tiene_cable') === 'on';
      data.synced = false;

      if (this.currentTablet) {
        data.id = this.currentTablet.id;
        await dbManager.saveTablet(data);
        await dbManager.addToSyncQueue('UPDATE', 'tablets', data.id, data);
        showToast('Guardado localmente', 'success');
      } else {
        data.id = this.generateUUID();
        // Verificar duplicado por código único
        const existing = await dbManager.searchTablets(data.codigo_unico);
        if(existing.length > 0) {
            if(!confirm('El código ya existe. ¿Deseas actualizar la tablet existente?')) return;
            data.id = existing[0].id;
        }

        await dbManager.saveTablet(data);
        await dbManager.addToSyncQueue('INSERT', 'tablets', data.id, data);
        showToast('Guardado localmente', 'success');
      }

      // Intentar subir inmediatamente
      syncManager.triggerInstantSync(); 
      this.showView('dashboard');

    } catch (err) {
      showToast('Error al guardar: ' + err.message, 'error');
    }
  }

  // --- UTILIDADES ---
  generateUUID() { 
    if(typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString() + Math.random().toString();
  }
  
  generateTabletCode() {
    const d = new Date().toISOString().slice(0,10).replace(/-/g,'');
    return `TAB-${d}-${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`;
  }
  
  formatDate(d) { return d ? new Date(d).toLocaleDateString() : '-'; }
  formatDateTime(d) { return d ? new Date(d).toLocaleString() : '-'; }

  // --- ESTADÍSTICAS Y LISTADO ---
  async renderDashboard() {
      await this.loadData();
      this.updateStatistics();
      this.updateFilterOptions();
      this.renderTabletsList();
  }
  
  async updateStatistics() {
      const s = await dbManager.getStats();
      const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
      setTxt('stat-total', s.total);
      setTxt('stat-good', s.good);
      setTxt('stat-attention', s.attention);
      setTxt('stat-pending', s.pending);
  }
  
  updateFilterOptions() {
      const s = document.getElementById('filter-sede');
      if(!s) return;
      // Guardar selección actual
      const currentVal = s.value;
      
      const sedes = [...new Set(this.tablets.map(t => t.sede_procedencia))];
      s.innerHTML = '<option value="">Todas las sedes</option>';
      sedes.forEach(sede => {
          const label = this.sedeMap[sede] || sede;
          const op = document.createElement('option');
          op.value = sede;
          op.textContent = label;
          s.appendChild(op);
      });
      // Restaurar selección
      s.value = currentVal;
  }
  
  renderTabletsList() {
      const c = document.getElementById('tablets-list');
      if(!c) return;
      c.innerHTML = '';
      
      if(this.filteredTablets.length===0) {
          const empty = document.getElementById('empty-state');
          if(empty) empty.style.display='flex';
          return;
      }
      
      const empty = document.getElementById('empty-state');
      if(empty) empty.style.display='none';
      
      this.filteredTablets.forEach(t => c.appendChild(this.createTabletCard(t)));
  }
  
  getStatusClass(e) {
      if(['Bueno','Funcional','Excelente'].includes(e)) return 'status-good';
      if(['Malo','Roto','Dañado'].includes(e)) return 'status-danger';
      return 'status-warning';
  }
  
  // --- DETALLE, EDICIÓN Y BORRADO ---
  async showTabletDetail(id) {
      this.currentTablet = await dbManager.getTablet(id);
      if(!this.currentTablet) return;
      this.showView('detail');
      this.renderDetailView();
  }
  
  renderDetailView() {
    const t = this.currentTablet;
    const content = document.getElementById('tablet-detail-content');
    if(!content) return;
    
    const nombreSede = this.sedeMap[t.sede_procedencia] || t.sede_procedencia;

    content.innerHTML = `
      <div class="detail-section">
        <h3>${t.nombre_producto || 'Tablet'}</h3>
        <p><strong>Serie:</strong> ${t.numero_serie || '-'}</p>
        <p><strong>Modelo:</strong> ${t.modelo || '-'}</p>
        <p><strong>Sede:</strong> ${nombreSede}</p>
        <p><strong>Estado:</strong> ${t.estado_pantalla}</p>
        <p><strong>Batería:</strong> ${t.nivel_bateria}%</p>
        <hr>
        <p><strong>Estado Sync:</strong> ${t.synced ? '<span style="color:green">Sincronizado</span>' : '<span style="color:orange">Pendiente de subir</span>'}</p>
      </div>
      <div class="detail-section">
        <h4>Detalles Técnicos</h4>
        <p>Android: ${t.version_android || '-'}</p>
        <p>Puerto Carga: ${t.estado_puerto_carga || '-'}</p>
        <p>Hallazgos: ${t.hallazgos_relevantes || 'Ninguno'}</p>
      </div>
    `;
    
    const editBtn = document.getElementById('edit-tablet-btn');
    const delBtn = document.getElementById('delete-tablet-btn');
    
    // Clonamos botones para quitar listeners viejos
    if(editBtn) {
        const newEdit = editBtn.cloneNode(true);
        editBtn.parentNode.replaceChild(newEdit, editBtn);
        newEdit.onclick = () => this.editTablet(t.id);
        newEdit.style.display = authManager.canEdit() ? 'block' : 'none';
    }
    
    if(delBtn) {
        const newDel = delBtn.cloneNode(true);
        delBtn.parentNode.replaceChild(newDel, delBtn);
        newDel.onclick = () => this.deleteTablet(t.id);
        newDel.style.display = authManager.isAdmin() ? 'block' : 'none';
    }
  }

  async editTablet(id) {
      this.currentTablet = await dbManager.getTablet(id);
      this.showView('form');
      this.populateForm(this.currentTablet);
  }
  
  async deleteTablet(id) {
      if(!confirm('¿Estás seguro de eliminar esta tablet?')) return;
      await dbManager.deleteTablet(id);
      await dbManager.addToSyncQueue('DELETE', 'tablets', id, null);
      syncManager.triggerInstantSync();
      this.showView('dashboard');
  }
  
  renderForm() {
      const f = document.getElementById('tablet-form');
      f.reset();
      if(this.currentTablet) {
          document.getElementById('form-title').textContent = 'Editar Tablet';
          this.populateForm(this.currentTablet);
      } else {
          document.getElementById('form-title').textContent = 'Agregar Tablet';
          document.getElementById('codigo_unico').value = this.generateTabletCode();
          document.getElementById('fecha_mantenimiento').value = new Date().toISOString().split('T')[0];
      }
  }
  
  populateForm(t) {
      document.getElementById('codigo_unico').value = t.codigo_unico;
      document.getElementById('numero_serie').value = t.numero_serie || '';
      document.getElementById('modelo').value = t.modelo || '';
      document.getElementById('nombre_producto').value = t.nombre_producto || '';
      document.getElementById('numero_modelo').value = t.numero_modelo || '';
      document.getElementById('sede_procedencia').value = t.sede_procedencia || '';
      document.getElementById('version_android').value = t.version_android || '';
      document.getElementById('nivel_bateria').value = t.nivel_bateria || 0;
      document.getElementById('nivel_bateria_slider').value = t.nivel_bateria || 0;
      document.getElementById('estado_pantalla').value = t.estado_pantalla || '';
      document.getElementById('estado_puerto_carga').value = t.estado_puerto_carga || '';
      document.getElementById('estado_fisico_general').value = t.estado_fisico_general || '';
      document.getElementById('tiene_cargador').checked = t.tiene_cargador;
      document.getElementById('tiene_cable').checked = t.tiene_cable;
      document.getElementById('observaciones').value = t.observaciones || '';
      document.getElementById('hallazgos_relevantes').value = t.hallazgos_relevantes || '';
      document.getElementById('fecha_mantenimiento').value = t.fecha_mantenimiento || '';
  }
  
  // --- OTROS HANDLERS ---
  startCamera() { cameraManager.start(); }
  capturePhoto() { 
      const blob = cameraManager.capturePhoto();
      cameraManager.stop();
      this.processOCR(blob);
  }
  handleImageUpload(e) { if(e.target.files[0]) this.processOCR(e.target.files[0]); }
  handleEvidenceUpload(e) { /* Lógica visual de evidencia aquí */ }
  
  handleSearch(q) { this.applyFilters(q); }
  
  applyFilters(q) {
      const search = (q || document.getElementById('search-input').value || '').toLowerCase();
      const sede = document.getElementById('filter-sede').value;
      const estado = document.getElementById('filter-estado').value;
      
      this.filteredTablets = this.tablets.filter(t => {
          if(sede && t.sede_procedencia !== sede) return false;
          if(estado && t.estado_pantalla !== estado) return false;
          
          if(search) {
             const str = (t.codigo_unico + t.modelo + t.numero_serie + t.sede_procedencia).toLowerCase();
             if(!str.includes(search)) return false;
          }
          return true;
      });
      this.renderTabletsList();
  }
  
  showExportModal() { document.getElementById('export-modal').style.display='flex'; }
  hideModal(id) { document.getElementById(id).style.display='none'; }
  
  async exportData(type) {
      this.hideModal('export-modal');
      exportManager.setData(this.filteredTablets);
      if(type==='excel') await exportManager.exportToExcel();
      if(type==='csv') await exportManager.exportToCSV();
      if(type==='pdf') await exportManager.exportToPDF();
  }
  
  toggleUserMenu() { 
      const m = document.getElementById('user-menu');
      m.style.display = m.style.display==='none'?'block':'none';
  }
  
  async handleLogout() {
      await authManager.signOut();
      window.location.reload();
  }
  
  updateUI() {
      const p = authManager.getCurrentProfile();
      if(p) {
          const elName = document.getElementById('user-name');
          const elRole = document.getElementById('user-role');
          if(elName) elName.textContent = p.full_name || p.email;
          if(elRole) elRole.textContent = p.role;
      }
  }
}

// Iniciar aplicación
(function() {
    function start() { window.app = new TabletInventoryApp(); window.app.init(); }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
