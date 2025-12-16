// js/app.js - Código Completo y Corregido
class TabletInventoryApp {
  constructor() {
    this.currentView = 'dashboard';
    this.currentTablet = null;
    this.tablets = [];
    this.filteredTablets = [];
  }

  // Inicialización principal
  async init() {
    try {
      console.log('=== INICIANDO APP ===');
      
      // Timeout de seguridad para quitar splash si algo se traba
      this.forceHideSplashAfterTimeout();

      // 1. Base de datos local
      await dbManager.init();
      
      // 2. Autenticación
      const isAuthenticated = await authManager.init();
      if (!isAuthenticated) {
        this.hideSplashScreen();
        this.showLoginPage();
        return;
      }

      // 3. Listeners y Servicios
      authManager.setupAuthListener();
      syncManager.init(); // Inicia el proceso de sync en segundo plano
      await this.registerServiceWorker();

      // 4. Cargar datos y Configurar UI
      await this.loadData();
      this.setupEventListeners();
      
      // 5. Mostrar App
      this.hideSplashScreen();
      this.showApp();
      this.updateUI();

    } catch (error) {
      console.error('❌ Error fatal en init:', error);
      this.hideSplashScreen();
      // Mostrar error amigable en pantalla
      document.body.innerHTML = `
        <div style="padding: 20px; text-align: center;">
          <h2 style="color: red;">Error al iniciar</h2>
          <p>${error.message}</p>
          <button onclick="location.reload()" style="padding: 10px 20px;">Recargar</button>
        </div>`;
    }
  }

  // Carga de datos
  async loadData() {
    try {
      // Siempre confiamos en la BD local primero (Source of Truth inmediata)
      this.tablets = await dbManager.getAllTablets();
      this.filteredTablets = [...this.tablets];
      this.updateStatistics();
      this.renderDashboard(); // Renderizado inicial
    } catch (error) {
      console.error('Error cargando datos:', error);
      showToast('Error leyendo datos locales', 'error');
    }
  }

  // --- 1. TARJETAS VISUALES CORREGIDAS (UI) ---
  createTabletCard(tablet) {
    const card = document.createElement('div');
    card.className = 'tablet-card';
    card.onclick = () => this.showTabletDetail(tablet.id);

    // Clase para el color del estado (Bueno, Malo, etc.)
    const statusClass = this.getStatusClass(tablet.estado_pantalla);
    
    // Icono de Sincronización
    // Si synced es true -> Nube Verde. Si es false -> Nube Naranja/Alerta
    const syncIcon = tablet.synced 
      ? '<span style="color: green; font-size: 1.2em;" title="Sincronizado">☁️✅</span>' 
      : '<span style="color: orange; font-weight: bold; font-size: 1.2em;" title="Pendiente de subir">☁️⚠️</span>';

    // Formateo de fecha
    const fecha = this.formatDate(tablet.fecha_mantenimiento);

    // ESTRUCTURA DE LA TARJETA
    // Muestra: Nombre Producto (Título), Serie (Abajo), Icono Sync, Sede, Estado
    card.innerHTML = `
      <div class="tablet-card-header">
        <h3 style="font-size: 1rem; margin: 0;">${tablet.nombre_producto || 'Producto Desconocido'}</h3>
        <div>${syncIcon}</div>
      </div>
      <div class="tablet-card-body">
        <p style="margin: 5px 0; font-size: 0.9rem; color: #555;">
          <strong>Serie:</strong> ${tablet.numero_serie || 'S/N'}
        </p>
        <p class="tablet-sede" style="margin: 5px 0;">📍 ${tablet.sede_procedencia || 'Sin sede'}</p>
        
        <div class="tablet-status" style="margin-top: 8px;">
          <span class="status-badge ${statusClass}">${tablet.estado_pantalla}</span>
        </div>
      </div>
      <div class="tablet-card-footer">
        <span class="tablet-date">📅 ${fecha}</span>
        <span class="tablet-battery">🔋 ${tablet.nivel_bateria || 0}%</span>
      </div>
    `;

    return card;
  }

