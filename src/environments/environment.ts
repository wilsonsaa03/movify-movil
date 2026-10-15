// Desarrollo. En el celular, "localhost" es el propio celular: usa la IP de tu PC
// (ipconfig → Dirección IPv4), por ejemplo 'http://192.168.1.15:8080/api'.
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8080/api',
  /**
   * Cliente OAuth "MoviFY Web" de Google Cloud (el mismo de la web y del backend: app.google.client-id).
   * No es secreto: Google lo exige visible en el navegador. El "secreto del cliente" NUNCA va aquí.
   */
  googleClientId: '613651963678-99u5b1boql9q6fj65l0kairjh8ptdk4h.apps.googleusercontent.com',
};
