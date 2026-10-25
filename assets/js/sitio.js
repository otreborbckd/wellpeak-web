/* WellPeak · comportamiento del sitio. Los datos se editan en config.js */
(function () {
  "use strict";
  var C = window.WELLPEAK_CONFIG || {};
  function get(path) {
    return path.split(".").reduce(function (o, k) { return o && o[k] !== undefined ? o[k] : ""; }, C);
  }
  function hrefFor(key) {
    var v = get(key);
    if (key === "tel") return C.telefono ? "tel:" + String(C.telefono).replace(/[^\d+]/g, "") : "";
    if (key === "mailto") return C.correo ? "mailto:" + C.correo : "";
    if (key === "whatsapp") return C.whatsapp ? "https://wa.me/" + String(C.whatsapp).replace(/\D/g, "") + "?text=" + encodeURIComponent(C.mensajeWhatsapp || "") : "";
    return v;
  }

  /* 1. Datos de config.js: textos, ligas y ocultar lo vacío */
  document.querySelectorAll("[data-text]").forEach(function (el) { el.textContent = get(el.getAttribute("data-text")); });
  document.querySelectorAll("[data-href]").forEach(function (el) {
    var h = hrefFor(el.getAttribute("data-href"));
    if (h) el.setAttribute("href", h); else el.hidden = true;
  });
  document.querySelectorAll("[data-show-if]").forEach(function (el) { if (!get(el.getAttribute("data-show-if"))) el.hidden = true; });
  document.querySelectorAll("[data-show-if-any]").forEach(function (el) {
    var any = el.getAttribute("data-show-if-any").split(",").some(function (k) { return !!get(k.trim()); });
    if (!any) el.hidden = true;
  });
  var anio = document.getElementById("anio"); if (anio) anio.textContent = new Date().getFullYear();

  /* 2. Menú en celular */
  var toggle = document.querySelector(".nav-toggle"), menu = document.getElementById("menu");
  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      var open = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    menu.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", function () { menu.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); }); });
  }

  /* 3. Etapas del proceso (pestañas accesibles) */
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".ptab"));
  function selectTab(i, focus) {
    tabs.forEach(function (t, j) {
      var on = i === j, panel = document.getElementById(t.getAttribute("aria-controls"));
      t.classList.toggle("is-active", on); t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1;
      panel.hidden = !on; panel.classList.toggle("is-active", on);
    });
    if (focus) tabs[i].focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { selectTab(i); });
    t.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); selectTab((i + 1) % tabs.length, true); }
      if (e.key === "ArrowLeft") { e.preventDefault(); selectTab((i - 1 + tabs.length) % tabs.length, true); }
    });
  });

  /* 4. Filtro de programas */
  var chips = document.querySelectorAll(".chip"), progs = document.querySelectorAll(".prog");
  chips.forEach(function (c) {
    c.addEventListener("click", function () {
      var f = c.getAttribute("data-filter");
      chips.forEach(function (x) { x.classList.toggle("is-active", x === c); x.setAttribute("aria-pressed", x === c ? "true" : "false"); });
      progs.forEach(function (p) { p.hidden = !(f === "todos" || p.getAttribute("data-pilar") === f); });
    });
  });

  /* 5. Formulario de contacto */
  var form = document.getElementById("form-contacto");
  if (!form) return;
  var msg = form.querySelector(".form-msg"), btn = form.querySelector("button[type=submit]");
  function say(text, ok) { msg.textContent = text; msg.className = "form-msg " + (ok ? "ok" : "err"); }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var bad = null;
    ["nombre", "empresa", "correo"].forEach(function (n) {
      var el = form.elements[n], invalid = !el.value.trim() || (n === "correo" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim()));
      el.setAttribute("aria-invalid", invalid ? "true" : "false"); if (invalid && !bad) bad = el;
    });
    if (bad) { say("Revisa los campos marcados: nombre, empresa y un correo válido son obligatorios.", false); bad.focus(); return; }
    if (!form.elements.acepto.checked) { say("Para enviar tu solicitud, acepta el Aviso de privacidad.", false); return; }
    var data = {};
    ["nombre", "empresa", "cargo", "colaboradores", "correo", "telefono", "mensaje", "sitio_web"].forEach(function (n) { data[n] = form.elements[n].value.trim(); });
    data.interes = Array.prototype.map.call(form.querySelectorAll("input[name=interes]:checked"), function (x) { return x.value; });
    data.acepto = true;
    btn.disabled = true; say("Enviando…", true);
    fetch((C.formulario && C.formulario.endpoint) || "/api/contacto", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) { form.reset(); say("¡Gracias! Recibimos tu solicitud y te contactaremos muy pronto.", true); }
        else { say(res.j.error || "No pudimos enviar tu solicitud. Intenta de nuevo en unos minutos.", false); }
      })
      .catch(function () {
        var alt = C.correo ? " También puedes escribirnos a " + C.correo + "." : "";
        say("No pudimos enviar tu solicitud. Revisa tu conexión e intenta de nuevo." + alt, false);
      })
      .then(function () { btn.disabled = false; });
  });
})();
