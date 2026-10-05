import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Header } from "../../components/common/Header";
import { useAuth } from "../../auth/useAuth";
import { getCanales, getCuentasCorrientes, type Canal, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import { formatearMonto, multiplicarDecimales, sumarDecimales } from "../../utils/montos";
import { CajasResumen } from "./CajasResumen";
import { HojaCuenta } from "./HojaCuenta";
import { ImportarSaldosForm } from "./ImportarSaldosForm";
import { NuevaCuentaModal } from "./NuevaCuentaModal";
import { PersonalizarCanalesModal } from "./PersonalizarCanalesModal";
import "./cuentasCorrientes.css";

const TIPOS: { valor: string; etiqueta: string }[] = [
  { valor: "", etiqueta: "Todos" },
  { valor: "PROVEEDOR", etiqueta: "Proveedores" },
  { valor: "CLIENTE", etiqueta: "Clientes" },
  { valor: "AMIGO", etiqueta: "Amigos" },
];

// En Cuentas por Cobrar se filtra por quién le debe a quién
const SENTIDOS: { valor: string; etiqueta: string }[] = [
  { valor: "", etiqueta: "Todos" },
  { valor: "me-deben", etiqueta: "Me deben" },
  { valor: "yo-debo", etiqueta: "Yo debo" },
];

const conSaldo = (c: CuentaCorrienteResumen) => /[1-9]/.test(c.saldo_actual);
const yoDebo = (c: CuentaCorrienteResumen) => conSaldo(c) && c.saldo_actual.startsWith("-");

function montoTexto(valor: string, moneda: string) {
  const negativo = valor.startsWith("-");
  const numero = formatearMonto(negativo ? valor.slice(1) : valor);
  const conMoneda = moneda === "COP" ? `$${numero}` : `${numero} ${moneda}`;
  return negativo ? `- ${conMoneda}` : conMoneda;
}

/**
 * La misma pantalla sirve a dos módulos:
 * - corrientes: las cuentas de movimiento diario.
 * - cobrar: Cuentas por Cobrar / Pagar. Se alimenta de las mismas cuentas: toda la que tenga saldo
 *   (me deben o yo debo) más las que se pasaron para allá por ser de poco movimiento.
 * - cajas: Cajas y Confirmaciones. Los clientes que llegan se crean ahí mismo y se llevan con la misma hoja.
 */
export function CuentasCorrientesPage({ modo = "corrientes" }: { modo?: "corrientes" | "cobrar" | "cajas" }) {
  const { usuario } = useAuth();
  const puedeCrear = usuario?.rol === "ADMIN" || usuario?.rol === "ASESOR";
  const enCobrar = modo === "cobrar";
  const [canales, setCanales] = useState<Canal[]>([]);
  const [canalId, setCanalId] = useState<number | "">("");
  const [tipo, setTipo] = useState("");
  const [sentido, setSentido] = useState("");
  const [buscar, setBuscar] = useState("");
  const [cuentas, setCuentas] = useState<CuentaCorrienteResumen[]>([]);
  const [seleccionadaId, setSeleccionadaId] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [personalizando, setPersonalizando] = useState(false);

  useEffect(() => {
    getCanales().then(setCanales).catch(() => setCanales([]));
  }, []);

  const cargar = useCallback(async () => {
    try {
      setCuentas(await getCuentasCorrientes({ canalId: canalId || undefined, tipoTercero: tipo || undefined, buscar, vista: modo }));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [canalId, tipo, buscar, modo]);

  useEffect(() => {
    const t = setTimeout(cargar, buscar ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, buscar]);

  // Totales por moneda: lo que me deben y lo que debo
  const resumen = useMemo(() => {
    const porMoneda = new Map<string, { meDeben: string; debo: string }>();
    for (const c of cuentas) {
      if (!conSaldo(c)) continue;
      const t = porMoneda.get(c.moneda_codigo) ?? { meDeben: "0", debo: "0" };
      if (yoDebo(c)) t.debo = sumarDecimales(t.debo, c.saldo_actual.slice(1));
      else t.meDeben = sumarDecimales(t.meDeben, c.saldo_actual);
      porMoneda.set(c.moneda_codigo, t);
    }
    return [...porMoneda.entries()];
  }, [cuentas]);

  // En Cuentas por Cobrar: primero las deudas más grandes
  const visibles = useMemo(() => {
    if (!enCobrar) return cuentas;
    const filtradas = cuentas.filter((c) => (sentido === "me-deben" ? conSaldo(c) && !yoDebo(c) : sentido === "yo-debo" ? yoDebo(c) : true));
    return [...filtradas].sort((a, b) => Math.abs(Number(b.saldo_actual)) - Math.abs(Number(a.saldo_actual)));
  }, [cuentas, enCobrar, sentido]);

  const seleccionada = cuentas.find((c) => c.id === seleccionadaId) ?? null;
  const chips = enCobrar ? SENTIDOS : TIPOS;
  const chipActivo = enCobrar ? sentido : tipo;
  const elegirChip = enCobrar ? setSentido : setTipo;

  return (
    <div className="cc-page">
      <Header />
      <div className="cc-header">
        <div>
          <h1>{enCobrar ? "Cuentas por Cobrar / Pagar" : modo === "cajas" ? "Cajas y Confirmaciones" : "Cuentas Corrientes"}</h1>
          <p>
            {enCobrar
              ? "Quién me debe y a quién le debo, con las mismas cuentas de Cuentas Corrientes."
              : modo === "cajas"
                ? "Los clientes que llegan: se crean acá, se les lleva la cuenta y se les confirma lo recibido."
                : "La hoja de cada proveedor o cliente: cantidad × tasa = monto, y el total corrido."}
          </p>
        </div>
        <div className="cc-header-acciones">
          {modo === "corrientes" && usuario?.rol === "ADMIN" && <ImportarSaldosForm onImportado={cargar} />}
          {puedeCrear && (
            <button className="cc-nueva-cuenta" onClick={() => setCreando(true)}>
              <Plus size={16} /> {modo === "cajas" ? "Nuevo cliente" : "Nueva cuenta"}
            </button>
          )}
        </div>
      </div>

      {modo === "cajas" && <CajasResumen />}

      {resumen.length > 0 && (
        <div className="cc-resumen">
          {resumen.flatMap(([moneda, t]) => [
            <div key={`${moneda}-me-deben`}>
              <span>Me deben · {moneda}</span>
              <strong>{montoTexto(t.meDeben, moneda)}</strong>
            </div>,
            <div key={`${moneda}-debo`} className="debo">
              <span>Yo debo · {moneda}</span>
              <strong>{montoTexto(t.debo, moneda)}</strong>
            </div>,
          ])}
        </div>
      )}

      <div className={`cc-layout ${seleccionada ? "con-hoja" : ""}`}>
        <aside className="cc-lista" aria-label="Cuentas">
          <div className="cc-buscar">
            <Search size={15} />
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre" aria-label="Buscar cuenta" />
          </div>
          <div className="cc-filtros">
            <div className="cc-chips" role="tablist">
              {chips.map((t) => (
                <button key={t.valor} role="tab" aria-selected={chipActivo === t.valor} className={chipActivo === t.valor ? "activo" : ""} onClick={() => elegirChip(t.valor)}>
                  {t.etiqueta}
                </button>
              ))}
            </div>
            <select value={canalId} onChange={(e) => (e.target.value === "personalizar" ? setPersonalizando(true) : setCanalId(e.target.value ? Number(e.target.value) : ""))} aria-label="Canal">
              <option value="">Todos los canales</option>
              {canales.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre.replace(/_/g, " ")}
                </option>
              ))}
              {puedeCrear && <option value="personalizar">Personalizar…</option>}
            </select>
          </div>

          {error && <p className="cc-form-error cc-pad">{error}</p>}
          {cargando && <p className="cc-lista-aviso">Cargando…</p>}
          {!cargando && visibles.length === 0 && !error && (
            <p className="cc-lista-aviso">
              {buscar || tipo || sentido || canalId
                ? "Ninguna cuenta coincide."
                : enCobrar
                  ? "Nadie debe ni se le debe por ahora. Las cuentas con saldo aparecen acá solas."
                  : modo === "cajas"
                    ? "Todavía no hay clientes. Creá el primero con «Nuevo cliente»."
                    : "Todavía no hay cuentas. Creá la primera con «Nueva cuenta»."}
            </p>
          )}
          <ul className="cc-cuentas">
            {visibles.map((c) => (
              <li key={c.id}>
                <button className={seleccionadaId === c.id ? "activa" : ""} onClick={() => setSeleccionadaId(c.id)}>
                  <span className="cc-cuenta-nombre">
                    {c.tercero_nombre}
                    {c.estado !== "DISPONIBLE" && <span className={`cc-estado-badge cc-estado-${c.estado.toLowerCase()}`}>{c.estado.toLowerCase()}</span>}
                    {enCobrar && c.modulo === "POR_COBRAR" && <span className="cc-estado-badge cc-estado-cobrar">solo por cobrar</span>}
                  </span>
                  <span className={`cc-cuenta-saldo ${c.saldo_actual.startsWith("-") ? "cc-neg" : ""}`}>{montoTexto(c.saldo_actual, c.moneda_codigo)}</span>
                  <span className="cc-cuenta-detalle">
                    {c.tercero_tipo === "PROVEEDOR" ? "Proveedor" : c.tercero_tipo === "CLIENTE" ? "Cliente" : c.tercero_tipo === "AMIGO" ? "Amigo" : "Mixto"}
                    {c.canal_nombre === "SIN_BANCO" ? "" : ` · ${c.canal_nombre.replace(/_/g, " ")}`}
                    {c.referencia ? ` · ${c.referencia}` : ""}
                    {conSaldo(c) ? (yoDebo(c) ? " · yo le debo" : " · me debe") : ""}
                  </span>
                  <span className="cc-cuenta-detalle derecha">
                    {c.ultimo_movimiento ? new Date(c.ultimo_movimiento).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "sin movimientos"}
                  </span>
                  {c.valor_moneda && (
                    <span className="cc-cuenta-hoy">
                      1 {c.moneda_codigo} = ${formatearMonto(c.valor_moneda)}
                      {conSaldo(c) && (
                        <>
                          {" "}
                          · en pesos <b>{montoTexto(multiplicarDecimales(c.saldo_actual, c.valor_moneda, 0), "COP")}</b>
                        </>
                      )}
                    </span>
                  )}
                  {(/[1-9]/.test(c.vendido_hoy) || /[1-9]/.test(c.abonado_hoy)) && (
                    <span className="cc-cuenta-hoy">
                      Hoy: le vendí <b>{montoTexto(c.vendido_hoy, c.moneda_codigo)}</b> · me vendió o abonó <b>{montoTexto(c.abonado_hoy.replace(/^-/, ""), c.moneda_codigo)}</b>
                    </span>
                  )}
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
          modulo={enCobrar ? "POR_COBRAR" : modo === "cajas" ? "CAJA" : "CORRIENTE"}
          onPersonalizar={() => setPersonalizando(true)}
          onCerrar={() => setCreando(false)}
          onCreada={async (c) => {
            setCreando(false);
            setBuscar("");
            setTipo("");
            setSentido("");
            setCanalId("");
            await cargar();
            setSeleccionadaId(c.id);
          }}
        />
      )}
      {personalizando && (
        <PersonalizarCanalesModal
          canales={canales}
          onCambio={(lista) => {
            setCanales(lista);
            if (canalId !== "" && !lista.some((c) => c.id === canalId)) setCanalId("");
          }}
          onCerrar={() => setPersonalizando(false)}
        />
      )}
    </div>
  );
}
