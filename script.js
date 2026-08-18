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

// "Talk" card: anonymous, no-account chat backed by a Cloudflare Worker.
// Only runs on pages that actually have the card (currently just index.html).
(function () {
  const form = document.getElementById("talk-form");
  if (!form) return;

  const WORKER_URL = "https://tokim-talk.tokim25.workers.dev";
  const POLL_MS = 4000;

  const ADJECTIVES = [
    "Quiet", "Clever", "Swift", "Gentle", "Bold", "Curious", "Calm", "Bright",
    "Sly", "Brave", "Merry", "Nimble", "Wise", "Lucky", "Vivid", "Quick",
    "Steady", "Sunny", "Mellow", "Sharp",
  ];
  const ANIMALS = [
    { name: "Fox", emoji: "\u{1F98A}" }, { name: "Owl", emoji: "\u{1F989}" }, { name: "Otter", emoji: "\u{1F9A6}" },
    { name: "Panda", emoji: "\u{1F43C}" }, { name: "Falcon", emoji: "\u{1F985}" }, { name: "Rabbit", emoji: "\u{1F430}" },
    { name: "Wolf", emoji: "\u{1F43A}" }, { name: "Deer", emoji: "\u{1F98C}" }, { name: "Turtle", emoji: "\u{1F422}" },
    { name: "Koala", emoji: "\u{1F428}" }, { name: "Tiger", emoji: "\u{1F42F}" }, { name: "Lion", emoji: "\u{1F981}" },
    { name: "Bear", emoji: "\u{1F43B}" }, { name: "Penguin", emoji: "\u{1F427}" }, { name: "Dolphin", emoji: "\u{1F42C}" },
    { name: "Hedgehog", emoji: "\u{1F994}" }, { name: "Raccoon", emoji: "\u{1F99D}" }, { name: "Peacock", emoji: "\u{1F99A}" },
    { name: "Swan", emoji: "\u{1F9A2}" }, { name: "Octopus", emoji: "\u{1F419}" },
  ];

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function getNickname(sessionId) {
    const h = hashString(sessionId);
    const adj = ADJECTIVES[h % ADJECTIVES.length];
    const animal = ANIMALS[Math.floor(h / ADJECTIVES.length) % ANIMALS.length];
    return `${animal.emoji} ${adj} ${animal.name}`;
  }

  function getSessionId() {
    let id = localStorage.getItem("talkSessionId");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("talkSessionId", id);
    }
    return id;
  }

  const textarea = document.getElementById("talk-message");
  const website = document.getElementById("talk-website");
  const sendBtn = document.getElementById("talk-send");
  const sendLabel = document.getElementById("talk-send-label");
  const statusEl = document.getElementById("talk-status");
  const thread = document.getElementById("talk-thread");
  const emptyState = document.getElementById("talk-empty");
  const nicknameEl = document.getElementById("talk-nickname");

  const sessionId = getSessionId();
  nicknameEl.textContent = getNickname(sessionId);

  let renderedCount = 0;

  function renderMessages(messages) {
    if (messages.length === 0) return;
    if (emptyState) emptyState.style.display = "none";

    for (let i = renderedCount; i < messages.length; i++) {
      const m = messages[i];
      const bubble = document.createElement("div");
      bubble.className = `bubble ${m.role}`;
      bubble.textContent = m.text;
      thread.appendChild(bubble);
    }
    renderedCount = messages.length;
    thread.scrollTop = thread.scrollHeight;
  }

  async function poll() {
    try {
      const res = await fetch(`${WORKER_URL}/api/messages?sessionId=${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      renderMessages(data.messages || []);
    } catch {
      // Silent fail on poll -- will retry next interval.
    }
  }

  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 100) + "px";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = textarea.value.trim();
    statusEl.textContent = "";

    if (!message) {
      statusEl.textContent = "Type something first.";
      return;
    }

    sendBtn.disabled = true;
    sendLabel.textContent = "…";

    try {
      const res = await fetch(`${WORKER_URL}/api/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message, website: website.value }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong.");
      }

      textarea.value = "";
      textarea.style.height = "auto";
      await poll();
    } catch (err) {
      statusEl.textContent = "Couldn't send — check your connection and try again.";
    } finally {
      sendBtn.disabled = false;
      sendLabel.textContent = "Send";
    }
  });

  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  poll();
  let pollTimer = setInterval(poll, POLL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearInterval(pollTimer);
    } else {
      poll();
      pollTimer = setInterval(poll, POLL_MS);
    }
  });
})();