  // --- 2. MANEJO DEL FORMULARIO Y GUARDADO (Sync Inmediato) ---
  async handleFormSubmit(e) {
    e.preventDefault();
    
    try {
      const formData = new FormData(e.target);
      
      // Obtener valor EXACTO del select de sede
      const sedeElement = document.getElementById('sede_procedencia');
      const sedeValue = sedeElement ? sedeElement.value : formData.get('sede_procedencia');

      // Construir objeto de datos
      const tabletData = {
        codigo_unico: formData.get('codigo_unico'),
        numero_serie: formData.get('numero_serie'),
        modelo: formData.get('modelo'),
        nombre_producto: formData.get('nombre_producto'),
        numero_modelo: formData.get('numero_modelo'),
        sede_procedencia: sedeValue, // Usamos el valor capturado explícitamente
        version_android: formData.get('version_android'),
        nivel_bateria: parseInt(formData.get('nivel_bateria')) || 0,
        estado_pantalla: formData.get('estado_pantalla'),
        estado_pantalla_otro: formData.get('estado_pantalla_otro'),
        estado_puerto_carga: formData.get('estado_puerto_carga'),
        estado_fisico_general: formData.get('estado_fisico_general'),
        estado_fisico_otro: formData.get('estado_fisico_otro'),
        tiene_cargador: formData.get('tiene_cargador') === 'on',
        tiene_cable: formData.get('tiene_cable') === 'on',
        observaciones: formData.get('observaciones'),
        hallazgos_relevantes: formData.get('hallazgos_relevantes'),
        fecha_mantenimiento: formData.get('fecha_mantenimiento'),
        
        // Al guardar manualmente, SIEMPRE inicia como no sincronizado
        synced: false,
        updated_at: new Date().toISOString()
      };

      if (this.currentTablet) {
        // --- EDICIÓN ---
        tabletData.id = this.currentTablet.id;
        tabletData.created_at = this.currentTablet.created_at; // Mantener fecha creación

        // 1. Guardar en BD Local
        await dbManager.saveTablet(tabletData);
        // 2. Encolar para sync
        await dbManager.addToSyncQueue('UPDATE', 'tablets', tabletData.id, tabletData);
        
        showToast('Actualizado localmente. Subiendo...', 'success');
      } else {
        // --- CREACIÓN ---
        tabletData.id = this.generateUUID();
        tabletData.created_at = new Date().toISOString();
        
        // 1. Guardar en BD Local
        await dbManager.saveTablet(tabletData);
        // 2. Encolar para sync
        await dbManager.addToSyncQueue('INSERT', 'tablets', tabletData.id, tabletData);

        showToast('Guardado localmente. Subiendo...', 'success');
      }

      // --- 3. DISPARAR SYNC INMEDIATO ---
      // Esto intenta conectar con Supabase YA MISMO sin esperar al intervalo
      if (window.syncManager) {
        syncManager.triggerInstantSync().catch(err => console.warn('Sync background:', err));
      }

      // Actualizar vista y volver
      await this.loadData(); // Recarga datos para ver la nueva tablet en la lista
      this.showView('dashboard');

    } catch (error) {
      console.error('Error al guardar:', error);
      showToast('Error guardando: ' + error.message, 'error');
    }
  }

  // --- LÓGICA DE OCR (Conectar con los campos) ---
  async processOCR(imageSource) {
    try {
      // Mostrar preview
      const preview = document.getElementById('ocr-preview');
      const previewImage = document.getElementById('ocr-preview-image');
      
      if (imageSource instanceof Blob || imageSource instanceof File) {
        previewImage.src = URL.createObjectURL(imageSource);
      }
      preview.style.display = 'block';

      // Procesar
      const extractedInfo = await ocrManager.processImage(imageSource);

      // ASIGNAR DATOS A LOS CAMPOS
      // El OCR Manager ya debe traer la lógica de "nombre = numero_modelo"
      
      if (extractedInfo.modelo) {
        document.getElementById('modelo').value = extractedInfo.modelo;
      }
      if (extractedInfo.numero_serie) {
        document.getElementById('numero_serie').value = extractedInfo.numero_serie;
      }
      if (extractedInfo.nombre_producto) {
        document.getElementById('nombre_producto').value = extractedInfo.nombre_producto;
      }
      if (extractedInfo.numero_modelo) {
        document.getElementById('numero_modelo').value = extractedInfo.numero_modelo;
      }
      if (extractedInfo.version_android) {
        document.getElementById('version_android').value = extractedInfo.version_android;
      }

      showToast('Datos extraídos de la imagen', 'success');

    } catch (error) {
      console.error('OCR App Error:', error);
      showToast('Error procesando imagen', 'warning');
    }
  }

