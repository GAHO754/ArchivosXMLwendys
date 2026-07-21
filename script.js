// ============================================================
// CONFIGURACIÓN DE PROVEEDORES Y TIENDAS
// ============================================================
// La tienda predeterminada solamente se utiliza cuando el XML
// no contiene el atributo CENTROCOSTO.
const CONFIGURACION_POR_RFC = {
  ACM040107U93: {
    numeroProveedor: '001488'
  },
  PME921109IS8: {
    numeroProveedor: '000201',
    tiendaPredeterminada: '000103'
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const processButton = document.getElementById('processButton');
  const fileInput = document.getElementById('file');

  if (!processButton || !fileInput) {
    console.error(
      'No se encontraron el botón de procesamiento o el selector de archivo.'
    );
    return;
  }

  processButton.addEventListener('click', () => {
    if (fileInput.files.length === 0) {
      alert('Por favor, selecciona un archivo XML.');
      return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();
    const textoOriginalBoton = processButton.textContent;

    processButton.disabled = true;
    processButton.textContent = 'Procesando...';

    reader.onload = (event) => {
      try {
        let xmlContent = event.target.result;

        // Limpieza robusta del XML.
        xmlContent = xmlContent
          // Reemplaza los caracteres & sueltos, conservando entidades válidas.
          .replace(
            /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g,
            '&amp;'
          )
          // Elimina caracteres ilegales para XML 1.0.
          .replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g, '');

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(
          xmlContent,
          'application/xml'
        );

        const parserError =
          xmlDoc.getElementsByTagName('parsererror');

        if (parserError.length > 0) {
          alert(
            '❌ El archivo XML tiene errores graves y no pudo ser leído.'
          );
          console.error(parserError[0].textContent);
          return;
        }

        // ============================================================
        // EMISOR Y NÚMERO DE PROVEEDOR
        // ============================================================
        const emisor = obtenerPrimerElemento(xmlDoc, 'Emisor');

        const rfcEmisor =
          emisor?.getAttribute('Rfc')?.trim() || '000000';

        const configuracionEmisor =
          CONFIGURACION_POR_RFC[rfcEmisor];

        // Se conserva el comportamiento anterior para RFC no configurados.
        const numeroProveedor =
          configuracionEmisor?.numeroProveedor || rfcEmisor;

        // ============================================================
        // CENTROCOSTO Y NÚMERO DE TIENDA
        // ============================================================
        const allNodes = xmlDoc.getElementsByTagName('*');

        let centroCostoAttr = null;
        let numeroTienda = '000000';

        // Busca CENTROCOSTO en todos los atributos.
        for (let i = 0; i < allNodes.length; i++) {
          const attrs = allNodes[i].attributes;

          for (let j = 0; j < attrs.length; j++) {
            const attrName =
              attrs[j].name.trim().toUpperCase();

            if (attrName === 'CENTROCOSTO') {
              centroCostoAttr = attrs[j].value.trim();
              break;
            }
          }

          if (centroCostoAttr) {
            break;
          }
        }

        if (centroCostoAttr) {
          // Conserva únicamente los números.
          const limpio =
            centroCostoAttr.replace(/\D/g, '');

          if (limpio.length === 8) {
            // Ejemplo: 41420059 se convierte en 420059.
            numeroTienda = limpio
              .substring(2)
              .padStart(6, '0');
          } else {
            // Para otras longitudes, utiliza los últimos seis números.
            numeroTienda = limpio
              .slice(-6)
              .padStart(6, '0');
          }
        } else if (
          configuracionEmisor?.tiendaPredeterminada
        ) {
          // PME921109IS8 utiliza la tienda 000103
          // cuando el XML no tiene CENTROCOSTO.
          numeroTienda =
            configuracionEmisor.tiendaPredeterminada;
        } else {
          alert(
            '⚠️ No se encontró el atributo CENTROCOSTO. Se usará 000000.'
          );
        }

        console.log('RFC del emisor:', rfcEmisor);
        console.log(
          'Número de proveedor:',
          numeroProveedor
        );
        console.log(
          'CENTROCOSTO encontrado:',
          centroCostoAttr
        );
        console.log(
          'Número de tienda final:',
          numeroTienda
        );

        // ============================================================
        // COMPROBANTE Y DATOS GENERALES
        // ============================================================
        const comprobante =
          obtenerPrimerElemento(xmlDoc, 'Comprobante');

        if (!comprobante) {
          alert(
            '❌ No se encontró el nodo Comprobante dentro del XML.'
          );
          return;
        }

        const fechaOriginal =
          comprobante.getAttribute('Fecha') || '';

        const fechaFormateada =
          formatearFecha(fechaOriginal);

        const folio =
          comprobante.getAttribute('Folio') ||
          'SIN_FOLIO';

        const totalNumerico = parseFloat(
          comprobante.getAttribute('Total') || '0'
        );

        const total = Number.isFinite(totalNumerico)
          ? totalNumerico.toFixed(2)
          : '0.00';

        // ============================================================
        // IMPUESTOS TRASLADADOS TOTALES
        // ============================================================
        let impuestosTrasladados = '0.00';

        for (let i = 0; i < allNodes.length; i++) {
          const node = allNodes[i];

          if (
            node.hasAttribute(
              'TotalImpuestosTrasladados'
            )
          ) {
            impuestosTrasladados =
              node.getAttribute(
                'TotalImpuestosTrasladados'
              ) || '0.00';

            break;
          }
        }

        // ============================================================
        // CONCEPTOS Y TARIFA
        // ============================================================
        let tarifaImporte = '';

        const conceptos =
          obtenerElementos(xmlDoc, 'Concepto');

        const detalles = [];

        for (let i = 0; i < conceptos.length; i++) {
          const concepto = conceptos[i];

          const noIdentificacion =
            concepto.getAttribute(
              'NoIdentificacion'
            ) || '000000';

          const cantidad =
            concepto.getAttribute('Cantidad') ||
            '0.00';

          const valorUnitario =
            concepto.getAttribute(
              'ValorUnitario'
            ) || '0.00';

          const importe =
            concepto.getAttribute('Importe') ||
            '0.00';

          if (
            noIdentificacion
              .trim()
              .toUpperCase() === 'TARIFA'
          ) {
            tarifaImporte = importe;
          } else {
            detalles.push(
              `D\t${noIdentificacion}\tN\t${cantidad}\t${valorUnitario}\t${importe}`
            );
          }
        }

        // ============================================================
        // DESCUENTO OPCIONAL
        // ============================================================
        let descuentoLinea = '';

        const condicionesPago =
          comprobante.getAttribute(
            'CondicionesDePago'
          );

        const descuento =
          comprobante.getAttribute('Descuento');

        const exportacion =
          comprobante.getAttribute('Exportacion');

        if (
          condicionesPago &&
          descuento &&
          exportacion
        ) {
          const descuentoNumerico =
            parseFloat(descuento);

          if (
            Number.isFinite(descuentoNumerico)
          ) {
            descuentoLinea =
              `-${descuentoNumerico.toFixed(2)}`;
          }
        }

        // ============================================================
        // CABECERA DEL TXT
        // ============================================================
        let cabecera =
          `H\t${numeroProveedor.padStart(6, '0')}` +
          `\t${numeroTienda.padStart(6, '0')}` +
          `\t\t${fechaFormateada}` +
          `\t${folio}` +
          `\t${fechaFormateada}` +
          `\t${total}` +
          `\tIVA (TAX)` +
          `\t${impuestosTrasladados}`;

        if (tarifaImporte) {
          cabecera +=
            `\tDISTRIBUCION Y ALMACENAJE FLETE` +
            `\t${tarifaImporte}`;
        }

        if (descuentoLinea) {
          cabecera +=
            `\tDESCUENTO EN FLETES` +
            `\t${descuentoLinea}`;
        }

        // ============================================================
        // CREACIÓN Y DESCARGA DEL TXT
        // ============================================================
        const contenidoFinal = [
          cabecera,
          ...detalles
        ].join('\n');

        const blob = new Blob(
          [contenidoFinal],
          {
            type: 'text/plain;charset=utf-8'
          }
        );

        const url =
          URL.createObjectURL(blob);

        const link =
          document.createElement('a');

        link.href = url;
        link.download = `009${folio}.txt`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 1000);
      } catch (error) {
        console.error(
          'Error al procesar el XML:',
          error
        );

        alert(
          '❌ Ocurrió un error al procesar el XML. Revisa la consola para más detalles.'
        );
      } finally {
        processButton.disabled = false;
        processButton.textContent =
          textoOriginalBoton;
      }
    };

    reader.onerror = () => {
      processButton.disabled = false;
      processButton.textContent =
        textoOriginalBoton;

      alert(
        '❌ No se pudo leer el archivo seleccionado.'
      );
    };

    reader.readAsText(file);
  });
});

