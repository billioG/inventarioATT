// Main Application
class TabletInventoryApp {
  constructor() {
    this.currentView = 'dashboard';
    this.currentTablet = null;
    this.tablets = [];
    this.filteredTablets = [];
  }

  // Initialize application
  async init() {
    try {
      console.log('=== INICIANDO APP ===');
      
      // Agregar timeout de seguridad
      this.forceHideSplashAfterTimeout();
      
      console.log('1. Initializing Tablet Inventory App...');

      // Initialize IndexedDB
      console.log('2. Inicializando IndexedDB...');
      await dbManager.init();
      console.log('✓ IndexedDB inicializado');

      // Initialize Supabase
      console.log('3. Inicializando Supabase...');
      const supabaseInitialized = supabaseClient.init();
      console.log('✓ Supabase inicializado:', supabaseInitialized ? 'Sí' : 'No (modo offline)');

      // Initialize authentication
      console.log('4. Verificando autenticación...');
      const isAuthenticated = await authManager.init();
      console.log('✓ Estado autenticación:', isAuthenticated);

      if (!isAuthenticated) {
        console.log('5. Usuario no autenticado, mostrando login...');
        this.hideSplashScreen();
        this.showLoginPage();
        return;
      }

      console.log('5. Usuario autenticado, continuando...');

      // Setup auth listener
      console.log('6. Configurando auth listener...');
      authManager.setupAuthListener();
      console.log('✓ Auth listener configurado');

      // Initialize sync manager
      console.log('7. Inicializando sync manager...');
      syncManager.init();
      console.log('✓ Sync manager inicializado');

      // Register service worker
      console.log('8. Registrando service worker...');
      await this.registerServiceWorker();
      console.log('✓ Service worker registrado');

      // Load initial data
      console.log('9. Cargando datos iniciales...');
      await this.loadData();
      console.log('✓ Datos cargados');

      // Setup UI event listeners
      console.log('10. Configurando event listeners...');
      this.setupEventListeners();
      console.log('✓ Event listeners configurados');

      // Hide splash screen
      console.log('11. Ocultando splash screen...');
      this.hideSplashScreen();
      console.log('✓ Splash screen oculto');

      // Show app
      console.log('12. Mostrando app...');
      this.showApp();
      console.log('✓ App mostrada');

      // Update UI
      console.log('13. Actualizando UI...');
      this.updateUI();
      console.log('✓ UI actualizada');

      console.log('=== APP INICIALIZADA CORRECTAMENTE ===');

    } catch (error) {
      console.error('❌ ERROR EN INICIALIZACIÓN:', error);
      console.error('Stack:', error.stack);
      
      // Ocultar splash y mostrar error
      this.hideSplashScreen();
      
      document.body.innerHTML = `
        <div style="padding: 20px; text-align: center; font-family: Arial;">
          <h2 style="color: red;">Error al inicializar la aplicación</h2>
          <p>${error.message}</p>
          <pre style="text-align: left; background: #f5f5f5; padding: 10px; border-radius: 5px; overflow: auto;">${error.stack}</pre>
          <button onclick="location.reload()" style="padding: 10px 20px; font-size: 16px; cursor: pointer; margin: 10px;">
            Recargar página
          </button>
          <button onclick="localStorage.clear(); indexedDB.deleteDatabase('TabletInventoryDB'); location.reload()" 
                  style="padding: 10px 20px; font-size: 16px; cursor: pointer; margin: 10px; background: red; color: white; border: none;">
            Limpiar todo y recargar
          </button>
        </div>
      `;
    }
  }

  // Force hide splash screen after timeout
  forceHideSplashAfterTimeout() {
    setTimeout(() => {
      const splash = document.getElementById('splash-screen');
      if (splash && splash.style.display !== 'none') {
        console.warn('⚠️ Forzando ocultamiento de splash screen por timeout');
        this.hideSplashScreen();
        
        // Si hay error, mostrar mensaje
        const appElement = document.getElementById('app');
        if (!appElement || !appElement.style.display || appElement.style.display === 'none') {
          document.body.innerHTML = `
            <div style="padding: 20px; text-align: center; font-family: Arial;">
              <h2>La aplicación tardó demasiado en cargar</h2>
              <p>Revisa la consola (F12) para ver los errores.</p>
              <button onclick="location.reload()" style="padding: 10px 20px; font-size: 16px; cursor: pointer; margin: 10px;">
                Recargar página
              </button>
              <button onclick="localStorage.clear(); indexedDB.deleteDatabase('TabletInventoryDB'); location.reload()" 
                      style="padding: 10px 20px; font-size: 16px; cursor: pointer; margin: 10px; background: red; color: white; border: none;">
                Limpiar todo y recargar
              </button>
            </div>
          `;
        }
      }
    }, 10000); // 10 segundos
  }

