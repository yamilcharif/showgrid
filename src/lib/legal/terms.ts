// ShowGrid Terms of Use. Draft for review by a lawyer before launch.
// Bump TERMS_VERSION whenever the text changes in substance; profiles record the version accepted.

import type { Locale } from "../i18n/config";

export const TERMS_VERSION = "2026-11-02";

export interface TermsDoc {
  title: string;
  updated: string;
  intro: string;
  sections: { heading: string; body: string[] }[];
  /** the short disclaimer shown next to the "I agree" box */
  summary: string;
}

const en: TermsDoc = {
  title: "Terms of Use",
  updated: "Last updated: November 2, 2026",
  intro:
    "These Terms of Use (the “Terms”) govern your access to and use of show-grid.com and any related applications and services (together, “ShowGrid”, “we”, “us”). By creating an account, listing equipment or services, sending a message or request, or otherwise using ShowGrid, you agree to these Terms. If you do not agree, do not use ShowGrid.",
  summary:
    "ShowGrid is only a platform that connects rental companies, crew and clients. ShowGrid is not a party to any rental, booking, quote, payment or agreement between users, does not own or inspect any listed equipment, does not verify crew, and is not responsible for the transactions, conduct, equipment, services or disputes of its users.",
  sections: [
    {
      heading: "1. ShowGrid is a meeting place, not a party",
      body: [
        "ShowGrid is an online venue that lets rental companies, technicians, engineers and other users (“Members”) list equipment and services and contact each other. ShowGrid does not rent, sell, own, possess, inspect, deliver or insure any equipment, and does not employ, supervise, train or certify any crew member.",
        "Any rental, booking, quote, purchase, hire, payment or other arrangement made through or because of ShowGrid (a “Transaction”) is solely between the Members involved. ShowGrid is not a party to any Transaction, is not an agent, broker, employer or representative of any Member, and has no obligation to enforce, perform or guarantee any Transaction.",
      ],
    },
    {
      heading: "2. No verification and no endorsement",
      body: [
        "Listings, availability, prices, descriptions, photos, specifications, profiles, skills, experience and other content are provided by Members or imported from their own software (such as Rentman or Flex). ShowGrid does not verify, and makes no promise about, the accuracy, legality, quality, safety, condition, availability or suitability of any listing, equipment, service or Member.",
        "A “Verified” mark, if shown, means only that ShowGrid completed a limited check described on the site at that time. It is not an endorsement, warranty or guarantee.",
      ],
    },
    {
      heading: "3. Estimates and quotes",
      body: [
        "Totals shown in gear lists and requests are automatic estimates calculated from data supplied by Members. They are not offers, quotes or invoices and may be out of date or wrong. A price is binding only if the Members involved agree to it between themselves, for example by accepting a quote. Quotes sent through ShowGrid are issued by the sending Member, not by ShowGrid.",
      ],
    },
    {
      heading: "4. Your responsibilities in every Transaction",
      body: [
        "You are solely responsible for deciding whether to enter into a Transaction and on what terms, and for your own due diligence about the other party. This includes, without limitation: written rental or service agreements; deposits, payments, refunds and cancellations; delivery, pickup, setup and return; the condition, testing and safe operation of equipment; loss, theft and damage; insurance; licenses, permits and certifications; taxes and invoicing; workplace safety; and the employment or independent-contractor status of any crew you hire or work for.",
        "ShowGrid does not currently process payments or hold money for Members. Any payment is made directly between Members, at their own risk.",
      ],
    },
    {
      heading: "5. Disputes between Members",
      body: [
        "Any dispute arising from a Transaction or from contact made through ShowGrid is solely between the Members involved. You release ShowGrid and its owners, officers, employees and agents from all claims, demands and damages (actual and consequential) of every kind, known and unknown, arising out of or connected with such disputes, to the fullest extent permitted by law. ShowGrid may, but is not required to, help Members communicate about a dispute.",
      ],
    },
    {
      heading: "6. Your account and content",
      body: [
        "You must be at least 18 years old and able to enter into binding contracts, and you must give accurate information about yourself or the company you represent. You are responsible for everything done through your account and for keeping your sign-in details secure.",
        "You keep ownership of the content you post (listings, photos, descriptions, messages, quotes and files), and you give ShowGrid a worldwide, non-exclusive, royalty-free license to host, copy, display, adapt for display and distribute it in order to operate and promote ShowGrid. You confirm you have the right to post it, including any photos found through search tools, and that it does not infringe anyone’s rights.",
        "You may not post false or misleading listings, impersonate others, harass Members, send spam, scrape the site, interfere with its operation, or use ShowGrid for anything unlawful. We may remove content or suspend or close accounts at our discretion.",
      ],
    },
    {
      heading: "7. Third-party services",
      body: [
        "ShowGrid connects to services we do not control, such as inventory software (for example Rentman or Flex), email providers, maps and image search. Your use of those services is governed by their own terms. ShowGrid is not responsible for their availability, accuracy or conduct, or for data they provide.",
      ],
    },
    {
      heading: "8. Information you make public",
      body: [
        "Contact details, prices, inventory and other information you choose to show on your public page can be seen by anyone, including people without an account. Only publish what you are comfortable sharing.",
      ],
    },
    {
      heading: "9. Disclaimer of warranties",
      body: [
        "ShowGrid is provided “as is” and “as available”, without warranties of any kind, express or implied, including warranties of merchantability, fitness for a particular purpose, title, non-infringement, accuracy and uninterrupted or error-free operation, to the fullest extent permitted by law.",
      ],
    },
    {
      heading: "10. Limitation of liability",
      body: [
        "To the fullest extent permitted by law, ShowGrid and its owners, officers, employees and agents will not be liable for any indirect, incidental, special, consequential, exemplary or punitive damages, or for any loss of profits, revenue, data, equipment, bookings or goodwill, arising out of or related to ShowGrid, any Transaction, or any conduct of any Member, even if advised of the possibility of such damages.",
        "Our total liability for all claims relating to ShowGrid is limited to the greater of one hundred U.S. dollars (US$100) or the amount you paid ShowGrid in the twelve months before the claim.",
      ],
    },
    {
      heading: "11. Indemnification",
      body: [
        "You agree to defend, indemnify and hold harmless ShowGrid and its owners, officers, employees and agents from any claims, losses, liabilities, damages, costs and expenses (including reasonable attorneys’ fees) arising out of your use of ShowGrid, your content, your Transactions, or your breach of these Terms or of any law or the rights of others.",
      ],
    },
    {
      heading: "12. Changes and termination",
      body: [
        "We may change ShowGrid or these Terms at any time. If we make material changes we will update the date above and, where appropriate, ask you to accept the new Terms. Continuing to use ShowGrid after changes take effect means you accept them. You may stop using ShowGrid at any time.",
      ],
    },
    {
      heading: "13. Governing law",
      body: [
        "These Terms are governed by the laws of the State of Florida, United States, without regard to its conflict-of-laws rules. Any dispute with ShowGrid will be brought exclusively in the state or federal courts located in Miami-Dade County, Florida, and you consent to their jurisdiction. If any part of these Terms is found unenforceable, the rest remains in effect.",
      ],
    },
    {
      heading: "14. Contact",
      body: ["Questions about these Terms: hello@show-grid.com, or the Suggestions page on ShowGrid."],
    },
  ],
};

