import { AlignmentType, BorderStyle, Document, Packer, PageBreak, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";

/**
 * El contrato de comisión (intermediación extrabursátil) con el cliente y el comprobante de liquidación y finiquito
 * de una operación (Anexo 3), en un documento Word. Los textos son los de la propuesta de contrato; acá solo se
 * ponen los datos de las partes y de la operación.
 */

export interface Parte {
  nombre: string;
  cedula: string;
  rif: string;
  ciudad: string;
  municipio: string;
  estado: string;
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
  lugarFirma: string;
  fechaFirma: Date;
  finiquito: Finiquito | null; // null: solo el contrato
}

const FUENTE = "Arial";
const vacio = (v: string, relleno = "______________") => (v.trim() ? v.trim() : relleno);

/** "**EL COMITENTE** contrata…" -> los tramos entre ** van en negrita. */
function corridas(texto: string, base: { bold?: boolean; size?: number } = {}) {
  return texto.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((t) =>
    t.startsWith("**") ? new TextRun({ text: t.slice(2, -2), bold: true, font: FUENTE, size: base.size ?? 22 }) : new TextRun({ text: t, bold: base.bold, font: FUENTE, size: base.size ?? 22 })
  );
}
const parrafo = (texto: string, opciones: { alinear?: (typeof AlignmentType)[keyof typeof AlignmentType]; antes?: number; despues?: number; bold?: boolean; size?: number } = {}) =>
  new Paragraph({ children: corridas(texto, { bold: opciones.bold, size: opciones.size }), alignment: opciones.alinear ?? AlignmentType.JUSTIFIED, spacing: { before: opciones.antes ?? 0, after: opciones.despues ?? 160, line: 300 } });

function identificacion(p: Parte) {
  return `**${vacio(p.nombre).toUpperCase()},** venezolano, mayor de edad, titular de la cédula de identidad Nº V.- ${vacio(p.cedula, "X.XXX.XXX")}, inscrito en Registro de Información Fiscal (RIF) ${vacio(p.rif, "J-XXXXXXXX")}, domiciliado en la ciudad de ${vacio(p.ciudad)}, Municipio ${vacio(p.municipio)} del Estado ${vacio(p.estado, "Táchira")}`;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function contrato(d: DatosDocumento): (Paragraph | Table)[] {
  const f = d.fechaFirma;
  return [
    parrafo("**CONTRATO DE COMISIÓN**", { alinear: AlignmentType.CENTER, despues: 280, size: 26 }),
    parrafo(
      `Entre ${identificacion(d.comitente)} y; civilmente hábil, por una parte y quien en lo sucesivo se denominará **EL COMITENTE**; y por la otra el ciudadano, ${identificacion(d.comisionista)} y civilmente hábil; quien en lo sucesivo del presente contrato se denominará **EL COMISIONISTA,** se ha convenido en celebrar el presente contrato de **COMISION** el cual se regirá conforme a las siguientes cláusulas:`
    ),
    parrafo(
      "**PRIMERA: EL COMITENTE** contrata los servicios de intermediación extrabursátil a **EL COMISIONISTA**, para que éste, haciendo uso de sus competencias y saberes, ejecute todas las gestiones necesarias para la adquisición de criptoactivos, commodities y; en fin, cualquier bien tangible e intangible de lícito comercio que permita la legislación venezolana. En consecuencia, el objeto del presente contrato es regular la relación entre los contratantes, para que **EL COMISIONISTA,** pueda actuar en su nombre propio a cuenta y beneficio de **EL COMITENTE,** tal como lo establece el artículo 376 del Código de Comercio. En conclusión, **EL COMISIONISTA,** es quien ejerce actos de comercio en su nombre propio por cuenta de **EL COMITENTE.** Dado que la actividad de compra y custodia temporal de dinero para la adquisición de criptoactivos clasifica a **EL COMISIONISTA** dentro de la categoría de Proveedor de Servicios de Activos Virtuales (PSAV) conforme a la Providencia SUNACRIP N° 044-2021, siendo así sujeto pasivo a la obligación legal de implementar un Sistema Integral de Administración de Riesgos de LC/FT/FPADM (SIAR) soportado en un Enfoque Basado en Riesgo (EBR). A los efectos explicativos de lo anteriormente descrito, ambas partes declaran conocer el contenido y alcance del anexo 1, el cual forma parte del presente contrato y, consta de un (01) folio útil."
    ),
    parrafo(
      "**SEGUNDA:** Para la ejecución del presente contrato **EL COMITENTE** trasladará recursos mediante depósitos bancarios, a las cuentas que para tal fin disponga **EL COMISIONISTA,** previa verificación y disponibilidad operativa de las mismas, de igual forma podrá recibir para el cumplimiento del objeto del presente contrato, dinero en efectivo de lícito comercio y; en general, todo tipo de bien mueble o inmueble. Cuando **EL COMISIONISTA** tenga a su disposición el aporte con el cual se hará el cumplimiento del objeto del presente contrato, procederá a ejecutar operaciones de compra y venta de activos intangibles, dichas operaciones deberán hacerse en tiempo perentorio, para evitar pérdidas económicas por operaciones tardías. El producto de las operaciones son patrimonio de **EL COMITENTE.**"
    ),
    parrafo(
      "**TERCERA:** El presente documento sirve para que **EL COMITENTE** manifiesta, bajo fe de juramento, que los recursos entregados **AL COMISIONISTA** proceden de actividades mercantiles o profesionales lícitas y; que los criptoactivos a adquirir no serán empleados para actividades delictivas previstas en la Ley Orgánica Contra la Delincuencia Organizada y Financiamiento al Terrorismo (LOCDOFT). En consecuencia, **EL COMITENTE asume** la responsabilidad penal, civil y administrativa de manera exclusiva y excluyente sobre la licitud de los fondos fiduciarios que le sean transferidos a **EL COMISIONISTA.** A los efectos explicativos de lo anteriormente descrito, ambas partes declaran conocer el contenido y alcance del anexo 2, el cual forma parte del presente contrato y, consta de dos (02) folios útiles."
    ),
    parrafo(
      "**CUARTA:** Durante la vigencia del presente contrato, **EL COMISIONISTA** obra en nombre propio, pero por cuenta e interés de **EL COMITENTE**. En consecuencia, los recursos fiduciarios que ingresan a la cuenta bancaria de **EL COMISIONISTA** no entran a su patrimonio de forma definitiva ni constituyen una contraprestación por un bien o servicio vendido por él; constituyen entregas de dinero en custodia temporal, destinadas a un fin específico, que no es otro que es el encargo de comprar un bien sea un activo intangible (criptoactivo) y transferirlo a la billetera (wallet) por **EL COMISIONISTA**, o un bien tangible como sería una moneda internacional de libre y lícito comercio. **EL COMISIONISTA** no es responsable de las variaciones imprevistas del mercado, por variaciones en las tasas que afecten los intereses de **EL COMITENTE** cuando escapen a su control y buenas prácticas."
    ),
    parrafo(
      "**QUINTA:** Una vez que **EL COMISIONISTA** haya cumplido con el objeto del presente contrato, deberá reportar por los medios digitales que sean más expeditos a **EL COMITENTE** la ejecución del mandato de este contrato, detallando con precisión la diligencia realizada. Adicionalmente **EL COMISIONISTA,** una vez culmine un mes del año calendario, deberá emitir una factura, la cual deberá contener todas las formalidades fiscales y contables por los servicios prestados durante ese período impositivo. Valga decir que la factura que se hace mención en la presente cláusula será por el margen de ganancia o diferencial cambiario (spread) obtenido entre el monto depositado y el valor de compra de los bienes que adquiera según su debida diligencia. En estricto cumplimiento del Artículo 391 del Código de Comercio de Venezuela, el gestor emite el documento denominado **\"Acta de Liquidación, Rendición de Cuentas y Finiquito de Comisión Mercantil\"**. Este instrumento detalla la suma fiduciaria recibida, la tasa de cambio aplicada, el TXID de la transferencia de los criptoactivos y el desglose del spread retenido. Acto seguido **EL COMITENTE** deberá aprobar dicho documento de rendición de cuentas y otorgando finiquito pleno, libre y solvente a favor del gestor. Nace entonces la obligación de **EL COMISIONISTA** emitir su factura fiscal únicamente por el monto de la comisión o diferencial devengado."
    ),
    parrafo(
      "**SEXTA:** **EL COMISIONISTA** se obliga a tramitar diligentemente todos los procesos de intermediación extrabursátil con la mayor disciplina, celo profesional, inmediatez, sin poner en riesgo la seguridad de sus clientes; pero también, en ejecución de la debida diligencia, podrá ejecutar todas las diligencias que sean necesarias para asegurarse que **EL COMITENTE** está ejerciendo actividades comerciales que no lo expongan a riesgos judiciales en un futuro. Para este fin, se incorpora a este documento, como anexo integrante del mismo, los conceptos, tendencias doctrinales que sustentan este principio de resguardo y seguridad contractual."
    ),
    parrafo(
      "**SEPTIMA:** Ambas partes están de acuerdo que toda notificación, informe de gestión puede hacerse por vía virtual, siempre y cuando haya trazabilidad de dichas notificaciones, todo en virtud de las nuevas tendencias jurisprudenciales, que les dan rango legal a las notificaciones por estos medios tecnológicos."
    ),
    parrafo(
      "**OCTAVA:** Las partes eligen como domicilio especial para todos y cada uno de los efectos del presente contrato a la ciudad de San Cristóbal, Estado Táchira y; acuerdan someter cualquier controversia a los Tribunales Mercantiles, dada la actividad que realizan los contratantes."
    ),
    parrafo(
      `Se hacen dos (02) ejemplares de un mismo tenor y a un solo efecto, en ${vacio(d.lugarFirma, "San Cristóbal")}, a los ${f.getDate()} días del mes de ${MESES[f.getMonth()]} de ${f.getFullYear()}.`,
      { antes: 200, despues: 600 }
    ),
    ...firmas(d.comitente.nombre, d.comitente.cedula, "EL COMITENTE", d.comisionista.nombre, d.comisionista.cedula, "EL COMISIONISTA"),
  ];
}

/** Las dos firmas, lado a lado. */
function firmas(n1: string, c1: string, rol1: string, n2: string, c2: string, rol2: string): (Paragraph | Table)[] {
  const sinBorde = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const celda = (nombre: string, cedula: string, rol: string) =>
    new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      borders: { top: sinBorde, bottom: sinBorde, left: sinBorde, right: sinBorde },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "______________________________", font: FUENTE, size: 22 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: vacio(nombre).toUpperCase(), bold: true, font: FUENTE, size: 20 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `C.I. V.- ${vacio(cedula, "X.XXX.XXX")}`, font: FUENTE, size: 20 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: rol, bold: true, font: FUENTE, size: 20 })] }),
      ],
    });
  return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [celda(n1, c1, rol1), celda(n2, c2, rol2)] })] })];
}

