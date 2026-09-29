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

interface Params {
  tipo: TipoCambio | null;
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
  tipo,
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
    const montoCampo = clienteTraePesos ? { montoLocal: monto } : { cantidadExtranjera: monto };
    if (!usaTasaManual && cotizacionId && tasasDisponibles.some((t) => t.id === cotizacionId)) {
      return { ...base, ...montoCampo, cotizacionDetalleId: cotizacionId };
    }
    if (usaTasaManual && esDecimalValido(tasaManual)) return { ...base, ...montoCampo, tasaManual };
    return null;
  }, [tipo, monedaExtranjeraId, monedaLocalId, monto, clienteTraePesos, usaTasaManual, cotizacionId, tasasDisponibles, tasaManual]);

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
