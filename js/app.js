// ========================================
// VARIABLES GLOBALES
// ========================================
let currentPhotos = [];
let isEditMode = false;
let editingTabletId = null;

// ========================================
// UTILIDADES DE UI (Definir primero)
// ========================================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

function showLoader(message = 'Cargando...') {
    const loader = document.getElementById('loader');
    const text = loader.querySelector('p');
    text.textContent = message;
    loader.classList.remove('hidden');
}

function hideLoader() {
    document.getElementById('loader').classList.add('hidden');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : 
                 type === 'error' ? 'fa-exclamation-circle' :
                 type === 'warning' ? 'fa-exclamation-triangle' :
                 'fa-info-circle';
    
    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Auto-remover después de 4 segundos
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);

    // Agregar animación de salida si no existe
    if (!document.getElementById('toastAnimations')) {
        const style = document.createElement('style');
        style.id = 'toastAnimations';
        style.textContent = `
            @keyframes slideOut {
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

function updateOnlineStatus() {
    const statusIndicator = document.createElement('div');
    statusIndicator.id = 'onlineStatus';
    statusIndicator.className = 'online-status';
    statusIndicator.innerHTML = `
        <i class="fas fa-circle"></i>
        <span>${AppState.isOnline ? 'En línea' : 'Sin conexión'}</span>
    `;
    
    // Remover indicador existente
    const existing = document.getElementById('onlineStatus');
    if (existing) existing.remove();
    
    document.querySelector('.header-right').prepend(statusIndicator);

    // Agregar estilos
    if (!document.getElementById('onlineStatusStyles')) {
        const style = document.createElement('style');
        style.id = 'onlineStatusStyles';
        style.textContent = `
            .online-status {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.5rem 1rem;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 20px;
                font-size: 0.875rem;
                color: white;
            }
            .online-status i {
                font-size: 0.5rem;
                color: ${AppState.isOnline ? '#06d6a0' : '#f77f00'};
            }
        `;
        document.head.appendChild(style);
    }
}

// ========================================
// INICIALIZACIÓN
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Iniciando aplicación...');
    
    // Verificar si hay sesión activa
    const user = await AuthManager.getCurrentUser();
    
    if (user) {
        showScreen('listScreen');
        await loadDashboard();
    } else {
        showScreen('loginScreen');
    }

    // Configurar event listeners
    setupEventListeners();
    
    // Verificar estado de conexión
    updateOnlineStatus();
});

// ========================================
// EVENT LISTENERS
// ========================================
function setupEventListeners() {
    // Login
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // Navegación
    document.getElementById('btnAddNew').addEventListener('click', () => showFormScreen());
    document.getElementById('btnBack').addEventListener('click', () => {
        showScreen('listScreen');
        resetForm();
    });
    document.getElementById('btnCancel').addEventListener('click', () => {
        showScreen('listScreen');
        resetForm();
    });

    // Búsqueda y filtros
    document.getElementById('searchInput').addEventListener('input', handleSearch);
    document.getElementById('btnFilter').addEventListener('click', toggleFilterPanel);
    document.getElementById('btnApplyFilters').addEventListener('click', applyFilters);
    document.getElementById('btnClearFilters').addEventListener('click', clearFilters);

    // Formulario
    document.getElementById('tabletForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('btnGenerarCodigo').addEventListener('click', generateCode);
    
    // Sincronización de batería
    const batterySlider = document.getElementById('nivelBateria');
    const batteryInput = document.getElementById('nivelBateriaNum');
    const batteryPercentage = document.querySelector('.battery-percentage');

    batterySlider.addEventListener('input', (e) => {
        const value = e.target.value;
        batteryInput.value = value;
        batteryPercentage.textContent = `${value}%`;
    });

    batteryInput.addEventListener('input', (e) => {
        let value = parseInt(e.target.value) || 0;
        value = Math.max(0, Math.min(100, value));
        batterySlider.value = value;
        batteryPercentage.textContent = `${value}%`;
    });

    // Estado de pantalla - mostrar campo "Otro"
    document.getElementById('estadoPantalla').addEventListener('change', (e) => {
        const otroGroup = document.getElementById('estadoPantallaOtroGroup');
        if (e.target.value === 'Otro') {
            otroGroup.classList.remove('hidden');
        } else {
            otroGroup.classList.add('hidden');
        }
    });

    // Fotos
    document.getElementById('btnCamera').addEventListener('click', openCamera);
    document.getElementById('btnGallery').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });
    document.getElementById('btnScanOCR').addEventListener('click', openCameraForOCR);
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);

    // Modal de cámara
    document.getElementById('btnCapture').addEventListener('click', capturePhoto);
    document.getElementById('btnCancelCamera').addEventListener('click', closeCameraModal);
    document.getElementById('btnApplyOCR').addEventListener('click', applyOCRData);

    // Modal de detalles
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.modal').classList.remove('active');
        });
    });

    document.getElementById('btnEdit').addEventListener('click', editCurrentTablet);
    document.getElementById('btnDelete').addEventListener('click', deleteCurrentTablet);
    document.getElementById('btnViewHistory').addEventListener('click', viewHistory);

    // Header buttons
    document.getElementById('btnSync').addEventListener('click', handleSync);
    document.getElementById('btnExport').addEventListener('click', showExportOptions);
    document.getElementById('btnUser').addEventListener('click', showUserMenu);
}

// ========================================
// AUTENTICACIÓN
// ========================================
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    showLoader('Iniciando sesión...');

    const result = await AuthManager.login(email, password);

    hideLoader();

    if (result.success) {
        showToast(`Bienvenido, ${result.user.nombre}`, 'success');
        showScreen('listScreen');
        await loadDashboard();
    } else {
        showToast('Error de autenticación: ' + result.error, 'error');
    }
}

async function handleLogout() {
    if (!confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        return;
    }

    showLoader('Cerrando sesión...');

    const result = await AuthManager.logout();

    hideLoader();

    if (result.success) {
        showToast('Sesión cerrada correctamente', 'success');
        showScreen('loginScreen');
        resetForm();
        AppState.tablets = [];
        AppState.filteredTablets = [];
    } else {
        showToast('Error cerrando sesión', 'error');
    }
}

// ========================================
// DASHBOARD Y LISTADO
// ========================================
async function loadDashboard() {
    showLoader('Cargando inventario...');

    const result = await TabletManager.getAll();

    hideLoader();

    if (result.success) {
        renderTabletsList();
        updateStatistics();
    } else {
        if (!AppState.isOnline) {
            // Cargar datos offline
            const offlineData = SyncManager.loadOffline();
            if (offlineData) {
                AppState.tablets = offlineData;
                AppState.filteredTablets = offlineData;
                renderTabletsList();
                updateStatistics();
                showToast('Mostrando datos offline', 'info');
            } else {
                showToast('Error cargando datos y sin datos offline', 'error');
            }
        } else {
            showToast('Error cargando inventario: ' + result.error, 'error');
        }
    }
}

function renderTabletsList() {
    const container = document.getElementById('tabletsList');
    const noResults = document.getElementById('noResults');
    const tablets = AppState.filteredTablets;

    if (tablets.length === 0) {
        container.innerHTML = '';
        noResults.classList.remove('hidden');
        return;
    }

    noResults.classList.add('hidden');

    container.innerHTML = tablets.map(tablet => {
        const statusClass = getStatusClass(tablet);
        const statusText = getStatusText(tablet);

        return `
            <div class="tablet-card" data-id="${tablet.id}">
                <div class="tablet-card-header">
                    <div class="tablet-code">${tablet.codigo_unico}</div>
                    <span class="tablet-status ${statusClass}">${statusText}</span>
                </div>
                <div class="tablet-info">
                    <div class="tablet-info-row">
                        <span><i class="fas fa-microchip"></i> ${tablet.modelo || 'Sin modelo'}</span>
                    </div>
                    <div class="tablet-info-row">
                        <span><i class="fas fa-map-marker-alt"></i> ${tablet.sede}</span>
                    </div>
                    <div class="tablet-info-row">
                        <span><i class="fas fa-battery-half"></i> Batería:</span>
                        <span>${tablet.nivel_bateria}%</span>
                    </div>
                    <div class="tablet-info-row">
                        <span><i class="fas fa-desktop"></i> Pantalla:</span>
                        <span>${tablet.estado_pantalla}</span>
                    </div>
                    <div class="tablet-info-row">
                        <span><i class="fas fa-charging-station"></i> Puerto:</span>
                        <span>${tablet.estado_puerto_carga}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Agregar event listeners a las tarjetas
    container.querySelectorAll('.tablet-card').forEach(card => {
        card.addEventListener('click', () => {
            const tabletId = card.dataset.id;
            showTabletDetails(tabletId);
        });
    });

    // Guardar offline si estamos online
    if (AppState.isOnline) {
        SyncManager.saveOffline(tablets);
    }
}

