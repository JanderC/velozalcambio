import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Header } from "../../components/common/Header";
import { useAuth } from "../../auth/useAuth";
import { Link } from "react-router-dom";
import { crearCuentaCorriente, getCanales, getCuentasCorrientes, type Canal, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import { formatearMonto, multiplicarDecimales, sumarDecimales } from "../../utils/montos";
import { actualizarTercero, type TipoTercero } from "../../api/terceros.api";
import { ApiError } from "../../api/client";
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
  { valor: "EVENTUAL", etiqueta: "Eventuales" },
];

// En Confirmaciones los filtros son los bancos o medios por donde llega la plata, en este orden
const BANCOS_CONFIRMACIONES = ["BOLIVARES", "BANCOLOMBIA", "NEQUI", "USDT", "WESTERN_UNION", "ZELLE"];
const ETIQUETA_BANCO: Record<string, string> = {
  BOLIVARES: "Bolívares",
  BANCOLOMBIA: "Bancolombia",
  NEQUI: "Nequi",
  USDT: "USDT",
  WESTERN_UNION: "Western Union",
  ZELLE: "Zelle",
};

// En Cuentas por Cobrar se filtra por quién le debe a quién
const SENTIDOS: { valor: string; etiqueta: string }[] = [
  { valor: "", etiqueta: "Todos" },
  { valor: "me-deben", etiqueta: "Me deben" },
  { valor: "yo-debo", etiqueta: "Yo debo" },
];

