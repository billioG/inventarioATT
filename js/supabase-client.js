// Supabase Client Configuration
class SupabaseClient {
  constructor() {
    // REEMPLAZA ESTOS VALORES CON TUS CREDENCIALES DE SUPABASE
    this.supabaseUrl = 'https://pfshuqbqoqunockrphnm.supabase.co';
    this.supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmc2h1cWJxb3F1bm9ja3JwaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM3OTc1NzgsImV4cCI6MjA0OTM3MzU3OH0.lQs-vf3YK8zLqDqfZUYmYDJrNqoQV5iEQNmwS2GXZo4';
    
    this.client = null;
    this.currentUser = null;
    this.isInitialized = false;
  }

  // Initialize Supabase client
  init() {
    try {
      // Verificar si la librería de Supabase está cargada
      if (typeof supabase === 'undefined') {
        console.warn('Supabase library not loaded, app will work in offline-only mode');
        this.isInitialized = false;
        return null;
      }

      this.client = supabase.createClient(this.supabaseUrl, this.supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: window.localStorage
        },
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      });

      this.isInitialized = true;
      console.log('Supabase client initialized');
      return this.client;
    } catch (error) {
      console.error('Error initializing Supabase:', error);
      this.isInitialized = false;
      return null;
    }
  }

  // Check if Supabase is available
  isAvailable() {
    return this.isInitialized && this.client !== null;
  }

  // Check if online
  isOnline() {
    return navigator.onLine && this.isAvailable();
  }

  // Auth methods
  async signIn(email, password) {
    if (!this.isAvailable()) {
      throw new Error('No se puede iniciar sesión sin conexión a internet');
    }

    try {
      const { data, error } = await this.client.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      this.currentUser = data.user;
      
      // Get user profile
      const profile = await this.getProfile(data.user.id);
      
      // Save to IndexedDB
      await dbManager.saveProfile(profile);

      return { user: data.user, profile };
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  }

  async signUp(email, password, userData) {
    if (!this.isAvailable()) {
      throw new Error('No se puede registrar sin conexión a internet');
    }

    try {
      const { data, error } = await this.client.auth.signUp({
        email,
        password,
        options: {
          data: userData
        }
      });

      if (error) throw error;

      // Create profile
      if (data.user) {
        await this.createProfile({
          id: data.user.id,
          email: data.user.email,
          ...userData
        });
      }

      return data;
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  }

  async signOut() {
    if (!this.isAvailable()) {
      // Logout offline
      this.currentUser = null;
      await dbManager.clear('profile');
      return true;
    }

    try {
      const { error } = await this.client.auth.signOut();
      if (error) throw error;

      this.currentUser = null;
      
      // Clear IndexedDB
      await dbManager.clear('profile');
      
      return true;
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  }

  async getCurrentUser() {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const { data: { user } } = await this.client.auth.getUser();
      this.currentUser = user;
      return user;
    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  }

  async getCurrentSession() {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const { data: { session } } = await this.client.auth.getSession();
      return session;
    } catch (error) {
      console.error('Get session error:', error);
      return null;
    }
  }

  // Profile methods
  async getProfile(userId) {
    if (!this.isAvailable()) {
      throw new Error('Supabase no disponible');
    }

    try {
      const { data, error } = await this.client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Get profile error:', error);
      throw error;
    }
  }

  async createProfile(profileData) {
    if (!this.isAvailable()) {
      throw new Error('Supabase no disponible');
    }

    try {
      const { data, error } = await this.client
        .from('profiles')
        .insert([profileData])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Create profile error:', error);
      throw error;
    }
  }

  async updateProfile(userId, updates) {
    if (!this.isAvailable()) {
      throw new Error('Supabase no disponible');
    }

    try {
      const { data, error } = await this.client
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    }
  }

  // Tablet CRUD operations
  async getTablets(filters = {}) {
    if (!this.isAvailable()) {
      throw new Error('Supabase no disponible');
    }

    try {
      let query = this.client
        .from('tablets')
        .select(`
          *,
          responsable:profiles!tablets_responsable_revision_fkey(full_name, email),
          creador:profiles!tablets_created_by_fkey(full_name, email)
        `)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.sede) {
        query = query.eq('sede_procedencia', filters.sede);
      }
      if (filters.estado) {
        query = query.eq('estado_pantalla', filters.estado);
      }
      if (filters.search) {
        query = query.or(`codigo_unico.ilike.%${filters.search}%,modelo.ilike.%${filters.search}%,numero_serie.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Get tablets error:', error);
      throw error;
    }
  }

  async getTablet(id) {
    if (!this.isAvailable()) {
      throw new Error('Supabase no disponible');
    }

    try {
      const { data, error } = await this.client
        .from('tablets')
        .select(`
          *,
          responsable:profiles!tablets_responsable_revision_fkey(full_name, email),
          creador:profiles!tablets_created_by_fkey(full_name, email)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Get tablet error:', error);
      throw error;
    }
  }

  async createTablet(tabletData) {
    if (!this.isAvailable()) {
      throw new Error('Supabase no disponible');
    }

    try {
      const { data, error } = await this.client
        .from('tablets')
        .insert([{
          ...tabletData,
          created_by: this.currentUser?.id,
          responsable_revision: this.currentUser?.id
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Create tablet error:', error);
      throw error;
    }
  }

  async updateTablet(id, updates) {
    if (!this.isAvailable()) {
      throw new Error('Supabase no disponible');
    }

    try {
      const { data, error } = await this.client
        .from('tablets')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Update tablet error:', error);
      throw error;
    }
  }

  async deleteTablet(id) {
    if (!this.isAvailable()) {
      throw new Error('Supabase no disponible');
    }

    try {
      const { error } = await this.client
        .from('tablets')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Delete tablet error:', error);
      throw error;
    }
  }

  // Realtime subscriptions
  subscribeToTablets(callback) {
    if (!this.isAvailable()) {
      console.warn('Realtime subscriptions not available offline');
      return null;
    }

    return this.client
      .channel('tablets-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tablets'
        },
        callback
      )
      .subscribe();
  }

  unsubscribe(subscription) {
    if (subscription && this.isAvailable()) {
      this.client.removeChannel(subscription);
    }
  }
}

// Export singleton
const supabaseClient = new SupabaseClient();