/**
 * Obtiene el primer elemento CFDI por su nombre local.
 * Admite el prefijo cfdi y otros prefijos válidos.
 */
function obtenerPrimerElemento(
  xmlDoc,
  nombreLocal
) {
  return (
    xmlDoc.getElementsByTagName(
      `cfdi:${nombreLocal}`
    )[0] ||
    xmlDoc.getElementsByTagNameNS(
      '*',
      nombreLocal
    )[0] ||
    xmlDoc.getElementsByTagName(
      nombreLocal
    )[0] ||
    null
  );
}

/**
 * Obtiene todos los elementos CFDI por su nombre local.
 */
function obtenerElementos(
  xmlDoc,
  nombreLocal
) {
  const elementosConPrefijo =
    xmlDoc.getElementsByTagName(
      `cfdi:${nombreLocal}`
    );

  if (elementosConPrefijo.length > 0) {
    return elementosConPrefijo;
  }

  const elementosPorNamespace =
    xmlDoc.getElementsByTagNameNS(
      '*',
      nombreLocal
    );

  if (elementosPorNamespace.length > 0) {
    return elementosPorNamespace;
  }

  return xmlDoc.getElementsByTagName(
    nombreLocal
  );
}

/**
 * Convierte una fecha CFDI:
 * YYYY-MM-DDTHH:mm:ss a M/D/YYYY.
 */
function formatearFecha(fechaOriginal) {
  const coincidencia =
    /^(\d{4})-(\d{2})-(\d{2})/.exec(
      fechaOriginal
    );

  if (coincidencia) {
    const anio = coincidencia[1];
    const mes = Number(coincidencia[2]);
    const dia = Number(coincidencia[3]);

    return `${mes}/${dia}/${anio}`;
  }

  const fecha = new Date(fechaOriginal);

  if (Number.isNaN(fecha.getTime())) {
    return '';
  }

  return fecha.toLocaleDateString('en-US');
}