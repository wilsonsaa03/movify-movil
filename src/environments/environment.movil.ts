// APK de pruebas (npm run apk:pruebas): la app instalada en el celular habla con el backend del PC por Wi-Fi.
// Dentro del APK la página es http://localhost (el propio celular), por eso aquí va la IP del PC.
// Si cambia (ipconfig → "Adaptador de LAN inalámbrica Wi-Fi" → Dirección IPv4), edítala y vuelve a generar el APK.
const IP_DEL_PC = '10.0.26.187';

export const environment = {
  production: true,
  apiUrl: `http://${IP_DEL_PC}:8080/api`,
  /** Cliente OAuth "MoviFY Web" de Google Cloud. No es secreto. */
  googleClientId: '613651963678-99u5b1boql9q6fj65l0kairjh8ptdk4h.apps.googleusercontent.com',
  /** true solo con android/app/google-services.json (ver environment.prod.ts). */
  pushFirebase: false,
};
