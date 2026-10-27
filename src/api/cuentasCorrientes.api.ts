import { api } from "./client";

export interface Canal {
  id: number;
  nombre: string;
}

export interface Categoria {
  id: number;
  nombre: string;
}

export type ModuloCuenta = "CORRIENTE" | "POR_COBRAR" | "POR_PAGAR" | "CAJA";

export interface CuentaCorrienteResumen {
  id: number;
  tercero_id: number;
  tercero_nombre: string;
  tercero_telefono: string | null;
  tercero_identificacion: string | null; // cédula
  // Dónde se lleva: en Cuentas Corrientes, o pasada a Cuentas por Cobrar (poco movimiento)
  modulo: ModuloCuenta;
  referencia: string | null; // dato libre del cliente (Confirmaciones)
  grupo_cobro: string | null; // Cuentas por Cobrar: el grupo en que se lleva ("Cerveloza", "Zelle", "Préstamos"...)
  // Fórmula con la que se le trabaja, guardada con su primer movimiento: por tasa, o con la comisión descontada del monto
  formula: "TASA" | "COMISION" | null;
  comision_pct: string | null;
  // Si se le cobra en otra moneda que la de la contabilidad: cuál y a qué tasa manual (1 de la contabilidad = tasa_cobro de la de cobro)
  moneda_cobro_id: number | null;
  moneda_cobro_codigo: string | null;
  moneda_cobro_decimales: number | null;
  tasa_cobro: string | null;
  canal_id: number;
  canal_nombre: string;
  moneda_id: number;
  moneda_codigo: string;
  saldo_actual: string;
  estado: "DISPONIBLE" | "BLOQUEADA" | "CERRADA";
  tercero_tipo: "CLIENTE" | "PROVEEDOR" | "MIXTO" | "AMIGO" | "EVENTUAL";
  moneda_decimales: number;
  ultimo_movimiento: string | null;
  // Lo de hoy: lo que le vendí (positivo) y lo que me vendió o abonó (negativo)
  // Cuentas que no son en pesos: cuántos pesos vale 1 de su moneda (tasa de cobro o la última usada en los movimientos)
  valor_moneda: string | null;
  // Al buscar: el movimiento de esta cuenta donde apareció lo buscado (una referencia, un MTCN, quién envió)
  movimiento_coincide?: { id: number; descripcion: string; fecha: string; monto: string; cuantos: number } | null;
  vendido_hoy: string;
  abonado_hoy: string;
}

/** Una fila de la hoja: como en el Excel (fecha, referencia, cantidad, tasa, monto, total). */
export interface FilaEstadoCuenta {
  id: number;
  fecha: string;
  descripcion: string | null;
  tipo: string;
  cantidad_base: string | null;
  tasa: string | null;
  tasa_es_porcentaje: boolean; // comisión en %: la tasa viene como fracción (3% = "0.03")
  cuenta_destino: string | null; // a qué cuenta del cliente se le pagó
  // Movimientos que esperan verificación (Western Union): en proceso o ya confirmados. null = no aplica
  estado_confirmacion: "EN_PROCESO" | "CONFIRMADA" | null;
  tiene_comprobante: boolean; // tiene guardada la imagen del comprobante
  pagado_en: string | null; // cuándo se le pagó en Taquilla
  created_at: string; // cuándo se cargó (la fecha del movimiento puede ser otra)
  comision_descontada: boolean; // la tasa es el factor (0.96) de una comisión descontada: se muestra -4%
  comision_incluida: boolean; // el % ya venía sumado en lo enviado: factor 1/1,06, se muestra +6%
  monto: string;
  total: string;
  anulado: boolean;
  reverso_de_id: number | null;
  movimiento_caja_id: number | null;
  usuario_nombre: string;
  // Confirmaciones armadas con varias transferencias: cada una con su fórmula y su captura
  transferencias?: TransferenciaFila[] | null;
  // por dónde se pagó (en taquilla o por otro método, desde una cuenta de la empresa)
  pagado_medio?: "EFECTIVO" | "BANCOLOMBIA" | "OTROS" | null;
  pagado_caja_nombre?: string | null;
  pagado_caja_tipo?: string | null;
  // si un administrador lo corrigió: cuándo y quién
  editado_en?: string | null;
  editado_por_nombre?: string | null;
}