const es: TermsDoc = {
  title: "Términos de uso",
  updated: "Última actualización: 2 de noviembre de 2026",
  intro:
    "Estos Términos de uso (los “Términos”) regulan el acceso y uso de show-grid.com y de cualquier aplicación y servicio relacionado (en conjunto, “ShowGrid”, “nosotros”). Al crear una cuenta, publicar equipo o servicios, enviar un mensaje o una solicitud, o usar ShowGrid de cualquier otra forma, aceptas estos Términos. Si no estás de acuerdo, no uses ShowGrid.",
  summary:
    "ShowGrid es solo una plataforma que conecta empresas de renta, crew y clientes. ShowGrid no es parte de ninguna renta, reserva, cotización, pago o acuerdo entre usuarios, no es dueño ni inspecciona el equipo publicado, no verifica al crew y no es responsable de las transacciones, la conducta, el equipo, los servicios ni las disputas de sus usuarios.",
  sections: [
    {
      heading: "1. ShowGrid es un punto de encuentro, no una parte",
      body: [
        "ShowGrid es un espacio en línea que permite a empresas de renta, técnicos, ingenieros y otros usuarios (“Miembros”) publicar equipo y servicios y contactarse entre sí. ShowGrid no renta, vende, posee, inspecciona, entrega ni asegura ningún equipo, y no emplea, supervisa, capacita ni certifica a ningún miembro del crew.",
        "Cualquier renta, reserva, cotización, compra, contratación, pago u otro acuerdo hecho a través de ShowGrid o a raíz de él (una “Transacción”) es exclusivamente entre los Miembros involucrados. ShowGrid no es parte de ninguna Transacción, no es agente, corredor, empleador ni representante de ningún Miembro, y no tiene obligación de hacer cumplir, ejecutar ni garantizar ninguna Transacción.",
      ],
    },
    {
      heading: "2. Sin verificación ni respaldo",
      body: [
        "Los anuncios, la disponibilidad, los precios, las descripciones, las fotos, las especificaciones, los perfiles, las habilidades, la experiencia y demás contenido los aportan los Miembros o se importan de su propio software (como Rentman o Flex). ShowGrid no verifica ni promete nada sobre la exactitud, legalidad, calidad, seguridad, estado, disponibilidad o idoneidad de ningún anuncio, equipo, servicio o Miembro.",
        "Una marca de “Verificada”, si aparece, solo significa que ShowGrid completó una revisión limitada descrita en el sitio en ese momento. No es un respaldo, una garantía ni un aval.",
      ],
    },
    {
      heading: "3. Estimados y cotizaciones",
      body: [
        "Los totales que aparecen en listas de equipo y solicitudes son estimados automáticos calculados con datos de los Miembros. No son ofertas, cotizaciones ni facturas, y pueden estar desactualizados o ser incorrectos. Un precio es obligatorio solo si los Miembros lo acuerdan entre ellos, por ejemplo al aceptar una cotización. Las cotizaciones enviadas por ShowGrid las emite el Miembro que las envía, no ShowGrid.",
      ],
    },
    {
      heading: "4. Tus responsabilidades en cada Transacción",
      body: [
        "Tú eres el único responsable de decidir si haces una Transacción y en qué condiciones, y de investigar a la otra parte. Esto incluye, entre otros: contratos escritos de renta o de servicios; depósitos, pagos, reembolsos y cancelaciones; entrega, recogida, montaje y devolución; el estado, las pruebas y la operación segura del equipo; pérdida, robo y daños; seguros; licencias, permisos y certificaciones; impuestos y facturación; seguridad laboral; y la condición de empleado o contratista independiente de cualquier crew que contrates o para quien trabajes.",
        "Por ahora ShowGrid no procesa pagos ni guarda dinero de los Miembros. Cualquier pago se hace directamente entre Miembros, bajo su propio riesgo.",
      ],
    },
    {
      heading: "5. Disputas entre Miembros",
      body: [
        "Cualquier disputa derivada de una Transacción o de un contacto hecho por ShowGrid es exclusivamente entre los Miembros involucrados. Liberas a ShowGrid y a sus dueños, directivos, empleados y agentes de todo reclamo, demanda y daño (directo e indirecto) de cualquier tipo, conocido o no, que surja de esas disputas o esté relacionado con ellas, en la máxima medida que permita la ley. ShowGrid puede, sin estar obligado, ayudar a los Miembros a comunicarse sobre una disputa.",
      ],
    },
    {
      heading: "6. Tu cuenta y tu contenido",
      body: [
        "Debes tener al menos 18 años y capacidad para celebrar contratos vinculantes, y debes dar información verdadera sobre ti o la empresa que representas. Eres responsable de todo lo que se haga con tu cuenta y de mantener seguros tus datos de acceso.",
        "Conservas la propiedad del contenido que publicas (anuncios, fotos, descripciones, mensajes, cotizaciones y archivos) y otorgas a ShowGrid una licencia mundial, no exclusiva y sin regalías para alojarlo, copiarlo, mostrarlo, adaptarlo para mostrarlo y distribuirlo con el fin de operar y promocionar ShowGrid. Confirmas que tienes derecho a publicarlo, incluidas las fotos encontradas con herramientas de búsqueda, y que no infringe derechos de terceros.",
        "No puedes publicar anuncios falsos o engañosos, hacerte pasar por otros, acosar a Miembros, enviar spam, extraer datos del sitio, interferir con su funcionamiento ni usar ShowGrid para algo ilegal. Podemos eliminar contenido o suspender o cerrar cuentas a nuestra discreción.",
      ],
    },
    {
      heading: "7. Servicios de terceros",
      body: [
        "ShowGrid se conecta con servicios que no controlamos, como software de inventario (por ejemplo Rentman o Flex), proveedores de correo, mapas y búsqueda de imágenes. Su uso se rige por sus propios términos. ShowGrid no es responsable de su disponibilidad, exactitud o conducta, ni de los datos que proporcionan.",
      ],
    },
    {
      heading: "8. Información que haces pública",
      body: [
        "Los datos de contacto, precios, inventario y demás información que decides mostrar en tu página pública los puede ver cualquier persona, incluso sin cuenta. Publica solo lo que estés dispuesto a compartir.",
      ],
    },
    {
      heading: "9. Exclusión de garantías",
      body: [
        "ShowGrid se ofrece “tal cual” y “según disponibilidad”, sin garantías de ningún tipo, expresas o implícitas, incluidas las de comerciabilidad, idoneidad para un fin particular, titularidad, no infracción, exactitud y funcionamiento ininterrumpido o sin errores, en la máxima medida que permita la ley.",
      ],
    },
    {
      heading: "10. Limitación de responsabilidad",
      body: [
        "En la máxima medida que permita la ley, ShowGrid y sus dueños, directivos, empleados y agentes no serán responsables de daños indirectos, incidentales, especiales, consecuentes, ejemplares o punitivos, ni de pérdidas de ganancias, ingresos, datos, equipo, reservas o reputación, derivados de ShowGrid, de cualquier Transacción o de la conducta de cualquier Miembro, aunque se les haya advertido de la posibilidad de esos daños.",
        "Nuestra responsabilidad total por todos los reclamos relacionados con ShowGrid se limita al mayor de cien dólares estadounidenses (US$100) o lo que hayas pagado a ShowGrid en los doce meses anteriores al reclamo.",
      ],
    },
    {
      heading: "11. Indemnización",
      body: [
        "Aceptas defender, indemnizar y mantener indemnes a ShowGrid y a sus dueños, directivos, empleados y agentes frente a cualquier reclamo, pérdida, responsabilidad, daño, costo y gasto (incluidos honorarios razonables de abogados) que surja de tu uso de ShowGrid, tu contenido, tus Transacciones o tu incumplimiento de estos Términos, de cualquier ley o de los derechos de terceros.",
      ],
    },
    {
      heading: "12. Cambios y terminación",
      body: [
        "Podemos cambiar ShowGrid o estos Términos en cualquier momento. Si hacemos cambios importantes actualizaremos la fecha de arriba y, cuando corresponda, te pediremos aceptar los nuevos Términos. Seguir usando ShowGrid después de que los cambios entren en vigor significa que los aceptas. Puedes dejar de usar ShowGrid cuando quieras.",
      ],
    },
    {
      heading: "13. Ley aplicable",
      body: [
        "Estos Términos se rigen por las leyes del Estado de Florida, Estados Unidos, sin aplicar sus normas de conflicto de leyes. Cualquier disputa con ShowGrid se presentará exclusivamente ante los tribunales estatales o federales del condado de Miami-Dade, Florida, y aceptas su jurisdicción. Si alguna parte de estos Términos resulta inaplicable, el resto sigue vigente. En caso de diferencia entre versiones, prevalece la versión en inglés.",
      ],
    },
    {
      heading: "14. Contacto",
      body: ["Preguntas sobre estos Términos: hello@show-grid.com, o la página de Sugerencias en ShowGrid."],
    },
  ],
};

export const TERMS: Record<Locale, TermsDoc> = { en, es };
