// Scroll reveal for elements marked .reveal.
// Respects prefers-reduced-motion (handled in CSS; this just skips the
// IntersectionObserver work when motion is reduced).

// Case study navigation dropdown: CSS handles hover; this adds click, keyboard,
// outside-click, and Escape behavior for touch and non-pointer users.

(function () {
  var dropdowns = document.querySelectorAll(".site-nav__item--dropdown");
  if (dropdowns.length === 0) return;

  function setOpen(dropdown, open) {
    var trigger = dropdown.querySelector(".site-nav__dropdown-trigger");
    dropdown.dataset.open = open ? "true" : "false";
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
  }

  dropdowns.forEach(function (dropdown) {
    var trigger = dropdown.querySelector(".site-nav__dropdown-trigger");

    trigger.addEventListener("click", function () {
      setOpen(dropdown, dropdown.dataset.open !== "true");
    });

    dropdown.addEventListener("focusout", function (event) {
      if (!dropdown.contains(event.relatedTarget)) {
        setOpen(dropdown, false);
      }
    });
  });

  document.addEventListener("click", function (event) {
    dropdowns.forEach(function (dropdown) {
      if (!dropdown.contains(event.target)) {
        setOpen(dropdown, false);
      }
    });
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;

    dropdowns.forEach(function (dropdown) {
      if (dropdown.dataset.open === "true") {
        setOpen(dropdown, false);
        dropdown.querySelector(".site-nav__dropdown-trigger").focus();
      }
    });
  });
})();

(function () {
  var prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (prefersReduced) return;

  var targets = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || targets.length === 0) {
    targets.forEach(function (el) {
      el.classList.add("is-visible");
    });
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  targets.forEach(function (el) {
    observer.observe(el);
  });
})();

// Device mockups (.device__scroll): measure the screenshot against its
// visible "screen" area and set how far it needs to travel to reveal the
// bottom. If the image already fits, no scroll is applied.

(function () {
  var prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  var containers = document.querySelectorAll(".device__scroll");
  if (containers.length === 0) return;

  function measure(container) {
    var img = container.querySelector(".device__image");
    if (!img) return;

    var screenHeight = container.clientHeight;
    var imgHeight = img.clientHeight;
    var distance = screenHeight - imgHeight;

    if (distance < 0 && !prefersReduced) {
      container.style.setProperty("--scroll-distance", distance + "px");
      container.classList.add("has-scroll");
    } else {
      container.classList.remove("has-scroll");
      container.style.removeProperty("--scroll-distance");
    }
  }

  containers.forEach(function (container) {
    var img = container.querySelector(".device__image");
    if (!img) return;

    if (img.complete) {
      measure(container);
    } else {
      img.addEventListener("load", function () {
        measure(container);
      });
    }
  });

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      containers.forEach(measure);
    }, 150);
  });
})();

// Resume role accordions (<details>): native open/close is an instant snap
// with no way to transition it. Intercept the toggle and animate height
// with the Web Animations API instead -- widely supported, no dependency.
(function () {
  var prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  if (prefersReduced) return;
  if (!("animate" in Element.prototype)) return;

  var EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
  var DURATION = 220;

  document.querySelectorAll(".resume-role").forEach(function (details) {
    var summary = details.querySelector("summary");
    if (!summary) return;

    var animation = null;
    var isClosing = false;
    var isExpanding = false;

    summary.addEventListener("click", function (event) {
      event.preventDefault();
      details.style.overflow = "hidden";

      if (isClosing || !details.open) {
        expand();
      } else if (isExpanding || details.open) {
        shrink();
      }
    });

    function shrink() {
      isClosing = true;
      var startHeight = details.offsetHeight + "px";
      var endHeight = summary.offsetHeight + "px";

      if (animation) animation.cancel();
      animation = details.animate(
        { height: [startHeight, endHeight] },
        { duration: DURATION, easing: EASING }
      );
      animation.onfinish = function () {
        onFinish(false);
      };
      animation.oncancel = function () {
        isClosing = false;
      };
    }

    function expand() {
      details.style.height = details.offsetHeight + "px";
      details.open = true;

      requestAnimationFrame(function () {
        isExpanding = true;
        var startHeight = details.offsetHeight + "px";
        var endHeight = details.scrollHeight + "px";

        if (animation) animation.cancel();
        animation = details.animate(
          { height: [startHeight, endHeight] },
          { duration: DURATION, easing: EASING }
        );
        animation.onfinish = function () {
          onFinish(true);
        };
        animation.oncancel = function () {
          isExpanding = false;
        };
      });
    }

    function onFinish(open) {
      details.open = open;
      animation = null;
      isClosing = false;
      isExpanding = false;
      details.style.height = "";
      details.style.overflow = "";
    }
  });
})();

