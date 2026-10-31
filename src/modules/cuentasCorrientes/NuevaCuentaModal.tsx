import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "../../components/common/Modal";
import { Camera } from "lucide-react";
import { buscarMovimientoPorNumero, codigosDeReferencia, crearCuentaCorriente, pagarConfirmacionOtroMetodo, pagarParteConfirmacion, registrarMovimientoCC, subirComprobanteMovimiento, type Canal, type CuentaCorrienteResumen } from "../../api/cuentasCorrientes.api";
import { buscarTerceros, type Tercero } from "../../api/terceros.api";
import { getMonedas, type Moneda } from "../../api/monedas.api";
import { ApiError } from "../../api/client";
import { dividirDecimales, factorDeComision, formatearMonto, leerNumero, multiplicarDecimales, sumarDecimales } from "../../utils/montos";
import { leerCapturas, unirImagenes } from "./comprobantesVarios";
import { AvisoClienteExistente, useClienteExistente } from "./ClienteExistente";
import { OPERACIONES_CONFIRMACIONES } from "./HojaCuenta";
import { PAGO_POR_TAQUILLA, PagoConfirmacion, montoParte, type PagoElegido } from "./PagoConfirmacion";
import { METODOS, comisionPara, detectarMetodo, esFacturaBancolombia, formulaDeOperacion, nombreMetodo, sigueLaRegla, tasaDeOperacion, tasaDelMetodo, type Metodo } from "./metodoPago";
import { escrita, useTablero } from "../tasas/tablero";

// Confirmaciones: el medio se elige arriba (Bolívares, Zelle...) y define en qué moneda se mueve
const ETIQUETA_MEDIO: Record<string, string> = { BOLIVARES: "Bolívares", BANCOLOMBIA: "Bancolombia", NEQUI: "Nequi", USDT: "USDT", WESTERN_UNION: "Western Union", ZELLE: "Zelle" };
const MONEDA_DEL_MEDIO: Record<string, string> = { BOLIVARES: "VES", BANCOLOMBIA: "COP", NEQUI: "COP", USDT: "USDT", WESTERN_UNION: "USD", ZELLE: "USD" };
// En qué queda el total a entregar cuando no es la moneda del medio: Western Union llega en dólares y se entrega en pesos
const MONEDA_DEL_TOTAL: Record<string, string> = { WESTERN_UNION: "COP" };

