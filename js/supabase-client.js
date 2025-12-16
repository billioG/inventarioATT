// ========================================
// CONFIGURACIÓN DE SUPABASE
// ========================================
const SUPABASE_URL = 'https://pfshuqbqoqunockrphnm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmc2h1cWJxb3F1bm9ja3JwaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMjkwODksImV4cCI6MjA4MDkwNTA4OX0.lQW62ETddyyPQLbOHEJ7w6wUZ8qoNvX97gqjV-4GgCQ'; // REEMPLAZAR CON TU CLAVE REAL

// Esperar a que la librería de Supabase esté disponible
let supabaseClient;

function initializeSupabase() {
    if (typeof window.supabase === 'undefined') {
        console.error('Supabase no está cargado. Asegúrate de que el CDN esté incluido.');
        return null;
    }
    
    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase inicializado correctamente');
        return supabaseClient;
    } catch (error) {
        console.error('❌ Error inicializando Supabase:', error);
        return null;
    }
}

// Intentar inicializar inmediatamente
supabaseClient = initializeSupabase();

// Si falla, reintentar después de que se cargue la página
if (!supabaseClient) {
    window.addEventListener('load', () => {
        supabaseClient = initializeSupabase();
    });
}

// Getter para acceder al cliente de forma segura
const getSupabase = () => {
    if (!supabaseClient) {
        supabaseClient = initializeSupabase();
    }
    return supabaseClient;
};

// ========================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ========================================
const AppState = {
    currentUser: null,
    currentTablet: null,
    tablets: [],
    filteredTablets: [],
    photos: [],
    isOnline: navigator.onLine,
    pendingSync: []
};

// ========================================
// GESTIÓN DE AUTENTICACIÓN
// ========================================
class AuthManager {
    static async login(email, password) {
        try {
            const supabase = getSupabase();
            if (!supabase) {
                throw new Error('Supabase no está inicializado. Por favor recarga la página.');
            }

            console.log('Intentando autenticar:', email);

            // Autenticar con Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (authError) {
                console.error('Error de autenticación:', authError);
                throw new Error('Credenciales incorrectas. Verifica tu email y contraseña.');
            }

            if (!authData.user) {
                throw new Error('No se pudo autenticar el usuario');
            }

            console.log('✅ Usuario autenticado:', authData.user.email);

            // Obtener información del usuario de la tabla usuarios
            const { data: userData, error: userError } = await supabase
                .from('usuarios')
                .select('*')
                .eq('email', email)
                .maybeSingle();

            if (userError) {
                console.error('Error obteniendo usuario:', userError);
            }

            if (!userData) {
                console.warn('⚠️ Usuario autenticado pero no registrado en tabla usuarios. Creando automáticamente...');
                
                // Auto-registrar usuario
                const { data: newUser, error: insertError } = await supabase
                    .from('usuarios')
                    .insert([{
                        email: email,
                        nombre: authData.user.email.split('@')[0],
                        rol: 'admin'
                    }])
                    .select()
                    .single();

                if (insertError) {
                    console.error('Error creando usuario:', insertError);
                    // Continuar con usuario temporal
                    AppState.currentUser = {
                        id: authData.user.id,
                        email: email,
                        nombre: authData.user.email.split('@')[0],
                        rol: 'admin'
                    };
                    return { success: true, user: AppState.currentUser };
                }

                AppState.currentUser = newUser;
                return { success: true, user: newUser };
            }

            AppState.currentUser = userData;
            return { success: true, user: userData };
        } catch (error) {
            console.error('❌ Error en login:', error);
            return { 
                success: false, 
                error: error.message || 'Error desconocido durante el login'
            };
        }
    }

    static async logout() {
        try {
            const supabase = getSupabase();
            if (!supabase) {
                throw new Error('Supabase no está inicializado');
            }

            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            
            AppState.currentUser = null;
            console.log('✅ Sesión cerrada');
            return { success: true };
        } catch (error) {
            console.error('❌ Error en logout:', error);
            return { success: false, error: error.message };
        }
    }

    static async getCurrentUser() {
        try {
            const supabase = getSupabase();
            if (!supabase) {
                console.log('⚠️ Supabase no disponible aún');
                return null;
            }

            const { data: { user } } = await supabase.auth.getUser();
            
            if (user) {
                const { data: userData } = await supabase
                    .from('usuarios')
                    .select('*')
                    .eq('email', user.email)
                    .maybeSingle();
                
                if (userData) {
                    AppState.currentUser = userData;
                    console.log('✅ Usuario actual:', userData.email);
                    return userData;
                }
            }
            return null;
        } catch (error) {
            console.error('❌ Error obteniendo usuario:', error);
            return null;
        }
    }

    static hasPermission(action) {
        if (!AppState.currentUser) return false;
        
        const permissions = {
            'create': ['admin', 'tecnico'],
            'edit': ['admin', 'tecnico'],
            'delete': ['admin'],
            'view': ['admin', 'tecnico', 'lectura']
        };

        return permissions[action]?.includes(AppState.currentUser.rol) || false;
    }
}

