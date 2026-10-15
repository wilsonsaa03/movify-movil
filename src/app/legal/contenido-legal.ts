/**
 * Textos legales de MoviFY que se muestran en /terminos y /privacidad.
 *
 * IMPORTANTE
 *  - La versión debe coincidir con la fila activa de la tabla documentos_legales del backend
 *    (eso es lo que la persona acepta al registrarse y queda guardado en aceptaciones_legales).
 *    Si cambias el texto de fondo, sube la versión aquí Y crea la nueva versión en la base de datos.
 *  - Es un borrador para un proyecto en desarrollo: antes de publicar la app, un abogado debe revisarlo
 *    y hay que completar los datos del responsable (razón social y NIT).
 */

export type TipoLegal = 'terminos' | 'privacidad';

export interface SeccionLegal {
  id: string;
  titulo: string;
  parrafos?: string[];
  lista?: string[];
  /** Párrafo que va después de la lista. */
  cierre?: string;
}

export interface DocumentoLegal {
  tipo: TipoLegal;
  titulo: string;
  version: string;
  vigenteDesde: string;
  resumen: string;
  secciones: SeccionLegal[];
}

/** Datos de quien responde por la plataforma. Completar razón social y NIT antes de publicar. */
export const RESPONSABLE = {
  nombre: 'MoviFY',
  razonSocial: '', // p. ej. "MoviFY S.A.S."
  nit: '',
  domicilio: 'Buenaventura, Valle del Cauca, Colombia',
  correo: 'soporte@movify.co',
};

const quienEsResponsable = (): string =>
  [
    RESPONSABLE.razonSocial || RESPONSABLE.nombre,
    RESPONSABLE.nit ? `NIT ${RESPONSABLE.nit}` : '',
    `con domicilio en ${RESPONSABLE.domicilio}`,
    `correo ${RESPONSABLE.correo}`,
  ]
    .filter(Boolean)
    .join(', ');

