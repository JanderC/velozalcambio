import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "../../components/common/Modal";
import { crearCuentaCorriente, type Canal, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import { buscarTerceros, type Tercero } from "../../api/terceros.api";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { ApiError } from "../../api/client";
import { formatearMonto, leerNumero, multiplicarDecimales } from "../../utils/montos";

/** Abrir una cuenta: proveedor o cliente (existente o nuevo) + canal de pago + moneda + saldo pendiente inicial. */
export function NuevaCuentaModal({
  canales,
  modulo = "CORRIENTE",
  onPersonalizar,
  onCreada,
  onCerrar,
}: {
  canales: Canal[];
  modulo?: "CORRIENTE" | "POR_COBRAR" | "CAJA";
  onPersonalizar: () => void;
  onCreada: (c: CuentaCorrienteResumen) => void;
  onCerrar: () => void;
}) {
  const [modo, setModo] = useState<"nuevo" | "existente">("nuevo");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<"PROVEEDOR" | "CLIENTE" | "MIXTO" | "AMIGO">(modulo === "CAJA" ? "CLIENTE" : "PROVEEDOR");
  const [referencia, setReferencia] = useState(""); // dato libre del cliente (Cajas y Confirmaciones)
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

  const nSaldo = saldo.trim() ? leerNumero(saldo) : null;
  const moneda = monedas.find((m) => m.id === monedaId);
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

    setEnviando(true);
    try {
      const cuenta = await crearCuentaCorriente({
        ...(modo === "existente" ? { terceroId: tercero!.id } : { nuevoTercero: { nombre: nombre.trim(), tipo, telefono: telefono.trim() || undefined } }),
        canalId: canalId === "" ? undefined : canalId,
        modulo,
        referencia: referencia.trim() || undefined,
        ...(monedaCobro ? { monedaCobroId: monedaCobro.id, tasaCobro: nTasaCobro! } : {}),
        monedaId,
        saldoInicial: nSaldo ? `${saldoNegativo ? "-" : ""}${nSaldo.replace(/^-/, "")}` : undefined,
      });
      onCreada(cuenta);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la cuenta.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={modulo === "CAJA" ? "Nuevo cliente" : modulo === "POR_COBRAR" ? "Nueva cuenta por cobrar" : "Nueva cuenta corriente"} onCerrar={onCerrar}>
      <form className="cc-modal" onSubmit={guardar}>
        <div className="cc-segmento" role="tablist">
          <button type="button" role="tab" aria-selected={modo === "nuevo"} className={modo === "nuevo" ? "activo" : ""} onClick={() => setModo("nuevo")}>
            Crear nuevo
          </button>
          <button type="button" role="tab" aria-selected={modo === "existente"} className={modo === "existente" ? "activo" : ""} onClick={() => setModo("existente")}>
            Ya está en el sistema
          </button>
        </div>

        {modo === "nuevo" ? (
          <>
            <label>
              Nombre
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej. Daniel" autoFocus />
            </label>
            <div className="cc-modal-fila">
              <label>
                Es
                <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
                  <option value="PROVEEDOR">Proveedor</option>
                  <option value="CLIENTE">Cliente</option>
                  <option value="MIXTO">Cliente y proveedor</option>
                  <option value="AMIGO">Amigo</option>
                </select>
              </label>
              <label>
                {modulo === "CAJA" ? "Número telefónico del cliente" : "Teléfono (opcional)"}
                <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" />
              </label>
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

        {error && <p className="cc-form-error">{error}</p>}
        <div className="cc-form-acciones">
          <button type="button" className="cc-btn-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="cc-guardar" disabled={enviando}>
            {enviando ? "Creando…" : "Crear cuenta"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