  // --- FUNCIONES AUXILIARES Y UI ---

  populateForm(tablet) {
    // Llenar inputs de texto
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if(el) el.value = val || '';
    };

    setVal('codigo_unico', tablet.codigo_unico);
    setVal('numero_serie', tablet.numero_serie);
    setVal('modelo', tablet.modelo);
    setVal('nombre_producto', tablet.nombre_producto);
    setVal('numero_modelo', tablet.numero_modelo);
    setVal('version_android', tablet.version_android);
    setVal('observaciones', tablet.observaciones);
    setVal('hallazgos_relevantes', tablet.hallazgos_relevantes);
    setVal('fecha_mantenimiento', tablet.fecha_mantenimiento);

    // Llenar select de Sede
    const sedeSelect = document.getElementById('sede_procedencia');
    if (sedeSelect) {
        sedeSelect.value = tablet.sede_procedencia || '';
        // Si el valor no existe en las opciones, intentar seleccionar la opción por defecto o añadirla
        if (tablet.sede_procedencia && sedeSelect.value === '') {
             const opt = document.createElement('option');
             opt.value = tablet.sede_procedencia;
             opt.text = tablet.sede_procedencia;
             sedeSelect.add(opt);
             sedeSelect.value = tablet.sede_procedencia;
        }
    }

    // Batería
    const batVal = tablet.nivel_bateria || 0;
    document.getElementById('nivel_bateria').value = batVal;
    document.getElementById('nivel_bateria_slider').value = batVal;
    document.getElementById('nivel_bateria_display').textContent = batVal + '%';

    // Selects con opción "Otro"
    setVal('estado_pantalla', tablet.estado_pantalla);
    const pantallaOtroDiv = document.getElementById('estado_pantalla_otro_group');
    if (tablet.estado_pantalla === 'Otro') {
        pantallaOtroDiv.style.display = 'block';
        setVal('estado_pantalla_otro', tablet.estado_pantalla_otro);
    } else {
        pantallaOtroDiv.style.display = 'none';
    }

    setVal('estado_puerto_carga', tablet.estado_puerto_carga);

    setVal('estado_fisico_general', tablet.estado_fisico_general);
    const fisicoOtroDiv = document.getElementById('estado_fisico_otro_group');
    if (tablet.estado_fisico_general === 'Otro') {
        fisicoOtroDiv.style.display = 'block';
        setVal('estado_fisico_otro', tablet.estado_fisico_otro);
    } else {
        fisicoOtroDiv.style.display = 'none';
    }

