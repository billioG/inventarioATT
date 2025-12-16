// js/ocr.js - Solución Campos Exactos
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
      return this.parseTabletInfo(data.text);
    } catch (error) {
      this.hideStatus();
      console.error('OCR Error:', error);
      return {};
    }
  }

  parseTabletInfo(text) {
    const info = {
      nombre_producto: null,
      numero_modelo: null,
      numero_serie: null,
      version_android: null,
      modelo: null
    };

    console.log('OCR Texto Crudo:', text);
    // Limpiar líneas vacías
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        
        // 1. NOMBRE DEL PRODUCTO (Se copia a Nombre y a Número de Modelo)
        if (line.includes('nombre del producto')) {
            const val = this.extractValue(lines, i);
            if (val) {
                info.nombre_producto = val;
                info.numero_modelo = val; // REGLA APLICADA
            }
        }

        // 2. MODELO (Nombre del modelo o Modelo)
        // Se evita confundir con "Número de modelo"
        else if ((line.includes('nombre del modelo') || line.startsWith('modelo')) && !line.includes('número')) {
            info.modelo = this.extractValue(lines, i);
        }

        // 3. NÚMERO DE SERIE (Número de serie o Serie)
        else if (line.includes('número de serie') || line.startsWith('serie')) {
            const val = this.extractValue(lines, i);
            if (val) {
                // Eliminar espacios (R 9 W T -> R9WT)
                info.numero_serie = val.replace(/\s+/g, '').toUpperCase();
            }
        }
        
        // Extra: Android
        else if (line.includes('android')) {
            const match = lines[i].match(/Android\s+(\d+)/i);
            if (match) info.version_android = match[1];
        }
    }

    // Fallbacks si no encontró etiquetas
    if (!info.numero_serie) {
        const match = text.match(/\b(R[A-Z0-9]{9,11})\b/i);
        if (match) info.numero_serie = match[0].toUpperCase();
    }

    return info;
  }

  extractValue(lines, index) {
      const line = lines[index];
      if (line.includes(':')) return line.split(':')[1].trim();
      if (index + 1 < lines.length) return lines[index + 1].trim();
      return null;
  }

  showStatus(msg) {
    const el = document.getElementById('ocr-status');
    if(el) { el.style.display='flex'; document.getElementById('ocr-status-text').textContent = msg; }
  }
  hideStatus() {
    const el = document.getElementById('ocr-status');
    if(el) el.style.display='none';
  }
}

const ocrManager = new OCRManager();
