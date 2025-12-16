// js/ocr.js
class OCRManager {
  constructor() {
    this.worker = null;
    this.isProcessing = false;
  }

  async init() {
    try {
      if (!this.worker) {
        this.worker = await Tesseract.createWorker();
        await this.worker.loadLanguage('spa');
        await this.worker.initialize('spa');
      }
      return this.worker;
    } catch (error) {
      console.error('OCR Error:', error);
      showToast('Error iniciando OCR', 'warning');
      return null;
    }
  }

  async processImage(imageSource) {
    try {
      this.isProcessing = true;
      this.showStatus('Leyendo imagen...');
      
      const worker = await this.init();
      if (!worker) return this.getEmptyInfo();

      const { data } = await worker.recognize(imageSource);
      this.isProcessing = false;
      this.hideStatus();

      return this.parseTabletInfo(data.text);
    } catch (error) {
      this.isProcessing = false;
      this.hideStatus();
      console.error('OCR Process Error:', error);
      showToast('No se pudo leer la imagen', 'error');
      return this.getEmptyInfo();
    }
  }

  getEmptyInfo() {
    return {
        nombre_producto: null,
        numero_modelo: null,
        numero_serie: null,
        version_android: null,
        modelo: null,
        codigo_unico: null
    };
  }

  // --- LÓGICA DE EXTRACCIÓN MEJORADA ---
  parseTabletInfo(text) {
    const info = this.getEmptyInfo();
    console.log('Texto OCR:', text);

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    for (let i = 0; i < lines.length; i++) {
        const lineOriginal = lines[i];
        const line = lineOriginal.toLowerCase();

        // 1. Número de Serie / Serie -> numero_serie
        if (line.includes('número de serie') || line.startsWith('serie')) {
            info.numero_serie = this.extractValue(lines, i);
            // Limpiar espacios en el serie (ej: R 9 W T -> R9WT)
            if (info.numero_serie) {
                info.numero_serie = info.numero_serie.replace(/\s+/g, '').toUpperCase();
            }
        }

        // 2. Nombre del modelo / Modelo -> modelo
        // (Excluyendo "número de modelo" para no confundir)
        else if ((line.includes('nombre del modelo') || line.startsWith('modelo')) && !line.includes('número')) {
            info.modelo = this.extractValue(lines, i);
        }

        // 3. Nombre del producto -> nombre_producto Y numero_modelo
        else if (line.includes('nombre del producto')) {
            const val = this.extractValue(lines, i);
            if (val) {
                info.nombre_producto = val;
                info.numero_modelo = val; // REGLA APLICADA: El mismo valor va aquí
            }
        }

        // Extra: Versión Android (por si acaso)
        else if (line.includes('android')) {
            const match = lineOriginal.match(/Android\s+(\d+(\.\d+)?)/i);
            if (match) info.version_android = match[1];
        }
    }

    // Fallbacks simples si no se encontró por etiqueta
    if (!info.numero_serie) {
        // Buscar patrón Samsung (R seguido de 9-11 alfanuméricos)
        const match = text.match(/\b(R[A-Z0-9]{9,11})\b/i);
        if (match) info.numero_serie = match[0].toUpperCase();
    }

    console.log('Datos extraídos:', info);
    return info;
  }

  // Ayudante para sacar el valor de la misma línea (después de :) o de la siguiente
  extractValue(lines, index) {
    const line = lines[index];
    if (line.includes(':')) {
        return line.split(':')[1].trim();
    }
    // Si no tiene ':', tomamos la línea siguiente
    if (index + 1 < lines.length) {
        return lines[index + 1].trim();
    }
    return null;
  }

  updateProgress(p) { /* ... código visual igual ... */ }
  showStatus(msg) { 
    const el = document.getElementById('ocr-status');
    const txt = document.getElementById('ocr-status-text');
    if (el && txt) { txt.innerText = msg; el.style.display = 'flex'; }
  }
  hideStatus() {
    const el = document.getElementById('ocr-status');
    if (el) el.style.display = 'none';
  }
}

const ocrManager = new OCRManager();