// ========================================
// GESTIÓN DE TABLETS
// ========================================
class TabletManager {
    static async getAll(filters = {}) {
        try {
            const supabase = getSupabase();
            if (!supabase) {
                throw new Error('Supabase no está inicializado');
            }

            let query = supabase
                .from('tablets')
                .select('*')
                .order('created_at', { ascending: false });

            if (filters.sede && filters.sede !== '') {
                query = query.eq('sede', filters.sede);
            }

            if (filters.estadoPantalla && filters.estadoPantalla !== '') {
                query = query.eq('estado_pantalla', filters.estadoPantalla);
            }

            if (filters.estadoPuerto && filters.estadoPuerto !== '') {
                query = query.eq('estado_puerto_carga', filters.estadoPuerto);
            }

            if (filters.fechaInicio) {
                query = query.gte('fecha_mantenimiento', filters.fechaInicio);
            }

            if (filters.fechaFin) {
                query = query.lte('fecha_mantenimiento', filters.fechaFin);
            }

            const { data, error } = await query;

            if (error) throw error;

            AppState.tablets = data || [];
            AppState.filteredTablets = data || [];
            return { success: true, data: data || [] };
        } catch (error) {
            console.error('❌ Error obteniendo tablets:', error);
            return { success: false, error: error.message };
        }
    }

    static async getById(id) {
        try {
            const supabase = getSupabase();
            if (!supabase) {
                throw new Error('Supabase no está inicializado');
            }

            const { data, error } = await supabase
                .from('tablets')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;

            AppState.currentTablet = data;
            return { success: true, data };
        } catch (error) {
            console.error('❌ Error obteniendo tablet:', error);
            return { success: false, error: error.message };
        }
    }

    static async create(tabletData) {
        try {
            const supabase = getSupabase();
            if (!supabase) {
                throw new Error('Supabase no está inicializado');
            }

            const dataToInsert = {
                ...tabletData,
                usuario_creador: AppState.currentUser?.id,
                usuario_modificador: AppState.currentUser?.id
            };

            const { data, error } = await supabase
                .from('tablets')
                .insert([dataToInsert])
                .select()
                .single();

            if (error) throw error;

            console.log('✅ Tablet creada:', data.codigo_unico);
            return { success: true, data };
        } catch (error) {
            console.error('❌ Error creando tablet:', error);
            return { success: false, error: error.message };
        }
    }

    static async update(id, tabletData) {
        try {
            const supabase = getSupabase();
            if (!supabase) {
                throw new Error('Supabase no está inicializado');
            }

            const dataToUpdate = {
                ...tabletData,
                usuario_modificador: AppState.currentUser?.id
            };

            const { data, error } = await supabase
                .from('tablets')
                .update(dataToUpdate)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            console.log('✅ Tablet actualizada:', data.codigo_unico);
            return { success: true, data };
        } catch (error) {
            console.error('❌ Error actualizando tablet:', error);
            return { success: false, error: error.message };
        }
    }

    static async delete(id) {
        try {
            const supabase = getSupabase();
            if (!supabase) {
                throw new Error('Supabase no está inicializado');
            }

            const { error } = await supabase
                .from('tablets')
                .delete()
                .eq('id', id);

            if (error) throw error;

            console.log('✅ Tablet eliminada');
            return { success: true };
        } catch (error) {
            console.error('❌ Error eliminando tablet:', error);
            return { success: false, error: error.message };
        }
    }

