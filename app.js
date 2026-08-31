(function () {
  "use strict";

  const inventory = Array.isArray(window.INVENTORY) ? window.INVENTORY : [];
  const config = window.SITE_CONFIG || {};
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
  const pathVehicleMatch = location.pathname.match(/\/cars\/([^/]+)\/?$/i);
  const requestedVehicleId = (pathVehicleMatch && decodeURIComponent(pathVehicleMatch[1])) || new URLSearchParams(location.search).get("vehicle");
  const campaignVehicle = inventory.find((vehicle) => vehicle.id === requestedVehicleId) || null;
  const featuredVehicle = inventory.find((vehicle) => vehicle.id === config.featuredVehicleId) || inventory[0] || null;

  function isPreview() {
    return Boolean(config.demoMode) || location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(location.hostname);
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
    if (isPreview() || !config.metaPixelId || window.fbq) return;
    (function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = true; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", config.metaPixelId);
    window.fbq("track", "PageView");
  }

  function loadLiveChat() {
    if (isPreview() || !config.liveChatLicense) return;
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
    if (window.LiveChatWidget && typeof window.LiveChatWidget.call === "function") {
      window.LiveChatWidget.call("maximize");
      if (window.fbq) window.fbq("trackCustom", "LiveChatOpen");
      return;
    }
    openLead();
  }

  function updateVehicleMetadata(vehicle) {
    const title = `${vehicle.title} for Sale — ${money.format(vehicle.price)} | B & B Auto Exchange`;
    const description = `${vehicle.title}, stock ${vehicle.stock || "available listing"}, offered at ${money.format(vehicle.price)} by B & B Auto Exchange. View ten real photos and ask about this exact vehicle.`;
    document.title = title;
    const descriptionMeta = document.querySelector('meta[name="description"]');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    const ogImage = document.querySelector('meta[property="og:image"]');
    const vehicleMeta = document.querySelector('meta[name="vehicle-id"]');
    if (descriptionMeta) descriptionMeta.content = description;
    if (ogTitle) ogTitle.content = title;
    if (ogDescription) ogDescription.content = description;
    if (ogImage) ogImage.content = new URL(vehicle.images[0], document.baseURI).href;
    if (vehicleMeta) vehicleMeta.content = vehicle.id;
  }

  function trackVehicleView(vehicle) {
    if (!window.fbq || lastTrackedVehicleId === vehicle.id) return;
    lastTrackedVehicleId = vehicle.id;
    window.fbq("track", "ViewContent", { content_name: vehicle.title, content_ids: [vehicle.id], content_type: "vehicle", vehicle_stock: vehicle.stock || "", value: vehicle.price, currency: "USD" });
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
    const url = new URL(`cars/${encodeURIComponent(vehicle.id)}/`, document.baseURI);
    current.searchParams.forEach((value, key) => { if (key !== "vehicle") url.searchParams.append(key, value); });
    history.replaceState({ vehicle: vehicle.id }, "", url);
  }

  function vehicleHref(vehicle) {
    const current = new URL(location.href);
    const url = new URL(`cars/${encodeURIComponent(vehicle.id)}/`, document.baseURI);
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
    $("#campaign-proof-photos").innerHTML = vehicle.images.map((src, index) => `<img src="${src}" alt="${vehicle.title}, listing photo ${index + 1} of ${vehicle.images.length}" width="1200" height="800"${index ? ' loading="lazy"' : ""}>`).join("");
    $("#hero-headline").textContent = `${vehicle.title}. The exact classic from your ad.`;
    $("#hero-lede").textContent = `${money.format(vehicle.price)} asking price${vehicle.stock ? `, stock ${vehicle.stock}` : ""}. Review real photos and listing details, then ask about this exact car.`;
    $("#inventory-heading-title").textContent = "Other current classics from B & B";
    $("#inventory-heading-copy").textContent = "The vehicle above is shown only once. These are different current listings, each with its own stock number and asking price.";
    $("#final-cta-heading").textContent = `Ask about the ${vehicle.year} ${vehicle.title.replace(/^\d{4}\s+/, "")}`;
    $("#final-cta-copy").textContent = `Your request will stay tied to stock ${vehicle.stock || vehicle.id} and the published ${money.format(vehicle.price)} asking price.`;
    $("#final-cta-link").href = "#availability";
    $("#final-cta-link").textContent = "Check this car";

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
    $("#hero-vehicle-image").src = featuredVehicle.images[0];
    $("#hero-vehicle-image").alt = `${featuredVehicle.title} shown completely from a front three-quarter angle`;
    $("#hero-vehicle-title").textContent = featuredVehicle.title;
    $("#hero-vehicle-meta").textContent = `${money.format(featuredVehicle.price)}${featuredVehicle.stock ? ` · STOCK ${featuredVehicle.stock}` : ""}`;
    $("#hero-vehicle-button").dataset.vehicle = featuredVehicle.id;
  }

  function applyCampaignVehicle() {
    if (!campaignVehicle) return;
    if (!pathVehicleMatch) setVehicleUrl(campaignVehicle);
    $("#hero-vehicle-image").src = campaignVehicle.images[0];
    $("#hero-vehicle-image").alt = `${campaignVehicle.title} shown as the exact current listing`;
    $("#hero-vehicle-kicker").textContent = "THE VEHICLE YOU CAME TO SEE";
    $("#hero-vehicle-title").textContent = campaignVehicle.title;
    $("#hero-vehicle-meta").textContent = `${money.format(campaignVehicle.price)}${campaignVehicle.stock ? ` · STOCK ${campaignVehicle.stock}` : ""}`;
    $("#hero-primary-cta").textContent = "Check Availability";
    $$("[data-vehicle]", $(".garage-hero")).forEach((button) => button.dataset.vehicle = campaignVehicle.id);
    $("#vehicle-select").value = campaignVehicle.id;
    $("#lead-title").textContent = `Ask about ${campaignVehicle.title}`;
    $("#lead-context").textContent = `${money.format(campaignVehicle.price)} asking price${campaignVehicle.stock ? ` · Stock ${campaignVehicle.stock}` : ""}. Your request will stay tied to this exact vehicle.`;
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
        <a href="${vehicleHref(vehicle)}" data-vehicle="${vehicle.id}" aria-label="View ${vehicle.title}">
          <div class="vehicle-photo">
            <img src="${vehicle.images[0]}" alt="${vehicle.title}" loading="lazy" width="1200" height="800">
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
    const initialLimit = campaignVehicle ? (compactMode ? 3 : 6) : (compactMode ? 6 : Infinity);
    const visibleRows = !inventoryExpanded && !hasFilters ? rows.slice(0, initialLimit) : rows;
    $("#inventory-grid").innerHTML = rows.length
      ? rows.map((vehicle, index) => cardTemplate(vehicle, index >= visibleRows.length)).join("")
      : `<div class="empty-state"><h3>No exact match</h3><p>Reset the filters to see every current listing.</p></div>`;
    $("#inventory-count").textContent = visibleRows.length < rows.length
      ? `Showing ${visibleRows.length} of ${rows.length}`
      : `${rows.length} vehicle${rows.length === 1 ? "" : "s"}`;
    const moreButton = $("#inventory-more");
    moreButton.hidden = visibleRows.length >= rows.length;
    moreButton.textContent = campaignVehicle ? `Show all ${rows.length} other cars` : `Show all ${rows.length} cars`;
    if (window.lucide) window.lucide.createIcons();
  }

  function openVehiclePage(id) {
    const vehicle = inventory.find((row) => row.id === id);
    if (!vehicle) return;
    if (pathVehicleMatch && campaignVehicle && campaignVehicle.id === vehicle.id) {
      $("#campaign-proof").scrollIntoView({ behavior: "smooth", block: "start" });
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
    $("#lead-context").textContent = `${money.format(vehicle.price)} asking price${vehicle.stock ? ` · Stock ${vehicle.stock}` : ""}. Your request will stay tied to this exact vehicle.`;
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
    if (!response.ok || body.ok === false) {
      throw new Error(body.message || "We could not confirm delivery of your request.");
    }
    return body;
  }

  async function submitLead(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = $(".form-status", form);
    status.className = "form-status";
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const vehicle = inventory.find((row) => row.id === data.get("vehicleSlug"));
    const requestType = String(data.get("requestType") || "Availability and details");
    const delivery = data.get("deliveryNeeded") ? "Delivery may be needed" : "No delivery request selected";
    const payload = {
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
    submitButton.disabled = true;
    status.textContent = "Sending your request…";
    const localPreview = isPreview();
    if (localPreview) {
      localStorage.setItem("bb_demo_lead", JSON.stringify({ ...payload, savedAt: new Date().toISOString() }));
      status.classList.add("success");
      status.textContent = "Preview mode: validation passed. No request was sent; please call B&B to contact the team.";
      submitButton.disabled = false;
      return;
    }
    if (!config.leadEndpoint) {
      status.classList.add("error");
      status.textContent = `Online delivery is not connected yet. Please call ${callLines}.`;
      submitButton.disabled = false;
      return;
    }
    try {
      const body = await postLeadToRouter(payload);
      status.classList.add("success");
      status.textContent = body.message || "Request received. The B&B team will use your details to follow up.";
      form.reset();
      if (window.fbq) window.fbq("track", "Lead", { content_name: vehicle ? vehicle.title : "Inventory inquiry", value: vehicle ? vehicle.price : 0, currency: "USD" });
    } catch (error) {
      status.classList.add("error");
      status.textContent = `${error.message} Please call ${callLines}.`;
    } finally {
      submitButton.disabled = false;
    }
  }

  function setupMotion() {
    if (!window.gsap || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    window.gsap.registerPlugin(window.ScrollTrigger);
    window.gsap.utils.toArray(".reveal").forEach((element) => {
      window.gsap.from(element, { y: 28, opacity: 0, duration: .7, ease: "power2.out", scrollTrigger: { trigger: element, start: "top 88%", once: true } });
    });
  }

  function init() {
    captureAttribution();
    setupSectionLinks();
    loadMetaPixel();
    loadLiveChat();
    populateSelect();
    applyHomepageFeaturedVehicle();
    applyCampaignVehicle();
    renderInventory();
    $$('[data-vehicle]', $(".garage-hero")).forEach((button) => button.addEventListener("click", () => openVehiclePage(button.dataset.vehicle)));
    [$("#filter-era"), $("#filter-transmission"), $("#filter-budget")].forEach((select) => select.addEventListener("change", renderInventory));
    $("#filter-reset").addEventListener("click", () => { $("#filter-era").value = "all"; $("#filter-transmission").value = "all"; $("#filter-budget").value = "all"; inventoryExpanded = false; renderInventory(); });
    $("#inventory-more").addEventListener("click", () => { inventoryExpanded = true; renderInventory(); });
    $("#lead-form").addEventListener("submit", submitLead);
    $$('[data-chat-open]').forEach((button) => button.addEventListener("click", openChat));
    $$('[data-hero-request]').forEach((button) => button.addEventListener("click", () => openLead((campaignVehicle || featuredVehicle).id, button.dataset.heroRequest)));
    $$('[data-campaign-request]').forEach((button) => button.addEventListener("click", () => openLead(campaignVehicle && campaignVehicle.id, button.dataset.campaignRequest)));
    const campaignGallery = $('[data-campaign-gallery]');
    if (campaignGallery && campaignVehicle) campaignGallery.addEventListener("click", () => {
      const photos = $("#campaign-proof-photos");
      photos.classList.add("is-expanded");
      campaignGallery.textContent = "All 10 photos shown";
      photos.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    if (window.IMask) $$("input[type='tel']").forEach((input) => window.IMask(input, { mask: "(000) 000-0000" }));
    addEventListener("resize", () => {
      const compactMode = matchMedia("(max-width: 760px)").matches;
      if (compactMode !== lastCompactMode && !inventoryExpanded) {
        lastCompactMode = compactMode;
        renderInventory();
      }
    }, { passive: true });
    if (window.lucide) window.lucide.createIcons();
    setupMotion();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
