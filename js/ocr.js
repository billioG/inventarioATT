// OCR Manager using Tesseract.js
class OCRManager {
  constructor() {
    this.worker = null;
    this.isProcessing = false;
  }

  // Initialize Tesseract worker
  async init() {
    try {
      if (!this.worker) {
        console.log('Initializing Tesseract worker...');
        
        this.worker = await Tesseract.createWorker({
          logger: (m) => {
            if (m.status === 'recognizing text') {
              this.updateProgress(m.progress);
            }
          }
        });
        
        await this.worker.loadLanguage('spa');
        await this.worker.initialize('spa');
        
        console.log('OCR worker initialized successfully');
      }
      return this.worker;
    } catch (error) {
      console.error('OCR initialization error:', error);
      showToast('No se pudo inicializar OCR. Completa los campos manualmente.', 'warning');
      return null;
    }
  }

  // Process image and extract text
  async processImage(imageSource) {
    try {
      this.isProcessing = true;
      this.showStatus('Procesando imagen con OCR...');

      const worker = await this.init();
      
      if (!worker) {
        throw new Error('No se pudo inicializar el OCR');
      }

      const { data } = await worker.recognize(imageSource);
      
      this.isProcessing = false;
      this.hideStatus();

      return this.parseTabletInfo(data.text);
    } catch (error) {
      this.isProcessing = false;
      this.hideStatus();
      console.error('OCR processing error:', error);
      
      showToast('Error en OCR. Por favor completa los campos manualmente.', 'warning');
      return {
        nombre_producto: null,
        numero_modelo: null,
        numero_serie: null,
        version_android: null,
        modelo: null,
        codigo_unico: null
      };
    }
  }

  // Parse extracted text to find tablet information - MEJORADO
  parseTabletInfo(text) {
    const info = {
      nombre_producto: null,
      numero_modelo: null,
      numero_serie: null,
      version_android: null,
      modelo: null,
      codigo_unico: null
    };

    console.log('OCR Raw Text:', text);

    // Dividir por líneas y limpiar espacios extra
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineLower = line.toLowerCase();

      // 1. EXTRAER MODELO / NOMBRE PRODUCTO
      // Buscar líneas que contengan "Nombre del modelo" o "Modelo" (y evitar "número de modelo" si queremos solo el nombre)
      if ((lineLower.includes('nombre del modelo') || lineLower.includes('modelo')) && !lineLower.includes('número')) {
        let value = '';
        if (line.includes(':')) {
          value = line.split(':')[1].trim();
        } else if (i + 1 < lines.length) {
          // Si no tiene dos puntos, asumir que el valor está en la siguiente línea
          value = lines[i + 1].trim();
        }

        if (value) {
          info.modelo = value;
          info.nombre_producto = value; // Copiar al nombre de producto
          info.numero_modelo = value;   // Copiar al número de modelo también por si acaso
        }
      }

      // 2. EXTRAER NÚMERO DE SERIE / SERIE
      if (lineLower.includes('número de serie') || lineLower.includes('serie')) {
        let value = '';
        if (line.includes(':')) {
          value = line.split(':')[1].trim();
        } else if (i + 1 < lines.length) {
          value = lines[i + 1].trim();
        }

        if (value) {
           // Limpiar espacios internos (ej: "R9 W T..." -> "R9WT...")
           info.numero_serie = value.replace(/\s+/g, '').toUpperCase();
        }
      }

      // 3. EXTRAER VERSIÓN ANDROID
      if (lineLower.includes('android')) {
        const match = line.match(/Android\s+(\d+(\.\d+)?)/i);
        if (match) {
          info.version_android = match[1];
        }
      }
    }

    // --- FALLBACKS (Plan B si no encuentra etiquetas exactas) ---

    // Fallback: Buscar patrón de serie Samsung (R + alfanuméricos)
    if (!info.numero_serie) {
      const serialPattern = /\b(R[A-Z0-9]{9,11})\b/i;
      const match = text.match(serialPattern);
      if (match) info.numero_serie = match[0].toUpperCase();
    }

    // Fallback: Buscar patrón de modelo SM-XXXX
    if (!info.modelo) {
      const modelPattern = /SM-[A-Z0-9]+/i;
      const matchModel = text.match(modelPattern);
      if (matchModel) {
        info.modelo = matchModel[0].toUpperCase();
        info.numero_modelo = matchModel[0].toUpperCase();
      }
    }

    console.log('OCR Info Extraída:', info);
    return info;
  }

  // Update progress display
  updateProgress(progress) {
    const statusText = document.getElementById('ocr-status-text');
    if (statusText) {
      const percentage = Math.round(progress * 100);
      statusText.textContent = `Procesando imagen... ${percentage}%`;
    }
  }

  // Show status message
  showStatus(message) {
    const statusDiv = document.getElementById('ocr-status');
    const statusText = document.getElementById('ocr-status-text');
    
    if (statusDiv && statusText) {
      statusText.textContent = message;
      statusDiv.style.display = 'flex';
    }
  }

  // Hide status message
  hideStatus() {
    const statusDiv = document.getElementById('ocr-status');
    if (statusDiv) {
      statusDiv.style.display = 'none';
    }
  }

  // Terminate worker
  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      console.log('OCR worker terminated');
    }
  }
}

// Export singleton
const ocrManager = new OCRManager();