    static async generateUniqueCode() {
        try {
            const supabase = getSupabase();
            if (!supabase) {
                throw new Error('Supabase no está inicializado');
            }

            // Intentar usar función RPC
            const { data, error } = await supabase.rpc('generar_codigo_unico');

            if (!error && data) {
                return { success: true, code: data };
            }
        } catch (error) {
            console.log('⚠️ Función RPC no disponible, generando código manualmente');
        }

        // Fallback: generar código manualmente
        try {
            const supabase = getSupabase();
            const today = new Date();
            const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
            
            const { count, error } = await supabase
                .from('tablets')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', `${today.toISOString().slice(0, 10)}T00:00:00`)
                .lte('created_at', `${today.toISOString().slice(0, 10)}T23:59:59`);

            if (error) throw error;

            const sequence = String((count || 0) + 1).padStart(4, '0');
            const code = `TAB-${dateStr}-${sequence}`;

            return { success: true, code };
        } catch (error) {
            console.error('❌ Error generando código:', error);
            // Último fallback: usar timestamp
            const code = `TAB-${Date.now()}`;
            return { success: true, code };
        }
    }

    static async getHistory(tabletId) {
        try {
            const supabase = getSupabase();
            if (!supabase) {
                throw new Error('Supabase no está inicializado');
            }

            const { data, error } = await supabase
                .from('historial_tablets')
                .select(`
                    *,
                    usuario:usuarios(nombre, email)
                `)
                .eq('tablet_id', tabletId)
                .order('fecha_cambio', { ascending: false });

            if (error) throw error;

            return { success: true, data: data || [] };
        } catch (error) {
            console.error('❌ Error obteniendo historial:', error);
            return { success: false, error: error.message };
        }
    }

    static searchLocal(searchTerm) {
        if (!searchTerm || searchTerm.trim() === '') {
            AppState.filteredTablets = AppState.tablets;
            return AppState.tablets;
        }

        const term = searchTerm.toLowerCase();
        AppState.filteredTablets = AppState.tablets.filter(tablet => {
            return (
                tablet.codigo_unico?.toLowerCase().includes(term) ||
                tablet.numero_serie?.toLowerCase().includes(term) ||
                tablet.modelo?.toLowerCase().includes(term) ||
                tablet.nombre_producto?.toLowerCase().includes(term) ||
                tablet.sede?.toLowerCase().includes(term)
            );
        });

        return AppState.filteredTablets;
    }

    static getStatistics() {
        const tablets = AppState.filteredTablets;
        
        const total = tablets.length;
        const ok = tablets.filter(t => 
            t.estado_pantalla === 'Bueno' && 
            t.estado_puerto_carga === 'Funciona' &&
            t.estado_fisico_general !== 'Malo'
        ).length;
        const issues = total - ok;
        
        const avgBattery = tablets.length > 0
            ? Math.round(tablets.reduce((sum, t) => sum + (t.nivel_bateria || 0), 0) / tablets.length)
            : 0;

        return { total, ok, issues, avgBattery };
    }
}

// ========================================
// GESTIÓN DE FOTOS
// ========================================
class PhotoManager {
    static async uploadPhoto(file, tabletCode) {
        try {
            const supabase = getSupabase();
            if (!supabase) {
                throw new Error('Supabase no está inicializado');
            }

            const fileExt = file.name.split('.').pop();
            const fileName = `${tabletCode}/${Date.now()}.${fileExt}`;

            const { data, error } = await supabase.storage
                .from('tablet-photos')
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) throw error;

            const { data: urlData } = supabase.storage
                .from('tablet-photos')
                .getPublicUrl(fileName);

            console.log('✅ Foto subida:', fileName);
            return { success: true, url: urlData.publicUrl, path: fileName };
        } catch (error) {
            console.error('❌ Error subiendo foto:', error);
            return { success: false, error: error.message };
        }
    }

    static async uploadMultiplePhotos(files, tabletCode) {
        const results = [];
        
        for (const file of files) {
            const result = await this.uploadPhoto(file, tabletCode);
            if (result.success) {
                results.push(result.url);
            }
        }

        return results;
    }

    static async deletePhoto(path) {
        try {
            const supabase = getSupabase();
            if (!supabase) {
                throw new Error('Supabase no está inicializado');
            }

            const { error } = await supabase.storage
                .from('tablet-photos')
                .remove([path]);

            if (error) throw error;

            console.log('✅ Foto eliminada:', path);
            return { success: true };
        } catch (error) {
            console.error('❌ Error eliminando foto:', error);
            return { success: false, error: error.message };
        }
    }

    static getPhotoPath(url) {
        const baseUrl = `${SUPABASE_URL}/storage/v1/object/public/tablet-photos/`;
        return url.replace(baseUrl, '');
    }
}

