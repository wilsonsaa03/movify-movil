import { Routes } from '@angular/router';
import { celularVerificado, conCelular, conDatos, conRol, cuentaCreada } from './servicios/registro.guards';
import { conSesion, irAlPaso } from './servicios/conductor.guards';
import { invitadoGuard, rolGuard } from './core/auth.guards';
import { recuperarClaveCambiada, recuperarCodigoVerificado, recuperarConCelular } from './servicios/recuperar.guards';

const pendiente = (titulo: string, roles: string[] = []) => ({
  loadComponent: () => import('./pages/pendiente/pendiente.page').then((m) => m.PendientePage),
  data: { titulo, roles },
});

/** Admin y soporte trabajan en la web; en el celular entran como cliente. */
const CLIENTE = ['cliente', 'admin', 'soporte'];

export const routes: Routes = [
  {
    path: 'bienvenida',
    canActivate: [invitadoGuard],
    loadComponent: () => import('./pages/bienvenida/bienvenida.page').then((m) => m.BienvenidaPage),
  },
  {
    path: 'inicio',
    canActivate: [invitadoGuard],
    loadComponent: () => import('./pages/inicio/inicio.page').then((m) => m.InicioPage),
  },

  {
    path: 'login',
    canActivate: [invitadoGuard],
    loadComponent: () => import('./pages/iniciar-sesion/iniciar-sesion.page').then((m) => m.IniciarSesionPage),
  },
  {
    path: 'registro',
    canActivate: [invitadoGuard],
    loadComponent: () => import('./pages/crear-cuenta/crear-cuenta.page').then((m) => m.CrearCuentaPage),
  },

  {
    path: 'login/google',
    canActivate: [invitadoGuard],
    loadComponent: () => import('./pages/login-google/login-google.page').then((m) => m.LoginGooglePage),
  },
  {
    path: 'login/clave',
    canActivate: [invitadoGuard],
    loadComponent: () => import('./pages/clave-login/clave-login.page').then((m) => m.ClaveLoginPage),
  },

  // Registro (cliente y conductor comparten estos 4 pasos)
  {
    path: 'registro/celular',
    canActivate: [conRol],
    loadComponent: () => import('./pages/registro/celular/registro-celular.page').then((m) => m.RegistroCelularPage),
  },
  {
    path: 'registro/codigo',
    canActivate: [conRol, conCelular],
    loadComponent: () => import('./pages/registro/codigo/registro-codigo.page').then((m) => m.RegistroCodigoPage),
  },
  {
    path: 'registro/datos',
    canActivate: [conRol, celularVerificado],
    loadComponent: () => import('./pages/registro/datos/registro-datos.page').then((m) => m.RegistroDatosPage),
  },
  {
    path: 'registro/clave',
    canActivate: [conRol, conDatos],
    loadComponent: () => import('./pages/registro/clave/registro-clave.page').then((m) => m.RegistroClavePage),
  },
  {
    path: 'registro/listo',
    canActivate: [cuentaCreada],
    loadComponent: () => import('./pages/registro/listo/registro-listo.page').then((m) => m.RegistroListoPage),
  },

  // Registro del conductor (moto o taxi): "/conductor" abre el paso en el que va
  { path: 'conductor', pathMatch: 'full', canActivate: [irAlPaso], children: [] },
  {
    path: 'conductor/tipo',
    canActivate: [conSesion],
    loadComponent: () => import('./pages/conductor/tipo/conductor-tipo.page').then((m) => m.ConductorTipoPage),
  },
  {
    path: 'conductor/identidad',
    canActivate: [conSesion],
    loadComponent: () => import('./pages/conductor/identidad/conductor-identidad.page').then((m) => m.ConductorIdentidadPage),
  },
  {
    path: 'conductor/licencia',
    canActivate: [conSesion],
    loadComponent: () => import('./pages/conductor/licencia/conductor-licencia.page').then((m) => m.ConductorLicenciaPage),
  },
  {
    path: 'conductor/vehiculo',
    canActivate: [conSesion],
    loadComponent: () => import('./pages/conductor/vehiculo/conductor-vehiculo.page').then((m) => m.ConductorVehiculoPage),
  },
  {
    path: 'conductor/documentos',
    canActivate: [conSesion],
    loadComponent: () => import('./pages/conductor/documentos/conductor-documentos.page').then((m) => m.ConductorDocumentosPage),
  },
  {
    path: 'conductor/revisar',
    canActivate: [conSesion],
    loadComponent: () => import('./pages/conductor/revisar/conductor-revisar.page').then((m) => m.ConductorRevisarPage),
  },
  {
    path: 'conductor/enviada',
    canActivate: [conSesion],
    loadComponent: () => import('./pages/conductor/enviada/conductor-enviada.page').then((m) => m.ConductorEnviadaPage),
  },
  // App del conductor (Conductor app 1 · Inicio)
  {
    path: 'conductor/inicio',
    canActivate: [rolGuard],
    data: { roles: ['conductor'] },
    loadComponent: () => import('./pages/conductor/inicio/conductor-inicio.page').then((m) => m.ConductorInicioPage),
  },
  // Conductor app 2 · Nueva solicitud (?id=servicio)
  {
    path: 'conductor/viaje/solicitud',
    canActivate: [rolGuard],
    data: { roles: ['conductor'] },
    loadComponent: () => import('./pages/conductor/solicitud/conductor-solicitud.page').then((m) => m.ConductorSolicitudPage),
  },
  // Siguen en el flujo del conductor (provisionales)
  { path: 'conductor/viaje/recogida', canActivate: [rolGuard], ...pendiente('Rumbo al pasajero', ['conductor']) },
  { path: 'conductor/viajes', canActivate: [rolGuard], ...pendiente('Mis viajes', ['conductor']) },
  { path: 'conductor/ganancias', canActivate: [rolGuard], ...pendiente('Ganancias', ['conductor']) },
  { path: 'conductor/perfil', canActivate: [rolGuard], ...pendiente('Mi perfil', ['conductor']) },
  { path: 'conductor/notificaciones', canActivate: [rolGuard], ...pendiente('Notificaciones', ['conductor']) },

  // App del cliente (Viaje 1 · Inicio)
  {
    path: 'cliente',
    canActivate: [rolGuard],
    data: { roles: CLIENTE },
    loadComponent: () => import('./pages/cliente/inicio/cliente-inicio.page').then((m) => m.ClienteInicioPage),
  },
  // Pedir moto o taxi: Viaje 2 (¿A dónde vas?) → 3 (Elige moto o taxi) → 4 (Buscando, ?id=servicio)
  {
    path: 'cliente/viaje/destino',
    canActivate: [rolGuard],
    data: { roles: CLIENTE },
    loadComponent: () => import('./pages/cliente/viaje/destino/viaje-destino.page').then((m) => m.ViajeDestinoPage),
  },
  {
    path: 'cliente/viaje/confirmar',
    canActivate: [rolGuard],
    data: { roles: CLIENTE },
    loadComponent: () => import('./pages/cliente/viaje/confirmar/viaje-confirmar.page').then((m) => m.ViajeConfirmarPage),
  },
  {
    path: 'cliente/viaje/buscando',
    canActivate: [rolGuard],
    data: { roles: CLIENTE },
    loadComponent: () => import('./pages/cliente/viaje/buscando/viaje-buscando.page').then((m) => m.ViajeBuscandoPage),
  },
  // Siguen en el flujo del cliente (provisionales)
  { path: 'cliente/viaje/en-camino', canActivate: [rolGuard], ...pendiente('Tu conductor va en camino', CLIENTE) },
  { path: 'cliente/domicilio', canActivate: [rolGuard], ...pendiente('Domicilio', CLIENTE) },
  { path: 'cliente/encomienda', canActivate: [rolGuard], ...pendiente('Encomienda', CLIENTE) },
  // Viaje 8 · Reporte enviado (v2): "Recibimos tu reporte" (?id=ticket). La usan cliente y conductor.
  // El formulario de "Reportar usuario" que la precede sigue pendiente.
  {
    path: 'cliente/reporte/enviado',
    canActivate: [rolGuard],
    data: { roles: CLIENTE, inicio: '/cliente', viajes: '/cliente/pedidos' },
    loadComponent: () => import('./pages/reporte/enviado/reporte-enviado.page').then((m) => m.ReporteEnviadoPage),
  },
  {
    path: 'conductor/reporte/enviado',
    canActivate: [rolGuard],
    data: { roles: ['conductor'], inicio: '/conductor/inicio', viajes: '/conductor/viajes' },
    loadComponent: () => import('./pages/reporte/enviado/reporte-enviado.page').then((m) => m.ReporteEnviadoPage),
  },
  { path: 'cliente/reportes', canActivate: [rolGuard], ...pendiente('Mis reportes', CLIENTE) },
  { path: 'cliente/lugares', canActivate: [rolGuard], ...pendiente('Tus lugares', CLIENTE) },
  { path: 'cliente/pedidos', canActivate: [rolGuard], ...pendiente('Mis pedidos', CLIENTE) },
  { path: 'cliente/perfil', canActivate: [rolGuard], ...pendiente('Mi perfil', CLIENTE) },
  { path: 'cliente/notificaciones', canActivate: [rolGuard], ...pendiente('Notificaciones', CLIENTE) },

  // Pantallas que siguen (por ahora son provisionales)
  // Recuperar clave (4 pasos + listo): celular → código SMS → clave nueva → confirmar → listo
  {
    path: 'login/recuperar',
    canActivate: [invitadoGuard],
    loadComponent: () => import('./pages/recuperar/celular/recuperar-celular.page').then((m) => m.RecuperarCelularPage),
  },
  {
    path: 'login/recuperar/codigo',
    canActivate: [invitadoGuard, recuperarConCelular],
    loadComponent: () => import('./pages/recuperar/codigo/recuperar-codigo.page').then((m) => m.RecuperarCodigoPage),
  },
  {
    path: 'login/recuperar/clave',
    canActivate: [invitadoGuard, recuperarCodigoVerificado],
    loadComponent: () => import('./pages/recuperar/clave/recuperar-clave.page').then((m) => m.RecuperarClavePage),
  },
  {
    path: 'login/recuperar/listo',
    canActivate: [invitadoGuard, recuperarClaveCambiada],
    loadComponent: () => import('./pages/recuperar/listo/recuperar-listo.page').then((m) => m.RecuperarListoPage),
  },
  { path: 'explorar', ...pendiente('Explorar como invitado') },
  {
    path: 'terminos',
    data: { tipo: 'terminos' },
    loadComponent: () => import('./pages/legal/legal.page').then((m) => m.LegalPage),
  },
  {
    path: 'privacidad',
    data: { tipo: 'privacidad' },
    loadComponent: () => import('./pages/legal/legal.page').then((m) => m.LegalPage),
  },

  {
    // Plantilla original de Ionic (se borrará cuando existan las pantallas reales)
    path: '',
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
];