function celdaTabla(texto: string, negrita = false, fondo?: string) {
  return new TableCell({
    shading: fondo ? { fill: fondo } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text: texto, bold: negrita, font: FUENTE, size: 20 })] })],
  });
}

function finiquito(d: DatosDocumento, f: Finiquito): (Paragraph | Table)[] {
  const vineta = (texto: string) => new Paragraph({ bullet: { level: 0 }, children: corridas(texto, { size: 22 }), spacing: { after: 80 } });
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
    vineta(`**Documento de Identidad:** V-${vacio(d.comitente.cedula)}`),
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
      { despues: 600 }
    ),
    ...firmas(d.comitente.nombre, d.comitente.cedula, "EL CLIENTE", d.comisionista.nombre, d.comisionista.cedula, "EL GESTOR"),
  ];
}

/** Arma el Word y lo devuelve como archivo para descargar. */
export async function generarDocumento(d: DatosDocumento): Promise<Blob> {
  const hijos: (Paragraph | Table)[] = [...contrato(d), ...(d.finiquito ? finiquito(d, d.finiquito) : [])];
  const doc = new Document({
    creator: "Pago Veloz al Cambio",
    title: `Contrato de comisión · ${d.comitente.nombre}`,
    sections: [{ properties: { page: { margin: { top: 1300, bottom: 1300, left: 1400, right: 1400 } } }, children: hijos }],
  });
  return Packer.toBlob(doc);
}
