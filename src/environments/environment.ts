// Desarrollo. El backend se busca en el mismo equipo desde el que se abrió la app:
//   en el PC → http://localhost:8080/api
//   en el celular (ionic serve --external) → http://192.168.x.x:8080/api (la IP del PC)
// Así no hay que editar este archivo al probar en el celular por Wi-Fi.
const servidor = typeof location !== 'undefined' && location.hostname ? location.hostname : 'localhost';

export const environment = {
  production: false,
  apiUrl: `http://${servidor}:8080/api`,
  /**
   * Cliente OAuth "MoviFY Web" de Google Cloud (el mismo de la web y del backend: app.google.client-id).
   * No es secreto: Google lo exige visible en el navegador. El "secreto del cliente" NUNCA va aquí.
   */
  googleClientId: '613651963678-99u5b1boql9q6fj65l0kairjh8ptdk4h.apps.googleusercontent.com',
  /** true solo con android/app/google-services.json (ver environment.prod.ts). */
  pushFirebase: false,
};
