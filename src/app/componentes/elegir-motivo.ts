import { AlertController } from '@ionic/angular';

/**
 * "¿Por qué cancelas?" (Uber y DiDi lo preguntan siempre): una lista de motivos de la tabla
 * motivos_cancelacion. Sirve para el admin (estadísticas) y para no castigar al conductor cuando
 * la culpa no fue suya.
 * @returns el id del motivo, o null si cerró la ventana (no cancela).
 */
export async function elegirMotivo(
  alertas: AlertController,
  titulo: string,
  mensaje: string,
  motivos: { id: number; texto: string }[],
  seguir = 'Volver',
): Promise<number | null> {
  const alerta = await alertas.create({
    header: titulo,
    message: mensaje,
    inputs: motivos.map((m, i) => ({ type: 'radio' as const, label: m.texto, value: m.id, checked: i === 0 })),
    buttons: [
      { text: seguir, role: 'cancel' },
      { text: 'Sí, cancelar', role: 'destructive' },
    ],
  });
  await alerta.present();
  const r = await alerta.onDidDismiss<{ values: number }>();
  if (r.role !== 'destructive') return null;
  return Number(r.data?.values) || motivos[0].id;
}
