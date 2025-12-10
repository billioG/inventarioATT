// Export Manager
class ExportManager {
  constructor() {
    this.tablets = [];
  }

  // Set tablets data
  setData(tablets) {
    this.tablets = tablets;
  }

  // Export to Excel
  async exportToExcel() {
    try {
      showToast('Generando archivo Excel...', 'info');

      // Prepare data
      const data = this.prepareExportData();

      // Create workbook
      const wb = XLSX.utils.book_new();
      
      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(data);

      // Set column widths
      const colWidths = [
        { wch: 15 }, // Código
        { wch: 20 }, // Modelo
        { wch: 20 }, // Número Serie
        { wch: 20 }, // Sede
        { wch: 15 }, // Estado Pantalla
        { wch: 15 }, // Estado Puerto
        { wch: 15 }, // Estado Físico
        { wch: 10 }, // Cargador
        { wch: 10 }, // Cable
        { wch: 12 }, // Android
        { wch: 10 }, // Batería
        { wch: 30 }, // Observaciones
        { wch: 15 }  // Fecha
      ];
      ws['!cols'] = colWidths;

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Inventario Tablets');

      // Generate filename
      const filename = `inventario_tablets_${this.getDateString()}.xlsx`;

      // Write file
      XLSX.writeFile(wb, filename);

      showToast('Archivo Excel descargado', 'success');

    } catch (error) {
      console.error('Excel export error:', error);
      showToast('Error al exportar a Excel: ' + error.message, 'error');
    }
  }

  // Export to CSV
  async exportToCSV() {
    try {
      showToast('Generando archivo CSV...', 'info');

      // Prepare data
      const data = this.prepareExportData();

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, 'Inventario');

      // Generate filename
      const filename = `inventario_tablets_${this.getDateString()}.csv`;

      // Write as CSV
      XLSX.writeFile(wb, filename, { bookType: 'csv' });

      showToast('Archivo CSV descargado', 'success');

    } catch (error) {
      console.error('CSV export error:', error);
      showToast('Error al exportar a CSV: ' + error.message, 'error');
    }
  }

  // Export to PDF
  async exportToPDF() {
    try {
      showToast('Generando archivo PDF...', 'info');

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('l', 'mm', 'a4'); // Landscape orientation

      // Add title
      doc.setFontSize(16);
      doc.text('Inventario de Tablets - Fundación Carlos F. Novella', 14, 15);

      // Add date
      doc.setFontSize(10);
      doc.text(`Fecha de generación: ${this.getDateTimeString()}`, 14, 22);

      // Prepare table data
      const headers = [
        ['Código', 'Modelo', 'N° Serie', 'Sede', 'Estado\nPantalla', 'Estado\nPuerto', 'Cargador', 'Cable', 'Android', 'Batería %', 'Fecha']
      ];

      const rows = this.tablets.map(tablet => [
        tablet.codigo_unico || '',
        tablet.modelo || '',
        tablet.numero_serie || '',
        tablet.sede_procedencia || '',
        tablet.estado_pantalla || '',
        tablet.estado_puerto_carga || '',
        tablet.tiene_cargador ? 'Sí' : 'No',
        tablet.tiene_cable ? 'Sí' : 'No',
        tablet.version_android || '',
        tablet.nivel_bateria || '',
        this.formatDate(tablet.fecha_mantenimiento)
      ]);

      // Add table
      doc.autoTable({
        head: headers,
        body: rows,
        startY: 28,
        theme: 'grid',
        styles: {
          fontSize: 8,
          cellPadding: 2
        },
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: 255,
          fontStyle: 'bold'
        },
        alternateRowStyles: {
          fillColor: [245, 247, 250]
        },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 25 },
          2: { cellWidth: 25 },
          3: { cellWidth: 30 },
          4: { cellWidth: 20 },
          5: { cellWidth: 20 },
          6: { cellWidth: 15 },
          7: { cellWidth: 15 },
          8: { cellWidth: 15 },
          9: { cellWidth: 15 },
          10: { cellWidth: 20 }
        }
      });

      // Add page numbers
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(
          `Página ${i} de ${pageCount}`,
          doc.internal.pageSize.getWidth() / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        );
      }

      // Generate filename
      const filename = `inventario_tablets_${this.getDateString()}.pdf`;

      // Save PDF
      doc.save(filename);

      showToast('Archivo PDF descargado', 'success');

    } catch (error) {
      console.error('PDF export error:', error);
      showToast('Error al exportar a PDF: ' + error.message, 'error');
    }
  }

  // Prepare data for export
  prepareExportData() {
    return this.tablets.map(tablet => ({
      'Código Único': tablet.codigo_unico || '',
      'Modelo': tablet.modelo || '',
      'Número de Serie': tablet.numero_serie || '',
      'Nombre Producto': tablet.nombre_producto || '',
      'Número Modelo': tablet.numero_modelo || '',
      'Sede Procedencia': tablet.sede_procedencia || '',
      'Estado Pantalla': tablet.estado_pantalla || '',
      'Estado Pantalla (Otro)': tablet.estado_pantalla_otro || '',
      'Estado Puerto Carga': tablet.estado_puerto_carga || '',
      'Estado Físico General': tablet.estado_fisico_general || '',
      'Tiene Cargador': tablet.tiene_cargador ? 'Sí' : 'No',
      'Tiene Cable': tablet.tiene_cable ? 'Sí' : 'No',
      'Versión Android': tablet.version_android || '',
      'Nivel Batería (%)': tablet.nivel_bateria || '',
      'Observaciones': tablet.observaciones || '',
      'Hallazgos Relevantes': tablet.hallazgos_relevantes || '',
      'Fecha Mantenimiento': this.formatDate(tablet.fecha_mantenimiento),
      'Fecha Creación': this.formatDateTime(tablet.created_at),
      'Última Actualización': this.formatDateTime(tablet.updated_at)
    }));
  }

  // Format date
  formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-GT');
  }

  // Format datetime
  formatDateTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('es-GT');
  }

  // Get date string for filename
  getDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  // Get datetime string
  getDateTimeString() {
    const now = new Date();
    return now.toLocaleString('es-GT');
  }
}

// Export singleton
const exportManager = new ExportManager();

