import { AlignmentType, BorderStyle, Document, ImageRun, Packer, PageBreak, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";

/**
 * El contrato de comisión (intermediación extrabursátil) con el cliente y el comprobante de liquidación y finiquito
 * de una operación (Anexo 3), en un documento Word. El contrato sale igual al firmado con Castro: el mismo texto, la
 * misma letra (Calibri 11, justificado), los nombres en negrita y las dos firmas al final. Acá solo se ponen los datos
 * de las partes, de la operación y, si se cargaron, las firmas.
 */

export interface Parte {
  nombre: string;
  cedula: string;
  rif: string;
  ciudad: string;
  municipio: string;
  estado: string;
}

/** Una firma (imagen) lista para el Word: los bytes del PNG y el tamaño con que se pone. */
export interface FirmaImagen {
  datos: Uint8Array;
  ancho: number;
  alto: number;
}

export interface Finiquito {
  numero: string; // OP-AAAAMMDD-001
  fechaHora: string; // DD/MM/AAAA - HH:MM
  contacto: string; // teléfono / correo del cliente
  bolivares: string; // Bs recibidos
  referencia: string; // N° de transferencia / banco
  tasaVesUsdt: string;
  usdt: string;
  hash: string;
  tasaUsdtCop: string;
  subtotalCop: string;
  comisionPct: string;
  comisionCop: string;
  bancariasCop: string;
  netoCop: string;
  titular: string;
  numeroCuenta: string;
  referenciaPago: string;
  estadoPago: string;
}

export interface DatosDocumento {
  comitente: Parte; // el cliente
  comisionista: Parte; // la empresa (quien firma por ella)
  firmaComitente?: FirmaImagen | null;
  firmaComisionista?: FirmaImagen | null;
  finiquito: Finiquito | null; // null: solo el contrato
}

const FUENTE = "Calibri";
const TAMANO = 22; // 11 pt
const vacio = (v: string, relleno = "______________") => (v.trim() ? v.trim() : relleno);

/** La cédula con sus puntos, como en el contrato: 14985239 -> 14.985.239 (si ya viene escrita, queda igual). */
export function cedulaConPuntos(v: string) {
  const d = v.replace(/\D/g, "");
  if (!d) return "";
  return /\./.test(v) ? v.replace(/^[VvEe]-?\s*/, "").trim() : d.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * El texto con sus marcas: **negrita**, __subrayado__ y //cursiva//. Así se escriben las cláusulas tal como están en
 * el contrato firmado (los nombres y EL COMITENTE en negrita, "Proveedor de Servicios…" subrayado, wallet y spread en
 * cursiva).
 */
function corridas(texto: string, base: { bold?: boolean; size?: number } = {}) {
  const size = base.size ?? TAMANO;
  return texto
    .split(/(\*\*[^*]+\*\*|__[^_]+__|\/\/[^/]+\/\/)/g)
    .filter(Boolean)
    .map((t) => {
      if (t.startsWith("**")) return new TextRun({ text: t.slice(2, -2), bold: true, font: FUENTE, size });
      if (t.startsWith("__")) return new TextRun({ text: t.slice(2, -2), underline: {}, bold: base.bold, font: FUENTE, size });
      if (t.startsWith("//")) return new TextRun({ text: t.slice(2, -2), italics: true, bold: base.bold, font: FUENTE, size });
      return new TextRun({ text: t, bold: base.bold, font: FUENTE, size });
    });
}
const parrafo = (texto: string, opciones: { alinear?: (typeof AlignmentType)[keyof typeof AlignmentType]; antes?: number; despues?: number; bold?: boolean; size?: number } = {}) =>
  new Paragraph({ children: corridas(texto, { bold: opciones.bold, size: opciones.size }), alignment: opciones.alinear ?? AlignmentType.JUSTIFIED, spacing: { before: opciones.antes ?? 0, after: opciones.despues ?? 200, line: 360 } });

/** "José Alexander Castro Vargas, venezolano, mayor de edad, titular de la cédula…" como en el contrato. */
function identificacion(p: Parte, estadoConMayuscula: boolean) {
  return `**${vacio(p.nombre)},** venezolano, mayor de edad, titular de la cédula de identidad N.º V.- ${vacio(cedulaConPuntos(p.cedula), "X.XXX.XXX")}, inscrito en Registro de Información Fiscal (RIF) ${vacio(p.rif, "J-XXXXXXXX")}, domiciliado en la ciudad de ${vacio(p.ciudad)}, Municipio ${vacio(p.municipio)} del ${estadoConMayuscula ? "Estado" : "estado"} ${vacio(p.estado, "Táchira")}`;
}

function contrato(d: DatosDocumento): (Paragraph | Table)[] {
  return [
    parrafo(
      `Entre ${identificacion(d.comitente, true)} y; civilmente hábil, por una parte y quien a los sucesivo se denominará **EL COMITENTE**; y por la otra el ciudadano, ${identificacion(d.comisionista, false)} y civilmente hábil; quien en lo sucesivo del presente contrato se denominará **EL COMISIONISTA,** se ha convenido en celebrar el presente contrato de **COMISION** el cual se regirá conforme a las siguientes cláusulas:`
    ),
    parrafo(
      "**PRIMERA: EL COMITENTE** contrata los servicios de intermediación extrabursátil a **EL COMISIONISTA**, para que éste, haciendo uso de sus competencias y saberes, ejecute todas las gestiones necesarias para la adquisición de criptoactivos, commodities y; en fin, cualquier bien tangible e intangible de lícito comercio que permita la legislación venezolana. En consecuencia, el objeto del presente contrato es regular la relación entre los contratantes, para que **EL COMISIONISTA,** pueda actuar en su nombre propio a cuenta y beneficio de **EL COMITENTE,** tal como lo establece el artículo 376 del Código de Comercio. En conclusión, **EL COMISIONISTA,** es quien ejerce actos de comercio en su nombre propio por cuenta de **EL COMITENTE.** Dado que la actividad de compra y custodia temporal de dinero para la adquisición de criptoactivos clasifica a **EL COMISIONITA** dentro de la categoría de __Proveedor de Servicios de Activos Virtuales__ (PSAV) conforme a la Providencia SUNACRIP N° 044-2021, siendo así sujeto pasivo a la obligación legal de implementar un Sistema Integral de Administración de Riesgos de LC/FT/FPADM (SIAR) soportado en un Enfoque Basado en Riesgo (EBR). A los efectos explicativos de lo anteriormente descrito, ambas partes declaran conocer el contenido y alcance del anexo 1, el cual forma parte del presente contrato y, consta de un (01) folio útil."
    ),
    parrafo(
      "**SEGUNDA:** Para la ejecución del presente contrato **EL COMITENTE** trasladará recursos mediante depósitos bancarios, a las cuentas que para tal fin disponga **EL COMISIONISTA,** previa verificación y disponibilidad operativa de las mismas, de igual forma podrá recibir para el cumplimiento del objeto del presente contrato, dinero en efectivo de lícito comercio y; en general, todo tipo de bien mueble o inmueble. Cuando **EL COMISIONISTA** tenga a su disposición el aporte con el cual se hará el cumplimiento del objeto del presente contrato, procederá a ejecutar operaciones de compra y venta de activos intangibles, dichas operaciones deberán hacerse en tiempo perentorio, para evitar pérdidas económicas por operaciones tardías. El producto de las operaciones son patrimonio de **EL COMITENTE.**"
    ),
    parrafo(
      "**TERCERA:** El presente documento sirve para que **EL COMITENTE** manifiesta, bajo fe de juramento, que los recursos entregados **AL COMISIONISTA** proceden de actividades mercantiles o profesionales lícitas y; que los criptoactivos a adquirir no serán empleados para actividades delictivas previstas en la Ley Orgánica Contra la Delincuencia Organizada y Financiamiento al Terrorismo (LOCDOFT). En consecuencia, **EL COMITENTE asume** la responsabilidad penal, civil y administrativa de manera exclusiva y excluyente sobre la licitud de los fondos fiduciarios que le sean transferidos a **EL COMISIONISTA.** A los efectos explicativos de lo anteriormente descrito, ambas partes declaran conocer el contenido y alcance del anexo 2, el cual forma parte del presente contrato y, consta de dos (02) folios útiles."
    ),
    parrafo(
      "**CUARTA:** Durante la vigencia del presente contrato, **EL COMISIONISTA** obra en nombre propio, pero por cuenta e interés de **EL COMITENTE**. En consecuencia, los recursos fiduciarios que ingresan a la cuenta bancaria de **EL COMISIONISTA** no entran a su patrimonio de forma definitiva ni constituyen una contraprestación por un bien o servicio vendido por él; constituyen entregas de dinero en custodia temporal, destinadas a un fin específico, que no es otro que es el encargo de comprar un bien sea un activo intangible (criptoactivos) y transferirlo a la billetera (//wallet//) por **EL COMISIONISTA**, o un bien tangible como sería una moneda internacional de libre y lícito comercio. **EL COMISIONISTA** no es responsable de las variaciones imprevistas del mercado, por variaciones en las tasas que afecten los intereses de **EL COMITENTE** cuando escapen a su control y buenas prácticas."
    ),
    parrafo(
      "**QUINTA:** Una vez que **EL COMISIONISTA** haya cumplido con el objeto del presente contrato, deberá reportar por los medios digitales que sean más expeditos a **EL COMITENTE** la ejecución del mandato de este contrato, detallando con precisión la diligencia realizada. Adicionalmente **EL COMISIONISTA,** una vez culmine un mes del año calendario, deberá emitir una factura, la cual deberá contener todas las formalidades fiscales y contables por los servicios prestados durante ese período impositivo. Valga decir que la factura que se hace mención en la presente cláusula será por el margen de ganancia o diferencial cambiario (//spread//) obtenido entre el monto depositado y el valor de compra de los bienes que adquiera según su debida diligencia. En estricto cumplimiento del Artículo 391 del Código de Comercio de Venezuela, el gestor emite el documento denominado **\"Acta de Liquidación, Rendición de Cuentas y Finiquito de Comisión Mercantil\"**. Este instrumento detalla la suma fiduciaria recibida, la tasa de cambio aplicada, el TXID de la transferencia de los criptoactivos y el desglose del //spread// retenido. Acto seguido **EL COMITENTE** deberá aprobar dicho documento de rendición de cuentas y otorgando finiquito pleno, libre y solvente a favor del gestor. Nace entonces la obligación de **EL COMISIONISTA** emitir su factura fiscal únicamente por el monto de la comisión o diferencial devengado."
    ),
    parrafo(
      "**SEXTA:**  **EL COMISIONISTA** se obliga a tramitar diligentemente todos los procesos de intermediación extrabursátil con la mayor disciplina, celo profesional, inmediatez, sin poner en riesgo la seguridad de sus clientes; pero también, en ejecución de la debida diligencia, podrá ejecutar todas las diligencias que sean necesarias para asegurarse que **EL COMITENTE** está ejerciendo actividades comerciales que no lo expongan a riesgos judiciales en un futuro. Para este fin, se incorpora a este documento, como anexo integrante del mismo, los conceptos, tendencias doctrinales que sustentan este principio de resguardo y seguridad contractual."
    ),
    parrafo(
      "**SEPTIMA:** Ambas partes están de acuerdo que toda notificación, informe de gestión puede hacerse por vía virtual, siempre y cuando quede haya trazabilidad de dichas notificaciones, todo en virtud de las nuevas tendencias jurisprudenciales, que les dan rango legal a las notificaciones por estos medios tecnológicos."
    ),
    parrafo(
      "**OCTAVA:** Las partes eligen como domicilio especial para todos y cada uno de los efectos del presente contrato a la ciudad de San Cristóbal, Estado Táchira y; acuerdan someter cualquier controversia a los Tribunales Mercantiles, dada la actividad que realizan los contratantes.",
      { despues: 1400 }
    ),
    ...firmas([
      { nombre: d.comitente.nombre, cedula: d.comitente.cedula, firma: d.firmaComitente },
      { nombre: d.comisionista.nombre, cedula: d.comisionista.cedula, firma: d.firmaComisionista },
    ]),
  ];
}

/**
 * Las dos firmas lado a lado, como en el contrato: la firma (si se cargó) sobre la línea, el nombre en negrita y la
 * cédula ("Ci: 14.985.239"). En el finiquito va además quién es cada uno (EL CLIENTE, EL GESTOR).
 */
function firmas(partes: { nombre: string; cedula: string; firma?: FirmaImagen | null; rol?: string }[]): (Paragraph | Table)[] {
  const sinBorde = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const celda = (p: (typeof partes)[number]) =>
    new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      borders: { top: sinBorde, bottom: sinBorde, left: sinBorde, right: sinBorde },
      children: [
        // la firma, o el espacio para firmar a mano
        p.firma
          ? new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: p.firma.datos, transformation: { width: p.firma.ancho, height: p.firma.alto } })] })
          : new Paragraph({ children: [new TextRun({ text: " ", font: FUENTE, size: TAMANO })], spacing: { before: 600 } }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "_________________________________", font: FUENTE, size: TAMANO })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children: [new TextRun({ text: vacio(p.nombre), bold: true, font: FUENTE, size: TAMANO })] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Ci: ", bold: true, font: FUENTE, size: TAMANO }), new TextRun({ text: vacio(cedulaConPuntos(p.cedula), "X.XXX.XXX"), font: FUENTE, size: TAMANO })],
        }),
        ...(p.rol ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: p.rol, bold: true, font: FUENTE, size: 20 })] })] : []),
      ],
    });
  return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: partes.map(celda) })] })];
}

