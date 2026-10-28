import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { RequireAuth } from "../auth/RequireAuth";
import { RequireRole } from "../auth/RequireRole";
import { LoginPage } from "../auth/LoginPage";
import { LauncherPage } from "../modules/launcher/LauncherPage";
import { CajaPage } from "../modules/caja/CajaPage";
import { ClientesPage } from "../modules/clientes/ClientesPage";
import { ClienteFichaPage } from "../modules/clientes/ClienteFichaPage";
import { SolicitudesPage } from "../modules/solicitudes/SolicitudesPage";
import { TransaccionesPage } from "../modules/transacciones/TransaccionesPage";
import { CuentasPorCobrarPagarPage } from "../modules/cuentasPorCobrarPagar/CuentasPorCobrarPagarPage";
import { CuentasCorrientesPage } from "../modules/cuentasCorrientes/CuentasCorrientesPage";
import { TaquillaPage } from "../modules/taquilla/TaquillaPage";
import { TaquillasConfigPage } from "../modules/taquilla/TaquillasConfigPage";
import { CajaFuertePage } from "../modules/cajaFuerte/CajaFuertePage";
import { TasasPage } from "../modules/tasas/TasasPage";
import { ROLES_REGISTRO_TASAS } from "../modules/tasas/tasas.roles";
import { CierreCajaPage } from "../modules/cierreCaja/CierreCajaPage";
import { ReportesPage } from "../modules/reportes/ReportesPage";
import { RendimientoPage } from "../modules/rendimiento/RendimientoPage";
import { GastosPage } from "../modules/gastos/GastosPage";
import { UsuariosPage } from "../modules/usuarios/UsuariosPage";
import { NuevaTransaccionPage } from "../modules/nuevaTransaccion/NuevaTransaccionPage";
import { WhatsAppPage } from "../modules/whatsapp/WhatsAppPage";
import { CajasPage } from "../modules/cajas/CajasPage";
import { CajaDetallePage } from "../modules/cajas/CajaDetallePage";
import { CuentasEmpresaPage } from "../modules/cuentasEmpresa/CuentasEmpresaPage";
import { CapitalPage } from "../modules/capital/CapitalPage";



function TaquillaPorRuta() {
  const { pathname } = useLocation();
  const numero = Number(/^\/taquilla-(\d+)\/?$/.exec(pathname)?.[1]);
  if (!numero) return <Navigate to="/" replace />;
  return <TaquillaPage key={`taquilla-${numero}`} numero={numero} />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/" element={<LauncherPage />} />
        <Route path="/caja" element={<CajaPage />} />
        <Route path="/tasas" element={<TasasPage />} />
        <Route path="/cuentas-por-cobrar-pagar" element={<CuentasPorCobrarPagarPage key="cobrar" />} />
        <Route path="/cuentas-por-pagar" element={<CuentasPorCobrarPagarPage key="pagar" modo="pagar" />} />
        <Route path="/clientes" element={<ClientesPage />} />
        <Route path="/clientes/:id" element={<ClienteFichaPage />} />
        <Route path="/cuentas-corrientes" element={<CuentasCorrientesPage />} />
        <Route path="/cajas-confirmaciones" element={<CuentasCorrientesPage key="cajas" modo="cajas" />} />
        <Route path="/taquilla" element={<TaquillaPage key="taquilla-1" numero={1} />} />
        <Route path="/caja-fuerte" element={<CajaFuertePage />} />
        <Route path="/reportes" element={<ReportesPage />} />
        <Route path="/rendimiento" element={<RendimientoPage />} />
        <Route path="/solicitudes" element={<SolicitudesPage />} />
        <Route path="/transacciones" element={<TransaccionesPage />} />
        <Route path="/cierre-caja" element={<CierreCajaPage />} />
        <Route element={<RequireRole roles={ROLES_REGISTRO_TASAS} />}>
          {/* la carga de tasas es en el tablero: el registro viejo lleva allá */}
          <Route path="/tasas/registro" element={<Navigate to="/tasas" replace />} />
        </Route>
        {/* Mismos roles que el backend acepta en POST /transacciones/cambio */}
        <Route element={<RequireRole roles={["ADMIN", "ASESOR", "CAJERO"]} />}>
          <Route path="/nueva-transaccion" element={<NuevaTransaccionPage />} />
        </Route>
        {/* Mismos roles que el backend acepta en /cajas/tablero y /cajas/transferencias */}
        <Route element={<RequireRole roles={["ADMIN", "CAJERO"]} />}>
          <Route path="/cajas" element={<CajasPage />} />
          <Route path="/cajas/:id" element={<CajaDetallePage />} />
        </Route>
        <Route element={<RequireRole roles={["ADMIN"]} />}>
        <Route path="/usuarios" element={<UsuariosPage />} />
        {/* crear taquillas y habilitarlas o deshabilitarlas */}
        <Route path="/configuracion/taquillas" element={<TaquillasConfigPage />} />
        <Route path="/cuentas-empresa" element={<CuentasEmpresaPage />} />
        {/* Capital de giros: el cuadre de todo el negocio, solo administrador (se entra desde Cuentas por Cobrar) */}
        <Route path="/capital" element={<CapitalPage />} />
        {/* Gastos administrativos: nómina, sueldos y egresos del negocio, solo administrador */}
        <Route path="/gastos" element={<GastosPage />} />
        </Route>
        {/* Panel de chats: admin y asesor. Conexión y configuración de la IA: solo admin (lo decide la página y el backend) */}
        <Route element={<RequireRole roles={["ADMIN", "ASESOR"]} />}>
          <Route path="/whatsapp/*" element={<WhatsAppPage />} />
        </Route>
        {/* /taquilla-2, /taquilla-3… las que se creen en Configuración; cualquier otra ruta vuelve al panel */}
        <Route path="*" element={<TaquillaPorRuta />} />
      </Route>
    </Routes>
  );
}