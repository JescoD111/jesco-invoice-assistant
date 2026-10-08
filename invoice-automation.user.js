// ==UserScript==
// @name         JESCO 电商发票助手
// @namespace    https://jesco.local/
// @version      0.5.15
// @homepageURL  https://jescod111.github.io/jesco-invoice-assistant/
// @updateURL    https://jescod111.github.io/jesco-invoice-assistant/invoice-automation.meta.js
// @downloadURL  https://jescod111.github.io/jesco-invoice-assistant/invoice-automation.user.js
// @supportURL   https://github.com/JescoD111/jesco-invoice-assistant/issues
// @description  FashionPO/PFS 订单提取、Fatture in Cloud 客户核验与发票填写（人工审核版）
// @match        http://*/*
// @match        https://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_info
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const STORAGE_KEY = 'jesco_fashionpo_invoice_batch_v1';
  const COUNTRY_MAPPING_KEY = 'jesco_country_mapping_v1';
  const PANEL_ENABLED_KEY = 'jesco_invoice_assistant_enabled_v1';
  const FINALIZATION_SESSION_KEY = 'jesco_invoice_finalization_session_v1';
  const PANEL_ID = 'jesco-invoice-assistant';
  const FASHIONPO_ORIGIN = 'https://www.fashionpo.com';
  const PFS_ORIGIN = 'https://wholesaler.parisfashionshops.com';
  const PFS_API_ORIGIN = 'https://wholesaler-api.parisfashionshops.com/api/v1/';
  const FIC_ORIGIN = 'https://secure.fattureincloud.it';
  const SUPPORTED_HOSTS = new Set([
    'www.fashionpo.com',
    'wholesaler.parisfashionshops.com',
    'secure.fattureincloud.it',
  ]);
  const SCRIPT_VERSION = typeof GM_info !== 'undefined' && GM_info.script?.version
    ? GM_info.script.version
    : 'dev';
  const DEFAULT_WAIT_TIMEOUT = 30000;
  const LONG_WAIT_TIMEOUT = 45000;
  const PAGE_WAIT_TIMEOUT = 60000;
  const WAIT_POLL_INTERVAL = 200;
  const FASHIONPO_SCAN_CONCURRENCY = 4;
  const SCAN_PROGRESS_UPDATE_INTERVAL = 400;
  // 按订单商品名的第一个词匹配；新增类别只需维护此表。
  // SHORT 的模板 Categoria 本身是 PANTALONE，选择后不得覆盖。
  const PRODUCT_TEMPLATES = Object.freeze([
    { code: '01A', name: 'ABITO', category: 'ABITO', aliases: ['ABITO', 'ABITI', 'VESTITO', 'VESTITI', 'DRESS', 'DRESSES'] },
    { code: '02C', name: 'CAMICIA', category: 'CAMICIA', aliases: ['CAMICIA', 'CAMICIE', 'BLUSA', 'BLUSE', 'TOP', 'TOPS', 'SHIRT', 'SHIRTS', 'BLOUSE', 'BLOUSES'] },
    { code: '03G', name: 'GIACCA', category: 'GIACCA', aliases: ['GIACCA', 'GIACCHE', 'BLAZER', 'BLAZERS', 'JACKET', 'JACKETS'] },
    { code: '04G', name: 'GONNA', category: 'GONNA', aliases: ['GONNA', 'GONNE', 'SKIRT', 'SKIRTS'] },
    { code: '05M', name: 'MAGLIA', category: 'MAGLIA', aliases: ['MAGLIA', 'MAGLIE', 'MAGLIETTA', 'MAGLIETTE', 'T-SHIRT', 'TSHIRT', 'CARDIGAN', 'PULLOVER', 'SWEATER', 'SWEATERS', 'FELPA', 'FELPE', 'SWEATSHIRT'] },
    { code: '06P', name: 'PANTALONE', category: 'PANTALONE', aliases: ['PANTALONE', 'PANTALONI', 'PANTALON', 'PANTALONS', 'PANTS', 'TROUSER', 'TROUSERS', 'JEANS', 'LEGGINGS'] },
    { code: '07S', name: 'SHORT', category: 'PANTALONE', aliases: ['SHORT', 'SHORTS', 'BERMUDA', 'BERMUDAS'] },
  ]);
  const INVOICE_ACTIVE_PHASES = new Set([
    'invoice_filling',
    'waiting_before_finalize',
    'finalizing',
    'opening_next_invoice',
  ]);
  const DEFAULT_STATE = Object.freeze({
    version: 2,
    phase: 'idle',
    orders: [],
    selectedOrderKeys: [],
    activeOrderKeys: [],
    customers: [],
    reviewOrderKey: null,
    quantityReviewQueue: [],
    customerIndex: 0,
    orderIndex: 0,
    message: '',
    error: null,
    diagnostics: [],
    lastInvoiceUrl: null,
    finalizingTaskKey: null,
    finalizingToken: null,
    pendingCountrySource: null,
    pendingCountryInitialOption: null,
    updatedAt: null,
  });

  const COUNTRY_TO_ITALIAN = Object.freeze({
    ALBANIA: 'Albania',
    ALGERIA: 'Algeria',
    ANDORRA: 'Andorra',
    ARGENTINA: 'Argentina',
    ARMENIA: 'Armenia',
    AUSTRALIA: 'Australia',
    ITALY: 'Italia',
    ITALIA: 'Italia',
    AZERBAIJAN: 'Azerbaigian',
    BANGLADESH: 'Bangladesh',
    BELARUS: 'Bielorussia',
    BOLIVIA: 'Bolivia',
    'BOSNIA AND HERZEGOVINA': 'Bosnia ed Erzegovina',
    'BOSNIA & HERZEGOVINA': 'Bosnia ed Erzegovina',
    BRAZIL: 'Brasile',
    BULGARIA: 'Bulgaria',
    CANADA: 'Canada',
    CHILE: 'Cile',
    CHINA: 'Cina',
    COLOMBIA: 'Colombia',
    'COSTA RICA': 'Costa Rica',
    CYPRUS: 'Cipro',
    'CZECH REPUBLIC': 'Repubblica Ceca',
    CZECHIA: 'Repubblica Ceca',
    'CZECH REP.': 'Repubblica Ceca',
    DENMARK: 'Danimarca',
    ECUADOR: 'Ecuador',
    EGYPT: 'Egitto',
    ESTONIA: 'Estonia',
    GERMANY: 'Germania',
    GERMANIA: 'Germania',
    FRANCE: 'Francia',
    FRANCIA: 'Francia',
    SPAIN: 'Spagna',
    SPAGNA: 'Spagna',
    PORTUGAL: 'Portogallo',
    PORTOGALLO: 'Portogallo',
    AUSTRIA: 'Austria',
    AUSTRI: 'Austria',
    BELGIUM: 'Belgio',
    BELGIO: 'Belgio',
    NETHERLANDS: 'Paesi Bassi',
    'THE NETHERLANDS': 'Paesi Bassi',
    'PAESI BASSI': 'Paesi Bassi',
    GREECE: 'Grecia',
    GRECIA: 'Grecia',
    POLAND: 'Polonia',
    POLONIA: 'Polonia',
    SLOVENIA: 'Slovenia',
    CROATIA: 'Croazia',
    CROAZIA: 'Croazia',
    FINLAND: 'Finlandia',
    FINLANDIA: 'Finlandia',
    SWEDEN: 'Svezia',
    SVEZIA: 'Svezia',
    GEORGIA: 'Georgia',
    'HONG KONG': 'Hong Kong',
    HUNGARY: 'Ungheria',
    ICELAND: 'Islanda',
    INDIA: 'India',
    INDONESIA: 'Indonesia',
    IRELAND: 'Irlanda',
    'REPUBLIC OF IRELAND': 'Irlanda',
    IRAN: 'Iran',
    IRAQ: 'Iraq',
    ISRAEL: 'Israele',
    JAPAN: 'Giappone',
    JORDAN: 'Giordania',
    KAZAKHSTAN: 'Kazakistan',
    KOSOVO: 'Kosovo',
    LATVIA: 'Lettonia',
    LEBANON: 'Libano',
    LIECHTENSTEIN: 'Liechtenstein',
    LITHUANIA: 'Lituania',
    LUXEMBOURG: 'Lussemburgo',
    MALAYSIA: 'Malaysia',
    MALTA: 'Malta',
    MEXICO: 'Messico',
    MOLDOVA: 'Moldavia',
    'REPUBLIC OF MOLDOVA': 'Moldavia',
    MONACO: 'Monaco',
    MONTENEGRO: 'Montenegro',
    MOROCCO: 'Marocco',
    'NEW ZEALAND': 'Nuova Zelanda',
    'NORTH MACEDONIA': 'Macedonia del Nord',
    NIGERIA: 'Nigeria',
    NORWAY: 'Norvegia',
    OMAN: 'Oman',
    PAKISTAN: 'Pakistan',
    PANAMA: 'Panama',
    PARAGUAY: 'Paraguay',
    PERU: 'Perù',
    PHILIPPINES: 'Filippine',
    QATAR: 'Qatar',
    ROMANIA: 'Romania',
    RUSSIA: 'Russia',
    'RUSSIAN FEDERATION': 'Russia',
    'SAN MARINO': 'San Marino',
    'SAUDI ARABIA': 'Arabia Saudita',
    SENEGAL: 'Senegal',
    SERBIA: 'Serbia',
    SINGAPORE: 'Singapore',
    SLOVAKIA: 'Slovacchia',
    'SOUTH AFRICA': 'Sudafrica',
    'SOUTH KOREA': 'Corea del Sud',
    'KOREA, SOUTH': 'Corea del Sud',
    'REPUBLIC OF KOREA': 'Corea del Sud',
    'KOREA, REPUBLIC OF': 'Corea del Sud',
    SWITZERLAND: 'Svizzera',
    TAIWAN: 'Taiwan',
    THAILAND: 'Thailandia',
    TUNISIA: 'Tunisia',
    TURKEY: 'Turchia',
    TURKIYE: 'Turchia',
    'TÜRKIYE': 'Turchia',
    UKRAINE: 'Ucraina',
    'UNITED ARAB EMIRATES': 'Emirati Arabi Uniti',
    UAE: 'Emirati Arabi Uniti',
    'UNITED KINGDOM': 'Regno Unito',
    'UNITED KINGDOM OF GREAT BRITAIN AND NORTHERN IRELAND': 'Regno Unito',
    'GREAT BRITAIN': 'Regno Unito',
    ENGLAND: 'Regno Unito',
    UK: 'Regno Unito',
    'UNITED STATES': "Stati Uniti d'America",
    'UNITED STATES OF AMERICA': "Stati Uniti d'America",
    USA: "Stati Uniti d'America",
    US: "Stati Uniti d'America",
    URUGUAY: 'Uruguay',
    VENEZUELA: 'Venezuela',
    'VATICAN CITY': 'Città del Vaticano',
    VIETNAM: 'Vietnam',
  });

  let running = false;
  let panelRefs = null;
  let reviewExpanded = false;
  let reviewSearch = '';
  let reviewUiOrderNumber = null;
  let clearConfirmationVisible = false;
  let endConfirmationVisible = false;
  let resumeTimer = null;
  let valueListenersInstalled = false;
  let menuCommandRegistered = false;

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function compactVat(value) {
    return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function vatParts(value) {
    const full = compactVat(value);
    const match = full.match(/^([A-Z]{2})(.+)$/);
    return {
      full,
      prefix: match?.[1] || '',
      local: match?.[2] || full,
    };
  }

  function vatSearchValue(value) {
    return vatParts(value).local;
  }

  function normalizedCountry(value) {
    return clean(value).toUpperCase();
  }

  function loadLearnedCountryMappings() {
    const saved = GM_getValue(COUNTRY_MAPPING_KEY, {});
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  }

  function countryOptionFor(value) {
    const source = normalizedCountry(value);
    const learned = loadLearnedCountryMappings()[source];
    if (learned) return learned;
    if (COUNTRY_TO_ITALIAN[source]) return COUNTRY_TO_ITALIAN[source];
    return Object.values(COUNTRY_TO_ITALIAN)
      .find((italianName) => normalizedCountry(italianName) === source) || '';
  }

  function rememberCountryMapping(sourceValue, invoiceOption) {
    const source = normalizedCountry(sourceValue);
    const target = clean(invoiceOption);
    if (!source || !target) throw new Error('国家映射的来源或目标为空');
    GM_setValue(COUNTRY_MAPPING_KEY, {
      ...loadLearnedCountryMappings(),
      [source]: target,
    });
  }

  function invoiceProductName(value) {
    return clean(value).split(/\s+/)[0] || '';
  }

  function productTemplateFor(item) {
    const category = invoiceProductName(item.name).toUpperCase();
    const template = PRODUCT_TEMPLATES.find((entry) => entry.aliases.includes(category));
    if (!template) {
      throw new Error(`商品类别 ${category || '[空]'} 未配置 Codice 映射（货号 ${item.code}），请补充映射后重试`);
    }
    return template;
  }

  function invoiceComposition(item) {
    if (Array.isArray(item.composition) && item.composition.length) {
      return item.composition.map(({ material, percentage }) => {
        const value = Number(String(percentage ?? '').replace(',', '.'));
        if (!clean(material) || percentage === null || percentage === undefined
          || String(percentage).trim() === '' || !Number.isFinite(value) || value <= 0 || value > 100) {
          throw new Error(`货号 ${item.code} 的成分资料不完整`);
        }
        return `${clean(material)}${value}%`;
      }).join(' ');
    }
    // 兼容此前已扫描进任务池、只保存了格式化描述的商品。
    const composition = String(item.description || '').split(/\r?\n/)
      .filter((line) => !/^\s*made\s+in\b/i.test(line)).map(clean).filter(Boolean).join(' ');
    if (!composition || !composition.includes('%')) throw new Error(`货号 ${item.code} 缺少成分`);
    return composition;
  }

  function fillTemplateDescription(templateText, item) {
    const lines = String(templateText || '').split(/\r?\n/);
    if (lines.length < 3 || !clean(lines[0]) || !clean(lines[1]) || !/^\s*made\s+in\s+\S/i.test(lines[2])) {
      throw new Error('商品模板描述应包含三行：类别、货号标题、Made in 产地');
    }
    if (!clean(item.code)) throw new Error('商品缺少货号');
    lines[0] = `${lines[0].trimEnd()}  ${invoiceComposition(item)}`;
    lines[1] = `${lines[1].trimEnd()}  ${clean(item.code)}`;
    return lines.join('\n');
  }

  function productOptionMatchesCode(option, code) {
    // 代码可能是独立子节点，不能依赖网站动态生成的 class 或选项顺序。
    return [option, ...option.querySelectorAll('*')].some((node) => (
      clean(node.textContent).toUpperCase().split(/[\s|:·—–-]+/).includes(code)
    ));
  }

  function normalizePfsAddress(value) {
    const address = value && typeof value === 'object' ? value : {};
    return {
      address: clean(address.street) || clean(address.address),
      postalCode: clean(address.postal_code) || clean(address.postalCode) || clean(address.zip_code),
      city: clean(address.city),
      country: typeof address.country === 'string'
        ? clean(address.country)
        : pfsItalianText(address.country),
    };
  }

  function normalizePostalAddress(value) {
    const address = value && typeof value === 'object' ? value : {};
    return [address.address, address.postalCode, address.city, address.country]
      .map((part) => clean(part).normalize('NFKC').toUpperCase())
      .join('|');
  }

  function completePostalAddress(value) {
    return Boolean(value?.address && value?.postalCode && value?.city && value?.country);
  }

  function samePostalAddress(left, right) {
    return completePostalAddress(left)
      && completePostalAddress(right)
      && normalizePostalAddress(left) === normalizePostalAddress(right);
  }

  function shippingAddressValue(customer) {
    if (customer?.source !== 'pfs' && !customer?.deliveryAddressCaptured) return 'IDEM';
    if (!customer.deliveryAddress) {
      throw new Error('PFS客户缺少邮寄地址，请重新扫描该订单');
    }
    if (!completePostalAddress(customer.deliveryAddress)) {
      throw new Error('PFS客户邮寄地址不完整');
    }
    const billingAddress = {
      address: customer.address,
      postalCode: customer.postalCode,
      city: customer.city,
      country: customer.country,
    };
    if (samePostalAddress(billingAddress, customer.deliveryAddress)) return 'IDEM';
    return [
      customer.deliveryAddress.address,
      `${customer.deliveryAddress.postalCode} ${customer.deliveryAddress.city}`,
      customer.deliveryAddress.country,
    ].join('\n');
  }

  function invoiceInternalReference(order) {
    return order?.source === 'pfs' ? 'PFS' : `PO#${order?.orderNumber || ''}`;
  }

  function sameVat(source, candidate) {
    const sourceVat = vatParts(source);
    const candidateVat = vatParts(candidate);
    if (!sourceVat.full || !candidateVat.full) return false;
    if (sourceVat.full === candidateVat.full) return true;
    if (sourceVat.local === candidateVat.full || sourceVat.full === candidateVat.local) return true;
    return sourceVat.local === candidateVat.local
      && Boolean(sourceVat.prefix)
      && sourceVat.prefix === candidateVat.prefix;
  }

  function sameVatLocalPart(source, candidate) {
    const sourceVat = compactVat(source);
    const candidateVat = compactVat(candidate);
    if (!sourceVat || !candidateVat) return false;
    const sourceWithoutPrefix = /^[A-Z]{2}/.test(sourceVat) ? sourceVat.slice(2) : sourceVat;
    const candidateWithoutPrefix = /^[A-Z]{2}/.test(candidateVat) ? candidateVat.slice(2) : candidateVat;
    return sourceVat === candidateVat
      || sourceWithoutPrefix === candidateVat
      || sourceVat === candidateWithoutPrefix
      || sourceWithoutPrefix === candidateWithoutPrefix;
  }

  function loadState() {
    const saved = GM_getValue(STORAGE_KEY, null);
    if (!saved) return { ...DEFAULT_STATE };
    if (saved.version === 2) {
      return {
        ...DEFAULT_STATE,
        ...saved,
        orders: (saved.orders || []).map((order) => normalizeOrderTask(order, saved.source)),
      };
    }
    if (saved.version === 1) {
      const orders = (saved.orders || []).map((order) => normalizeOrderTask(order, saved.source));
      return {
        ...DEFAULT_STATE,
        orders,
        selectedOrderKeys: orders.filter((order) => order.taskStatus === 'ready').map((order) => order.taskKey),
        diagnostics: saved.diagnostics || [],
        message: '',
      };
    }
    return { ...DEFAULT_STATE };
  }

  function saveState(patch) {
    const next = {
      ...loadState(),
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    GM_setValue(STORAGE_KEY, next);
    renderPanel(next);
    return next;
  }

  function fail(error, context = '') {
    const message = `${context ? `${context}：` : ''}${error?.message || error}`;
    console.error('[JESCO 发票助手]', error);
    saveState({ error: message, message });
  }

  function resetState() {
    clearFinalizationSessionToken();
    const next = { ...DEFAULT_STATE, updatedAt: new Date().toISOString() };
    GM_setValue(STORAGE_KEY, next);
    renderPanel(next);
  }

  function resetInterruptedScan() {
    const canReset = (state) => state.phase === 'scanning' && !state.activeOrderKeys?.length;
    if (!canReset(loadState())) {
      alert('当前没有卡住的扫描状态；未作任何修改。');
      return;
    }
    if (running) {
      alert('此页面仍在执行任务。请先关闭所有 FashionPO/PFS 标签页，重新打开订单页，再点“重置扫描状态”。');
      return;
    }
    if (!confirm('确认重置扫描状态？\n请先关闭其他 FashionPO/PFS 标签页，避免旧扫描仍在运行。\n订单池、已完成记录和国家映射都会保留；已保存的发票不受影响。')) return;
    // 确认框停留期间其他页面可能更新状态，写入前再次检查。
    if (!canReset(loadState())) {
      alert('状态已发生变化，未重置。');
      return;
    }
    saveState({ phase: 'idle', error: null, message: '扫描已重置，可以重新扫描' });
  }

  function orderSource(order, fallback = '') {
    if (order?.source) return order.source;
    if (fallback) return fallback;
    return String(order?.orderUrl || '').includes('parisfashionshops.com') ? 'pfs' : 'fashionpo';
  }

  function normalizeOrderTask(order, fallbackSource = '') {
    const source = orderSource(order, fallbackSource);
    const taskKey = order.taskKey || `${source}:${order.orderNumber}`;
    const reviewErrors = (order.reviewErrors || []).filter((error) => (
      !(source === 'pfs' && error === 'PFS订单缺少客户VAT号')
    ));
    let taskStatus = order.taskStatus;
    if (source === 'pfs'
      && taskStatus === 'blocked'
      && order.reviewErrors?.length
      && !reviewErrors.length) {
      taskStatus = 'ready';
    }
    if (!taskStatus) {
      if (reviewErrors.length) taskStatus = 'blocked';
      else if (source === 'fashionpo' && !order.quantityConfirmed) taskStatus = 'needs_quantity';
      else taskStatus = 'ready';
    }
    return { ...order, source, taskKey, taskStatus, reviewErrors };
  }

  function activeOrders(state) {
    const byKey = new Map(state.orders.map((order) => [order.taskKey, order]));
    return (state.activeOrderKeys || []).map((key) => byKey.get(key)).filter(Boolean);
  }

  function currentInvoiceTaskKey(state) {
    if (!INVOICE_ACTIVE_PHASES.has(state.phase)) return null;
    return activeOrders(state)[state.orderIndex]?.taskKey || null;
  }

  function completeCurrentInvoice(state, expectedTaskKey = null) {
    const current = activeOrders(state)[state.orderIndex];
    if (!current) {
      return {
        orders: state.orders,
        selectedOrderKeys: state.selectedOrderKeys || [],
      };
    }
    if (expectedTaskKey && current.taskKey !== expectedTaskKey) {
      throw new Error('当前订单已改变，已停止更新完成状态');
    }
    return {
      orders: state.orders.map((order) => (
        order.taskKey === current.taskKey
          ? { ...order, taskStatus: 'complete' }
          : order
      )),
      selectedOrderKeys: (state.selectedOrderKeys || []).filter((key) => key !== current.taskKey),
    };
  }

  function operationToken() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function finalizationSessionToken() {
    try {
      return sessionStorage.getItem(FINALIZATION_SESSION_KEY);
    } catch {
      return null;
    }
  }

  function setFinalizationSessionToken(token) {
    try {
      sessionStorage.setItem(FINALIZATION_SESSION_KEY, token);
    } catch {
      throw new Error('浏览器无法保存当前开票标签页标识');
    }
  }

  function clearFinalizationSessionToken() {
    try {
      sessionStorage.removeItem(FINALIZATION_SESSION_KEY);
    } catch {
      // 无可清理的标签页临时状态。
    }
  }

  function invoicePreviewUrl() {
    if (location.hostname !== 'secure.fattureincloud.it' || location.pathname === '/invoices/new') {
      return null;
    }
    return clickableText(document, 'Torna ai documenti') ? location.href : null;
  }

  async function finishFinalizedInvoice(taskKey, token) {
    const url = await waitFor(invoicePreviewUrl, '发票预览页面', PAGE_WAIT_TIMEOUT);
    const latest = loadState();
    const sessionToken = finalizationSessionToken();
    const currentTaskKey = activeOrders(latest)[latest.orderIndex]?.taskKey || null;
    if (
      latest.phase !== 'finalizing'
      || latest.finalizingTaskKey !== taskKey
      || latest.finalizingToken !== token
      || sessionToken !== token
      || currentTaskKey !== taskKey
    ) {
      throw new Error('开票状态已在其他页面改变，未更新任务完成状态');
    }
    const completed = completeCurrentInvoice(latest, taskKey);
    saveState({
      ...completed,
      phase: 'waiting_invoice_review',
      lastInvoiceUrl: url,
      finalizingTaskKey: null,
      finalizingToken: null,
      message: '',
      error: null,
    });
    clearFinalizationSessionToken();
  }

  function mergeScannedOrders(state, scannedOrders) {
    const existing = new Map(state.orders.map((order) => [order.taskKey, order]));
    const addedReadyKeys = [];
    for (const rawOrder of scannedOrders) {
      const order = normalizeOrderTask(rawOrder);
      const old = existing.get(order.taskKey);
      if (old?.taskStatus === 'complete') continue;
      const keepConfirmedQuantities = old?.source === 'fashionpo' && old.quantityConfirmed;
      const merged = old
        ? {
          ...order,
          taskStatus: old.taskStatus === 'running'
            ? 'running'
            : keepConfirmedQuantities && !order.reviewErrors?.length ? 'ready' : order.taskStatus,
          ...(keepConfirmedQuantities ? {
            quantityConfirmed: true,
            quantityConfirmedAt: old.quantityConfirmedAt,
            items: old.items,
            rawItems: old.rawItems,
          } : {}),
        }
        : order;
      existing.set(order.taskKey, merged);
      if (!old && merged.taskStatus === 'ready') addedReadyKeys.push(merged.taskKey);
    }
    const orders = [...existing.values()];
    const selectableKeys = new Set(orders
      .filter((order) => order.taskStatus === 'ready')
      .map((order) => order.taskKey));
    const selectedOrderKeys = [...new Set([
      ...(state.selectedOrderKeys || []).filter((key) => selectableKeys.has(key)),
      ...addedReadyKeys,
    ])];
    return { orders, selectedOrderKeys };
  }

  function assertScanCanStart() {
    const state = loadState();
    if (state.activeOrderKeys?.length) throw new Error('请先完成当前开票');
    const retryingFailedScan = state.phase === 'scanning' && Boolean(state.error);
    if (state.phase !== 'idle' && !retryingFailedScan) {
      throw new Error('当前步骤尚未结束，请完成或结束后再扫描');
    }
  }

  function isVisible(element) {
    return Boolean(element && element.getClientRects().length);
  }

  function exactText(root, value) {
    return [...root.querySelectorAll('*')]
      .filter((element) => (
        isVisible(element)
        && clean(element.textContent) === value
        && ![...element.children].some((child) => (
          isVisible(child) && clean(child.textContent) === value
        ))
      ));
  }

  function clickableText(root, value, { ignoreLeadingPlus = false } = {}) {
    const normalize = (text) => {
      const normalized = clean(text);
      return ignoreLeadingPlus ? normalized.replace(/^\+\s*/, '') : normalized;
    };
    const candidates = [...root.querySelectorAll('*')].filter((element) => (
      isVisible(element)
      && normalize(element.textContent) === value
      && ![...element.children].some((child) => (
        isVisible(child) && normalize(child.textContent) === value
      ))
    ));
    const controls = [...new Set(candidates.map((element) => (
      element.closest('button,a,[role="button"],[role="link"],[tabindex]') || element
    )).filter(isVisible))];
    return controls.length === 1 ? controls[0] : null;
  }

  function unique(elements, description) {
    if (elements.length !== 1) {
      throw new Error(`${description} 应唯一，实际找到 ${elements.length} 个`);
    }
    return elements[0];
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitFor(read, description, timeout = DEFAULT_WAIT_TIMEOUT) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const value = read();
      if (value) return value;
      await sleep(WAIT_POLL_INTERVAL);
    }
    throw new Error(`等待超时：${description}`);
  }

  function setNativeValue(element, value, { keepFocused = false } = {}) {
    if (!element) throw new Error('目标输入框不存在');
    element.focus();
    const view = element.ownerDocument.defaultView;
    const prototype = element.tagName === 'TEXTAREA'
      ? view.HTMLTextAreaElement.prototype
      : view.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(element, String(value));
    element.dispatchEvent(new view.Event('input', { bubbles: true }));
    if (!keepFocused) {
      element.dispatchEvent(new view.Event('change', { bubbles: true }));
      element.blur();
    }
  }

  function activateControl(element) {
    if (!element) throw new Error('目标控件不存在');
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const view = element.ownerDocument.defaultView;
    for (const type of ['mousedown', 'mouseup', 'click']) {
      element.dispatchEvent(new view.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view,
        button: 0,
        buttons: type === 'mousedown' ? 1 : 0,
      }));
    }
  }

  function findFieldByLabel(root, labelText, selector = 'input,textarea') {
    const label = unique(exactText(root, labelText), `${labelText} 标签`);
    let node = label;
    for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
      const candidates = [...node.querySelectorAll(selector)].filter(isVisible);
      if (candidates.length === 1) return candidates[0];
    }
    throw new Error(`没有找到 ${labelText} 的输入框`);
  }

  async function chooseReactOption(root, labelText, optionText) {
    const label = await waitFor(() => {
      const candidates = exactText(root, labelText);
      return candidates.length === 1 ? candidates[0] : null;
    }, `${labelText} 标签加载`, LONG_WAIT_TIMEOUT);
    let container = label.parentElement;
    let control = null;
    for (let depth = 0; container && depth < 5; depth += 1, container = container.parentElement) {
      control = [...container.querySelectorAll(
        'select,input[aria-autocomplete="list"],input[role="combobox"]',
      )].find(isVisible);
      if (control) break;
    }
    if (!control) throw new Error(`没有找到 ${labelText} 下拉框`);

    if (control instanceof HTMLSelectElement) {
      const option = [...control.options].find((item) => clean(item.textContent) === optionText);
      if (!option) throw new Error(`${labelText} 没有选项 ${optionText}`);
      control.value = option.value;
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    const reactSelect = control.closest('.css-2b097c-container,.Select') || control.parentElement;
    if (clean(reactSelect.textContent).includes(optionText)) return;
    const clickTarget = reactSelect.querySelector('.sc-dlWCHZ,.Select-control') || reactSelect;
    const visibleOptionMenu = () => [...document.querySelectorAll(
      '.react-select__menu,.Select-menu-outer',
    )].find(isVisible);
    activateControl(clickTarget);
    let listbox = await waitFor(
      visibleOptionMenu,
      `${labelText} 鼠标展开选项列表`,
      2000,
    ).catch(() => null);
    if (!listbox) {
      control.focus();
      const view = control.ownerDocument.defaultView;
      control.dispatchEvent(new view.KeyboardEvent('keydown', {
        key: 'ArrowDown',
        code: 'ArrowDown',
        keyCode: 40,
        which: 40,
        bubbles: true,
        cancelable: true,
      }));
      listbox = await waitFor(
        visibleOptionMenu,
        `${labelText} 选项列表`,
        LONG_WAIT_TIMEOUT,
      );
    }
    const option = unique(
      exactText(listbox, optionText),
      `${labelText} 的 ${optionText} 选项`,
    );
    activateControl(option);
    await waitFor(
      () => clean(reactSelect.textContent).includes(optionText),
      `${labelText} 显示 ${optionText}`,
      LONG_WAIT_TIMEOUT,
    );
  }

  function readReactOption(root, labelText) {
    const label = unique(exactText(root, labelText), `${labelText} 标签`);
    let container = label.parentElement;
    let control = null;
    for (let depth = 0; container && depth < 5; depth += 1, container = container.parentElement) {
      control = [...container.querySelectorAll(
        'select,input[aria-autocomplete="list"],input[role="combobox"]',
      )].find(isVisible);
      if (control) break;
    }
    if (!control) throw new Error(`没有找到 ${labelText} 下拉框`);

    if (control instanceof HTMLSelectElement) {
      return clean(control.selectedOptions[0]?.textContent);
    }

    const reactSelect = control.closest('.css-2b097c-container,.Select') || control.parentElement;
    const selectedNode = reactSelect.querySelector(
      '.react-select__single-value,.Select-value-label,[class*="singleValue"],[class*="SingleValue"]',
    );
    const selected = clean(selectedNode?.textContent)
      || clean(control.getAttribute('aria-valuetext'))
      || clean(control.value)
      || clean(reactSelect.textContent);
    if (!selected || /^(seleziona|select)/i.test(selected)) {
      throw new Error(`请先手动选择 ${labelText}`);
    }
    return selected;
  }

  async function setCheckboxByText(root, labelText, target = true) {
    const label = await waitFor(() => {
      const candidates = exactText(root, labelText);
      return candidates.length === 1 ? candidates[0] : null;
    }, `${labelText} 标签加载`, LONG_WAIT_TIMEOUT);
    let node = label.parentElement;
    let checkbox = null;
    for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
      checkbox = node.querySelector('input[type="checkbox"]');
      if (checkbox) break;
    }
    if (!checkbox) throw new Error(`没有找到 ${labelText} 复选框`);
    if (Boolean(checkbox.checked) !== target) {
      const clickTarget = checkbox.previousElementSibling || checkbox;
      activateControl(clickTarget);
      await waitFor(
        () => Boolean(checkbox.checked) === target,
        `${labelText} 状态更新`,
      );
    }
  }

  function formatComposition(composition, madeIn) {
    const materials = composition.map(({ material, percentage }) => (
      `${clean(material)}${Number(String(percentage).replace(',', '.'))}%`
    ));
    return `${materials.join(' ')}\nMADE IN ${clean(madeIn).toUpperCase()}`;
  }

  function baseCode(value) {
    const match = clean(value).toUpperCase().match(/^(\d{5})(?:[-_].*)?$/);
    return match?.[1] ?? null;
  }

  function isMediaUrl(value) {
    try {
      const url = new URL(value, FASHIONPO_ORIGIN);
      return /\.(?:avif|gif|jpe?g|png|svg|webp|mp4|webm)(?:$|[?#])/i.test(url.href)
        || /\/public\/_img\//i.test(url.pathname);
    } catch {
      return true;
    }
  }

  function findProductDetailLink(row) {
    const links = [...row.querySelectorAll('a[href]')].filter((link) => {
      const href = clean(link.getAttribute('href'));
      return href && !/^#|^javascript:/i.test(href) && !isMediaUrl(href);
    });
    return links.find((link) => /^vedi$/i.test(clean(link.textContent)))
      || links.find((link) => /\/(?:pronto-moda|nuovi-arrivi|accessori|occasioni|made-in-italy)\//i.test(link.getAttribute('href')))
      || links.find((link) => /\/articol[oi]\//i.test(link.getAttribute('href')))
      || null;
  }

  function parseBilling(doc) {
    const heading = [...doc.querySelectorAll('h1,h2,h3,h4')]
      .find((element) => clean(element.textContent) === 'Dati di fatturazione');
    if (!heading) throw new Error('找不到 Dati di fatturazione');

    // FashionPO puts the heading inside `.uk-modal-header`, while the billing
    // paragraphs are direct children of the surrounding `.uk-modal-dialog`.
    const dialog = heading.closest('.uk-modal-dialog')
      || doc.querySelector('#dati_fatturazione_modal .uk-modal-dialog');
    if (!dialog) throw new Error('找不到客户账单信息弹窗');

    let paragraphs = [...dialog.children].filter((node) => node.matches('p'));
    if (!paragraphs.length) paragraphs = [...dialog.querySelectorAll('p')];
    const lines = paragraphs.map((node) => clean(node.textContent));
    const usable = lines.filter((line) => line && !/^Pagamento:/i.test(line));
    const keyed = Object.fromEntries(usable
      .filter((line) => line.includes(':'))
      .map((line) => {
        const index = line.indexOf(':');
        return [clean(line.slice(0, index)).toUpperCase(), clean(line.slice(index + 1))];
      }));
    const plain = usable.filter((line) => !line.includes(':'));
    if (plain.length < 4) throw new Error(`客户地址结构不足：${plain.join(' | ')}`);
    const postalCity = plain[2].match(/^(\S+)\s+(.+)$/);
    if (!postalCity) throw new Error(`无法拆分邮编和城市：${plain[2]}`);

    // Italian addresses normally include a province line. Many foreign
    // addresses omit it entirely, so their country is the fourth plain line.
    const country = plain[plain.length - 1].toUpperCase();
    const provinceRaw = plain.length > 4 ? plain.slice(3, -1).join(' ') : '';

    return {
      name: plain[0],
      address: plain[1],
      postalCode: postalCity[1],
      city: postalCity[2],
      provinceRaw,
      country,
      vatNumber: keyed['P.I.'] || '',
      sdi: keyed['CODICE SDI'] || '',
      fiscalCode: keyed['C.F.'] || '',
      pec: keyed.PEC || '',
      iva: keyed.IVA || '',
    };
  }

  function parseOrderRows(doc) {
    const rows = [...doc.querySelectorAll('tbody tr')]
      .filter((row) => row.querySelector('a[href*="/articoli/"]'));
    return rows.map((row) => {
      const detailLink = findProductDetailLink(row);
      const sourceLinks = [...row.querySelectorAll('a[href]')].map((link) => ({
        text: clean(link.textContent),
        href: link.getAttribute('href') || '',
      }));
      const rowText = clean(row.textContent).replace(/[]/g, ' ');
      const codeMatch = rowText.match(/\b(\d{5}(?:[-_][A-Z0-9]+)?|[A-Z]{2}\d{3})\b/i);
      const priceMatch = rowText.match(/€\s*([\d.,]+)/);
      const quantityMatch = rowText.match(/:\s*(\d+)(?:\s*\/\s*(\d+))?(?=\s*(?:vedi\b|$))/i);
      if (!codeMatch || !priceMatch || !quantityMatch) {
        throw new Error(`无法解析商品行：${rowText}`);
      }
      if (!detailLink) {
        const candidates = sourceLinks
          .map((link) => `${link.text || '[无文字]'} => ${link.href}`)
          .join(' | ');
        throw new Error(`找不到商品详情网页链接：${rowText}；候选链接：${candidates}`);
      }
      const rawCode = codeMatch[1].toUpperCase();
      const name = clean(rowText.slice(0, codeMatch.index));
      const color = clean(rowText.slice(codeMatch.index + rawCode.length, priceMatch.index));
      return {
        lineId: `${rawCode}|${color}|${detailLink.getAttribute('href')}`,
        rawCode,
        code: baseCode(rawCode),
        name,
        color,
        quantity: Number(quantityMatch[1]),
        adjustedQuantity: Number(quantityMatch[1]),
        orderedQuantity: Number(quantityMatch[2] || quantityMatch[1]),
        netPrice: priceMatch[1].replace(',', '.'),
        productUrl: new URL(detailLink.getAttribute('href'), FASHIONPO_ORIGIN).href,
        sourceLinks,
      };
    }).filter((item) => item.quantity > 0);
  }

  function readLabeledValue(doc, labelPattern) {
    const label = [...doc.querySelectorAll('label,dt,th,strong,span,div')]
      .find((element) => labelPattern.test(clean(element.textContent)));
    if (!label) return '';
    let node = label.parentElement;
    for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
      const select = node.querySelector('select');
      if (select?.selectedOptions?.[0]) return clean(select.selectedOptions[0].textContent);
      const input = node.querySelector('input,textarea');
      if (input?.value) return clean(input.value);
      const siblings = [...node.children].filter((child) => child !== label);
      const value = siblings.map((child) => clean(child.textContent)).find(Boolean);
      if (value) return value;
    }
    return '';
  }

  function summarizeProductDocument(doc, requestedUrl) {
    const fetchInfo = doc.__jescoFetchInfo || {};
    const bodyText = clean(doc.body?.textContent);
    const keywordPattern = /materiale|percentuale|composizione|composition|made in|origine|tessuto|cotone|poliestere|elastan/i;
    const keywordIndex = bodyText.search(keywordPattern);
    const controls = [...doc.querySelectorAll('input:not([type="hidden"]):not([type="password"]),select,textarea')]
      .slice(0, 100)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute('type') || '',
        name: element.getAttribute('name') || '',
        id: element.id || '',
        placeholder: element.getAttribute('placeholder') || '',
        ariaLabel: element.getAttribute('aria-label') || '',
        nearbyText: clean(element.parentElement?.textContent).slice(0, 300),
        value: element instanceof HTMLSelectElement
          ? clean(element.selectedOptions?.[0]?.textContent)
          : clean(element.value),
      }))
      .filter((entry) => Object.values(entry).some(Boolean));
    const tables = [...doc.querySelectorAll('table')].slice(0, 20).map((table) => ({
      headers: [...table.querySelectorAll('th')].map((cell) => clean(cell.textContent)).filter(Boolean).slice(0, 20),
      rows: [...table.querySelectorAll('tr')].slice(0, 8).map((row) => (
        [...row.querySelectorAll('th,td')]
          .map((cell) => clean(cell.textContent).slice(0, 300))
          .filter(Boolean)
          .slice(0, 20)
      )).filter((row) => row.length),
    }));
    return {
      requestedUrl,
      finalUrl: fetchInfo.finalUrl || doc.URL || '',
      redirected: Boolean(fetchInfo.redirected),
      contentType: fetchInfo.contentType || '',
      title: clean(doc.title),
      headings: [...doc.querySelectorAll('h1,h2,h3,h4')]
        .map((element) => clean(element.textContent)).filter(Boolean).slice(0, 50),
      labels: [...doc.querySelectorAll('label,dt')]
        .map((element) => clean(element.textContent)).filter(Boolean).slice(0, 100),
      keywordElements: [...doc.querySelectorAll('label,th,td,dt,dd,strong,span')]
        .filter((element) => keywordPattern.test(clean(element.textContent)))
        .slice(0, 50)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          id: element.id || '',
          className: clean(element.className),
          text: clean(element.textContent).slice(0, 500),
          html: element.outerHTML.slice(0, 1200),
        })),
      controls,
      tables,
      relevantText: keywordIndex >= 0
        ? bodyText.slice(Math.max(0, keywordIndex - 300), keywordIndex + 1200)
        : bodyText.slice(0, 1200),
    };
  }

  function summarizeOrderDocument(doc, requestedUrl) {
    const fetchInfo = doc.__jescoFetchInfo || {};
    const billingDialog = doc.querySelector('#dati_fatturazione_modal .uk-modal-dialog');
    return {
      requestedUrl,
      finalUrl: fetchInfo.finalUrl || doc.URL || '',
      redirected: Boolean(fetchInfo.redirected),
      title: clean(doc.title),
      headings: [...doc.querySelectorAll('h1,h2,h3,h4')]
        .map((element) => clean(element.textContent)).filter(Boolean).slice(0, 50),
      billingLines: billingDialog
        ? [...billingDialog.querySelectorAll('p')].map((element) => clean(element.textContent))
        : [],
      productRows: [...doc.querySelectorAll('tbody tr')]
        .filter((row) => row.querySelector('a[href*="/articoli/"]'))
        .map((row) => clean(row.textContent)).slice(0, 100),
    };
  }

  function productDetailError(message, doc, requestedUrl) {
    const error = new Error(message);
    error.diagnostic = summarizeProductDocument(doc, requestedUrl);
    return error;
  }

  function parseCompositionText(value) {
    return clean(value).split(/\s*[,;]\s*/).map((part) => {
      const match = part.match(/^(.+?)\s*:?\s*(\d+(?:[.,]\d+)?)\s*%$/);
      return match
        ? { material: clean(match[1]), percentage: match[2].replace(',', '.') }
        : null;
    }).filter(Boolean);
  }

  function parseProductDetail(doc, requestedUrl) {
    const madeInSelect = doc.querySelector('select#made_in,select[name="made_in"]');
    const formMadeIn = clean(madeInSelect?.selectedOptions?.[0]?.textContent);
    const formComposition = [...doc.querySelectorAll('select.materiale')].map((select) => {
      const row = select.closest('tr');
      const percentageInput = row?.querySelector('input.percentuale,input[type="number"]');
      return {
        material: clean(select.selectedOptions?.[0]?.textContent),
        percentage: clean(percentageInput?.value),
        template: row?.classList.contains('composizione-modello'),
      };
    }).filter((item) => (
      !item.template
      && item.material
      && !/^Scegli$/i.test(item.material)
      && item.percentage
    ));
    if (formComposition.length && formMadeIn && !/^Scegli$/i.test(formMadeIn)) {
      return { composition: formComposition, madeIn: formMadeIn };
    }

    const compositionText = readLabeledValue(doc, /^Composizione\*?$/i);
    const textComposition = parseCompositionText(compositionText);
    const textMadeIn = readLabeledValue(doc, /^Made in\*?$/i);
    if (textComposition.length && textMadeIn) {
      return { composition: textComposition, madeIn: textMadeIn };
    }

    const table = [...doc.querySelectorAll('table')].find((candidate) => {
      const content = clean(candidate.textContent);
      return /Materiale/i.test(content) && /Percentuale/i.test(content);
    });
    if (!table) throw productDetailError('商品详情缺少成分表', doc, requestedUrl);
    const headers = [...table.querySelectorAll('thead th')].map((cell) => clean(cell.textContent));
    const materialIndex = headers.findIndex((value) => /Materiale/i.test(value));
    const percentageIndex = headers.findIndex((value) => /Percentuale/i.test(value));
    const composition = [...table.querySelectorAll('tbody tr')].map((row) => {
      const cells = [...row.querySelectorAll('td')].map((cell) => clean(cell.textContent));
      return { material: cells[materialIndex], percentage: cells[percentageIndex] };
    }).filter((item) => item.material && item.percentage);
    const madeIn = textMadeIn || readLabeledValue(doc, /^Made in\*?$/i);
    if (!composition.length || !madeIn) {
      throw productDetailError('商品详情的成分或产地为空', doc, requestedUrl);
    }
    return { composition, madeIn };
  }

  async function fetchDocument(url) {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error(`请求失败 ${response.status}：${url}`);
    const contentType = response.headers.get('content-type') || '';
    if (!/(?:text\/html|application\/xhtml\+xml)/i.test(contentType)) {
      const error = new Error(`目标链接不是网页（${contentType || '未知类型'}）：${response.url || url}`);
      error.diagnostic = {
        requestedUrl: url,
        finalUrl: response.url || '',
        redirected: response.redirected,
        contentType,
      };
      throw error;
    }
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.__jescoFetchInfo = {
      finalUrl: response.url,
      redirected: response.redirected,
      contentType,
    };
    return doc;
  }

  function pfsAccessToken() {
    const prefix = '__Secure-PFS_v1=';
    const cookie = document.cookie.split(';').map((part) => part.trim())
      .find((part) => part.startsWith(prefix));
    if (!cookie) throw new Error('没有找到PFS登录状态，请重新登录PFS后再扫描');
    return decodeURIComponent(cookie.slice(prefix.length));
  }

  async function pfsApiGet(path, params = {}) {
    const url = new URL(path.replace(/^\//, ''), PFS_API_ORIGIN);
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'it',
        Authorization: `Bearer ${pfsAccessToken()}`,
      },
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error('PFS登录状态已失效，请重新登录后再扫描');
    }
    if (!response.ok) throw new Error(`PFS接口请求失败 ${response.status}：${path}`);
    return response.json();
  }

  function pfsResponseData(payload) {
    return payload && Object.prototype.hasOwnProperty.call(payload, 'data')
      ? payload.data
      : payload;
  }

  function pfsListOrderEligible(order) {
    return order?.status === 'VALIDATED'
      && Number(order?.has_invoice ?? 0) === 0;
  }

  async function pfsPendingInvoiceOrders() {
    const orders = [];
    let page = 1;
    let lastPage = 1;
    do {
      const payload = await pfsApiGet('orders/listOrders', {
        page,
        per_page: 50,
        status: 'VALIDATED',
        billed: false,
      });
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      orders.push(...rows.filter(pfsListOrderEligible));
      lastPage = Math.max(1, Number(payload?.meta?.last_page) || 1);
      page += 1;
    } while (page <= lastPage);
    return orders;
  }

  async function mapWithConcurrency(values, concurrency, mapper) {
    const results = new Array(values.length);
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(values[index], index);
      }
    });
    await Promise.all(workers);
    return results;
  }

  function createScanProgressReporter(label, total) {
    let completed = 0;
    let lastReportedAt = 0;
    return () => {
      completed += 1;
      const now = Date.now();
      if (completed !== total && lastReportedAt && now - lastReportedAt < SCAN_PROGRESS_UPDATE_INTERVAL) {
        return;
      }
      lastReportedAt = now;
      saveState({ phase: 'scanning', message: `${label} ${completed}/${total}` });
    };
  }

  function pfsItalianText(value) {
    if (typeof value === 'string') return clean(value);
    return clean(value?.it || value?.labels?.it || value?.label?.it || value?.en || value?.labels?.en);
  }

  function pfsMadeInEnglish(value) {
    const source = normalizedCountry(typeof value === 'string' ? value : pfsItalianText(value));
    const known = {
      IT: 'ITALY',
      ITALIA: 'ITALY',
      CINA: 'CHINA',
      FRANCIA: 'FRANCE',
      GERMANIA: 'GERMANY',
      SPAGNA: 'SPAIN',
      PORTOGALLO: 'PORTUGAL',
      TURCHIA: 'TURKEY',
    };
    return known[source] || source;
  }

  function pfsCustomer(detail) {
    const source = detail?.customer || {};
    const billingAddress = normalizePfsAddress(source.billing_address);
    const rawDeliveryAddress = source.delivery_address
      || source.shipping_address
      || detail?.delivery_address
      || detail?.shipping_address
      || null;
    const deliveryAddress = rawDeliveryAddress ? normalizePfsAddress(rawDeliveryAddress) : null;
    const vatNumber = clean(source.identification_numbers?.vat);
    return {
      source: 'pfs',
      name: clean(source.shop),
      address: billingAddress.address,
      postalCode: billingAddress.postalCode,
      city: billingAddress.city,
      provinceRaw: '',
      country: billingAddress.country,
      vatNumber,
      sdi: '',
      fiscalCode: '',
      pec: '',
      iva: '',
      deliveryAddress,
      deliveryAddressCaptured: true,
    };
  }

  function pfsProductDetails(payload) {
    const product = pfsResponseData(payload) || {};
    const composition = (product.material_composition || []).map((part) => ({
      material: pfsItalianText(part.labels || part.label || part.material || part.name),
      percentage: part.percentage ?? part.value,
    })).filter((part) => part.material && part.percentage !== null && part.percentage !== undefined);
    return {
      id: product.id,
      reference: clean(product.reference),
      name: pfsItalianText(product.label || product.name),
      madeInRaw: pfsItalianText(product.country_of_manufacture) || clean(product.country_of_manufacture),
      composition,
    };
  }

  function pfsOrderFromDetail(detail, productCache) {
    const orderNumber = clean(detail.order_no);
    const customer = pfsCustomer(detail);
    const rawItems = [];
    const reviewErrors = [];
    if (!orderNumber) reviewErrors.push('PFS订单缺少订单号');
    if (!customer.name) reviewErrors.push('PFS订单缺少客户名称');
    if (!customer.address || !customer.postalCode || !customer.city || !customer.country) {
      reviewErrors.push('PFS订单的客户账单地址不完整');
    }
    if (!completePostalAddress(customer.deliveryAddress)) {
      reviewErrors.push('PFS订单的客户邮寄地址不完整');
    }
    for (const brand of detail.items_by_brand || []) {
      for (const productGroup of brand.products || []) {
        const productId = clean(productGroup.id || productGroup.items?.[0]?.product_id);
        const product = productCache.get(productId) || {};
        const rawCode = clean(productGroup.reference || product.reference).toUpperCase();
        const name = clean(product.name || pfsItalianText(productGroup.label || productGroup.name));
        const madeIn = pfsMadeInEnglish(product.madeInRaw);
        const description = product.composition?.length && madeIn
          ? formatComposition(product.composition, madeIn)
          : '';
        for (const item of productGroup.items || []) {
          const qtyValidated = Number(item.qty_validated) || 0;
          if (qtyValidated <= 0) continue;
          const pieces = Math.max(1, Number(item.pieces) || 1);
          const validatedPieces = Number(item.validated_piece_qty);
          const quantity = Number.isFinite(validatedPieces) && validatedPieces > 0
            ? validatedPieces
            : qtyValidated * pieces;
          const netPrice = clean(item.price_sale?.unit?.value ?? productGroup.price_sale?.unit?.value);
          if (!netPrice) reviewErrors.push(`PFS货号 ${rawCode || '[空]'} 缺少单价`);
          rawItems.push({
            lineId: `${productId}|${item.sku || ''}`,
            rawCode,
            code: baseCode(rawCode),
            name,
            color: pfsItalianText(item.color) || clean(item.color),
            size: pfsItalianText(item.size) || clean(item.size),
            quantity,
            adjustedQuantity: quantity,
            orderedQuantity: quantity,
            netPrice,
            productId,
            composition: product.composition || [],
            madeIn,
            description,
            pfsQuantity: {
              type: clean(item.type),
              pieces,
              qtyOrdered: Number(item.qty_ordered) || 0,
              qtyValidated,
              validatedPieceQty: Number.isFinite(validatedPieces) ? validatedPieces : null,
            },
          });
        }
        if (!baseCode(rawCode)) reviewErrors.push(`PFS货号 ${rawCode || '[空]'} 不是五位数字货号`);
        if (!name) reviewErrors.push(`PFS货号 ${rawCode || '[空]'} 缺少意大利语商品名`);
        if (!product.composition?.length) reviewErrors.push(`PFS货号 ${rawCode || '[空]'} 缺少成分`);
        if (!madeIn) reviewErrors.push(`PFS货号 ${rawCode || '[空]'} 缺少产地`);
      }
    }
    const order = {
      source: 'pfs',
      orderNumber,
      orderUrl: `${PFS_ORIGIN}/orders/${detail.id}/details`,
      customer,
      rawItems,
      items: [],
      quantityConfirmed: true,
      quantityConfirmedAt: new Date().toISOString(),
      reviewErrors: [...new Set(reviewErrors)],
    };
    if (!order.reviewErrors.length) {
      try {
        order.items = groupConfirmedItems(order);
      } catch (error) {
        order.reviewErrors.push(error.message);
      }
    }
    return order;
  }

  function pfsOrderDiagnostics(orders) {
    const errors = orders.flatMap((order) => order.reviewErrors.map((error) => ({
      type: 'pfs_order',
      orderNumber: order.orderNumber,
      error,
    })));
    const warnings = orders.filter((order) => !compactVat(order.customer?.vatNumber)).map((order) => ({
      type: 'pfs_order',
      severity: 'warning',
      orderNumber: order.orderNumber,
      error: 'PFS订单未提供客户VAT号；创建客户时请人工填写',
    }));
    return { errors, warnings, diagnostics: [...errors, ...warnings] };
  }

  async function scanPfsOrders() {
    if (location.hostname !== 'wholesaler.parisfashionshops.com') {
      throw new Error('请先打开PFS订单页面');
    }
    assertScanCanStart();
    saveState({ phase: 'scanning', message: '正在扫描 PFS', error: null, diagnostics: [] });
    const listOrders = await pfsPendingInvoiceOrders();
    if (!listOrders.length) {
      saveState({ phase: 'idle', message: '没有新订单', error: null });
      return;
    }
    const details = await mapWithConcurrency(listOrders, 3, async (row, index) => {
      saveState({ phase: 'scanning', message: `扫描 PFS ${index + 1}/${listOrders.length}` });
      return pfsResponseData(await pfsApiGet(`orders/${row.id}`));
    });
    const productIds = [...new Set(details.flatMap((detail) => (
      (detail?.items_by_brand || []).flatMap((brand) => (
        (brand.products || []).map((product) => clean(product.id || product.items?.[0]?.product_id))
      ))
    )).filter(Boolean))];
    const productCache = new Map();
    await mapWithConcurrency(productIds, 3, async (productId, index) => {
      saveState({ phase: 'scanning', message: `读取商品 ${index + 1}/${productIds.length}` });
      productCache.set(productId, pfsProductDetails(await pfsApiGet(`catalog/products/${productId}`)));
    });
    const orders = details.map((detail) => pfsOrderFromDetail(detail, productCache));
    const { errors, warnings, diagnostics } = pfsOrderDiagnostics(orders);
    const state = loadState();
    const merged = mergeScannedOrders(state, orders);
    saveState({
      phase: 'idle',
      ...merged,
      diagnostics,
      message: errors.length
        ? '发现需处理的数据'
        : warnings.length ? '部分PFS订单没有VAT；创建客户时请人工填写' : '',
      error: null,
    });
  }

  function parseOrderDocument(doc, url) {
    const heading = [...doc.querySelectorAll('h1,h2')]
      .map((element) => clean(element.textContent))
      .find((value) => /^Ordine:\s*#\d+/.test(value));
    const orderNumber = heading?.match(/#(\d+)/)?.[1];
    if (!orderNumber) throw new Error('找不到订单号');
    const customer = parseBilling(doc);
    const rawItems = parseOrderRows(doc);
    const reviewErrors = [];
    for (const item of rawItems) {
      if (!item.code) {
        reviewErrors.push(`货号 ${item.rawCode} 不是五位数字，需人工处理`);
      }
    }
    return {
      source: 'fashionpo',
      orderNumber,
      orderUrl: url,
      customer,
      rawItems,
      items: [],
      quantityConfirmed: false,
      quantityConfirmedAt: null,
      reviewErrors,
    };
  }

  function fashionpoFailedOrder(url, error, existingOrders = []) {
    const orderNumber = new URL(url, FASHIONPO_ORIGIN).pathname
      .match(/\/ordini-(?:in-arrivo|inviati)\/(\d+)/)?.[1] || '';
    const previous = existingOrders.find((order) => (
      order.source === 'fashionpo' && order.orderNumber === orderNumber
    ));
    const errorMessage = error?.message || String(error);
    return {
      ...(previous || {}),
      source: 'fashionpo',
      orderNumber,
      orderUrl: url,
      customer: previous?.customer || { name: '' },
      rawItems: previous?.rawItems || [],
      items: previous?.items || [],
      quantityConfirmed: Boolean(previous?.quantityConfirmed),
      quantityConfirmedAt: previous?.quantityConfirmedAt || null,
      reviewErrors: [...new Set([
        ...(previous?.reviewErrors || []),
        `订单详情读取失败：${errorMessage}`,
      ])],
      taskStatus: 'blocked',
      scanFailed: true,
    };
  }

  function uniqueFashionpoProductUrls(orders) {
    return [...new Set(orders.flatMap((order) => (
      order.scanFailed
        ? []
        : order.rawItems.filter((item) => item.code).map((item) => item.productUrl)
    )).filter(Boolean))];
  }

  function applyFashionpoProductDetails(order, detailCache, diagnostics) {
    for (const item of order.rawItems) {
      if (!item.code) continue;
      const cached = detailCache.get(item.productUrl);
      if (!cached || cached.error) {
        const error = cached?.error || new Error('商品详情读取结果缺失');
        item.detailError = error.message;
        order.reviewErrors.push(`${item.rawCode} 缺少可用的成分或产地`);
        if (!diagnostics.some((entry) => entry.productUrl === item.productUrl) && diagnostics.length < 30) {
          diagnostics.push({
            type: 'product_detail',
            orderNumber: order.orderNumber,
            rawCode: item.rawCode,
            productName: item.name,
            productUrl: item.productUrl,
            sourceLinks: item.sourceLinks,
            error: error.message,
            document: error.diagnostic || null,
          });
        }
        continue;
      }
      item.composition = cached.detail.composition.map((part) => ({ ...part }));
      item.madeIn = cached.detail.madeIn;
      item.description = formatComposition(item.composition, item.madeIn);
    }
    order.reviewErrors = [...new Set(order.reviewErrors)];
    return order;
  }

  function collectOrderUrls() {
    if (/\/ordini-(?:in-arrivo|inviati)\/\d+/.test(location.pathname)) {
      return [location.href];
    }
    const links = [...document.querySelectorAll('a[href*="/ordini-in-arrivo/"],a[href*="/ordini-inviati/"]')]
      .map((link) => new URL(link.getAttribute('href'), location.origin).href)
      .filter((url) => /\/ordini-(?:in-arrivo|inviati)\/\d+(?:[?#]|$)/.test(url));
    return [...new Set(links)];
  }

  function buildCustomerList(orders) {
    const customers = [];
    for (const order of orders) {
      const vatNumber = compactVat(order.customer?.vatNumber);
      let existing = null;
      if (vatNumber) {
        const matches = customers.filter((candidate) => sameVat(vatNumber, candidate.vatNumber));
        if (matches.length > 1) {
          throw new Error(`${order.customer?.name || vatNumber} 的 P.I. 在本批次匹配不唯一`);
        }
        [existing] = matches;
      } else {
        if (order.source !== 'pfs') {
          throw new Error(`${order.customer?.name || `订单 #${order.orderNumber}`} 缺少 P.I.`);
        }
        existing = customers.find((candidate) => (
          !compactVat(candidate.vatNumber)
          && clean(candidate.name).toUpperCase() === clean(order.customer?.name).toUpperCase()
          && samePostalAddress(candidate, order.customer)
        ));
      }
      if (existing) {
        existing.orderNumbers.push(order.orderNumber);
        if (order.customer.deliveryAddressCaptured) {
          if (existing.deliveryAddressCaptured
            && !samePostalAddress(existing.deliveryAddress, order.customer.deliveryAddress)) {
            throw new Error(`${order.customer.name} 的多张 PFS 订单使用了不同邮寄地址，请分批处理`);
          }
          existing.deliveryAddress = order.customer.deliveryAddress;
          existing.deliveryAddressCaptured = true;
        }
      } else {
        customers.push({ ...order.customer, orderNumbers: [order.orderNumber] });
      }
    }
    return customers;
  }

  async function scanOrdersFromCurrentPage() {
    assertScanCanStart();
    const urls = collectOrderUrls();
    if (!urls.length) throw new Error('当前页面没有找到可扫描的 FashionPO 订单');
    const stateBeforeScan = loadState();
    saveState({ phase: 'scanning', message: '正在扫描 FashionPO', error: null, diagnostics: [] });
    const startedAt = Date.now();
    const diagnostics = [];
    const reportOrderProgress = createScanProgressReporter('扫描 FashionPO', urls.length);
    const parsedOrders = await mapWithConcurrency(urls, FASHIONPO_SCAN_CONCURRENCY, async (url) => {
      let doc = null;
      try {
        doc = url === location.href ? document : await fetchDocument(url);
        return parseOrderDocument(doc, url);
      } catch (error) {
        if (diagnostics.length < 30) {
          diagnostics.push({
            type: 'order',
            orderUrl: url,
            error: error?.message || String(error),
            document: doc ? summarizeOrderDocument(doc, url) : null,
          });
        }
        return fashionpoFailedOrder(url, error, stateBeforeScan.orders);
      } finally {
        reportOrderProgress();
      }
    });
    const orders = parsedOrders.filter(Boolean);
    const productUrls = uniqueFashionpoProductUrls(orders);
    const reportProductProgress = createScanProgressReporter('读取商品资料', productUrls.length);
    const detailResults = await mapWithConcurrency(
      productUrls,
      FASHIONPO_SCAN_CONCURRENCY,
      async (productUrl) => {
        try {
          const detailDoc = await fetchDocument(productUrl);
          return {
            productUrl,
            detail: parseProductDetail(detailDoc, productUrl),
            error: null,
          };
        } catch (error) {
          return { productUrl, detail: null, error };
        } finally {
          reportProductProgress();
        }
      },
    );
    const detailCache = new Map(detailResults.map((result) => [result.productUrl, result]));
    for (const order of orders) {
      if (order.scanFailed) continue;
      try {
        applyFashionpoProductDetails(order, detailCache, diagnostics);
      } catch (error) {
        order.reviewErrors = [...new Set([
          ...(order.reviewErrors || []),
          `商品资料整理失败：${error?.message || error}`,
        ])];
        order.taskStatus = 'blocked';
        if (diagnostics.length < 30) {
          diagnostics.push({
            type: 'order_processing',
            orderNumber: order.orderNumber,
            orderUrl: order.orderUrl,
            error: error?.message || String(error),
          });
        }
      }
    }
    const state = loadState();
    const merged = mergeScannedOrders(state, orders);
    const scannedTaskKeys = new Set(orders.map((order) => normalizeOrderTask(order).taskKey));
    const quantityReviewQueue = merged.orders.filter((order) => (
      scannedTaskKeys.has(order.taskKey) && order.taskStatus === 'needs_quantity'
    )).map((order) => order.taskKey);
    const nextReview = merged.orders.find((order) => order.taskKey === quantityReviewQueue[0]);
    saveState({
      phase: nextReview ? 'quantity_review' : 'idle',
      ...merged,
      diagnostics,
      reviewOrderKey: nextReview?.taskKey || null,
      quantityReviewQueue,
      message: diagnostics.length ? '发现需处理的数据' : '',
      error: null,
    });
    console.info(
      `[JESCO 发票助手] FashionPO 扫描完成：${orders.length} 个订单，`
      + `${productUrls.length} 个商品页面，${Date.now() - startedAt} ms`,
    );
  }

  function groupConfirmedItems(order) {
    const linesByBaseCode = new Map();
    const errors = [...order.reviewErrors];
    for (const item of order.rawItems) {
      const quantity = Number(item.adjustedQuantity);
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > item.orderedQuantity) {
        errors.push(`${item.rawCode} ${item.color} 的确认件数无效`);
        continue;
      }
      if (quantity === 0) continue;
      if (!item.code) continue;
      if (!linesByBaseCode.has(item.code)) linesByBaseCode.set(item.code, []);
      linesByBaseCode.get(item.code).push({ item, quantity });
    }

    const grouped = new Map();
    for (const [code, lines] of linesByBaseCode) {
      const normalizedPrices = new Set(lines.map(({ item }) => {
        const numeric = Number(String(item.netPrice).replace(',', '.'));
        return Number.isFinite(numeric) ? `number:${numeric}` : `text:${clean(item.netPrice)}`;
      }));
      const keepSuffix = normalizedPrices.size > 1;
      for (const { item, quantity } of lines) {
        const invoiceCode = keepSuffix ? clean(item.rawCode).toUpperCase() || code : code;
        const existing = grouped.get(invoiceCode);
        if (!existing) {
          grouped.set(invoiceCode, { ...item, code: invoiceCode, quantity });
          continue;
        }
        const existingPrice = Number(String(existing.netPrice).replace(',', '.'));
        const itemPrice = Number(String(item.netPrice).replace(',', '.'));
        const samePrice = Number.isFinite(existingPrice) && Number.isFinite(itemPrice)
          ? existingPrice === itemPrice
          : clean(existing.netPrice) === clean(item.netPrice);
        if (!samePrice || existing.description !== item.description) {
          errors.push(keepSuffix
            ? `货号 ${invoiceCode} 保留后缀后仍出现不同单价或成分`
            : `货号 ${code} 出现不同成分`);
          continue;
        }
        existing.quantity += quantity;
      }
    }
    if (errors.length) throw new Error(errors.join('；'));
    if (!grouped.size) throw new Error(`订单 #${order.orderNumber} 确认后没有可开票商品`);
    return [...grouped.values()];
  }

  function updateReviewedQuantity(orderKey, lineIndex, nextQuantity) {
    const state = loadState();
    const order = state.orders.find((candidate) => candidate.taskKey === orderKey);
    const line = order?.rawItems?.[lineIndex];
    if (!line) return;
    const value = Math.max(0, Math.min(line.orderedQuantity, Number(nextQuantity) || 0));
    line.adjustedQuantity = Math.trunc(value);
    saveState({ orders: state.orders });
  }

  function confirmCurrentOrderQuantities() {
    const state = loadState();
    const order = state.orders.find((candidate) => candidate.taskKey === state.reviewOrderKey);
    if (!order) throw new Error('没有待确认订单');
    order.items = groupConfirmedItems(order);
    order.quantityConfirmed = true;
    order.quantityConfirmedAt = new Date().toISOString();
    order.taskStatus = 'ready';
    const selectedOrderKeys = [...new Set([...(state.selectedOrderKeys || []), order.taskKey])];
    saveState({
      orders: state.orders,
      selectedOrderKeys,
      ...advanceQuantityReview(state, order.taskKey),
    });
  }

  function advanceQuantityReview(state, currentTaskKey) {
    const pendingKeys = state.orders
      .filter((order) => order.taskStatus === 'needs_quantity')
      .map((order) => order.taskKey);
    const savedQueue = Array.isArray(state.quantityReviewQueue)
      ? state.quantityReviewQueue.filter((key) => state.orders.some((order) => order.taskKey === key))
      : [];
    const queue = savedQueue.includes(currentTaskKey)
      ? savedQueue
      : [currentTaskKey, ...pendingKeys.filter((key) => key !== currentTaskKey)];
    const remaining = queue.filter((key) => key !== currentTaskKey);
    const nextTaskKey = remaining.find((key) => pendingKeys.includes(key)) || null;
    return {
      phase: nextTaskKey ? 'quantity_review' : 'idle',
      reviewOrderKey: nextTaskKey,
      quantityReviewQueue: nextTaskKey ? remaining : [],
      message: '',
      error: null,
    };
  }

  function skipCurrentOrderQuantities() {
    const state = loadState();
    const order = state.orders.find((candidate) => candidate.taskKey === state.reviewOrderKey);
    if (!order || order.taskStatus !== 'needs_quantity') throw new Error('没有可跳过的待核对订单');
    saveState(advanceQuantityReview(state, order.taskKey));
  }

  function findClientTable() {
    return [...document.querySelectorAll('table')].find((table) => {
      const headers = [...table.querySelectorAll('thead th')].map((cell) => clean(cell.textContent));
      return headers.includes('Ragione sociale') && headers.includes('Partita IVA');
    });
  }

  function readClientRows() {
    const table = findClientTable();
    if (!table) return [];
    const headers = [...table.querySelectorAll('thead th')].map((cell) => clean(cell.textContent));
    const nameIndex = headers.indexOf('Ragione sociale');
    const vatIndex = headers.indexOf('Partita IVA');
    return [...table.querySelectorAll('tbody tr')].filter(isVisible).map((row) => {
      const cells = [...row.querySelectorAll('td')].map((cell) => clean(cell.textContent));
      return { name: cells[nameIndex] || '', vatNumber: cells[vatIndex] || '' };
    });
  }

  async function searchClient(query) {
    const search = await waitFor(() => {
      const candidates = [...document.querySelectorAll('input')].filter((element) => (
        isVisible(element)
        && clean(element.getAttribute('placeholder')).toLowerCase() === 'cerca anagrafica'
      ));
      return candidates.length === 1 ? candidates[0] : null;
    }, '客户搜索框加载', LONG_WAIT_TIMEOUT);
    const requestedQuery = clean(query);
    setNativeValue(search, requestedQuery, { keepFocused: true });
    const searchStartedAt = Date.now();
    return waitFor(() => {
      const rows = readClientRows();
      const compactQuery = compactVat(requestedQuery);
      const resultMatchesQuery = rows.some((row) => (
        sameVatLocalPart(compactQuery, row.vatNumber)
      ));
      if (resultMatchesQuery) return rows;
      // 搜索框有防抖和网络请求。旧的“无结果”提示会短暂保留，不能立即采用。
      if (Date.now() - searchStartedAt >= 4000
        && exactText(document, 'Nessun cliente trovato').length) return [];
      return null;
    }, `搜索客户 ${requestedQuery}`, LONG_WAIT_TIMEOUT);
  }

  function activeNewCustomerDialog() {
    return [...document.querySelectorAll('[role="dialog"]')].find((candidate) => (
      isVisible(candidate)
      && clean(candidate.textContent).includes('Aggiungi nuovo cliente')
    ));
  }

  async function finishNewCustomerForm(dialog, customer) {
    await setCheckboxByText(dialog, 'Escludi da invio documento di cortesia', true);
    await setCheckboxByText(dialog, 'Escludi dai solleciti automatici', true);
    unique(exactText(dialog, 'Rapporti commerciali'), 'Rapporti commerciali').click();
    const shipping = await waitFor(
      () => dialog.querySelector('textarea[placeholder="Questo indirizzo verrà utilizzato per i DDT"]'),
      'Indirizzo di spedizione',
    );
    setNativeValue(shipping, shippingAddressValue(customer));
    await chooseReactOption(dialog, 'Metodo di pagamento predefinito', 'BONIFICO');
    const manualFields = compactVat(customer.vatNumber) ? 'Provincia' : 'Partita IVA、Provincia';

    saveState({
      phase: 'waiting_manual_customer_save',
      pendingCountrySource: null,
      pendingCountryInitialOption: null,
      message: `请补充 ${manualFields}、选择税务类别并保存：${customer.name}`,
      error: null,
    });
  }

  async function continueAfterManualCountry() {
    const state = loadState();
    const customer = state.customers[state.customerIndex];
    if (!customer || state.phase !== 'waiting_manual_country') {
      throw new Error('当前没有等待人工选择的国家');
    }
    const dialog = await waitFor(activeNewCustomerDialog, '新建客户对话框', LONG_WAIT_TIMEOUT);
    const selectedCountry = readReactOption(dialog, 'Paese');
    const configuredCountry = countryOptionFor(state.pendingCountrySource || customer.country);
    if (selectedCountry === state.pendingCountryInitialOption && selectedCountry !== configuredCountry) {
      throw new Error(`Paese 仍为原来的 ${selectedCountry}，请先手动选择 ${customer.country} 对应的国家`);
    }
    const sourceCountry = state.pendingCountrySource || customer.country;
    rememberCountryMapping(sourceCountry, selectedCountry);
    saveState({
      message: `已记住国家映射：${sourceCountry} → ${selectedCountry}，正在继续填写`,
      error: null,
    });
    await finishNewCustomerForm(dialog, customer);
  }

  function pauseForManualCountry(dialog, customer) {
    let initialCountry = '';
    try {
      initialCountry = readReactOption(dialog, 'Paese');
    } catch {
      // 空白下拉框也是合法的暂停起点。
    }
    saveState({
      phase: 'waiting_manual_country',
      pendingCountrySource: normalizedCountry(customer.country),
      pendingCountryInitialOption: initialCountry,
      message: `请选择国家：${customer.country}`,
      error: null,
    });
  }

  async function fillNewCustomer(customer) {
    const addClientText = await waitFor(() => {
      const candidates = exactText(document, 'Aggiungi cliente');
      return candidates.length === 1 ? candidates[0] : null;
    }, 'Aggiungi cliente 加载', LONG_WAIT_TIMEOUT);
    const addClientControl = addClientText.closest('button,a,[role="button"],[cursor="pointer"]')
      || addClientText;
    addClientControl.click();
    const dialog = await waitFor(activeNewCustomerDialog, '新建客户对话框', LONG_WAIT_TIMEOUT);
    const nameInput = await waitFor(() => {
      const candidates = [...dialog.querySelectorAll(
        'input[placeholder="Ragione sociale o nome"]',
      )].filter(isVisible);
      return candidates.length === 1 ? candidates[0] : null;
    }, 'Denominazione 输入框加载', LONG_WAIT_TIMEOUT);
    setNativeValue(nameInput, customer.name, { keepFocused: true });
    const newCustomer = await waitFor(() => {
      const textNode = exactText(dialog, `Nuovo cliente ${customer.name}`)[0];
      return textNode?.closest('a,[role="button"],[cursor="pointer"]') || textNode || null;
    },
      'Nuovo cliente 下拉项',
      LONG_WAIT_TIMEOUT,
    );
    newCustomer.click();

    await waitFor(() => (
      dialog.querySelector('#eiCode')
      && dialog.querySelector('#vatNumber')
      && dialog.querySelector('#addressStreet')
      && dialog.querySelector('#addressPostalCode')
      && dialog.querySelector('#country')
      && exactText(dialog, 'Comune').length === 1
      && exactText(dialog, 'Rapporti commerciali').length === 1
    ), '客户完整填写表单加载', LONG_WAIT_TIMEOUT);

    setNativeValue(findFieldByLabel(dialog, 'Indirizzo'), customer.address);
    setNativeValue(findFieldByLabel(dialog, 'Comune'), customer.city);
    setNativeValue(findFieldByLabel(dialog, 'CAP'), customer.postalCode);
    setNativeValue(findFieldByLabel(dialog, 'Partita IVA'), compactVat(customer.vatNumber));
    setNativeValue(
      unique([...dialog.querySelectorAll('input[placeholder="Per fatturazione elettronica"]')], 'Codice SDI'),
      customer.sdi,
    );
    const countryOption = countryOptionFor(customer.country);
    if (!countryOption) {
      pauseForManualCountry(dialog, customer);
      return;
    }
    try {
      await chooseReactOption(dialog, 'Paese', countryOption);
    } catch (error) {
      console.warn(`[JESCO 发票助手] 国家预设项不可用：${customer.country} → ${countryOption}`, error);
      pauseForManualCountry(dialog, customer);
      return;
    }
    await finishNewCustomerForm(dialog, customer);
  }

  async function checkCurrentCustomer() {
    const state = loadState();
    const customer = state.customers[state.customerIndex];
    if (!customer) {
      saveState({ phase: 'invoice_filling', orderIndex: 0, message: '', error: null });
      location.href = `${FIC_ORIGIN}/invoices/new`;
      return;
    }
    if (location.pathname !== '/clients') {
      location.href = `${FIC_ORIGIN}/clients`;
      return;
    }
    saveState({
      phase: 'checking_customers',
      message: `检查客户：${customer.name}`,
      error: null,
    });
    if (!compactVat(customer.vatNumber)) {
      saveState({ message: `${customer.name} 没有VAT；创建时请人工填写` });
      await fillNewCustomer(customer);
      return;
    }
    const searchVat = vatSearchValue(customer.vatNumber);
    const rows = await searchClient(searchVat);
    const matches = rows.filter((row) => sameVat(customer.vatNumber, row.vatNumber));
    const conflicts = rows.filter((row) => (
      sameVatLocalPart(customer.vatNumber, row.vatNumber)
      && !sameVat(customer.vatNumber, row.vatNumber)
    ));
    if (matches.length === 1 && !conflicts.length) {
      saveState({ customerIndex: state.customerIndex + 1, message: `${customer.name} 已存在`, error: null });
      await checkCurrentCustomer();
      return;
    }
    if (matches.length > 1 || conflicts.length) {
      throw new Error(`${customer.name} 的客户匹配不唯一，需要人工检查`);
    }
    await fillNewCustomer(customer);
  }

  function currentExpandedProductRow() {
    return [...document.querySelectorAll('.IssuedDocumentListItem')]
      .find((row) => row.querySelector('input[aria-label="Codice prodotto"]'));
  }

  async function addNextProductRow(nextRowNumber) {
    const previousRow = currentExpandedProductRow();
    const previousCount = document.querySelectorAll('.IssuedDocumentListItem').length;
    await sleep(200);
    activateControl(unique(exactText(document, 'Aggiungi nuova voce'), 'Aggiungi nuova voce'));
    return waitFor(() => {
      const currentRow = currentExpandedProductRow();
      const currentCount = document.querySelectorAll('.IssuedDocumentListItem').length;
      return currentCount > previousCount && currentRow && currentRow !== previousRow
        ? currentRow
        : null;
    }, `新增第 ${nextRowNumber} 条商品`, LONG_WAIT_TIMEOUT);
  }

  async function fillInvoiceCustomer(customer) {
    if (exactText(document, 'Cambia cliente').length) {
      if (compactVat(customer.vatNumber)) {
        const selectedVat = [...document.querySelectorAll('*')].find((element) => (
          isVisible(element)
          && /^P\.IVA:\s*[A-Z0-9]+$/i.test(clean(element.textContent))
          && sameVat(customer.vatNumber, clean(element.textContent).replace(/^P\.IVA:\s*/i, ''))
        ));
        if (selectedVat) return;
      } else if (exactText(document, customer.name).length === 1) {
        return;
      }
      throw new Error('当前发票已选择了其他客户，请打开空白新发票后重试');
    }
    const search = await waitFor(
      () => document.querySelector('input[placeholder="Cerca per nome o P.IVA"]'),
      '发票客户搜索框',
    );
    setNativeValue(search, '', { keepFocused: true });
    await sleep(50);
    const searchVat = vatSearchValue(customer.vatNumber);
    const searchValue = searchVat || customer.name;
    setNativeValue(search, searchValue, { keepFocused: true });
    const matchingRows = await waitFor(() => {
      const isOwnCustomerRow = (row) => {
        let group = row?.parentElement;
        while (group && group !== document.body) {
          if (clean(group.textContent).startsWith('La tua anagrafica')) return true;
          group = group.parentElement;
        }
        return false;
      };
      if (!searchVat) {
        const rows = exactText(document, customer.name)
          .map((element) => element.closest('[class*="Item__Wrapper-"]'))
          .filter((row) => row && isOwnCustomerRow(row));
        const uniqueRows = [...new Set(rows)];
        return uniqueRows.length ? uniqueRows : null;
      }
      const vatNodes = [...document.querySelectorAll('*')].filter((element) => {
        if (!isVisible(element)) return false;
        const content = clean(element.textContent);
        return /^P\.IVA:\s*[A-Z0-9]+$/i.test(content)
          && ![...element.children].some((child) => /^P\.IVA:/i.test(clean(child.textContent)));
      });
      const rows = [];
      for (const vatNode of vatNodes) {
        const candidateVat = clean(vatNode.textContent).replace(/^P\.IVA:\s*/i, '');
        const row = vatNode.closest('[class*="Item__Wrapper-"]');
        if (!row) continue;
        if (!isOwnCustomerRow(row)) continue;
        if (sameVatLocalPart(customer.vatNumber, candidateVat)
          && !sameVat(customer.vatNumber, candidateVat)) {
          throw new Error(`P.I. ${searchVat} 找到不同国家前缀的客户，需要人工检查`);
        }
        if (sameVat(customer.vatNumber, candidateVat)) rows.push(row);
      }
      const uniqueRows = [...new Set(rows)];
      return uniqueRows.length ? uniqueRows : null;
    }, searchVat
      ? `La tua anagrafica 中的 P.I. ${searchVat}`
      : `La tua anagrafica 中的客户 ${customer.name}`, LONG_WAIT_TIMEOUT);
    const customerRow = unique(
      matchingRows,
      searchVat ? `P.I. ${searchVat} 的客户候选` : `${customer.name} 的客户候选`,
    );
    activateControl(customerRow);
    await waitFor(
      () => exactText(document, 'Cambia cliente').length,
      '客户选择完成',
      LONG_WAIT_TIMEOUT,
    );
  }

  async function selectProductTemplate(template) {
    const initialRow = unique([currentExpandedProductRow()].filter(Boolean), '当前展开商品行');
    const codeInput = unique([...initialRow.querySelectorAll('input[aria-label="Codice prodotto"]')], 'Codice prodotto');
    // 直接打开完整下拉框，不向 Codice 输入货号或搜索词。
    activateControl(codeInput);
    const readListbox = () => {
      const input = currentExpandedProductRow()?.querySelector('input[aria-label="Codice prodotto"]');
      const listId = input?.getAttribute('aria-controls') || input?.getAttribute('aria-owns');
      const list = listId && document.getElementById(listId);
      return input?.getAttribute('aria-expanded') === 'true' && list?.getAttribute('role') === 'listbox'
        && isVisible(list) ? list : null;
    };
    await waitFor(readListbox, 'Codice 商品模板下拉框', LONG_WAIT_TIMEOUT);
    const option = await waitFor(() => {
      const listbox = readListbox();
      if (!listbox) return null;
      const matches = [...listbox.querySelectorAll('[role="option"]')]
        .filter((candidate) => isVisible(candidate) && productOptionMatchesCode(candidate, template.code));
      if (matches.length > 1) throw new Error(`Codice ${template.code} 存在多个模板，请检查商品档案`);
      return matches[0] || null;
    }, `Codice 模板 ${template.code}（${template.name}）`, LONG_WAIT_TIMEOUT);
    activateControl(option);
    return waitFor(() => {
      const row = currentExpandedProductRow();
      if (!row) return null;
      const code = clean(row.querySelector('input[aria-label="Codice prodotto"]')?.value);
      const name = clean(row.querySelector('input[aria-label="Nome prodotto"]')?.value).toUpperCase();
      if (code !== template.code || name !== template.name
        || !clean(row.textContent).includes("Prodotto collegato all'anagrafica")) return null;
      const unit = clean(findFieldByLabel(row, 'Un. di misura').value).toUpperCase();
      const category = clean(findFieldByLabel(row, 'Categoria').value).toUpperCase();
      const description = findFieldByLabel(row, 'Descrizione', 'textarea');
      const lines = description.value.split(/\r?\n/);
      if (unit !== 'PZ' || category !== template.category || lines.length < 3
        || clean(lines[0]).toUpperCase() !== template.name
        || !/^codice\s+art\.?\s*:?[\s]*$/i.test(clean(lines[1]))
        || !/^\s*made\s+in\s+\S/i.test(lines[2])) return null;
      return row;
    }, `模板 ${template.code} 自动带入名称、PZ、描述和类别`, LONG_WAIT_TIMEOUT);
  }

  async function fillProductRow(item) {
    const template = productTemplateFor(item);
    invoiceComposition(item);
    const row = await selectProductTemplate(template);
    const description = findFieldByLabel(row, 'Descrizione', 'textarea');
    const text = fillTemplateDescription(description.value, item);
    if (description.maxLength > 0 && text.length > description.maxLength) {
      throw new Error(`货号 ${item.code} 的模板描述超出网页长度限制`);
    }
    setNativeValue(findFieldByLabel(row, 'Quantità'), item.quantity);
    setNativeValue(findFieldByLabel(currentExpandedProductRow(), 'Prezzo netto'), item.netPrice);
    setNativeValue(findFieldByLabel(currentExpandedProductRow(), 'Descrizione', 'textarea'), text);
    await waitFor(() => {
      const currentRow = currentExpandedProductRow();
      return currentRow && findFieldByLabel(currentRow, 'Descrizione', 'textarea').value === text;
    }, `货号 ${item.code} 的模板描述写入`);
  }

  async function fillCurrentInvoice() {
    const state = loadState();
    const order = activeOrders(state)[state.orderIndex];
    if (!order) {
      saveState({ phase: 'idle', activeOrderKeys: [], customers: [], message: '完成' });
      return;
    }
    if (location.pathname !== '/invoices/new') {
      location.href = `${FIC_ORIGIN}/invoices/new`;
      return;
    }
    for (const item of order.items) {
      productTemplateFor(item);
      invoiceComposition(item);
    }
    await fillInvoiceCustomer(order.customer);
    await chooseReactOption(document, 'Lingua', 'Italiano');
    if (!exactText(document, 'Fatt. accompagnatoria').length) {
      unique(exactText(document, 'Opzioni avanzate'), 'Opzioni avanzate').click();
      await waitFor(
        () => exactText(document, 'Fatt. accompagnatoria').length,
        'Fatt. accompagnatoria',
        LONG_WAIT_TIMEOUT,
      );
    }
    await setCheckboxByText(document, 'Fatt. accompagnatoria', true);
    await chooseReactOption(document, 'Modello grafico fatt. accomp.', 'FT Accompagnatoria 1');
    setNativeValue(findFieldByLabel(document, 'Causale trasporto', 'textarea'), 'VENDITA');
    setNativeValue(
      findFieldByLabel(document, 'Oggetto interno (non visibile)'),
      invoiceInternalReference(order),
    );
    if (order.source !== 'pfs') {
      setNativeValue(findFieldByLabel(document, 'Annotazioni', 'textarea'), `#${order.orderNumber}`);
    }

    const initialRows = document.querySelectorAll('.IssuedDocumentListItem').length;
    if (initialRows !== 1) throw new Error(`新发票应有 1 条默认商品行，实际为 ${initialRows}`);
    for (let index = 0; index < order.items.length; index += 1) {
      await fillProductRow(order.items[index]);
      if (index < order.items.length - 1) {
        await addNextProductRow(index + 2);
      }
    }
    saveState({
      phase: 'waiting_before_finalize',
      message: '',
      error: null,
    });
  }

  async function finalizeCurrentInvoice() {
    const state = loadState();
    if (state.phase !== 'waiting_before_finalize') throw new Error('当前不在可 Finalizza 状态');
    const taskKey = activeOrders(state)[state.orderIndex]?.taskKey;
    if (!taskKey) throw new Error('没有找到当前订单');
    const button = unique(exactText(document, 'Finalizza'), 'Finalizza');
    const token = operationToken();
    setFinalizationSessionToken(token);
    saveState({
      phase: 'finalizing',
      finalizingTaskKey: taskKey,
      finalizingToken: token,
      message: '正在生成发票预览；请勿重复点击',
      error: null,
    });
    button.click();
    await finishFinalizedInvoice(taskKey, token);
  }

  async function openNextInvoiceForm() {
    if (location.pathname === '/invoices/new') {
      saveState({ phase: 'invoice_filling', message: '', error: null });
      await fillCurrentInvoice();
      return;
    }
    try {
      for (let step = 0; step < 3; step += 1) {
        if (location.pathname === '/invoices/new') break;
        const action = await waitFor(() => {
          const back = clickableText(document, 'Torna ai documenti');
          if (back) return { type: 'back', control: back };
          const create = clickableText(document, 'Nuova fattura', { ignoreLeadingPlus: true });
          if (create) return { type: 'create', control: create };
          return null;
        }, 'Torna ai documenti 或 Nuova fattura', LONG_WAIT_TIMEOUT);
        const beforeUrl = location.href;
        activateControl(action.control);
        if (action.type === 'back') {
          await waitFor(() => (
            location.pathname === '/invoices/new'
            || location.href !== beforeUrl
            || clickableText(document, 'Nuova fattura', { ignoreLeadingPlus: true })
          ), '返回发票列表', PAGE_WAIT_TIMEOUT);
        } else {
          await waitFor(
            () => location.pathname === '/invoices/new',
            '打开新发票页面',
            PAGE_WAIT_TIMEOUT,
          );
        }
      }
      if (location.pathname !== '/invoices/new') {
        throw new Error('页面按钮导航没有进入新发票页面');
      }
    } catch (error) {
      console.warn('[JESCO 发票助手] 下一张发票按钮导航失败，使用直达链接', error);
      saveState({
        phase: 'invoice_filling',
        message: '页面按钮未就绪，已使用兼容方式打开下一张发票',
        error: null,
      });
      location.href = `${FIC_ORIGIN}/invoices/new`;
      return;
    }
    saveState({ phase: 'invoice_filling', message: '', error: null });
    await fillCurrentInvoice();
  }

  async function continueAfterReview() {
    const state = loadState();
    if (state.phase !== 'waiting_invoice_review') throw new Error('当前不在发票预览核对状态');
    if (!invoicePreviewUrl() || (state.lastInvoiceUrl && location.href !== state.lastInvoiceUrl)) {
      throw new Error('请回到刚生成的发票预览页再继续下一单');
    }
    const runOrders = activeOrders(state);
    const current = runOrders[state.orderIndex];
    if (!current || current.taskStatus !== 'complete') {
      throw new Error('当前发票尚未确认保存成功');
    }
    const completed = completeCurrentInvoice(state);
    const nextIndex = state.orderIndex + 1;
    if (nextIndex >= runOrders.length) {
      saveState({
        ...completed,
        activeOrderKeys: [],
        customers: [],
        customerIndex: 0,
        orderIndex: 0,
        phase: 'idle',
        lastInvoiceUrl: null,
        finalizingTaskKey: null,
        finalizingToken: null,
        message: '完成',
      });
      return;
    }
    saveState({
      ...completed,
      phase: 'opening_next_invoice',
      orderIndex: nextIndex,
      lastInvoiceUrl: null,
      message: '正在打开下一张发票',
    });
    await openNextInvoiceForm();
  }

  async function startSecondStage() {
    if (location.hostname !== 'secure.fattureincloud.it') {
      throw new Error('请先打开 Fatture in Cloud 再开始开票');
    }
    const state = loadState();
    if (state.activeOrderKeys?.length) throw new Error('当前开票尚未完成');
    const selected = state.orders.filter((order) => (
      (state.selectedOrderKeys || []).includes(order.taskKey) && order.taskStatus === 'ready'
    ));
    if (!selected.length) throw new Error('请选择订单');
    for (const order of selected.filter((candidate) => candidate.source === 'pfs')) {
      if (!order.customer?.deliveryAddressCaptured) {
        throw new Error(`PFS订单 #${order.orderNumber} 来自旧版扫描，请在 PFS 页面重新扫描后再开票`);
      }
      shippingAddressValue(order.customer);
    }
    const activeOrderKeys = selected.map((order) => order.taskKey);
    const customers = buildCustomerList(selected);
    for (const order of selected) order.taskStatus = 'running';
    saveState({
      orders: state.orders,
      activeOrderKeys,
      customers,
      phase: 'checking_customers',
      customerIndex: 0,
      orderIndex: 0,
      lastInvoiceUrl: null,
      finalizingTaskKey: null,
      finalizingToken: null,
      error: null,
      message: '',
    });
    if (location.pathname !== '/clients') {
      location.href = `${FIC_ORIGIN}/clients`;
      return;
    }
    await checkCurrentCustomer();
  }

  function isUiHarnessPage() {
    return ['127.0.0.1', 'localhost'].includes(location.hostname)
      && location.pathname.endsWith('/tests/ui-harness.html');
  }

  function isAssistantPage() {
    return SUPPORTED_HOSTS.has(location.hostname) || isUiHarnessPage();
  }

  function assistantEnabled() {
    return GM_getValue(PANEL_ENABLED_KEY, true) !== false;
  }

  function destroyPanel() {
    document.getElementById(PANEL_ID)?.remove();
    panelRefs = null;
    reviewExpanded = false;
    reviewSearch = '';
    reviewUiOrderNumber = null;
    clearConfirmationVisible = false;
    endConfirmationVisible = false;
    if (resumeTimer !== null) {
      clearTimeout(resumeTimer);
      resumeTimer = null;
    }
  }

  function closeAssistant() {
    if (running) {
      saveState({ message: '当前步骤仍在执行，请稍后再关闭', error: null });
      return;
    }
    GM_setValue(PANEL_ENABLED_KEY, false);
    destroyPanel();
  }

  function panelStyles() {
    return `
      :host { all: initial; }
      .panel { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 356px;
        max-height:calc(100vh - 32px); display:flex; flex-direction:column; overflow:hidden;
        font: 13px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:#152033;
        background:#fff; border:1px solid #d7dee9; border-radius:13px; box-shadow:0 12px 34px rgba(22,34,58,.2); }
      .head { flex:0 0 auto; display:flex; align-items:center; justify-content:space-between; gap:10px;
        padding:8px 9px 8px 14px; background:#132f4c; color:#fff; font-weight:700; letter-spacing:.01em; }
      .head-title { min-width:0; }
      button.close-assistant { width:28px; height:28px; padding:0; border-radius:6px; background:transparent;
        color:#fff; font-size:20px; line-height:1; font-weight:400; }
      button.close-assistant:hover { background:rgba(255,255,255,.14); }
      .body { min-height:0; padding:12px; overflow-y:auto; overscroll-behavior:contain; scrollbar-gutter:stable; }
      .status { display:none; margin-bottom:9px; padding:8px 10px; background:#f2f5f9; border-radius:8px;
        white-space:pre-wrap; max-height:100px; overflow:auto; }
      .status.show { display:block; }
      .status.error { background:#fff0f0; color:#a12626; }
      .review { display:grid; gap:7px; }
      .review-title-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .review-title { font-weight:700; }
      .review-toggle { padding:5px 8px; background:#eef2f7; color:#25344d; font-size:12px; }
      .review-search { box-sizing:border-box; width:100%; height:34px; padding:6px 9px;
        border:1px solid #cfd7e4; border-radius:7px; color:#172033; background:#fff; }
      .review-list { display:grid; gap:7px; }
      .review-list[hidden] { display:none; }
      .review-empty { padding:8px; color:#657086; text-align:center; background:#f7f9fc; border-radius:7px; }
      .line { display:grid; grid-template-columns:1fr auto; gap:8px; align-items:center; padding:8px; border:1px solid #e2e7ef; border-radius:8px; }
      .line-main { min-width:0; }
      .line-name { font-weight:650; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .task { min-width:0; display:grid; grid-template-columns:18px auto minmax(0,1fr) auto; gap:8px;
        align-items:center; padding:9px 8px; border:1px solid #e2e7ef; border-radius:8px; }
      .task.selected { background:#f0f6ff; border-color:#cfe0f7; }
      .task.current { background:#fff8e8; border-color:#ecd79f; box-shadow:inset 3px 0 #d6a62e; }
      .task.complete { background:#f2f8f4; border-color:#d5e6da; color:#50635a; }
      .task input { width:16px; height:16px; margin:0; accent-color:#1677c8; }
      .task.complete input { accent-color:#2f8f5b; }
      .badge { min-width:25px; padding:2px 5px; border-radius:5px; background:#e8eef6; color:#244361;
        text-align:center; font-size:11px; font-weight:750; }
      .task-copy { min-width:0; display:flex; gap:6px; align-items:baseline; }
      .order-number { flex:0 0 auto; font-weight:750; }
      .customer-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .task-state { border:0; padding:3px 5px; background:transparent; color:#9a6200; font-size:11px; font-weight:700; }
      .task-state.current { color:#8a5a00; }
      .task-state.complete { color:#2f6b45; }
      .task-state.blocked { color:#a12626; }
      .counter { display:flex; align-items:center; gap:4px; }
      .counter button { width:26px; height:26px; padding:0; }
      .counter input { width:42px; height:24px; text-align:center; border:1px solid #cfd7e4; border-radius:6px; }
      .actions { display:grid; gap:7px; margin-bottom:9px; }
      .footer { display:flex; gap:7px; align-items:center; margin-top:10px; }
      button { border:0; border-radius:7px; padding:7px 10px; cursor:pointer; background:#1677c8; color:#fff; font-weight:600; }
      button.primary { width:100%; min-height:38px; }
      button.secondary { background:#eef2f7; color:#25344d; }
      button.quiet { padding:6px 4px; background:transparent; color:#4c6178; font-weight:500; }
      button.tiny { padding:5px 4px; font-size:11px; }
      button.clear-trigger, button.end-trigger, .clear-prompt { margin-left:auto; }
      button.confirm { color:#a12626; }
      .clear-prompt { color:#657086; font-size:11px; }
      button:disabled { opacity:.45; cursor:not-allowed; }
    `;
  }

  function createPanel() {
    if (!assistantEnabled()) return;
    if (document.getElementById(PANEL_ID)) return;
    const host = document.createElement('div');
    host.id = PANEL_ID;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${panelStyles()}</style><div class="panel"><div class="head"><span class="head-title">发票助手 ${SCRIPT_VERSION}</span><button class="close-assistant" type="button" title="关闭助手（不清除批次）" aria-label="关闭发票助手">×</button></div><div class="body"><div class="status"></div><div class="actions"></div><div class="review"></div><div class="footer"></div></div></div>`;
    document.documentElement.appendChild(host);
    panelRefs = {
      status: shadow.querySelector('.status'),
      review: shadow.querySelector('.review'),
      actions: shadow.querySelector('.actions'),
      footer: shadow.querySelector('.footer'),
    };
    shadow.querySelector('.close-assistant').addEventListener('click', closeAssistant);
  }

  function actionButton(label, handler, style = '', container = panelRefs.actions) {
    const button = document.createElement('button');
    button.textContent = label;
    if (style) button.className = style;
    button.addEventListener('click', async () => {
      if (running) return;
      running = true;
      button.disabled = true;
      try {
        await handler();
      } catch (error) {
        fail(error);
      } finally {
        running = false;
        button.disabled = false;
      }
    });
    container.appendChild(button);
  }

  function renderQuantityReview(state) {
    const order = state.orders.find((candidate) => candidate.taskKey === state.reviewOrderKey);
    if (!order) return;
    if (reviewUiOrderNumber !== order.orderNumber) {
      reviewUiOrderNumber = order.orderNumber;
      reviewExpanded = false;
      reviewSearch = '';
    }

    const titleRow = document.createElement('div');
    titleRow.className = 'review-title-row';
    const title = document.createElement('div');
    title.className = 'review-title';
    title.textContent = `#${order.orderNumber}`;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'review-toggle';
    titleRow.append(title, toggle);

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'review-search';
    search.placeholder = '货号 / 颜色';
    search.value = reviewSearch;

    const list = document.createElement('div');
    list.className = 'review-list';
    panelRefs.review.append(titleRow, search, list);

    const paintLines = () => {
      const query = reviewSearch.trim().toLocaleLowerCase();
      const visibleLines = order.rawItems
        .map((line, lineIndex) => ({ line, lineIndex }))
        .filter(({ line }) => !query || `${line.rawCode} ${line.color || ''}`.toLocaleLowerCase().includes(query));
      const showList = reviewExpanded || Boolean(query);
      toggle.textContent = query ? '清除' : reviewExpanded ? '收起' : '展开';
      list.hidden = !showList;
      list.textContent = '';
      if (!showList) return;
      if (!visibleLines.length) {
        const empty = document.createElement('div');
        empty.className = 'review-empty';
        empty.textContent = '无结果';
        list.appendChild(empty);
        return;
      }
      visibleLines.forEach(({ line, lineIndex }) => {
        const row = document.createElement('div');
        row.className = 'line';
        row.innerHTML = `<div class="line-main"><div class="line-name"></div></div><div class="counter"><button class="minus" type="button">−</button><input type="number" min="0"><button class="plus" type="button">+</button></div>`;
        row.querySelector('.line-name').textContent = `${line.rawCode}｜${line.color || '未标颜色'}`;
        const input = row.querySelector('input');
        input.max = String(line.orderedQuantity);
        input.value = String(line.adjustedQuantity);
        row.querySelector('.minus').addEventListener('click', () => {
          updateReviewedQuantity(order.taskKey, lineIndex, Number(input.value) - 1);
        });
        row.querySelector('.plus').addEventListener('click', () => {
          updateReviewedQuantity(order.taskKey, lineIndex, Number(input.value) + 1);
        });
        input.addEventListener('change', () => {
          updateReviewedQuantity(order.taskKey, lineIndex, input.value);
        });
        list.appendChild(row);
      });
    };

    toggle.addEventListener('click', () => {
      if (reviewSearch.trim()) {
        reviewSearch = '';
        search.value = '';
        reviewExpanded = false;
      } else {
        reviewExpanded = !reviewExpanded;
      }
      paintLines();
    });
    search.addEventListener('input', () => {
      reviewSearch = search.value;
      paintLines();
    });
    paintLines();
  }

  function setOrderSelected(taskKey, selected) {
    const state = loadState();
    if (state.activeOrderKeys?.length) return;
    const keys = new Set(state.selectedOrderKeys || []);
    if (selected) keys.add(taskKey);
    else keys.delete(taskKey);
    saveState({ selectedOrderKeys: [...keys], error: null, message: '' });
  }

  function openQuantityReview(taskKey) {
    const state = loadState();
    const order = state.orders.find((candidate) => candidate.taskKey === taskKey);
    if (!order || order.taskStatus !== 'needs_quantity') return;
    const pendingKeys = state.orders
      .filter((candidate) => candidate.taskStatus === 'needs_quantity')
      .map((candidate) => candidate.taskKey);
    saveState({
      phase: 'quantity_review',
      reviewOrderKey: taskKey,
      quantityReviewQueue: [taskKey, ...pendingKeys.filter((key) => key !== taskKey)],
      error: null,
      message: '',
    });
  }

  function clearCompletedOrders() {
    const state = loadState();
    if (state.activeOrderKeys?.length) return;
    const orders = state.orders.filter((order) => order.taskStatus !== 'complete');
    const remaining = new Set(orders.map((order) => order.taskKey));
    saveState({
      orders,
      selectedOrderKeys: (state.selectedOrderKeys || []).filter((key) => remaining.has(key)),
      message: '',
      error: null,
    });
  }

  function endActiveBatch() {
    const state = loadState();
    const activeKeys = new Set(state.activeOrderKeys || []);
    const currentTaskKey = activeOrders(state)[state.orderIndex]?.taskKey || null;
    const invoiceAlreadyCreated = state.phase === 'waiting_invoice_review';
    const invoiceResultUnknown = state.phase === 'finalizing';
    const orders = state.orders.map((order) => {
      if (!activeKeys.has(order.taskKey) || order.taskStatus === 'complete') return order;
      if (order.taskKey === currentTaskKey && invoiceAlreadyCreated) {
        return { ...order, taskStatus: 'complete' };
      }
      if (order.taskKey === currentTaskKey && invoiceResultUnknown) {
        return {
          ...order,
          taskStatus: 'blocked',
          reviewErrors: [...new Set([
            ...(order.reviewErrors || []),
            '发票生成结果待人工确认',
          ])],
        };
      }
      return {
        ...order,
        taskStatus: order.reviewErrors?.length
          ? 'blocked'
          : order.source === 'fashionpo' && !order.quantityConfirmed ? 'needs_quantity' : 'ready',
      };
    });
    const readyKeys = new Set(orders
      .filter((order) => order.taskStatus === 'ready')
      .map((order) => order.taskKey));
    clearFinalizationSessionToken();
    endConfirmationVisible = false;
    saveState({
      orders,
      selectedOrderKeys: (state.selectedOrderKeys || []).filter((key) => readyKeys.has(key)),
      activeOrderKeys: [],
      customers: [],
      customerIndex: 0,
      orderIndex: 0,
      reviewOrderKey: null,
      phase: 'idle',
      pendingCountrySource: null,
      pendingCountryInitialOption: null,
      lastInvoiceUrl: null,
      finalizingTaskKey: null,
      finalizingToken: null,
      message: invoiceAlreadyCreated
        ? '已结束本次；当前已生成发票保留为完成'
        : invoiceResultUnknown ? '' : '已结束本次；未完成订单仍保留',
      error: invoiceResultUnknown
        ? '当前发票生成结果待确认，请先在 Fatture in Cloud 检查'
        : null,
    });
  }

  function renderTaskPool(state) {
    const selected = new Set(state.selectedOrderKeys || []);
    const locked = Boolean(state.activeOrderKeys?.length);
    const currentTaskKey = currentInvoiceTaskKey(state);
    for (const order of state.orders) {
      const row = document.createElement('div');
      const isComplete = order.taskStatus === 'complete';
      const isCurrent = !isComplete && order.taskKey === currentTaskKey;
      const rowClasses = ['task'];
      if (!locked && selected.has(order.taskKey)) rowClasses.push('selected');
      if (isCurrent) rowClasses.push('current');
      if (isComplete) rowClasses.push('complete');
      row.className = rowClasses.join(' ');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = isComplete || selected.has(order.taskKey);
      checkbox.disabled = locked || order.taskStatus !== 'ready';
      checkbox.addEventListener('change', () => setOrderSelected(order.taskKey, checkbox.checked));
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = order.source === 'pfs' ? 'PFS' : 'FP';
      const copy = document.createElement('div');
      copy.className = 'task-copy';
      const number = document.createElement('span');
      number.className = 'order-number';
      number.textContent = /^PO#/i.test(clean(order.orderNumber))
        ? clean(order.orderNumber)
        : `#${order.orderNumber}`;
      const name = document.createElement('span');
      name.className = 'customer-name';
      name.textContent = order.customer?.name || '';
      copy.append(number, name);
      row.append(checkbox, badge, copy);
      const statusLabels = {
        current: '开票中',
        complete: '✓ 已完成',
        needs_quantity: '待核对',
        blocked: '需处理',
      };
      const visualStatus = isCurrent ? 'current' : order.taskStatus;
      if (statusLabels[visualStatus]) {
        const status = document.createElement(order.taskStatus === 'needs_quantity' ? 'button' : 'span');
        status.className = `task-state ${visualStatus}`;
        status.textContent = statusLabels[visualStatus];
        if (order.taskStatus === 'needs_quantity') {
          status.type = 'button';
          status.addEventListener('click', () => openQuantityReview(order.taskKey));
        }
        row.appendChild(status);
      }
      panelRefs.review.appendChild(row);
    }
  }

  function renderPanel(state = loadState()) {
    if (!assistantEnabled()) {
      if (panelRefs) destroyPanel();
      return;
    }
    if (!panelRefs) return;
    const notice = state.error || state.message || '';
    panelRefs.status.textContent = notice;
    panelRefs.status.className = `status${notice ? ' show' : ''}${state.error ? ' error' : ''}`;
    panelRefs.actions.textContent = '';
    panelRefs.review.textContent = '';
    panelRefs.footer.textContent = '';

    if (state.phase === 'quantity_review') {
      renderQuantityReview(state);
      actionButton('确认件数', confirmCurrentOrderQuantities, 'primary');
      actionButton('跳过本单', skipCurrentOrderQuantities, 'quiet', panelRefs.footer);
    } else {
      renderTaskPool(state);
      const readySelected = state.orders.filter((order) => (
        (state.selectedOrderKeys || []).includes(order.taskKey) && order.taskStatus === 'ready'
      )).length;
      if (location.hostname === 'secure.fattureincloud.it'
        && !state.activeOrderKeys?.length && state.phase === 'idle' && readySelected) {
        actionButton(`开始开票 ${readySelected}`, startSecondStage, 'primary');
      }
      if (location.hostname === 'secure.fattureincloud.it') {
        if (state.phase === 'checking_customers') actionButton('检查客户', checkCurrentCustomer, 'primary');
        if (state.phase === 'waiting_manual_country') actionButton('继续', continueAfterManualCountry, 'primary');
        if (state.phase === 'waiting_manual_customer_save') {
          actionButton('已保存，继续', async () => {
            saveState({ phase: 'checking_customers', customerIndex: state.customerIndex + 1, message: '' });
            await checkCurrentCustomer();
          }, 'primary');
        }
        if (state.phase === 'invoice_filling') actionButton('填写发票', fillCurrentInvoice, 'primary');
        if (state.phase === 'waiting_before_finalize') actionButton('生成预览', finalizeCurrentInvoice, 'primary');
        if (state.phase === 'waiting_invoice_review'
          && invoicePreviewUrl()
          && (!state.lastInvoiceUrl || location.href === state.lastInvoiceUrl)) {
          actionButton('下一单', continueAfterReview, 'primary');
        }
      }
    }

    const scanCanStart = state.phase === 'idle' || (state.phase === 'scanning' && Boolean(state.error));
    if (!state.activeOrderKeys?.length && scanCanStart) {
      if (location.hostname === 'www.fashionpo.com') {
        actionButton('扫描 FashionPO', scanOrdersFromCurrentPage, 'secondary', panelRefs.footer);
      } else if (location.hostname === 'wholesaler.parisfashionshops.com') {
        actionButton('扫描 PFS', scanPfsOrders, 'secondary', panelRefs.footer);
      }
    }
    if (state.diagnostics?.length || state.error) {
      const hasDiagnosticError = (state.diagnostics || []).some((item) => item.severity !== 'warning');
      actionButton(state.error || hasDiagnosticError ? '复制错误' : '复制提示', () => GM_setClipboard(JSON.stringify({
        scriptVersion: SCRIPT_VERSION,
        pageUrl: location.href,
        browser: navigator.userAgent,
        error: state.error,
        diagnostics: state.diagnostics,
      }, null, 2)), 'quiet', panelRefs.footer);
    }
    if (state.activeOrderKeys?.length) {
      if (endConfirmationVisible) {
        const prompt = document.createElement('span');
        prompt.className = 'clear-prompt';
        prompt.textContent = state.phase === 'waiting_invoice_review'
          ? '当前发票已生成，结束？'
          : state.phase === 'finalizing' ? '生成结果待确认，结束？' : '结束本次？';
        panelRefs.footer.appendChild(prompt);
        actionButton('取消', () => {
          endConfirmationVisible = false;
          renderPanel(loadState());
        }, 'quiet tiny', panelRefs.footer);
        actionButton('确认', endActiveBatch, 'quiet tiny confirm', panelRefs.footer);
      } else {
        actionButton('结束本次', () => {
          endConfirmationVisible = true;
          renderPanel(loadState());
        }, 'quiet tiny end-trigger', panelRefs.footer);
      }
    }
    if (!state.activeOrderKeys?.length && state.orders.some((order) => order.taskStatus === 'complete')) {
      actionButton('清理已完成', clearCompletedOrders, 'quiet', panelRefs.footer);
    }
    if (!state.activeOrderKeys?.length && state.orders.length) {
      if (clearConfirmationVisible) {
        const prompt = document.createElement('span');
        prompt.className = 'clear-prompt';
        prompt.textContent = '清除全部？';
        panelRefs.footer.appendChild(prompt);
        actionButton('取消', () => {
          clearConfirmationVisible = false;
          renderPanel(loadState());
        }, 'quiet tiny', panelRefs.footer);
        actionButton('确认', () => {
          clearConfirmationVisible = false;
          resetState();
        }, 'quiet tiny confirm', panelRefs.footer);
      } else {
        actionButton('清除', () => {
          clearConfirmationVisible = true;
          renderPanel(loadState());
        }, 'quiet tiny clear-trigger', panelRefs.footer);
      }
    }
  }

  function scheduleAutomaticResume() {
    if (resumeTimer !== null) clearTimeout(resumeTimer);
    resumeTimer = null;
    if (!assistantEnabled() || location.hostname !== 'secure.fattureincloud.it') return;
    const state = loadState();
    let handler = null;
    let context = '';
    if (state.phase === 'checking_customers' && location.pathname === '/clients') {
      handler = checkCurrentCustomer;
      context = '客户检查';
    } else if (state.phase === 'invoice_filling' && location.pathname === '/invoices/new') {
      handler = fillCurrentInvoice;
      context = '发票填写';
    } else if (state.phase === 'opening_next_invoice') {
      handler = openNextInvoiceForm;
      context = '打开下一张发票';
    } else if (
      state.phase === 'finalizing'
      && location.pathname !== '/invoices/new'
      && state.finalizingTaskKey
      && state.finalizingToken
      && finalizationSessionToken() === state.finalizingToken
    ) {
      handler = () => finishFinalizedInvoice(state.finalizingTaskKey, state.finalizingToken);
      context = '确认发票预览';
    }
    if (!handler) return;
    resumeTimer = setTimeout(async () => {
      resumeTimer = null;
      if (!assistantEnabled()) return;
      if (running) {
        scheduleAutomaticResume();
        return;
      }
      running = true;
      try {
        await handler();
      } catch (error) {
        fail(error, context);
      } finally {
        running = false;
      }
    }, 1000);
  }

  function activateAssistant() {
    if (!isAssistantPage() || !assistantEnabled()) return;
    createPanel();
    renderPanel();
    const state = loadState();
    if (location.hostname === 'secure.fattureincloud.it' && state.phase === 'waiting_invoice_review') {
      const current = activeOrders(state)[state.orderIndex];
      if (current && current.taskStatus !== 'complete') {
        saveState({ ...completeCurrentInvoice(state), error: null });
      }
    }
    scheduleAutomaticResume();
  }

  function installValueListeners() {
    if (valueListenersInstalled || typeof GM_addValueChangeListener !== 'function') return;
    valueListenersInstalled = true;
    GM_addValueChangeListener(STORAGE_KEY, (_name, _oldValue, newValue, remote) => {
      if (remote && newValue && assistantEnabled()) {
        renderPanel({ ...DEFAULT_STATE, ...newValue });
      }
    });
    GM_addValueChangeListener(PANEL_ENABLED_KEY, (_name, _oldValue, newValue) => {
      if (newValue === false) {
        destroyPanel();
      } else {
        activateAssistant();
      }
    });
  }

  function registerMenuCommand() {
    if (menuCommandRegistered || typeof GM_registerMenuCommand !== 'function') return;
    menuCommandRegistered = true;
    GM_registerMenuCommand('打开 JESCO 发票助手', () => {
      GM_setValue(PANEL_ENABLED_KEY, true);
      if (isAssistantPage()) activateAssistant();
    });
    GM_registerMenuCommand('重置扫描状态', resetInterruptedScan);
  }

  function init() {
    registerMenuCommand();
    if (!isAssistantPage()) return;
    installValueListeners();
    if (assistantEnabled()) {
      activateAssistant();
    }
  }

  init();
})();