function getStatusClass(tablet) {
    if (tablet.estado_pantalla === 'Quebrado' || 
        tablet.estado_puerto_carga === 'No Funciona' ||
        tablet.estado_fisico_general === 'Malo') {
        return 'status-danger';
    }
    
    if (tablet.estado_pantalla === 'Rayado' || 
        tablet.estado_pantalla === 'Con manchas' ||
        tablet.estado_fisico_general === 'Regular' ||
        tablet.nivel_bateria < 20) {
        return 'status-warning';
    }
    
    return 'status-good';
}

function getStatusText(tablet) {
    if (tablet.estado_pantalla === 'Quebrado' || 
        tablet.estado_puerto_carga === 'No Funciona' ||
        tablet.estado_fisico_general === 'Malo') {
        return 'Requiere atención';
    }
    
    if (tablet.estado_pantalla === 'Rayado' || 
        tablet.estado_pantalla === 'Con manchas' ||
        tablet.estado_fisico_general === 'Regular') {
        return 'Revisar';
    }
    
    return 'Buen estado';
}

function updateStatistics() {
    const stats = TabletManager.getStatistics();

    document.getElementById('totalTablets').textContent = stats.total;
    document.getElementById('tabletsOk').textContent = stats.ok;
    document.getElementById('tabletsIssues').textContent = stats.issues;
    document.getElementById('avgBattery').textContent = `${stats.avgBattery}%`;
}

