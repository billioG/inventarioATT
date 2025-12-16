// js/auth.js - Solución Login Offline
class AuthManager {
  constructor() {
    this.currentUser = null;
    this.currentProfile = null;
  }

  // Inicialización robusta: Prioriza acceso rápido
  async init() {
    try {
      console.log('Auth: Iniciando...');
      
      // 1. Intentar recuperar perfil local PRIMERO (para velocidad y offline)
      const localProfiles = await dbManager.getAll('profile');
      if (localProfiles && localProfiles.length > 0) {
        this.currentUser = { id: localProfiles[0].id, email: localProfiles[0].email };
        this.currentProfile = localProfiles[0];
        console.log('Auth: Perfil local cargado (Modo Offline/Híbrido)');
        
        // Si hay internet, verificar sesión en segundo plano para actualizar
        if (navigator.onLine && supabaseClient.isAvailable()) {
            this.verifyOnlineSession();
        }
        return true;
      }

      // 2. Si no hay local, intentar online estricto
      if (supabaseClient.isAvailable()) {
        const session = await supabaseClient.getCurrentSession();
        if (session) {
          this.currentUser = session.user;
          this.currentProfile = await supabaseClient.getProfile(session.user.id);
          await dbManager.saveProfile(this.currentProfile);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Auth Init Error:', error);
      // Si falla todo, pero teníamos datos locales, permitir acceso
      if (this.currentProfile) return true;
      return false;
    }
  }

  // Verificación silenciosa en segundo plano
  async verifyOnlineSession() {
    try {
        const session = await supabaseClient.getCurrentSession();
        if (session) {
            const profile = await supabaseClient.getProfile(session.user.id);
            if (profile) await dbManager.saveProfile(profile);
        }
    } catch (e) { console.warn('Auth check background failed', e); }
  }

  setupAuthListener() {
    if (supabaseClient.isAvailable()) {
      supabaseClient.client.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          this.currentUser = session.user;
          this.currentProfile = await supabaseClient.getProfile(session.user.id);
          await dbManager.saveProfile(this.currentProfile);
        } else if (event === 'SIGNED_OUT') {
          this.currentUser = null;
          this.currentProfile = null;
          await dbManager.clear('profile');
          window.location.reload();
        }
      });
    }
  }

  async signIn(email, password) {
    if (!navigator.onLine) {
        throw new Error('Necesitas internet para iniciar sesión por primera vez.');
    }
    
    try {
      const result = await supabaseClient.signIn(email, password);
      this.currentUser = result.user;
      this.currentProfile = result.profile;
      // Guardar perfil inmediatamente para acceso offline futuro
      await dbManager.saveProfile(this.currentProfile);
      return result;
    } catch (error) {
      console.error('Error en sign in:', error);
      throw error;
    }
  }

  async signOut() {
    try {
        if (supabaseClient.isAvailable()) await supabaseClient.signOut();
    } catch(e) { console.log('Logout offline'); }
    
    this.currentUser = null;
    this.currentProfile = null;
    await dbManager.clear('profile');
  }

  getCurrentProfile() { return this.currentProfile; }
  isAdmin() { return this.currentProfile?.role === 'admin'; }
  canEdit() { return this.currentProfile?.role === 'admin' || this.currentProfile?.role === 'tecnico'; }
}

const authManager = new AuthManager();