export interface TransferenciaFila {
  id: number;
  orden: number;
  referencia: string | null;
  remitente: string | null;
  cantidad: string;
  formula: "TASA" | "DIVIDIR" | "COMISION" | "DIRECTO";
  valor: string | null;
  resultado: string;
  tiene_comprobante: boolean;
}

export interface EstadoCuenta {
  cuenta: CuentaCorrienteResumen;
  // Cierre de ese día, si ya se cerró
  cierre: { saldo_final: string; created_at: string; usuario_nombre: string } | null;
  // Todos los cierres hechos ese día, en orden (puede haber varios)
  cierres?: { id: number; saldo_final: string; created_at: string; usuario_nombre: string }[];
  // Lo que el cliente envió (la cantidad de cada compra, antes de tasa o comisión): en el día, en toda la cuenta
  // y cuánto de eso todavía no se le pagó
  enviado: string;
  enviadoTotal: string;
  enviadoPorPagar: string;
  saldoAnterior: string;
  movimientos: FilaEstadoCuenta[];
  sumas: string;
  abonos: string;
  saldoFinal: string;
}

export interface MovimientoCC {
  id: number;
  fecha: string;
  descripcion: string | null;
  tipo: string;
  cantidad_base: string | null;
  tasa: string | null;
  monto: string;
  saldo_anterior: string;
  saldo_nuevo: string;
}

export function getCanales() {
  return api.get<Canal[]>("/cuentas-corrientes/canales");
}

export function getCategorias() {
  return api.get<Categoria[]>("/cuentas-corrientes/categorias");
}

export function crearCanal(nombre: string) {
  return api.post<Canal>("/cuentas-corrientes/canales", { nombre });
}

export function actualizarCanal(id: number, cambios: { nombre?: string; activo?: boolean }) {
  return api.put<Canal>(`/cuentas-corrientes/canales/${id}`, cambios);
}

export function crearCuentaCorriente(data: {
  terceroId?: number;
  nuevoTercero?: { nombre: string; tipo: "CLIENTE" | "PROVEEDOR" | "MIXTO" | "AMIGO" | "EVENTUAL"; telefono?: string; identificacion?: string };
  canalId?: number; // sin banco: no es obligatorio
  modulo?: ModuloCuenta;
  referencia?: string;
  grupoCobro?: string; // Cuentas por Cobrar: el grupo del cliente
  usarExistente?: boolean; // Confirmaciones: ya hay un cliente con ese nombre y es el mismo: se usa ese
  monedaCobroId?: number;
  tasaCobro?: string;
  monedaId: number;
  saldoInicial?: string;
}) {
  return api.post<CuentaCorrienteResumen>("/cuentas-corrientes", data);
}

/** Cuentas por Cobrar: pasa al cliente a otro grupo. */
export function cambiarGrupoCobro(id: number, grupo: string | null) {
  return api.put<CuentaCorrienteResumen>(`/cuentas-corrientes/${id}/grupo`, { grupo });
}

