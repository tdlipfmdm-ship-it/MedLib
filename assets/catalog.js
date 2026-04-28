(function () {
  "use strict";

  var DATA_FILES = {
    full: "assets/data/library.json",
    index: "assets/data/library.index.json",
  };
  var CACHE_KEY_PREFIX = "medlib_library_cache_v4:";
  var CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  var FETCH_TIMEOUT_MS = 12000;
  var inflightLibraryPromiseByScope = {};
  var SITE_CONFIG = window.MEDLIB_CONFIG || {};
  var PDF_READER_ENABLED = SITE_CONFIG.pdfReaderEnabled !== false;

  var STR = {
    authorUnknown: "Awtor g\u00f6rkezilmedik",
    allLanguages: "\u00c4hli diller",
    allCategories: "\u00c4hli lukman\u00e7ylyk ugurlary",
    resultLabel: "Netije",
    booksWord: "kitap",
    updatedFallback: "\u2014",
    loadingBooks: "Kitaplar \u00fduklen\u00fd\u00e4r...",
    noBooks: "H\u00e4zirlik\u00e7e kitap tapylmady.",
    bookNotFoundTitle: "Kitap tapylmady",
    bookNotFoundText: "Baglany\u015fyk \u00fda-da ID n\u00e4dogry.",
    backToBooks: "Kitap sanawyna dolan",
    pdfNotFound: "PDF tapylmady",
    pdfUnavailable:
      clean(SITE_CONFIG.pdfUnavailableText) ||
      "PDF fa\u00fdllary GitHub wersi\u00fdasyna go\u015fulmady.",
    summaryTitle: "Gysga\u00e7a mazmun",
    loadErrorTitle: "Maglumat \u00fduklenmedi",
    loadErrorText:
      "`assets/data/library.index.json` \u00fda-da `assets/data/library.json` fa\u00fdlyny barla\u0148.",
    siteName: "Lukman\u00e7ylyk sanly kitaphanasy",
  };

  var HOME_CATEGORY_LIMIT = 69;
  var HOME_CATEGORY_ICON_BASE = "assets/icons/categories/generated/";
  var HOME_CATEGORY_ICON_FALLBACK = "assets/icons/categories/file-medical.svg";

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>\"']/g, function (m) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[m];
    });
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeObject(value) {
    return value && typeof value === "object" ? value : {};
  }

  function getPathname() {
    return String(location.pathname || "").replace(/\\/g, "/");
  }

  function getPageFile() {
    var m = getPathname().match(/([^/?#]+)$/);
    return (m ? m[1] : "").toLowerCase();
  }

  function isLegacySubPage() {
    return /(?:^|\/)(books|categories|languages)\//i.test(getPathname());
  }

  function rootPrefix() {
    return isLegacySubPage() ? "../" : "";
  }

  function toRoot(path) {
    return rootPrefix() + String(path || "").replace(/^\.\//, "");
  }

  function query(name) {
    try {
      return new URLSearchParams(location.search || "").get(name);
    } catch (_e) {
      return null;
    }
  }

  function formatCount(count) {
    return String(Number(count) || 0) + " " + STR.booksWord;
  }

  function getDataScopeForPage(page) {
    return page === "book.html" ? "full" : "index";
  }

  function getDataFileForScope(scope) {
    return scope === "full" ? DATA_FILES.full : DATA_FILES.index;
  }

  function getCacheKey(scope) {
    return CACHE_KEY_PREFIX + (scope === "full" ? "full" : "index");
  }

  function withTimeout(promiseFactory, timeoutMs) {
    var ms = Number(timeoutMs) || FETCH_TIMEOUT_MS;
    if (typeof AbortController === "undefined") {
      return promiseFactory(null);
    }

    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, ms);

    return promiseFactory(controller.signal).finally(function () {
      clearTimeout(timer);
    });
  }

  function normalizeLibraryData(raw) {
    var data = safeObject(raw);
    var books = safeArray(data.books).filter(function (item) {
      return item && typeof item === "object";
    });
    var categories = safeArray(data.categories).filter(function (item) {
      return item && typeof item === "object";
    });
    var languages = safeArray(data.languages).filter(function (item) {
      return item && typeof item === "object";
    });
    var stats = safeObject(data.stats);
    var updatedAt = clean(data.updatedAt || stats.updatedAt || "");

    return {
      updatedAt: updatedAt,
      stats: {
        books: Number(stats.books) || books.length,
        categories: Number(stats.categories) || categories.length,
        languages: Number(stats.languages) || languages.length,
      },
      books: books,
      categories: categories,
      languages: languages,
    };
  }

  function linkToBook(id) {
    return "book.html?id=" + encodeURIComponent(id);
  }

  function linkToBooksByCategory(id) {
    return "books.html?cat=" + encodeURIComponent(id);
  }

  function linkToBooksByLanguage(id) {
    return "books.html?lang=" + encodeURIComponent(id);
  }

  function categoryIconPath(category) {
    var cat = safeObject(category);
    var catId = clean(cat.id);
    if (catId) {
      return toRoot(HOME_CATEGORY_ICON_BASE + catId + ".svg");
    }
    return toRoot(HOME_CATEGORY_ICON_FALLBACK);
  }

  function renderHomeCategories(data) {
    var root = document.getElementById("homeCategoriesGrid");
    if (!root) return;

    var list = safeArray(data.categories)
      .slice()
      .sort(function (a, b) {
        return (Number(b.count) || 0) - (Number(a.count) || 0);
      })
      .slice(0, HOME_CATEGORY_LIMIT);

    if (!list.length) {
      root.innerHTML = "";
      root.removeAttribute("aria-busy");
      return;
    }

    root.setAttribute("aria-busy", "true");

    var html = "";
    list.forEach(function (cat) {
      var catId = clean(cat.id);
      var catName = clean(cat.name || catId);
      var count = Number(cat.count) || 0;
      var href = toRoot(linkToBooksByCategory(catId));
      var icon = categoryIconPath(cat);

      html +=
        "<a class='home-cat-card' href='" +
        escapeHtml(href) +
        "'>" +
        "<span class='home-cat-icon' aria-hidden='true'><img src='" +
        escapeHtml(icon) +
        "' alt='' loading='lazy'></span>" +
        "<span class='home-cat-name'>" +
        escapeHtml(catName) +
        "</span>" +
        "<span class='home-cat-count'>" +
        escapeHtml(formatCount(count)) +
        "</span>" +
        "</a>";
    });

    root.innerHTML = html;
    root.removeAttribute("aria-busy");
  }

  function buildCard(book) {
    var cats = safeArray(book.categoryIds);
    var catNames = safeArray(book.categoryNames);
    var chips = "";

    cats.forEach(function (catId, index) {
      var catName = clean(catNames[index] || catId);
      chips +=
        "<a class='chip' href='" +
        escapeHtml(toRoot(linkToBooksByCategory(catId))) +
        "'>" +
        escapeHtml(catName) +
        "</a>";
    });

    var detailHref = toRoot(linkToBook(book.id));
    var coverThumb = clean(book.cover && book.cover.thumb ? toRoot(book.cover.thumb) : "");
    var title = clean(book.title || "Kitap");
    var author = clean(book.author || STR.authorUnknown);
    var search = clean(book.searchText || [title, author].join(" "));
    var dataLang = clean(book.langId || "");
    var dataCats = cats.join("|");
    var yearNum = Number(clean(book.year || book.yearText || 0)) || 0;

    return (
      "<article class='card' data-book-id='" +
      escapeHtml(clean(book.id || "")) +
      "' data-search='" +
      escapeHtml(search) +
      "' data-lang='" +
      escapeHtml(dataLang) +
      "' data-cats='" +
      escapeHtml(dataCats) +
      "' data-title='" +
      escapeHtml(title) +
      "' data-year='" +
      escapeHtml(String(yearNum)) +
      "'>" +
      "<a class='cover' href='" +
      escapeHtml(detailHref) +
      "'>" +
      "<img src='" +
      escapeHtml(coverThumb) +
      "' alt='" +
      escapeHtml(title) +
      "' loading='lazy'>" +
      "</a>" +
      "<div class='cb'>" +
      "<h3><a href='" +
      escapeHtml(detailHref) +
      "'>" +
      escapeHtml(title) +
      "</a></h3>" +
      "<p>" +
      escapeHtml(author) +
      "</p>" +
      "<div class='meta'><span>" +
      escapeHtml(clean(book.langCode || "")) +
      "</span><span>" +
      escapeHtml(clean(book.yearText || "")) +
      "</span></div>" +
      "<div class='chips'>" +
      chips +
      "</div>" +
      "</div>" +
      "</article>"
    );
  }

  function buildCardsIncremental(books, grid, onDone) {
    var list = safeArray(books);
    var total = list.length;
    var cursor = 0;
    var chunk = 72;

    grid.innerHTML = "";
    grid.setAttribute("aria-busy", "true");

    if (!total) {
      grid.removeAttribute("aria-busy");
      if (typeof onDone === "function") onDone();
      return;
    }

    var renderChunk = function () {
      var end = Math.min(cursor + chunk, total);
      var html = "";
      for (var i = cursor; i < end; i++) {
        html += buildCard(list[i]);
      }
      if (html) {
        grid.insertAdjacentHTML("beforeend", html);
      }
      cursor = end;

      if (cursor < total) {
        requestAnimationFrame(renderChunk);
      } else {
        grid.removeAttribute("aria-busy");
        if (typeof onDone === "function") onDone();
      }
    };

    requestAnimationFrame(renderChunk);
  }

  function renderStats(stats) {
    var root = document.getElementById("statsGrid");
    if (!root) return;

    var books = Number(stats.books) || 0;
    var categories = Number(stats.categories) || 0;
    var languages = Number(stats.languages) || 0;
    var updated = clean(stats.updatedAt || "");

    root.innerHTML =
      "<div class='st'><b>" +
      books +
      "</b><span>Kitap</span></div>" +
      "<div class='st'><b>" +
      categories +
      "</b><span>Lukman\u00e7ylyk ugry</span></div>" +
      "<div class='st'><b>" +
      languages +
      "</b><span>Dil</span></div>" +
      "<div class='st'><b>" +
      escapeHtml(updated || STR.updatedFallback) +
      "</b><span>T\u00e4zelenme</span></div>";
  }

  function setUpdatedAtLabel(value) {
    var text = clean(value || "") || STR.updatedFallback;
    document.querySelectorAll("[data-updated-at]").forEach(function (node) {
      node.textContent = text;
    });
  }

  function renderIndex(data, done) {
    renderStats({
      books: data.stats.books,
      categories: data.stats.categories,
      languages: data.stats.languages,
      updatedAt: data.updatedAt,
    });
    renderHomeCategories(data);

    var grid = document.getElementById("featuredGrid");
    if (!grid) {
      if (typeof done === "function") done();
      return;
    }

    var featured = safeArray(data.books).slice(0, 15);
    buildCardsIncremental(featured, grid, done);

    var allBooksLink = document.getElementById("allBooksLink");
    if (allBooksLink) allBooksLink.setAttribute("href", toRoot("books.html"));
  }

  function renderBooksFilters(data) {
    var langSelect = document.getElementById("l");
    var catSelect = document.getElementById("c");

    if (langSelect) {
      var langHtml = "<option value=''>" + STR.allLanguages + "</option>";
      safeArray(data.languages).forEach(function (lang) {
        langHtml +=
          "<option value='" +
          escapeHtml(clean(lang.id)) +
          "'>" +
          escapeHtml(clean(lang.name)) +
          "</option>";
      });
      langSelect.innerHTML = langHtml;
    }

    if (catSelect) {
      var catHtml = "<option value=''>" + STR.allCategories + "</option>";
      safeArray(data.categories).forEach(function (cat) {
        catHtml +=
          "<option value='" +
          escapeHtml(clean(cat.id)) +
          "'>" +
          escapeHtml(clean(cat.name)) +
          "</option>";
      });
      catSelect.innerHTML = catHtml;
    }
  }

  function renderBooksPage(data, done) {
    renderBooksFilters(data);

    var grid = document.getElementById("grid");
    var res = document.getElementById("res");
    var books = safeArray(data.books);
    var total = books.length;

    if (res) {
      res.textContent = STR.loadingBooks;
    }

    if (!grid) {
      if (res) {
        res.textContent = STR.resultLabel + ": " + total + " " + STR.booksWord;
      }
      if (typeof done === "function") done();
      return;
    }

    if (!total) {
      grid.innerHTML =
        "<section class='panel'><h2>" +
        STR.noBooks +
        "</h2></section>";
      if (res) {
        res.textContent = STR.resultLabel + ": 0 " + STR.booksWord;
      }
      if (typeof done === "function") done();
      return;
    }

    buildCardsIncremental(books, grid, function () {
      if (res) {
        res.textContent =
          STR.resultLabel + ": " + Number(total) + " / " + Number(total) + " " + STR.booksWord;
      }
      if (typeof done === "function") done();
    });
  }

  function renderFacetList(data, type, done) {
    var grid = document.getElementById("facetGrid");
    if (!grid) {
      if (typeof done === "function") done();
      return;
    }

    var list = type === "languages" ? safeArray(data.languages) : safeArray(data.categories);
    var html = "";

    list.forEach(function (item) {
      var href =
        type === "languages"
          ? linkToBooksByLanguage(item.id)
          : linkToBooksByCategory(item.id);
      var isCategory = type === "categories";
      var iconHtml = "";
      if (isCategory) {
        iconHtml =
          "<span class='facet-icon' aria-hidden='true'><img src='" +
          escapeHtml(categoryIconPath(item)) +
          "' alt='' loading='lazy'></span>";
      }

      html +=
        "<a class='panel facet-card " +
        (isCategory ? "facet-card-category" : "facet-card-language") +
        "' href='" +
        escapeHtml(toRoot(href)) +
        "'>" +
        iconHtml +
        "<div class='facet-card-body'>" +
        "<h2>" +
        escapeHtml(clean(item.name)) +
        "</h2>" +
        "<p>" +
        escapeHtml(formatCount(item.count)) +
        "</p>" +
        "</div>" +
        "</a>";
    });

    grid.innerHTML = html;
    if (typeof done === "function") done();
  }

  function tableRow(label, value) {
    return (
      "<tr><th>" +
      escapeHtml(label) +
      "</th><td>" +
      escapeHtml(clean(value || STR.updatedFallback)) +
      "</td></tr>"
    );
  }

  function renderBookPage(data, done) {
    var id = clean(query("id"));
    var book = safeArray(data.books).find(function (item) {
      return clean(item.id) === id;
    });

    var host = document.getElementById("bookDetail");
    if (!host) {
      if (typeof done === "function") done();
      return;
    }

    if (!book) {
      host.innerHTML =
        "<section class='panel'><h2>" +
        STR.bookNotFoundTitle +
        "</h2><p>" +
        STR.bookNotFoundText +
        "</p><p><a href='" +
        escapeHtml(toRoot("books.html")) +
        "'>" +
        STR.backToBooks +
        "</a></p></section>";
      if (typeof done === "function") done();
      return;
    }

    var heroTitle = document.getElementById("pageTitle");
    var heroLead = document.getElementById("pageLead");
    if (heroTitle) heroTitle.textContent = clean(book.title || "Kitap");
    if (heroLead) heroLead.textContent = clean(book.author || STR.authorUnknown);
    document.title = clean(book.title || "Kitap") + " | " + STR.siteName;

    var chips = "";
    safeArray(book.categoryIds).forEach(function (catId, idx) {
      chips +=
        "<a class='chip' href='" +
        escapeHtml(toRoot(linkToBooksByCategory(catId))) +
        "'>" +
        escapeHtml(clean(safeArray(book.categoryNames)[idx] || catId)) +
        "</a>";
    });

    var readerLink = "";
    if (PDF_READER_ENABLED && book.links && clean(book.links.reader)) {
      readerLink =
        "<div class='reader-actions'><a class='reader-link' href='" +
        escapeHtml(toRoot(book.links.reader)) +
        "'>PDF-ni oka</a></div>";
    } else {
      readerLink =
        "<div class='reader-actions'><a class='reader-link is-disabled' href='#' aria-disabled='true'>" +
        (PDF_READER_ENABLED ? STR.pdfNotFound : STR.pdfUnavailable) +
        "</a></div>";
    }

    var summaryHtml = "";
    if (clean(book.summary)) {
      summaryHtml +=
        "<div class='book-summary'><h3>" +
        STR.summaryTitle +
        "</h3><p>" +
        escapeHtml(book.summary) +
        "</p>";
      if (clean(book.summaryMeta)) {
        summaryHtml +=
          "<p class='book-summary-meta'>" + escapeHtml(book.summaryMeta) + "</p>";
      }
      summaryHtml += "</div>";
    }

    host.innerHTML =
      "<aside class='dc'><img src='" +
      escapeHtml(toRoot((book.cover && book.cover.full) || "")) +
      "' alt='" +
      escapeHtml(clean(book.title || "Kitap")) +
      "'></aside>" +
      "<section class='panel'>" +
      "<div class='chips book-detail-chips'>" +
      chips +
      "</div>" +
      readerLink +
      "<table class='tbl'>" +
      tableRow("Kitap ady (TM)", book.title) +
      tableRow("Awtor (TM)", book.author) +
      tableRow("Ne\u015firyat", book.meta && book.meta.publisher) +
      tableRow("\u015e\u00e4her", book.meta && book.meta.city) +
      tableRow("\u00ddyl", book.yearText || "") +
      tableRow("Sahypa sany", book.meta && book.meta.pages) +
      tableRow("ISBN", book.meta && book.meta.isbn) +
      tableRow("Dil", book.meta && book.meta.language ? book.meta.language : book.langCode) +
      "</table>" +
      summaryHtml +
      "</section>";

    if (typeof done === "function") done();
  }

  function readCacheEntry(storage, key) {
    if (!storage) return null;
    try {
      var raw = storage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (!parsed.ts || !parsed.data) return null;
      if (Date.now() - Number(parsed.ts) > CACHE_TTL_MS) return null;
      return parsed.data;
    } catch (_e) {
      return null;
    }
  }

  function readCache(scope) {
    var key = getCacheKey(scope);
    var cachedData = readCacheEntry(sessionStorage, key);
    if (cachedData) {
      return normalizeLibraryData(cachedData);
    }

    if (scope !== "full") {
      cachedData = readCacheEntry(localStorage, key);
      if (cachedData) {
        try {
          sessionStorage.setItem(
            key,
            JSON.stringify({
              ts: Date.now(),
              data: cachedData,
            })
          );
        } catch (_e) {
          // ignore
        }
        return normalizeLibraryData(cachedData);
      }
    }

    return null;
  }

  function writeCache(scope, data) {
    var key = getCacheKey(scope);
    var payload = JSON.stringify({ ts: Date.now(), data: normalizeLibraryData(data) });

    try {
      sessionStorage.setItem(key, payload);
    } catch (_e) {
      // ignore
    }

    if (scope !== "full") {
      try {
        localStorage.setItem(key, payload);
      } catch (_e2) {
        // ignore
      }
    }
  }

  function fetchJsonFile(filePath, signal) {
    var options = { cache: "force-cache" };
    if (signal) options.signal = signal;
    return fetch(toRoot(filePath), options).then(function (res) {
      if (!res.ok) throw new Error("library fetch failed");
      return res.json();
    });
  }

  function fetchLibrary(scope) {
    var effectiveScope = scope === "full" ? "full" : "index";
    if (inflightLibraryPromiseByScope[effectiveScope]) {
      return inflightLibraryPromiseByScope[effectiveScope];
    }

    var cached = readCache(effectiveScope);
    if (cached) {
      return Promise.resolve(cached);
    }

    var requestPrimary = function () {
      return withTimeout(function (signal) {
        return fetchJsonFile(getDataFileForScope(effectiveScope), signal);
      }, FETCH_TIMEOUT_MS);
    };

    var requestFallback = function () {
      return withTimeout(function (signal) {
        return fetchJsonFile(getDataFileForScope("full"), signal);
      }, FETCH_TIMEOUT_MS);
    };

    inflightLibraryPromiseByScope[effectiveScope] = requestPrimary()
      .catch(function (primaryError) {
        if (effectiveScope !== "index") {
          throw primaryError;
        }
        return requestFallback();
      })
      .then(function (data) {
        var normalized = normalizeLibraryData(data);
        writeCache(effectiveScope, normalized);
        return normalized;
      })
      .finally(function () {
        delete inflightLibraryPromiseByScope[effectiveScope];
      });

    return inflightLibraryPromiseByScope[effectiveScope];
  }

  function dispatchRendered(detail) {
    try {
      var payload = safeObject(detail);
      payload.ts = Date.now();
      document.dispatchEvent(new CustomEvent("medlib:catalog-rendered", { detail: payload }));
    } catch (_e) {
      return null;
    }
  }

  function renderPage(data) {
    var normalized = normalizeLibraryData(data);
    setUpdatedAtLabel(normalized.updatedAt || "");

    try {
      window.__medlibCatalogData = normalized;
      document.documentElement.setAttribute(
        "data-library-updated-at",
        clean(normalized.updatedAt || "")
      );
    } catch (_e) {
      // ignore
    }

    var page = getPageFile();
    var payload = {
      page: page || "index.html",
      updatedAt: normalized.updatedAt || "",
      totals: {
        books: Number(normalized.stats.books) || safeArray(normalized.books).length,
        categories: Number(normalized.stats.categories) || safeArray(normalized.categories).length,
        languages: Number(normalized.stats.languages) || safeArray(normalized.languages).length,
      },
    };

    if (page === "index.html" || page === "") {
      renderIndex(normalized, function () {
        dispatchRendered(payload);
      });
      return;
    }
    if (page === "books.html") {
      renderBooksPage(normalized, function () {
        dispatchRendered(payload);
      });
      return;
    }
    if (page === "categories.html") {
      renderFacetList(normalized, "categories", function () {
        dispatchRendered(payload);
      });
      return;
    }
    if (page === "languages.html") {
      renderFacetList(normalized, "languages", function () {
        dispatchRendered(payload);
      });
      return;
    }
    if (page === "book.html") {
      renderBookPage(normalized, function () {
        dispatchRendered(payload);
      });
    }
  }

  function renderErrorState(error) {
    var grid =
      document.getElementById("grid") ||
      document.getElementById("featuredGrid") ||
      document.getElementById("facetGrid") ||
      document.getElementById("bookDetail");

    if (!grid) return;

    grid.innerHTML =
      "<section class='panel'><h2>" +
      STR.loadErrorTitle +
      "</h2><p>" +
      STR.loadErrorText +
      "</p></section>";

    try {
      document.dispatchEvent(
        new CustomEvent("medlib:catalog-error", {
          detail: {
            message: clean(error && error.message ? error.message : "catalog render error"),
            ts: Date.now(),
          },
        })
      );
    } catch (_e) {
      return;
    }
  }

  function init() {
    var page = getPageFile();
    var supported = ["", "index.html", "books.html", "categories.html", "languages.html", "book.html"];
    if (supported.indexOf(page) < 0) return;
    var scope = getDataScopeForPage(page);

    fetchLibrary(scope)
      .then(renderPage)
      .catch(function (error) {
        renderErrorState(error);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
