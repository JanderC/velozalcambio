import { Routes, Route } from "react-router-dom";
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
import { TasasPage } from "../modules/tasas/TasasPage";
import { RegistroTasasPage } from "../modules/tasas/RegistroTasasPage";
import { ROLES_REGISTRO_TASAS } from "../modules/tasas/tasas.roles";
import { CierreCajaPage } from "../modules/cierreCaja/CierreCajaPage";
import { ReportesPage } from "../modules/reportes/ReportesPage";
import { UsuariosPage } from "../modules/usuarios/UsuariosPage";
import { NuevaTransaccionPage } from "../modules/nuevaTransaccion/NuevaTransaccionPage";
import { WhatsAppPage } from "../modules/whatsapp/WhatsAppPage";
import { CajasPage } from "../modules/cajas/CajasPage";



export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/" element={<LauncherPage />} />
        <Route path="/caja" element={<CajaPage />} />
        <Route path="/tasas" element={<TasasPage />} />
        <Route path="/cuentas-por-cobrar-pagar" element={<CuentasPorCobrarPagarPage />} />
        <Route path="/clientes" element={<ClientesPage />} />
        <Route path="/clientes/:id" element={<ClienteFichaPage />} />
        <Route path="/cuentas-corrientes" element={<CuentasCorrientesPage />} />
        <Route path="/reportes" element={<ReportesPage />} />        <Route path="/solicitudes" element={<SolicitudesPage />} />
        <Route path="/transacciones" element={<TransaccionesPage />} />
        <Route path="/cierre-caja" element={<CierreCajaPage />} />
        <Route element={<RequireRole roles={ROLES_REGISTRO_TASAS} />}>
          <Route path="/tasas/registro" element={<RegistroTasasPage />} />
        </Route>
        {/* Mismos roles que el backend acepta en POST /transacciones/cambio */}
        <Route element={<RequireRole roles={["ADMIN", "ASESOR", "CAJERO"]} />}>
          <Route path="/nueva-transaccion" element={<NuevaTransaccionPage />} />
        </Route>
        {/* Mismos roles que el backend acepta en /cajas/tablero y /cajas/transferencias */}
        <Route element={<RequireRole roles={["ADMIN", "CAJERO"]} />}>
          <Route path="/cajas" element={<CajasPage />} />
        </Route>
        <Route element={<RequireRole roles={["ADMIN"]} />}>
        <Route path="/usuarios" element={<UsuariosPage />} />
        <Route path="/whatsapp" element={<WhatsAppPage />} />
        </Route>
      </Route>
    </Routes>
  );
}