class OCRManager {
  constructor() {
    this.worker = null;
  }

  async init() {
    if (!this.worker) {
      this.worker = await Tesseract.createWorker();
      await this.worker.loadLanguage('spa');
      await this.worker.initialize('spa');
    }
    return this.worker;
  }

  async processImage(imageSource) {
    try {
      this.showStatus('Analizando imagen...');
      const worker = await this.init();
      const { data } = await worker.recognize(imageSource);
      this.hideStatus();
      return this.parseInfo(data.text);
    } catch (error) {
      this.hideStatus();
      console.error(error);
      return {};
    }
  }

  // --- CORRECCIÓN: Lógica de extracción estricta ---
  parseInfo(text) {
    const info = {
      nombre_producto: null,
      numero_modelo: null,
      numero_serie: null,
      version_android: null,
      modelo: null
    };

    console.log('OCR Texto Crudo:', text);
    
    // Limpiar líneas vacías
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      const original = lines[i];

      // 1. NOMBRE DEL PRODUCTO (Galaxy Tab...)
      // Buscamos "Nombre del producto" y tomamos la siguiente línea o el valor después de :
      if (line.includes('nombre del producto')) {
        let val = this.extractValue(lines, i);
        if (val) {
            info.nombre_producto = val;
            // REGLA: El mismo nombre va a número de modelo (según tu petición)
            info.numero_modelo = val; 
        }
      }

      // 2. NÚMERO DE SERIE
      // Buscamos "Número de serie" o "Serie"
      else if (line.includes('número de serie') || line.startsWith('serie')) {
        let val = this.extractValue(lines, i);
        if (val) {
            // Eliminar espacios (R 9 W T -> R9WT)
            info.numero_serie = val.replace(/\s+/g, '').toUpperCase();
        }
      }

      // 3. MODELO (SM-T...)
      // Buscamos "Modelo" o "Nombre del modelo" (evitando "número de modelo")
      else if ((line.includes('modelo') || line.includes('nombre del modelo')) && !line.includes('número')) {
         info.modelo = this.extractValue(lines, i);
      }
      
      // 4. Fallback para Android
      else if (line.includes('android')) {
          const m = original.match(/Android\s+(\d+)/i);
          if (m) info.version_android = m[1];
      }
    }

    // --- Fallbacks si no encontró etiquetas ---
    if (!info.numero_serie) {
        // Patrón Samsung Serial: R seguido de 9 a 11 caracteres alfanuméricos
        const match = text.match(/\b(R[A-Z0-9]{9,11})\b/i);
        if (match) info.numero_serie = match[0].toUpperCase();
    }
    
    if (!info.nombre_producto) {
        // Buscar "Galaxy Tab" directamente
        const match = text.match(/Galaxy\s+Tab\s+[A-Z0-9\s]+/i);
        if (match) {
            info.nombre_producto = match[0].trim();
            info.numero_modelo = match[0].trim();
        }
    }

    return info;
  }

  // Extrae valor después de ":" o de la siguiente línea
  extractValue(lines, index) {
    const line = lines[index];
    if (line.includes(':')) {
        const parts = line.split(':');
        if (parts[1] && parts[1].trim().length > 0) return parts[1].trim();
    }
    // Si no hay valor en la misma línea, mirar la siguiente
    if (index + 1 < lines.length) {
        return lines[index + 1].trim();
    }
    return null;
  }

  showStatus(msg) {
    const el = document.getElementById('ocr-status');
    if(el) { 
        el.style.display='flex'; 
        const txt = document.getElementById('ocr-status-text');
        if(txt) txt.textContent=msg; 
    }
  }
  hideStatus() {
    const el = document.getElementById('ocr-status');
    if(el) el.style.display='none';
  }
}

const ocrManager = new OCRManager();
