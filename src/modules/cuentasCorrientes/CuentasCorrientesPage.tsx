import { useCallback, useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Header } from "../../components/common/Header";
import { useAuth } from "../../auth/useAuth";
import { getCanales, getCuentasCorrientes, type Canal, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import { formatearMonto } from "../../utils/montos";
import { HojaCuenta } from "./HojaCuenta";
import { ImportarSaldosForm } from "./ImportarSaldosForm";
import { NuevaCuentaModal } from "./NuevaCuentaModal";
import "./cuentasCorrientes.css";

const TIPOS: { valor: string; etiqueta: string }[] = [
  { valor: "", etiqueta: "Todos" },
  { valor: "PROVEEDOR", etiqueta: "Proveedores" },
  { valor: "CLIENTE", etiqueta: "Clientes" },
];

function saldoTexto(c: CuentaCorrienteResumen) {
  const negativo = c.saldo_actual.startsWith("-");
  const valor = formatearMonto(negativo ? c.saldo_actual.slice(1) : c.saldo_actual);
  const conMoneda = c.moneda_codigo === "COP" ? `$${valor}` : `${valor} ${c.moneda_codigo}`;
  return negativo ? `- ${conMoneda}` : conMoneda;
}

export function CuentasCorrientesPage() {
  const { usuario } = useAuth();
  const puedeCrear = usuario?.rol === "ADMIN" || usuario?.rol === "ASESOR";
  const [canales, setCanales] = useState<Canal[]>([]);
  const [canalId, setCanalId] = useState<number | "">("");
  const [tipo, setTipo] = useState("");
  const [buscar, setBuscar] = useState("");
  const [cuentas, setCuentas] = useState<CuentaCorrienteResumen[]>([]);
  const [seleccionadaId, setSeleccionadaId] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    getCanales().then(setCanales).catch(() => setCanales([]));
  }, []);

  const cargar = useCallback(async () => {
    try {
      setCuentas(await getCuentasCorrientes({ canalId: canalId || undefined, tipoTercero: tipo || undefined, buscar }));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [canalId, tipo, buscar]);

  useEffect(() => {
    const t = setTimeout(cargar, buscar ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, buscar]);

  const seleccionada = cuentas.find((c) => c.id === seleccionadaId) ?? null;

  return (
    <div className="cc-page">
      <Header />
      <div className="cc-header">
        <div>
          <h1>Cuentas Corrientes</h1>
          <p>La hoja de cada proveedor o cliente: cantidad × tasa = monto, y el total corrido.</p>
        </div>
        <div className="cc-header-acciones">
          {usuario?.rol === "ADMIN" && <ImportarSaldosForm onImportado={cargar} />}
          {puedeCrear && (
            <button className="cc-nueva-cuenta" onClick={() => setCreando(true)}>
              <Plus size={16} /> Nueva cuenta
            </button>
          )}
        </div>
      </div>

      <div className={`cc-layout ${seleccionada ? "con-hoja" : ""}`}>
        <aside className="cc-lista" aria-label="Cuentas">
          <div className="cc-buscar">
            <Search size={15} />
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre" aria-label="Buscar cuenta" />
          </div>
          <div className="cc-filtros">
            <div className="cc-chips" role="tablist">
              {TIPOS.map((t) => (
                <button key={t.valor} role="tab" aria-selected={tipo === t.valor} className={tipo === t.valor ? "activo" : ""} onClick={() => setTipo(t.valor)}>
                  {t.etiqueta}
                </button>
              ))}
            </div>
            <select value={canalId} onChange={(e) => setCanalId(e.target.value ? Number(e.target.value) : "")} aria-label="Canal">
              <option value="">Todos los canales</option>
              {canales.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="cc-form-error cc-pad">{error}</p>}
          {cargando && <p className="cc-lista-aviso">Cargando…</p>}
          {!cargando && cuentas.length === 0 && !error && (
            <p className="cc-lista-aviso">
              {buscar || tipo || canalId ? "Ninguna cuenta coincide." : "Todavía no hay cuentas. Creá la primera con «Nueva cuenta»."}
            </p>
          )}
          <ul className="cc-cuentas">
            {cuentas.map((c) => (
              <li key={c.id}>
                <button className={seleccionadaId === c.id ? "activa" : ""} onClick={() => setSeleccionadaId(c.id)}>
                  <span className="cc-cuenta-nombre">
                    {c.tercero_nombre}
                    {c.estado !== "DISPONIBLE" && <span className={`cc-estado-badge cc-estado-${c.estado.toLowerCase()}`}>{c.estado.toLowerCase()}</span>}
                  </span>
                  <span className={`cc-cuenta-saldo ${c.saldo_actual.startsWith("-") ? "cc-neg" : ""}`}>{saldoTexto(c)}</span>
                  <span className="cc-cuenta-detalle">
                    {c.tercero_tipo === "PROVEEDOR" ? "Proveedor" : c.tercero_tipo === "CLIENTE" ? "Cliente" : "Mixto"}
                    {c.canal_nombre === "SIN_BANCO" ? "" : ` · ${c.canal_nombre.replace(/_/g, " ")}`}
                    {/[1-9]/.test(c.saldo_actual) ? (c.saldo_actual.startsWith("-") ? " · yo le debo" : " · me debe") : ""}
                  </span>
                  <span className="cc-cuenta-detalle derecha">
                    {c.ultimo_movimiento ? new Date(c.ultimo_movimiento).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "sin movimientos"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {seleccionada ? (
          <HojaCuenta key={seleccionada.id} cuenta={seleccionada} onActualizar={cargar} onVolver={() => setSeleccionadaId(null)} />
        ) : (
          <div className="cc-hoja cc-hoja-vacia">
            <p>Elegí una cuenta para ver su hoja y cargar movimientos.</p>
          </div>
        )}
      </div>

      {creando && (
        <NuevaCuentaModal
          canales={canales}
          onCanalCreado={(c) => setCanales((lista) => [...lista, c].sort((a, b) => a.nombre.localeCompare(b.nombre)))}
          onCerrar={() => setCreando(false)}
          onCreada={async (c) => {
            setCreando(false);
            setBuscar("");
            setTipo("");
            setCanalId("");
            await cargar();
            setSeleccionadaId(c.id);
          }}
        />
      )}
    </div>
  );
}
