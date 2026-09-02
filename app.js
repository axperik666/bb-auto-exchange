(function () {
  "use strict";

  const inventory = Array.isArray(window.INVENTORY) ? window.INVENTORY : [];
  const config = window.SITE_CONFIG || {};
  const metaPixelIds = getMetaPixelIds();
  const callLines = (Array.isArray(config.phones) && config.phones.length ? config.phones : [config.phone]).filter(Boolean).join(" or ");
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  let activeVehicle = null;
  let lastTrackedVehicleId = null;
  let lastSubmissionKey = "";
  let lastSubmissionAt = 0;
  let inventoryExpanded = false;
  let lastCompactMode = matchMedia("(max-width: 760px)").matches;
  const initializedMetaPixelIds = new Set();
  const pageViewTrackedPixelIds = new Set();
  const pathVehicleMatch = location.pathname.match(/\/cars\/([^/]+)\/?$/i);
  const requestedVehicleId = (pathVehicleMatch && decodeURIComponent(pathVehicleMatch[1])) || new URLSearchParams(location.search).get("vehicle");
  const campaignVehicle = inventory.find((vehicle) => vehicle.id === requestedVehicleId) || null;
  const featuredVehicle = inventory.find((vehicle) => vehicle.id === config.featuredVehicleId) || inventory[0] || null;

  function isPreview() {
    return Boolean(config.demoMode) || location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(location.hostname);
  }

  function assetPath(src) {
    if (/^(?:https?:)?\/\//i.test(src) || src.startsWith("/")) return src;
    return `/${src.replace(/^\.\//, "")}`;
  }

  function responsiveImage(src, width) {
    return assetPath(src).replace(/\.webp$/i, `-${width}.webp`);
  }

  function responsiveSrcset(src) {
    const source = assetPath(src);
    return `${responsiveImage(source, 480)} 480w, ${responsiveImage(source, 800)} 800w, ${source} 1200w`;
  }

  function setResponsiveImage(image, src) {
    if (!image || !src) return;
    const source = assetPath(src);
    image.srcset = responsiveSrcset(source);
    image.src = source;
  }

  function validatePhoneInput(input) {
    if (!input) return false;
    const digits = input.value.replace(/\D/g, "");
    input.setCustomValidity(digits.length >= 7 ? "" : "Enter at least 7 digits. You may use +, spaces, parentheses, or dashes.");
    return input.validity.valid;
  }

  function fieldErrorMessage(field) {
    if (field.disabled || !field.willValidate) return "";
    const value = String(field.value || "").trim();
    if (field.required && (field.type === "checkbox" ? !field.checked : !value)) {
      if (field.type === "checkbox") return "Please check this box so the dealer can contact you about your request.";
      const required = {
        firstName: "Please enter your first name.",
        lastName: "Please enter your last name.",
        name: "Please enter your name.",
        phone: "Please enter your phone number.",
        email: "Please enter your email address.",
        vehicleSlug: "Please choose the exact vehicle.",
        requestType: "Please choose what you would like to receive.",
        message: "Please enter your question."
      };
      return required[field.name] || "Please complete this field.";
    }
    if (field.type === "tel" && !validatePhoneInput(field)) return "Please enter at least 7 digits. Spaces, +, parentheses, and dashes are welcome.";
    if (field.type === "email" && field.validity.typeMismatch) return "Please enter a valid email address, such as name@example.com.";
    if (!field.validity.valid) return "Please check this field and try again.";
    return "";
  }

  function setFieldError(field, message) {
    const id = `${field.form.id}-${field.name}-error`;
    let error = document.getElementById(id);
    if (!error && message) {
      error = document.createElement("small");
      error.id = id;
      error.className = "field-error";
      error.lang = "en";
      error.setAttribute("role", "alert");
      const anchor = field.type === "checkbox" ? field.closest("label") || field : field;
      anchor.insertAdjacentElement("afterend", error);
      const descriptions = new Set((field.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
      descriptions.add(id);
      field.setAttribute("aria-describedby", [...descriptions].join(" "));
    }
    if (error) {
      error.textContent = message;
      error.hidden = !message;
    }
    if (message) field.setAttribute("aria-invalid", "true");
    else field.removeAttribute("aria-invalid");
  }

  function validateFields(root, revealField) {
    let firstInvalid = null;
    $$("input, select, textarea", root).forEach((field) => {
      const message = fieldErrorMessage(field);
      setFieldError(field, message);
      if (message && !firstInvalid) firstInvalid = field;
    });
    if (!firstInvalid) return true;
    if (revealField) revealField(firstInvalid);
    firstInvalid.focus();
    firstInvalid.scrollIntoView({ block: "center", behavior: "smooth" });
    return false;
  }

  function setupEnglishValidation() {
    $$("form").forEach((form) => {
      form.noValidate = true;
      form.addEventListener("invalid", (event) => event.preventDefault(), true);
      form.addEventListener("input", () => {
        const previousSuccess = $(".form-status.success", form);
        if (previousSuccess) {
          previousSuccess.className = "form-status";
          previousSuccess.textContent = "";
        }
      });
      $$("input, select, textarea", form).forEach((field) => {
        const refresh = () => {
          if (field.hasAttribute("aria-invalid")) setFieldError(field, fieldErrorMessage(field));
        };
        field.addEventListener("input", refresh);
        field.addEventListener("change", refresh);
      });
      form.addEventListener("reset", () => {
        $$("input, select, textarea", form).forEach((field) => setFieldError(field, ""));
      });
    });
  }

  function showRequestSuccess(status) {
    status.className = "form-status success";
    status.textContent = "Thank you! Your request has been sent. Please expect a call from the dealer shortly.";
    status.lang = "en";
    status.tabIndex = -1;
    status.focus({ preventScroll: true });
    status.scrollIntoView({ block: "center", behavior: "smooth" });
  }


  function setupFlexiblePhoneInputs() {
    $$("input[type='tel']").forEach((input) => {
      input.inputMode = "tel";
      input.autocomplete = "tel";
      input.maxLength = 40;
      input.placeholder = "+1 (555) 555-5555";
      input.setAttribute("aria-describedby", `${input.id || input.name}-format-hint`);
      input.addEventListener("input", () => validatePhoneInput(input));
      const hint = document.createElement("small");
      hint.className = "phone-format-hint";
      hint.id = `${input.id || input.name}-format-hint`;
      hint.textContent = "Any phone format is fine — include +1 or another country code if needed.";
      input.insertAdjacentElement("afterend", hint);
    });
  }

  function setupVehicleQuickRequest() {
    if (!campaignVehicle) return;
    [$(".floating-actions"), $(".mobile-cta")].filter(Boolean).forEach((bar) => {
      const chatButton = $("[data-chat-open]", bar);
      if (!chatButton || $(".vehicle-lead-cta", bar)) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "vehicle-lead-cta";
      button.innerHTML = bar.classList.contains("mobile-cta")
        ? "<span>Request</span><small>details</small>"
        : '<i data-lucide="clipboard-check" aria-hidden="true"></i><span>Request details</span>';
      button.setAttribute("aria-label", `Request details about ${campaignVehicle.title}`);
      button.addEventListener("click", () => openLead(campaignVehicle.id, "Availability and details"));
      bar.insertBefore(button, chatButton);
    });
  }

  function phoneHref(phone) {
    return `tel:${String(phone || "").replace(/[^\d+]/g, "")}`;
  }

  function replaceWithCallLink(element, phone) {
    if (!element || !phone) return;
    const link = document.createElement("a");
    link.className = element.className;
    link.href = phoneHref(phone);
    link.innerHTML = `<i data-lucide="phone" aria-hidden="true"></i><span>Call ${phone}</span>`;
    element.replaceWith(link);
  }

  function setupCampaignLanding() {
    if (!campaignVehicle) return;
    const primaryPhone = (Array.isArray(config.phones) && config.phones[0]) || config.phone;
    const vehicleSelect = $("#vehicle-select");
    if (vehicleSelect) {
      vehicleSelect.innerHTML = `<option value="${campaignVehicle.id}">${campaignVehicle.title} — ${money.format(campaignVehicle.price)}${campaignVehicle.stock ? ` — Stock ${campaignVehicle.stock}` : ""}</option>`;
      vehicleSelect.value = campaignVehicle.id;
      vehicleSelect.setAttribute("aria-label", "Exact vehicle from your ad");
      vehicleSelect.closest("label")?.classList.add("vehicle-locked-field");
    }

    const actions = $(".garage-hero .hero-actions");
    if (actions && !$(".vehicle-certainty", actions.parentElement)) {
      actions.insertAdjacentHTML("afterend", `<div class="vehicle-certainty" aria-label="Exact listing confirmation"><span><strong>Exact vehicle</strong>From your ad</span><span><strong>${campaignVehicle.images.length} real photos</strong>Of this listing</span><span><strong>${campaignVehicle.stock ? `Stock ${campaignVehicle.stock}` : "Current listing"}</strong>${money.format(campaignVehicle.price)} asking price</span></div>`);
    }

    replaceWithCallLink($("#hero-video-cta"), primaryPhone);
    $$('[data-campaign-request="Availability and details"]').forEach(button => button.textContent = "Request details");
  }

  function setupPhoneTracking() {
    $$('a[href^="tel:"]').forEach((link) => link.addEventListener("click", () => {
      trackMetaEvent("PhoneClick", {
        content_name: campaignVehicle ? campaignVehicle.title : "B & B Auto Exchange",
        content_ids: campaignVehicle ? [campaignVehicle.id] : [],
        vehicle_stock: campaignVehicle ? campaignVehicle.stock || "" : "",
        phone_number: link.getAttribute("href").replace(/^tel:/, "")
      }, { custom: true });
    }));
  }

  function getMetaPixelIds() {
    const configuredIds = Array.isArray(config.metaPixelIds) ? config.metaPixelIds : [config.metaPixelId];
    return [...new Set(configuredIds.map((id) => String(id || "").trim()).filter((id) => /^\d{5,20}$/.test(id)))];
  }

  function trackMetaEvent(eventName, parameters = {}, { custom = false, eventId = "" } = {}) {
    if (!window.fbq || !metaPixelIds.length) return;
    const command = custom ? "trackSingleCustom" : "trackSingle";
    metaPixelIds.forEach((pixelId) => {
      if (eventId) window.fbq(command, pixelId, eventName, parameters, { eventID: eventId });
      else window.fbq(command, pixelId, eventName, parameters);
    });
  }

  function captureAttribution() {
    const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"];
    const current = new URLSearchParams(location.search);
    let saved = {};
    try { saved = JSON.parse(sessionStorage.getItem("bb_attribution") || "{}"); } catch { saved = {}; }
    keys.forEach((key) => {
      if (current.get(key)) saved[key] = current.get(key).slice(0, 500);
    });
    if (!saved.landingUrl) saved.landingUrl = location.href.slice(0, 2000);
    sessionStorage.setItem("bb_attribution", JSON.stringify(saved));
    return saved;
  }

  function loadMetaPixel() {
    if (isPreview() || !metaPixelIds.length) return;
    (function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = true; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    metaPixelIds.forEach((pixelId) => {
      if (!initializedMetaPixelIds.has(pixelId)) {
        window.fbq("init", pixelId);
        initializedMetaPixelIds.add(pixelId);
      }
      if (!pageViewTrackedPixelIds.has(pixelId)) {
        window.fbq("trackSingle", pixelId, "PageView");
        pageViewTrackedPixelIds.add(pixelId);
      }
    });
  }

  function loadLiveChat() {
    if (window.LiveChatWidget || isPreview() || !config.liveChatLicense) return;
    window.__lc = window.__lc || {};
    window.__lc.license = Number(config.liveChatLicense);
    window.__lc.integration_name = "manual_channels";
    window.__lc.product_name = "livechat";
    (function (n, t, c) {
      function i(args) { return e._h ? e._h.apply(null, args) : e._q.push(args); }
      const e = { _q: [], _h: null, _v: "2.0", on() { i(["on", c.call(arguments)]); }, once() { i(["once", c.call(arguments)]); }, off() { i(["off", c.call(arguments)]); }, get() { if (!e._h) throw new Error("LiveChat not ready"); return i(["get", c.call(arguments)]); }, call() { i(["call", c.call(arguments)]); }, init() { const script = t.createElement("script"); script.async = true; script.src = "https://cdn.livechatinc.com/tracking.js"; t.head.appendChild(script); } };
      if (!n.__lc.asyncInit) e.init();
      n.LiveChatWidget = n.LiveChatWidget || e;
    })(window, document, [].slice);
  }

  function openChat() {
    if (!isPreview() && config.liveChatLicense) {
      loadLiveChat();
      document.documentElement.classList.add("external-chat-open");
      if (!openChat.visibilityBound && window.LiveChatWidget && typeof window.LiveChatWidget.on === "function") {
        window.LiveChatWidget.on("visibility_changed", (data) => {
          const visibility = data && data.visibility;
          document.documentElement.classList.toggle("external-chat-open", visibility === "maximized");
          if (visibility === "minimized" && typeof window.LiveChatWidget.call === "function") window.LiveChatWidget.call("hide");
        });
        openChat.visibilityBound = true;
      }
      window.LiveChatWidget.call("maximize");
      trackMetaEvent("LiveChatOpen", {}, { custom: true });
      return;
    }
    openLead();
  }

  function updateVehicleMetadata(vehicle) {
    const title = `${vehicle.title} for Sale — ${money.format(vehicle.price)} | B & B Auto Exchange`;
    const description = `${vehicle.title}, stock ${vehicle.stock || "available listing"}, offered at ${money.format(vehicle.price)} by B & B Auto Exchange. View ${vehicle.images.length} real photos and ask about this exact vehicle.`;
    document.title = title;
    const descriptionMeta = document.querySelector('meta[name="description"]');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    const ogImage = document.querySelector('meta[property="og:image"]');
    const vehicleMeta = document.querySelector('meta[name="vehicle-id"]');
    if (descriptionMeta) descriptionMeta.content = description;
    if (ogTitle) ogTitle.content = title;
    if (ogDescription) ogDescription.content = description;
    if (ogImage) ogImage.content = new URL(assetPath(vehicle.images[0]), location.origin).href;
    if (vehicleMeta) vehicleMeta.content = vehicle.id;
  }

  function trackVehicleView(vehicle) {
    if (!window.fbq || lastTrackedVehicleId === vehicle.id) return;
    lastTrackedVehicleId = vehicle.id;
    trackMetaEvent("ViewContent", { content_name: vehicle.title, content_ids: [vehicle.id], content_type: "vehicle", vehicle_stock: vehicle.stock || "", value: vehicle.price, currency: "USD" });
  }

  function setupSectionLinks() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest('a[href^="#"]');
      const hash = link && link.getAttribute("href");
      if (!hash || hash === "#") return;
      const target = document.querySelector(hash);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      const url = new URL(location.href);
      url.hash = hash;
      history.replaceState(history.state, "", url);
    });
  }

  function setVehicleUrl(vehicle) {
    const current = new URL(location.href);
    const url = new URL(`/cars/${encodeURIComponent(vehicle.id)}/`, location.origin);
    current.searchParams.forEach((value, key) => { if (key !== "vehicle") url.searchParams.append(key, value); });
    history.replaceState({ vehicle: vehicle.id }, "", url);
  }

  function vehicleHref(vehicle) {
    const current = new URL(location.href);
    const url = new URL(`/cars/${encodeURIComponent(vehicle.id)}/`, location.origin);
    current.searchParams.forEach((value, key) => { if (key !== "vehicle") url.searchParams.append(key, value); });
    return url.href;
  }

  function renderCampaignProof(vehicle) {
    document.documentElement.classList.add("vehicle-landing");
    $("#campaign-proof").hidden = false;
    $("#campaign-proof-title").textContent = vehicle.title;
    $("#campaign-proof-price").textContent = `${money.format(vehicle.price)} asking price${vehicle.stock ? ` · Stock ${vehicle.stock}` : ""}`;
    $("#campaign-proof-mood").textContent = vehicle.mood;
    $("#campaign-proof-specs").innerHTML = [["Engine", vehicle.engine], ["Transmission", vehicle.transmission], ["Mileage", vehicle.mileage], ["Body", vehicle.body], ["Exterior", vehicle.exterior], ["Interior", vehicle.interior]].filter(([, value]) => value).map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
    $("#campaign-proof-photos").innerHTML = vehicle.images.map((src, index) => {
      const source = assetPath(src);
      return `<img src="${source}" srcset="${responsiveSrcset(source)}" sizes="(max-width: 760px) calc(100vw - 28px), 50vw" alt="${vehicle.title}, listing photo ${index + 1} of ${vehicle.images.length}" width="1200" height="800" loading="lazy" decoding="async">`;
    }).join("");
    $("[data-campaign-gallery]").textContent = `See All ${vehicle.images.length} Photos`;
    $(".garage-hero .eyebrow").textContent = "THE EXACT VEHICLE FROM YOUR AD";
    $("#hero-headline").textContent = vehicle.title;
    $("#hero-lede").textContent = "Interested in this car? Request details with your name, phone, and email — or call our sales team.";
    $("#inventory-heading-title").textContent = "Three more classics, if you want to compare.";
    $("#inventory-heading-copy").textContent = "Your request remains tied to the vehicle above. These are separate listings with their own prices and stock numbers.";
    $("#final-cta-heading").textContent = `Ask about the ${vehicle.year} ${vehicle.title.replace(/^\d{4}\s+/, "")}`;
    $("#final-cta-copy").textContent = `Your request will stay tied to stock ${vehicle.stock || vehicle.id} and the published ${money.format(vehicle.price)} asking price.`;
    $("#final-cta-link").href = "#availability";
    $("#final-cta-link").textContent = "Request details";

    const proofSection = $("#campaign-proof");
    const leadSection = $("#availability");
    if (proofSection && leadSection) {
      proofSection.after(leadSection);
      leadSection.classList.add("vehicle-request-priority");
    }
  }

  function applyHomepageFeaturedVehicle() {
    $("#inventory-total").textContent = String(inventory.length);
    if (!featuredVehicle) return;
    setResponsiveImage($("#hero-vehicle-image"), featuredVehicle.images[0]);
    $("#hero-vehicle-image").alt = `${featuredVehicle.title} shown completely from a front three-quarter angle`;
    $("#hero-vehicle-title").textContent = featuredVehicle.title;
    $("#hero-vehicle-meta").textContent = `${money.format(featuredVehicle.price)}${featuredVehicle.stock ? ` · STOCK ${featuredVehicle.stock}` : ""}`;
    $("#hero-vehicle-button").dataset.vehicle = featuredVehicle.id;
    $("#hero-vehicle-button").childNodes[0].textContent = `See all ${featuredVehicle.images.length} photos `;
  }

  function applyCampaignVehicle() {
    if (!campaignVehicle) return;
    if (!pathVehicleMatch) setVehicleUrl(campaignVehicle);
    setResponsiveImage($("#hero-vehicle-image"), campaignVehicle.images[0]);
    $("#hero-vehicle-image").alt = `${campaignVehicle.title} shown as the exact current listing`;
    $("#hero-vehicle-kicker").textContent = "THE VEHICLE YOU CAME TO SEE";
    $("#hero-vehicle-title").textContent = campaignVehicle.title;
    $("#hero-vehicle-meta").textContent = `${money.format(campaignVehicle.price)}${campaignVehicle.stock ? ` · STOCK ${campaignVehicle.stock}` : ""}`;
    $("#hero-vehicle-button").childNodes[0].textContent = `See all ${campaignVehicle.images.length} photos `;
    $("#hero-primary-cta").textContent = "Request details";
    $$("[data-vehicle]", $(".garage-hero")).forEach((button) => button.dataset.vehicle = campaignVehicle.id);
    $("#vehicle-select").value = campaignVehicle.id;
    $("#lead-title").textContent = `Ask about ${campaignVehicle.title}`;
    $("#lead-context").textContent = `${money.format(campaignVehicle.price)} asking price${campaignVehicle.stock ? ` · Stock ${campaignVehicle.stock}` : ""}. Leave your name, phone number, and email below. All three are required so our sales team can follow up about this car.`;
    renderCampaignProof(campaignVehicle);
    updateVehicleMetadata(campaignVehicle);
    trackVehicleView(campaignVehicle);
  }

  function populateSelect() {
    const select = $("#vehicle-select");
    inventory.forEach((vehicle) => {
      const option = document.createElement("option");
      option.value = vehicle.id;
      option.textContent = `${vehicle.title} — ${money.format(vehicle.price)}`;
      select.appendChild(option);
    });
  }

  function cardTemplate(vehicle, collapsed = false) {
    return `
      <article class="vehicle-card reveal-card ${campaignVehicle && campaignVehicle.id === vehicle.id ? "campaign-match" : ""}"${collapsed ? " hidden" : ""}>
        <a href="${vehicleHref(vehicle)}" data-vehicle="${vehicle.id}">
          <div class="vehicle-photo">
            <img src="${assetPath(vehicle.images[0])}" srcset="${responsiveSrcset(vehicle.images[0])}" sizes="(max-width: 760px) calc(100vw - 30px), (max-width: 1180px) 50vw, 33vw" alt="${vehicle.title}" loading="lazy" decoding="async" width="1200" height="800">
            <span class="vehicle-year">${vehicle.year}</span>
            <span class="vehicle-status">${campaignVehicle && campaignVehicle.id === vehicle.id ? "FROM YOUR AD" : "CURRENT LISTING"}</span>
          </div>
          <div class="vehicle-body">
            <h3>${vehicle.title}</h3>
            <p class="vehicle-price">${money.format(vehicle.price)}</p>
            <div class="vehicle-meta">
              <span><strong>${vehicle.engine}</strong>Engine</span>
              <span><strong>${vehicle.transmission}</strong>Transmission</span>
              <span><strong>${vehicle.stock || "—"}</strong>Stock number</span>
              <span><strong>${vehicle.mileage || "—"}</strong>Mileage</span>
            </div>
            <span class="vehicle-cta">Open vehicle page · ${vehicle.images.length} photos <i data-lucide="arrow-up-right" aria-hidden="true"></i></span>
          </div>
        </a>
      </article>`;
  }

  function filteredInventory() {
    const era = $("#filter-era").value;
    const transmission = $("#filter-transmission").value;
    const budget = $("#filter-budget").value;
    const rows = inventory.filter((vehicle) => {
      const eraMatch = era === "all" || Math.floor(vehicle.year / 10) % 10 === Number(era[0]);
      const trans = vehicle.transmission.toLowerCase();
      const transMatch = transmission === "all" || trans.includes(transmission);
      const priceMatch = budget === "all" ||
        (budget === "under25" && vehicle.price < 25000) ||
        (budget === "25to35" && vehicle.price >= 25000 && vehicle.price <= 35000) ||
        (budget === "over35" && vehicle.price > 35000);
      return eraMatch && transMatch && priceMatch;
    });
    return campaignVehicle ? rows.filter((vehicle) => vehicle.id !== campaignVehicle.id) : rows;
  }

  function renderInventory() {
    const rows = filteredInventory();
    const hasFilters = [$("#filter-era").value, $("#filter-transmission").value, $("#filter-budget").value].some((value) => value !== "all");
    const compactMode = matchMedia("(max-width: 760px)").matches;
    const initialLimit = campaignVehicle ? 3 : (compactMode ? 6 : Infinity);
    const visibleRows = !inventoryExpanded && !hasFilters ? rows.slice(0, initialLimit) : rows;
    $("#inventory-grid").innerHTML = rows.length
      ? rows.map((vehicle, index) => cardTemplate(vehicle, index >= visibleRows.length)).join("")
      : `<div class="empty-state"><h3>No exact match</h3><p>Reset the filters to see every current listing.</p></div>`;
    $("#inventory-count").textContent = visibleRows.length < rows.length
      ? `Showing ${visibleRows.length} of ${rows.length}`
      : `${rows.length} vehicle${rows.length === 1 ? "" : "s"}`;
    const moreButton = $("#inventory-more");
    moreButton.hidden = campaignVehicle ? false : visibleRows.length >= rows.length;
    moreButton.textContent = campaignVehicle ? `View all ${inventory.length} B & B cars` : `Show all ${rows.length} cars`;
    if (window.lucide) window.lucide.createIcons();
  }

  function openVehiclePage(id) {
    const vehicle = inventory.find((row) => row.id === id);
    if (!vehicle) return;
    if (pathVehicleMatch && campaignVehicle && campaignVehicle.id === vehicle.id) {
      const photos = $("#campaign-proof-photos");
      photos.classList.add("is-expanded");
      photos.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    location.assign(vehicleHref(vehicle));
  }

  function openLead(id = activeVehicle && activeVehicle.id, requestType = "Availability and details") {
    const vehicle = inventory.find((row) => row.id === id) || campaignVehicle || featuredVehicle;
    if (!vehicle) {
      $("#inventory").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    activeVehicle = vehicle;
    $("#vehicle-select").value = vehicle.id;
    $("#request-type").value = requestType;
    $("#lead-title").textContent = `Ask about ${vehicle.title}`;
    $("#lead-context").textContent = `${money.format(vehicle.price)} asking price${vehicle.stock ? ` · Stock ${vehicle.stock}` : ""}. Leave your name, phone number, and email below. All three are required so our sales team can follow up about this car.`;
    trackMetaEvent("LeadFormOpen", { content_name: vehicle.title, content_ids: [vehicle.id], vehicle_stock: vehicle.stock || "", request_type: requestType }, { custom: true });
    $("#lead-form-card").scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => $("#lead-form input[name='firstName']").focus(), 450);
  }

  function newLeadId() {
    return window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `lead-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function postLeadToRouter(payload) {
    const requestPayload = { ...payload, leadSource: "LANDING", leadId: payload.leadId || newLeadId(), receivedAt: new Date().toISOString() };
    const response = await fetch(config.leadEndpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify(requestPayload), redirect: "follow" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok !== true) {
      throw new Error(body.message || "We could not confirm delivery of your request.");
    }
    return body;
  }

  async function submitLead(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (form.dataset.submitting === "true") return;
    const status = $(".form-status", form);
    status.className = "form-status";
    if (!validateFields(form)) return;
    const data = new FormData(form);
    const vehicle = inventory.find((row) => row.id === data.get("vehicleSlug"));
    const requestType = String(data.get("requestType") || "Availability and details");
    const delivery = data.get("deliveryNeeded") ? "Delivery may be needed" : "No delivery request selected";
    const payload = {
      leadId: newLeadId(),
      type: "vehicle-inquiry",
      dealerId: config.dealerId,
      dealerName: config.brand,
      landingId: config.landingId,
      firstName: String(data.get("firstName") || "").trim(),
      lastName: String(data.get("lastName") || "").trim(),
      email: String(data.get("email") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      vehicleSlug: String(data.get("vehicleSlug") || ""),
      vehicle: vehicle ? vehicle.title : "",
      vehicleStock: vehicle ? vehicle.stock : "",
      vehiclePrice: vehicle ? vehicle.price : null,
      requestType,
      message: `${requestType} for the exact ${vehicle ? vehicle.title : "vehicle selected in the form"}. Purchase preference: ${data.get("purchaseMethod")}. ${delivery}.`,
      smsCustomerCareConsent: Boolean(data.get("smsCustomerCareConsent")),
      smsMarketingConsent: false,
      pageUrl: location.href,
      attribution: captureAttribution()
    };
    const submissionKey = JSON.stringify([payload.phone, payload.email, payload.vehicleSlug, payload.requestType]);
    if (submissionKey === lastSubmissionKey && Date.now() - lastSubmissionAt < 5000) {
      status.classList.add("error");
      status.textContent = "Your request is already being processed. Please wait a moment.";
      return;
    }
    lastSubmissionKey = submissionKey;
    lastSubmissionAt = Date.now();
    const submitButton = form.querySelector('button[type="submit"]');
    form.dataset.submitting = "true";
    submitButton.disabled = true;
    status.textContent = "Sending your request…";
    const localPreview = isPreview();
    if (localPreview) {
      localStorage.setItem("bb_demo_lead", JSON.stringify({ ...payload, savedAt: new Date().toISOString() }));
      status.classList.add("success");
      status.textContent = "Preview mode: validation passed. No request was sent; please call B&B to contact the team.";
      delete form.dataset.submitting;
      submitButton.disabled = false;
      return;
    }
    if (!config.leadEndpoint) {
      status.classList.add("error");
      status.textContent = `Online delivery is not connected yet. Please call ${callLines}.`;
      delete form.dataset.submitting;
      submitButton.disabled = false;
      return;
    }
    try {
      await postLeadToRouter(payload);
      form.reset();
      showRequestSuccess(status);
      trackMetaEvent("Lead", {
        content_name: vehicle ? vehicle.title : "Inventory inquiry",
        content_ids: vehicle ? [vehicle.id] : [],
        content_type: "vehicle",
        vehicle_stock: vehicle ? vehicle.stock || "" : "",
        value: vehicle ? vehicle.price : 0,
        currency: "USD",
        lead_source: "website"
      }, { eventId: payload.leadId });
    } catch (error) {
      lastSubmissionKey = "";
      lastSubmissionAt = 0;
      status.classList.add("error");
      status.textContent = `We could not send your request. Please try again or call ${callLines}.`;
    } finally {
      delete form.dataset.submitting;
      submitButton.disabled = false;
    }
  }

  function init() {
    captureAttribution();
    setupSectionLinks();
    loadMetaPixel();
    populateSelect();
    setupFlexiblePhoneInputs();
    setupEnglishValidation();
    applyHomepageFeaturedVehicle();
    applyCampaignVehicle();
    setupCampaignLanding();
    setupVehicleQuickRequest();
    setupPhoneTracking();
    renderInventory();
    $$('[data-vehicle]', $(".garage-hero")).forEach((button) => button.addEventListener("click", () => openVehiclePage(button.dataset.vehicle)));
    [$("#filter-era"), $("#filter-transmission"), $("#filter-budget")].forEach((select) => select.addEventListener("change", renderInventory));
    $("#filter-reset").addEventListener("click", () => { $("#filter-era").value = "all"; $("#filter-transmission").value = "all"; $("#filter-budget").value = "all"; inventoryExpanded = false; renderInventory(); });
    $("#inventory-more").addEventListener("click", () => {
      if (campaignVehicle) {
        const url = new URL("/", location.origin);
        new URLSearchParams(location.search).forEach((value, key) => url.searchParams.append(key, value));
        url.hash = "inventory";
        location.assign(url.href);
        return;
      }
      inventoryExpanded = true;
      renderInventory();
    });
    $("#lead-form").addEventListener("submit", submitLead);
    $$('[data-chat-open]').forEach((button) => button.addEventListener("click", openChat));
    $$('[data-hero-request]').forEach((button) => button.addEventListener("click", () => openLead((campaignVehicle || featuredVehicle).id, button.dataset.heroRequest)));
    $$('[data-campaign-request]').forEach((button) => button.addEventListener("click", () => openLead(campaignVehicle && campaignVehicle.id, button.dataset.campaignRequest)));
    const campaignGallery = $('[data-campaign-gallery]');
    if (campaignGallery && campaignVehicle) campaignGallery.addEventListener("click", () => {
      const photos = $("#campaign-proof-photos");
      photos.classList.add("is-expanded");
      campaignGallery.textContent = `All ${campaignVehicle.images.length} photos shown`;
      photos.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    addEventListener("resize", () => {
      const compactMode = matchMedia("(max-width: 760px)").matches;
      if (compactMode !== lastCompactMode && !inventoryExpanded) {
        lastCompactMode = compactMode;
        renderInventory();
      }
    }, { passive: true });
    if (window.lucide) window.lucide.createIcons();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
