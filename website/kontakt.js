/*
 * Kontaktformular: schickt die Anfrage verschluesselt an das Backend der
 * d2d-App (Adresse steht im action-Attribut des Formulars). Ohne JavaScript
 * schickt der Browser das Formular selbst und landet danach auf danke.html.
 *
 * Bewusst ohne innerHTML: Meldungen werden nur als Text gesetzt.
 */
(function () {
  "use strict";

  var form = document.getElementById("kontakt-form");
  if (!form || !window.fetch) return;

  var status = document.getElementById("k-status");
  var submit = document.getElementById("k-submit");
  var topic = document.getElementById("k-topic");
  var startedAt = Date.now();

  var FIELDS = {
    name: { input: "k-name", error: "k-name-err" },
    email: { input: "k-mail", error: "k-mail-err" },
    phone: { input: "k-phone", error: "k-phone-err" },
    postalCode: { input: "k-plz", error: "k-plz-err" },
    message: { input: "k-msg", error: "k-msg-err" },
    consent: { input: "k-consent", error: "k-consent-err" },
  };

  var MESSAGES = {
    name: "Bitte Ihren Namen angeben.",
    email: "Bitte eine gültige E-Mail-Adresse angeben.",
    phone: "Bitte eine gültige Telefonnummer angeben – oder das Feld leer lassen.",
    postalCode: "Bitte eine gültige Postleitzahl angeben – oder das Feld leer lassen.",
    message: "Bitte schreiben Sie uns kurz, worum es geht (mindestens 10 Zeichen).",
    consent: "Bitte bestätigen Sie, dass Sie die Datenschutzerklärung gelesen haben.",
  };

  // Links wie "Berater überprüfen" waehlen das passende Anliegen vor.
  document.querySelectorAll("a[data-topic]").forEach(function (link) {
    link.addEventListener("click", function () {
      var value = link.getAttribute("data-topic");
      if (topic && value) topic.value = value;
    });
  });

  function el(id) {
    return document.getElementById(id);
  }

  function setError(field, text) {
    var conf = FIELDS[field];
    if (!conf) return;
    var input = el(conf.input);
    var error = el(conf.error);
    if (text) {
      input.setAttribute("aria-invalid", "true");
      error.textContent = text;
      error.hidden = false;
    } else {
      input.removeAttribute("aria-invalid");
      error.textContent = "";
      error.hidden = true;
    }
  }

  function clearErrors() {
    Object.keys(FIELDS).forEach(function (field) {
      setError(field, "");
    });
  }

  function showStatus(kind, text) {
    status.textContent = text;
    status.hidden = false;
    status.style.background = kind === "ok" ? "#EFFAF4" : "#FEF3F2";
    status.style.color = kind === "ok" ? "#16683F" : "#B42318";
  }

  /** Erst im Browser pruefen - der Server prueft trotzdem alles noch einmal. */
  function validate() {
    var first = null;
    Object.keys(FIELDS).forEach(function (field) {
      var input = el(FIELDS[field].input);
      var value = input.type === "checkbox" ? input.checked : input.value.trim();
      var bad = false;
      if (field === "consent") bad = !value;
      else if (field === "phone") bad = value !== "" && !/^\+?[0-9 ()/.-]{5,30}$/.test(value);
      else if (field === "postalCode") bad = value !== "" && !/^[0-9]{4,5}$/.test(value);
      else if (field === "message") bad = value.length < 10;
      else if (field === "name") bad = value.length < 2;
      else if (field === "email") bad = !input.checkValidity() || value === "";
      setError(field, bad ? MESSAGES[field] : "");
      if (bad && !first) first = input;
    });
    if (first) first.focus();
    return !first;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    status.hidden = true;
    clearErrors();
    if (!validate()) return;

    var payload = {
      topic: topic ? topic.value : "BERATUNG",
      name: el("k-name").value,
      email: el("k-mail").value,
      phone: el("k-phone").value,
      postalCode: el("k-plz").value,
      message: el("k-msg").value,
      consent: el("k-consent").checked,
      website: el("k-website").value,
      elapsed: Date.now() - startedAt,
    };

    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () { controller.abort(); }, 15000) : null;
    submit.disabled = true;
    submit.textContent = "Wird gesendet …";

    fetch(form.action, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "strict-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined,
    })
      .then(function (response) {
        return response
          .json()
          .catch(function () { return {}; })
          .then(function (data) { return { response: response, data: data }; });
      })
      .then(function (result) {
        var response = result.response;
        var data = result.data || {};
        if (response.ok) {
          form.reset();
          startedAt = Date.now();
          showStatus("ok", "Danke! Ihre Nachricht ist bei uns angekommen. Wir melden uns schnell bei Ihnen.");
          return;
        }
        if (response.status === 422 && data.field && FIELDS[data.field]) {
          setError(data.field, typeof data.error === "string" ? data.error : MESSAGES[data.field]);
          el(FIELDS[data.field].input).focus();
          return;
        }
        showStatus(
          "error",
          typeof data.error === "string"
            ? data.error
            : "Das hat leider nicht geklappt. Bitte versuchen Sie es später erneut oder schreiben Sie an Info@CarlssonSales.de.",
        );
      })
      .catch(function () {
        showStatus("error", "Keine Verbindung. Bitte versuchen Sie es erneut oder schreiben Sie an Info@CarlssonSales.de.");
      })
      .then(function () {
        if (timer) window.clearTimeout(timer);
        submit.disabled = false;
        submit.textContent = "Nachricht senden";
      });
  });
})();
