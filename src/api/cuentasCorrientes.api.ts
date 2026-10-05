import { api } from "./client";

export interface Canal {
  id: number;
  nombre: string;
}

export interface Categoria {
  id: number;
  nombre: string;
}

export type ModuloCuenta = "CORRIENTE" | "POR_COBRAR" | "CAJA";

export interface CuentaCorrienteResumen {
  id: number;
  tercero_id: number;
  tercero_nombre: string;
  tercero_telefono: string | null;
  tercero_identificacion: string | null; // cédula
  // Dónde se lleva: en Cuentas Corrientes, o pasada a Cuentas por Cobrar (poco movimiento)
  modulo: ModuloCuenta;
  referencia: string | null; // dato libre del cliente (Confirmaciones)
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
  tercero_tipo: "CLIENTE" | "PROVEEDOR" | "MIXTO" | "AMIGO";
  moneda_decimales: number;
  ultimo_movimiento: string | null;
  // Lo de hoy: lo que le vendí (positivo) y lo que me vendió o abonó (negativo)
  // Cuentas que no son en pesos: cuántos pesos vale 1 de su moneda (tasa de cobro o la última usada en los movimientos)
  valor_moneda: string | null;
  // Al buscar: el movimiento de esta cuenta donde apareció lo buscado (una referencia, un MTCN, quién envió)
  movimiento_coincide?: { descripcion: string; fecha: string; monto: string } | null;
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
  comision_descontada: boolean; // la tasa es el factor (0.96) de una comisión descontada: se muestra -4%
  monto: string;
  total: string;
  anulado: boolean;
  reverso_de_id: number | null;
  movimiento_caja_id: number | null;
  usuario_nombre: string;
}

export interface EstadoCuenta {
  cuenta: CuentaCorrienteResumen;
  // Cierre de ese día, si ya se cerró
  cierre: { saldo_final: string; created_at: string; usuario_nombre: string } | null;
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
  nuevoTercero?: { nombre: string; tipo: "CLIENTE" | "PROVEEDOR" | "MIXTO" | "AMIGO"; telefono?: string; identificacion?: string };
  canalId?: number; // sin banco: no es obligatorio
  modulo?: ModuloCuenta;
  referencia?: string;
  monedaCobroId?: number;
  tasaCobro?: string;
  monedaId: number;
  saldoInicial?: string;
}) {
  return api.post<CuentaCorrienteResumen>("/cuentas-corrientes", data);
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
}

/**
 * El código de referencia dentro de lo que se escribió (junto al nombre de quien envió): un número de 4 dígitos o más,
 * o un código con letras y números de 5 caracteres o más, como "d1a1kat6i". null si no hay ninguno.
 */
export function codigoDeReferencia(texto: string): string | null {
  const palabras = texto.match(/[A-Za-z0-9-]+/g) ?? [];
  return palabras.map((p) => p.replace(/^-+|-+$/g, "")).find((p) => /^\d{4,}$/.test(p) || (/\d/.test(p) && /[A-Za-z]/.test(p) && p.length >= 5)) ?? null;
}

/** El movimiento ya registrado con ese número de transferencia, si lo hay. */
export async function buscarMovimientoPorNumero(numero: string) {
  return (await api.get<{ movimiento: MovimientoConNumero | null }>(`/cuentas-corrientes/movimientos/numero/${encodeURIComponent(numero)}`)).movimiento;
}

/** Manda un mensaje al cliente por el WhatsApp conectado al sistema. */
export function avisarClienteCuenta(id: number, texto: string) {
  return api.post<{ ok: true }>(`/cuentas-corrientes/${id}/avisar`, { texto });
}

export interface DatosComprobante {
  referencia: string | null;
  monto: string | null; // decimal normalizado
  moneda: string | null;
  fecha: string | null; // AAAA-MM-DD
  banco: string | null;
  remitente: string | null;
}

/** Lee la imagen de un comprobante: referencia, monto y fecha de la transacción. */
export function leerComprobante(imagen: File) {
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

export function getCuentasCorrientes(filtros: { terceroId?: number; canalId?: number; buscar?: string; tipoTercero?: string; vista?: "corrientes" | "cobrar" | "cajas" }) {
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
  cuentaDestino?: string;
  categoriaId?: number;
  cajaId?: number;
  montoCaja?: string; // con signo: + entra a la caja, - sale
  monedaCajaId?: number; // moneda en la que se mueve la caja (si no es la de la cuenta)
  metodoPagoId?: number;
}

export function registrarMovimientoCC(data: RegistrarMovimientoInput) {
  return api.post<{ movimiento: { id: number }; saldoNuevo: string }>("/cuentas-corrientes/movimientos", data);
}

/** Guarda la imagen del comprobante con el movimiento ya creado. */
export function subirComprobanteMovimiento(movimientoId: number, imagen: File) {
  const formData = new FormData();
  formData.append("imagen", imagen);
  return api.postForm<{ ok: true }>(`/cuentas-corrientes/movimientos/${movimientoId}/comprobante`, formData);
}

/** Enlace temporal para ver la imagen del comprobante de un movimiento. */
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