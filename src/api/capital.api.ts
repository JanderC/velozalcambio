import { api } from "./client";

export interface CajaDelSistema {
  id: number;
  nombre: string;
  tipo: string;
  saldos: { codigo: string; monto: string }[];
}

// Con qué se reconoce una cuenta de la empresa en un capture
export interface DatoBanco {
  id: number;
  tipo: "CUENTA" | "PAGO_MOVIL";
  banco: string | null; // código: 0102 Banco de Venezuela
  numero: string | null;
  cedula: string | null;
  telefono: string | null; // 10 dígitos, sin el 0: 4147320762
}

export interface BancoDelSistema {
  id: number;
  nombre: string;
  moneda: string | null; // la moneda de la cuenta (null en las viejas: se toman como pesos)
  saldos: { codigo: string; monto: string | number }[];
  datos?: DatoBanco[];
}

export interface MovimientoBanco {
  id: number;
  tipo: "INGRESO" | "EGRESO";
  monto: string;
  saldo_nuevo: string;
  observacion: string | null;
  created_at: string;
  codigo: string;
  usuario: string | null;
}

export interface DatosDelSistema {
  cajas: CajaDelSistema[];
  // de cada cliente de Confirmaciones: desde cuándo tiene confirmaciones sin pagar
  sinRetirar?: { cuenta_id: number; desde: string; hasta: string; cantidad: number }[];
  // las cuentas de banco de la empresa y lo que tienen
  bancos?: BancoDelSistema[];
  // confirmaciones que se le deben a clientes y todavía no se pagaron, por moneda
  confirmacionesPorPagar: { codigo: string; total: string; cantidad: number }[];
}

export interface CuadreResumen {
  id: number;
  created_at: string;
  capital_cop: string;
  capital_divisa: string;
  capital_divisa_cop: string;
  nota: string | null;
  usuario_nombre: string;
}

export interface CuadreCompleto extends CuadreResumen {
  datos: Record<string, unknown>;
}

/** Un renglón del libro contable de una cuenta de banco. */
export interface FilaLibro {
  id: number;
  tipo: "INGRESO" | "EGRESO";
  monto: string;
  saldo_nuevo: string;
  observacion: string | null;
  referencia: string | null;
  de_extracto: boolean;
  dia: string;
  created_at: string;
  usuario: string | null; // quién lo registró
  cliente: string | null; // de qué cliente es (si vino de una confirmación)
  movimiento_id: number | null;
  detalle_cliente: string | null;
  anulado: boolean | null;
  en_extracto: boolean; // aparece en un estado de cuenta cargado
  detalle_banco: string | null; // lo que dice el banco de ese movimiento
}
export interface LibroBanco {
  caja: { id: number; nombre: string; moneda: string; saldo: string };
  filas: FilaLibro[];
  totales: { entra: string; sale: string; cantidad: number };
  ultimoExtracto: { desde: string | null; hasta: string | null; saldo_final: string | null; created_at: string } | null;
}
export interface RevisionExtracto {
  caja: { id: number; nombre: string; moneda: string; saldo: string };
  cuenta: string | null;
  desde: string | null;
  hasta: string | null;
  saldoInicial: string | null;
  saldoFinal: string | null;
  totalCreditos: string;
  totalDebitos: string;
  descuadres: { referencia: string; fecha: string; esperado: string; dice: string }[];
  renglones: { referencia: string; fecha: string; descripcion: string; tipo: "NC" | "ND"; monto: string; saldo: string | null; estado: "nuevo" | "en_libro" | "cargado" }[];
  nuevos: number;
  enLibro: number;
  cargados: number;
}
const formExtracto = (cajaId: number, archivo: File) => {
  const f = new FormData();
  f.append("cajaId", String(cajaId));
  f.append("archivo", archivo);
  return f;
};

export const capitalApi = {
  libroBanco: (id: number, f: { desde?: string; hasta?: string; buscar?: string }) => {
    const q = new URLSearchParams();
    if (f.desde) q.set("desde", f.desde);
    if (f.hasta) q.set("hasta", f.hasta);
    if (f.buscar) q.set("buscar", f.buscar);
    return api.get<LibroBanco>(`/capital/bancos/${id}/libro?${q.toString()}`);
  },
  revisarExtracto: (cajaId: number, archivo: File) => api.postForm<RevisionExtracto>("/capital/bancos/extracto/revisar", formExtracto(cajaId, archivo)),
  cargarExtracto: (cajaId: number, archivo: File) =>
    api.postForm<{ cuenta: string; nuevos: number; conciliados: number; yaCargados: number; saldoSistema: string; saldoFinalExtracto: string | null; hasta: string | null }>(
      "/capital/bancos/extracto/cargar",
      formExtracto(cajaId, archivo)
    ),
  sistema: () => api.get<DatosDelSistema>("/capital/sistema"),
  cuadres: () => api.get<CuadreResumen[]>("/capital/cuadres"),
  cuadre: (id: number) => api.get<CuadreCompleto>(`/capital/cuadres/${id}`),
  crearBanco: (nombre: string, moneda: string) => api.post<{ id: number; nombre: string }>("/capital/bancos", { nombre, moneda }),
  cargarSaldoBanco: (id: number, moneda: string, saldo: string) =>
    api.post<{ cuenta: string; antes: string; ahora: string; diferencia: string }>(`/capital/bancos/${id}/saldo`, { moneda, saldo }),
  renombrarBanco: (id: number, nombre: string) => api.put<{ id: number; nombre: string }>(`/capital/bancos/${id}`, { nombre }),
  movimientoBanco: (id: number, d: { tipo: "INGRESO" | "EGRESO"; moneda: string; monto: string; nota: string }) =>
    api.post<{ cuenta: string; antes: string; ahora: string }>(`/capital/bancos/${id}/movimiento`, d),
  movimientosBanco: (id: number) => api.get<MovimientoBanco[]>(`/capital/bancos/${id}/movimientos`),
  datosBanco: (id: number) => api.get<DatoBanco[]>(`/capital/bancos/${id}/datos`),
  agregarDatoBanco: (id: number, d: { tipo: "CUENTA" | "PAGO_MOVIL"; banco?: string; numero?: string; cedula?: string; telefono?: string }) =>
    api.post<DatoBanco>(`/capital/bancos/${id}/datos`, d),
  quitarDatoBanco: (datoId: number) => api.delete<{ quitado: true }>(`/capital/bancos/datos/${datoId}`),
  transferirBancos: (d: { origenId: number; destinoId: number; moneda: string; monto: string; nota?: string }) =>
    api.post<{ de: string; a: string; monto: string; moneda: string }>("/capital/bancos/transferir", d),
  // lo que se va escribiendo (tasas, filas a mano), guardado al instante
  borrador: () => api.get<{ datos: Record<string, unknown>; updated_at: string } | null>("/capital/borrador"),
  guardarBorrador: (datos: Record<string, unknown>) => api.put<{ guardado: true }>("/capital/borrador", { datos }),
  guardar: (cuadre: { datos: Record<string, unknown>; capitalCop: number; capitalDivisa: number; capitalDivisaCop: number; nota?: string }) =>
    api.post<{ id: number; created_at: string }>("/capital/cuadres", cuadre),
};
