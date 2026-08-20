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
(function () {
  const form = document.getElementById("assistant-form");
  if (!form) return;

  const WORKER_URL = "https://tokim-assistant.tokim25.workers.dev";
  const MAX_HISTORY_TURNS = 6;

  const textarea = document.getElementById("assistant-question");
  const sendBtn = document.getElementById("assistant-send");
  const sendLabel = document.getElementById("assistant-send-label");
  const statusEl = document.getElementById("assistant-status");
  const thread = document.getElementById("assistant-thread");

  let history = [];

  function addBubble(role, text) {
    const bubble = document.createElement("div");
    bubble.className = `qa-bubble ${role}`;
    bubble.textContent = text;
    thread.appendChild(bubble);
    thread.scrollTop = thread.scrollHeight;
  }

  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 100) + "px";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const question = textarea.value.trim();
    statusEl.textContent = "";

    if (!question) {
      statusEl.textContent = "Type a question first.";
      return;
    }

    addBubble("question", question);
    textarea.value = "";
    textarea.style.height = "auto";
    sendBtn.disabled = true;
    sendLabel.textContent = "…";

    try {
      const res = await fetch(`${WORKER_URL}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong.");
      }

      const data = await res.json();
      addBubble("answer", data.answer);
      history.push({ q: question, a: data.answer });
      history = history.slice(-MAX_HISTORY_TURNS);
    } catch (err) {
      statusEl.textContent = "Couldn't get an answer. Check your connection and try again.";
    } finally {
      sendBtn.disabled = false;
      sendLabel.textContent = "Ask";
    }
  });

  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
})();
