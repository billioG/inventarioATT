// Camera Manager
class CameraManager {
  constructor() {
    this.stream = null;
    this.video = null;
    this.canvas = null;
    this.isActive = false;
  }

  // Initialize camera
  async init() {
    try {
      this.video = document.getElementById('camera-video');
      this.canvas = document.getElementById('camera-canvas');

      if (!this.video || !this.canvas) {
        throw new Error('Video or canvas element not found');
      }

      return true;
    } catch (error) {
      console.error('Camera initialization error:', error);
      throw error;
    }
  }

  // Start camera stream
  async start() {
    try {
      await this.init();

      const constraints = {
        video: {
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      
      await this.video.play();
      
      this.isActive = true;
      this.showPreview();

      console.log('Camera started');
      return true;
    } catch (error) {
      console.error('Camera start error:', error);
      
      // User-friendly error messages
      let message = 'No se pudo acceder a la cámara.';
      
      if (error.name === 'NotAllowedError') {
        message = 'Permiso de cámara denegado. Por favor, permite el acceso a la cámara en la configuración.';
      } else if (error.name === 'NotFoundError') {
        message = 'No se encontró ninguna cámara en este dispositivo.';
      } else if (error.name === 'NotReadableError') {
        message = 'La cámara está siendo usada por otra aplicación.';
      }

      showToast(message, 'error');
      throw error;
    }
  }

  // Stop camera stream
  stop() {
    try {
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }

      if (this.video) {
        this.video.srcObject = null;
      }

      this.isActive = false;
      this.hidePreview();

      console.log('Camera stopped');
    } catch (error) {
      console.error('Camera stop error:', error);
    }
  }

  // Capture photo from video stream
  capturePhoto() {
    try {
      if (!this.isActive || !this.video || !this.canvas) {
        throw new Error('Camera not active');
      }

      const context = this.canvas.getContext('2d');
      
      // Set canvas size to video size
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;

      // Draw video frame to canvas
      context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

      // Get image data
      const imageDataUrl = this.canvas.toDataURL('image/jpeg', 0.9);
      
      // Convert to blob
      return this.dataURLtoBlob(imageDataUrl);
    } catch (error) {
      console.error('Capture photo error:', error);
      throw error;
    }
  }

  // Convert data URL to Blob
  dataURLtoBlob(dataURL) {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    
    return new Blob([u8arr], { type: mime });
  }

  // Convert blob to data URL
  blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Show camera preview
  showPreview() {
    const preview = document.getElementById('camera-preview');
    if (preview) {
      preview.style.display = 'block';
    }
  }

  // Hide camera preview
  hidePreview() {
    const preview = document.getElementById('camera-preview');
    if (preview) {
      preview.style.display = 'none';
    }
  }

  // Check if camera is supported
  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }
}

// Export singleton
const cameraManager = new CameraManager();

