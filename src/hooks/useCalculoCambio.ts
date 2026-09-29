import { useEffect, useMemo, useState } from "react";
import type { CotizacionDetalle } from "../api/tasas.api";
import type { Moneda } from "../api/monedas.api";
import { calcularCambio, type CalculoCambio, type CalculoCambioInput, type TipoCambio } from "../api/transacciones.api";
import { ApiError } from "../api/client";
import { esDecimalValido } from "../utils/montos";

// Cómo se nombra cada divisa en pantalla (el código queda para el backend).
export function nombreDivisa(codigo: string | undefined) {
  if (!codigo) return "divisa";
  return codigo === "VES" ? "Bs" : codigo;
}

/**
 * Las 4 operaciones de la casa de cambio, vistas desde la empresa: "Compra/Venta de X"
 * = la casa compra o vende X, y la cajera escribe el monto de X.
 * Al backend solo le importan dos cosas: el tipo (qué divisa entra o sale) y qué monto
 * se conoce (divisa -> multiplica, pesos -> divide).
 */
export type OperacionCambio = "COMPRA_DIVISA" | "VENTA_DIVISA" | "COMPRA_PESOS" | "VENTA_PESOS";

interface DefinicionOperacion {
  tipo: TipoCambio;
  montoEnPesos: boolean;
}

export const OPERACIONES: Record<OperacionCambio, DefinicionOperacion> = {
  COMPRA_DIVISA: { tipo: "COMPRA_DIVISA", montoEnPesos: false }, // trae Bs, se escriben los Bs que trae
  VENTA_DIVISA: { tipo: "VENTA_DIVISA", montoEnPesos: false }, // trae pesos, se escriben los Bs que se lleva
  COMPRA_PESOS: { tipo: "VENTA_DIVISA", montoEnPesos: true }, // trae pesos, se escriben los pesos que trae
  VENTA_PESOS: { tipo: "COMPRA_DIVISA", montoEnPesos: true }, // trae Bs, se escriben los pesos que se lleva
};

// Orden en pantalla: primero lo que la casa compra, después lo que vende.
export const ORDEN_OPERACIONES: OperacionCambio[] = ["COMPRA_DIVISA", "COMPRA_PESOS", "VENTA_DIVISA", "VENTA_PESOS"];

export function textosOperacion(op: OperacionCambio, divisa: string) {
  const { tipo, montoEnPesos } = OPERACIONES[op];
  const trae = tipo === "VENTA_DIVISA" ? "pesos" : divisa;
  const lleva = tipo === "VENTA_DIVISA" ? divisa : "pesos";
  const esCompra = op === "COMPRA_DIVISA" || op === "COMPRA_PESOS";
  return {
    esCompra,
    titulo: `${esCompra ? "Compra" : "Venta"} de ${montoEnPesos ? "pesos" : divisa}`,
    flujo: `Trae ${trae} → se lleva ${lleva}`,
    // Lo que se escribe es lo que la casa compra (el cliente lo trae) o vende (el cliente se lo lleva).
    etiquetaMonto: `${montoEnPesos ? "Pesos (COP)" : divisa} que ${esCompra ? "trae" : "se lleva"} el cliente`,
    ayudaMonto: montoEnPesos
      ? `Se divide por la tasa para saber cuántos ${divisa} ${esCompra ? "entregar" : "debe traer"}.`
      : `Se multiplica por la tasa para saber cuántos pesos ${esCompra ? "entregar" : "debe traer"}.`,
  };
}

interface Params {
  operacion: OperacionCambio | null;
  monedas: Moneda[];
  monedaExtranjeraId: number | "";
  monedaLocalId: number | "";
  // Compra: el monto es la divisa que trae el cliente. Venta: los pesos que trae.
  monto: string;
  cotizaciones: CotizacionDetalle[];
  cotizacionId: number | "";
  tasaManual: string;
}

/**
 * Vista previa del cambio calculada por el backend (POST /transacciones/cambio/calcular).
 * El front no multiplica ni divide: muestra lo que devuelve la API. `calculoInput` es
 * exactamente lo que después se manda a registrar, así lo registrado es lo que se vio.
 */
