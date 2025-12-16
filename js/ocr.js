// js/ocr.js - Lógica corregida según tus instrucciones exactas
class OCRManager {
  constructor() {
    this.worker = null;
    this.isProcessing = false;
  }

  async init() {
    try {
      if (!this.worker) {
        // Inicializar Tesseract
        this.worker = await Tesseract.createWorker();
        await this.worker.loadLanguage('spa');
        await this.worker.initialize('spa');
      }
      return this.worker;
    } catch (error) {
      console.error('OCR Init Error:', error);
      showToast('No se pudo iniciar el escáner visual', 'warning');
      return null;
    }
  }

  async processImage(imageSource) {
    try {
      this.isProcessing = true;
      this.showStatus('Leyendo datos de la imagen...');

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
      showToast('No se pudieron extraer datos. Intenta con otra foto.', 'error');
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

  parseTabletInfo(text) {
    const info = this.getEmptyInfo();
    console.log('Texto escaneado:', text);

    // Limpiar el texto y dividir por líneas
    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    for (let i = 0; i < lines.length; i++) {
      const lineOriginal = lines[i];
      const line = lineOriginal.toLowerCase();

      // REGLA 1: Número de serie
      // Busca "Número de serie" o "Serie"
      if (line.includes('número de serie') || line.startsWith('serie')) {
        let val = this.extractValue(lines, i);
        if (val) {
          // Eliminar espacios (ej: "R 5 X" -> "R5X")
          info.numero_serie = val.replace(/\s+/g, '').toUpperCase();
        }
      }

      // REGLA 2: Modelo
      // Busca "Nombre del modelo" o "Modelo" (ignorando "número de modelo")
      else if ((line.includes('nombre del modelo') || line.startsWith('modelo')) && !line.includes('número')) {
        info.modelo = this.extractValue(lines, i);
      }

      // REGLA 3: Nombre del producto
      // Este valor va en 'nombre_producto' Y en 'numero_modelo' como pediste
      else if (line.includes('nombre del producto')) {
        let val = this.extractValue(lines, i);
        if (val) {
          info.nombre_producto = val;
          info.numero_modelo = val; // <--- Se copia al número de modelo
        }
      }
    }

    // Fallbacks (Solo si falló lo anterior)
    if (!info.numero_serie) {
      // Patrón Samsung: R seguido de 9-11 caracteres
      const match = text.match(/\b(R[A-Z0-9]{9,11})\b/i);
      if (match) info.numero_serie = match[0].toUpperCase();
    }

    if (!info.nombre_producto) {
       // Buscar Galaxy Tab si no se encontró etiqueta
       const match = text.match(/Galaxy\s+Tab\s+[A-Z0-9\s]+/i);
       if (match) {
         info.nombre_producto = match[0].trim();
         if (!info.numero_modelo) info.numero_modelo = match[0].trim();
       }
    }

    console.log('Datos extraídos finales:', info);
    return info;
  }

  // Utilidad para sacar el valor de la misma línea (después de :) o la siguiente
  extractValue(lines, index) {
    const line = lines[index];
    // Si tiene dos puntos, tomar lo de la derecha
    if (line.includes(':')) {
      return line.split(':')[1].trim();
    }
    // Si no, tomar la línea siguiente si existe
    if (index + 1 < lines.length) {
      return lines[index + 1].trim();
    }
    return null;
  }

  // Helpers visuales
  updateProgress(p) { /* Opcional: implementar si quieres barra de progreso */ }
  
  showStatus(msg) {
    const container = document.getElementById('ocr-status');
    const text = document.getElementById('ocr-status-text');
    if (container && text) {
      text.innerText = msg;
      container.style.display = 'flex';
    }
  }

  hideStatus() {
    const container = document.getElementById('ocr-status');
    if (container) container.style.display = 'none';
  }
}

const ocrManager = new OCRManager();