/** Abrir una cuenta: proveedor o cliente (existente o nuevo) + canal de pago + moneda + saldo pendiente inicial. */
export function NuevaCuentaModal({
  canales,
  modulo = "CORRIENTE",
  enLinea = false,
  inicial,
  medio = null,
  onElegirMedio,
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
  // Confirmaciones: al reconocer la captura (Nequi, Zelle…) se elige solo el medio de arriba
  onElegirMedio?: (canalId: number) => void;
  onPersonalizar: () => void;
  // seguirCon: Confirmaciones, el cliente se creó para cargarle varias transferencias o un pago repartido en su hoja
  onCreada: (c: CuentaCorrienteResumen, seguirCon?: "varias" | "repartido") => void;
  onCerrar: () => void;
}) {
  const [modo, setModo] = useState<"nuevo" | "existente">("nuevo");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<"PROVEEDOR" | "CLIENTE" | "MIXTO" | "AMIGO" | "EVENTUAL">(modulo === "CAJA" ? "CLIENTE" : "PROVEEDOR");
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

  // ¿Ya existe en el sistema (en cualquier módulo)? El cliente es uno solo: se ofrece traerlo en vez de crear otro
  const existentes = useClienteExistente(nombre, telefono, modo === "nuevo");

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
  // Familiar o amigo: no se le cobra comisión (lo que entra es lo que sale). El cliente queda guardado con 0%.
  const [movSinComision, setMovSinComision] = useState(false);
  const [movDestino, setMovDestino] = useState("USD"); // a qué moneda se lleva lo que llega al dividir: cualquiera de las del sistema
  // ...y al multiplicar por la tasa: pesos por defecto, pero también bolívares u otra (USDT × tasa = Bs)
  const [movDestinoTasa, setMovDestinoTasa] = useState("COP");
  // ...y con comisión: viene la moneda del medio, pero el cliente puede pedir otra (null = la del medio)
  const [movDestinoComision, setMovDestinoComision] = useState<string | null>(null);
  // La operación: se elige de la lista (Compra o Venta de pesos, bolívares, dólares…) o queda la del medio ("Compra Zelle")
  const [movOperacion, setMovOperacion] = useState("");
  function cambiarOperacion(valor: string) {
    setMovOperacion(valor);
    if (/^\s*compra/i.test(valor)) setMovResta(false);
    else if (/^\s*venta/i.test(valor)) setMovResta(true);
  }
  const [movResta, setMovResta] = useState(false);
  const [movCantidad, setMovCantidad] = useState("");
  const [movValor, setMovValor] = useState(""); // la tasa o el % de comisión
  // La última comisión usada queda guardada en este equipo (la misma que recuerda la hoja del cliente)
  const ultimaComision = () => {
    try {
      return localStorage.getItem("cc-ultima-comision-pct") ?? "";
    } catch {
      return "";
    }
  };
  // Al pasar a comisión viene puesta la última usada; al salir de comisión, el % no sirve como tasa y se limpia
  function cambiarFormula(formula: "tasa" | "dividir" | "comision") {
    if (formula === movFormula) return;
    // al dividir viene puesta la tasa del día de la moneda que quiere el cliente
    const delDia = modulo === "CAJA" && formula === "dividir" ? tasaDeOperacion(codigoMedio, movDestino, tablero?.actual?.valores) : null;
    if (formula === "comision") setMovValor(ultimaComision());
    else if (delDia) setMovValor(escrita(delDia));
    else if (movFormula === "comision") setMovValor("");
    setMovFormula(formula);
  }
  // Bancolombia y Nequi se trabajan con comisión; el resto de los medios, con tasa
  const nombreMedio = medio?.nombre;
  useEffect(() => {
    if (!nombreMedio) return;
    cambiarFormula(nombreMedio === "BANCOLOMBIA" || nombreMedio === "NEQUI" ? "comision" : "tasa");
    setMovDestinoComision(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombreMedio]);
  const [movPersona, setMovPersona] = useState("");
  // Western Union: se anota el MTCN y el movimiento nace en proceso de confirmación
  const [movMtcn, setMovMtcn] = useState("");
  // La confirmación es parte del movimiento: marcada entra confirmada; sin marcar, queda pendiente
  const [movConfirmada, setMovConfirmada] = useState(false);
  // cómo se le paga: pasa a taquilla, o se le paga ya por una cuenta de la empresa
  const [movPago, setMovPago] = useState<PagoElegido>(PAGO_POR_TAQUILLA);
  const esWestern = medio?.nombre === "WESTERN_UNION";
  // Western Union y Zelle tardan en verificarse: sus compras pueden quedar pendientes de confirmar
  const puedeQuedarPendiente = esWestern || (medio?.nombre === "ZELLE" && !movResta);
  const nMovMtcn = esWestern ? movMtcn.replace(/\D/g, "") : "";
  const movPersonaCompleta = [movPersona.trim(), nMovMtcn ? `MTCN ${nMovMtcn}` : ""].filter(Boolean).join(" ");
  const etiquetaMedio = medio ? (ETIQUETA_MEDIO[medio.nombre] ?? medio.nombre.replace(/_/g, " ")) : null;
  // Por Zelle llegan dólares, y el total se le entrega al cliente en dólares o en pesos: se elige
  const esZelle = medio?.nombre === "ZELLE";
  const [monedaZelle, setMonedaZelle] = useState<"USD" | "COP">("USD");
  const codigoMedio = medio ? (MONEDA_DEL_MEDIO[medio.nombre] ?? "COP") : "COP";
  // en qué queda el total: Zelle según lo elegido, Western Union en pesos, el resto en la moneda del medio
  const codigoTotal = esZelle ? monedaZelle : medio ? (MONEDA_DEL_TOTAL[medio.nombre] ?? codigoMedio) : codigoMedio;
  const nMovCantidad = movCantidad.trim() ? leerNumero(movCantidad)?.replace(/^-/, "") ?? null : null;
  // (sin comisión: es como si en la casilla dijera 0)
  const exonerado = movSinComision && movFormula === "comision";
  const nMovValor = exonerado ? "0" : movValor.trim() ? leerNumero(movValor.replace(/%/g, "")) : null;
  // lo que multiplica a la cantidad: la tasa, o lo que queda tras la comisión (4% -> 0.96)
  const movFactor = !nMovValor || movFormula === "dividir" ? null : movFormula === "comision" ? factorDeComision(nMovValor, movIncluida) : nMovValor;
  // por tasa la cuenta queda en la moneda elegida en "Llevar a" (pesos por defecto); con comisión (o sin tasa), en la del total
  const codigoCuenta = movFormula === "dividir" ? movDestino : movFormula === "tasa" && movFactor ? movDestinoTasa : movFormula === "comision" ? (movDestinoComision ?? codigoTotal) : codigoTotal;
  // la moneda a la que se lleva, según la fórmula elegida
  const destinoElegido = movFormula === "dividir" ? movDestino : movFormula === "comision" ? (movDestinoComision ?? codigoTotal) : movDestinoTasa;
  const movMonto = !nMovCantidad
    ? null
    : movFormula === "dividir"
      ? nMovValor && /[1-9]/.test(nMovValor)
        ? dividirDecimales(nMovCantidad, nMovValor, movDestino === "COP" ? 0 : 2)
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
  // ---------- Confirmaciones: la captura dice el método, y con él el medio y la comisión ----------
  const tablero = useTablero();
  const [preguntaMetodo, setPreguntaMetodo] = useState<{ total: string | null; referencia: string | null } | null>(null);
  const metodoAplicado = useRef<Metodo | null>(null);
  // Confirmaciones, Compra: al elegir la moneda que quiere el cliente, la cuenta se pone sola
  function elegirEntrega(codigo: string) {
    const propio = metodoAplicado.current && !sigueLaRegla(metodoAplicado.current);
    const regla = modulo === "CAJA" && !movResta && !propio ? formulaDeOperacion(codigoMedio, codigo) : null;
    if (!regla) return (movFormula === "dividir" ? setMovDestino : movFormula === "comision" ? setMovDestinoComision : setMovDestinoTasa)(codigo);
    const valores = tablero?.actual?.valores;
    const delDia = tasaDeOperacion(codigoMedio, codigo, valores);
    if (regla === "comision") {
      setMovDestinoComision(codigo);
      setMovValor(comisionPara("BANCOLOMBIA", nMovCantidad, valores)?.pct ?? ultimaComision());
    } else {
      (regla === "dividir" ? setMovDestino : setMovDestinoTasa)(codigo);
      setMovValor(delDia ? escrita(delDia) : "");
    }
    setMovFormula(regla === "multiplicar" ? "tasa" : regla);
    // ya no es con comisión: que el aviso de la captura no lo siga diciendo
    if (regla !== "comision") setAvisoLectura((a) => a?.replace(/: comisión [d.,]+% ([^)]*)/, "") ?? null);
  }
  function aplicarMetodo(metodo: Metodo, total: string | null, referenciaLeida: string | null) {
    setPreguntaMetodo(null);
    metodoAplicado.current = metodo;
    const m = METODOS.find((x) => x.clave === metodo)!;
    const canal = canales.find((c) => c.nombre === m.medio);
    if (canal) onElegirMedio?.(canal.id);
    if (m.medio === "WESTERN_UNION" && referenciaLeida && /^\d{8,12}$/.test(referenciaLeida.replace(/\D/g, ""))) setMovMtcn(referenciaLeida.replace(/\D/g, ""));
    // ya estaba elegida la moneda que quiere el cliente: la captura no se la cambia
    if (sigueLaRegla(metodo) && !movResta && m.medio === medio?.nombre && formulaDeOperacion(codigoMedio, destinoElegido) === "dividir") {
      elegirEntrega(destinoElegido);
      return nombreMetodo(metodo);
    }
    const claveTasa = tasaDelMetodo(metodo);
    if (claveTasa) {
      const v = tablero?.actual?.valores[claveTasa];
      setMovFormula("tasa");
      if (v) setMovValor(escrita(v));
      return `${nombreMetodo(metodo)}${v ? `: tasa del día ${escrita(v)}` : ""}`;
    }
    const c = comisionPara(metodo, total, tablero?.actual?.valores);
    if (!c) return `${nombreMetodo(metodo)} (sin comisión configurada: escribila)`;
    setMovFormula("comision");
    setMovValor(c.pct);
    return `${nombreMetodo(metodo)}: comisión ${c.pct}% (${c.regla})`;
  }

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
      // Confirmaciones: qué método es (y su comisión); si no se reconoce, se pregunta
      let detectado = false;
      if (modulo === "CAJA" && !sumando) {
        const factura = esFacturaBancolombia(l.primera);
        const metodo: Metodo | null = factura ? "BANCOLOMBIA" : detectarMetodo(l.primera);
        if (factura) setMovSinComision(true);
        if (metodo) {
          const texto = aplicarMetodo(metodo, l.total, l.referencias[0] ?? null);
          partes.unshift(factura ? "Pago de factura por Bancolombia: sin comisión" : texto);
          detectado = true;
        } else setPreguntaMetodo({ total: l.total, referencia: l.referencias[0] ?? null });
      }
      const otraMoneda = !detectado && l.moneda && medio && l.moneda !== codigoMedio ? ` Ojo: el comprobante está en ${l.moneda} y el medio elegido se mueve en ${codigoMedio}.` : "";
      setAvisoLectura(
        (partes.length
          ? `${sumando ? "Se sumó otra captura" : "Leído de la imagen"}${l.conIA ? " con IA" : ""}: ${partes.join(", ")}. Revisalo antes de crear.${otraMoneda}`
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

  // Confirmaciones: varias transferencias o pago repartido. Se crea el cliente (sin movimiento) y se sigue en su hoja,
  // donde se cargan las transferencias una por una o las partes en cada moneda.
  async function crearYSeguir(seguirCon: "varias" | "repartido") {
    setError(null);
    if (modo === "nuevo" && nombre.trim().length < 2) return setError("Escribí el nombre del cliente.");
    if (modo === "existente" && !tercero) return setError("Buscá y elegí al cliente.");
    if (!medio) return setError("Elegí arriba el medio: Bolívares, Bancolombia, Nequi, USDT, Western Union o Zelle.");
    const cop = monedas.find((m) => m.codigo === "COP");
    if (!cop) return setError("No se pudo cargar la moneda. Probá de nuevo.");
    const datos = {
      ...(modo === "existente"
        ? { terceroId: tercero!.id, usarExistente: true }
        : { nuevoTercero: { nombre: nombre.trim(), tipo, telefono: telefono.trim() || undefined, identificacion: cedula.trim() || undefined } }),
      canalId: medio.id,
      modulo,
      referencia: referencia.trim() || undefined,
      monedaId: cop.id,
    };
    setEnviando(true);
    try {
      const cuenta = await crearCuentaCorriente(datos).catch((err) => {
        // ya hay un cliente con ese nombre: ¿es el mismo?
        if (!(err instanceof ApiError && err.status === 409 && /^Ya existe/.test(err.message))) throw err;
        if (!window.confirm(`Ya hay un cliente llamado "${nombre.trim()}" en el sistema.\n\n¿Es la misma persona? Aceptar: se usa ese cliente.\nCancelar: no se registra nada.`)) throw err;
        return crearCuentaCorriente({ ...datos, usarExistente: true });
      });
      tocado.current = { nombre: false, telefono: false, cedula: false };
      setNombre("");
      setTelefono("");
      setCedula("");
      setReferencia("");
      onCreada(cuenta, seguirCon);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el cliente.");
    } finally {
      setEnviando(false);
    }
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (modo === "nuevo" && nombre.trim().length < 2) return setError("Escribí el nombre.");
    if (modo === "existente" && !tercero) return setError("Buscá y elegí a quién le abrís la cuenta.");
    if (monedaId === "") return setError("Elegí la moneda.");
    const pagarCon = enLinea && hayMovimiento && !movResta && movPago.modo === "otro" ? movPago : null;
    if (pagarCon && !pagarCon.cajaId) return setError("Elegí de qué cuenta de la empresa se le paga (o dejalo en \"Pasa a taquilla\").");
    if (pagarCon && puedeQuedarPendiente && !movConfirmada) return setError("Para pagarla ya tiene que entrar confirmada: marcá que la transferencia ya está confirmada.");
    // una parte por banco y el resto en efectivo en taquilla
    const pagarParte = enLinea && hayMovimiento && !movResta && movPago.modo === "parte" ? movPago : null;
    const nParte = pagarParte ? montoParte(pagarParte, movMonto) : null;
    if (pagarParte && !pagarParte.cajaId) return setError("Elegí de qué cuenta de la empresa se le paga la parte por banco.");
    if (pagarParte && !nParte) return setError("Lo que va por banco tiene que ser un número menor que el total. Si es todo, elegí \"Otro método de pago\".");
    if (pagarParte && puedeQuedarPendiente && !movConfirmada) return setError("Para pagarle una parte ya tiene que entrar confirmada: marcá que la transferencia ya está confirmada.");
    if (monedaCobro && (!nTasaCobro || !/[1-9]/.test(nTasaCobro) || nTasaCobro.startsWith("-"))) return setError("Para cobrar en otra moneda escribí la tasa.");
    if (saldo.trim() && !nSaldo) return setError("El saldo inicial no es un número válido.");
    // El movimiento es opcional, pero si se empezó a llenar tiene que estar completo
    const conMovimiento = enLinea && hayMovimiento;
    if (conMovimiento) {
      if (!medio) return setError("Elegí arriba el medio del movimiento: Bolívares, Bancolombia, Nequi, USDT, Western Union o Zelle.");
      if (!nMovCantidad || !/[1-9]/.test(nMovCantidad)) return setError("La cantidad del movimiento no es un número válido.");
      if (!exonerado && movValor.trim() && (!nMovValor || !/[1-9]/.test(nMovValor) || nMovValor.startsWith("-"))) return setError(movFormula === "comision" ? "La comisión no es un número válido." : "La tasa no es un número válido.");
      if (movFormula === "comision" && nMovValor && Number(nMovValor) >= 100) return setError("La comisión tiene que ser menor al 100%.");
      if (movFormula === "tasa" && !movFactor && codigoMedio !== "COP") return setError(`Escribí la tasa para pasar ${codigoMedio} a ${movDestinoTasa}, o usá comisión.`);      if (movFormula === "dividir" && !nMovValor) return setError(`Escribí la tasa para dividir y llevar ${codigoMedio} a ${movDestino}.`);
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
        // en Confirmaciones solo se busca dentro del medio elegido: la misma referencia puede existir en otro banco
        const ya = await buscarMovimientoPorNumero(numero, enLinea ? medio?.id : undefined).catch(() => null);
        if (ya) {
          // referencia repetida: no se crea el cliente ni se genera el movimiento, y se avisa con una alerta
          const aviso = `Ya hay un movimiento con la referencia ${numero}${enLinea && etiquetaMedio ? ` por ${etiquetaMedio}` : ""}:"${ya.descripcion}" de ${ya.tercero_nombre}. No se puede registrar dos veces: el movimiento NO se generó.`;
          window.alert(`Referencia repetida\n\n${aviso}`);
          return setError(aviso);
        }
      }
      const datosCuenta = {
        ...(modo === "existente" ? { terceroId: tercero!.id, usarExistente: true } : { nuevoTercero: { nombre: nombre.trim(), tipo, telefono: telefono.trim() || undefined, identificacion: cedula.trim() || undefined } }),
        canalId: enLinea ? medio?.id : canalId === "" ? undefined : canalId,
        modulo,
        referencia: referencia.trim() || undefined,
        ...(monedaCobro ? { monedaCobroId: monedaCobro.id, tasaCobro: nTasaCobro! } : {}),
        // al dividir, la cuenta queda en USD o USDT y se le cobra en la moneda del medio a esa tasa: la hoja ya abre dividiendo
        ...(conMovimiento && movFormula === "dividir" ? { monedaCobroId: monedas.find((m) => m.codigo === codigoMedio)?.id, tasaCobro: nMovValor! } : {}),
        monedaId: monedaCuentaId as number,
        saldoInicial: nSaldo ? `${saldoNegativo ? "-" : ""}${nSaldo.replace(/^-/, "")}` : undefined,
      };
      const cuenta = await crearCuentaCorriente(datosCuenta).catch((err) => {
        // Confirmaciones: el cliente ya existe (quizás con otro medio, y por eso no salía en la lista filtrada).
        // Se pregunta si es el mismo y, si lo es, el movimiento se le registra a él con este medio.
        if (!(err instanceof ApiError && err.status === 409 && /^Ya existe/.test(err.message))) throw err;
        const esElMismo = window.confirm(
          `Ya hay un cliente llamado "${nombre.trim()}" en el sistema.\n\n` +
            `¿Es la misma persona? Aceptar: el movimiento se le registra a ese cliente${etiquetaMedio ? ` por ${etiquetaMedio}` : ""}.\n` +
            `Cancelar: no se registra nada (si es otra persona, escribí el nombre distinto, por ejemplo con el segundo apellido).`
        );
        if (!esElMismo) throw err;
        return crearCuentaCorriente({ ...datosCuenta, usarExistente: true });
      });
      // El cliente ya existe: ahora su movimiento. Si falla, el cliente queda creado y se avisa.
      let errorMovimiento: string | null = null;
      if (conMovimiento) {
        const signo = movResta ? "-" : "";
        try {
          // la comisión usada queda guardada para la próxima vez
          if (movFormula === "comision" && nMovValor && !exonerado) {
            try {
              localStorage.setItem("cc-ultima-comision-pct", movValor.replace(/%/g, "").trim());
            } catch {
              // no es grave: solo no se recuerda
            }
          }
          const creado = await registrarMovimientoCC({
            cuentaId: cuenta.id,
            terceroId: cuenta.tercero_id,
            canalId: cuenta.canal_id,
            monedaId: cuenta.moneda_id,
            // el movimiento queda con el medio elegido arriba (el cliente puede haberse registrado con otro)
            ...(enLinea && medio ? { canalMovimientoId: medio.id } : {}),
            tipo: movResta ? "ABONO" : "CARGO",
            // la referencia sale del medio: "Compra Zelle" o "Venta Zelle"
            descripcion:
              `${movOperacion.trim() || `${movResta ? "Venta" : "Compra"} ${etiquetaMedio}`}${movPersonaCompleta ? ` · ${movPersonaCompleta}` : ""}` +
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
          // pagada por otro método: se le paga ya, desde la cuenta de la empresa (no pasa a taquilla)
          const pagarYa = enLinea && !movResta && movPago.modo === "otro" && movPago.cajaId ? movPago : null;
          if (pagarYa) {
            await pagarConfirmacionOtroMetodo(creado.movimiento.id, pagarYa.cajaId!).catch((e) => {
              window.alert(`El cliente y la confirmación quedaron registrados, pero no se pudo pagar por ${pagarYa.nombre} (${e instanceof ApiError ? e.message : "error de conexión"}): quedó para pagar en taquilla.`);
            });
          }
          // una parte por banco: sale ya y la taquilla ve solo lo que falta
          if (pagarParte && nParte) {
            await pagarParteConfirmacion(creado.movimiento.id, pagarParte.cajaId!, nParte).catch((e) => {
              window.alert(`El cliente y la confirmación quedaron registrados, pero no se pudo pagar la parte por ${pagarParte.nombre} (${e instanceof ApiError ? e.message : "error de conexión"}): quedó entera para pagar en taquilla.`);
            });
          }
        } catch (err) {
          errorMovimiento = err instanceof ApiError ? err.message : "no se pudo guardar";
        }
      }
      if (enLinea) {
        if (!errorMovimiento) {
          setMovResta(false);
          setMovSinComision(false);
          setMovCantidad("");
          setMovOperacion("");
          setMovValor(movFormula === "comision" ? movValor.replace(/%/g, "").trim() : "");
          setMovPersona("");
          setMovMtcn("");
          setMovConfirmada(false);
          setMovPago(PAGO_POR_TAQUILLA);
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
                    <option value="EVENTUAL">Cliente eventual</option>
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
            <AvisoClienteExistente
              lista={existentes.lista}
              modulo={modulo}
              onDescartar={existentes.descartar}
              onUsar={(c) => {
                setTercero({ id: c.id, nombre: c.nombre, telefono: c.telefono, identificacion: c.identificacion, tipo: c.tipo as Tercero["tipo"], created_at: "" });
                setModo("existente");
              }}
            />
          </>
        ) : tercero ? (
          <p className="cc-elegido">
            <strong>{tercero.nombre}</strong> · {tercero.telefono ? `${tercero.telefono} · ` : ""}ya está en el sistema
            <button
              type="button"
              onClick={() => {
                setTercero(null);
                // en Confirmaciones no hay buscador: se vuelve a escribir el cliente
                if (enLinea) setModo("nuevo");
              }}
            >
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
          <div className="cc-nuevo-varias">
            <span>¿Mandó varias transferencias o lo quiere en varias monedas?</span>
            <button type="button" onClick={() => void crearYSeguir("varias")} disabled={enviando} title="Se crea el cliente y se abre su hoja para cargar cada transferencia con su monto y su captura">
              Varias transferencias
            </button>
            <button type="button" onClick={() => void crearYSeguir("repartido")} disabled={enviando} title="Se crea el cliente y se abre su hoja para repartir lo enviado en varias monedas">
              Pago repartido en varias monedas
            </button>
          </div>
        )}
        {enLinea && (
          <fieldset className="cc-primer-mov">
            <legend>Movimiento (opcional)</legend>
            <p className={`cc-primer-mov-medio ${medio ? "" : "falta"}`}>
              {medio ? (
                <>
                  Medio: <strong>{etiquetaMedio}</strong> ·{" "}
                  {codigoTotal === codigoMedio ? (
                    <>
                      se mueve en <strong>{codigoMedio}</strong>
                    </>
                  ) : (
                    <>
                      llega en <strong>{codigoMedio}</strong> y el total se entrega en <strong>{codigoTotal}</strong>
                    </>
                  )}
                  . Se cambia en los botones de arriba.
                  {esZelle && (
                    <span className="cc-segmento cc-zelle-moneda" role="group" aria-label="Total a entregar en dólares o en pesos">
                      <button type="button" className={monedaZelle === "USD" ? "activo" : ""} onClick={() => setMonedaZelle("USD")} aria-pressed={monedaZelle === "USD"}>
                        Total a entregar en USD
                      </button>
                      <button type="button" className={monedaZelle === "COP" ? "activo" : ""} onClick={() => setMonedaZelle("COP")} aria-pressed={monedaZelle === "COP"}>
                        Total a entregar en COP
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
            {preguntaMetodo && (
              <div className="cc-pregunta-metodo" role="group" aria-label="Método de pago de la captura">
                <span>No reconocí el método de esta captura. ¿Por dónde llegó?</span>
                <div className="cc-chips">
                  {METODOS.map((m) => (
                    <button
                      key={m.clave}
                      type="button"
                      onClick={() => {
                        const texto = aplicarMetodo(m.clave, preguntaMetodo.total, preguntaMetodo.referencia);
                        setAvisoLectura((a) => `${texto}. ${a ?? ""}`.trim());
                      }}
                    >
                      {m.nombre}
                    </button>
                  ))}
                  <button type="button" className="cc-pregunta-otro" onClick={() => setPreguntaMetodo(null)}>
                    Otro (lo elijo yo)
                  </button>
                </div>
              </div>
            )}
            {imagenesAdjuntas.length > 0 && (
              <p className="cc-imagen-adjunta">
                {imagenesAdjuntas.length === 1
                  ? "Imagen del comprobante lista: se guarda con el movimiento. Si mandó el monto en varias transferencias, cargá o pegá las otras capturas y se suman."
                  : `${imagenesAdjuntas.length} capturas cargadas: los montos están sumados y se guardan juntas con el movimiento.`}
              </p>
            )}
            <label className="cc-primer-mov-operacion">
              Operación
              <input list="cc-operaciones-nuevo" value={movOperacion} onChange={(e) => cambiarOperacion(e.target.value)} placeholder={`${movResta ? "Venta" : "Compra"}${etiquetaMedio ? ` ${etiquetaMedio}` : ""} (se pone sola)`} autoComplete="off" />
              <datalist id="cc-operaciones-nuevo">
                {OPERACIONES_CONFIRMACIONES.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </label>
            <div className="cc-primer-mov-opciones">
              {/* Compra: le compramos al cliente lo que nos pasa (nos resta pesos o dólares). Venta: le vendemos bolívares o dólares (nos aumenta el saldo en pesos). */}
              <div className="cc-c-signo cc-primer-mov-signo" role="group" aria-label={modulo === "CAJA" ? "Compra o venta" : "Egreso o ingreso"}>
                <button type="button" className={!movResta ? "activo suma" : ""} onClick={() => setMovResta(false)} aria-pressed={!movResta} title={modulo === "CAJA" ? "Le compramos al cliente: nos resta pesos o dólares" : "Egreso: le dimos o vendimos al cliente, suma a lo que debe"}>
                  {modulo === "CAJA" ? "Compra" : "Egreso"}
                </button>
                <button type="button" className={movResta ? "activo resta" : ""} onClick={() => setMovResta(true)} aria-pressed={movResta} title={modulo === "CAJA" ? "Le vendemos al cliente: nos aumenta el saldo en pesos" : "Ingreso: el cliente nos paga o abona, resta de lo que debe"}>
                  {modulo === "CAJA" ? "Venta" : "Ingreso"}
                </button>
              </div>
              <div className="cc-segmento cc-primer-mov-formula" role="group" aria-label="Tasa o comisión">
                <button type="button" className={movFormula === "tasa" ? "activo" : ""} onClick={() => cambiarFormula("tasa")} aria-pressed={movFormula === "tasa"}>
                  Tasa
                </button>
                <button type="button" className={movFormula === "dividir" ? "activo" : ""} onClick={() => cambiarFormula("dividir")} aria-pressed={movFormula === "dividir"}>
                  Dividir ÷
                </button>
                <button type="button" className={movFormula === "comision" ? "activo" : ""} onClick={() => cambiarFormula("comision")} aria-pressed={movFormula === "comision"}>
                  Comisión %
                </button>
              </div>
              {(
                <label className="cc-primer-mov-destino">
                  ¿Qué moneda quiere el cliente? Se entrega en
                  <select value={destinoElegido} onChange={(e) => elegirEntrega(e.target.value)}>
                    {/* todas las monedas, menos la que ya trae el medio (no habría nada que convertir) */}
                    {monedas
                      // al dividir no se lista la moneda del medio (no habría nada que dividir); al multiplicar sí,
                      // porque por Nequi o Bancolombia se anota la cantidad vendida × tasa = pesos
                      // (en Confirmaciones sí: pesos a pesos es un retiro, con comisión)
                      .filter((m) => modulo === "CAJA" || movFormula !== "dividir" || m.codigo !== codigoMedio || m.codigo === destinoElegido)
                      .map((m) => (
                        <option key={m.id} value={m.codigo}>
                          {m.nombre} ({m.codigo})
                        </option>
                      ))}
                    {monedas.length === 0 && <option value={destinoElegido}>{destinoElegido}</option>}
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
                <input value={exonerado ? "0" : movValor} disabled={exonerado} onChange={(e) => setMovValor(e.target.value)} inputMode="decimal" placeholder={movFormula === "comision" ? "4" : "3.200"} autoComplete="off" />
              </label>
              <span aria-hidden="true">=</span>
              <label>
                Total a entregar ({movFormula === "comision" ? codigoCuenta : destinoElegido})
                <output className={`cc-resultado ${movResta ? "cc-neg" : ""}`}>{movMonto ? `${movResta ? "- " : ""}${formatearMonto(movMonto)}` : "—"}</output>
              </label>
            </div>
            {movFormula === "comision" && !exonerado && (
              <label className="cc-check">
                <input type="checkbox" checked={movIncluida} onChange={(e) => setMovIncluida(e.target.checked)} />
                Lo enviado ya trae el % sumado (mandó 10.600 = 10.000 + 6%: recibe 10.000)
              </label>
            )}
            {/* Discreto: familiar o amigo al que no se le cobra comisión */}
            {movFormula === "comision" && (
              <label className="cc-sin-comision">
                <input type="checkbox" checked={movSinComision} onChange={(e) => setMovSinComision(e.target.checked)} />
                Familiar o amigo o pago de factura: sin comisión
              </label>
            )}
            <small className="cc-primer-mov-nota">
              {exonerado
                ? nMovCantidad && movMonto
                  ? `${formatearMonto(nMovCantidad)} sin comisión = ${formatearMonto(movMonto)} ${codigoCuenta}: recibe lo mismo que envió. Este cliente queda guardado sin comisión para sus próximos movimientos.`
                  : "Sin comisión: recibe lo mismo que envió. El cliente queda guardado sin comisión para sus próximos movimientos."
                : movFormula === "comision"
                ? nMovCantidad && nMovValor && movMonto
                  ? `${formatearMonto(nMovCantidad)} ${movIncluida ? `ya trae el ${formatearMonto(nMovValor)}% sumado` : `− ${formatearMonto(nMovValor)}% de comisión`} = ${formatearMonto(movMonto)} ${codigoCuenta}. Esta comisión queda guardada para los próximos movimientos del cliente.`
                  : "A la cantidad se le descuenta la comisión: 1.000 − 4% = 960. Queda guardada para los próximos movimientos del cliente."
                : movFormula === "dividir"
                  ? nMovCantidad && nMovValor && movMonto
                    ? `${formatearMonto(nMovCantidad)} ${codigoMedio} ÷ ${formatearMonto(nMovValor)} = ${formatearMonto(movMonto)} ${movDestino}. La cuenta del cliente queda en ${movDestino} y la tasa guardada para los próximos movimientos.`
                    : `Lo que llega en ${codigoMedio} se divide por la tasa y queda en ${movDestino}: 82.500 ÷ 3.280 = 25,15.`
                  : nMovCantidad && movFactor && movMonto
                    ? `${formatearMonto(nMovCantidad)} ${codigoMedio} × ${formatearMonto(movFactor)} = ${formatearMonto(movMonto)} ${movDestinoTasa}. La cuenta del cliente queda en ${movDestinoTasa} y la tasa guardada para los próximos movimientos.`
                    : `Cantidad × tasa = total en ${movDestinoTasa}. En "Se entrega en" se elige la moneda: llega en una y se entrega en otra (ej. USDT × tasa = bolívares). La tasa queda guardada para los próximos movimientos del cliente.`}
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
            {enLinea && !movResta && <PagoConfirmacion valor={movPago} onCambio={setMovPago} medioNombre={medio?.nombre} total={movMonto ?? null} />}
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