export function useCalculoCambio({
  operacion,
  monedas,
  monedaExtranjeraId,
  monedaLocalId,
  monto,
  cotizaciones,
  cotizacionId,
  tasaManual,
}: Params) {
  const [calculo, setCalculo] = useState<CalculoCambio | null>(null);
  const [calculoClave, setCalculoClave] = useState("");
  const [calculando, setCalculando] = useState(false);
  const [errorCalculo, setErrorCalculo] = useState<string | null>(null);

  const monedaCodigo = monedas.find((m) => m.id === monedaExtranjeraId)?.codigo;
  const divisa = nombreDivisa(monedaCodigo);
  const tipo = operacion ? OPERACIONES[operacion].tipo : null;
  const montoEnPesos = operacion ? OPERACIONES[operacion].montoEnPesos : false;
  // En VENTA_DIVISA el cliente entrega pesos y recibe la divisa; en COMPRA_DIVISA, al revés.
  const clienteTraePesos = tipo === "VENTA_DIVISA";
  const tipoCotizacion: "COMPRA" | "VENTA" = tipo === "COMPRA_DIVISA" ? "COMPRA" : "VENTA";

  // Tasas del día de esta divisa y del mismo tipo que la operación, solo precios fijos.
  const tasasDisponibles = useMemo(() => {
    if (!monedaCodigo || !tipo) return [];
    return cotizaciones.filter((c) => c.moneda_codigo === monedaCodigo && c.tipo === tipoCotizacion && c.valor != null);
  }, [cotizaciones, monedaCodigo, tipo, tipoCotizacion]);

  // Sin tasas cargadas para la combinación, la única opción es la manual.
  const usaTasaManual = tasasDisponibles.length === 0;

  // null mientras falte algo o haya un valor inválido.
  const calculoInput = useMemo<CalculoCambioInput | null>(() => {
    if (!tipo || !monedaExtranjeraId || !monedaLocalId || !esDecimalValido(monto)) return null;
    const base = { tipo, monedaExtranjeraId, monedaLocalId };
    const montoCampo = montoEnPesos ? { montoLocal: monto } : { cantidadExtranjera: monto };
    if (!usaTasaManual && cotizacionId && tasasDisponibles.some((t) => t.id === cotizacionId)) {
      return { ...base, ...montoCampo, cotizacionDetalleId: cotizacionId };
    }
    if (usaTasaManual && esDecimalValido(tasaManual)) return { ...base, ...montoCampo, tasaManual };
    return null;
  }, [tipo, monedaExtranjeraId, monedaLocalId, monto, montoEnPesos, usaTasaManual, cotizacionId, tasasDisponibles, tasaManual]);

  const claveActual = calculoInput ? JSON.stringify(calculoInput) : "";
  // Solo vale el resultado calculado para los datos que están en pantalla ahora.
  const calculoVigente = calculo != null && claveActual !== "" && calculoClave === claveActual ? calculo : null;

  useEffect(() => {
    setErrorCalculo(null);
    if (!calculoInput) {
      setCalculando(false);
      return;
    }
    let vigente = true;
    setCalculando(true);
    const clave = JSON.stringify(calculoInput);
    const t = setTimeout(() => {
      calcularCambio(calculoInput)
        .then((r) => {
          if (!vigente) return;
          setCalculo(r);
          setCalculoClave(clave);
        })
        .catch((err) => {
          if (vigente) setErrorCalculo(err instanceof ApiError ? err.message : "No se pudo calcular la operación.");
        })
        .finally(() => {
          if (vigente) setCalculando(false);
        });
    }, 350);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [calculoInput]);

  return {
    divisa,
    tipo,
    montoEnPesos,
    clienteTraePesos,
    tipoCotizacion,
    tasasDisponibles,
    usaTasaManual,
    calculoInput,
    calculoVigente,
    calculando,
    errorCalculo,
  };
}
