/* =====================================================================
   WELLPEAK · DATOS DEL SITIO
   ---------------------------------------------------------------------
   Este es el ÚNICO archivo que hay que editar para cambiar los datos de
   contacto, las ligas de descarga y las redes sociales.

   - Escribe cada dato entre las comillas.
   - Si un dato se deja vacío (""), el sitio lo oculta automáticamente.
   - Después de guardar, sube este archivo al servidor (ver la guía).
   ===================================================================== */
window.WELLPEAK_CONFIG = {

  /* Datos de contacto */
  telefono:   "",        // Ejemplo: "+52 55 1234 5678"
  correo:     "",        // Ejemplo: "contacto@wellpeak.com.mx"
  whatsapp:   "",        // Solo números con lada de país. Ejemplo: "5215512345678"
  direccion:  "",        // Ejemplo: "Ciudad de México, México"
  horario:    "",        // Ejemplo: "Lunes a viernes, 9:00 a 18:00 h"

  /* Mensaje que aparece al abrir WhatsApp */
  mensajeWhatsapp: "Hola, me interesa conocer el proceso WellPeak para mi organización.",

  /* Redes sociales (liga completa) */
  redes: {
    linkedin:  "",
    facebook:  "",
    instagram: "",
    youtube:   ""
  },

  /* Materiales descargables (ligas públicas al bucket de S3).
     Ejemplo: "https://NOMBRE-DEL-BUCKET.s3.amazonaws.com/descargas/folleto-programas-pulse.pdf"
     Mientras estén vacías, la sección de descargas no se muestra. */
  descargas: {
    folleto:    "https://pulse-wellpeak-recursos.s3.amazonaws.com/descargas/folleto-programas-pulse.pdf",
    proceso:    "https://pulse-wellpeak-recursos.s3.amazonaws.com/descargas/proceso-wellpeak.pdf",
    infografia: "https://pulse-wellpeak-recursos.s3.amazonaws.com/descargas/infografia-proceso-wellpeak.pdf"
  },

  /* Formulario de contacto: dirección del servicio en el servidor EC2 */
  formulario: {
    endpoint: "/api/contacto"
  }
};
