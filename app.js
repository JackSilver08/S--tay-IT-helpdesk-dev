(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const navToggle = document.querySelector(".nav-toggle");
  const mobileNav = document.querySelector(".mobile-nav");
  const navScrim = document.querySelector(".nav-scrim");
  const mobileNavClose = document.querySelector(".mobile-nav-close");
  const navLinks = [...document.querySelectorAll("[data-nav-link]")];
  const sections = [...document.querySelectorAll("[data-section]")];
  const topbar = document.querySelector(".topbar");
  const progressBar = document.querySelector("#progress-bar");
  const backToTop = document.querySelector(".back-to-top");
  const searchInput = document.querySelector("#guide-search");
  const searchFeedback = document.querySelector("#search-feedback");
  const searchables = [...document.querySelectorAll("[data-searchable]")];
  const toast = document.querySelector("#toast");
  let toastTimer;
  let lastFocusedElement;

  const scrollBehavior = reduceMotion ? "auto" : "smooth";

  function setActiveSection(id) {
    if (!id) return;

    navLinks.forEach((link) => {
      const active = link.dataset.navLink === id;
      link.classList.toggle("is-active", active);
      if (active) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function moveToSection(id, shouldFocus = true) {
    const target = document.getElementById(id);
    if (!target) return;

    window.history.pushState(null, "", `#${id}`);
    target.scrollIntoView({ behavior: scrollBehavior, block: "start" });
    setActiveSection(id);
    closeMobileNav(false);

    if (shouldFocus) {
      window.setTimeout(() => {
        target.focus({ preventScroll: true });
      }, reduceMotion ? 0 : 350);
    }
  }

  function openMobileNav() {
    if (!navToggle || !mobileNav || !navScrim) return;
    lastFocusedElement = document.activeElement === document.body ? navToggle : document.activeElement;
    navToggle.setAttribute("aria-expanded", "true");
    mobileNav.setAttribute("aria-hidden", "false");
    mobileNav.classList.add("is-open");
    navScrim.classList.add("is-open");
    document.body.classList.add("nav-open");
    window.setTimeout(() => mobileNavClose?.focus(), 0);
  }

  function closeMobileNav(restoreFocus = true) {
    if (!navToggle || !mobileNav || !navScrim || !mobileNav.classList.contains("is-open")) return;
    navToggle.setAttribute("aria-expanded", "false");
    mobileNav.setAttribute("aria-hidden", "true");
    mobileNav.classList.remove("is-open");
    navScrim.classList.remove("is-open");
    document.body.classList.remove("nav-open");
    // Restoring focus must never drag the viewport, and must not happen at all
    // when the drawer closes because the reader picked a section to jump to.
    if (restoreFocus && lastFocusedElement instanceof HTMLElement) {
      lastFocusedElement.focus({ preventScroll: true });
    }
  }

  navToggle?.addEventListener("click", () => {
    if (mobileNav?.classList.contains("is-open")) {
      closeMobileNav();
    } else {
      openMobileNav();
    }
  });

  mobileNavClose?.addEventListener("click", () => closeMobileNav());
  navScrim?.addEventListener("click", () => closeMobileNav());

  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const id = link.dataset.navLink;
      if (!id) return;
      event.preventDefault();
      moveToSection(id);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileNav?.classList.contains("is-open")) {
      closeMobileNav();
      return;
    }

    if (
      event.key === "/" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      document.activeElement !== searchInput &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
    ) {
      event.preventDefault();
      searchInput?.focus();
    }

    if (event.key !== "Tab" || !mobileNav?.classList.contains("is-open")) return;
    const focusables = [...mobileNav.querySelectorAll('a[href], button:not([disabled]), input:not([disabled])')];
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.querySelectorAll("[data-focus-search]").forEach((button) => {
    button.addEventListener("click", () => {
      closeMobileNav(false);
      document.querySelector(".search-panel")?.scrollIntoView({ behavior: scrollBehavior, block: "center" });
      window.setTimeout(() => searchInput?.focus({ preventScroll: true }), reduceMotion ? 0 : 300);
    });
  });

  function updateReadingState() {
    const topOffset = (topbar?.offsetHeight || 0) + 30;
    let current = sections[0];

    sections.forEach((section) => {
      if (section.hidden) return;
      if (section.getBoundingClientRect().top <= topOffset) current = section;
    });

    if (current) setActiveSection(current.id);

    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollHeight > 0 ? (window.scrollY / scrollHeight) * 100 : 0;
    if (progressBar) progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    backToTop?.classList.toggle("is-visible", window.scrollY > 620);
  }

  let scrollQueued = false;
  window.addEventListener(
    "scroll",
    () => {
      if (scrollQueued) return;
      scrollQueued = true;
      window.requestAnimationFrame(() => {
        updateReadingState();
        scrollQueued = false;
      });
    },
    { passive: true }
  );

  window.addEventListener("resize", updateReadingState, { passive: true });
  window.addEventListener("hashchange", () => {
    const id = window.location.hash.replace("#", "");
    if (document.getElementById(id)) setActiveSection(id);
  });

  backToTop?.addEventListener("click", () => moveToSection("bat-dau"));

  /* ------------------------------ search ------------------------------ */

  function normalize(value) {
    return value
      .toLocaleLowerCase("vi")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .trim();
  }

  const filterGroups = sections
    .map((section) => ({ section, items: [...section.querySelectorAll("[data-searchable]")] }))
    .filter((group) => group.items.length > 0);

  function syncFilteredSections(isFiltering) {
    filterGroups.forEach(({ section, items }) => {
      const hasVisibleItem = items.some((item) => !item.hidden);
      section.hidden = isFiltering && !hasVisibleItem;
    });

    navLinks.forEach((link) => {
      const target = document.getElementById(link.dataset.navLink || "");
      link.classList.toggle("is-muted", Boolean(target?.hidden));
    });

    updateReadingState();
  }

  function runSearch() {
    if (!searchInput || !searchFeedback) return;
    const query = normalize(searchInput.value);

    if (!query) {
      searchables.forEach((item) => {
        item.hidden = false;
      });
      syncFilteredSections(false);
      searchFeedback.textContent = `Sẵn sàng tra cứu ${searchables.length} khối nội dung trong 12 chương và phụ lục.`;
      return;
    }

    let matches = 0;
    searchables.forEach((item) => {
      const source = normalize(`${item.dataset.searchText || ""} ${item.textContent || ""}`);
      const isMatch = source.includes(query);
      item.hidden = !isMatch;
      if (isMatch) matches += 1;
    });

    syncFilteredSections(true);

    const chapters = filterGroups.filter(({ section }) => !section.hidden).length;
    searchFeedback.textContent = matches
      ? `Tìm thấy ${matches} khối trong ${chapters} chương cho “${searchInput.value.trim()}”. Nhấn Enter để nhảy tới kết quả đầu tiên.`
      : `Chưa có kết quả cho “${searchInput.value.trim()}”. Thử từ khóa khác hoặc bỏ dấu tiếng Việt.`;
  }

  function jumpToFirstMatch() {
    const firstOpenSection = filterGroups.find(({ section }) => !section.hidden);
    if (firstOpenSection) moveToSection(firstOpenSection.section.id, false);
  }

  searchInput?.addEventListener("input", runSearch);
  searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      searchInput.value = "";
      runSearch();
      searchInput.blur();
      return;
    }

    if (event.key === "Enter" && searchInput.value.trim()) {
      event.preventDefault();
      jumpToFirstMatch();
    }
  });

  /* -------------------- cây quyết định theo 4 tầng -------------------- */

  const decisionQuestion = document.querySelector("#decision-question");
  const decisionDetail = document.querySelector("#decision-detail");
  const decisionCounter = document.querySelector("#decision-counter");
  const decisionOverline = document.querySelector("#decision-overline");
  const decisionActions = document.querySelector("#decision-actions");
  const decisionReset = document.querySelector("#decision-reset");

  const decisionStages = {
    start: {
      counter: "TẦNG 1 / 4",
      label: "BẮT ĐẦU",
      question: "Máy không vào được Internet. Chạy ping 127.0.0.1 — có trả lời không?",
      detail: "Bước này chỉ trả lời một câu hỏi: stack TCP/IP trên chính máy này có hoạt động không.",
      options: [
        { label: "Có trả lời", next: "gateway" },
        { label: "Không trả lời", next: "stackFail" }
      ]
    },
    stackFail: {
      counter: "DỪNG Ở TẦNG 1",
      label: "KHOANH VÙNG",
      question: "Xem xét stack hoặc cấu hình hệ thống.",
      detail:
        "TCP/IP local không phản hồi nên chưa cần đụng tới mạng bên ngoài. Các lệnh reset như netsh winsock reset hoặc netsh int ip reset thường cần khởi động lại — chỉ dùng khi được phép và sau khi đã ghi nhận baseline.",
      options: []
    },
    gateway: {
      counter: "TẦNG 2 / 4",
      label: "GATEWAY",
      question: "Ping địa chỉ Gateway — có trả lời không?",
      detail: "Lấy Gateway từ ipconfig /all. Bước này trả lời: máy có nói chuyện được trong LAN không.",
      options: [
        { label: "Có trả lời", next: "internet" },
        { label: "Không trả lời", next: "lanFail" }
      ]
    },
    lanFail: {
      counter: "DỪNG Ở TẦNG 2",
      label: "KHOANH VÙNG",
      question: "Kiểm tra LAN, router, VLAN và firewall.",
      detail:
        "Nếu IPv4 đang là 169.254.x.x thì nghi DHCP không cấp được địa chỉ. Kiểm tra dây, đèn Link/Activity, switch port, VLAN và DHCP trước khi kết luận.",
      options: []
    },
    internet: {
      counter: "TẦNG 3 / 4",
      label: "ĐƯỜNG RA INTERNET",
      question: "Ping 8.8.8.8 — có trả lời không?",
      detail:
        "Bước này tách lỗi đường ra khỏi lỗi phân giải tên. Dùng một địa chỉ Internet phù hợp với chính sách của tổ chức.",
      options: [
        { label: "Có trả lời", next: "dns" },
        { label: "Không trả lời", next: "wanFail" }
      ]
    },
    wanFail: {
      counter: "DỪNG Ở TẦNG 3",
      label: "KHOANH VÙNG",
      question: "Kiểm tra router, ISP và đường ra.",
      detail:
        "LAN đã thông tới Gateway nhưng không ra được Internet. Nếu nhiều thiết bị cùng lỗi và phạm vi nằm ở router hoặc ISP, đây là điểm cần escalation.",
      options: []
    },
    dns: {
      counter: "TẦNG 4 / 4",
      label: "PHÂN GIẢI TÊN",
      question: "nslookup google.com — có phân giải được không?",
      detail: "Ping bằng IP chạy được mà tên miền không mở thường là dấu hiệu của DNS.",
      options: [
        { label: "Phân giải được", next: "appLayer" },
        { label: "Không phân giải", next: "dnsFail" }
      ]
    },
    dnsFail: {
      counter: "DỪNG Ở TẦNG 4",
      label: "KHOANH VÙNG",
      question: "Kiểm tra DNS server, cache và cấu hình.",
      detail:
        "Xem DNS server đang trả lời là ai, xóa cache bằng ipconfig /flushdns nếu nghi cache cũ, rồi kiểm tra lại nslookup và ứng dụng.",
      options: []
    },
    appLayer: {
      counter: "QUA CẢ 4 TẦNG",
      label: "MẠNG CƠ BẢN ĐÃ THÔNG",
      question: "Bốn tầng đều đạt — chuyển sang tầng ứng dụng.",
      detail:
        "Khi chỉ một ứng dụng lỗi, khả năng nằm ở ứng dụng, proxy hoặc firewall. Kiểm tra riêng ứng dụng đó, rồi xác nhận lại bằng chính thao tác mà người dùng đã báo lỗi.",
      options: []
    }
  };

  function renderDecision(stageName) {
    const stage = decisionStages[stageName];
    if (!stage || !decisionActions || !decisionQuestion || !decisionDetail || !decisionCounter) return;

    decisionCounter.textContent = stage.counter;
    if (decisionOverline) decisionOverline.textContent = stage.label;
    decisionQuestion.textContent = stage.question;
    decisionDetail.textContent = stage.detail;
    decisionActions.replaceChildren();

    stage.options.forEach((option) => {
      const button = document.createElement("button");
      const arrow = document.createElement("span");
      button.type = "button";
      button.className = "decision-button";
      button.textContent = option.label;
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "→";
      button.append(arrow);
      button.addEventListener("click", () => renderDecision(option.next));
      decisionActions.append(button);
    });

    if (decisionReset) decisionReset.hidden = stage.options.length > 0;
  }

  decisionReset?.addEventListener("click", () => renderDecision("start"));

  /* ----------------------------- combo tabs --------------------------- */

  const comboTabs = [...document.querySelectorAll("[data-combo-tab]")];
  const comboPanels = [...document.querySelectorAll("[data-combo-panel]")];

  function activateCombo(combo) {
    comboTabs.forEach((tab) => {
      const selected = tab.dataset.comboTab === combo;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    comboPanels.forEach((panel) => {
      panel.hidden = panel.dataset.comboPanel !== combo;
    });
  }

  comboTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateCombo(tab.dataset.comboTab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % comboTabs.length;
      if (event.key === "ArrowLeft") nextIndex = (index - 1 + comboTabs.length) % comboTabs.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = comboTabs.length - 1;
      const nextTab = comboTabs[nextIndex];
      activateCombo(nextTab.dataset.comboTab);
      nextTab.focus();
    });
  });

  /* ------------------------------ checklist ---------------------------- */

  const checklist = document.querySelector("#checklist");
  const checklistBoxes = checklist ? [...checklist.querySelectorAll('input[type="checkbox"]')] : [];
  const checklistCount = document.querySelector("#checklist-count");
  const checklistBar = document.querySelector("#checklist-bar");
  const checklistReset = document.querySelector("#checklist-reset");

  function updateChecklist() {
    if (!checklistBoxes.length) return;
    const done = checklistBoxes.filter((box) => box.checked).length;
    if (checklistCount) checklistCount.textContent = `${done} / ${checklistBoxes.length}`;
    if (checklistBar) checklistBar.style.width = `${(done / checklistBoxes.length) * 100}%`;
  }

  checklistBoxes.forEach((box) => box.addEventListener("change", updateChecklist));
  checklistReset?.addEventListener("click", () => {
    checklistBoxes.forEach((box) => {
      box.checked = false;
    });
    updateChecklist();
  });

  /* ------------------------------- copy -------------------------------- */

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
  }

  function legacyCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    textarea.remove();
    return copied;
  }

  // Delegated: the handbook has dozens of command blocks, and each copy button
  // simply takes the <code> sitting beside it.
  document.addEventListener("click", async (event) => {
    const button = event.target instanceof Element ? event.target.closest(".copy-button") : null;
    if (!button) return;

    const text = button.closest(".cmd-line")?.querySelector("code")?.textContent?.trim();
    if (!text) return;

    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = legacyCopy(text);
    }

    if (!copied) copied = legacyCopy(text);
    showToast(
      copied
        ? `Đã sao chép: ${text}`
        : "Không thể sao chép tự động. Hãy chọn và sao chép lệnh thủ công."
    );
  });

  /* ----------------------------- khởi tạo ------------------------------ */

  if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // Offline support is optional; the handbook stays usable without it.
      });
    });
  }

  renderDecision("start");

  const selectedTab = comboTabs.find((tab) => tab.getAttribute("aria-selected") === "true");
  const initialCombo = (selectedTab || comboTabs[0])?.dataset.comboTab;
  if (initialCombo) activateCombo(initialCombo);

  updateChecklist();
  runSearch();

  const initialId = window.location.hash.replace("#", "");
  setActiveSection(sections.some((section) => section.id === initialId) ? initialId : "bat-dau");
  updateReadingState();
})();
