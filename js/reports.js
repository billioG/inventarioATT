// Gestión de reportes y exportaciones
class ReportManager {
    // Exportar a Excel
    static async exportToExcel(tablets = AppState.filteredTablets) {
        try {
            showLoader('Generando Excel...');

            // Preparar datos
            const data = tablets.map(tablet => ({
                'Código Único': tablet.codigo_unico,
                'Número de Serie': tablet.numero_serie || '',
                'Modelo': tablet.modelo || '',
                'Nombre del Producto': tablet.nombre_producto || '',
                'Sede': tablet.sede,
                'Versión Android': tablet.version_android || '',
                'Nivel de Batería (%)': tablet.nivel_bateria,
                'Estado de Pantalla': tablet.estado_pantalla,
                'Estado Puerto Carga': tablet.estado_puerto_carga,
                'Estado Físico General': tablet.estado_fisico_general,
                'Tiene Cargador': tablet.tiene_cargador ? 'Sí' : 'No',
                'Tiene Cable': tablet.tiene_cable_carga ? 'Sí' : 'No',
                'Observaciones': tablet.observaciones_adicionales || '',
                'Hallazgos': tablet.hallazgos_relevantes || '',
                'Fecha Mantenimiento': tablet.fecha_mantenimiento || '',
                'Fecha Creación': new Date(tablet.created_at).toLocaleString('es-GT')
            }));

            // Crear libro de Excel
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(data);

            // Ajustar anchos de columna
            const colWidths = [
                { wch: 20 }, // Código Único
                { wch: 20 }, // Número de Serie
                { wch: 20 }, // Modelo
                { wch: 25 }, // Nombre del Producto
                { wch: 25 }, // Sede
                { wch: 15 }, // Versión Android
                { wch: 12 }, // Nivel de Batería
                { wch: 18 }, // Estado de Pantalla
                { wch: 18 }, // Estado Puerto
                { wch: 18 }, // Estado Físico
                { wch: 12 }, // Tiene Cargador
                { wch: 12 }, // Tiene Cable
                { wch: 30 }, // Observaciones
                { wch: 30 }, // Hallazgos
                { wch: 18 }, // Fecha Mantenimiento
                { wch: 20 }  // Fecha Creación
            ];
            ws['!cols'] = colWidths;

            // Agregar hoja
            XLSX.utils.book_append_sheet(wb, ws, 'Inventario Tablets');

            // Crear hoja de estadísticas
            const stats = this.generateStatistics(tablets);
            const wsStats = XLSX.utils.json_to_sheet([
                { Métrica: 'Total de Tablets', Valor: stats.total },
                { Métrica: 'En Buen Estado', Valor: stats.ok },
                { Métrica: 'Con Problemas', Valor: stats.issues },
                { Métrica: 'Batería Promedio (%)', Valor: stats.avgBattery },
                { Métrica: '', Valor: '' },
                { Métrica: 'Por Sede', Valor: '' },
                ...Object.entries(stats.bySede).map(([sede, count]) => ({
                    Métrica: sede,
                    Valor: count
                })),
                { Métrica: '', Valor: '' },
                { Métrica: 'Por Estado de Pantalla', Valor: '' },
                ...Object.entries(stats.byEstadoPantalla).map(([estado, count]) => ({
                    Métrica: estado,
                    Valor: count
                }))
            ]);
            XLSX.utils.book_append_sheet(wb, wsStats, 'Estadísticas');

            // Descargar archivo
            const fileName = `inventario_tablets_${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(wb, fileName);

            hideLoader();
            showToast('Excel generado correctamente', 'success');
            return { success: true };
        } catch (error) {
            hideLoader();
            console.error('Error generando Excel:', error);
            showToast('Error generando Excel', 'error');
            return { success: false, error: error.message };
        }
    }

    // Exportar a PDF
    static async exportToPDF(tablets = AppState.filteredTablets) {
        try {
            showLoader('Generando PDF...');

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('l', 'mm', 'a4'); // Landscape

            // Título
            doc.setFontSize(18);
            doc.setTextColor(45, 106, 79);
            doc.text('Inventario de Tablets', 15, 15);

            // Fecha del reporte
            doc.setFontSize(10);
            doc.setTextColor(108, 117, 125);
            doc.text(`Generado: ${new Date().toLocaleString('es-GT')}`, 15, 22);

            // Estadísticas
            const stats = this.generateStatistics(tablets);
            doc.setFontSize(12);
            doc.setTextColor(33, 37, 41);
            let yPos = 32;

            doc.text(`Total de Tablets: ${stats.total}`, 15, yPos);
            doc.text(`En Buen Estado: ${stats.ok}`, 80, yPos);
            doc.text(`Con Problemas: ${stats.issues}`, 145, yPos);
            doc.text(`Batería Promedio: ${stats.avgBattery}%`, 210, yPos);

            yPos += 10;

            // Tabla de tablets
            const tableData = tablets.map(t => [
                t.codigo_unico,
                t.numero_serie || '',
                t.modelo || '',
                t.sede,
                `${t.nivel_bateria}%`,
                t.estado_pantalla,
                t.estado_puerto_carga,
                t.estado_fisico_general
            ]);

            doc.autoTable({
                startY: yPos,
                head: [['Código', 'Serie', 'Modelo', 'Sede', 'Batería', 'Pantalla', 'Puerto', 'Estado']],
                body: tableData,
                theme: 'striped',
                headStyles: {
                    fillColor: [45, 106, 79],
                    textColor: 255,
                    fontStyle: 'bold'
                },
                styles: {
                    fontSize: 8,
                    cellPadding: 2
                },
                columnStyles: {
                    0: { cellWidth: 35 },
                    1: { cellWidth: 30 },
                    2: { cellWidth: 30 },
                    3: { cellWidth: 40 },
                    4: { cellWidth: 20 },
                    5: { cellWidth: 25 },
                    6: { cellWidth: 25 },
                    7: { cellWidth: 25 }
                }
            });

            // Nueva página para estadísticas detalladas
            doc.addPage();
            doc.setFontSize(16);
            doc.setTextColor(45, 106, 79);
            doc.text('Estadísticas Detalladas', 15, 15);

            yPos = 25;

            // Por sede
            doc.setFontSize(12);
            doc.setTextColor(33, 37, 41);
            doc.text('Distribución por Sede:', 15, yPos);
            yPos += 8;

            doc.setFontSize(10);
            for (const [sede, count] of Object.entries(stats.bySede)) {
                doc.text(`${sede}: ${count}`, 20, yPos);
                yPos += 6;
            }

            yPos += 5;

            // Por estado de pantalla
            doc.setFontSize(12);
            doc.text('Por Estado de Pantalla:', 15, yPos);
            yPos += 8;

            doc.setFontSize(10);
            for (const [estado, count] of Object.entries(stats.byEstadoPantalla)) {
                doc.text(`${estado}: ${count}`, 20, yPos);
                yPos += 6;
            }

            yPos += 5;

            // Por estado de puerto
            doc.setFontSize(12);
            doc.text('Por Estado de Puerto de Carga:', 15, yPos);
            yPos += 8;

            doc.setFontSize(10);
            for (const [estado, count] of Object.entries(stats.byEstadoPuerto)) {
                doc.text(`${estado}: ${count}`, 20, yPos);
                yPos += 6;
            }

            // Guardar PDF
            const fileName = `inventario_tablets_${new Date().toISOString().slice(0, 10)}.pdf`;
            doc.save(fileName);

            hideLoader();
            showToast('PDF generado correctamente', 'success');
            return { success: true };
        } catch (error) {
            hideLoader();
            console.error('Error generando PDF:', error);
            showToast('Error generando PDF', 'error');
            return { success: false, error: error.message };
        }
    }

    // Generar estadísticas detalladas
    static generateStatistics(tablets) {
        const total = tablets.length;
        const ok = tablets.filter(t => 
            t.estado_pantalla === 'Bueno' && 
            t.estado_puerto_carga === 'Funciona' &&
            t.estado_fisico_general !== 'Malo'
        ).length;
        const issues = total - ok;
        
        const avgBattery = tablets.length > 0
            ? Math.round(tablets.reduce((sum, t) => sum + (t.nivel_bateria || 0), 0) / tablets.length)
            : 0;

        // Por sede
        const bySede = {};
        tablets.forEach(t => {
            bySede[t.sede] = (bySede[t.sede] || 0) + 1;
        });

        // Por estado de pantalla
        const byEstadoPantalla = {};
        tablets.forEach(t => {
            byEstadoPantalla[t.estado_pantalla] = (byEstadoPantalla[t.estado_pantalla] || 0) + 1;
        });

        // Por estado de puerto
        const byEstadoPuerto = {};
        tablets.forEach(t => {
            byEstadoPuerto[t.estado_puerto_carga] = (byEstadoPuerto[t.estado_puerto_carga] || 0) + 1;
        });

        // Por estado físico
        const byEstadoFisico = {};
        tablets.forEach(t => {
            byEstadoFisico[t.estado_fisico_general] = (byEstadoFisico[t.estado_fisico_general] || 0) + 1;
        });

        return {
            total,
            ok,
            issues,
            avgBattery,
            bySede,
            byEstadoPantalla,
            byEstadoPuerto,
            byEstadoFisico
        };
    }

    // Exportar tablet individual con historial
    static async exportTabletDetail(tabletId) {
        try {
            showLoader('Generando reporte...');

            const tabletResult = await TabletManager.getById(tabletId);
            if (!tabletResult.success) {
                throw new Error('Error obteniendo tablet');
            }

            const tablet = tabletResult.data;
            const historyResult = await TabletManager.getHistory(tabletId);
            const history = historyResult.success ? historyResult.data : [];

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            // Título
            doc.setFontSize(16);
            doc.setTextColor(45, 106, 79);
            doc.text(`Detalles de Tablet: ${tablet.codigo_unico}`, 15, 15);

            let yPos = 25;

            // Información básica
            doc.setFontSize(12);
            doc.setTextColor(33, 37, 41);
            const info = [
                ['Código Único:', tablet.codigo_unico],
                ['Número de Serie:', tablet.numero_serie || 'N/A'],
                ['Modelo:', tablet.modelo || 'N/A'],
                ['Nombre del Producto:', tablet.nombre_producto || 'N/A'],
                ['Sede:', tablet.sede],
                ['Versión Android:', tablet.version_android || 'N/A'],
                ['Nivel de Batería:', `${tablet.nivel_bateria}%`],
                ['Estado de Pantalla:', tablet.estado_pantalla],
                ['Estado Puerto Carga:', tablet.estado_puerto_carga],
                ['Estado Físico General:', tablet.estado_fisico_general],
                ['Tiene Cargador:', tablet.tiene_cargador ? 'Sí' : 'No'],
                ['Tiene Cable de Carga:', tablet.tiene_cable_carga ? 'Sí' : 'No'],
                ['Fecha de Mantenimiento:', tablet.fecha_mantenimiento || 'N/A']
            ];

            doc.setFontSize(10);
            info.forEach(([label, value]) => {
                doc.setFont(undefined, 'bold');
                doc.text(label, 15, yPos);
                doc.setFont(undefined, 'normal');
                doc.text(String(value), 70, yPos);
                yPos += 7;
            });

            // Observaciones
            if (tablet.observaciones_adicionales) {
                yPos += 5;
                doc.setFont(undefined, 'bold');
                doc.text('Observaciones:', 15, yPos);
                yPos += 7;
                doc.setFont(undefined, 'normal');
                const obsLines = doc.splitTextToSize(tablet.observaciones_adicionales, 180);
                doc.text(obsLines, 15, yPos);
                yPos += obsLines.length * 7;
            }

            // Hallazgos
            if (tablet.hallazgos_relevantes) {
                yPos += 5;
                doc.setFont(undefined, 'bold');
                doc.text('Hallazgos Relevantes:', 15, yPos);
                yPos += 7;
                doc.setFont(undefined, 'normal');
                const hallLines = doc.splitTextToSize(tablet.hallazgos_relevantes, 180);
                doc.text(hallLines, 15, yPos);
                yPos += hallLines.length * 7;
            }

            // Historial de cambios
            if (history.length > 0) {
                doc.addPage();
                doc.setFontSize(14);
                doc.setTextColor(45, 106, 79);
                doc.text('Historial de Cambios', 15, 15);

                const historyData = history.map(h => [
                    new Date(h.fecha_cambio).toLocaleString('es-GT'),
                    h.campo_modificado,
                    h.valor_anterior || 'N/A',
                    h.valor_nuevo || 'N/A',
                    h.usuario?.nombre || 'Sistema'
                ]);

                doc.autoTable({
                    startY: 25,
                    head: [['Fecha', 'Campo', 'Valor Anterior', 'Valor Nuevo', 'Usuario']],
                    body: historyData,
                    theme: 'striped',
                    headStyles: {
                        fillColor: [45, 106, 79],
                        textColor: 255
                    },
                    styles: {
                        fontSize: 9
                    }
                });
            }

            const fileName = `tablet_${tablet.codigo_unico}_${new Date().toISOString().slice(0, 10)}.pdf`;
            doc.save(fileName);

            hideLoader();
            showToast('Reporte generado correctamente', 'success');
            return { success: true };
        } catch (error) {
            hideLoader();
            console.error('Error generando reporte:', error);
            showToast('Error generando reporte', 'error');
            return { success: false, error: error.message };
        }
    }
}
