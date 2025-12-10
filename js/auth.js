// Authentication Manager
class AuthManager {
  constructor() {
    this.currentUser = null;
    this.currentProfile = null;
  }

  // Initialize authentication
  async init() {
    try {
      console.log('Auth: Iniciando...');
      
      // Check if Supabase is available
      if (!supabaseClient.isAvailable()) {
        console.log('Auth: Supabase no disponible, intentando modo offline...');
        // Try to load profile from IndexedDB
        const profiles = await dbManager.getAll('profile');
        if (profiles && profiles.length > 0) {
          this.currentUser = { id: profiles[0].id };
          this.currentProfile = profiles[0];
          console.log('Auth: ✓ Perfil cargado desde IndexedDB');
          return true;
        }
        console.log('Auth: No hay perfil en IndexedDB');
        return false;
      }

      console.log('Auth: Obteniendo sesión actual...');
      const session = await supabaseClient.getCurrentSession();
      
      if (!session) {
        console.log('Auth: No hay sesión activa');
        return false;
      }

      console.log('Auth: ✓ Sesión encontrada, obteniendo usuario...');
      this.currentUser = session.user;

      console.log('Auth: Obteniendo perfil del servidor...');
      // Load user profile
      this.currentProfile = await supabaseClient.getProfile(session.user.id);
      
      console.log('Auth: ✓ Perfil obtenido, guardando en IndexedDB...');
      // Save to IndexedDB for offline access
      await dbManager.saveProfile(this.currentProfile);

      console.log('Auth: ✓ Autenticación exitosa');
      return true;

    } catch (error) {
      console.error('Auth: Error en init:', error);
      
      // Try offline fallback
      console.log('Auth: Intentando fallback offline...');
      try {
        const profiles = await dbManager.getAll('profile');
        if (profiles && profiles.length > 0) {
          this.currentProfile = profiles[0];
          this.currentUser = { id: profiles[0].id };
          console.log('Auth: ✓ Usando perfil de IndexedDB');
          return true;
        }
      } catch (offlineError) {
        console.error('Auth: Error en fallback offline:', offlineError);
      }
      
      console.log('Auth: Sin autenticación válida');
      return false;
    }
  }

  // Setup auth state change listener
  setupAuthListener() {
    if (!supabaseClient.isAvailable()) {
      console.log('Auth: Listener no disponible sin Supabase');
      return;
    }

    supabaseClient.client.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth: Estado cambió:', event);

      if (event === 'SIGNED_OUT') {
        this.currentUser = null;
        this.currentProfile = null;
        await dbManager.clear('profile');
        window.location.reload();
      }

      if (event === 'SIGNED_IN' && session) {
        this.currentUser = session.user;
        this.currentProfile = await supabaseClient.getProfile(session.user.id);
        await dbManager.saveProfile(this.currentProfile);
      }
    });
  }

  // Sign in
  async signIn(email, password) {
    console.log('Auth: Intentando sign in...');
    
    if (!supabaseClient.isAvailable()) {
      throw new Error('No se puede iniciar sesión sin conexión a internet');
    }

    try {
      const result = await supabaseClient.signIn(email, password);
      this.currentUser = result.user;
      this.currentProfile = result.profile;
      console.log('Auth: ✓ Sign in exitoso');
      return result;
    } catch (error) {
      console.error('Auth: Error en sign in:', error);
      throw error;
    }
  }

  // Sign out
  async signOut() {
    console.log('Auth: Cerrando sesión...');
    
    try {
      await supabaseClient.signOut();
      this.currentUser = null;
      this.currentProfile = null;
      console.log('Auth: ✓ Sesión cerrada');
    } catch (error) {
      console.error('Auth: Error al cerrar sesión:', error);
      throw error;
    }
  }

  // Get current profile
  getCurrentProfile() {
    return this.currentProfile;
  }

  // Get current user
  getCurrentUser() {
    return this.currentUser;
  }

  // Check if user is admin
  isAdmin() {
    return this.currentProfile?.role === 'admin';
  }

  // Check if user can edit
  canEdit() {
    return this.currentProfile?.role === 'admin' || this.currentProfile?.role === 'tecnico';
  }

  // Check if user can delete
  canDelete() {
    return this.currentProfile?.role === 'admin';
  }
}

// Export singleton
const authManager = new AuthManager();