  // Register service worker
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const swPath = window.location.hostname === 'localhost' ? '/sw.js' : '/inventarioATT/sw.js';
        const registration = await navigator.serviceWorker.register(swPath);
        console.log('Service Worker registered:', registration);

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('Nueva versión disponible. Recarga la página para actualizar.', 'info');
            }
          });
        });

      } catch (error) {
        console.error('Service Worker registration failed:', error);
        console.log('Continuando sin Service Worker...');
      }
    }
  }

  // Show login page
  showLoginPage() {
    const splashScreen = document.getElementById('splash-screen');
    const app = document.getElementById('app');
    
    if (splashScreen) splashScreen.style.display = 'none';
    if (app) app.style.display = 'none';

    document.body.innerHTML += `
      <div id="login-container" class="login-container">
        <div class="login-card">
          <img src="https://via.placeholder.com/80x80/2563eb/ffffff?text=IT" alt="Logo" class="login-logo">
          <h1>Inventario de Tablets</h1>
          <p class="login-subtitle">Fundación Carlos F. Novella</p>
          
          <form id="login-form" class="login-form">
            <div class="form-group">
              <label for="login-email">Correo Electrónico</label>
              <input type="email" id="login-email" name="email" required autocomplete="email">
            </div>
            
            <div class="form-group">
              <label for="login-password">Contraseña</label>
              <input type="password" id="login-password" name="password" required autocomplete="current-password">
            </div>
            
            <button type="submit" class="btn-primary btn-block">
              Iniciar Sesión
            </button>
          </form>
          
          <div id="login-error" class="login-error" style="display: none;"></div>
        </div>
      </div>
    `;

    const loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleLogin(e);
    });
  }

  // Handle login
  async handleLogin(e) {
    try {
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const errorDiv = document.getElementById('login-error');

      errorDiv.style.display = 'none';

      showToast('Iniciando sesión...', 'info');

      await authManager.signIn(email, password);

      window.location.reload();

    } catch (error) {
      console.error('Login error:', error);
      const errorDiv = document.getElementById('login-error');
      errorDiv.textContent = error.message || 'Error al iniciar sesión';
      errorDiv.style.display = 'block';
    }
  }

  // Load data from IndexedDB
  async loadData() {
    try {
      this.tablets = await dbManager.getAllTablets();
      this.filteredTablets = [...this.tablets];

      console.log(`Loaded ${this.tablets.length} tablets from local storage`);

      if (navigator.onLine && supabaseClient.isAvailable()) {
        syncManager.syncAll().catch(err => {
          console.error('Background sync error:', err);
        });
      }

    } catch (error) {
      console.error('Load data error:', error);
      throw error;
    }
  }

  // Setup event listeners
  setupEventListeners() {
    // Navigation
    document.getElementById('back-btn')?.addEventListener('click', () => this.showView('dashboard'));
    document.getElementById('detail-back-btn')?.addEventListener('click', () => this.showView('dashboard'));
    document.getElementById('admin-back-btn')?.addEventListener('click', () => this.showView('dashboard'));

    // FAB - Add tablet
    document.getElementById('fab')?.addEventListener('click', () => {
      this.currentTablet = null;
      this.showView('form');
    });

    // Search
    document.getElementById('search-input')?.addEventListener('input', (e) => {
      this.handleSearch(e.target.value);
    });

    // Filters
    document.getElementById('filter-sede')?.addEventListener('change', () => this.applyFilters());
    document.getElementById('filter-estado')?.addEventListener('change', () => this.applyFilters());

    // Export
    document.getElementById('export-btn')?.addEventListener('click', () => this.showExportModal());
    document.getElementById('export-excel')?.addEventListener('click', () => this.exportData('excel'));
    document.getElementById('export-csv')?.addEventListener('click', () => this.exportData('csv'));
    document.getElementById('export-pdf')?.addEventListener('click', () => this.exportData('pdf'));

    // Sync
    document.getElementById('sync-btn')?.addEventListener('click', () => syncManager.manualSync());

    // User menu
    document.getElementById('user-menu-btn')?.addEventListener('click', () => this.toggleUserMenu());
    document.getElementById('logout-btn')?.addEventListener('click', () => this.handleLogout());

    // Form
    document.getElementById('tablet-form')?.addEventListener('submit', (e) => this.handleFormSubmit(e));
    document.getElementById('cancel-form-btn')?.addEventListener('click', () => this.showView('dashboard'));

    // Camera
    document.getElementById('start-camera-btn')?.addEventListener('click', () => this.startCamera());
    document.getElementById('capture-btn')?.addEventListener('click', () => this.capturePhoto());
    document.getElementById('upload-image-btn')?.addEventListener('click', () => {
      document.getElementById('image-upload-input').click();
    });
    document.getElementById('image-upload-input')?.addEventListener('change', (e) => this.handleImageUpload(e));

    // Evidence photos
    document.getElementById('add-evidence-btn')?.addEventListener('click', () => {
      document.getElementById('evidence-upload-input').click();
    });
    document.getElementById('evidence-upload-input')?.addEventListener('change', (e) => this.handleEvidenceUpload(e));

    // Estado pantalla - show "otro" field
    document.getElementById('estado_pantalla')?.addEventListener('change', (e) => {
      const otroGroup = document.getElementById('estado_pantalla_otro_group');
      if (e.target.value === 'Otro') {
        otroGroup.style.display = 'block';
      } else {
        otroGroup.style.display = 'none';
      }
    });

    // Estado físico general - show "otro" field
    document.getElementById('estado_fisico_general')?.addEventListener('change', (e) => {
      const otroGroup = document.getElementById('estado_fisico_otro_group');
      if (e.target.value === 'Otro') {
        otroGroup.style.display = 'block';
      } else {
        otroGroup.style.display = 'none';
      }
    });

    // Battery slider
    const batterySlider = document.getElementById('nivel_bateria_slider');
    const batteryInput = document.getElementById('nivel_bateria');
    const batteryDisplay = document.getElementById('nivel_bateria_display');

    batterySlider?.addEventListener('input', (e) => {
      batteryInput.value = e.target.value;
      batteryDisplay.textContent = e.target.value + '%';
    });

    batteryInput?.addEventListener('input', (e) => {
      batterySlider.value = e.target.value;
      batteryDisplay.textContent = e.target.value + '%';
    });

    // Modal close buttons
    document.querySelectorAll('.btn-close').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modalId = e.target.dataset.modal;
        this.hideModal(modalId);
      });
    });

    // Click outside modal to close
    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
      }
    });
  }

  // Show view
  showView(viewName) {
    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active');
    });

    const view = document.getElementById(`${viewName}-view`);
    if (view) {
      view.classList.add('active');
      this.currentView = viewName;

      if (viewName === 'dashboard') {
        this.renderDashboard();
      } else if (viewName === 'form') {
        this.renderForm();
      }
    }
  }

  // Render dashboard
  async renderDashboard() {
    await this.loadData();
    this.updateStatistics();
    this.updateFilterOptions();
    this.renderTabletsList();
  }

  // Update statistics
  async updateStatistics() {
    const stats = await dbManager.getStats();

    document.getElementById('stat-total').textContent = stats.total;
    document.getElementById('stat-good').textContent = stats.good;
    document.getElementById('stat-attention').textContent = stats.attention;
    document.getElementById('stat-pending').textContent = stats.pending;
  }

  // Update filter options
  updateFilterOptions() {
    const sedes = [...new Set(this.tablets.map(t => t.sede_procedencia))];
    const sedeSelect = document.getElementById('filter-sede');

    if (sedeSelect) {
      sedeSelect.innerHTML = '<option value="">Todas las sedes</option>';
      sedes.forEach(sede => {
        const option = document.createElement('option');
        option.value = sede;
        option.textContent = sede;
        sedeSelect.appendChild(option);
      });
    }
  }

  // Render tablets list
  renderTabletsList() {
    const container = document.getElementById('tablets-list');
    const emptyState = document.getElementById('empty-state');

    if (!container) return;

    container.innerHTML = '';

    if (this.filteredTablets.length === 0) {
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';

    this.filteredTablets.forEach(tablet => {
      const card = this.createTabletCard(tablet);
      container.appendChild(card);
    });
  }

  // Create tablet card
  createTabletCard(tablet) {
    const card = document.createElement('div');
    card.className = 'tablet-card';
    card.onclick = () => this.showTabletDetail(tablet.id);

    const statusClass = this.getStatusClass(tablet.estado_pantalla);
    const syncIcon = tablet.synced ? '' : '<span class="sync-pending-icon" title="Pendiente sincronizar">⚠</span>';

    card.innerHTML = `
      <div class="tablet-card-header">
        <h3>${tablet.codigo_unico}</h3>
        ${syncIcon}
      </div>
      <div class="tablet-card-body">
        <p class="tablet-model">${tablet.modelo || 'Sin modelo'}</p>
        <p class="tablet-sede">${tablet.sede_procedencia || 'Sin sede'}</p>
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

  // Get status class for badge
  getStatusClass(estado) {
    switch (estado) {
      case 'Bueno':
      case 'Funcional':
        return 'status-good';
      case 'Regular':
      case 'Con rayones':
        return 'status-warning';
      case 'Malo':
      case 'Roto':
        return 'status-danger';
      default:
        return 'status-default';
    }
  }

  // Show tablet detail
  async showTabletDetail(tabletId) {
    try {
      const tablet = await dbManager.getTablet(tabletId);
      
      if (!tablet) {
        showToast('Tablet no encontrada', 'error');
        return;
      }

      this.currentTablet = tablet;

      const content = document.getElementById('tablet-detail-content');
      if (!content) return;

      content.innerHTML = `
        <div class="detail-section">
          <h3>Información Básica</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <label>Código Único</label>
              <p>${tablet.codigo_unico || '-'}</p>
            </div>
            <div class="detail-item">
              <label>Modelo</label>
              <p>${tablet.modelo || '-'}</p>
            </div>
            <div class="detail-item">
              <label>Número de Serie</label>
              <p>${tablet.numero_serie || '-'}</p>
            </div>
            <div class="detail-item">
              <label>Sede de Procedencia</label>
              <p>${tablet.sede_procedencia || '-'}</p>
            </div>
            ${tablet.nombre_producto ? `
              <div class="detail-item">
                <label>Nombre del Producto</label>
                <p>${tablet.nombre_producto}</p>
              </div>
            ` : ''}
            ${tablet.numero_modelo ? `
              <div class="detail-item">
                <label>Número de Modelo</label>
                <p>${tablet.numero_modelo}</p>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="detail-section">
          <h3>Información Técnica</h3>
          <div class="detail-grid">
            ${tablet.version_android ? `
              <div class="detail-item">
                <label>Versión de Android</label>
                <p>${tablet.version_android}</p>
              </div>
            ` : ''}
            <div class="detail-item">
              <label>Nivel de Batería</label>
              <div class="battery-indicator">
                <div class="battery-bar" style="width: ${tablet.nivel_bateria || 0}%"></div>
                <span>${tablet.nivel_bateria || 0}%</span>
              </div>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h3>Estado del Dispositivo</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <label>Estado de Pantalla</label>
              <p><span class="status-badge ${this.getStatusClass(tablet.estado_pantalla)}">${tablet.estado_pantalla}</span></p>
              ${tablet.estado_pantalla_otro ? `<p class="detail-note">${tablet.estado_pantalla_otro}</p>` : ''}
            </div>
            <div class="detail-item">
              <label>Estado Puerto de Carga</label>
              <p>${tablet.estado_puerto_carga || '-'}</p>
            </div>
            <div class="detail-item">
              <label>Estado Físico General</label>
              <p>${tablet.estado_fisico_general || '-'}</p>
              ${tablet.estado_fisico_otro ? `<p class="detail-note">${tablet.estado_fisico_otro}</p>` : ''}
            </div>
            <div class="detail-item">
              <label>Accesorios</label>
              <p>
                ${tablet.tiene_cargador ? '✓ Cargador' : '✗ Sin cargador'}<br>
                ${tablet.tiene_cable ? '✓ Cable de carga' : '✗ Sin cable'}
              </p>
            </div>
          </div>
        </div>

        ${tablet.observaciones || tablet.hallazgos_relevantes ? `
          <div class="detail-section">
            <h3>Observaciones</h3>
            ${tablet.observaciones ? `
              <div class="detail-item">
                <label>Observaciones Adicionales</label>
                <p>${tablet.observaciones}</p>
              </div>
            ` : ''}
            ${tablet.hallazgos_relevantes ? `
              <div class="detail-item">
                <label>Hallazgos Relevantes</label>
                <p>${tablet.hallazgos_relevantes}</p>
              </div>
            ` : ''}
          </div>
        ` : ''}

        ${tablet.fotos_evidencia && tablet.fotos_evidencia.length > 0 ? `
          <div class="detail-section">
            <h3>Fotos de Evidencia</h3>
            <div class="evidence-gallery">
              ${tablet.fotos_evidencia.map(foto => `
                <img src="${foto}" alt="Evidencia" class="evidence-image">
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="detail-section">
          <h3>Información de Registro</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <label>Fecha de Mantenimiento</label>
              <p>${this.formatDate(tablet.fecha_mantenimiento)}</p>
            </div>
            <div class="detail-item">
              <label>Fecha de Registro</label>
              <p>${this.formatDateTime(tablet.created_at)}</p>
            </div>
            ${tablet.updated_at && tablet.updated_at !== tablet.created_at ? `
              <div class="detail-item">
                <label>Última Actualización</label>
                <p>${this.formatDateTime(tablet.updated_at)}</p>
              </div>
            ` : ''}
            <div class="detail-item">
              <label>Estado de Sincronización</label>
              <p>${tablet.synced ? '✓ Sincronizado' : '⚠ Pendiente de sincronizar'}</p>
            </div>
          </div>
        </div>
      `;

      const editBtn = document.getElementById('edit-tablet-btn');
      const deleteBtn = document.getElementById('delete-tablet-btn');

      if (editBtn) {
        editBtn.onclick = () => this.editTablet(tablet.id);
        if (!authManager.canEdit()) {
          editBtn.style.display = 'none';
        }
      }

      if (deleteBtn) {
        deleteBtn.onclick = () => this.deleteTablet(tablet.id);
        if (!authManager.isAdmin()) {
          deleteBtn.style.display = 'none';
        }
      }

      this.showView('detail');

    } catch (error) {
      console.error('Show tablet detail error:', error);
      showToast('Error al cargar detalles: ' + error.message, 'error');
    }
  }

  // Edit tablet
  async editTablet(tabletId) {
    try {
      const tablet = await dbManager.getTablet(tabletId);
      
      if (!tablet) {
        showToast('Tablet no encontrada', 'error');
        return;
      }

      this.currentTablet = tablet;
      this.showView('form');
      this.populateForm(tablet);

    } catch (error) {
      console.error('Edit tablet error:', error);
      showToast('Error al editar tablet: ' + error.message, 'error');
    }
  }

  // Delete tablet
  async deleteTablet(tabletId) {
    if (!confirm('¿Estás seguro de que deseas eliminar esta tablet? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      await dbManager.deleteTablet(tabletId);

      if (navigator.onLine && supabaseClient.isAvailable()) {
        try {
          await supabaseClient.deleteTablet(tabletId);
        } catch (error) {
          console.error('Error deleting from server:', error);
          await dbManager.addToSyncQueue('DELETE', 'tablets', tabletId, null);
        }
      } else {
        await dbManager.addToSyncQueue('DELETE', 'tablets', tabletId, null);
      }

      showToast('Tablet eliminada exitosamente', 'success');
      this.showView('dashboard');

    } catch (error) {
      console.error('Delete tablet error:', error);
      showToast('Error al eliminar tablet: ' + error.message, 'error');
    }
  }

  // Render form
  renderForm() {
    const formTitle = document.getElementById('form-title');
    const form = document.getElementById('tablet-form');
    const codigoInput = document.getElementById('codigo_unico');

    if (this.currentTablet) {
      formTitle.textContent = 'Editar Tablet';
      this.populateForm(this.currentTablet);
      
      // En modo edición, permitir editar código solo si es admin
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
      
      // Generar código automático para nueva tablet
      codigoInput.value = this.generateTabletCode();
      codigoInput.readOnly = true;
      codigoInput.style.backgroundColor = '#f3f4f6';
      
      // Set default date
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('fecha_mantenimiento').value = today;
    }
  }

  // Populate form with tablet data
  populateForm(tablet) {
    // Basic info
    document.getElementById('codigo_unico').value = tablet.codigo_unico || '';
    document.getElementById('numero_serie').value = tablet.numero_serie || '';
    document.getElementById('modelo').value = tablet.modelo || '';
    document.getElementById('nombre_producto').value = tablet.nombre_producto || '';
    document.getElementById('numero_modelo').value = tablet.numero_modelo || '';
    document.getElementById('sede_procedencia').value = tablet.sede_procedencia || '';

    // Technical info
    document.getElementById('version_android').value = tablet.version_android || '';
    document.getElementById('nivel_bateria').value = tablet.nivel_bateria || 0;
    document.getElementById('nivel_bateria_slider').value = tablet.nivel_bateria || 0;
    document.getElementById('nivel_bateria_display').textContent = (tablet.nivel_bateria || 0) + '%';

    // Device status
    document.getElementById('estado_pantalla').value = tablet.estado_pantalla || '';
    
    if (tablet.estado_pantalla === 'Otro') {
      document.getElementById('estado_pantalla_otro_group').style.display = 'block';
      document.getElementById('estado_pantalla_otro').value = tablet.estado_pantalla_otro || '';
    }

    document.getElementById('estado_puerto_carga').value = tablet.estado_puerto_carga || '';
    
    // Estado físico general con soporte para "Otro"
    document.getElementById('estado_fisico_general').value = tablet.estado_fisico_general || '';
    
    if (tablet.estado_fisico_general === 'Otro') {
      document.getElementById('estado_fisico_otro_group').style.display = 'block';
      document.getElementById('estado_fisico_otro').value = tablet.estado_fisico_otro || '';
    }
    
    document.getElementById('tiene_cargador').checked = tablet.tiene_cargador || false;
    document.getElementById('tiene_cable').checked = tablet.tiene_cable || false;

    // Observations
    document.getElementById('observaciones').value = tablet.observaciones || '';
    document.getElementById('hallazgos_relevantes').value = tablet.hallazgos_relevantes || '';
    document.getElementById('fecha_mantenimiento').value = tablet.fecha_mantenimiento || '';
  }

  // Handle form submit
  async handleFormSubmit(e) {
    e.preventDefault();

    try {
      const formData = new FormData(e.target);
      const tabletData = {
        codigo_unico: formData.get('codigo_unico'),
        numero_serie: formData.get('numero_serie'),
        modelo: formData.get('modelo'),
        nombre_producto: formData.get('nombre_producto') || null,
        numero_modelo: formData.get('numero_modelo') || null,
        sede_procedencia: formData.get('sede_procedencia'),
        version_android: formData.get('version_android') || null,
        nivel_bateria: parseInt(formData.get('nivel_bateria')) || null,
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
        synced: false
      };

      if (this.currentTablet) {
        // Update existing tablet
        tabletData.id = this.currentTablet.id;
        await dbManager.saveTablet(tabletData);

        // If online, update on server
        if (navigator.onLine && supabaseClient.isAvailable()) {
          try {
            const serverTablet = await supabaseClient.updateTablet(tabletData.id, tabletData);
            // Marcar como sincronizado después de éxito
            tabletData.synced = true;
            tabletData.last_synced_at = new Date().toISOString();
            await dbManager.saveTablet(tabletData);
          } catch (error) {
            console.error('Error updating on server:', error);
            await dbManager.addToSyncQueue('UPDATE', 'tablets', tabletData.id, tabletData);
          }
        } else {
          // Add to sync queue
          await dbManager.addToSyncQueue('UPDATE', 'tablets', tabletData.id, tabletData);
        }

        showToast('Tablet actualizada exitosamente', 'success');
      } else {
        // Create new tablet
        tabletData.id = this.generateUUID();
        
        // Verificar si ya existe localmente antes de guardar
        const existingLocal = await dbManager.searchTablets(tabletData.codigo_unico);
        if (existingLocal.length > 0) {
          const useExisting = confirm('Ya existe una tablet con este código. ¿Deseas actualizarla?');
          if (useExisting) {
            tabletData.id = existingLocal[0].id;
            await dbManager.saveTablet(tabletData);
          } else {
            showToast('Operación cancelada', 'info');
            return;
          }
        } else {
          await dbManager.saveTablet(tabletData);
        }

        // If online, create on server
        if (navigator.onLine && supabaseClient.isAvailable()) {
          try {
            const serverTablet = await supabaseClient.createTablet(tabletData);
            // Usar el ID del servidor y marcar como sincronizado
            tabletData.id = serverTablet.id;
            tabletData.synced = true;
            tabletData.last_synced_at = new Date().toISOString();
            await dbManager.saveTablet(tabletData);
          } catch (error) {
            console.error('Error creating on server:', error);
            
            // Si es duplicado, intentar encontrar y actualizar
            if (error.code === '23505') {
              console.log('Duplicate detected, searching for existing tablet...');
              try {
                const tablets = await supabaseClient.getTablets({ search: tabletData.codigo_unico });
                const existing = tablets.find(t => 
                  t.codigo_unico === tabletData.codigo_unico || 
                  t.numero_serie === tabletData.numero_serie
                );
                
                if (existing) {
                  await supabaseClient.updateTablet(existing.id, tabletData);
                  tabletData.id = existing.id;
                  tabletData.synced = true;
                  tabletData.last_synced_at = new Date().toISOString();
                  await dbManager.saveTablet(tabletData);
                  showToast('Tablet existente actualizada', 'info');
                } else {
                  await dbManager.addToSyncQueue('INSERT', 'tablets', tabletData.id, tabletData);
                }
              } catch (retryError) {
                console.error('Error recovering from duplicate:', retryError);
                await dbManager.addToSyncQueue('INSERT', 'tablets', tabletData.id, tabletData);
              }
            } else {
              await dbManager.addToSyncQueue('INSERT', 'tablets', tabletData.id, tabletData);
            }
          }
        } else {
          // Add to sync queue
          await dbManager.addToSyncQueue('INSERT', 'tablets', tabletData.id, tabletData);
        }

        showToast('Tablet registrada exitosamente', 'success');
      }

      // Update sync badge
      await syncManager.updateSyncBadge();

      // Go back to dashboard
      this.showView('dashboard');

    } catch (error) {
      console.error('Form submit error:', error);
      showToast('Error al guardar tablet: ' + error.message, 'error');
    }
  }

  // Start camera
  async startCamera() {
    try {
      await cameraManager.start();
    } catch (error) {
      console.error('Start camera error:', error);
    }
  }

  // Capture photo
  async capturePhoto() {
    try {
      const photoBlob = cameraManager.capturePhoto();
      
      cameraManager.stop();

      await this.processOCR(photoBlob);

    } catch (error) {
      console.error('Capture photo error:', error);
      showToast('Error al capturar foto: ' + error.message, 'error');
    }
  }

  // Handle image upload
  async handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      await this.processOCR(file);
    } catch (error) {
      console.error('Image upload error:', error);
      showToast('Error al procesar imagen: ' + error.message, 'error');
    }
  }

  // Process OCR
  async processOCR(imageSource) {
    try {
      // Show preview
      const preview = document.getElementById('ocr-preview');
      const previewImage = document.getElementById('ocr-preview-image');
      
      if (imageSource instanceof Blob || imageSource instanceof File) {
        const url = URL.createObjectURL(imageSource);
        previewImage.src = url;
      } else {
        previewImage.src = URL.createObjectURL(imageSource);
      }
      
      preview.style.display = 'block';

      // Process with OCR
      const extractedInfo = await ocrManager.processImage(imageSource);

      // Populate form fields (no sobrescribir código único automático)
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

      showToast('Información extraída. Verifica y completa los campos manualmente.', 'success');

    } catch (error) {
      console.error('OCR process error:', error);
      showToast('Error al procesar OCR. Completa los campos manualmente.', 'warning');
    }
  }

  // Handle evidence upload
  async handleEvidenceUpload(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const preview = document.getElementById('evidence-preview');
    
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = document.createElement('img');
        img.src = event.target.result;
        img.className = 'evidence-thumb';
        preview.appendChild(img);
      };
      reader.readAsDataURL(file);
    });
  }

  // Handle search
  handleSearch(query) {
    this.applyFilters(query);
  }

  // Apply filters
  applyFilters(searchQuery = null) {
    const search = searchQuery || document.getElementById('search-input')?.value || '';
    const sede = document.getElementById('filter-sede')?.value || '';
    const estado = document.getElementById('filter-estado')?.value || '';

    this.filteredTablets = this.tablets.filter(tablet => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch = 
          tablet.codigo_unico?.toLowerCase().includes(searchLower) ||
          tablet.modelo?.toLowerCase().includes(searchLower) ||
          tablet.numero_serie?.toLowerCase().includes(searchLower) ||
          tablet.sede_procedencia?.toLowerCase().includes(searchLower);
        
        if (!matchesSearch) return false;
      }

      // Sede filter
      if (sede && tablet.sede_procedencia !== sede) {
        return false;
      }

      // Estado filter
      if (estado && tablet.estado_pantalla !== estado) {
        return false;
      }

      return true;
    });

    this.renderTabletsList();
  }

  // Show export modal
  showExportModal() {
    const modal = document.getElementById('export-modal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  // Hide modal
  hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'none';
    }
  }

  // Export data
  async exportData(format) {
    this.hideModal('export-modal');

    exportManager.setData(this.filteredTablets);

    switch (format) {
      case 'excel':
        await exportManager.exportToExcel();
        break;
      case 'csv':
        await exportManager.exportToCSV();
        break;
      case 'pdf':
        await exportManager.exportToPDF();
        break;
    }
  }

  // Toggle user menu
  toggleUserMenu() {
    const menu = document.getElementById('user-menu');
    if (menu) {
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
  }

  // Handle logout
  async handleLogout() {
    if (!confirm('¿Estás seguro de que deseas cerrar sesión?')) {
      return;
    }

    try {
      await authManager.signOut();
      window.location.reload();
    } catch (error) {
      console.error('Logout error:', error);
      showToast('Error al cerrar sesión: ' + error.message, 'error');
    }
  }

  // Update UI
  updateUI() {
    const profile = authManager.getCurrentProfile();
    
    if (profile) {
      const userName = document.getElementById('user-name');
      const userRole = document.getElementById('user-role');
      
      if (userName) userName.textContent = profile.full_name || profile.email;
      if (userRole) userRole.textContent = this.getRoleLabel(profile.role);

      this.updateRoleBasedUI(profile.role);
    }
  }

  // Update role-based UI
  updateRoleBasedUI(role) {
    const elements = document.querySelectorAll('[data-role]');
    
    elements.forEach(element => {
      const allowedRoles = element.dataset.role.split(',');
      
      if (allowedRoles.includes(role)) {
        element.style.display = '';
      } else {
        element.style.display = 'none';
      }
    });
  }

  // Get role label
  getRoleLabel(role) {
    const labels = {
      'admin': 'Administrador',
      'tecnico': 'Técnico',
      'consulta': 'Solo Consulta'
    };
    return labels[role] || role;
  }

  // Hide splash screen
  hideSplashScreen() {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      setTimeout(() => {
        splash.style.opacity = '0';
        setTimeout(() => {
          splash.style.display = 'none';
        }, 300);
      }, 500);
    }
  }

  // Show app
  showApp() {
    const app = document.getElementById('app');
    if (app) {
      app.style.display = 'block';
    }
  }

  // Utility: Generate UUID
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Utility: Generate Tablet Code
  generateTabletCode() {
    // Formato: TAB-YYYYMMDD-XXXX (TAB-20251209-0001)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    
    // Generar un número aleatorio de 4 dígitos
    const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    
    return `TAB-${dateStr}-${random}`;
  }

  // Format date
  formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-GT');
  }

  // Format datetime
  formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('es-GT');
  }
}

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Initialize app when DOM is ready
(function() {
  console.log('=== SCRIPT APP.JS CARGADO ===');
  console.log('DOM readyState:', document.readyState);

  function startApp() {
    console.log('=== INICIANDO CREACIÓN DE APP ===');
    try {
      window.app = new TabletInventoryApp();
      console.log('✓ Instancia de app creada');
      window.app.init();
    } catch (error) {
      console.error('❌ Error al iniciar app:', error);
      console.error('Stack completo:', error.stack);
      
      // Mostrar error en pantalla
      const splash = document.getElementById('splash-screen');
      if (splash) splash.style.display = 'none';
      
      document.body.innerHTML = `
        <div style="padding: 20px; text-align: center; font-family: Arial;">
          <h2 style="color: red;">Error al iniciar la aplicación</h2>
          <p><strong>${error.message}</strong></p>
          <pre style="text-align: left; background: #f5f5f5; padding: 10px; border-radius: 5px; overflow: auto; max-height: 300px;">${error.stack}</pre>
          <button onclick="location.reload()" style="padding: 10px 20px; font-size: 16px; cursor: pointer; margin: 10px;">
            Recargar página
          </button>
          <button onclick="localStorage.clear(); indexedDB.deleteDatabase('TabletInventoryDB'); location.reload()" 
                  style="padding: 10px 20px; font-size: 16px; cursor: pointer; margin: 10px; background: red; color: white; border: none;">
            Limpiar todo y recargar
          </button>
        </div>
      `;
    }
  }

  // Esperar a que el DOM esté listo
  if (document.readyState === 'loading') {
    console.log('DOM aún cargando, esperando DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', startApp);
  } else {
    console.log('DOM ya está listo, iniciando inmediatamente...');
    startApp();
  }
})();