// Assistant widget: answers questions grounded in resume/case-study
// content plus a curated Q&A file, via a Cloudflare Worker. No account,
// no server-side storage -- conversation history lives only in this
// tab's memory and is gone on refresh.
//
// Response contract (see docs/assistant-openui.md): the Worker returns
// { answer }. If it also sends format: "openui", `answer` is OpenUI Lang and
// is drawn with the OpenUI browser bundle, loaded on the first such answer
// only. `text` is the plain-text version used for history, screen readers
// and the fallback. Without `format`, `answer` is plain text, as before.
(function () {
  const form = document.getElementById("assistant-form");
  if (!form) return;

  const WORKER_URL = "https://tokim-assistant.tokim25.workers.dev";
  const MAX_HISTORY_TURNS = 6;

  // Pinned exact version + SRI hashes. To upgrade, change all four together.
  const OPENUI_JS =
    "https://cdn.jsdelivr.net/npm/@openuidev/browser-bundle@0.1.4/dist/openui-bundle.min.js";
  const OPENUI_JS_SRI =
    "sha384-r37bZh3byM1WK6WC4wvYh5mrFl/P5rLZ4IieE69xm4I+iZVJdSoXjwGGZdgBzWVd";
  const OPENUI_CSS =
    "https://cdn.jsdelivr.net/npm/@openuidev/browser-bundle@0.1.4/dist/openui-styles.css";
  const OPENUI_CSS_SRI =
    "sha384-tT1eeqdeWKDi2Ah0DLk8671QtRhOYieBINHfIk5PXsr5HWRaQzOg39c/Uo2hoAuF";

  // The only places a generated answer may link to.
  const SITE_HOSTS = [location.host, "tonykim.io", "www.tonykim.io", "tokim25.github.io"];
  const SITE_PAGES = [
    "/resume.html",
    "/case-studies/5-star-hosting.html",
    "/case-studies/experiences-services.html",
    "/case-studies/intuit-analytics-ai.html",
    "/case-studies/pandora-onboarding.html",
    "/case-studies/pricing.html",
    "/case-studies/workday-learning-needs-survey.html",
    "/case-studies/workprint.html",
  ];
  const HOME_ANCHORS = ["", "#top", "#career", "#case-studies", "#contact"];

  const MODES = {
    ask: { label: "Your question", placeholder: "Ask about my career…", rows: 1, max: 500, maxHeight: 100 },
    fit: { label: "Job description", placeholder: "Paste the job description…", rows: 8, max: 6000, maxHeight: 260 },
  };

  const textarea = document.getElementById("assistant-question");
  const textareaLabel = document.getElementById("assistant-question-label");
  const sendBtn = document.getElementById("assistant-send");
  const sendLabel = document.getElementById("assistant-send-label");
  const statusEl = document.getElementById("assistant-status");
  const announceEl = document.getElementById("assistant-announce");
  const fitHint = document.getElementById("assistant-fit-hint");
  const thread = document.getElementById("assistant-thread");
  const starters = document.getElementById("assistant-starters");
  const modeButtons = document.querySelectorAll(".assistant-card__mode");

  let history = [];
  let mode = "ask";
  let busy = false;
  let openuiPromise = null;

  function addBubble(role, text) {
    const bubble = document.createElement("div");
    bubble.className = `qa-bubble ${role}`;
    bubble.textContent = text;
    thread.appendChild(bubble);
    thread.scrollTop = thread.scrollHeight;
    return bubble;
  }

  function growTextarea() {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, MODES[mode].maxHeight) + "px";
  }

  function setMode(next) {
    mode = next;
    const m = MODES[mode];
    modeButtons.forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.dataset.mode === mode ? "true" : "false");
    });
    textareaLabel.textContent = m.label;
    textarea.placeholder = m.placeholder;
    textarea.rows = m.rows;
    textarea.maxLength = m.max;
    fitHint.hidden = mode !== "fit";
    starters.hidden = mode === "fit";
    if (mode === "fit") textarea.setAttribute("aria-describedby", "assistant-fit-hint");
    else textarea.removeAttribute("aria-describedby");
    textarea.style.height = "";
    if (textarea.value) growTextarea();
  }

  function setBusy(on) {
    busy = on;
    sendBtn.setAttribute("aria-disabled", on ? "true" : "false");
    sendLabel.textContent = on ? "Answering…" : "Ask";
    thread.setAttribute("aria-busy", on ? "true" : "false");
  }

  // Returns the same-origin path for an allowed site URL, or null.
  function siteLink(raw) {
    if (typeof raw !== "string" || !raw.trim()) return null;
    let url;
    try {
      url = new URL(raw.trim(), location.origin + "/");
    } catch (e) {
      return null;
    }
    if (!/^https?:$/.test(url.protocol) || !SITE_HOSTS.includes(url.host)) return null;
    if (url.search || url.username || url.password) return null;
    const path = url.pathname === "/index.html" ? "/" : url.pathname;
    if (path === "/") return HOME_ANCHORS.includes(url.hash) ? "/" + url.hash : null;
    return SITE_PAGES.includes(path) && !url.hash ? path : null;
  }

  function looksLikeUrl(str) {
    if (/\s/.test(str) || !str) return false;
    return /^[a-z][a-z0-9+.-]*:\S/i.test(str) || /^(\/|\.|#|www\.)/i.test(str) || /\.html?(#|$)/i.test(str);
  }

  // Blank out every URL in the program that isn't one of this site's pages,
  // rewrite allowed ones to a same-origin path, drop the emptied @OpenUrl
  // steps, and unwrap off-site markdown links.
  function sanitizeOpenUI(src) {
    const cleaned = src.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (lit) => {
      const q = lit[0];
      const body = lit.slice(1, -1);
      if (looksLikeUrl(body)) return q + (siteLink(body) || "") + q;
      return q + body.replace(/\[([^\]]*)\]\(([^)\s]*)\)/g, (m, label, href) => {
        const ok = siteLink(href);
        return ok ? `[${label}](${ok})` : label;
      }) + q;
    });
    return cleaned
      .replace(/,\s*@OpenUrl\(\s*(?:""|'')\s*\)/g, "")
      .replace(/@OpenUrl\(\s*(?:""|'')\s*\)\s*,?\s*/g, "");
  }

  function loadOpenUI() {
    if (window.__OpenUI) return Promise.resolve(window.__OpenUI);
    if (openuiPromise) return openuiPromise;
    openuiPromise = new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = OPENUI_CSS;
      link.integrity = OPENUI_CSS_SRI;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);

      const script = document.createElement("script");
      script.src = OPENUI_JS;
      script.integrity = OPENUI_JS_SRI;
      script.crossOrigin = "anonymous";
      const timer = setTimeout(() => reject(new Error("timeout")), 15000);
      script.onload = () => {
        clearTimeout(timer);
        if (window.__OpenUI && window.__OpenUI.Renderer) resolve(window.__OpenUI);
        else reject(new Error("OpenUI global missing"));
      };
      script.onerror = () => {
        clearTimeout(timer);
        reject(new Error("OpenUI failed to load"));
      };
      document.head.appendChild(script);
    }).catch((err) => {
      openuiPromise = null; // let a later answer try again
      throw err;
    });
    return openuiPromise;
  }

  function addFallback(text) {
    const bubble = addBubble("answer", text || "I couldn't display this answer here.");
    const more = document.createElement("a");
    more.href = "#case-studies";
    more.className = "qa-bubble__more";
    more.textContent = "Browse case studies ↑";
    bubble.appendChild(document.createElement("br"));
    bubble.appendChild(more);
    return bubble.textContent;
  }

  function collectCitationGroups(node, out) {
    if (Array.isArray(node)) {
      node.forEach((n) => collectCitationGroups(n, out));
    } else if (node && typeof node === "object" && node.type === "element") {
      if (node.typeName === "TextContent" && typeof node.props.text === "string") {
        (node.props.text.match(/(\[\d+\]\s*)+/g) || []).forEach((m) => {
          out.push((m.match(/\d+/g) || []).map(Number));
        });
      }
      Object.values(node.props || {}).forEach((v) => collectCitationGroups(v, out));
    }
    return out;
  }

  function findSources(node) {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const n of node) {
        const found = findSources(n);
        if (found) return found;
      }
      return null;
    }
    if (node.type === "element") {
      if (node.typeName === "Card" && Array.isArray(node.props.sources)) return node.props.sources;
      return findSources(Object.values(node.props || {}));
    }
    return null;
  }

  // Runs once the card has rendered: give inline citations real names and
  // unwrap any link that isn't one of this site's pages.
  function finishCard(holder, parsed) {
    holder.querySelectorAll("a[href]").forEach((a) => {
      const ok = siteLink(a.getAttribute("href"));
      if (ok) {
        a.setAttribute("href", ok);
        a.removeAttribute("target");
      } else {
        a.replaceWith(document.createTextNode(a.textContent));
      }
    });

    const sources = findSources(parsed && parsed.root) || [];
    const groups = collectCitationGroups(parsed && parsed.root, []).filter((g) =>
      g.some((i) => sources[i - 1] && sources[i - 1].title)
    );
    const buttons = holder.querySelectorAll(".openui-citation");
    buttons.forEach((btn, i) => {
      const group = buttons.length === groups.length ? groups[i] : null;
      if (!group) {
        btn.setAttribute("aria-label", "Show sources");
        return;
      }
      const names = group
        .filter((n) => sources[n - 1])
        .map((n) => `${n}: ${sources[n - 1].title}`);
      btn.setAttribute("aria-label", (names.length > 1 ? "Sources " : "Source ") + names.join(", "));
    });
  }

  async function addOpenUIAnswer(program, plainText) {
    const ui = await loadOpenUI();
    const holder = document.createElement("div");
    holder.className = "qa-card";
    thread.appendChild(holder);

    let parsed = null;
    let crashed = false;
    const root = ui.createRoot(holder, {
      onUncaughtError: () => {
        crashed = true;
      },
    });
    root.render(
      ui.React.createElement(ui.Renderer, {
        response: sanitizeOpenUI(program),
        library: ui.openuiChatLibrary,
        isStreaming: false,
        onParseResult: (result) => {
          parsed = result;
        },
        onAction: handleAction,
      })
    );

    // Give React a moment to commit, then check that something real drew.
    await new Promise((r) => setTimeout(r, 120));
    if (crashed || !parsed || !parsed.root || !holder.textContent.trim()) {
      root.unmount();
      holder.remove();
      return addFallback(plainText);
    }
    finishCard(holder, parsed);

    // OpenUI's clickable list rows are role="button" divs without key
    // handling; make Enter and Space work like a click.
    holder.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && !e.defaultPrevented) {
        const row = e.target.closest(".openui-list-item-clickable");
        if (row) {
          e.preventDefault();
          row.click();
        }
      }
    });

    // Scroll to the question, so the card is read from its top.
    const asked = holder.previousElementSibling || holder;
    thread.scrollTop += asked.getBoundingClientRect().top - thread.getBoundingClientRect().top - 12;
    return plainText || holder.innerText.trim();
  }

  function handleAction(event) {
    if (!event) return;
    if (event.type === "continue_conversation") {
      const text = String(event.humanFriendlyMessage || "").trim();
      if (text) ask(text, "ask");
    } else if (event.type === "open_url") {
      const ok = siteLink(event.params && event.params.url);
      if (!ok) return;
      if (ok.startsWith("/#") && (location.pathname === "/" || location.pathname === "/index.html")) {
        location.hash = ok.slice(1);
      } else {
        location.href = ok;
      }
    }
  }

  async function ask(question, askMode) {
    if (busy) return;
    statusEl.textContent = "";
    announceEl.textContent = "";

    if (!question) {
      statusEl.textContent = "Type a question first.";
      return;
    }

    const isFit = askMode === "fit";
    addBubble(
      "question",
      isFit && question.length > 160 ? `Job description: ${question.slice(0, 160)}…` : question
    );
    setBusy(true);

    try {
      const body = { question, history };
      if (isFit) body.mode = "fit";
      const res = await fetch(`${WORKER_URL}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong.");
      }

      const data = await res.json();
      let spoken;
      let remembered = data.answer;

      if (data.format === "openui" && typeof data.answer === "string") {
        remembered = data.text || data.answer;
        try {
          spoken = await addOpenUIAnswer(data.answer, data.text);
        } catch (err) {
          spoken = addFallback(data.text);
        }
      } else {
        addBubble("answer", data.answer);
        spoken = data.answer;
      }

      announceEl.textContent = spoken ? `Answer: ${spoken}` : "";
      history.push({ q: question, a: remembered });
      history = history.slice(-MAX_HISTORY_TURNS);
    } catch (err) {
      statusEl.textContent = "Couldn't get an answer. Check your connection and try again.";
      if (!textarea.value) {
        textarea.value = question;
        growTextarea();
      }
    } finally {
      setBusy(false);
    }
  }

  textarea.addEventListener("input", growTextarea);

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  document.querySelectorAll(".assistant-card__starter").forEach((btn) => {
    btn.addEventListener("click", () => ask(btn.textContent.trim(), "ask"));
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (busy) return;
    const question = textarea.value.trim();
    if (question) {
      textarea.value = "";
      textarea.style.height = "auto";
    }
    ask(question, mode);
  });

  form.addEventListener("keydown", (e) => {
    // In job-description mode Enter adds a line; Cmd/Ctrl+Enter sends.
    if (e.key !== "Enter" || e.shiftKey) return;
    if (mode === "fit" && !(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    form.requestSubmit();
  });
})();
