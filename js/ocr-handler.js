// Manejo de OCR con Tesseract.js
class OCRHandler {
    static worker = null;

    static async initialize() {
        if (!this.worker) {
            try {
                this.worker = await Tesseract.createWorker('eng+spa', 1, {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            console.log(`Progreso OCR: ${Math.round(m.progress * 100)}%`);
                        }
                    }
                });
            } catch (error) {
                console.error('Error inicializando OCR:', error);
                throw error;
            }
        }
        return this.worker;
    }

    static async recognize(imageSource) {
        try {
            showLoader('Procesando imagen...');
            
            const worker = await this.initialize();
            const { data: { text } } = await worker.recognize(imageSource);
            
            hideLoader();
            return { success: true, text };
        } catch (error) {
            hideLoader();
            console.error('Error en reconocimiento OCR:', error);
            return { success: false, error: error.message };
        }
    }

    static async extractTabletInfo(imageSource) {
        const result = await this.recognize(imageSource);
        
        if (!result.success) {
            return { success: false, error: result.error };
        }

        const text = result.text;
        const extractedData = {
            nombreProducto: null,
            modelo: null,
            numeroSerie: null,
            nivelBateria: null
        };

        // Patrones de extracción
        const patterns = {
            // Nombre del producto (buscar marcas comunes)
            nombreProducto: [
                /(?:tablet|tab)\s+([a-z0-9\s]+)/i,
                /(samsung|huawei|lenovo|amazon|apple|xiaomi)\s+([a-z0-9\s]+)/i,
                /model[o]?:\s*([a-z0-9\s-]+)/i
            ],
            
            // Modelo
            modelo: [
                /model[o]?:\s*([a-z0-9-]+)/i,
                /^([a-z]{2,4}[-\s]?[0-9]{3,4}[a-z]?)/im,
                /(tab[a-z]?[-\s]?[0-9]+[a-z]?)/i
            ],
            
            // Número de serie
            numeroSerie: [
                /serial\s*(?:number|no|#)?:?\s*([a-z0-9]+)/i,
                /s\/n:?\s*([a-z0-9]+)/i,
                /\b([a-z0-9]{10,})\b/i // Serie larga alfanumérica
            ],
            
            // Nivel de batería
            nivelBateria: [
                /battery:?\s*(\d+)\s*%/i,
                /bater[ií]a:?\s*(\d+)\s*%/i,
                /(\d+)\s*%/
            ]
        };

        // Extraer cada campo
        for (const [field, patternList] of Object.entries(patterns)) {
            for (const pattern of patternList) {
                const match = text.match(pattern);
                if (match) {
                    let value = match[1] || match[0];
                    
                    // Limpiar el valor
                    value = value.trim();
                    
                    // Para batería, convertir a número
                    if (field === 'nivelBateria') {
                        const num = parseInt(value);
                        if (num >= 0 && num <= 100) {
                            extractedData[field] = num;
                            break;
                        }
                    } else {
                        extractedData[field] = value;
                        break;
                    }
                }
            }
        }

        // Intentar detectar información adicional de Android
        const androidMatch = text.match(/android\s+(\d+(?:\.\d+)?)/i);
        if (androidMatch) {
            extractedData.versionAndroid = `Android ${androidMatch[1]}`;
        }

        return {
            success: true,
            data: extractedData,
            rawText: text
        };
    }

    static async terminate() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
    }

    // Preprocesar imagen para mejorar OCR
    static preprocessImage(canvas, ctx) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Convertir a escala de grises y aumentar contraste
        for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            
            // Aumentar contraste
            const contrast = 1.5;
            const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
            const gray = factor * (avg - 128) + 128;
            
            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }
}

// Utilidades para formateo de datos extraídos
class DataFormatter {
    static formatSerialNumber(serial) {
        if (!serial) return '';
        return serial.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    static formatModel(model) {
        if (!model) return '';
        return model.trim().toUpperCase();
    }

    static detectAndroidVersion(text) {
        const match = text.match(/android\s+(\d+(?:\.\d+)?)/i);
        return match ? `Android ${match[1]}` : null;
    }

    static extractBatteryLevel(text) {
        const matches = text.match(/(\d+)\s*%/g);
        if (!matches) return null;
        
        // Buscar el valor más probable (entre 0 y 100)
        for (const match of matches) {
            const num = parseInt(match);
            if (num >= 0 && num <= 100) {
                return num;
            }
        }
        return null;
    }
}