export const TERMINOS: DocumentoLegal = {
  tipo: 'terminos',
  titulo: 'Términos y condiciones',
  version: '1.0',
  vigenteDesde: '15 de octubre de 2026',
  resumen:
    'MoviFY es una plataforma que conecta a personas que necesitan moverse, pedir un domicilio o enviar un paquete en Buenaventura con conductores de moto y taxi. Aquí te contamos las reglas para usarla.',
  secciones: [
    {
      id: 'que-es',
      titulo: '1. Qué es MoviFY',
      parrafos: [
        `MoviFY (${quienEsResponsable()}) ofrece una aplicación móvil y una página web que conectan a clientes con conductores independientes que prestan servicios de transporte en moto, transporte en taxi, domicilios y diligencias, y envío de encomiendas pequeñas dentro de Buenaventura.`,
        'MoviFY no presta directamente el servicio de transporte ni de mensajería: pone en contacto a las partes, muestra la tarifa estimada, el estado de cada solicitud y la información del conductor y del vehículo.',
      ],
    },
    {
      id: 'aceptacion',
      titulo: '2. Aceptación',
      parrafos: [
        'Al crear tu cuenta o al usar la plataforma aceptas estos términos y la Política de privacidad. Si no estás de acuerdo, no uses MoviFY.',
        'Podemos actualizar estos términos. Cuando el cambio sea importante te lo avisaremos en la app y te pediremos aceptarlo de nuevo antes de seguir usando el servicio.',
      ],
    },
    {
      id: 'cuenta',
      titulo: '3. Tu cuenta',
      lista: [
        'Debes ser mayor de 18 años para crear una cuenta.',
        'Te registras con tu número de celular, que verificamos con un código por SMS, o con tu cuenta de Google.',
        'Tu clave de 4 dígitos es personal. No la compartas: lo que se haga con tu cuenta es tu responsabilidad.',
        'Los datos que registres deben ser reales y estar al día.',
        'Si crees que alguien usó tu cuenta, escríbenos de inmediato.',
      ],
    },
    {
      id: 'servicios',
      titulo: '4. Cómo funcionan los servicios',
      lista: [
        'Eliges el servicio (moto, taxi, domicilio o encomienda), el punto de recogida y el destino.',
        'La app te muestra una tarifa estimada antes de confirmar. Puede variar si cambias el destino o el recorrido durante el servicio.',
        'Un conductor disponible y autorizado para ese servicio acepta la solicitud. Verás su nombre, su foto, la placa y el tipo de vehículo.',
        'Puedes seguir el estado de tu solicitud y consultar tu historial en la app.',
      ],
    },
    {
      id: 'pagos',
      titulo: '5. Tarifas y pagos',
      parrafos: [
        'Las tarifas se calculan con las reglas que MoviFY publica para cada tipo de servicio y pueden ser distintas para moto, taxi, domicilios y encomiendas.',
        'Por ahora MoviFY no procesa pagos dentro de la app: el valor del servicio se paga directamente al conductor. Si más adelante habilitamos otros medios de pago, te lo informaremos y actualizaremos estos términos.',
      ],
    },
    {
      id: 'envios',
      titulo: '6. Domicilios y encomiendas',
      parrafos: ['Quien pide un domicilio o envía una encomienda debe describir con honestidad lo que se transporta. No se permite enviar:'],
      lista: [
        'Armas, municiones, explosivos o pólvora.',
        'Drogas o sustancias ilícitas, y medicamentos de control sin la fórmula correspondiente.',
        'Dinero en efectivo, joyas o títulos valores.',
        'Animales vivos.',
        'Sustancias inflamables, tóxicas o peligrosas.',
        'Cualquier objeto cuyo transporte esté prohibido por la ley.',
        'Paquetes que superen el tamaño o el peso que el vehículo puede llevar con seguridad.',
      ],
      cierre: 'El conductor puede negarse a recibir un envío si sospecha que incumple estas reglas.',
    },
    {
      id: 'conductores',
      titulo: '7. Conductores',
      lista: [
        'Los conductores son independientes: no son empleados de MoviFY.',
        'Para activarse deben registrar su vehículo y subir los documentos que exige la app (identidad, licencia de conducción, SOAT, revisión técnico-mecánica cuando aplique, tarjeta de propiedad y los demás que correspondan). MoviFY los revisa antes de aprobar la cuenta.',
        'Cada conductor solo recibe solicitudes del tipo de servicio para el que fue aprobado.',
        'La revisión de MoviFY no reemplaza los permisos, licencias o autorizaciones que exijan las autoridades de tránsito y transporte. Cada conductor es responsable de cumplirlos.',
        'Los conductores deben tratar con respeto a los clientes y conducir con prudencia, respetando las normas de tránsito.',
      ],
    },
    {
      id: 'conducta',
      titulo: '8. Uso adecuado',
      parrafos: ['No está permitido:'],
      lista: [
        'Crear cuentas falsas o hacerse pasar por otra persona.',
        'Pedir servicios que no piensas tomar o cancelar de forma repetida sin motivo.',
        'Agredir, amenazar, acosar o discriminar a otro usuario.',
        'Usar la plataforma para actividades ilegales.',
        'Intentar acceder a datos de otras personas o alterar el funcionamiento de la app.',
      ],
      cierre: 'Si incumples estas reglas podemos suspender o cerrar tu cuenta.',
    },
    {
      id: 'cancelaciones',
      titulo: '9. Cancelaciones',
      parrafos: [
        'Puedes cancelar una solicitud mientras el servicio no haya empezado. El conductor también puede cancelar por motivos justificados, como un riesgo para su seguridad.',
        'Las cancelaciones quedan registradas en el historial y pueden tenerse en cuenta para revisar el comportamiento de una cuenta.',
      ],
    },
    {
      id: 'seguridad',
      titulo: '10. Seguridad',
      parrafos: [
        'Antes de subir al vehículo, confirma que el nombre, la foto y la placa coincidan con lo que muestra la app.',
        'Si tienes una emergencia, comunícate primero con la línea 123. Después cuéntanos lo ocurrido para revisar el caso.',
      ],
    },
    {
      id: 'responsabilidad',
      titulo: '11. Responsabilidad',
      parrafos: [
        'MoviFY trabaja para que la plataforma funcione bien, pero puede tener fallas por problemas de conexión, del celular o de servicios de terceros como mapas, SMS o Google.',
        'El conductor responde por la prestación del servicio. MoviFY responde por el funcionamiento de la plataforma y por el tratamiento de tus datos según la ley.',
        'Nada de lo dicho aquí limita los derechos que te reconoce el Estatuto del Consumidor (Ley 1480 de 2011).',
      ],
    },
    {
      id: 'pqrs',
      titulo: '12. Peticiones, quejas y reclamos',
      parrafos: [
        `Puedes escribirnos a ${RESPONSABLE.correo} para cualquier petición, queja, reclamo o sugerencia. Te responderemos dentro de los plazos que fija la ley.`,
      ],
    },
    {
      id: 'ley',
      titulo: '13. Ley aplicable',
      parrafos: ['Estos términos se rigen por las leyes de la República de Colombia.'],
    },
  ],
};

