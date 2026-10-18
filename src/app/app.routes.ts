import { Routes } from '@angular/router';
import { celularVerificado, conCelular, conDatos, conRol, cuentaCreada } from './servicios/registro.guards';
import { conSesion, irAlPaso } from './servicios/conductor.guards';
import { invitadoGuard, rolGuard } from './core/auth.guards';

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
  // Siguen en el flujo del conductor (provisionales)
  { path: 'conductor/viaje/solicitud', canActivate: [rolGuard], ...pendiente('Nueva solicitud', ['conductor']) },
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
  // Siguen en el flujo del cliente (provisionales)
  { path: 'cliente/viaje/destino', canActivate: [rolGuard], ...pendiente('¿A dónde vas?', CLIENTE) },
  { path: 'cliente/domicilio', canActivate: [rolGuard], ...pendiente('Domicilio', CLIENTE) },
  { path: 'cliente/encomienda', canActivate: [rolGuard], ...pendiente('Encomienda', CLIENTE) },
  { path: 'cliente/lugares', canActivate: [rolGuard], ...pendiente('Tus lugares', CLIENTE) },
  { path: 'cliente/pedidos', canActivate: [rolGuard], ...pendiente('Mis pedidos', CLIENTE) },
  { path: 'cliente/perfil', canActivate: [rolGuard], ...pendiente('Mi perfil', CLIENTE) },
  { path: 'cliente/notificaciones', canActivate: [rolGuard], ...pendiente('Notificaciones', CLIENTE) },

  // Pantallas que siguen (por ahora son provisionales)
  { path: 'login/recuperar', ...pendiente('Recuperar clave') },
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
