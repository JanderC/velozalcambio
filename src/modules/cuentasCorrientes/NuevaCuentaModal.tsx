import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "../../components/common/Modal";
import { buscarMovimientoPorNumero, crearCuentaCorriente, registrarMovimientoCC, type Canal, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import { buscarTerceros, type Tercero } from "../../api/terceros.api";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { ApiError } from "../../api/client";
import { formatearMonto, leerNumero, multiplicarDecimales } from "../../utils/montos";

const REFERENCIAS_MOVIMIENTO = ["Venta de Zelle", "Venta de bss", "Venta de USDT", "Comisión", "Abono Zelle", "Abono dólares", "Abono efectivo", "Abono transferencia"];

/** Abrir una cuenta: proveedor o cliente (existente o nuevo) + canal de pago + moneda + saldo pendiente inicial. */
export function NuevaCuentaModal({
  canales,
  modulo = "CORRIENTE",
  enLinea = false,
  inicial,
  onPersonalizar,
  onCreada,
  onCerrar,
}: {
  canales: Canal[];
  modulo?: "CORRIENTE" | "POR_COBRAR" | "CAJA";
  // enLinea: el formulario va en la página (sin ventana ni pestañas), siempre para alguien nuevo
  enLinea?: boolean;
  // lo que se está buscando: llena nombre, teléfono o cédula mientras no se hayan escrito a mano
  inicial?: { nombre?: string; telefono?: string; cedula?: string };
  onPersonalizar: () => void;
  onCreada: (c: CuentaCorrienteResumen) => void;
  onCerrar: () => void;
}) {
  const [modo, setModo] = useState<"nuevo" | "existente">("nuevo");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<"PROVEEDOR" | "CLIENTE" | "MIXTO" | "AMIGO">(modulo === "CAJA" ? "CLIENTE" : "PROVEEDOR");
  const [referencia, setReferencia] = useState(""); // dato libre del cliente (Confirmaciones)
  const [cedula, setCedula] = useState("");
  const [telefono, setTelefono] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<Tercero[]>([]);
  const [tercero, setTercero] = useState<Tercero | null>(null);
  const [canalId, setCanalId] = useState<number | "">("");
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [monedaId, setMonedaId] = useState<number | "">("");
  // Moneda en la que se le cobra, si no es la de la contabilidad, y la tasa manual para convertir
  const [monedaCobroId, setMonedaCobroId] = useState<number | "">("");
  const [tasaCobro, setTasaCobro] = useState("");
  const [saldo, setSaldo] = useState("");
  const [saldoNegativo, setSaldoNegativo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMonedas()
      .then((m) => {
        setMonedas(m);
        setMonedaId(m.find((x) => x.codigo === "COP")?.id ?? m[0]?.id ?? "");
      })
      .catch(() => setMonedas([]));
  }, []);

  useEffect(() => {
    if (modo !== "existente" || busqueda.trim().length < 2) return setResultados([]);
    const t = setTimeout(() => {
      buscarTerceros(busqueda.trim()).then(setResultados).catch(() => setResultados([]));
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda, modo]);

  // Lo escrito a mano manda sobre lo que viene de la búsqueda
  const tocado = useRef({ nombre: false, telefono: false, cedula: false });
  useEffect(() => {
    if (!inicial) return;
    if (!tocado.current.nombre) setNombre(inicial.nombre ?? "");
    if (!tocado.current.telefono) setTelefono(inicial.telefono ?? "");
    if (!tocado.current.cedula) setCedula(inicial.cedula ?? "");
  }, [inicial?.nombre, inicial?.telefono, inicial?.cedula]); // eslint-disable-line react-hooks/exhaustive-deps

  const nSaldo = saldo.trim() ? leerNumero(saldo) : null;
  const moneda = monedas.find((m) => m.id === monedaId);

  // Movimiento con el que llega el cliente (solo en la página): cantidad × tasa = monto, o el monto directo si no hay tasa
  const [movReferencia, setMovReferencia] = useState("");
  const [movResta, setMovResta] = useState(false);
  const [movCantidad, setMovCantidad] = useState("");
  const [movTasa, setMovTasa] = useState("");
  const [movMontoDirecto, setMovMontoDirecto] = useState("");
  const [movPersona, setMovPersona] = useState("");
  const movConTasa = movTasa.trim() !== "";
  const nMovCantidad = movCantidad.trim() ? leerNumero(movCantidad)?.replace(/^-/, "") ?? null : null;
  const nMovTasa = movConTasa ? leerNumero(movTasa) : null;
  const nMovDirecto = movMontoDirecto.trim() ? leerNumero(movMontoDirecto)?.replace(/^-/, "") ?? null : null;
  const movMonto = movConTasa ? (nMovCantidad && nMovTasa ? multiplicarDecimales(nMovCantidad, nMovTasa, moneda?.codigo === "COP" ? 0 : 2) : null) : nMovDirecto;
  const hayMovimiento = movCantidad.trim() !== "" || movMontoDirecto.trim() !== "" || movReferencia.trim() !== "";
  function alCambiarMovReferencia(valor: string) {
    setMovReferencia(valor);
    // "Abono ..." resta, como en la hoja; el abono por transferencia se elige a mano
    if (/^\s*(abono|pago)/i.test(valor) && !/transferencia/i.test(valor)) setMovResta(true);
  }
  const monedaCobro = monedaCobroId !== monedaId ? monedas.find((m) => m.id === monedaCobroId) : undefined;
  const nTasaCobro = tasaCobro.trim() ? leerNumero(tasaCobro) : null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (modo === "nuevo" && nombre.trim().length < 2) return setError("Escribí el nombre.");
    if (modo === "existente" && !tercero) return setError("Buscá y elegí a quién le abrís la cuenta.");
    if (monedaId === "") return setError("Elegí la moneda.");
    if (monedaCobro && (!nTasaCobro || !/[1-9]/.test(nTasaCobro) || nTasaCobro.startsWith("-"))) return setError("Para cobrar en otra moneda escribí la tasa.");
    if (saldo.trim() && !nSaldo) return setError("El saldo inicial no es un número válido.");
    // El movimiento es opcional, pero si se empezó a llenar tiene que estar completo
    const conMovimiento = enLinea && hayMovimiento;
    if (conMovimiento) {
      if (!movReferencia.trim()) return setError("Escribí la referencia del movimiento (qué es).");
      if (movConTasa && (!nMovTasa || !/[1-9]/.test(nMovTasa) || nMovTasa.startsWith("-"))) return setError("La tasa del movimiento no es un número válido.");
      if (movConTasa && !nMovCantidad) return setError("Con tasa hace falta la cantidad.");
      if (!movMonto || !/[1-9]/.test(movMonto)) return setError("Escribí cantidad y tasa, o el monto directo del movimiento.");
      if (/zelle/i.test(movReferencia) && movPersona.trim().length < 2) return setError("Si es por Zelle hace falta el nombre de quien envió la transferencia.");
    }

    setEnviando(true);
    try {
      // Un número de transferencia no se registra dos veces
      const numero = conMovimiento ? (movPersona.match(/\d{4,30}/)?.[0] ?? null) : null;
      if (numero) {
        const ya = await buscarMovimientoPorNumero(numero).catch(() => null);
        if (ya) return setError(`Ya hay un movimiento con el número ${numero}: "${ya.descripcion}" de ${ya.tercero_nombre}. No se puede registrar dos veces.`);
      }
      const cuenta = await crearCuentaCorriente({
        ...(modo === "existente" ? { terceroId: tercero!.id } : { nuevoTercero: { nombre: nombre.trim(), tipo, telefono: telefono.trim() || undefined, identificacion: cedula.trim() || undefined } }),
        canalId: canalId === "" ? undefined : canalId,
        modulo,
        referencia: referencia.trim() || undefined,
        ...(monedaCobro ? { monedaCobroId: monedaCobro.id, tasaCobro: nTasaCobro! } : {}),
        monedaId,
        saldoInicial: nSaldo ? `${saldoNegativo ? "-" : ""}${nSaldo.replace(/^-/, "")}` : undefined,
      });
      // El cliente ya existe: ahora su movimiento. Si falla, el cliente queda creado y se avisa.
      let errorMovimiento: string | null = null;
      if (conMovimiento) {
        const signo = movResta ? "-" : "";
        try {
          await registrarMovimientoCC({
            terceroId: cuenta.tercero_id,
            canalId: cuenta.canal_id,
            monedaId: cuenta.moneda_id,
            tipo: movResta ? "ABONO" : "CARGO",
            descripcion: movPersona.trim() ? `${movReferencia.trim()} · ${movPersona.trim()}` : movReferencia.trim(),
            ...(movConTasa ? { cantidadBase: `${signo}${nMovCantidad!}`, tasa: nMovTasa! } : { monto: `${signo}${movMonto!}` }),
          });
        } catch (err) {
          errorMovimiento = err instanceof ApiError ? err.message : "no se pudo guardar";
        }
      }
      if (enLinea) {
        if (!errorMovimiento) {
          setMovReferencia("");
          setMovResta(false);
          setMovCantidad("");
          setMovTasa("");
          setMovMontoDirecto("");
          setMovPersona("");
        } else {
          setError(`El cliente se creó, pero el movimiento no se guardó (${errorMovimiento}). Cargalo desde su hoja.`);
        }
        // el formulario sigue en la página: queda limpio para el siguiente cliente
        tocado.current = { nombre: false, telefono: false, cedula: false };
        setNombre("");
        setTelefono("");
        setCedula("");
        setReferencia("");
        setSaldo("");
      }
      onCreada(cuenta);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la cuenta.");
    } finally {
      setEnviando(false);
    }
  }

  const formulario = (
      <form className="cc-modal" onSubmit={guardar}>
        {!enLinea && (
          <div className="cc-segmento" role="tablist">
            <button type="button" role="tab" aria-selected={modo === "nuevo"} className={modo === "nuevo" ? "activo" : ""} onClick={() => setModo("nuevo")}>
              Crear nuevo
            </button>
            <button type="button" role="tab" aria-selected={modo === "existente"} className={modo === "existente" ? "activo" : ""} onClick={() => setModo("existente")}>
              Ya está en el sistema
            </button>
          </div>
        )}

        {modo === "nuevo" ? (
          <>
            <label>
              Nombre
              <input
                value={nombre}
                onChange={(e) => {
                  tocado.current.nombre = true;
                  setNombre(e.target.value);
                }}
                placeholder="ej. Daniel"
                autoFocus={!enLinea}
              />
            </label>
            <div className="cc-modal-fila">
              {!enLinea && (
                <label>
                  Es
                  <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
                    <option value="PROVEEDOR">Proveedor</option>
                    <option value="CLIENTE">Cliente</option>
                    <option value="MIXTO">Cliente y proveedor</option>
                    <option value="AMIGO">Amigo</option>
                  </select>
                </label>
              )}
              <label>
                {modulo === "CAJA" ? "Número telefónico del cliente" : "Teléfono (opcional)"}
                <input
                  value={telefono}
                  onChange={(e) => {
                    tocado.current.telefono = true;
                    setTelefono(e.target.value);
                  }}
                  inputMode="tel"
                />
              </label>
              {modulo === "CAJA" && (
                <label>
                  Cédula (opcional)
                  <input
                    value={cedula}
                    onChange={(e) => {
                      tocado.current.cedula = true;
                      setCedula(e.target.value);
                    }}
                    inputMode="numeric"
                    placeholder="Para encontrarlo después"
                  />
                </label>
              )}
            </div>
          </>
        ) : tercero ? (
          <p className="cc-elegido">
            <strong>{tercero.nombre}</strong> · {tercero.tipo.toLowerCase()}
            <button type="button" onClick={() => setTercero(null)}>
              Cambiar
            </button>
          </p>
        ) : (
          <label>
            Buscar cliente o proveedor
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o documento" autoFocus />
            {resultados.length > 0 && (
              <ul className="cc-resultados">
                {resultados.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => setTercero(t)}>
                      {t.nombre} <span>{t.tipo.toLowerCase()}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>
        )}

        {modulo === "CAJA" && (
          <label>
            Referencia
            <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="ej. quién lo recomendó, de dónde viene, una nota" maxLength={200} />
          </label>
        )}
        <div className="cc-modal-fila">
          <label>
            Banco o canal de pago (opcional)
            <select value={canalId} onChange={(e) => (e.target.value === "personalizar" ? onPersonalizar() : setCanalId(e.target.value ? Number(e.target.value) : ""))}>
              <option value="">Sin banco</option>
              {canales.filter((c) => c.nombre !== "SIN_BANCO").map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre.replace(/_/g, " ")}
                </option>
              ))}
              <option value="personalizar">Personalizar…</option>
            </select>
          </label>
          <label>
            Moneda de la contabilidad
            <select value={monedaId} onChange={(e) => setMonedaId(e.target.value ? Number(e.target.value) : "")}>
              {monedas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.codigo} · {m.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* El movimiento con el que llega el cliente: la misma cuenta que en la hoja (cantidad × tasa = monto) */}
        {enLinea && (
          <fieldset className="cc-primer-mov">
            <legend>Movimiento (opcional)</legend>
            <label>
              Referencia del movimiento
              <input list="cc-primer-mov-referencias" value={movReferencia} onChange={(e) => alCambiarMovReferencia(e.target.value)} placeholder="Venta de Zelle, Abono efectivo…" autoComplete="off" />
              <datalist id="cc-primer-mov-referencias">
                {REFERENCIAS_MOVIMIENTO.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>
            <div className="cc-c-signo cc-primer-mov-signo" role="group" aria-label="Suma o abono">
              <button type="button" className={!movResta ? "activo suma" : ""} onClick={() => setMovResta(false)} aria-pressed={!movResta}>
                + Suma
              </button>
              <button type="button" className={movResta ? "activo resta" : ""} onClick={() => setMovResta(true)} aria-pressed={movResta}>
                − Abono
              </button>
            </div>
            <div className="cc-primer-mov-cuenta">
              <label>
                Cantidad
                <input value={movCantidad} onChange={(e) => setMovCantidad(e.target.value)} inputMode="decimal" placeholder="700.000" autoComplete="off" />
              </label>
              <span aria-hidden="true">×</span>
              <label>
                Tasa
                <input value={movTasa} onChange={(e) => setMovTasa(e.target.value)} inputMode="decimal" placeholder="3,2" autoComplete="off" />
              </label>
              <span aria-hidden="true">=</span>
              <label>
                Monto{moneda ? ` (${moneda.codigo})` : ""}
                {movConTasa ? (
                  <output className={`cc-resultado ${movResta ? "cc-neg" : ""}`}>{movMonto ? `${movResta ? "- " : ""}${formatearMonto(movMonto)}` : "—"}</output>
                ) : (
                  <input value={movMontoDirecto} onChange={(e) => setMovMontoDirecto(e.target.value)} inputMode="decimal" placeholder="monto" autoComplete="off" />
                )}
              </label>
            </div>
            <small className="cc-primer-mov-nota">Sin tasa, se escribe el monto directo.</small>
            <label>
              Quién envió o número de la transferencia (opcional)
              <input value={movPersona} onChange={(e) => setMovPersona(e.target.value)} placeholder="Nombre de quien envió, y el número si lo hay" autoComplete="off" />
            </label>
          </fieldset>
        )}

        {/* En la página se deja a la vista solo lo del cliente: cobro en otra moneda y saldo inicial van plegados */}
        <details className="cc-mas-opciones" open={!enLinea}>
          <summary>Más opciones: cobro en otra moneda y saldo inicial</summary>
        <div className="cc-modal-fila">
          <label>
            Le cobro en
            <select value={monedaCobro ? monedaCobroId : ""} onChange={(e) => setMonedaCobroId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">{moneda ? `${moneda.codigo} (la misma)` : "La misma moneda"}</option>
              {monedas
                .filter((m) => m.id !== monedaId)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.codigo} · {m.nombre}
                  </option>
                ))}
            </select>
          </label>
          {monedaCobro && moneda && (
            <label>
              Tasa: 1 {moneda.codigo} = cuántos {monedaCobro.codigo}
              <input value={tasaCobro} onChange={(e) => setTasaCobro(e.target.value)} inputMode="decimal" placeholder="ej. 4.000" />
            </label>
          )}
        </div>
        {monedaCobro && moneda && nSaldo && nTasaCobro && (
          <p className="cc-modal-nota">
            La contabilidad queda en {moneda.codigo}. Al cobrar: {formatearMonto(nSaldo.replace(/^-/, ""))} {moneda.codigo} × {formatearMonto(nTasaCobro)} ={" "}
            <strong>
              {formatearMonto(multiplicarDecimales(nSaldo.replace(/^-/, ""), nTasaCobro, 2))} {monedaCobro.codigo}
            </strong>
          </p>
        )}

        <label>
          Saldo pendiente con el que arranca (opcional)
          <span className="cc-saldo-inicial">
            <select value={saldoNegativo ? "-" : "+"} onChange={(e) => setSaldoNegativo(e.target.value === "-")} aria-label="Signo del saldo">
              <option value="+">+ Me debe</option>
              <option value="-">− Yo le debo</option>
            </select>
            <input value={saldo} onChange={(e) => setSaldo(e.target.value)} inputMode="decimal" placeholder="ej. 8.026.800" />
          </span>
          <small>
            {nSaldo
              ? `Se carga como ${saldoNegativo ? "- " : ""}${formatearMonto(nSaldo.replace(/^-/, ""))}${saldoNegativo ? " (en negativo: es lo que yo le debo)" : " (lo que me debe)"}`
              : "Lo que venía del Excel. Si yo le debo, va en negativo. Se puede dejar en cero."}
          </small>
        </label>
        </details>

        {error && <p className="cc-form-error">{error}</p>}
        <div className="cc-form-acciones">
          {!enLinea && (
            <button type="button" className="cc-btn-secundario" onClick={onCerrar}>
              Cancelar
            </button>
          )}
          <button type="submit" className="cc-guardar" disabled={enviando}>
            {enviando ? "Creando…" : modulo === "CAJA" ? "Crear cliente" : "Crear cuenta"}
          </button>
        </div>
      </form>
  );

  if (enLinea) {
    return (
      <section className="cc-crear-en-linea" aria-label="Crear cliente">
        <h3>Cliente nuevo</h3>
        <p className="cc-crear-ayuda">Si el cliente no existe, se registra acá. El movimiento es opcional y se guarda junto con el cliente.</p>
        {formulario}
      </section>
    );
  }
  return (
    <Modal titulo={modulo === "CAJA" ? "Nuevo cliente" : modulo === "POR_COBRAR" ? "Nueva cuenta por cobrar" : "Nueva cuenta corriente"} onCerrar={onCerrar}>
      {formulario}
    </Modal>
  );
}
