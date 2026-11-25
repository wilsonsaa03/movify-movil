import type { CapacitorConfig } from '@capacitor/cli';

/**
 * APK de pruebas (por defecto): la app instalada habla con el backend del PC por Wi-Fi, que es http.
 *   - androidScheme 'http': la app corre en http://localhost (sigue siendo "origen seguro", el GPS funciona)
 *     y puede llamar a http://192.168.x.x sin que el WebView lo bloquee como contenido mixto.
 *   - cleartext: permite tráfico http (Android lo bloquea desde la versión 9).
 * Para publicar en Play Store: MOVIFY_PUBLICAR=1 npx cap sync android → https y sin http.
 */
const publicar = process.env['MOVIFY_PUBLICAR'] === '1';

const config: CapacitorConfig = {
  appId: 'co.movify.app',
  appName: 'MoviFY',
  webDir: 'www',
  server: publicar ? { androidScheme: 'https' } : { androidScheme: 'http', cleartext: true },
  android: {
    allowMixedContent: !publicar,
    // GPS del conductor en segundo plano (@capacitor-community/background-geolocation): sin esto Android
    // corta las actualizaciones de ubicación a los 5 minutos con la pantalla apagada.
    useLegacyBridge: true,
  },
  plugins: {
    // Solo Google: sin el SDK de Facebook (y sin el permiso AD_ID que pide la Play Store)
    SocialLogin: {
      providers: { google: true, facebook: false, apple: false, twitter: false },
    },
    LocalNotifications: {
      // Ícono blanco de la barra de estado (res/drawable/ic_movify_aviso.xml)
      smallIcon: 'ic_movify_aviso',
      iconColor: '#02AAB4',
    },
  },
};

export default config;
