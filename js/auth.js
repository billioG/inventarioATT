// Authentication Manager
class AuthManager {
  constructor() {
    this.currentUser = null;
    this.currentProfile = null;
  }

  // Initialize authentication
  async init() {
    try {
      // Check for existing session
      const session = await supabaseClient.getCurrentSession();
      
      if (session) {
        this.currentUser = session.user;
        await this.loadUserProfile();
        return true;
      }

      return false;
    } catch (error) {
      console.error('Auth initialization error:', error);
      return false;
    }
  }

  // Load user profile
  async loadUserProfile() {
    try {
      if (!this.currentUser) return null;

      // Try to get from local storage first
      let profile = await dbManager.getProfile(this.currentUser.id);

      // If not in local storage and online, fetch from server
      if (!profile && navigator.onLine) {
        profile = await supabaseClient.getProfile(this.currentUser.id);
        if (profile) {
          await dbManager.saveProfile(profile);
        }
      }

      this.currentProfile = profile;
      return profile;
    } catch (error) {
      console.error('Load profile error:', error);
      return null;
    }
  }

  // Sign in
  async signIn(email, password) {
    try {
      if (!navigator.onLine) {
        throw new Error('No hay conexión a internet. No es posible iniciar sesión en modo offline.');
      }

      const { user, profile } = await supabaseClient.signIn(email, password);
      
      this.currentUser = user;
      this.currentProfile = profile;

      // Save auth state
      await this.saveAuthState();

      return { user, profile };
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  }

  // Sign out
  async signOut() {
    try {
      await supabaseClient.signOut();
      
      this.currentUser = null;
      this.currentProfile = null;

      // Clear auth state
      await this.clearAuthState();

      return true;
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.currentUser;
  }

  // Get current user
  getCurrentUser() {
    return this.currentUser;
  }

  // Get current profile
  getCurrentProfile() {
    return this.currentProfile;
  }

  // Check user role
  hasRole(role) {
    if (!this.currentProfile) return false;
    
    if (Array.isArray(role)) {
      return role.includes(this.currentProfile.role);
    }
    
    return this.currentProfile.role === role;
  }

  // Check if user is admin
  isAdmin() {
    return this.hasRole('admin');
  }

  // Check if user is tecnico or admin
  canEdit() {
    return this.hasRole(['admin', 'tecnico']);
  }

  // Save auth state to local storage
  async saveAuthState() {
    try {
      await dbManager.saveSetting('currentUserId', this.currentUser.id);
      await dbManager.saveSetting('lastLoginTime', new Date().toISOString());
    } catch (error) {
      console.error('Save auth state error:', error);
    }
  }

  // Clear auth state
  async clearAuthState() {
    try {
      await dbManager.saveSetting('currentUserId', null);
    } catch (error) {
      console.error('Clear auth state error:', error);
    }
  }

  // Setup auth state change listener
  setupAuthListener() {
    supabaseClient.client.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event);

      if (event === 'SIGNED_IN') {
        this.currentUser = session.user;
        await this.loadUserProfile();
        window.location.reload();
      } else if (event === 'SIGNED_OUT') {
        this.currentUser = null;
        this.currentProfile = null;
        window.location.href = '/';
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('Token refreshed');
      }
    });
  }

  // Show login modal
  showLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  // Hide login modal
  hideLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }
}

// Export singleton
const authManager = new AuthManager();