const conSaldo = (c: CuentaCorrienteResumen) => /[1-9]/.test(c.saldo_actual);
// En Confirmaciones el saldo se lee al revés: lo que le compramos al cliente (positivo) es lo que le debemos
const yoDebo = (c: CuentaCorrienteResumen) => conSaldo(c) && c.saldo_actual.startsWith("-") !== (c.modulo === "CAJA");

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
 * - cajas: Confirmaciones. Los clientes que llegan se crean ahí mismo y se llevan con la misma hoja.
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
  // el movimiento encontrado con el buscador: la hoja abre ese día y lo resalta
  const [irA, setIrA] = useState<{ cuentaId: number; id: number; fecha: string; clave: number } | null>(null);
  const abrir = (c: CuentaCorrienteResumen) => {
    setSeleccionadaId(c.id);
    setIrA(c.movimiento_coincide ? { cuentaId: c.id, id: c.movimiento_coincide.id, fecha: c.movimiento_coincide.fecha, clave: Date.now() } : null);
  };
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [personalizando, setPersonalizando] = useState(false);

  // Qué es el cliente (proveedor, cliente, eventual…): se cambia ahí mismo en la lista
  async function cambiarTipo(c: CuentaCorrienteResumen, nuevo: TipoTercero) {
    try {
      await actualizarTercero(c.tercero_id, { tipo: nuevo });
      setCuentas((lista) => lista.map((x) => (x.tercero_id === c.tercero_id ? { ...x, tercero_tipo: nuevo } : x)));
      // con un filtro puesto (ej. Proveedores), el que cambió puede dejar de ir en la lista
      if (tipo) void cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cambiar qué es el cliente.");
    }
  }

  useEffect(() => {
    getCanales().then(setCanales).catch(() => setCanales([]));
  }, []);

  const cargar = useCallback(async () => {
    try {
      // En Confirmaciones el medio elegido arriba NO filtra la lista: el cliente es uno solo aunque cambie de medio.
      // Ese botón solo dice con qué medio entra el próximo movimiento.
      setCuentas(await getCuentasCorrientes({ canalId: modo === "cajas" ? undefined : canalId || undefined, tipoTercero: tipo || undefined, buscar, vista: modo }));
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

  // Cuentas Corrientes: si lo buscado no está acá pero el cliente existe en otro módulo (Cuentas por Cobrar o
  // Confirmaciones), se dice dónde está y se le puede abrir una cuenta corriente sin volver a crearlo
  const [enOtrosModulos, setEnOtrosModulos] = useState<CuentaCorrienteResumen[]>([]);
  const sinResultados = modo === "corrientes" && !cargando && cuentas.length === 0 && buscar.trim().length >= 3;
  useEffect(() => {
    if (!sinResultados) return setEnOtrosModulos([]);
    let vigente = true;
    getCuentasCorrientes({ buscar })
      .then((todas) => vigente && setEnOtrosModulos(todas.filter((c) => c.modulo !== "CORRIENTE")))
      .catch(() => vigente && setEnOtrosModulos([]));
    return () => {
      vigente = false;
    };
  }, [sinResultados, buscar]);
  async function abrirCuentaAqui(c: CuentaCorrienteResumen) {
    try {
      const nueva = await crearCuentaCorriente({ terceroId: c.tercero_id, modulo: "CORRIENTE", monedaId: c.moneda_id });
      await cargar();
      setSeleccionadaId(nueva.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const NOMBRE_MODULO: Record<string, string> = { POR_COBRAR: "Cuentas por Cobrar", CAJA: "Confirmaciones" };
  const RUTA_MODULO: Record<string, string> = { POR_COBRAR: "/cuentas-por-cobrar-pagar", CAJA: "/cajas-confirmaciones" };

  // Totales por moneda: lo que me deben y lo que debo
  const resumen = useMemo(() => {
    const porMoneda = new Map<string, { meDeben: string; debo: string }>();
    for (const c of cuentas) {
      if (!conSaldo(c)) continue;
      const t = porMoneda.get(c.moneda_codigo) ?? { meDeben: "0", debo: "0" };
      const valor = c.saldo_actual.replace(/^-/, "");
      if (yoDebo(c)) t.debo = sumarDecimales(t.debo, valor);
      else t.meDeben = sumarDecimales(t.meDeben, valor);
      porMoneda.set(c.moneda_codigo, t);
    }
    return [...porMoneda.entries()];
  }, [cuentas]);

  // En Cuentas por Cobrar: primero las deudas más grandes
  const visibles = useMemo(() => {
    // En Confirmaciones no se listan todos al entrar: solo lo que se busca
    if (modo === "cajas" && !buscar.trim()) return [];
    if (!enCobrar) return cuentas;
    const filtradas = cuentas.filter((c) => (sentido === "me-deben" ? conSaldo(c) && !yoDebo(c) : sentido === "yo-debo" ? yoDebo(c) : true));
    return [...filtradas].sort((a, b) => Math.abs(Number(b.saldo_actual)) - Math.abs(Number(a.saldo_actual)));
  }, [cuentas, enCobrar, sentido, modo, buscar, canalId]);

  const seleccionada = cuentas.find((c) => c.id === seleccionadaId) ?? null;
  const chips = enCobrar ? SENTIDOS : TIPOS;
  const chipActivo = enCobrar ? sentido : tipo;
  const elegirChip = enCobrar ? setSentido : setTipo;
  // En Confirmaciones se filtra por dónde llega la plata, no por tipo de persona
  const enConfirmaciones = modo === "cajas";
  const bancosConfirmaciones = BANCOS_CONFIRMACIONES.flatMap((nombre) => canales.filter((c) => c.nombre === nombre));

  return (
    <div className="cc-page">
      <Header />
      {enConfirmaciones && (
        <div className="cc-buscador-top">
          <Search size={20} />
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar por nombre, teléfono, cédula o referencia de la transferencia"
            aria-label="Buscar por nombre, teléfono, cédula o referencia de la transferencia"
            autoFocus
          />
        </div>
      )}
      {/* Confirmaciones: los medios van arriba, bajo el buscador. Definen con qué medio entra el movimiento; no filtran clientes. */}
      {enConfirmaciones && (
        <div className="cc-chips cc-medios-top" role="tablist" aria-label="Medio del movimiento">
          <button role="tab" aria-selected={canalId === ""} className={canalId === "" ? "activo" : ""} onClick={() => setCanalId("")} title="El movimiento entra con el medio con que se registró el cliente">
            Medio del cliente
          </button>
          {bancosConfirmaciones.map((c) => (
            <button key={c.id} role="tab" aria-selected={canalId === c.id} className={canalId === c.id ? "activo" : ""} onClick={() => setCanalId(c.id)}>
              {ETIQUETA_BANCO[c.nombre] ?? c.nombre.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      )}
      <div className="cc-header">
        <div>
          <h1>{enCobrar ? "Cuentas por Cobrar / Pagar" : modo === "cajas" ? "Confirmaciones" : "Cuentas Corrientes"}</h1>
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
          {/* En Confirmaciones no hay botón: el cliente se crea debajo de la búsqueda */}
          {puedeCrear && modo !== "cajas" && (
            <button className="cc-nueva-cuenta" onClick={() => setCreando(true)}>
              <Plus size={16} /> Nueva cuenta
            </button>
          )}
        </div>
      </div>

      {/* En Confirmaciones no van las tarjetas de Me deben / Yo debo */}
      {!enConfirmaciones && resumen.length > 0 && (
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

      <div className={`cc-layout ${seleccionada ? "con-hoja" : ""} ${enConfirmaciones ? "con-crear" : ""}`}>
        <aside className="cc-lista" aria-label="Cuentas">
          {!enConfirmaciones && (
            <div className="cc-buscar">
              <Search size={15} />
              <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre" aria-label="Buscar cuenta" />
            </div>
          )}
          {enConfirmaciones ? null : (
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
          )}

          {error && <p className="cc-form-error cc-pad">{error}</p>}
          {cargando && <p className="cc-lista-aviso">Cargando…</p>}
          {!cargando && visibles.length === 0 && !error && (
            <p className="cc-lista-aviso">
              {buscar || tipo || sentido || (canalId && modo !== "cajas")
                ? modo === "cajas"
                  ? "No hay ningún cliente con ese dato."
                  : "Ninguna cuenta coincide en Cuentas Corrientes."
                : enCobrar
                  ? "Nadie debe ni se le debe por ahora. Las cuentas con saldo aparecen acá solas."
                  : modo === "cajas"
                    ? "Buscá arriba por nombre, teléfono, cédula o referencia de la transferencia."
                    : "Todavía no hay cuentas. Creá la primera con «Nueva cuenta»."}
            </p>
          )}
          {enOtrosModulos.length > 0 && (
            <div className="cc-otros-modulos">
              <p>Está registrado en otro módulo:</p>
              <ul>
                {enOtrosModulos.map((c) => (
                  <li key={c.id}>
                    <span>
                      <b>{c.tercero_nombre}</b>
                      <small>
                        {NOMBRE_MODULO[c.modulo] ?? c.modulo}
                        {c.grupo_cobro ? ` · ${c.grupo_cobro}` : ""} · {c.moneda_codigo} · saldo {formatearMonto(c.saldo_actual)}
                      </small>
                    </span>
                    <span className="cc-otros-modulos-acciones">
                      {puedeCrear && (
                        <button type="button" onClick={() => void abrirCuentaAqui(c)} title="Le abre una cuenta en Cuentas Corrientes al mismo cliente (no se crea de nuevo; lo de allá no se toca)">
                          Abrirle cuenta aquí
                        </button>
                      )}
                      {RUTA_MODULO[c.modulo] && <Link to={RUTA_MODULO[c.modulo]!}>Ver allá</Link>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul className="cc-cuentas">
            {visibles.map((c) => (
              <li key={c.id}>
                {/* la fila es un div (no un botón) para que el selector de qué es el cliente funcione adentro */}
                <div
                  role="button"
                  tabIndex={0}
                  className={`cc-fila-cuenta ${seleccionadaId === c.id ? "activa" : ""}`}
                  onClick={() => abrir(c)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      abrir(c);
                    }
                  }}
                >
                  <span className="cc-cuenta-nombre">
                    {c.tercero_nombre}
                    {c.estado !== "DISPONIBLE" && <span className={`cc-estado-badge cc-estado-${c.estado.toLowerCase()}`}>{c.estado.toLowerCase()}</span>}
                    {enCobrar && c.modulo === "POR_COBRAR" && <span className="cc-estado-badge cc-estado-cobrar">solo por cobrar</span>}
                  </span>
                  <span className={`cc-cuenta-saldo ${yoDebo(c) ? "cc-neg" : ""}`}>{montoTexto(c.modulo === "CAJA" ? c.saldo_actual.replace(/^-/, "") : c.saldo_actual, c.moneda_codigo)}</span>
                  <span className="cc-cuenta-detalle">
                    {puedeCrear && !enConfirmaciones ? (
                      <select
                        className="cc-tipo-rapido"
                        value={c.tercero_tipo}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        onChange={(e) => void cambiarTipo(c, e.target.value as TipoTercero)}
                        aria-label={`Qué es ${c.tercero_nombre}`}
                        title="Cambiar qué es: proveedor, cliente, eventual…"
                      >
                        <option value="PROVEEDOR">Proveedor</option>
                        <option value="CLIENTE">Cliente</option>
                        <option value="EVENTUAL">Eventual</option>
                        <option value="AMIGO">Amigo</option>
                        <option value="MIXTO">Mixto</option>
                      </select>
                    ) : c.tercero_tipo === "PROVEEDOR" ? (
                      "Proveedor"
                    ) : c.tercero_tipo === "CLIENTE" ? (
                      "Cliente"
                    ) : c.tercero_tipo === "AMIGO" ? (
                      "Amigo"
                    ) : c.tercero_tipo === "EVENTUAL" ? (
                      "Eventual"
                    ) : (
                      "Mixto"
                    )}
                    {c.canal_nombre === "SIN_BANCO" ? "" : ` · ${c.canal_nombre.replace(/_/g, " ")}`}
                    {enConfirmaciones && c.tercero_telefono ? ` · ${c.tercero_telefono}` : ""}
                    {enConfirmaciones && c.tercero_identificacion ? ` · CC ${c.tercero_identificacion}` : ""}
                    {c.referencia ? ` · ${c.referencia}` : ""}
                    {conSaldo(c) ? (yoDebo(c) ? " · yo le debo" : " · me debe") : ""}
                  </span>
                  <span className="cc-cuenta-detalle derecha">
                    {c.ultimo_movimiento ? new Date(c.ultimo_movimiento).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "sin movimientos"}
                  </span>
                  {c.movimiento_coincide && (
                    <span className="cc-cuenta-coincide">
                      {c.movimiento_coincide.cuantos > 1 ? `Está en ${c.movimiento_coincide.cuantos} movimientos, el último: ` : "Está en: "}<b>{c.movimiento_coincide.descripcion}</b> ·{" "}
                      {new Date(c.movimiento_coincide.fecha).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "2-digit" })} ·{" "}
                      {montoTexto(c.movimiento_coincide.monto.replace(/^-/, ""), c.moneda_codigo)} · <u>ver el movimiento</u>
                    </span>
                  )}
                  {c.valor_moneda && c.modulo !== "CAJA" && (
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
                      Hoy: {c.modulo === "CAJA" ? "le compramos" : "le vendí"} <b>{montoTexto(c.vendido_hoy, c.moneda_codigo)}</b> · {c.modulo === "CAJA" ? "le vendimos" : "me vendió o abonó"} <b>{montoTexto(c.abonado_hoy.replace(/^-/, ""), c.moneda_codigo)}</b>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </aside>

        {seleccionada ? (
          <HojaCuenta
            key={seleccionada.id}
            cuenta={seleccionada}
            irA={irA && irA.cuentaId === seleccionada.id ? irA : null}
            onActualizar={cargar}
            onVolver={() => setSeleccionadaId(null)}
            medio={enConfirmaciones ? (canales.find((c) => c.id === canalId) ?? null) : null}
            medios={enConfirmaciones ? bancosConfirmaciones : []}
            onElegirMedio={setCanalId}
            // el movimiento se entregó en otra moneda: se abre la cuenta del mismo cliente en esa moneda (buscándolo por nombre)
            onAbrirCuenta={(id) => {
              setBuscar(seleccionada.tercero_nombre);
              setSeleccionadaId(id);
              void cargar();
            }}
          />
        ) : enConfirmaciones && puedeCrear ? (
          // Confirmaciones: sin cliente abierto, el formulario para registrar uno nuevo está siempre a la vista
          <div className="cc-hoja cc-crear-panel">
            <NuevaCuentaModal
              enLinea
              canales={canales}
              modulo="CAJA"
              medio={canales.find((c) => c.id === canalId) ?? null}
              onPersonalizar={() => setPersonalizando(true)}
              onCerrar={() => {}}
              onCreada={async (c) => {
                await cargar();
                setSeleccionadaId(c.id);
              }}
            />
          </div>
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