function celdaTabla(texto: string, negrita = false, fondo?: string) {
  return new TableCell({
    shading: fondo ? { fill: fondo } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text: texto, bold: negrita, font: FUENTE, size: 20 })] })],
  });
}

function finiquito(d: DatosDocumento, f: Finiquito): (Paragraph | Table)[] {
  const vineta = (texto: string) => new Paragraph({ bullet: { level: 0 }, children: corridas(texto), spacing: { after: 80 } });
  const fila = (cols: string[], cabecera = false) => new TableRow({ children: cols.map((c, i) => celdaTabla(c, cabecera || i === 0, cabecera ? "D9E2F3" : undefined)) });
  return [
    new Paragraph({ children: [new PageBreak()] }),
    parrafo("**ANEXO 3**", { alinear: AlignmentType.CENTER, despues: 60 }),
    parrafo("**COMPROBANTE DE LIQUIDACIÓN Y FINIQUITO DE OPERACIÓN**", { alinear: AlignmentType.CENTER, despues: 240, size: 24 }),
    parrafo(`**N° de Operación:** ${vacio(f.numero)}`, { despues: 60 }),
    parrafo(`**Fecha y Hora:** ${vacio(f.fechaHora)}`, { despues: 200 }),
    parrafo("**1. DATOS DE LAS PARTES**", { despues: 80 }),
    vineta(`**Gestor / Operador:** ${vacio(d.comisionista.nombre)}`),
    vineta(`**Cliente / Beneficiario:** ${vacio(d.comitente.nombre)}`),
    vineta(`**Documento de Identidad:** V-${vacio(cedulaConPuntos(d.comitente.cedula))}`),
    vineta(`**Contacto:** ${vacio(f.contacto)}`),
    parrafo("**2. DETALLE DE LA OPERACIÓN**", { antes: 200, despues: 80 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        fila(["Etapa", "Concepto", "Monto / Tasa", "Referencia / Hash"], true),
        fila(["Paso 1: Recepción", "Bolívares Recibidos (VES)", `Bs. ${vacio(f.bolivares, "0,00")}`, `Ref: ${vacio(f.referencia)}`]),
        fila(["Paso 2: Conversión", "Tasa de Cambio VES → USDT", `${vacio(f.tasaVesUsdt, "0,00")} VES/USDT`, "-"]),
        fila(["", "USDT Adquiridos", `${vacio(f.usdt, "0,00")} USDT`, `Hash/TXID: ${vacio(f.hash, "—")}`]),
        fila(["Paso 3: Venta", "Tasa de Cambio USDT → COP", `$ ${vacio(f.tasaUsdtCop, "0,00")} COP/USDT`, "-"]),
        fila(["", "Subtotal en Pesos", `$ ${vacio(f.subtotalCop, "0,00")} COP`, "-"]),
      ],
    }),
    parrafo("**3. DESGLOSE FINANCIERO Y UTILIDAD / COMISIÓN**", { antes: 240, despues: 80 }),
    vineta(`**Subtotal Bruto en COP:** $ ${vacio(f.subtotalCop, "0,00")} COP`),
    vineta(`**Comisión por Gestión / Servicios (${vacio(f.comisionPct, "X")}%):** - $ ${vacio(f.comisionCop, "0,00")} COP`),
    vineta(`**Comisiones bancarias / de red (si Aplican):** - $ ${vacio(f.bancariasCop, "0,00")} COP`),
    vineta(`**TOTAL NETO A PAGAR AL CLIENTE:** **$ ${vacio(f.netoCop, "0,00")} COP**`),
    parrafo("**4. DETALLE DEL PAGO FINAL (BANCOLOMBIA)**", { antes: 200, despues: 80 }),
    vineta("**Banco Destino:** Bancolombia"),
    vineta(`**Titular de la Cuenta:** ${vacio(f.titular)}`),
    vineta(`**Número de Cuenta:** ${vacio(f.numeroCuenta)}`),
    vineta(`**N° de Comprobante / Referencia Bancolombia:** ${vacio(f.referenciaPago)}`),
    vineta(`**Estado de la Transferencia:** ${vacio(f.estadoPago, "Exitosa / Completada")}`),
    parrafo("**5. DECLARACIÓN DE CONFORMIDAD Y FINIQUITO**", { antes: 200, despues: 80 }),
    parrafo("**Declaración del Cliente:**", { despues: 80 }),
    parrafo(
      `Por medio del presente documento, confirmo la recepción a entera satisfacción del saldo neto en pesos colombianos (**$ ${vacio(f.netoCop, "0,00")} COP**) en la cuenta de Bancolombia indicada, correspondiente a la liquidación final de la conversión de los Bolívares entregados.`
    ),
    parrafo(
      "Declaro que las comisiones y gastos del servicio han sido aplicados y aceptados de común acuerdo, otorgando **finiquito total y definitivo** por esta operación, no quedando reclamaciones ni saldos pendientes entre las partes.",
      { despues: 900 }
    ),
    ...firmas([
      { nombre: d.comitente.nombre, cedula: d.comitente.cedula, firma: d.firmaComitente, rol: "EL CLIENTE" },
      { nombre: d.comisionista.nombre, cedula: d.comisionista.cedula, firma: d.firmaComisionista, rol: "EL GESTOR" },
    ]),
  ];
}

/** Arma el Word y lo devuelve como archivo para descargar. */
export async function generarDocumento(d: DatosDocumento): Promise<Blob> {
  const hijos: (Paragraph | Table)[] = [...contrato(d), ...(d.finiquito ? finiquito(d, d.finiquito) : [])];
  const doc = new Document({
    creator: "Pago Veloz al Cambio",
    title: `Contrato de comisión · ${d.comitente.nombre}`,
    styles: { default: { document: { run: { font: FUENTE, size: TAMANO } } } },
    sections: [{ properties: { page: { margin: { top: 1418, bottom: 1418, left: 1418, right: 1418 } } }, children: hijos }],
  });
  return Packer.toBlob(doc);
}
