
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
        this.worker = await Tesseract.createWorker('spa', 1, {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              this.updateProgress(m.progress);
            }
          }
        });
        console.log('OCR worker initialized');
      }
      return this.worker;
    } catch (error) {
      console.error('OCR initialization error:', error);
      throw error;
    }
  }

  // Process image and extract text
  async processImage(imageSource) {
    try {
      this.isProcessing = true;
      this.showStatus('Procesando imagen...');

      await this.init();

      const { data } = await this.worker.recognize(imageSource);
      
      this.isProcessing = false;
      this.hideStatus();

      return this.parseTabletInfo(data.text);
    } catch (error) {
      this.isProcessing = false;
      this.hideStatus();
      console.error('OCR processing error:', error);
      throw error;
    }
  }

  // Parse extracted text to find tablet information
  parseTabletInfo(text) {
    const info = {
      nombre_producto: null,
      numero_modelo: null,
      numero_serie: null,
      version_android: null
    };

    console.log('OCR Text:', text);

    // Clean text
    const cleanText = text.replace(/\s+/g, ' ').trim();
    const lines = text.split('\n').map(line => line.trim());

    // Extract product name (Galaxy Tab, etc)
    const productMatch = cleanText.match(/Galaxy\s+Tab\s+[A-Z0-9\s]+/i);
    if (productMatch) {
      info.nombre_producto = productMatch[0].trim();
    }

    // Extract model number (SM-XXXX)
    const modelMatch = cleanText.match(/SM-[A-Z0-9]+/i);
    if (modelMatch) {
      info.numero_modelo = modelMatch[0].toUpperCase();
      // Use model as codigo_unico if not found separately
      if (!info.codigo_unico) {
        info.codigo_unico = modelMatch[0].toUpperCase();
      }
    }

    // Extract serial number (R + alphanumeric)
    const serialMatch = cleanText.match(/R[A-Z0-9]{10,}/i);
    if (serialMatch) {
      info.numero_serie = serialMatch[0].toUpperCase();
    }

    // Alternative serial number patterns
    if (!info.numero_serie) {
      const altSerialMatch = cleanText.match(/[0-9A-Z]{12,}/);
      if (altSerialMatch) {
        info.numero_serie = altSerialMatch[0].toUpperCase();
      }
    }

    // Extract Android version
    const androidMatch = cleanText.match(/Android\s+(\d+(\.\d+)?)/i);
    if (androidMatch) {
      info.version_android = androidMatch[1];
    }

    // Try to find model in lines starting with "Nombre del modelo"
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      
      if (line.includes('nombre del producto') || line.includes('product name')) {
        if (lines[i + 1]) {
          info.nombre_producto = lines[i + 1].trim();
        }
      }
      
      if (line.includes('nombre del modelo') || line.includes('model name')) {
        if (lines[i + 1]) {
          info.numero_modelo = lines[i + 1].trim();
        }
      }
      
      if (line.includes('número de modelo') || line.includes('model number')) {
        if (lines[i + 1]) {
          info.numero_modelo = lines[i + 1].trim().toUpperCase();
        }
      }
      
      if (line.includes('número de serie') || line.includes('serial number')) {
        if (lines[i + 1]) {
          info.numero_serie = lines[i + 1].trim().toUpperCase();
        }
      }
    }

    // Generate modelo from nombre_producto if not found
    if (!info.modelo && info.nombre_producto) {
      info.modelo = info.nombre_producto;
    }

    // Use numero_modelo as modelo if modelo not found
    if (!info.modelo && info.numero_modelo) {
      info.modelo = info.numero_modelo;
    }

    console.log('Parsed info:', info);
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
