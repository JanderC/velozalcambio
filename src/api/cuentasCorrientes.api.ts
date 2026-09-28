import { api } from "./client";

export interface Canal {
  id: number;
  nombre: string;
}

export interface Categoria {
  id: number;
  nombre: string;
}

export interface CuentaCorrienteResumen {
  id: number;
  tercero_id: number;
  tercero_nombre: string;
  canal_id: number;
  canal_nombre: string;
  moneda_id: number;
  moneda_codigo: string;
  saldo_actual: string;
  estado: "DISPONIBLE" | "BLOQUEADA" | "CERRADA";
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

export function getCuentasCorrientes(filtros: { terceroId?: number; canalId?: number }) {
  const params = new URLSearchParams();
  if (filtros.terceroId) params.set("terceroId", String(filtros.terceroId));
  if (filtros.canalId) params.set("canalId", String(filtros.canalId));
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
  monto: string;
  descripcion?: string;
  cantidadBase?: string;
  monedaBaseId?: number;
  tasa?: string;
  categoriaId?: number;
  cajaId?: number;
  montoCaja?: string;
  metodoPagoId?: number;
}

export function registrarMovimientoCC(data: RegistrarMovimientoInput) {
  return api.post("/cuentas-corrientes/movimientos", data);
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