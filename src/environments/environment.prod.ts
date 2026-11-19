export const environment = {
  production: true,
  // Backend desplegado en Dokploy (APK: npm run apk:deploy)
  apiUrl: 'https://movify.sarriatech.tech/api',
  /**
   * Cliente OAuth "MoviFY Web" de Google Cloud (el mismo de la web y del backend: app.google.client-id).
   * No es secreto: Google lo exige visible en el navegador. El "secreto del cliente" NUNCA va aquí.
   */
  googleClientId: '613651963678-99u5b1boql9q6fj65l0kairjh8ptdk4h.apps.googleusercontent.com',
};
