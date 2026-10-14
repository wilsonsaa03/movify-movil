import { Routes } from '@angular/router';
import { celularVerificado, conCelular, conDatos, conRol, cuentaCreada } from './servicios/registro.guards';
import { conSesion, irAlPaso } from './servicios/conductor.guards';

const pendiente = (titulo: string) => ({
  loadComponent: () => import('./pages/pendiente/pendiente.page').then((m) => m.PendientePage),
  data: { titulo },
});

export const routes: Routes = [
  {
    path: 'bienvenida',
    loadComponent: () => import('./pages/bienvenida/bienvenida.page').then((m) => m.BienvenidaPage),
  },
  {
    path: 'inicio',
    loadComponent: () => import('./pages/inicio/inicio.page').then((m) => m.InicioPage),
  },

  {
    path: 'login',
    loadComponent: () => import('./pages/iniciar-sesion/iniciar-sesion.page').then((m) => m.IniciarSesionPage),
  },
  {
    path: 'registro',
    loadComponent: () => import('./pages/crear-cuenta/crear-cuenta.page').then((m) => m.CrearCuentaPage),
  },

  {
    path: 'login/clave',
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
  { path: 'conductor/inicio', ...pendiente('Panel del conductor') },

  // Pantallas que siguen (por ahora son provisionales)
  { path: 'login/recuperar', ...pendiente('Recuperar clave') },
  { path: 'login/google', ...pendiente('Entrar con Google') },
  { path: 'cliente', ...pendiente('Inicio del cliente') },
  { path: 'explorar', ...pendiente('Explorar como invitado') },
  { path: 'terminos', ...pendiente('Términos y condiciones') },
  { path: 'privacidad', ...pendiente('Política de privacidad') },

  {
    // Plantilla original de Ionic (se borrará cuando existan las pantallas reales)
    path: '',
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
];