// ========================================
// GESTIÓN DE OPCIONES
// ========================================
class OptionsManager {
    static async getEstadoPantallaOptions() {
        try {
            const supabase = getSupabase();
            if (!supabase) {
                throw new Error('Supabase no está inicializado');
            }

            const { data, error } = await supabase
                .from('opciones_estado_pantalla')
                .select('opcion')
                .order('opcion');

            if (error) throw error;

            return { success: true, options: data.map(d => d.opcion) };
        } catch (error) {
            console.error('❌ Error obteniendo opciones:', error);
            return { success: false, options: ['Bueno', 'Rayado', 'Quebrado', 'Con manchas'] };
        }
    }

    static async addEstadoPantallaOption(option) {
        try {
            const supabase = getSupabase();
            if (!supabase) {
                throw new Error('Supabase no está inicializado');
            }

            const { data, error } = await supabase
                .from('opciones_estado_pantalla')
                .insert([{ opcion: option }])
                .select()
                .single();

            if (error) {
                // Si ya existe (error 23505), no es crítico
                if (error.code === '23505') {
                    return { success: true, data: { opcion: option } };
                }
                throw error;
            }

            console.log('✅ Opción agregada:', option);
            return { success: true, data };
        } catch (error) {
            console.error('❌ Error agregando opción:', error);
            return { success: false, error: error.message };
        }
    }
}

// ========================================
// GESTIÓN DE SINCRONIZACIÓN OFFLINE
// ========================================
class SyncManager {
    static STORAGE_KEY = 'tablets_offline_data';
    static PENDING_KEY = 'tablets_pending_sync';

    static saveOffline(data) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('❌ Error guardando offline:', error);
            return false;
        }
    }

    static loadOffline() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('❌ Error cargando offline:', error);
            return null;
        }
    }

    static addPendingSync(operation) {
        try {
            const pending = this.getPendingSync();
            pending.push({
                ...operation,
                timestamp: Date.now()
            });
            localStorage.setItem(this.PENDING_KEY, JSON.stringify(pending));
            AppState.pendingSync = pending;
            return true;
        } catch (error) {
            console.error('❌ Error agregando operación pendiente:', error);
            return false;
        }
    }

    static getPendingSync() {
        try {
            const data = localStorage.getItem(this.PENDING_KEY);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('❌ Error obteniendo operaciones pendientes:', error);
            return [];
        }
    }

    static async syncPending() {
        const pending = this.getPendingSync();
        const results = [];

        for (const operation of pending) {
            try {
                let result;
                
                switch (operation.type) {
                    case 'create':
                        result = await TabletManager.create(operation.data);
                        break;
                    case 'update':
                        result = await TabletManager.update(operation.id, operation.data);
                        break;
                    case 'delete':
                        result = await TabletManager.delete(operation.id);
                        break;
                }

                if (result.success) {
                    results.push({ success: true, operation });
                } else {
                    results.push({ success: false, operation, error: result.error });
                }
            } catch (error) {
                results.push({ success: false, operation, error: error.message });
            }
        }

        const failed = results.filter(r => !r.success).map(r => r.operation);
        localStorage.setItem(this.PENDING_KEY, JSON.stringify(failed));
        AppState.pendingSync = failed;

        return results;
    }

    static clearPending() {
        localStorage.removeItem(this.PENDING_KEY);
        AppState.pendingSync = [];
    }
}

// ========================================
// MONITOREO DE CONEXIÓN
// ========================================
window.addEventListener('online', async () => {
    AppState.isOnline = true;
    console.log('✅ Conexión restaurada');
    
    if (typeof showToast !== 'undefined') {
        showToast('Conexión restaurada. Sincronizando...', 'info');
    }
    
    const results = await SyncManager.syncPending();
    const successful = results.filter(r => r.success).length;
    
    if (successful > 0) {
        if (typeof showToast !== 'undefined') {
            showToast(`${successful} operaciones sincronizadas correctamente`, 'success');
        }
        if (typeof loadDashboard !== 'undefined') {
            await TabletManager.getAll();
            loadDashboard();
        }
    }
});

window.addEventListener('offline', () => {
    AppState.isOnline = false;
    console.log('⚠️ Sin conexión');
    
    if (typeof showToast !== 'undefined') {
        showToast('Sin conexión. Los cambios se guardarán localmente.', 'warning');
    }
});

AppState.isOnline = navigator.onLine;

console.log('✅ supabase-client.js cargado correctamente');