// ========================================
// BÚSQUEDA Y FILTROS
// ========================================
function handleSearch(e) {
    const searchTerm = e.target.value;
    TabletManager.searchLocal(searchTerm);
    renderTabletsList();
    updateStatistics();
}

function toggleFilterPanel() {
    const panel = document.getElementById('filterPanel');
    panel.classList.toggle('hidden');
}

async function applyFilters() {
    const filters = {
        sede: document.getElementById('filterSede').value,
        estadoPantalla: document.getElementById('filterEstadoPantalla').value,
        estadoPuerto: document.getElementById('filterEstadoPuerto').value,
        fechaInicio: document.getElementById('filterFechaInicio').value,
        fechaFin: document.getElementById('filterFechaFin').value
    };

    showLoader('Aplicando filtros...');

    const result = await TabletManager.getAll(filters);

    hideLoader();

    if (result.success) {
        renderTabletsList();
        updateStatistics();
        toggleFilterPanel();
        showToast('Filtros aplicados', 'success');
    } else {
        showToast('Error aplicando filtros', 'error');
    }
}

async function clearFilters() {
    document.getElementById('filterSede').value = '';
    document.getElementById('filterEstadoPantalla').value = '';
    document.getElementById('filterEstadoPuerto').value = '';
    document.getElementById('filterFechaInicio').value = '';
    document.getElementById('filterFechaFin').value = '';

    await applyFilters();
}

// ========================================
// FORMULARIO
// ========================================
function showFormScreen(tablet = null) {
    if (tablet) {
        isEditMode = true;
        editingTabletId = tablet.id;
        document.getElementById('formTitle').textContent = 'Editar Tablet';
        fillForm(tablet);
    } else {
        isEditMode = false;
        editingTabletId = null;
        document.getElementById('formTitle').textContent = 'Nueva Tablet';
        resetForm();
        
        // Establecer fecha de mantenimiento por defecto (hoy)
        document.getElementById('fechaMantenimiento').value = new Date().toISOString().slice(0, 10);
    }

    showScreen('formScreen');
}

function fillForm(tablet) {
    document.getElementById('codigoUnico').value = tablet.codigo_unico;
    document.getElementById('numeroSerie').value = tablet.numero_serie || '';
    document.getElementById('modelo').value = tablet.modelo || '';
    document.getElementById('nombreProducto').value = tablet.nombre_producto || '';
    document.getElementById('sede').value = tablet.sede;
    document.getElementById('versionAndroid').value = tablet.version_android || '';
    
    // Batería
    const bateria = tablet.nivel_bateria || 0;
    document.getElementById('nivelBateria').value = bateria;
    document.getElementById('nivelBateriaNum').value = bateria;
    document.querySelector('.battery-percentage').textContent = `${bateria}%`;

    // Estados
    document.getElementById('estadoPantalla').value = tablet.estado_pantalla;
    if (tablet.estado_pantalla_otro) {
        document.getElementById('estadoPantalla').value = 'Otro';
        document.getElementById('estadoPantallaOtro').value = tablet.estado_pantalla_otro;
        document.getElementById('estadoPantallaOtroGroup').classList.remove('hidden');
    }
    
    document.getElementById('estadoPuertoCarga').value = tablet.estado_puerto_carga;
    document.getElementById('estadoFisicoGeneral').value = tablet.estado_fisico_general;
    
    // Checkboxes
    document.getElementById('tieneCargador').checked = tablet.tiene_cargador || false;
    document.getElementById('tieneCableCarga').checked = tablet.tiene_cable_carga || false;

    // Observaciones
    document.getElementById('observacionesAdicionales').value = tablet.observaciones_adicionales || '';
    document.getElementById('hallazgosRelevantes').value = tablet.hallazgos_relevantes || '';
    document.getElementById('fechaMantenimiento').value = tablet.fecha_mantenimiento || '';

    // Fotos
    if (tablet.fotos_urls && tablet.fotos_urls.length > 0) {
        currentPhotos = tablet.fotos_urls.map(url => ({ url, isExisting: true }));
        renderPhotoPreview();
    }
}

