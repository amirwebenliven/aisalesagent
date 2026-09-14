/*
 * Website chat widget — one-line embed:
 *   <script src="https://YOUR-APP/widget.js" data-secret="WEBHOOK_SECRET" defer></script>
 * Optional: data-title, data-subtitle, data-greeting, data-color, data-api.
 *
 * No dependencies, no build step. Everything lives in a shadow root, so the host
 * page's CSS cannot reach in and ours cannot leak out — a widget that inherits a
 * customer's `button{width:100%}` looks broken on their site and fine on ours.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var secret = script.getAttribute("data-secret");
  if (!secret) {
    console.error("[chat-widget] missing data-secret on the script tag");
    return;
  }

  var api = (script.getAttribute("data-api") || new URL(script.src, location.href).origin).replace(/\/$/, "");
  var endpoint = api + "/api/widget/" + encodeURIComponent(secret);
  var title = script.getAttribute("data-title") || "Chat with us";
  var subtitle = script.getAttribute("data-subtitle") || "We usually reply in a few minutes";
  var greeting = script.getAttribute("data-greeting") || "Hi! How can we help?";
  var accent = script.getAttribute("data-color") || "#2563eb";

  // --- identity ---
  // localStorage throws outright when a browser blocks site data, and
  // crypto.randomUUID does not exist on plain http. Both are real customer
  // sites, so neither may take the widget down.
  var STORE_KEY = "zc_visitor_" + secret;
  var memoryStore = {};

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
      return value;
    } catch (e) {
      if (value === undefined) return memoryStore[key] || null;
      memoryStore[key] = value;
      return value;
    }
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  var visitorId = store(STORE_KEY) || store(STORE_KEY, uuid());

  // --- shell ---
  var host = document.createElement("div");
  host.id = "zc-host";
  host.style.cssText = "all:initial;position:fixed;z-index:2147483000;bottom:0;right:0;";
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

  var css =
    ":host,*{box-sizing:border-box}" +
    ".zc-wrap{position:fixed;right:20px;bottom:20px;font:14px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827}" +
    ".zc-btn{width:56px;height:56px;border-radius:50%;border:0;background:" + accent + ";color:#fff;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.22);display:flex;align-items:center;justify-content:center;margin-left:auto;padding:0}" +
    ".zc-btn svg{width:26px;height:26px;display:block;fill:none;stroke:currentColor;stroke-width:2}" +
    ".zc-panel{width:360px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 120px);background:#fff;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;margin-bottom:12px}" +
    ".zc-open .zc-panel{display:flex}" +
    ".zc-head{background:" + accent + ";color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}" +
    ".zc-head h3{margin:0;font-size:15px;font-weight:600}" +
    ".zc-head p{margin:2px 0 0;font-size:12px;opacity:.85}" +
    ".zc-x{margin-left:auto;background:none;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:0 2px;opacity:.85}" +
    ".zc-log{flex:1;overflow-y:auto;padding:14px;background:#f7f8fa;display:flex;flex-direction:column;gap:8px}" +
    ".zc-msg{max-width:82%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}" +
    ".zc-agent{background:#fff;border:1px solid #e5e7eb;border-bottom-left-radius:4px;align-self:flex-start}" +
    ".zc-user{background:" + accent + ";color:#fff;border-bottom-right-radius:4px;align-self:flex-end}" +
    ".zc-note{align-self:center;font-size:12px;color:#6b7280}" +
    ".zc-dots{align-self:flex-start;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:11px 13px;display:none;gap:4px}" +
    ".zc-dots.on{display:flex}" +
    ".zc-dots i{width:6px;height:6px;border-radius:50%;background:#9ca3af;display:block;animation:zc-b 1.2s infinite}" +
    ".zc-dots i:nth-child(2){animation-delay:.15s}.zc-dots i:nth-child(3){animation-delay:.3s}" +
    "@keyframes zc-b{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}" +
    ".zc-foot{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb;background:#fff;align-items:flex-end}" +
    ".zc-in{flex:1;resize:none;border:1px solid #d1d5db;border-radius:10px;padding:9px 11px;font:inherit;color:inherit;max-height:96px;outline:none}" +
    ".zc-in:focus{border-color:" + accent + "}" +
    ".zc-send{border:0;background:" + accent + ";color:#fff;border-radius:10px;padding:9px 14px;cursor:pointer;font:inherit;font-weight:600}" +
    ".zc-send:disabled{opacity:.5;cursor:default}" +
    "@media (max-width:480px){.zc-wrap{right:12px;bottom:12px}.zc-panel{width:calc(100vw - 24px);height:min(70vh,520px)}}";

  var style = document.createElement("style");
  style.textContent = css;
  root.appendChild(style);

  var wrap = document.createElement("div");
  wrap.className = "zc-wrap";
  wrap.innerHTML =
    '<div class="zc-panel" role="dialog" aria-label="Chat">' +
    '<div class="zc-head"><div><h3></h3><p></p></div><button class="zc-x" aria-label="Close">&times;</button></div>' +
    '<div class="zc-log"><div class="zc-dots"><i></i><i></i><i></i></div></div>' +
    '<div class="zc-foot"><textarea class="zc-in" rows="1" placeholder="Type a message…" aria-label="Message"></textarea>' +
    '<button class="zc-send">Send</button></div></div>' +
    '<button class="zc-btn" aria-label="Open chat"><svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-4-.9L3 21l1.9-4.9A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/></svg></button>';
  root.appendChild(wrap);

  var $ = function (sel) { return wrap.querySelector(sel); };
  $(".zc-head h3").textContent = title;
  $(".zc-head p").textContent = subtitle;

  var log = $(".zc-log"), dots = $(".zc-dots"), input = $(".zc-in"), sendBtn = $(".zc-send");

  function mount() {
    document.body.appendChild(host);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  // --- rendering ---
  // textContent only: these bodies are other people's words coming back out of
  // our database onto a customer's page, and innerHTML would make that XSS.
  function bubble(role, text) {
    var el = document.createElement("div");
    el.className = "zc-msg " + (role === "user" ? "zc-user" : "zc-agent");
    el.textContent = text;
    log.insertBefore(el, dots);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function note(text) {
    var el = document.createElement("div");
    el.className = "zc-note";
    el.textContent = text;
    log.insertBefore(el, dots);
    log.scrollTop = log.scrollHeight;
  }

  function typing(on) {
    dots.classList.toggle("on", on);
    if (on) log.scrollTop = log.scrollHeight;
  }

  // --- transport ---
  var cursor = null;          // ISO timestamp of the newest message we know about
  var seen = {};              // server ids already accounted for
  var loaded = false;
  var polling = 0;

  function sync(render) {
    var url = endpoint + "?visitorId=" + encodeURIComponent(visitorId) + (cursor ? "&after=" + encodeURIComponent(cursor) : "");
    return fetch(url, { method: "GET", credentials: "omit" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok || !data.messages) return 0;
        var added = 0;
        data.messages.forEach(function (m) {
          if (seen[m.id]) return;
          seen[m.id] = 1;
          cursor = m.at;
          if (render) { bubble(m.role, m.text); added++; }
        });
        return added;
      })
      .catch(function () { return 0; });
  }

  // POST gives us the reply when the agent is quick. When it isn't, we poll —
  // a browser must never be left hanging on a model call.
  function poll(tries) {
    clearTimeout(polling);
    if (tries <= 0) { typing(false); return; }
    polling = setTimeout(function () {
      sync(true).then(function (added) {
        if (added > 0) typing(false);
        else poll(tries - 1);
      });
    }, 2500);
  }

  function send() {
    var text = input.value.trim();
    if (!text) return;

    input.value = "";
    input.style.height = "auto";
    sendBtn.disabled = true;
    bubble("user", text);
    typing(true);

    fetch(endpoint, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitorId: visitorId,
        message: text,
        clientMessageId: uuid(),   // the dedup key — a retried POST is one message, not two
        page: location.href.slice(0, 500),
        locale: navigator.language,
      }),
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (res) {
        sendBtn.disabled = false;
        var d = res.data || {};

        if (!d.ok) {
          typing(false);
          // Show what the server actually said — "something went wrong" hides a
          // rate limit, a paused widget and a real outage behind one message.
          note(d.error || "Message not delivered. Please try again.");
          return;
        }

        if (d.replies && d.replies.length) {
          typing(false);
          d.replies.forEach(function (t) { bubble("agent", t); });
          sync(false);           // swallow the server's copies, advance the cursor
        } else if (d.human) {
          typing(false);
          note("A team member will reply here shortly.");
          poll(24);
        } else {
          poll(24);              // still thinking, or queued for the worker
        }
      })
      .catch(function () {
        sendBtn.disabled = false;
        typing(false);
        note("Couldn't reach the chat server. Check your connection.");
      });
  }

  // --- interaction ---
  function open() {
    wrap.classList.add("zc-open");
    if (!loaded) {
      loaded = true;
      sync(true).then(function (added) { if (!added) bubble("agent", greeting); });
    }
    setTimeout(function () { input.focus(); }, 50);
  }

  function close() {
    wrap.classList.remove("zc-open");
    clearTimeout(polling);
  }

  $(".zc-btn").addEventListener("click", function () {
    wrap.classList.contains("zc-open") ? close() : open();
  });
  $(".zc-x").addEventListener("click", close);
  sendBtn.addEventListener("click", send);

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    if (e.key === "Escape") close();
  });

  input.addEventListener("input", function () {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 96) + "px";
  });

  // Host pages open the panel from their own CTA: AgentChat.open()
  window.AgentChat = { open: open, close: close, visitorId: visitorId };
})();
