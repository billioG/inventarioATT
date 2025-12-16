// Gestión de cámara y captura de fotos
class CameraManager {
    static stream = null;
    static videoElement = null;
    static canvasElement = null;

    static async initialize(videoElement, canvasElement) {
        this.videoElement = videoElement;
        this.canvasElement = canvasElement;

        try {
            // Solicitar acceso a la cámara
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment', // Cámara trasera en móviles
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            });

            this.videoElement.srcObject = this.stream;
            await this.videoElement.play();

            return { success: true };
        } catch (error) {
            console.error('Error accediendo a la cámara:', error);
            return { success: false, error: error.message };
        }
    }

    static capture() {
        if (!this.videoElement || !this.canvasElement) {
            return { success: false, error: 'Cámara no inicializada' };
        }

        try {
            const video = this.videoElement;
            const canvas = this.canvasElement;

            // Configurar canvas con las dimensiones del video
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            // Capturar frame
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Convertir a blob
            return new Promise((resolve) => {
                canvas.toBlob((blob) => {
                    const url = URL.createObjectURL(blob);
                    resolve({
                        success: true,
                        blob,
                        url,
                        canvas
                    });
                }, 'image/jpeg', 0.95);
            });
        } catch (error) {
            console.error('Error capturando imagen:', error);
            return { success: false, error: error.message };
        }
    }

    static stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
    }

    static async captureAndExtractInfo() {
        const captureResult = await this.capture();
        
        if (!captureResult.success) {
            return captureResult;
        }

        // Procesar con OCR
        const ocrResult = await OCRHandler.extractTabletInfo(captureResult.canvas);

        return {
            success: true,
            image: captureResult,
            ocr: ocrResult
        };
    }
}

// Gestión de archivos de imagen
class ImageHandler {
    static async readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                resolve(e.target.result);
            };
            
            reader.onerror = (e) => {
                reject(e);
            };
            
            reader.readAsDataURL(file);
        });
    }

    static async createImageElement(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            
            img.onload = () => {
                resolve(img);
            };
            
            img.onerror = (e) => {
                reject(e);
            };
            
            img.src = src;
        });
    }

    static async resizeImage(file, maxWidth = 1920, maxHeight = 1080) {
        const dataUrl = await this.readFile(file);
        const img = await this.createImageElement(dataUrl);

        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calcular nuevas dimensiones manteniendo aspecto
        if (width > height) {
            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }
        } else {
            if (height > maxHeight) {
                width = Math.round((width * maxHeight) / height);
                height = maxHeight;
            }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                resolve({
                    blob,
                    url: URL.createObjectURL(blob),
                    width,
                    height
                });
            }, 'image/jpeg', 0.9);
        });
    }

    static async processMultipleFiles(files) {
        const results = [];
        
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                const resized = await this.resizeImage(file);
                results.push({
                    original: file,
                    resized: resized.blob,
                    url: resized.url,
                    width: resized.width,
                    height: resized.height
                });
            }
        }

        return results;
    }

    static blobToFile(blob, filename) {
        return new File([blob], filename, { type: blob.type });
    }
}