function resetForm() {
    document.getElementById('tabletForm').reset();
    document.getElementById('estadoPantallaOtroGroup').classList.add('hidden');
    document.getElementById('nivelBateriaNum').value = 0;
    document.querySelector('.battery-percentage').textContent = '0%';
    currentPhotos = [];
    renderPhotoPreview();
    isEditMode = false;
    editingTabletId = null;
}

async function generateCode() {
    showLoader('Generando código...');
    
    const result = await TabletManager.generateUniqueCode();
    
    hideLoader();

    if (result.success) {
        document.getElementById('codigoUnico').value = result.code;
        showToast('Código generado', 'success');
    } else {
        showToast('Error generando código', 'error');
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();

    if (!AuthManager.hasPermission(isEditMode ? 'edit' : 'create')) {
        showToast('No tienes permisos para esta acción', 'error');
        return;
    }

    showLoader(isEditMode ? 'Actualizando tablet...' : 'Creando tablet...');

    // Recopilar datos del formulario
    const formData = {
        codigo_unico: document.getElementById('codigoUnico').value,
        numero_serie: document.getElementById('numeroSerie').value,
        modelo: document.getElementById('modelo').value,
        nombre_producto: document.getElementById('nombreProducto').value,
        sede: document.getElementById('sede').value,
        version_android: document.getElementById('versionAndroid').value,
        nivel_bateria: parseInt(document.getElementById('nivelBateria').value),
        estado_pantalla: document.getElementById('estadoPantalla').value,
        estado_pantalla_otro: null,
        estado_puerto_carga: document.getElementById('estadoPuertoCarga').value,
        estado_fisico_general: document.getElementById('estadoFisicoGeneral').value,
        tiene_cargador: document.getElementById('tieneCargador').checked,
        tiene_cable_carga: document.getElementById('tieneCableCarga').checked,
        observaciones_adicionales: document.getElementById('observacionesAdicionales').value,
        hallazgos_relevantes: document.getElementById('hallazgosRelevantes').value,
        fecha_mantenimiento: document.getElementById('fechaMantenimiento').value
    };

    // Manejar estado de pantalla "Otro"
    if (formData.estado_pantalla === 'Otro') {
        const otroValor = document.getElementById('estadoPantallaOtro').value.trim();
        if (!otroValor) {
            hideLoader();
            showToast('Debes especificar el estado de pantalla', 'error');
            return;
        }
        
        formData.estado_pantalla_otro = otroValor;
        
        // Agregar a opciones si no existe
        await OptionsManager.addEstadoPantallaOption(otroValor);
        formData.estado_pantalla = otroValor;
    }

    // Subir fotos nuevas
    const newPhotos = currentPhotos.filter(p => !p.isExisting);
    if (newPhotos.length > 0) {
        const photoUrls = await PhotoManager.uploadMultiplePhotos(
            newPhotos.map(p => p.file),
            formData.codigo_unico
        );
        
        // Combinar con fotos existentes
        const existingUrls = currentPhotos.filter(p => p.isExisting).map(p => p.url);
        formData.fotos_urls = [...existingUrls, ...photoUrls];
    } else {
        formData.fotos_urls = currentPhotos.map(p => p.url);
    }

    // Guardar en base de datos
    let result;
    if (isEditMode) {
        result = await TabletManager.update(editingTabletId, formData);
    } else {
        result = await TabletManager.create(formData);
    }

    hideLoader();

    if (result.success) {
        showToast(isEditMode ? 'Tablet actualizada correctamente' : 'Tablet creada correctamente', 'success');
        showScreen('listScreen');
        resetForm();
        await loadDashboard();
    } else {
        if (!AppState.isOnline) {
            // Guardar operación pendiente
            SyncManager.addPendingSync({
                type: isEditMode ? 'update' : 'create',
                id: editingTabletId,
                data: formData
            });
            showToast('Sin conexión. Se sincronizará cuando haya internet.', 'warning');
            showScreen('listScreen');
            resetForm();
        } else {
            showToast('Error guardando tablet: ' + result.error, 'error');
        }
    }
}

// Continúa en el siguiente comentario...
// ========================================
// DETALLES DE TABLET
// ========================================
async function showTabletDetails(tabletId) {
    showLoader('Cargando detalles...');

    const result = await TabletManager.getById(tabletId);

    hideLoader();

    if (!result.success) {
        showToast('Error cargando detalles', 'error');
        return;
    }

    const tablet = result.data;
    const modal = document.getElementById('detailModal');
    const body = document.getElementById('detailBody');

    // Renderizar detalles
    body.innerHTML = `
        <div class="detail-grid">
            <div class="detail-section">
                <h3>Información Básica</h3>
                <div class="detail-row">
                    <span class="detail-label">Código Único:</span>
                    <span class="detail-value">${tablet.codigo_unico}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Número de Serie:</span>
                    <span class="detail-value">${tablet.numero_serie || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Modelo:</span>
                    <span class="detail-value">${tablet.modelo || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Nombre del Producto:</span>
                    <span class="detail-value">${tablet.nombre_producto || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Sede:</span>
                    <span class="detail-value">${tablet.sede}</span>
                </div>
            </div>

            <div class="detail-section">
                <h3>Información Técnica</h3>
                <div class="detail-row">
                    <span class="detail-label">Versión Android:</span>
                    <span class="detail-value">${tablet.version_android || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Nivel de Batería:</span>
                    <span class="detail-value">${tablet.nivel_bateria}%</span>
                </div>
            </div>

            <div class="detail-section">
                <h3>Estado del Dispositivo</h3>
                <div class="detail-row">
                    <span class="detail-label">Estado de Pantalla:</span>
                    <span class="detail-value">${tablet.estado_pantalla}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Estado Puerto de Carga:</span>
                    <span class="detail-value">${tablet.estado_puerto_carga}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Estado Físico General:</span>
                    <span class="detail-value">${tablet.estado_fisico_general}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Tiene Cargador:</span>
                    <span class="detail-value">${tablet.tiene_cargador ? 'Sí' : 'No'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Tiene Cable de Carga:</span>
                    <span class="detail-value">${tablet.tiene_cable_carga ? 'Sí' : 'No'}</span>
                </div>
            </div>

            ${tablet.observaciones_adicionales ? `
                <div class="detail-section full-width">
                    <h3>Observaciones Adicionales</h3>
                    <p>${tablet.observaciones_adicionales}</p>
                </div>
            ` : ''}

            ${tablet.hallazgos_relevantes ? `
                <div class="detail-section full-width">
                    <h3>Hallazgos Relevantes</h3>
                    <p>${tablet.hallazgos_relevantes}</p>
                </div>
            ` : ''}

            <div class="detail-section">
                <h3>Mantenimiento</h3>
                <div class="detail-row">
                    <span class="detail-label">Fecha de Mantenimiento:</span>
                    <span class="detail-value">${tablet.fecha_mantenimiento || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Fecha de Creación:</span>
                    <span class="detail-value">${new Date(tablet.created_at).toLocaleString('es-GT')}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Última Actualización:</span>
                    <span class="detail-value">${new Date(tablet.updated_at).toLocaleString('es-GT')}</span>
                </div>
            </div>

            ${tablet.fotos_urls && tablet.fotos_urls.length > 0 ? `
                <div class="detail-section full-width">
                    <h3>Fotos de Evidencia</h3>
                    <div class="photo-gallery">
                        ${tablet.fotos_urls.map(url => `
                            <img src="${url}" alt="Foto tablet" class="detail-photo">
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;

    // Agregar estilos inline para el modal de detalles
    if (!document.getElementById('detailStyles')) {
        const style = document.createElement('style');
        style.id = 'detailStyles';
        style.textContent = `
            .detail-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 1.5rem;
            }
            .detail-section {
                background: var(--bg-color);
                padding: 1rem;
                border-radius: 8px;
            }
            .detail-section.full-width {
                grid-column: 1 / -1;
            }
            .detail-section h3 {
                color: var(--primary-color);
                margin-bottom: 1rem;
                font-size: 1.1rem;
            }
            .detail-row {
                display: flex;
                justify-content: space-between;
                padding: 0.5rem 0;
                border-bottom: 1px solid var(--border-color);
            }
            .detail-row:last-child {
                border-bottom: none;
            }
            .detail-label {
                font-weight: 500;
                color: var(--text-secondary);
            }
            .detail-value {
                font-weight: 600;
                color: var(--text-primary);
            }
            .photo-gallery {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                gap: 1rem;
            }
            .detail-photo {
                width: 100%;
                height: 150px;
                object-fit: cover;
                border-radius: 8px;
                cursor: pointer;
                transition: transform 0.3s ease;
            }
            .detail-photo:hover {
                transform: scale(1.05);
            }
        `;
        document.head.appendChild(style);
    }

    modal.classList.add('active');

    // Agregar listener para ampliar fotos
    body.querySelectorAll('.detail-photo').forEach(img => {
        img.addEventListener('click', () => {
            window.open(img.src, '_blank');
        });
    });
}

function editCurrentTablet() {
    const modal = document.getElementById('detailModal');
    modal.classList.remove('active');
    showFormScreen(AppState.currentTablet);
}

async function deleteCurrentTablet() {
    if (!AuthManager.hasPermission('delete')) {
        showToast('No tienes permisos para eliminar tablets', 'error');
        return;
    }

    if (!confirm('¿Estás seguro de que deseas eliminar esta tablet? Esta acción no se puede deshacer.')) {
        return;
    }

    const modal = document.getElementById('detailModal');
    modal.classList.remove('active');

    showLoader('Eliminando tablet...');

    const result = await TabletManager.delete(AppState.currentTablet.id);

    hideLoader();

    if (result.success) {
        showToast('Tablet eliminada correctamente', 'success');
        await loadDashboard();
    } else {
        showToast('Error eliminando tablet: ' + result.error, 'error');
    }
}

async function viewHistory() {
    showLoader('Cargando historial...');

    const result = await TabletManager.getHistory(AppState.currentTablet.id);

    hideLoader();

    if (!result.success || result.data.length === 0) {
        showToast('No hay historial disponible', 'info');
        return;
    }

    const history = result.data;
    const body = document.getElementById('detailBody');

    body.innerHTML = `
        <div class="history-container">
            <h3>Historial de Cambios</h3>
            <div class="history-timeline">
                ${history.map(h => `
                    <div class="history-item">
                        <div class="history-date">
                            ${new Date(h.fecha_cambio).toLocaleString('es-GT')}
                        </div>
                        <div class="history-content">
                            <strong>${h.campo_modificado}</strong>
                            <div class="history-change">
                                <span class="old-value">${h.valor_anterior || 'N/A'}</span>
                                <i class="fas fa-arrow-right"></i>
                                <span class="new-value">${h.valor_nuevo || 'N/A'}</span>
                            </div>
                            <div class="history-user">
                                <i class="fas fa-user"></i> ${h.usuario?.nombre || 'Sistema'}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="btn-secondary" onclick="showTabletDetails('${AppState.currentTablet.id}')">
                <i class="fas fa-arrow-left"></i> Volver a Detalles
            </button>
        </div>
    `;

    // Agregar estilos para historial
    if (!document.getElementById('historyStyles')) {
        const style = document.createElement('style');
        style.id = 'historyStyles';
        style.textContent = `
            .history-container {
                padding: 1rem;
            }
            .history-timeline {
                margin: 2rem 0;
            }
            .history-item {
                display: flex;
                gap: 1rem;
                margin-bottom: 1.5rem;
                padding-bottom: 1.5rem;
                border-bottom: 1px solid var(--border-color);
            }
            .history-item:last-child {
                border-bottom: none;
            }
            .history-date {
                min-width: 150px;
                font-size: 0.875rem;
                color: var(--text-secondary);
                font-weight: 500;
            }
            .history-content {
                flex: 1;
            }
            .history-change {
                display: flex;
                align-items: center;
                gap: 1rem;
                margin: 0.5rem 0;
            }
            .old-value {
                color: var(--danger-color);
                text-decoration: line-through;
            }
            .new-value {
                color: var(--success-color);
                font-weight: 600;
            }
            .history-user {
                font-size: 0.875rem;
                color: var(--text-secondary);
                margin-top: 0.5rem;
            }
        `;
        document.head.appendChild(style);
    }
}

// ========================================
// CÁMARA Y FOTOS
// ========================================
async function openCamera() {
    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    const ocrResult = document.getElementById('ocrResult');

    ocrResult.classList.add('hidden');
    modal.dataset.ocrMode = 'false';
    
    const result = await CameraManager.initialize(video, canvas);

    if (!result.success) {
        showToast('Error accediendo a la cámara: ' + result.error, 'error');
        return;
    }

    modal.classList.add('active');
}

async function openCameraForOCR() {
    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    
    const result = await CameraManager.initialize(video, canvas);

    if (!result.success) {
        showToast('Error accediendo a la cámara: ' + result.error, 'error');
        return;
    }

    modal.classList.add('active');
    modal.dataset.ocrMode = 'true';
}

async function capturePhoto() {
    const modal = document.getElementById('cameraModal');
    const isOCRMode = modal.dataset.ocrMode === 'true';

    if (isOCRMode) {
        await captureAndProcessOCR();
    } else {
        const result = await CameraManager.capture();

        if (!result.success) {
            showToast('Error capturando foto', 'error');
            return;
        }

        // Convertir blob a file
        const file = ImageHandler.blobToFile(result.blob, `photo_${Date.now()}.jpg`);

        // Agregar a fotos actuales
        currentPhotos.push({
            file: file,
            url: result.url,
            isExisting: false
        });

        renderPhotoPreview();
        closeCameraModal();
        showToast('Foto capturada correctamente', 'success');
    }
}

async function captureAndProcessOCR() {
    showLoader('Procesando imagen con OCR...');

    const result = await CameraManager.captureAndExtractInfo();

    hideLoader();

    if (!result.success) {
        showToast('Error procesando imagen', 'error');
        return;
    }

    if (!result.ocr.success) {
        showToast('Error en OCR: ' + result.ocr.error, 'error');
        return;
    }

    // Mostrar resultados del OCR
    const ocrResultDiv = document.getElementById('ocrResult');
    const ocrText = document.getElementById('ocrText');

    const data = result.ocr.data;
    
    ocrText.innerHTML = `
        <div class="ocr-data">
            ${data.nombreProducto ? `<div><strong>Nombre del Producto:</strong> ${data.nombreProducto}</div>` : ''}
            ${data.modelo ? `<div><strong>Modelo:</strong> ${data.modelo}</div>` : ''}
            ${data.numeroSerie ? `<div><strong>Número de Serie:</strong> ${data.numeroSerie}</div>` : ''}
            ${data.nivelBateria !== null ? `<div><strong>Nivel de Batería:</strong> ${data.nivelBateria}%</div>` : ''}
            ${data.versionAndroid ? `<div><strong>Versión Android:</strong> ${data.versionAndroid}</div>` : ''}
        </div>
        <div class="ocr-raw-text">
            <h4>Texto Completo Detectado:</h4>
            <pre>${result.ocr.rawText}</pre>
        </div>
    `;

    ocrResultDiv.classList.remove('hidden');

    // Guardar datos de OCR temporalmente
    window.ocrExtractedData = data;

    // Agregar estilos para OCR
    if (!document.getElementById('ocrStyles')) {
        const style = document.createElement('style');
        style.id = 'ocrStyles';
        style.textContent = `
            .ocr-data {
                background: white;
                padding: 1rem;
                border-radius: 8px;
                margin-bottom: 1rem;
            }
            .ocr-data > div {
                padding: 0.5rem 0;
                border-bottom: 1px solid var(--border-color);
            }
            .ocr-data > div:last-child {
                border-bottom: none;
            }
            .ocr-raw-text {
                margin-top: 1rem;
            }
            .ocr-raw-text h4 {
                color: var(--text-secondary);
                font-size: 0.875rem;
                margin-bottom: 0.5rem;
            }
            .ocr-raw-text pre {
                background: white;
                padding: 1rem;
                border-radius: 8px;
                font-size: 0.75rem;
                max-height: 150px;
                overflow-y: auto;
                white-space: pre-wrap;
            }
        `;
        document.head.appendChild(style);
    }

    // También guardar la foto
    const file = ImageHandler.blobToFile(result.image.blob, `ocr_photo_${Date.now()}.jpg`);
    currentPhotos.push({
        file: file,
        url: result.image.url,
        isExisting: false
    });

    renderPhotoPreview();
}

function applyOCRData() {
    if (!window.ocrExtractedData) {
        showToast('No hay datos de OCR para aplicar', 'error');
        return;
    }

    const data = window.ocrExtractedData;

    // Aplicar cada campo si tiene valor
    if (data.nombreProducto) {
        document.getElementById('nombreProducto').value = data.nombreProducto;
    }
    
    if (data.modelo) {
        document.getElementById('modelo').value = data.modelo;
    }
    
    if (data.numeroSerie) {
        document.getElementById('numeroSerie').value = data.numeroSerie;
    }
    
    if (data.nivelBateria !== null) {
        const bateria = data.nivelBateria;
        document.getElementById('nivelBateria').value = bateria;
        document.getElementById('nivelBateriaNum').value = bateria;
        document.querySelector('.battery-percentage').textContent = `${bateria}%`;
    }
    
    if (data.versionAndroid) {
        document.getElementById('versionAndroid').value = data.versionAndroid;
    }

    closeCameraModal();
    showToast('Datos aplicados al formulario', 'success');
}

function closeCameraModal() {
    const modal = document.getElementById('cameraModal');
    const ocrResult = document.getElementById('ocrResult');
    
    CameraManager.stop();
    modal.classList.remove('active');
    modal.dataset.ocrMode = 'false';
    ocrResult.classList.add('hidden');
    window.ocrExtractedData = null;
}

async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    
    if (files.length === 0) return;

    showLoader('Procesando imágenes...');

    const processed = await ImageHandler.processMultipleFiles(files);

    hideLoader();

    // Agregar a fotos actuales
    processed.forEach(p => {
        currentPhotos.push({
            file: p.resized,
            url: p.url,
            isExisting: false
        });
    });

    renderPhotoPreview();
    showToast(`${processed.length} foto(s) agregada(s)`, 'success');

    // Limpiar input
    e.target.value = '';
}

function renderPhotoPreview() {
    const container = document.getElementById('photoPreview');

    if (currentPhotos.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No hay fotos agregadas</p>';
        return;
    }

    container.innerHTML = currentPhotos.map((photo, index) => `
        <div class="photo-item">
            <img src="${photo.url}" alt="Foto ${index + 1}">
            <button class="photo-remove" onclick="removePhoto(${index})" type="button">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

function removePhoto(index) {
    const photo = currentPhotos[index];
    
    // Si es una foto existente, marcarla para eliminación
    if (photo.isExisting) {
        // Aquí podrías agregar lógica para eliminar de Storage si lo deseas
        // await PhotoManager.deletePhoto(PhotoManager.getPhotoPath(photo.url));
    }

    currentPhotos.splice(index, 1);
    renderPhotoPreview();
    showToast('Foto eliminada', 'info');
}

// ========================================
// SINCRONIZACIÓN Y EXPORTACIÓN
// ========================================
async function handleSync() {
    if (!AppState.isOnline) {
        showToast('Sin conexión a internet', 'warning');
        return;
    }

    const pending = SyncManager.getPendingSync();
    
    if (pending.length === 0) {
        showToast('No hay operaciones pendientes', 'info');
        await loadDashboard();
        return;
    }

    showLoader(`Sincronizando ${pending.length} operación(es)...`);

    const results = await SyncManager.syncPending();

    hideLoader();

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    if (successful > 0) {
        showToast(`${successful} operación(es) sincronizada(s)`, 'success');
        await loadDashboard();
    }

    if (failed > 0) {
        showToast(`${failed} operación(es) fallaron`, 'error');
    }
}

function showExportOptions() {
    const options = [
        { text: 'Exportar a Excel', icon: 'fa-file-excel', action: () => ReportManager.exportToExcel() },
        { text: 'Exportar a PDF', icon: 'fa-file-pdf', action: () => ReportManager.exportToPDF() }
    ];

    showContextMenu(options);
}

function showUserMenu() {
    if (!AppState.currentUser) return;

    const options = [
        { 
            text: `${AppState.currentUser.nombre} (${AppState.currentUser.rol})`, 
            icon: 'fa-user', 
            action: null,
            disabled: true 
        },
        { text: 'Cerrar Sesión', icon: 'fa-sign-out-alt', action: handleLogout }
    ];

    showContextMenu(options);
}

function showContextMenu(options) {
    // Remover menú existente si hay
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.innerHTML = options.map(opt => `
        <div class="context-menu-item ${opt.disabled ? 'disabled' : ''}" ${opt.action ? 'data-clickable="true"' : ''}>
            <i class="fas ${opt.icon}"></i>
            <span>${opt.text}</span>
        </div>
    `).join('');

    document.body.appendChild(menu);

    // Posicionar cerca del botón
    const userBtn = document.getElementById('btnUser');
    const rect = userBtn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 10}px`;
    menu.style.right = '1rem';

    // Agregar event listeners
    const clickableItems = menu.querySelectorAll('[data-clickable="true"]');
    const activeOptions = options.filter(o => !o.disabled);
    
    clickableItems.forEach((item, index) => {
        const option = activeOptions[index];
        if (option && option.action) {
            item.addEventListener('click', () => {
                option.action();
                menu.remove();
            });
        }
    });

    // Cerrar al hacer click fuera
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && e.target !== userBtn && e.target !== document.getElementById('btnExport')) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 100);

    // Agregar estilos para menú contextual
    if (!document.getElementById('contextMenuStyles')) {
        const style = document.createElement('style');
        style.id = 'contextMenuStyles';
        style.textContent = `
            .context-menu {
                background: white;
                border-radius: 8px;
                box-shadow: var(--shadow-lg);
                min-width: 200px;
                z-index: 1001;
                overflow: hidden;
                animation: slideDown 0.2s ease;
            }
            @keyframes slideDown {
                from {
                    opacity: 0;
                    transform: translateY(-10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            .context-menu-item {
                padding: 0.75rem 1rem;
                display: flex;
                align-items: center;
                gap: 0.75rem;
                cursor: pointer;
                transition: var(--transition);
                border-bottom: 1px solid var(--border-color);
            }
            .context-menu-item:last-child {
                border-bottom: none;
            }
            .context-menu-item:hover:not(.disabled) {
                background: var(--bg-color);
            }
            .context-menu-item.disabled {
                opacity: 0.6;
                cursor: default;
                font-weight: 600;
                color: var(--primary-color);
            }
            .context-menu-item i {
                width: 20px;
                text-align: center;
                color: var(--primary-color);
            }
        `;
        document.head.appendChild(style);
    }
}

// ========================================
// LISTENERS PARA CONEXIÓN
// ========================================
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// ========================================
// FIN DEL ARCHIVO
// ========================================
console.log('app.js cargado correctamente');
