/* Eye To Ad lead router v2 (2026-11-09). Every form on this site posts to our own lead server
   (clients.eyetoad.com/lead/send.php), which saves the lead first and then emails the alert.
   No third-party form service (FormSubmit / EmailJS) is used any more. Covers: fetch() calls the page
   already makes to FormSubmit/EmailJS, emailjs.sendForm(), and plain <form action> posts.
   Honeypot: a filled _honey field is silently dropped. Details travel in the POST body only. */
(function () {
  "use strict";
  if (window.__etaLeadRouter) { return; }
  window.__etaLeadRouter = true;
  var LEAD = "https://clients.eyetoad.com/lead/send.php";
  var shown = Date.now();
  var SITE = location.hostname.replace(/^www\./, "");
  var fetchOrig = window.fetch ? window.fetch.bind(window) : null;
  var DROP = ["service_id", "template_id", "user_id", "accessToken", "_captcha", "_template", "_honey", "_next"];

  function meta(fd) {
    fd.append("site", SITE);
    fd.append("page", location.pathname.slice(0, 300));
    fd.append("_t", String(shown));
    if (!fd.has("_subject")) { fd.append("_subject", "New lead - " + SITE); }
    try {
      var q = new URLSearchParams(location.search);
      ["utm_source", "utm_medium", "utm_campaign", "gclid"].forEach(function (k) {
        var v = q.get(k); if (v) { fd.append("lead_" + k, v.slice(0, 120)); }
      });
      var ref = document.referrer && document.referrer.indexOf(location.host) === -1 ? document.referrer.slice(0, 200) : "";
      if (ref) { fd.append("lead_referrer", ref); }
    } catch (e) { /* ignore */ }
    fd.append("lead_device", window.innerWidth < 760 ? "phone" : "desktop");
    return fd;
  }

  function toFormData(body) {
    var fd = new FormData();
    if (!body) { return fd; }
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      body.forEach(function (v, k) { fd.append(k, v); });
      return fd;
    }
    if (typeof body === "string") {
      try {
        var j = JSON.parse(body);
        Object.keys(j).forEach(function (k) { if (j[k] != null && typeof j[k] !== "object") { fd.append(k, String(j[k])); } });
        return fd;
      } catch (e) {
        try { new URLSearchParams(body).forEach(function (v, k) { fd.append(k, v); }); } catch (e2) { /* ignore */ }
      }
    }
    return fd;
  }

  function isBot(fd) { var h = fd.get("_honey"); return !!(h && String(h).trim()); }

  function post(fd) {
    return fetchOrig(LEAD, { method: "POST", body: meta(fd), headers: { "Accept": "application/json" }, credentials: "omit", referrerPolicy: "strict-origin-when-cross-origin" })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.ok && j && j.ok) { return { ok: true, id: j.id || "" }; }
          throw new Error("lead-server " + r.status);
        });
      });
  }

  // One retry, so a brief network blip does not lose a lead.
  function sendToLeadServer(fd) {
    if (isBot(fd)) { return Promise.resolve({ ok: true, id: "bot" }); }
    DROP.forEach(function (k) { fd.delete(k); });
    return post(fd).catch(function () {
      return new Promise(function (res) { setTimeout(res, 1200); }).then(function () { return post(fd); });
    });
  }

  function resp(status, body) {
    try { return new Response(body, { status: status, headers: { "Content-Type": "application/json" } }); }
    catch (e) { return { ok: status < 400, status: status, json: function () { return Promise.resolve(JSON.parse(body)); }, text: function () { return Promise.resolve(body); } }; }
  }

  if (fetchOrig) {
    window.fetch = function (url, opts) {
      var u = typeof url === "string" ? url : (url && url.url) || "";
      var isForm = /formsubmit\.co\/ajax\//i.test(u) || /api\.emailjs\.com\/api\/v1\.0\/email\/send/i.test(u);
      if (!isForm || !opts || String(opts.method || "GET").toUpperCase() !== "POST") { return fetchOrig(url, opts); }
      var fd = toFormData(opts.body);
      return sendToLeadServer(fd).then(function (res) {
        if (/emailjs/i.test(u)) { return resp(200, "OK"); }
        return resp(200, JSON.stringify({ success: "true", ok: true, id: res.id, message: "Thanks. We got your request." }));
      }).catch(function () {
        return resp(502, JSON.stringify({ success: "false", ok: false, message: "Could not send. Please call us or try again." }));
      });
    };
  }

  // EmailJS SDK sites.
  function wrapEmailJs() {
    var ej = window.emailjs;
    if (!ej || !ej.sendForm || ej.__etaWrapped) { return; }
    ej.__etaWrapped = true;
    ej.sendForm = function (serviceId, templateId, form) {
      var el = typeof form === "string" ? document.querySelector(form) : form;
      return sendToLeadServer(new FormData(el)).then(function (res) { return { status: 200, text: "OK", id: res.id }; });
    };
    if (ej.send) {
      ej.send = function (serviceId, templateId, params) {
        var fd = new FormData();
        Object.keys(params || {}).forEach(function (k) { if (params[k] != null) { fd.append(k, String(params[k])); } });
        return sendToLeadServer(fd).then(function (res) { return { status: 200, text: "OK", id: res.id }; });
      };
    }
  }
  wrapEmailJs();
  if (!window.emailjs) { document.addEventListener("DOMContentLoaded", wrapEmailJs); window.addEventListener("load", wrapEmailJs); }

  // Plain <form action="..."> posts the page did not already handle.
  document.addEventListener("submit", function (e) {
    var f = e.target;
    if (!f || e.defaultPrevented || !(f instanceof HTMLFormElement) || !fetchOrig) { return; }
    var a = String(f.getAttribute("action") || "");
    if (!/formsubmit\.co|clients\.eyetoad\.com\/lead\/send\.php/i.test(a)) { return; }
    e.preventDefault();
    var fd = new FormData(f);
    var next = fd.get("_next");
    var btn = f.querySelector("[type=submit]");
    if (btn) { btn.disabled = true; }
    sendToLeadServer(fd).then(function () {
      if (next && /^(https?:\/\/|\/)/.test(String(next))) { location.href = String(next); return; }
      var d = document.createElement("div");
      d.setAttribute("role", "status");
      d.style.cssText = "padding:18px;border:1px solid #2e7d32;border-radius:8px;background:#e8f5e9;color:#14213d;font:600 17px/1.5 system-ui,sans-serif";
      d.textContent = "Thank you! We received your request and will be in touch shortly.";
      f.parentNode.replaceChild(d, f);
    }).catch(function () {
      if (btn) { btn.disabled = false; }
      alert("Sorry, that did not send. Please try again or call us.");
    });
  }, false);
})();
