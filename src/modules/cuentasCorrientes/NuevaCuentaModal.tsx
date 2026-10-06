import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "../../components/common/Modal";
import { Camera } from "lucide-react";
import { buscarMovimientoPorNumero, codigosDeReferencia, crearCuentaCorriente, registrarMovimientoCC, subirComprobanteMovimiento, type Canal, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import { buscarTerceros, type Tercero } from "../../api/terceros.api";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { ApiError } from "../../api/client";
import { dividirDecimales, factorDeComision, formatearMonto, leerNumero, multiplicarDecimales, sumarDecimales } from "../../utils/montos";
import { leerCapturas, unirImagenes } from "./comprobantesVarios";

// Confirmaciones: el medio se elige arriba (Bolívares, Zelle...) y define en qué moneda se mueve
const ETIQUETA_MEDIO: Record<string, string> = { BOLIVARES: "Bolívares", BANCOLOMBIA: "Bancolombia", NEQUI: "Nequi", USDT: "USDT", WESTERN_UNION: "Western Union", ZELLE: "Zelle" };
const MONEDA_DEL_MEDIO: Record<string, string> = { BOLIVARES: "VES", BANCOLOMBIA: "COP", NEQUI: "COP", USDT: "USDT", WESTERN_UNION: "COP", ZELLE: "USD" }; // Western Union llega y se entrega en pesos

/** Abrir una cuenta: proveedor o cliente (existente o nuevo) + canal de pago + moneda + saldo pendiente inicial. */
export function NuevaCuentaModal({
  canales,
  modulo = "CORRIENTE",
  enLinea = false,
  inicial,
  medio = null,
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
  // el medio elegido arriba en Confirmaciones: banco de la cuenta y moneda del movimiento
  medio?: Canal | null;
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

  // Movimiento con el que llega el cliente (solo en la página). Dos fórmulas:
  //   tasa:     cantidad × tasa = total en pesos
  //   dividir:  pesos que se llevan a dólares o USDT: cantidad ÷ tasa (82.500 ÷ 3.280 = 25,15)
  //   comisión: al monto se le descuenta la comisión (1.000 − 4% = 960), en la moneda del medio
  // La que se use queda guardada para los próximos movimientos de ese cliente.
  const [movFormula, setMovFormula] = useState<"tasa" | "dividir" | "comision">("tasa");
  // Comisión: el % ya viene sumado en lo que envió (mandó 10.600 = 10.000 + 6%)
  const [movIncluida, setMovIncluida] = useState(false);
  const [movDestino, setMovDestino] = useState<"USD" | "USDT">("USD"); // a qué se llevan los pesos al dividir
  const [movResta, setMovResta] = useState(false);
  const [movCantidad, setMovCantidad] = useState("");
  const [movValor, setMovValor] = useState(""); // la tasa o el % de comisión
  const [movPersona, setMovPersona] = useState("");
  // Western Union: se anota el MTCN y el movimiento nace en proceso de confirmación
  const [movMtcn, setMovMtcn] = useState("");
  // La confirmación es parte del movimiento: marcada entra confirmada; sin marcar, queda pendiente
  const [movConfirmada, setMovConfirmada] = useState(false);
  const esWestern = medio?.nombre === "WESTERN_UNION";
  // Western Union y Zelle tardan en verificarse: sus compras pueden quedar pendientes de confirmar
  const puedeQuedarPendiente = esWestern || (medio?.nombre === "ZELLE" && !movResta);
  const nMovMtcn = esWestern ? movMtcn.replace(/\D/g, "") : "";
  const movPersonaCompleta = [movPersona.trim(), nMovMtcn ? `MTCN ${nMovMtcn}` : ""].filter(Boolean).join(" ");
  const etiquetaMedio = medio ? (ETIQUETA_MEDIO[medio.nombre] ?? medio.nombre.replace(/_/g, " ")) : null;
  // Por Zelle hay clientes que traen dólares y clientes que traen pesos: se elige en cuál es este
  const esZelle = medio?.nombre === "ZELLE";
  const [monedaZelle, setMonedaZelle] = useState<"USD" | "COP">("USD");
  const codigoMedio = esZelle ? monedaZelle : medio ? (MONEDA_DEL_MEDIO[medio.nombre] ?? "COP") : "COP";
  const nMovCantidad = movCantidad.trim() ? leerNumero(movCantidad)?.replace(/^-/, "") ?? null : null;
  const nMovValor = movValor.trim() ? leerNumero(movValor.replace(/%/g, "")) : null;
  // lo que multiplica a la cantidad: la tasa, o lo que queda tras la comisión (4% -> 0.96)
  const movFactor = !nMovValor || movFormula === "dividir" ? null : movFormula === "comision" ? factorDeComision(nMovValor, movIncluida) : nMovValor;
  // por tasa la cuenta queda en pesos; con comisión (o sin tasa) queda en la moneda del medio
  const codigoCuenta = movFormula === "dividir" ? movDestino : movFormula === "tasa" && movFactor ? "COP" : codigoMedio;
  const movMonto = !nMovCantidad
    ? null
    : movFormula === "dividir"
      ? nMovValor && /[1-9]/.test(nMovValor)
        ? dividirDecimales(nMovCantidad, nMovValor, 2)
        : null
      : movFactor
        ? multiplicarDecimales(nMovCantidad, movFactor, codigoCuenta === "COP" ? 0 : 2)
        : nMovCantidad;
  const hayMovimiento = movCantidad.trim() !== "";

  // Leer la imagen del comprobante: pone el monto en la cantidad y la referencia (con quien envía) en su casillero
  const [leyendo, setLeyendo] = useState(false);
  const [avisoLectura, setAvisoLectura] = useState<string | null>(null);
  // La imagen se guarda con el movimiento, para verla después (en la hoja y en Taquilla)
  // El cliente puede mandar el monto en varias transferencias: se cargan varias capturas, se suman y se guardan juntas
  const [imagenesAdjuntas, setImagenesAdjuntas] = useState<File[]>([]);
  async function cargarComprobantes(archivos: File[]) {
    if (!archivos.length) return;
    setError(null);
    setAvisoLectura(null);
    setLeyendo(true);
    try {
      const sumando = imagenesAdjuntas.length > 0;
      const l = await leerCapturas(archivos, sumando ? movPersona : "");
      const yaEstaba = l.repetidas ? ` ${l.repetidas === 1 ? "Una captura ya estaba cargada" : `${l.repetidas} capturas ya estaban cargadas`} (misma referencia): no se sumó otra vez.` : "";
      if (!l.aceptadas.length) {
        setAvisoLectura(yaEstaba.trim());
        return;
      }
      setImagenesAdjuntas((lista) => [...lista, ...l.aceptadas]);
      const partes: string[] = [];
      if (l.total) {
        // otra captura se suma a la cantidad que ya estaba
        setMovCantidad((previa) => formatearMonto(sumando ? sumarDecimales(leerNumero(previa) ?? "0", l.total!) : l.total!));
        partes.push(`monto ${formatearMonto(l.total)}${l.moneda ? ` ${l.moneda}` : ""}${l.aceptadas.length > 1 ? ` (suma de ${l.aceptadas.length} capturas)` : ""}`);
      }
      const quien = sumando ? [movPersona.trim(), ...l.referencias].filter(Boolean).join(" / ") : [l.primera?.remitente, l.referencias.join(" / ")].filter(Boolean).join(" ");
      if (quien) setMovPersona(quien);
      if (l.referencias.length) partes.push(`referencia ${l.referencias.join(" / ")}`);
      // si el comprobante está en otra moneda que la del medio elegido, se avisa: la cuenta no se cambia sola
      // por Zelle la moneda sale del comprobante (dólares o pesos)
      const zelleSegunImagen = esZelle && (l.moneda === "USD" || l.moneda === "COP") ? l.moneda : null;
      if (zelleSegunImagen) setMonedaZelle(zelleSegunImagen);
      const otraMoneda = l.moneda && medio && !zelleSegunImagen && l.moneda !== codigoMedio ? ` Ojo: el comprobante está en ${l.moneda} y el medio elegido se mueve en ${codigoMedio}.` : "";
      setAvisoLectura(
        (partes.length
          ? `${sumando ? "Se sumó otra captura" : "Leído de la imagen"}: ${partes.join(", ")}. Revisalo antes de crear.${otraMoneda}`
          : "No encontré monto ni referencia en esa imagen: quedó adjunta, escribí los datos a mano.") + yaEstaba
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer la imagen.");
    } finally {
      setLeyendo(false);
    }
  }
  const monedaCobro = monedaCobroId !== monedaId ? monedas.find((m) => m.id === monedaCobroId) : undefined;
  const nTasaCobro = tasaCobro.trim() ? leerNumero(tasaCobro) : null;

  // Pegar una captura (Ctrl+V) en cualquier parte de la pantalla la lee como comprobante,
  // aunque el cursor no esté dentro del formulario
  const pegarImagen = useRef<(imagenes: File[]) => void>(() => {});
  pegarImagen.current = (imagenes) => {
    if (!leyendo) void cargarComprobantes(imagenes);
  };
  useEffect(() => {
    if (!enLinea) return;
    const alPegar = (e: globalThis.ClipboardEvent) => {
      const imagenes = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (!imagenes.length) return; // texto u otra cosa: se pega normal
      e.preventDefault();
      pegarImagen.current(imagenes);
    };
    document.addEventListener("paste", alPegar);
    return () => document.removeEventListener("paste", alPegar);
  }, [enLinea]);

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
      if (!medio) return setError("Elegí arriba el medio del movimiento: Bolívares, Bancolombia, Nequi, USDT, Western Union o Zelle.");
      if (!nMovCantidad || !/[1-9]/.test(nMovCantidad)) return setError("La cantidad del movimiento no es un número válido.");
      if (movValor.trim() && (!nMovValor || !/[1-9]/.test(nMovValor) || nMovValor.startsWith("-"))) return setError(movFormula === "comision" ? "La comisión no es un número válido." : "La tasa no es un número válido.");
      if (movFormula === "comision" && nMovValor && Number(nMovValor) >= 100) return setError("La comisión tiene que ser menor al 100%.");
      if (movFormula === "tasa" && !movFactor && codigoMedio !== "COP") return setError(`Escribí la tasa para pasar ${codigoMedio} a pesos, o usá comisión.`);
      if (movFormula === "dividir" && !nMovValor) return setError(`Escribí la tasa para dividir y llevar ${codigoMedio} a ${movDestino}.`);
      if (movFormula === "dividir" && codigoMedio === movDestino) return setError(`El medio elegido ya se mueve en ${movDestino}: no hay nada que dividir.`);
      if (!movMonto || !/[1-9]/.test(movMonto)) return setError("El monto del movimiento da cero: revisá la cantidad.");
      if (esWestern && nMovMtcn.length < 6) return setError("Por Western Union hace falta el MTCN (el número de referencia del envío).");
      if (medio.nombre === "ZELLE" && movPersona.trim().length < 2) return setError("Si es por Zelle hace falta el nombre de quien envió la transferencia.");
    }
    // En la página no se eligen banco ni moneda: salen del medio de arriba y de la fórmula
    const monedaCuentaId = enLinea ? (monedas.find((m) => m.codigo === (conMovimiento ? codigoCuenta : "COP"))?.id ?? monedaId) : monedaId;

    setEnviando(true);
    try {
      // Un número de transferencia no se registra dos veces
      // (con varias capturas hay varias referencias: se revisan todas)
      const numeros = !conMovimiento ? [] : nMovMtcn.length >= 4 ? [nMovMtcn] : codigosDeReferencia(movPersona);
      for (const numero of numeros) {
        const ya = await buscarMovimientoPorNumero(numero).catch(() => null);
        if (ya) {
          // referencia repetida: no se crea el cliente ni se genera el movimiento, y se avisa con una alerta
          const aviso = `Ya hay un movimiento con la referencia ${numero}: "${ya.descripcion}" de ${ya.tercero_nombre}. No se puede registrar dos veces: el movimiento NO se generó.`;
          window.alert(`Referencia repetida\n\n${aviso}`);
          return setError(aviso);
        }
      }
      const cuenta = await crearCuentaCorriente({
        ...(modo === "existente" ? { terceroId: tercero!.id } : { nuevoTercero: { nombre: nombre.trim(), tipo, telefono: telefono.trim() || undefined, identificacion: cedula.trim() || undefined } }),
        canalId: enLinea ? medio?.id : canalId === "" ? undefined : canalId,
        modulo,
        referencia: referencia.trim() || undefined,
        ...(monedaCobro ? { monedaCobroId: monedaCobro.id, tasaCobro: nTasaCobro! } : {}),
        // al dividir, la cuenta queda en USD o USDT y se le cobra en la moneda del medio a esa tasa: la hoja ya abre dividiendo
        ...(conMovimiento && movFormula === "dividir" ? { monedaCobroId: monedas.find((m) => m.codigo === codigoMedio)?.id, tasaCobro: nMovValor! } : {}),
        monedaId: monedaCuentaId as number,
        saldoInicial: nSaldo ? `${saldoNegativo ? "-" : ""}${nSaldo.replace(/^-/, "")}` : undefined,
      });
      // El cliente ya existe: ahora su movimiento. Si falla, el cliente queda creado y se avisa.
      let errorMovimiento: string | null = null;
      if (conMovimiento) {
        const signo = movResta ? "-" : "";
        try {
          const creado = await registrarMovimientoCC({
            terceroId: cuenta.tercero_id,
            canalId: cuenta.canal_id,
            monedaId: cuenta.moneda_id,
            tipo: movResta ? "ABONO" : "CARGO",
            // la referencia sale del medio: "Compra Zelle" o "Venta Zelle"
            descripcion:
              `${movResta ? "Venta" : "Compra"} ${etiquetaMedio}${movPersonaCompleta ? ` · ${movPersonaCompleta}` : ""}` +
              // lo que se movió de verdad queda anotado: (82.500 COP a 3.280)
              (movFormula === "dividir" ? ` (${formatearMonto(nMovCantidad!)} ${codigoMedio} a ${formatearMonto(nMovValor!)})` : ""),
            // Western y Zelle pueden quedar pendientes (tardan en verificarse); las demás compras entran confirmadas y pasan a Taquilla
            ...(puedeQuedarPendiente
              ? { estadoConfirmacion: movConfirmada ? ("CONFIRMADA" as const) : ("EN_PROCESO" as const) }
              : !movResta
                ? { estadoConfirmacion: "CONFIRMADA" as const }
                : {}),
            ...(movFactor
              ? { cantidadBase: `${signo}${nMovCantidad!}`, tasa: movFactor, ...(movFormula === "comision" ? { tasaEsPorcentaje: true, comisionDescontada: true, comisionIncluida: movIncluida } : {}) }
              : { monto: `${signo}${movMonto!}` }),
          });
          // la imagen del comprobante queda guardada con el movimiento; si no sube, el movimiento igual quedó
          if (imagenesAdjuntas.length) {
            await unirImagenes(imagenesAdjuntas)
              .then((imagen) => subirComprobanteMovimiento(creado.movimiento.id, imagen))
              .catch(() => {});
          }
        } catch (err) {
          errorMovimiento = err instanceof ApiError ? err.message : "no se pudo guardar";
        }
      }
      if (enLinea) {
        if (!errorMovimiento) {
          setMovResta(false);
          setMovCantidad("");
          setMovValor("");
          setMovPersona("");
          setMovMtcn("");
          setMovConfirmada(false);
          setImagenesAdjuntas([]);
          setAvisoLectura(null);
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
        {!enLinea && (
          <>
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
          </>
        )}

        {/* El movimiento con el que llega el cliente: por tasa (cantidad × tasa) o con comisión descontada (monto − %) */}
        {enLinea && (
          <fieldset className="cc-primer-mov">
            <legend>Movimiento (opcional)</legend>
            <p className={`cc-primer-mov-medio ${medio ? "" : "falta"}`}>
              {medio ? (
                <>
                  Medio: <strong>{etiquetaMedio}</strong> · se mueve en <strong>{codigoMedio}</strong>. Se cambia en los botones de arriba.
                  {esZelle && (
                    <span className="cc-segmento cc-zelle-moneda" role="group" aria-label="Zelle en dólares o en pesos">
                      <button type="button" className={monedaZelle === "USD" ? "activo" : ""} onClick={() => setMonedaZelle("USD")} aria-pressed={monedaZelle === "USD"}>
                        Zelle en dólares
                      </button>
                      <button type="button" className={monedaZelle === "COP" ? "activo" : ""} onClick={() => setMonedaZelle("COP")} aria-pressed={monedaZelle === "COP"}>
                        Zelle en pesos
                      </button>
                    </span>
                  )}
                </>
              ) : (
                "Elegí arriba el medio: Bolívares, Bancolombia, Nequi, USDT, Western Union o Zelle."
              )}
            </p>
            <label className={`cc-leer-comprobante cc-primer-mov-leer ${leyendo ? "leyendo" : ""}`}>
              <Camera size={15} /> {leyendo ? "Leyendo la imagen…" : "Cargar imagen del comprobante"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={leyendo}
                onChange={(e) => {
                  void cargarComprobantes([...(e.target.files ?? [])]);
                  e.target.value = "";
                }}
              />
            </label>
            <small className="cc-primer-mov-nota">O pegá la captura con Ctrl+V en cualquier parte de la pantalla.</small>
            {avisoLectura && <p className="cc-aviso-lectura">{avisoLectura}</p>}
            {imagenesAdjuntas.length > 0 && (
              <p className="cc-imagen-adjunta">
                {imagenesAdjuntas.length === 1
                  ? "Imagen del comprobante lista: se guarda con el movimiento. Si mandó el monto en varias transferencias, cargá o pegá las otras capturas y se suman."
                  : `${imagenesAdjuntas.length} capturas cargadas: los montos están sumados y se guardan juntas con el movimiento.`}
              </p>
            )}
            <div className="cc-primer-mov-opciones">
              {/* Compra: le compramos al cliente lo que nos pasa (nos resta pesos o dólares). Venta: le vendemos bolívares o dólares (nos aumenta el saldo en pesos). */}
              <div className="cc-c-signo cc-primer-mov-signo" role="group" aria-label="Compra o venta">
                <button type="button" className={!movResta ? "activo suma" : ""} onClick={() => setMovResta(false)} aria-pressed={!movResta} title="Le compramos al cliente: nos resta pesos o dólares">
                  Compra
                </button>
                <button type="button" className={movResta ? "activo resta" : ""} onClick={() => setMovResta(true)} aria-pressed={movResta} title="Le vendemos al cliente: nos aumenta el saldo en pesos">
                  Venta
                </button>
              </div>
              <div className="cc-segmento cc-primer-mov-formula" role="group" aria-label="Tasa o comisión">
                <button type="button" className={movFormula === "tasa" ? "activo" : ""} onClick={() => setMovFormula("tasa")} aria-pressed={movFormula === "tasa"}>
                  Tasa
                </button>
                <button type="button" className={movFormula === "dividir" ? "activo" : ""} onClick={() => setMovFormula("dividir")} aria-pressed={movFormula === "dividir"}>
                  Dividir ÷
                </button>
                <button type="button" className={movFormula === "comision" ? "activo" : ""} onClick={() => setMovFormula("comision")} aria-pressed={movFormula === "comision"}>
                  Comisión %
                </button>
              </div>
              {movFormula === "dividir" && (
                <label className="cc-primer-mov-destino">
                  Llevar a
                  <select value={movDestino} onChange={(e) => setMovDestino(e.target.value as "USD" | "USDT")}>
                    <option value="USD">Dólares (USD)</option>
                    <option value="USDT">USDT</option>
                  </select>
                </label>
              )}
            </div>
            <small className="cc-primer-mov-nota">
              {movResta ? "Venta: le vendemos bolívares o dólares; nos aumenta el saldo en pesos." : "Compra: le compramos lo que nos pasa; nos resta pesos o dólares y queda a su favor hasta pagarle."}
            </small>
            <div className="cc-primer-mov-cuenta">
              <label>
                Cantidad ({codigoMedio})
                <input value={movCantidad} onChange={(e) => setMovCantidad(e.target.value)} inputMode="decimal" placeholder="1.000" autoComplete="off" />
              </label>
              <span aria-hidden="true">{movFormula === "comision" ? "−" : movFormula === "dividir" ? "÷" : "×"}</span>
              <label>
                {movFormula === "comision" ? "Comisión %" : "Tasa"}
                <input value={movValor} onChange={(e) => setMovValor(e.target.value)} inputMode="decimal" placeholder={movFormula === "comision" ? "4" : "3.200"} autoComplete="off" />
              </label>
              <span aria-hidden="true">=</span>
              <label>
                Total ({codigoCuenta})
                <output className={`cc-resultado ${movResta ? "cc-neg" : ""}`}>{movMonto ? `${movResta ? "- " : ""}${formatearMonto(movMonto)}` : "—"}</output>
              </label>
            </div>
            {movFormula === "comision" && (
              <label className="cc-check">
                <input type="checkbox" checked={movIncluida} onChange={(e) => setMovIncluida(e.target.checked)} />
                Lo enviado ya trae el % sumado (mandó 10.600 = 10.000 + 6%: recibe 10.000)
              </label>
            )}
            <small className="cc-primer-mov-nota">
              {movFormula === "comision"
                ? nMovCantidad && nMovValor && movMonto
                  ? `${formatearMonto(nMovCantidad)} ${movIncluida ? `ya trae el ${formatearMonto(nMovValor)}% sumado` : `− ${formatearMonto(nMovValor)}% de comisión`} = ${formatearMonto(movMonto)} ${codigoCuenta}. Esta comisión queda guardada para los próximos movimientos del cliente.`
                  : "A la cantidad se le descuenta la comisión: 1.000 − 4% = 960. Queda guardada para los próximos movimientos del cliente."
                : movFormula === "dividir"
                  ? nMovCantidad && nMovValor && movMonto
                    ? `${formatearMonto(nMovCantidad)} ${codigoMedio} ÷ ${formatearMonto(nMovValor)} = ${formatearMonto(movMonto)} ${movDestino}. La cuenta del cliente queda en ${movDestino} y la tasa guardada para los próximos movimientos.`
                    : `Lo que llega en ${codigoMedio} se divide por la tasa y queda en ${movDestino}: 82.500 ÷ 3.280 = 25,15.`
                  : "Cantidad × tasa = total en pesos. La tasa queda guardada para los próximos movimientos del cliente."}
            </small>
            <label>
              Referencia de la transferencia y quién envió (opcional)
              <input value={movPersona} onChange={(e) => setMovPersona(e.target.value)} placeholder="Número de referencia, y el nombre de quien envió" autoComplete="off" />
            </label>
            {esWestern && (
              <label>
                MTCN (referencia de Western Union)
                <input value={movMtcn} onChange={(e) => setMovMtcn(e.target.value)} inputMode="numeric" placeholder="10 dígitos" autoComplete="off" />
              </label>
            )}
            {puedeQuedarPendiente && (
              <label className={`cc-check cc-confirmada ${movConfirmada ? "si" : ""}`}>
                <input type="checkbox" checked={movConfirmada} onChange={(e) => setMovConfirmada(e.target.checked)} />
                La transferencia ya está confirmada
                <small>{movConfirmada ? "Entra ya confirmada y pasa a Taquilla para pagarse." : "Sin marcar, queda pendiente: se confirma después, desde la hoja del cliente o en Taquilla."}</small>
              </label>
            )}
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
