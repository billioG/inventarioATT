// Supabase Client Configuration
class SupabaseClient {
  constructor() {
    // REEMPLAZA ESTOS VALORES CON TUS CREDENCIALES DE SUPABASE
    this.supabaseUrl = 'https://pfshuqbqoqunockrphnm.supabase.co';
    this.supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmc2h1cWJxb3F1bm9ja3JwaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMjkwODksImV4cCI6MjA4MDkwNTA4OX0.lQW62ETddyyPQLbOHEJ7w6wUZ8qoNvX97gqjV-4GgCQ';
    
    this.client = null;
    this.currentUser = null;
  }

  // Initialize Supabase client
  init() {
    try {
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

      console.log('Supabase client initialized');
      return this.client;
    } catch (error) {
      console.error('Error initializing Supabase:', error);
      throw error;
    }
  }

  // Check if online
  isOnline() {
    return navigator.onLine;
  }

  // Auth methods
  async signIn(email, password) {
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
    try {
      const { error } = await this.client.auth.signOut();
      if (error) throw error;

      this.currentUser = null;
      
      // Clear IndexedDB (except sync queue)
      await dbManager.clear('profile');
      
      return true;
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  }

  async getCurrentUser() {
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

  // Storage operations
  async uploadImage(file, path) {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${path}/${fileName}`;

      const { data, error } = await this.client.storage
        .from('tablet-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      // Get public URL
      const { data: urlData } = this.client.storage
        .from('tablet-images')
        .getPublicUrl(filePath);

      return {
        path: filePath,
        url: urlData.publicUrl
      };
    } catch (error) {
      console.error('Upload image error:', error);
      throw error;
    }
  }

  async deleteImage(path) {
    try {
      const { error } = await this.client.storage
        .from('tablet-images')
        .remove([path]);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Delete image error:', error);
      throw error;
    }
  }

  getImageUrl(path) {
    const { data } = this.client.storage
      .from('tablet-images')
      .getPublicUrl(path);
    
    return data.publicUrl;
  }

  // Realtime subscriptions
  subscribeToTablets(callback) {
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
    if (subscription) {
      this.client.removeChannel(subscription);
    }
  }
}

// Export singleton
const supabaseClient = new SupabaseClient();