    // Checkboxes
    document.getElementById('tiene_cargador').checked = !!tablet.tiene_cargador;
    document.getElementById('tiene_cable').checked = !!tablet.tiene_cable;
  }

  renderDashboard() {
    this.updateFilterOptions();
    this.renderTabletsList();
  }

  renderTabletsList() {
    const container = document.getElementById('tablets-list');
    const emptyState = document.getElementById('empty-state');
    if (!container) return;

    container.innerHTML = '';

    if (this.filteredTablets.length === 0) {
      if(emptyState) emptyState.style.display = 'flex';
      return;
    }

    if(emptyState) emptyState.style.display = 'none';

    this.filteredTablets.forEach(tablet => {
      container.appendChild(this.createTabletCard(tablet));
    });
  }

  updateFilterOptions() {
    const sedes = [...new Set(this.tablets.map(t => t.sede_procedencia).filter(Boolean))];
    const sedeSelect = document.getElementById('filter-sede');
    if (sedeSelect) {
      const currentVal = sedeSelect.value;
      sedeSelect.innerHTML = '<option value="">Todas las sedes</option>';
      sedes.forEach(sede => {
        const option = document.createElement('option');
        option.value = sede;
        option.textContent = sede;
        sedeSelect.appendChild(option);
      });
      sedeSelect.value = currentVal;
    }
  }

  applyFilters(searchQuery = null) {
    const search = searchQuery || document.getElementById('search-input')?.value || '';
    const sede = document.getElementById('filter-sede')?.value || '';
    const estado = document.getElementById('filter-estado')?.value || '';

    this.filteredTablets = this.tablets.filter(tablet => {
      // Filtro Texto
      if (search) {
        const q = search.toLowerCase();
        const textMatch = 
          (tablet.codigo_unico || '').toLowerCase().includes(q) ||
          (tablet.modelo || '').toLowerCase().includes(q) ||
          (tablet.numero_serie || '').toLowerCase().includes(q) ||
          (tablet.sede_procedencia || '').toLowerCase().includes(q) ||
          (tablet.nombre_producto || '').toLowerCase().includes(q);
        
        if (!textMatch) return false;
      }
      // Filtro Sede
      if (sede && tablet.sede_procedencia !== sede) return false;
      // Filtro Estado
      if (estado && tablet.estado_pantalla !== estado) return false;

      return true;
    });

    this.renderTabletsList();
  }

  // Listeners y Eventos
  setupEventListeners() {
    // Navegación
    const bindClick = (id, fn) => { const el = document.getElementById(id); if(el) el.addEventListener('click', fn); };
    
    bindClick('back-btn', () => this.showView('dashboard'));
    bindClick('detail-back-btn', () => this.showView('dashboard'));
    bindClick('cancel-form-btn', () => this.showView('dashboard'));
    bindClick('fab', () => { this.currentTablet = null; this.showView('form'); });

    // Sync manual
    bindClick('sync-btn', () => syncManager.manualSync());

    // Exportar
    bindClick('export-btn', () => this.showExportModal());
    bindClick('export-excel', () => this.exportData('excel'));
    bindClick('export-csv', () => this.exportData('csv'));
    bindClick('export-pdf', () => this.exportData('pdf'));

    // Auth
    bindClick('user-menu-btn', () => this.toggleUserMenu());
    bindClick('logout-btn', () => this.handleLogout());

    // Búsqueda y Filtros
    document.getElementById('search-input')?.addEventListener('input', (e) => this.applyFilters(e.target.value));
    document.getElementById('filter-sede')?.addEventListener('change', () => this.applyFilters());
    document.getElementById('filter-estado')?.addEventListener('change', () => this.applyFilters());

    // Formulario Submit
    document.getElementById('tablet-form')?.addEventListener('submit', (e) => this.handleFormSubmit(e));

    // Cámara y Fotos
    bindClick('start-camera-btn', () => this.startCamera());
    bindClick('capture-btn', () => this.capturePhoto());
    bindClick('upload-image-btn', () => document.getElementById('image-upload-input').click());
    document.getElementById('image-upload-input')?.addEventListener('change', (e) => this.handleImageUpload(e));
    
    bindClick('add-evidence-btn', () => document.getElementById('evidence-upload-input').click());
    document.getElementById('evidence-upload-input')?.addEventListener('change', (e) => this.handleEvidenceUpload(e));

    // Sliders Batería
    const slider = document.getElementById('nivel_bateria_slider');
    const input = document.getElementById('nivel_bateria');
    const display = document.getElementById('nivel_bateria_display');
    if(slider && input) {
        slider.addEventListener('input', (e) => { input.value = e.target.value; display.textContent = e.target.value + '%'; });
        input.addEventListener('input', (e) => { slider.value = e.target.value; display.textContent = e.target.value + '%'; });
    }

    // Mostrar campo "Otro"
    document.getElementById('estado_pantalla')?.addEventListener('change', (e) => {
        document.getElementById('estado_pantalla_otro_group').style.display = e.target.value === 'Otro' ? 'block' : 'none';
    });
    document.getElementById('estado_fisico_general')?.addEventListener('change', (e) => {
        document.getElementById('estado_fisico_otro_group').style.display = e.target.value === 'Otro' ? 'block' : 'none';
    });

    // Modales
    document.querySelectorAll('.btn-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
             const m = document.getElementById(e.target.dataset.modal);
             if(m) m.style.display = 'none';
        });
    });
  }

  // --- VISTAS Y NAVEGACIÓN ---
  showView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(`${viewName}-view`);
    if (view) {
      view.classList.add('active');
      this.currentView = viewName;
      if (viewName === 'dashboard') this.renderDashboard();
      if (viewName === 'form') this.renderForm();
    }
  }

  renderForm() {
    const formTitle = document.getElementById('form-title');
    const form = document.getElementById('tablet-form');
    const codigoInput = document.getElementById('codigo_unico');

    if (this.currentTablet) {
      formTitle.textContent = 'Editar Tablet';
      this.populateForm(this.currentTablet);
      if (authManager.isAdmin()) {
        codigoInput.readOnly = false;
        codigoInput.style.backgroundColor = '#fff';
      } else {
        codigoInput.readOnly = true;
        codigoInput.style.backgroundColor = '#f3f4f6';
      }
    } else {
      formTitle.textContent = 'Agregar Tablet';
      form.reset();
      codigoInput.value = this.generateTabletCode();
      codigoInput.readOnly = true;
      codigoInput.style.backgroundColor = '#f3f4f6';
      document.getElementById('fecha_mantenimiento').value = new Date().toISOString().split('T')[0];
      
      // Ocultar campos "otro"
      document.getElementById('estado_pantalla_otro_group').style.display = 'none';
      document.getElementById('estado_fisico_otro_group').style.display = 'none';
    }
  }

  // --- DETALLES ---
  async showTabletDetail(tabletId) {
    try {
      const tablet = await dbManager.getTablet(tabletId);
      if (!tablet) { showToast('No encontrada', 'error'); return; }

      this.currentTablet = tablet;
      const content = document.getElementById('tablet-detail-content');
      
      if (content) {
        content.innerHTML = `
          <div class="detail-section">
            <h3>${tablet.nombre_producto || 'Tablet'}</h3>
            <div class="detail-grid">
               <div class="detail-item"><label>Serie</label><p>${tablet.numero_serie || '-'}</p></div>
               <div class="detail-item"><label>Código</label><p>${tablet.codigo_unico}</p></div>
               <div class="detail-item"><label>Sede</label><p>${tablet.sede_procedencia || '-'}</p></div>
               <div class="detail-item"><label>Modelo</label><p>${tablet.modelo || '-'}</p></div>
               <div class="detail-item"><label>Android</label><p>${tablet.version_android || '-'}</p></div>
               <div class="detail-item"><label>Batería</label><p>${tablet.nivel_bateria}%</p></div>
            </div>
            <div style="margin-top: 10px;">
               <p><strong>Estado Pantalla:</strong> ${tablet.estado_pantalla}</p>
               <p><strong>Estado Físico:</strong> ${tablet.estado_fisico_general}</p>
               <p><strong>Cargador:</strong> ${tablet.tiene_cargador ? 'Sí' : 'No'} | <strong>Cable:</strong> ${tablet.tiene_cable ? 'Sí' : 'No'}</p>
            </div>
          </div>
        `;
      }
      
      // Botones editar/borrar
      const editBtn = document.getElementById('edit-tablet-btn');
      if(editBtn) {
         editBtn.onclick = () => this.editTablet(tablet.id);
         editBtn.style.display = authManager.canEdit() ? 'block' : 'none';
      }
      
      const delBtn = document.getElementById('delete-tablet-btn');
      if(delBtn) {
         delBtn.onclick = () => this.deleteTablet(tablet.id);
         delBtn.style.display = authManager.isAdmin() ? 'block' : 'none';
      }

      this.showView('detail');
    } catch (e) { console.error(e); }
  }

  async editTablet(id) {
      const t = await dbManager.getTablet(id);
      if(t) { this.currentTablet = t; this.showView('form'); }
  }

  async deleteTablet(id) {
      if(!confirm('¿Eliminar esta tablet permanentemente?')) return;
      await dbManager.deleteTablet(id);
      await dbManager.addToSyncQueue('DELETE', 'tablets', id, null);
      syncManager.triggerInstantSync();
      showToast('Eliminada', 'success');
      this.showView('dashboard');
  }

  // --- UTILS ---
  generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  generateTabletCode() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return `TAB-${dateStr}-${rand}`;
  }

  formatDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('es-GT');
  }

  getStatusClass(estado) {
    if (['Bueno', 'Funcional', 'Excelente'].includes(estado)) return 'status-good';
    if (['Regular', 'Con rayones'].includes(estado)) return 'status-warning';
    return 'status-danger';
  }

  updateStatistics() {
    dbManager.getStats().then(stats => {
       if(document.getElementById('stat-total')) document.getElementById('stat-total').textContent = stats.total;
       if(document.getElementById('stat-good')) document.getElementById('stat-good').textContent = stats.good;
       if(document.getElementById('stat-attention')) document.getElementById('stat-attention').textContent = stats.attention;
       if(document.getElementById('stat-pending')) document.getElementById('stat-pending').textContent = stats.pending;
    });
  }

  // --- GESTIÓN DE CÁMARA E IMÁGENES ---
  startCamera() { cameraManager.start().catch(e => console.error(e)); }
  
  capturePhoto() { 
      const blob = cameraManager.capturePhoto();
      cameraManager.stop();
      this.processOCR(blob);
  }

  handleImageUpload(e) {
      const file = e.target.files[0];
      if(file) this.processOCR(file);
  }

  handleEvidenceUpload(e) {
      const files = Array.from(e.target.files);
      const preview = document.getElementById('evidence-preview');
      files.forEach(file => {
          const reader = new FileReader();
          reader.onload = (ev) => {
              const img = document.createElement('img');
              img.src = ev.target.result;
              img.className = 'evidence-thumb';
              preview.appendChild(img);
          };
          reader.readAsDataURL(file);
      });
  }

  // --- UI GENERAL ---
  toggleUserMenu() {
    const m = document.getElementById('user-menu');
    if(m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
  }

  async handleLogout() {
    if(confirm('¿Cerrar sesión?')) {
        await authManager.signOut();
        location.reload();
    }
  }

  showLoginPage() {
     const splash = document.getElementById('splash-screen');
     if(splash) splash.style.display = 'none';
     
     if (document.getElementById('login-container')) return;

     document.body.innerHTML += `
      <div id="login-container" class="login-container">
        <div class="login-card">
          <h1>Inventario Tablets</h1>
          <form id="login-form">
            <div class="form-group"><label>Email</label><input type="email" id="login-email" required></div>
            <div class="form-group"><label>Password</label><input type="password" id="login-password" required></div>
            <button type="submit" class="btn-primary btn-block">Ingresar</button>
          </form>
          <div id="login-error" style="color:red; display:none;"></div>
        </div>
      </div>`;

     document.getElementById('login-form').addEventListener('submit', async (e) => {
         e.preventDefault();
         try {
             await authManager.signIn(document.getElementById('login-email').value, document.getElementById('login-password').value);
             location.reload();
         } catch(err) {
             const d = document.getElementById('login-error');
             d.textContent = err.message; d.style.display = 'block';
         }
     });
  }

  showApp() { document.getElementById('app').style.display = 'block'; }
  
  hideSplashScreen() {
    const s = document.getElementById('splash-screen');
    if(s) { s.style.opacity = '0'; setTimeout(() => s.style.display = 'none', 300); }
  }

  forceHideSplashAfterTimeout() {
      setTimeout(() => { if(document.getElementById('splash-screen').style.display !== 'none') this.hideSplashScreen(); }, 8000);
  }

  updateUI() {
      const p = authManager.getCurrentProfile();
      if(p) {
          const u = document.getElementById('user-name');
          if(u) u.textContent = p.full_name || p.email;
          const r = document.getElementById('user-role');
          if(r) r.textContent = p.role;
          
          // Ocultar elementos según rol
          document.querySelectorAll('[data-role]').forEach(el => {
              const roles = el.dataset.role.split(',');
              el.style.display = roles.includes(p.role) ? '' : 'none';
          });
      }
  }

  showExportModal() { document.getElementById('export-modal').style.display = 'flex'; }
  hideModal(id) { document.getElementById(id).style.display = 'none'; }
  async exportData(fmt) {
      this.hideModal('export-modal');
      exportManager.setData(this.filteredTablets);
      if(fmt === 'excel') await exportManager.exportToExcel();
      if(fmt === 'csv') await exportManager.exportToCSV();
      if(fmt === 'pdf') await exportManager.exportToPDF();
  }

  async registerServiceWorker() {
      if ('serviceWorker' in navigator) {
          try {
             const path = location.hostname === 'localhost' ? '/sw.js' : './sw.js';
             await navigator.serviceWorker.register(path);
          } catch (e) { console.log('SW fail:', e); }
      }
  }
}

// INICIO AUTOMÁTICO
(function() {
  const start = () => { window.app = new TabletInventoryApp(); window.app.init(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