/** Baja la hoja como .xlsx y la guarda con el nombre indicado. */
export async function descargarExcelEstadoCuenta(cuentaId: number, rango: { desde?: string; hasta?: string }, nombreArchivo: string) {
  const params = new URLSearchParams();
  if (rango.desde) params.set("desde", rango.desde);
  if (rango.hasta) params.set("hasta", rango.hasta);
  const blob = await api.getBlob(`/cuentas-corrientes/${cuentaId}/excel?${params}`);
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.style.display = "none";
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function getEstadoCuenta(cuentaId: number, rango: { desde?: string; hasta?: string }) {
  const params = new URLSearchParams();
  if (rango.desde) params.set("desde", rango.desde);
  if (rango.hasta) params.set("hasta", rango.hasta);
  return api.get<EstadoCuenta>(`/cuentas-corrientes/${cuentaId}/estado-cuenta?${params}`);
}

export interface TasasRecientes {
  tasas: string[];
  porcentajes: string[];
  tasaHabitual: string | null; // la que queda puesta en el formulario de la cuenta
  referenciaFrecuente: string | null; // la referencia que más se usa con esa persona
}

export function guardarTasaHabitual(cuentaId: number, tasa: string) {
  return api.put<{ tasaHabitual: string }>(`/cuentas-corrientes/${cuentaId}/tasa-habitual`, { tasa });
}

/** Últimas tasas y porcentajes de comisión usados (la más reciente primero). */
export function getTasasRecientes(cuentaId: number) {
  return api.get<TasasRecientes>(`/cuentas-corrientes/${cuentaId}/tasas-recientes`);
}

/** Cierra el día de la cuenta (o lo vuelve a cerrar) y devuelve la hoja de ese día. */
export function cerrarDiaCuenta(cuentaId: number, dia: string) {
  return api.post<EstadoCuenta>(`/cuentas-corrientes/${cuentaId}/cierres`, { dia });
}

export interface MovimientoConNumero {
  id: number;
  fecha: string;
  descripcion: string;
  monto: string;
  tercero_nombre: string;
  canal_nombre?: string; // el medio de pago donde está registrada
}

/**
 * El código de referencia dentro de lo que se escribió (junto al nombre de quien envió): un número de 4 dígitos o más,
 * o un código con letras y números de 5 caracteres o más, como "d1a1kat6i". null si no hay ninguno.
 */
export function codigoDeReferencia(texto: string): string | null {
  return codigosDeReferencia(texto)[0] ?? null;
}

/** Todos los códigos de referencia escritos: cuando el cliente mandó el monto en varias transferencias hay uno por cada una. */
export function codigosDeReferencia(texto: string): string[] {
  const palabras = texto.match(/[A-Za-z0-9-]+/g) ?? [];
  const codigos = palabras.map((p) => p.replace(/^-+|-+$/g, "")).filter((p) => /^\d{4,}$/.test(p) || (/\d/.test(p) && /[A-Za-z]/.test(p) && p.length >= 5));
  return [...new Set(codigos)];
}

/**
 * El movimiento ya registrado con ese número de transferencia, si lo hay.
 * canalId: se busca solo dentro de ese medio de pago. La misma referencia puede existir en Bancolombia y en Nequi,
 * pero no dos veces en el mismo medio. Sin canal se busca en todos.
 */
export async function buscarMovimientoPorNumero(numero: string, canalId?: number) {
  const filtro = canalId ? `?canalId=${canalId}` : "";
  return (await api.get<{ movimiento: MovimientoConNumero | null }>(`/cuentas-corrientes/movimientos/numero/${encodeURIComponent(numero)}${filtro}`)).movimiento;
}

/** Manda un mensaje al cliente por el WhatsApp conectado al sistema. */
export function avisarClienteCuenta(id: number, texto: string, linea: 1 | 2 | 3 = 1) {
  // linea: por cuál de los WhatsApp vinculados sale (1 Bolívares, 2 Pesos, 3 Dólares)
  return api.post<{ ok: true }>(`/cuentas-corrientes/${id}/avisar`, { texto, linea });
}

export interface DatosComprobante {
  referencia: string | null;
  monto: string | null; // decimal normalizado
  moneda: string | null;
  fecha: string | null; // AAAA-MM-DD
  banco: string | null;
  remitente: string | null;
  destinatario?: string | null; // a quién se le envió (lo trae la lectura con IA)
}

/** Lee la imagen de un comprobante con la IA del servidor: referencia, monto y fecha. Responde 501 si no está configurada. */
export function leerComprobanteConIA(imagen: File) {
  const formData = new FormData();
  formData.append("imagen", imagen);
  return api.postForm<DatosComprobante>("/cuentas-corrientes/leer-comprobante", formData);
}

export function eliminarCuentaCorriente(id: number) {
  return api.delete<void>(`/cuentas-corrientes/${id}`);
}

/** Marca como confirmado un movimiento que estaba en proceso de confirmación. */
export function confirmarMovimientoCC(movimientoId: number) {
  return api.post(`/cuentas-corrientes/movimientos/${movimientoId}/confirmar`);
}

export function anularMovimientoCC(movimientoId: number) {
  return api.post(`/cuentas-corrientes/movimientos/${movimientoId}/anular`);
}

export function getCuentasCorrientes(filtros: { terceroId?: number; canalId?: number; buscar?: string; tipoTercero?: string; vista?: "corrientes" | "cobrar" | "pagar" | "cajas" }) {
  const params = new URLSearchParams();
  if (filtros.vista) params.set("vista", filtros.vista);
  if (filtros.terceroId) params.set("terceroId", String(filtros.terceroId));
  if (filtros.canalId) params.set("canalId", String(filtros.canalId));
  if (filtros.buscar?.trim()) params.set("buscar", filtros.buscar.trim());
  if (filtros.tipoTercero) params.set("tipoTercero", filtros.tipoTercero);
  const q = params.toString();
  return api.get<CuentaCorrienteResumen[]>(`/cuentas-corrientes${q ? `?${q}` : ""}`);
}

export function getMovimientosCuentaCorriente(cuentaId: number) {
  return api.get<MovimientoCC[]>(`/cuentas-corrientes/${cuentaId}/movimientos`);
}

interface RegistrarMovimientoInput {
  // la cuenta exacta: el mismo cliente puede tener cuenta en varios módulos con el mismo medio y moneda
  cuentaId?: number;
  terceroId: number;
  canalId: number;
  monedaId: number;
  tipo: "COMPRA" | "VENTA" | "ABONO" | "CARGO" | "AJUSTE";
  monto?: string; // si falta, el backend lo calcula como cantidadBase x tasa
  fecha?: string;
  descripcion?: string;
  cantidadBase?: string;
  monedaBaseId?: number;
  tasa?: string;
  tasaEsPorcentaje?: boolean;
  estadoConfirmacion?: "EN_PROCESO" | "CONFIRMADA"; // la transferencia entra confirmada o queda pendiente
  comisionDescontada?: boolean; // cantidad - comisión %: la tasa va como factor (4% -> "0.96")
  comisionIncluida?: boolean; // el % ya venía sumado en lo enviado: cantidad ÷ (1 + %)
  canalMovimientoId?: number; // Confirmaciones: el medio de ESTE movimiento (el cliente es uno solo, el medio va por movimiento)
  cuentaDestino?: string;
  categoriaId?: number;
  cajaId?: number;
  montoCaja?: string; // con signo: + entra a la caja, - sale
  monedaCajaId?: number; // moneda en la que se mueve la caja (si no es la de la cuenta)
  metodoPagoId?: number;
  // Confirmaciones armadas con varias transferencias
  transferencias?: { referencia?: string; remitente?: string; cantidad: string; formula: "TASA" | "DIVIDIR" | "COMISION" | "DIRECTO"; valor?: string; resultado: string }[];
  totalEnviado?: string; // lo que suman las transferencias, antes de la comisión o la tasa
}

export function registrarMovimientoCC(data: RegistrarMovimientoInput) {
  return api.post<{ movimiento: { id: number }; saldoNuevo: string; transferencias?: { id: number; orden: number }[] }>("/cuentas-corrientes/movimientos", data);
}

/** Corregir un movimiento mal cargado (solo administradores). Lo que no se manda queda como está; null lo vacía. */
export function editarMovimientoCC(movimientoId: number, cambios: { descripcion?: string; fecha?: string; cuentaDestino?: string | null; cantidadBase?: string | null; tasa?: string | null; monto?: string }) {
  return api.put<{ id: number; monto: string; cambio: string }>(`/cuentas-corrientes/movimientos/${movimientoId}`, cambios);
}

/** Confirmaciones: una parte se le paga ya por una cuenta de la empresa; el resto queda para retirar en efectivo en taquilla. */
export function pagarParteConfirmacion(movimientoId: number, cajaId: number, monto: string) {
  return api.post<{ cuenta: string; pagado: string; falta: string; pagoId: number }>(`/cuentas-corrientes/movimientos/${movimientoId}/pagar-parte`, { cajaId, monto });
}

/** Confirmaciones: le paga al cliente por otro método (no pasa a taquilla), desde una cuenta de la empresa. */
export function pagarConfirmacionOtroMetodo(movimientoId: number, cajaId: number) {
  return api.post<{ pagado: true; cuenta: string; pagoId: number }>(`/cuentas-corrientes/movimientos/${movimientoId}/pagar-otro-metodo`, { cajaId });
}

/** Vuelve a activar un movimiento anulado (solo administradores): se quita su contrario y vuelve a contar en el saldo. */
/** Pasa un movimiento cargado en el cliente equivocado a otra cuenta (mismo módulo y moneda). Solo administradores. */
export function moverMovimientoCC(movimientoId: number, cuentaId: number) {
  return api.post<{ id: number; de: string; a: string }>(`/cuentas-corrientes/movimientos/${movimientoId}/mover`, { cuentaId });
}

export function reactivarMovimientoCC(movimientoId: number) {
  return api.post<{ id: number; reactivado: true }>(`/cuentas-corrientes/movimientos/${movimientoId}/reactivar`);
}

/** Guarda la imagen del comprobante con el movimiento ya creado. */
export function subirComprobanteMovimiento(movimientoId: number, imagen: File) {
  const formData = new FormData();
  formData.append("imagen", imagen);
  return api.postForm<{ ok: true }>(`/cuentas-corrientes/movimientos/${movimientoId}/comprobante`, formData);
}

/** Enlace temporal para ver la imagen del comprobante de un movimiento. */
/** La captura de una de las transferencias de una confirmación armada con varias. */
export function subirComprobanteTransferencia(transferenciaId: number, imagen: File) {
  const formData = new FormData();
  formData.append("imagen", imagen);
  return api.postForm<{ ok: true }>(`/cuentas-corrientes/transferencias/${transferenciaId}/comprobante`, formData);
}
export async function getUrlComprobanteTransferencia(transferenciaId: number) {
  return (await api.get<{ url: string }>(`/cuentas-corrientes/transferencias/${transferenciaId}/comprobante`)).url;
}

export async function getUrlComprobante(movimientoId: number) {
  return (await api.get<{ url: string }>(`/cuentas-corrientes/movimientos/${movimientoId}/comprobante`)).url;
}

export function configurarCobroCuenta(id: number, datos: { monedaCobroId: number | null; tasaCobro?: string }) {
  return api.put<CuentaCorrienteResumen>(`/cuentas-corrientes/${id}/cobro`, datos);
}

export function cambiarModuloCuentaCorriente(id: number, modulo: ModuloCuenta) {
  return api.put<CuentaCorrienteResumen>(`/cuentas-corrientes/${id}/modulo`, { modulo });
}

export function cambiarEstadoCuentaCorriente(id: number, estado: "DISPONIBLE" | "BLOQUEADA" | "CERRADA") {
  return api.put<CuentaCorrienteResumen>(`/cuentas-corrientes/${id}/estado`, { estado });
}

interface ResultadoFilaImportacion {
  fila: number;
  tercero: string;
  ok: boolean;
  error?: string;
}

export function importarSaldosIniciales(archivo: File) {
  const formData = new FormData();
  formData.append("archivo", archivo);
  return api.postForm<{ resumen: { exitosas: number; fallidas: number; total: number }; detalle: ResultadoFilaImportacion[] }>(
    "/cuentas-corrientes/importar-saldos-iniciales",
    formData
  );
}
/** Un cliente que ya está en el sistema con el mismo nombre o el mismo teléfono (en cualquier módulo). */
export interface ClienteExistente {
  id: number;
  nombre: string;
  telefono: string | null;
  identificacion: string | null;
  tipo: string;
  mismo_nombre: boolean;
  mismo_telefono: boolean;
  modulos: string[];
}

export function buscarClientesExistentes(nombre: string, telefono: string) {
  const q = new URLSearchParams({ nombre, telefono });
  return api.get<ClienteExistente[]>(`/cuentas-corrientes/clientes-existentes?${q.toString()}`);
}

/** Pasar a Confirmaciones lo que se le debe en Cuentas Corrientes, con comisión o tasa. */
export function enviarAConfirmaciones(
  cuentaId: number,
  d: { monto: string; formula: "DIRECTO" | "COMISION" | "TASA" | "DIVIDIR"; valor?: string; monedaEntregaId: number; canalId: number; descripcion?: string }
) {
  return api.post<{ confirmacionId: number; corrienteId: number; cuentaConfirmacionesId: number; resultado: string; moneda: string }>(`/cuentas-corrientes/${cuentaId}/enviar-a-confirmaciones`, d);
}

/** El texto de una captura leído en el servidor: respaldo cuando el navegador no puede leerla. */
export function leerTextoEnServidor(imagen: File) {
  const formData = new FormData();
  formData.append("imagen", imagen);
  return api.postForm<{ texto: string }>("/cuentas-corrientes/leer-texto", formData);
}