export const PRIVACIDAD: DocumentoLegal = {
  tipo: 'privacidad',
  titulo: 'Política de privacidad',
  version: '1.0',
  vigenteDesde: '15 de octubre de 2026',
  resumen:
    'Te explicamos qué datos tuyos recogemos, para qué los usamos, con quién los compartimos y cómo puedes conocerlos, corregirlos o pedir que los borremos. Cumplimos la Ley 1581 de 2012 y el Decreto 1377 de 2013.',
  secciones: [
    {
      id: 'responsable',
      titulo: '1. Quién responde por tus datos',
      parrafos: [
        `El responsable del tratamiento de tus datos personales es ${quienEsResponsable()}.`,
        `Para cualquier asunto sobre tus datos escríbenos a ${RESPONSABLE.correo}.`,
      ],
    },
    {
      id: 'datos',
      titulo: '2. Qué datos recogemos',
      parrafos: ['De todas las personas que usan MoviFY:'],
      lista: [
        'Nombre, apellidos y número de celular.',
        'Correo electrónico, si lo das o si entras con Google.',
        'Foto de perfil, si la subes o si viene de tu cuenta de Google.',
        'Tus direcciones guardadas y los puntos de recogida y destino de cada solicitud.',
        'Tu ubicación mientras pides o recibes un servicio, solo si das permiso en el celular.',
        'El historial de tus solicitudes, sus estados y las calificaciones.',
        'Datos técnicos: tipo de dispositivo y plataforma, dirección IP, fecha y hora de los accesos, y de cuándo aceptaste estos documentos.',
      ],
      cierre:
        'Además, de los conductores: número y tipo de documento de identidad, fecha de nacimiento, licencia de conducción y sus categorías, datos del vehículo, fotos del vehículo, una selfie para confirmar la identidad y los documentos del vehículo (SOAT, revisión técnico-mecánica, tarjeta de propiedad y los demás que exija la app).',
    },
    {
      id: 'para-que',
      titulo: '3. Para qué los usamos',
      lista: [
        'Crear tu cuenta, verificar tu celular y permitirte entrar de forma segura.',
        'Conectar tu solicitud con un conductor disponible y mostrarle a cada parte la información necesaria para prestar el servicio.',
        'Calcular la tarifa estimada y mostrar el estado y el seguimiento del servicio.',
        'Revisar los documentos de los conductores antes de aprobarlos.',
        'Atender peticiones, quejas, reclamos y emergencias.',
        'Prevenir fraudes y proteger la seguridad de las personas que usan la plataforma.',
        'Cumplir obligaciones legales y atender requerimientos de autoridades competentes.',
        'Mejorar la app con estadísticas que no te identifican.',
      ],
      cierre: 'No vendemos tus datos personales.',
    },
    {
      id: 'ubicacion',
      titulo: '4. Tu ubicación',
      parrafos: [
        'Usamos tu ubicación solo para el servicio que pediste: ubicar el punto de recogida, calcular la ruta y mostrar el avance.',
        'Al conductor le pedimos compartir su ubicación mientras está disponible y durante cada servicio. El cliente solo la ve mientras su servicio está activo.',
        'Puedes quitar el permiso de ubicación en los ajustes de tu celular. Sin él tendrás que escribir las direcciones a mano y algunas funciones no estarán disponibles.',
      ],
    },
    {
      id: 'sensibles',
      titulo: '5. Datos sensibles',
      parrafos: [
        'La selfie de verificación de los conductores es un dato biométrico y, por ley, un dato sensible. Solo la usamos para confirmar que quien se registra es el titular del documento, y no estás obligado a darla.',
        'Sin embargo, sin esa verificación no podemos aprobar una cuenta de conductor.',
      ],
    },
    {
      id: 'compartir',
      titulo: '6. Con quién compartimos tus datos',
      lista: [
        'Con el conductor o el cliente de cada servicio: nombre, foto, calificación, puntos del viaje y, en el caso del conductor, la placa y el tipo de vehículo.',
        'Con proveedores que nos ayudan a operar: envío de SMS (Twilio), inicio de sesión con Google, mapas y alojamiento de servidores. Solo reciben lo necesario para su tarea.',
        'Con autoridades, cuando una ley o una orden judicial lo exija.',
      ],
      cierre:
        'Algunos de estos proveedores guardan datos en servidores fuera de Colombia, por ejemplo en Estados Unidos. Al aceptar esta política autorizas esa transferencia, que hacemos con las garantías que exige la ley.',
    },
    {
      id: 'conservacion',
      titulo: '7. Cuánto tiempo los guardamos',
      parrafos: [
        'Guardamos tus datos mientras tengas una cuenta activa y, después, el tiempo necesario para cumplir obligaciones legales, atender reclamos o defendernos en procesos legales.',
        'Los códigos de verificación por SMS no se guardan tal cual (solo una huella cifrada) y vencen en pocos minutos.',
      ],
    },
    {
      id: 'seguridad',
      titulo: '8. Cómo los protegemos',
      lista: [
        'Tus claves se guardan cifradas (hash); nadie en MoviFY puede verlas.',
        'La comunicación entre la app y nuestros servidores va cifrada.',
        'Los documentos de los conductores solo los ve el personal autorizado que los revisa.',
        'Cada acceso al panel administrativo queda registrado.',
      ],
    },
    {
      id: 'derechos',
      titulo: '9. Tus derechos',
      parrafos: ['Como titular de tus datos puedes:'],
      lista: [
        'Conocer, actualizar y rectificar tus datos.',
        'Pedir prueba de la autorización que nos diste.',
        'Saber cómo hemos usado tus datos.',
        'Revocar la autorización o pedir que borremos tus datos, cuando no exista un deber legal de conservarlos.',
        'Presentar quejas ante la Superintendencia de Industria y Comercio (SIC).',
        'Acceder gratis a tus datos.',
      ],
    },
    {
      id: 'ejercer',
      titulo: '10. Cómo ejercer tus derechos',
      parrafos: [
        `Escríbenos a ${RESPONSABLE.correo} desde el correo o el celular registrado en tu cuenta. Cuéntanos qué necesitas.`,
        'Las consultas se responden en máximo 10 días hábiles, prorrogables 5 días más. Los reclamos (corregir, actualizar o borrar datos) se responden en máximo 15 días hábiles, prorrogables 8 días más. Si debemos prorrogar, te avisaremos el motivo.',
        'Antes de acudir a la SIC debes presentar tu reclamo ante MoviFY.',
      ],
    },
    {
      id: 'menores',
      titulo: '11. Menores de edad',
      parrafos: ['MoviFY no está dirigida a menores de 18 años y no creamos cuentas para ellos a sabiendas.'],
    },
    {
      id: 'autorizacion',
      titulo: '12. Autorización',
      parrafos: [
        'Al aceptar esta política en el registro autorizas de forma previa, expresa e informada a MoviFY para tratar tus datos con las finalidades descritas aquí. Guardamos la fecha, la versión aceptada y el dispositivo desde el que lo hiciste.',
      ],
    },
    {
      id: 'cambios',
      titulo: '13. Cambios en esta política',
      parrafos: [
        'Si cambiamos esta política de forma importante te avisaremos en la app y, cuando la ley lo exija, te pediremos una nueva autorización.',
      ],
    },
  ],
};

export const DOCUMENTOS_LEGALES: Record<TipoLegal, DocumentoLegal> = {
  terminos: TERMINOS,
  privacidad: PRIVACIDAD,
};
