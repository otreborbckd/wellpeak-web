/* =====================================================================
   WellPeak · Servicio del formulario de contacto
   ---------------------------------------------------------------------
   Recibe las solicitudes del sitio (POST /api/contacto) y las envía por
   correo con Amazon SES. Corre en el servidor EC2 detrás de Nginx.

   Variables de entorno (archivo /etc/wellpeak/contacto.env):
     PORT            Puerto local (por defecto 3001)
     AWS_REGION      Región de SES, por ejemplo us-east-1
     CORREO_DESDE    Remitente verificado en SES, ej. "WellPeak <no-responder@wellpeak.com.mx>"
     CORREO_PARA     Correo(s) que reciben las solicitudes, separados por comas
     ORIGEN          Dominio permitido, ej. https://wellpeak.com.mx
     MODO_PRUEBA     "1" = no envía correo; solo lo registra (para pruebas)
   ===================================================================== */
"use strict";
const http = require("node:http");

const PORT = Number(process.env.PORT || 3001);
const ORIGEN = (process.env.ORIGEN || "https://wellpeak.com.mx").split(",").map(s => s.trim());
const PRUEBA = process.env.MODO_PRUEBA === "1";
const DESDE = process.env.CORREO_DESDE || "";
const PARA = (process.env.CORREO_PARA || "").split(",").map(s => s.trim()).filter(Boolean);

let ses = null;
if (!PRUEBA) {
  const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");
  const client = new SESv2Client({ region: process.env.AWS_REGION || "us-east-1" });
  ses = (params) => client.send(new SendEmailCommand(params));
}

/* Límite sencillo: 5 envíos por IP cada 10 minutos */
const intentos = new Map();
function limitado(ip) {
  const ahora = Date.now(), ventana = 10 * 60 * 1000;
  const lista = (intentos.get(ip) || []).filter(t => ahora - t < ventana);
  lista.push(ahora); intentos.set(ip, lista);
  return lista.length > 5;
}
setInterval(() => { const a = Date.now(); for (const [k, v] of intentos) if (!v.some(t => a - t < 600000)) intentos.delete(k); }, 600000).unref();

const LIM = { nombre: 120, empresa: 160, cargo: 120, colaboradores: 40, correo: 160, telefono: 40, mensaje: 2000 };
const limpiar = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, n);
const esc = (s) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function responder(res, code, obj, origen) {
  const h = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (origen) { h["Access-Control-Allow-Origin"] = origen; h["Vary"] = "Origin"; }
  res.writeHead(code, h); res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  const origen = ORIGEN.includes(req.headers.origin) ? req.headers.origin : null;
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": origen || ORIGEN[0], "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" });
    return res.end();
  }
  if (req.url === "/api/salud") return responder(res, 200, { ok: true });
  if (req.method !== "POST" || req.url !== "/api/contacto") return responder(res, 404, { error: "No encontrado." });
  if (req.headers.origin && !origen) return responder(res, 403, { error: "Origen no permitido." });

  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (limitado(ip)) return responder(res, 429, { error: "Recibimos varias solicitudes seguidas. Intenta de nuevo en unos minutos." }, origen);

  let cuerpo = "";
  req.on("data", (c) => { cuerpo += c; if (cuerpo.length > 20000) req.destroy(); });
  req.on("end", async () => {
    let d;
    try { d = JSON.parse(cuerpo || "{}"); } catch { return responder(res, 400, { error: "Solicitud no válida." }, origen); }

    /* Campo trampa para robots: si viene lleno, se responde "ok" sin enviar */
    if (d.sitio_web) return responder(res, 200, { ok: true }, origen);

    const f = {};
    for (const k of Object.keys(LIM)) f[k] = limpiar(d[k], LIM[k]);
    const interes = Array.isArray(d.interes) ? d.interes.slice(0, 10).map(x => limpiar(x, 60)).filter(Boolean) : [];
    if (!f.nombre || !f.empresa || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.correo))
      return responder(res, 400, { error: "Revisa tu nombre, empresa y correo electrónico." }, origen);
    if (d.acepto !== true)
      return responder(res, 400, { error: "Es necesario aceptar el Aviso de privacidad." }, origen);

    const filas = [["Nombre", f.nombre], ["Empresa", f.empresa], ["Cargo", f.cargo], ["Colaboradores", f.colaboradores],
      ["Correo", f.correo], ["Teléfono", f.telefono], ["Le interesa", interes.join(", ")], ["Mensaje", f.mensaje]];
    const texto = filas.map(([a, b]) => `${a}: ${b || "-"}`).join("\n") + `\n\nFecha: ${new Date().toISOString()}`;
    const htmlCorreo = `<h2 style="font-family:Arial">Nueva solicitud desde wellpeak.com.mx</h2><table style="font-family:Arial;font-size:14px;border-collapse:collapse">` +
      filas.map(([a, b]) => `<tr><td style="padding:6px 12px;font-weight:bold;vertical-align:top">${esc(a)}</td><td style="padding:6px 12px;white-space:pre-wrap">${esc(b || "-")}</td></tr>`).join("") + `</table>`;
    const asunto = `Nueva solicitud WellPeak: ${f.empresa}`.slice(0, 150);

    if (PRUEBA) { console.log("[MODO_PRUEBA] Solicitud recibida:\n" + texto); return responder(res, 200, { ok: true }, origen); }
    if (!DESDE || !PARA.length) { console.error("Faltan CORREO_DESDE o CORREO_PARA"); return responder(res, 500, { error: "El formulario aún no está configurado. Escríbenos por correo." }, origen); }
    try {
      await ses({
        FromEmailAddress: DESDE,
        Destination: { ToAddresses: PARA },
        ReplyToAddresses: [f.correo],
        Content: { Simple: { Subject: { Data: asunto, Charset: "UTF-8" }, Body: { Text: { Data: texto, Charset: "UTF-8" }, Html: { Data: htmlCorreo, Charset: "UTF-8" } } } }
      });
      return responder(res, 200, { ok: true }, origen);
    } catch (e) {
      console.error("Error al enviar con SES:", e && e.message);
      return responder(res, 502, { error: "No pudimos enviar tu solicitud en este momento. Intenta más tarde." }, origen);
    }
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`Formulario WellPeak escuchando en 127.0.0.1:${PORT}${PRUEBA ? " (MODO_PRUEBA)" : ""}`));
