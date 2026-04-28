(function () {
  "use strict";

  if (window.__medlibAppLoaded) {
    return;
  }
  window.__medlibAppLoaded = true;

  var KEY_USERS = "medlib_users_v1";
  var KEY_SESSION = "medlib_session_v1";
  var KEY_RECENT_PREFIX = "medlib_recent_books_v1:";
  var KEY_FAVORITES_PREFIX = "medlib_favorites_v1:";

  var MAX_RECENT = 18;
  var MAX_FAVORITES = 300;
  var FAVORITES_INITIAL_BATCH = 80;
  var CARD_REVEAL_MAX = 260;
  var ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
  var ADMIN_SUBSCRIPTION_EXPIRES_AT = Date.UTC(2100, 0, 1);
  var lazyFavoriteObserver = null;

  var ROLE_ORDER = { reader: 1, editor: 2, admin: 3 };
  var ROLE_LABEL = { reader: "Okyjy", editor: "Redaktor", admin: "Admin" };
  var SITE_NAME = "Lukmançylyk sanly kitaphanasy";
  var ROOT_PAGE_COPY = {
    "index.html": {
      title: SITE_NAME,
      heading: SITE_NAME,
      lead:
        "Lukmançylyk ugurlary boýunça sanly edebiýatlara resmi we amatly elýeterlilik.",
    },
    "books.html": {
      title: "Kitap katalogy",
      heading: "Lukmançylyk kitap katalogy",
      lead: "Kitaplary gözleg, dil we lukmançylyk ugry boýunça tiz tapyň.",
    },
    "categories.html": {
      title: "Lukmançylyk ugurlary",
      heading: "Lukmançylyk ugurlary",
      lead: "Kitaplary degişli ugurlar boýunça tertipli saýlaň.",
    },
    "languages.html": {
      title: "Diller",
      heading: "Diller boýunça fond",
      lead: "Kitaplary dil boýunça toparlanylan sanawdan saýlaň.",
    },
    "login.html": {
      title: "Giriş",
      heading: "Ulanyjy girişi",
      lead: "Hasabyňyz bilen ulgama ygtybarly giriş ediň.",
    },
    "register.html": {
      title: "Hasap döretmek",
      heading: "Täze hasap açmak",
      lead: "Lukmançylyk sanly kitaphanasyna ulanyjy hasabyny dörediň.",
    },
    "account.html": {
      title: "Hasap",
      heading: "Ulanyjy hasaby",
      lead: "Profiliňiz, abuna maglumatlary we rugsatlar.",
    },
  };

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_e) {
      return false;
    }
  }

  function removeKey(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (_e) {
      return false;
    }
  }

  function fire(name) {
    try {
      document.dispatchEvent(new CustomEvent(name));
    } catch (_e) {
      return;
    }
  }

  function now() {
    return Date.now();
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (m) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[m];
    });
  }

  function getPathname() {
    return String(location.pathname || "").replace(/\\/g, "/");
  }

  function isSubPage() {
    return /(?:^|\/)(books|categories|languages)\//i.test(getPathname());
  }

  function rootPrefix() {
    return isSubPage() ? "../" : "";
  }

  function toRoot(path) {
    return rootPrefix() + path;
  }

  function getPageFile() {
    var match = getPathname().match(/([^/?#]+)$/);
    return (match ? match[1] : "").toLowerCase();
  }

  function getQuery(name) {
    try {
      return new URLSearchParams(location.search || "").get(name);
    } catch (_e) {
      return null;
    }
  }

  function randomId() {
    return "u_" + Math.random().toString(36).slice(2) + now().toString(36);
  }

  function normalizeTitleBranding(preferredTitle) {
    var current = clean(document.title);
    var target = clean(preferredTitle);

    if (!target) {
      if (!current) {
        document.title = SITE_NAME;
        return;
      }
      if (current.indexOf(SITE_NAME) === -1) {
        document.title = current + " | " + SITE_NAME;
      }
      return;
    }

    document.title = target === SITE_NAME ? SITE_NAME : target + " | " + SITE_NAME;
  }

  function normalizeStaticBranding() {
    var page = getPageFile();
    var copy = ROOT_PAGE_COPY[page];
    var hero = document.querySelector(".hero .hero-in");

    if (hero) {
      var heading = hero.querySelector("h1");
      var lead = hero.querySelector("p");
      if (copy && heading) heading.textContent = copy.heading;
      if (copy && lead) lead.textContent = copy.lead;
    }

    document.querySelectorAll(".nav a").forEach(function (link) {
      var href = String(link.getAttribute("href") || "").toLowerCase();
      if (href.indexOf("index.html") > -1) link.textContent = "Baş sahypa";
      if (href.indexOf("books.html") > -1) link.textContent = "Kitaplar";
      if (href.indexOf("categories.html") > -1) link.textContent = "Lukmançylyk ugurlary";
      if (href.indexOf("languages.html") > -1) link.textContent = "Diller";
    });

    document.querySelectorAll(".footer").forEach(function (node) {
      node.textContent = String(node.textContent || "")
        .replace(/Eksport\s*:/gi, "Täzelenme: ")
        .replace(/T\?zelenme\s*:/gi, "Täzelenme: ");
    });

    if (page === "login.html") {
      var demo = document.querySelector(".muted-note");
      if (demo) demo.remove();
    }

    normalizeTitleBranding(copy ? copy.title : "");
  }

  function normalizeCorruptedSummaryText() {
    var suspicious = /[À-ÿ]{4,}/;
    var quoteSegment = /Mysal setir:\s*["“][^"”]*["”]\.?\s*/i;
    var keywordSegment = /Açar sözler:\s*[^.]*\.\s*/i;
    var latinNoiseWord = /\b[À-ÿ]{3,}\b/g;

    document.querySelectorAll(".book-summary p").forEach(function (node) {
      var text = clean(node.textContent);
      if (!text || !suspicious.test(text)) return;

      text = text.replace(keywordSegment, "");
      text = text.replace(quoteSegment, "");
      text = text.replace(latinNoiseWord, "");
      text = clean(text);

      if (text) {
        node.textContent = text;
      }
    });
  }

  function hashPassword(password) {
    var str = String(password || "");
    var hash = 2166136261;
    for (var i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash +=
        (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16);
  }

  function normalizeUsername(value) {
    return clean(value).toLowerCase();
  }

  function buildSubscription(role, fromTime, months) {
    var startAt = Number(fromTime) > 0 ? Number(fromTime) : now();
    var monthCount = Number(months) > 0 ? Number(months) : 1;
    if (role === "admin") {
      return {
        startAt: startAt,
        expiresAt: ADMIN_SUBSCRIPTION_EXPIRES_AT,
      };
    }
    return {
      startAt: startAt,
      expiresAt: startAt + monthCount * ONE_MONTH_MS,
    };
  }

  function isSubscriptionActive(user) {
    if (!user) return false;
    if (roleAtLeast(user, "admin")) return true;
    return Number(user.subscriptionExpiresAt || 0) > now();
  }

  function getSubscriptionDaysLeft(user) {
    if (!user) return 0;
    if (roleAtLeast(user, "admin")) return 99999;
    var diff = Number(user.subscriptionExpiresAt || 0) - now();
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  }

  function formatDate(ts) {
    var val = Number(ts);
    if (!Number.isFinite(val) || val <= 0) return "-";
    try {
      return new Date(val).toLocaleDateString("en-CA");
    } catch (_e) {
      return "-";
    }
  }

  function renewSubscription(user, months) {
    var monthCount = Number(months) > 0 ? Number(months) : 1;
    if (roleAtLeast(user, "admin")) {
      user.subscriptionStartAt = Number(user.subscriptionStartAt || now());
      user.subscriptionExpiresAt = ADMIN_SUBSCRIPTION_EXPIRES_AT;
      return user;
    }

    var currentExpires = Number(user.subscriptionExpiresAt || 0);
    var baseTime = currentExpires > now() ? currentExpires : now();
    user.subscriptionStartAt = now();
    user.subscriptionExpiresAt = baseTime + monthCount * ONE_MONTH_MS;
    return user;
  }

  function getUsers() {
    var rawUsers = readJson(KEY_USERS, []);
    var normalized = [];
    var changed = false;
    var currentTime = now();

    (rawUsers || []).forEach(function (user) {
      if (!user || !user.username) {
        changed = true;
        return;
      }

      var passwordHash = user.passwordHash;
      if (!passwordHash && user.password) {
        passwordHash = hashPassword(user.password);
        changed = true;
      }

      if (!user.id || !passwordHash) {
        changed = true;
        return;
      }

      var role = ROLE_ORDER[user.role] ? user.role : "reader";
      if (role !== user.role) {
        changed = true;
      }

      var createdAt = Number(user.createdAt);
      if (!Number.isFinite(createdAt) || createdAt <= 0) {
        createdAt = currentTime;
        changed = true;
      }

      var subscriptionStartAt = Number(user.subscriptionStartAt);
      if (!Number.isFinite(subscriptionStartAt) || subscriptionStartAt <= 0) {
        subscriptionStartAt = createdAt;
        changed = true;
      }

      var subscriptionExpiresAt = Number(user.subscriptionExpiresAt);
      if (!Number.isFinite(subscriptionExpiresAt) || subscriptionExpiresAt <= 0) {
        subscriptionExpiresAt = subscriptionStartAt + ONE_MONTH_MS;
        changed = true;
      }

      if (role === "admin" && subscriptionExpiresAt < ADMIN_SUBSCRIPTION_EXPIRES_AT) {
        subscriptionExpiresAt = ADMIN_SUBSCRIPTION_EXPIRES_AT;
        changed = true;
      }

      normalized.push(
        Object.assign({}, user, {
          username: normalizeUsername(user.username),
          role: role,
          passwordHash: passwordHash,
          createdAt: createdAt,
          subscriptionStartAt: subscriptionStartAt,
          subscriptionExpiresAt: subscriptionExpiresAt,
        })
      );
    });

    if (changed) {
      setUsers(normalized);
    }

    return normalized;
  }

  function setUsers(users) {
    return writeJson(KEY_USERS, users || []);
  }

  function countAdmins(users) {
    return (users || []).filter(function (u) {
      return u.role === "admin";
    }).length;
  }

  function ensureSeedUsers() {
    var users = getUsers();
    if (!users.length) {
      users = [
        {
          id: randomId(),
          fullName: "Administrator",
          username: "admin",
          role: "admin",
          passwordHash: hashPassword("admin123"),
          createdAt: now(),
        },
      ];
      setUsers(users);
      return;
    }

    if (countAdmins(users) === 0) {
      users[0].role = "admin";
      setUsers(users);
    }
  }

  function findUserById(userId) {
    return getUsers().find(function (u) {
      return u.id === userId;
    }) || null;
  }

  function findUserByUsername(username) {
    var key = normalizeUsername(username);
    return (
      getUsers().find(function (u) {
        return normalizeUsername(u.username) === key;
      }) || null
    );
  }

  function getSession() {
    return readJson(KEY_SESSION, null);
  }

  function setSession(user) {
    if (!user || !user.id) return false;
    return writeJson(KEY_SESSION, { userId: user.id, at: now() });
  }

  function clearSession() {
    removeKey(KEY_SESSION);
  }

  function getCurrentUser() {
    var session = getSession();
    if (!session || !session.userId) return null;
    var user = findUserById(session.userId);
    if (!user) {
      clearSession();
      return null;
    }
    return user;
  }

  function roleAtLeast(user, role) {
    if (!user || !ROLE_ORDER[user.role] || !ROLE_ORDER[role]) return false;
    return ROLE_ORDER[user.role] >= ROLE_ORDER[role];
  }

  function registerUser(payload) {
    var fullName = clean(payload.fullName);
    var username = normalizeUsername(payload.username);
    var password = String(payload.password || "");
    var role = String(payload.role || "reader").toLowerCase();

    if (fullName.length < 2) {
      return { ok: false, message: "Doly ady azyndan 2 harp bolmaly." };
    }
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      return {
        ok: false,
        message: "Ulanyjy ady 3-32 harp we [a-z, 0-9, ., _, -] bolmaly.",
      };
    }
    if (password.length < 6) {
      return { ok: false, message: "Açar söz azyndan 6 harp bolmaly." };
    }
    if (findUserByUsername(username)) {
      return { ok: false, message: "Bu ulanyjy ady eyyam bar." };
    }

    if (!ROLE_ORDER[role]) {
      role = "reader";
    }

    var users = getUsers();
    var createdAt = now();
    var subscription = buildSubscription(role, createdAt, 1);
    var user = {
      id: randomId(),
      fullName: fullName,
      username: username,
      role: role,
      passwordHash: hashPassword(password),
      createdAt: createdAt,
      subscriptionStartAt: subscription.startAt,
      subscriptionExpiresAt: subscription.expiresAt,
    };
    users.push(user);
    if (!setUsers(users)) {
      return {
        ok: false,
        message: "Browser storage bloklanan. LocalStorage ishlemeyar.",
      };
    }

    return { ok: true, user: user };
  }

  function loginUser(username, password) {
    var user = findUserByUsername(username);
    if (!user) {
      return { ok: false, message: "Ulanyjy tapylmady." };
    }
    if (user.passwordHash !== hashPassword(password)) {
      return { ok: false, message: "Açar söz ýalňyş." };
    }

    if (!setSession(user)) {
      return {
        ok: false,
        message: "Sessiya yazyp bolmady. Browser storage rugsatyny barla.",
      };
    }
    fire("medlib:auth-updated");
    return { ok: true, user: user };
  }

  function logoutUser() {
    clearSession();
    fire("medlib:auth-updated");
  }

  function requireLogin(message) {
    if (getCurrentUser()) return true;
    alert(message || "Bu funksiya ucin giris etmeli.");
    location.href =
      toRoot("login.html") + "?next=" + encodeURIComponent(location.href);
    return false;
  }

  function requireActiveSubscription(message) {
    var user = getCurrentUser();
    if (!user) return false;
    if (isSubscriptionActive(user)) return true;
    alert(message || "Abuna wagty gutardy. Hasap sahypasynda uzaldyn.");
    location.href = toRoot("account.html");
    return false;
  }

  function renewSubscriptionByUserId(userId, months) {
    var users = getUsers();
    var index = users.findIndex(function (item) {
      return item.id === userId;
    });
    if (index < 0) return null;

    users[index] = renewSubscription(users[index], months);
    if (!setUsers(users)) return null;
    return users[index];
  }

  function getRecentKey() {
    var user = getCurrentUser();
    return KEY_RECENT_PREFIX + (user ? user.id : "guest");
  }

  function getFavoritesKey() {
    var user = getCurrentUser();
    return user ? KEY_FAVORITES_PREFIX + user.id : null;
  }

  function extractBookId(href) {
    if (!href) return null;
    var normalized = String(href).replace(/\\/g, "/");
    var match = normalized.match(/books\/([^/?#]+)\.html/i);
    if (match) return match[1];

    try {
      var url = new URL(normalized, location.origin + "/");
      if (/\/book\.html$/i.test(url.pathname || "")) {
        var id = clean(url.searchParams.get("id"));
        return id || null;
      }
    } catch (_e) {
      var queryMatch = normalized.match(/[?&]id=([^&#]+)/i);
      if (queryMatch) {
        try {
          return decodeURIComponent(queryMatch[1]);
        } catch (_e2) {
          return queryMatch[1];
        }
      }
    }
    return null;
  }

  function toBookPath(href) {
    var id = extractBookId(href);
    return id ? "book.html?id=" + encodeURIComponent(id) : null;
  }

  function toCoverPath(src) {
    if (!src) return "";
    var normalized = String(src).replace(/\\/g, "/");
    var match = normalized.match(/assets\/covers\/[^/?#'\"]+/i);
    var coverPath = match ? match[0] : normalized;
    return coverPath.replace(/\.(png|jpg|jpeg|bmp)$/i, ".webp");
  }

  function toLocalHref(bookPath) {
    if (!bookPath) return "#";
    return isSubPage() ? "../" + bookPath : bookPath;
  }

  function toLocalCover(coverPath) {
    if (!coverPath) return "";
    return isSubPage() ? "../" + coverPath : coverPath;
  }

  function uniqById(items) {
    var map = new Map();
    (items || []).forEach(function (item) {
      if (item && item.id) map.set(item.id, item);
    });
    return Array.from(map.values());
  }

  function getCardBookData(card) {
    if (!card) return null;
    var link =
      card.querySelector(".cover[href]") ||
      card.querySelector("h3 a[href]") ||
      card.querySelector("a[href*='books/']");
    if (!link) return null;

    var href = toBookPath(link.getAttribute("href") || "");
    var id = extractBookId(href || "");
    if (!id || !href) return null;

    var image = card.querySelector("img");
    var titleNode = card.querySelector("h3 a, h3");
    var authorNode = card.querySelector(".cb p, p");
    var meta = card.querySelectorAll(".meta span");

    return {
      id: id,
      href: href,
      title: clean(titleNode && titleNode.textContent) || "Kitap",
      author: clean(authorNode && authorNode.textContent) || "Awtor yok",
      cover: toCoverPath(image && image.getAttribute("src")),
      lang: clean(meta[0] && meta[0].textContent),
      year: clean(meta[1] && meta[1].textContent),
      updatedAt: now(),
    };
  }

  function getCurrentDetailBook() {
    var path = getPathname();
    var id = null;
    var match = path.match(/books\/([^/?#]+)\.html$/i);
    if (match) {
      id = match[1];
    } else if (/\/book\.html$/i.test(path)) {
      id = clean(getQuery("id"));
    }
    if (!id) return null;

    var title = clean((document.querySelector(".hero h1") || {}).textContent);
    var author = clean((document.querySelector(".hero p") || {}).textContent);
    var coverNode = document.querySelector(".dc img, .detail img");

    var lang = "";
    var year = "";
    document.querySelectorAll(".tbl tr").forEach(function (row) {
      var th = clean((row.querySelector("th") || {}).textContent).toLowerCase();
      var td = clean((row.querySelector("td") || {}).textContent);
      if (!th || !td) return;
      if (!lang && /dil/.test(th)) lang = td;
      if (!year && /yl/.test(th)) year = td;
    });

    return {
      id: id,
      href: "book.html?id=" + encodeURIComponent(id),
      title: title || clean(document.title) || "Kitap",
      author: author || "Awtor yok",
      cover: toCoverPath(coverNode && coverNode.getAttribute("src")),
      lang: lang,
      year: year,
      updatedAt: now(),
    };
  }

  function getRecentBooks() {
    return readJson(getRecentKey(), []).filter(Boolean);
  }

  function saveRecent(book) {
    if (!book || !book.id) return;
    var list = getRecentBooks().filter(function (item) {
      return item && item.id !== book.id;
    });
    list.unshift(
      Object.assign({}, book, {
        seenAt: now(),
      })
    );
    writeJson(getRecentKey(), list.slice(0, MAX_RECENT));
    fire("medlib:recent-updated");
  }

  function getFavorites() {
    var key = getFavoritesKey();
    if (!key) return [];
    return readJson(key, []).filter(Boolean);
  }

  function isFavorite(bookId) {
    return getFavorites().some(function (item) {
      return item.id === bookId;
    });
  }

  function toggleFavorite(book) {
    if (!requireLogin("Saylananlar ucin ilki giris etmeli.")) {
      return false;
    }
    if (!requireActiveSubscription("Saylananlar ucin abuna aktif bolmaly.")) {
      return false;
    }
    if (!book || !book.id) return false;

    var key = getFavoritesKey();
    if (!key) return false;

    var list = getFavorites();
    var idx = list.findIndex(function (item) {
      return item.id === book.id;
    });

    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.unshift(
        Object.assign({}, book, {
          favoritedAt: now(),
        })
      );
      list = uniqById(list).slice(0, MAX_FAVORITES);
    }

    writeJson(key, list);
    fire("medlib:favorites-updated");
    return true;
  }

  function createShelfItem(book) {
    var href = toLocalHref(toBookPath(book.href) || book.href);
    var cover = book.cover
      ? "<img src='" +
        escapeHtml(toLocalCover(book.cover)) +
        "' alt='" +
        escapeHtml(book.title || "Kitap") +
        "' loading='lazy'>"
      : "<span class='shelf-noimg'>No image</span>";

    var meta = [book.lang, book.year].filter(Boolean).join(" | ");
    var metaHtml = meta ? "<em>" + escapeHtml(meta) + "</em>" : "";

    var node = document.createElement("a");
    node.className = "shelf-item";
    node.href = href;
    node.innerHTML =
      "<span class='shelf-thumb'>" +
      cover +
      "</span><span class='shelf-txt'><b>" +
      escapeHtml(book.title || "Kitap") +
      "</b><small>" +
      escapeHtml(book.author || "Awtor yok") +
      "</small>" +
      metaHtml +
      "</span>";
    return node;
  }

  function renderShelf(list, holderId, emptyId) {
    var holder = document.getElementById(holderId);
    if (!holder) return;

    holder.innerHTML = "";
    list.slice(0, 10).forEach(function (book) {
      holder.appendChild(createShelfItem(book));
    });

    var empty = document.getElementById(emptyId);
    if (empty) {
      empty.style.display = list.length ? "none" : "block";
    }
  }

  function renderShelves() {
    var hasShelves =
      document.getElementById("recentBooks") ||
      document.getElementById("favoriteBooks");
    if (!hasShelves) return;

    renderShelf(getRecentBooks(), "recentBooks", "recentEmpty");
    renderShelf(getFavorites(), "favoriteBooks", "favoriteEmpty");
  }

  function updateCardFavoriteButton(button, bookId) {
    var user = getCurrentUser();
    if (!user) {
      button.classList.remove("is-active");
      button.classList.remove("is-expired");
      button.classList.add("is-guest");
      button.setAttribute("aria-pressed", "false");
      button.textContent = "Giriş";
      return;
    }

    if (!isSubscriptionActive(user)) {
      button.classList.remove("is-active");
      button.classList.remove("is-guest");
      button.classList.add("is-expired");
      button.setAttribute("aria-pressed", "false");
      button.textContent = "Abuna";
      return;
    }

    button.classList.remove("is-guest");
    button.classList.remove("is-expired");
    var active = isFavorite(bookId);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.textContent = active ? "Saylanan" : "Sayla";
  }

  function addFavoriteButtonToCard(card) {
    if (!card || card.querySelector(".fav-toggle")) return;
    var book = getCardBookData(card);
    if (!book) return;

    var button = document.createElement("button");
    button.type = "button";
    button.className = "fav-toggle";
    button.setAttribute("aria-label", "Kitaby saylananlara gos");
    updateCardFavoriteButton(button, book.id);

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();

      var user = getCurrentUser();
      if (!user) {
        requireLogin("Saylananlar ucin ilki giris etmeli.");
        return;
      }
      if (!requireActiveSubscription("Saylananlar ucin abuna aktif bolmaly.")) {
        return;
      }

      toggleFavorite(getCardBookData(card) || book);
      updateCardFavoriteButton(button, book.id);
    });

    card.appendChild(button);
  }

  function disconnectLazyFavoriteObserver() {
    if (!lazyFavoriteObserver) return;
    try {
      lazyFavoriteObserver.disconnect();
    } catch (_e) {
      // ignore
    }
    lazyFavoriteObserver = null;
  }

  function enhanceCardsWithFavorites() {
    var cards = Array.prototype.slice.call(document.querySelectorAll(".card"));
    if (!cards.length) {
      disconnectLazyFavoriteObserver();
      return;
    }

    var eagerCount = Math.min(cards.length, FAVORITES_INITIAL_BATCH);
    for (var i = 0; i < eagerCount; i++) {
      addFavoriteButtonToCard(cards[i]);
    }

    if (eagerCount >= cards.length) {
      disconnectLazyFavoriteObserver();
      return;
    }

    if (!("IntersectionObserver" in window)) {
      for (var j = eagerCount; j < cards.length; j++) {
        addFavoriteButtonToCard(cards[j]);
      }
      disconnectLazyFavoriteObserver();
      return;
    }

    disconnectLazyFavoriteObserver();
    lazyFavoriteObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var card = entry.target;
          addFavoriteButtonToCard(card);
          card.removeAttribute("data-fav-lazy");
          if (lazyFavoriteObserver) {
            lazyFavoriteObserver.unobserve(card);
          }
        });
      },
      {
        rootMargin: "280px 0px",
        threshold: 0.01,
      }
    );

    cards.slice(eagerCount).forEach(function (card) {
      if (card.querySelector(".fav-toggle")) return;
      card.setAttribute("data-fav-lazy", "1");
      lazyFavoriteObserver.observe(card);
    });
  }

  function syncDetailFavoriteButton(button, book) {
    var user = getCurrentUser();
    if (!user) {
      button.classList.remove("is-active");
      button.classList.remove("is-expired");
      button.classList.add("is-guest");
      button.textContent = "Giriş edip saýla";
      button.setAttribute("aria-pressed", "false");
      return;
    }

    if (!isSubscriptionActive(user)) {
      button.classList.remove("is-active");
      button.classList.remove("is-guest");
      button.classList.add("is-expired");
      button.textContent = "Abuna gutaran";
      button.setAttribute("aria-pressed", "false");
      return;
    }

    button.classList.remove("is-guest");
    button.classList.remove("is-expired");
    var active = isFavorite(book.id);
    button.classList.toggle("is-active", active);
    button.textContent = active ? "Saylanan" : "Kitaby sayla";
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }

  function addDetailFavoriteButton() {
    var book = getCurrentDetailBook();
    if (!book) return;

    var panel = document.querySelector(".detail .panel");
    if (!panel) return;

    var button = panel.querySelector(".fav-detail-btn");
    if (!button) {
      var wrap = document.createElement("div");
      wrap.className = "fav-detail-row";

      button = document.createElement("button");
      button.type = "button";
      button.className = "fav-detail-btn";

      button.addEventListener("click", function () {
        if (!getCurrentUser()) {
          requireLogin("Saylananlar ucin ilki giris etmeli.");
          return;
        }
        if (!requireActiveSubscription("Saylananlar ucin abuna aktif bolmaly.")) {
          return;
        }
        toggleFavorite(book);
        syncDetailFavoriteButton(button, book);
      });

      wrap.appendChild(button);
      panel.insertBefore(wrap, panel.firstChild);
    }

    syncDetailFavoriteButton(button, book);
  }

  function syncReaderAccessLinks() {
    var user = getCurrentUser();
    var loginHref = toRoot("login.html") + "?next=" + encodeURIComponent(location.href);

    document.querySelectorAll(".reader-actions .reader-link").forEach(function (link) {
      if (!link || link.classList.contains("is-disabled")) return;

      if (!link.getAttribute("data-reader-href")) {
        link.setAttribute("data-reader-href", link.getAttribute("href") || "");
      }

      if (!user) {
        link.classList.add("is-guest");
        link.setAttribute("aria-disabled", "true");
        link.setAttribute("href", loginHref);
        link.textContent = "Giriş edip oka";
      } else {
        link.classList.remove("is-guest");
        link.removeAttribute("aria-disabled");
        var original = link.getAttribute("data-reader-href") || "";
        if (original) {
          link.setAttribute("href", original);
        }
        link.textContent = "PDF-ni oka";
      }
    });
  }

  function createNavLink(href, label, className) {
    var a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    if (className) a.className = className;
    return a;
  }

  function renderAuthNav() {
    var user = getCurrentUser();

    document.querySelectorAll(".nav").forEach(function (nav) {
      var old = nav.querySelector(".auth-box");
      if (old) old.remove();

      var box = document.createElement("span");
      box.className = "auth-box";

      if (user) {
        var badge = document.createElement("span");
        badge.className = "auth-badge";
        var subText = roleAtLeast(user, "admin")
          ? "unlimited"
          : isSubscriptionActive(user)
            ? getSubscriptionDaysLeft(user) + "d"
            : "expired";
        badge.textContent =
          user.username + " (" + ROLE_LABEL[user.role] + " | " + subText + ")";
        box.appendChild(badge);

        box.appendChild(createNavLink(toRoot("account.html"), "Hasap", "auth-link"));

        var logout = createNavLink("#", "Çykyş", "auth-link");
        logout.addEventListener("click", function (e) {
          e.preventDefault();
          logoutUser();
          location.href = toRoot("index.html");
        });
        box.appendChild(logout);
      } else {
        box.appendChild(createNavLink(toRoot("login.html"), "Giriş", "auth-link"));
        box.appendChild(
          createNavLink(toRoot("register.html"), "Registrasiýa", "auth-link")
        );
      }

      nav.appendChild(box);
    });
  }

  function normalizeForSearch(value) {
    return clean(value).toLowerCase();
  }

  function debounce(fn, waitMs) {
    var timer = null;
    var wait = Number(waitMs) > 0 ? Number(waitMs) : 120;
    return function () {
      var args = arguments;
      var ctx = this;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(ctx, args);
      }, wait);
    };
  }

  function detectSectionByPath() {
    var path = getPathname().toLowerCase();
    var file = getPageFile();

    if (/(?:^|\/)books\//.test(path) || file === "books.html" || file === "book.html")
      return "books";
    if (/(?:^|\/)categories\//.test(path) || file === "categories.html")
      return "categories";
    if (/(?:^|\/)languages\//.test(path) || file === "languages.html")
      return "languages";
    if (file === "account.html") return "account";
    if (file === "login.html") return "login";
    if (file === "register.html") return "register";
    return "index";
  }

  function markCurrentNavLink() {
    var currentSection = detectSectionByPath();
    var currentFile = getPageFile() || "index.html";

    document.querySelectorAll(".nav a[href]").forEach(function (link) {
      var href = (link.getAttribute("href") || "").toLowerCase();
      if (!href || href === "#") return;

      var target = href.split("?")[0].split("#")[0].replace(/^(\.\.\/)+/, "");
      var isCurrent = false;

      if (/\/?index\.html$/.test(target)) {
        isCurrent = currentSection === "index";
      } else if (/\/?books\.html$/.test(target)) {
        isCurrent = currentSection === "books";
      } else if (/\/?categories\.html$/.test(target)) {
        isCurrent = currentSection === "categories";
      } else if (/\/?languages\.html$/.test(target)) {
        isCurrent = currentSection === "languages";
      } else if (/\/?account\.html$/.test(target)) {
        isCurrent = currentFile === "account.html";
      } else if (/\/?login\.html$/.test(target)) {
        isCurrent = currentFile === "login.html";
      } else if (/\/?register\.html$/.test(target)) {
        isCurrent = currentFile === "register.html";
      }

      link.classList.toggle("is-current", isCurrent);
    });
  }

  function animateStats() {
    var items = Array.prototype.slice.call(document.querySelectorAll(".st b"));
    if (!items.length) return;

    items.forEach(function (node) {
      if (node.getAttribute("data-animated") === "1") return;

      var text = clean(node.textContent);
      if (!/^\d+$/.test(text)) return;

      var target = Number(text);
      if (!Number.isFinite(target)) return;

      node.setAttribute("data-animated", "1");
      var duration = 900;
      var startAt = null;

      var frame = function (timestamp) {
        if (startAt === null) startAt = timestamp;
        var progress = Math.min(1, (timestamp - startAt) / duration);
        var eased = 1 - Math.pow(1 - progress, 3);
        node.textContent = String(Math.round(target * eased));

        if (progress < 1) {
          requestAnimationFrame(frame);
        } else {
          node.textContent = String(target);
        }
      };

      requestAnimationFrame(frame);
    });
  }

  function setupCardReveal() {
    if (!("IntersectionObserver" in window)) return;
    var cards = Array.prototype.slice
      .call(document.querySelectorAll(".card"))
      .filter(function (card) {
        return card.getAttribute("data-reveal-bound") !== "1";
      });
    if (!cards.length) return;
    if (cards.length > CARD_REVEAL_MAX) return;

    cards.forEach(function (card) {
      card.setAttribute("data-reveal-bound", "1");
      card.classList.add("is-reveal-ready");
    });

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.08,
        rootMargin: "0px 0px -10% 0px",
      }
    );

    cards.forEach(function (card, index) {
      if (index < 28) {
        card.classList.add("is-visible");
      } else {
        observer.observe(card);
      }
    });
  }

  function initBackToTop() {
    if (document.querySelector(".to-top")) return;

    var button = document.createElement("button");
    button.type = "button";
    button.className = "to-top";
    button.textContent = "Yokary";

    button.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    var onScroll = function () {
      if (window.scrollY > 420) {
        button.classList.add("is-visible");
      } else {
        button.classList.remove("is-visible");
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    document.body.appendChild(button);
  }

  function getCardYear(card) {
    var yearText = "";
    var meta = card ? card.querySelectorAll(".meta span") : [];
    if (meta && meta[1]) {
      yearText = clean(meta[1].textContent);
    }
    if (!yearText) {
      yearText = clean(card && card.getAttribute("data-search"));
    }

    var match = yearText.match(/(19|20)\d{2}/);
    return match ? Number(match[0]) : 0;
  }

  function getCardTitle(card) {
    return normalizeForSearch(
      (card && (card.querySelector("h3 a, h3") || {}).textContent) || ""
    );
  }

  function getVisibleCardCount(cards) {
    return cards.filter(function (card) {
      return card.style.display !== "none";
    }).length;
  }

  function formatNumber(value) {
    var num = Number(value) || 0;
    try {
      return new Intl.NumberFormat("tk-TM").format(num);
    } catch (_e) {
      return String(num);
    }
  }

  function emitCollectionUpdated(visible, total, source) {
    try {
      document.dispatchEvent(
        new CustomEvent("medlib:collection-updated", {
          detail: {
            visible: Number(visible) || 0,
            total: Number(total) || 0,
            source: clean(source || "unknown"),
            ts: Date.now(),
          },
        })
      );
    } catch (_e) {
      return;
    }
  }

  function getCardsSignature(cards) {
    var hash = 2166136261;
    cards.forEach(function (card, index) {
      var token =
        clean(card.getAttribute("data-book-id")) ||
        clean(card.getAttribute("data-title")) ||
        String(index);
      for (var i = 0; i < token.length; i++) {
        hash ^= token.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
    });
    return String(cards.length) + ":" + String(hash >>> 0);
  }

  function updateResultNode(node, visible, total) {
    if (!node) return;
    var v = Number(visible) || 0;
    var t = Number(total) || 0;
    node.textContent = "Netije: " + formatNumber(v) + " / " + formatNumber(t) + " kitap";
    node.setAttribute("data-visible", String(v));
    node.setAttribute("data-total", String(t));
  }

  function sortCardsInGrid(cards, mode) {
    if (!cards.length) return;
    var parent = cards[0].parentElement;
    if (!parent) return;

    var sorted = cards.slice();
    sorted.sort(function (a, b) {
      var orderA = Number(a.getAttribute("data-origin-order") || 0);
      var orderB = Number(b.getAttribute("data-origin-order") || 0);

      if (mode === "title-asc") {
        var titleCmp = getCardTitle(a).localeCompare(getCardTitle(b));
        return titleCmp || orderA - orderB;
      }
      if (mode === "year-desc") {
        return getCardYear(b) - getCardYear(a) || orderA - orderB;
      }
      if (mode === "year-asc") {
        return getCardYear(a) - getCardYear(b) || orderA - orderB;
      }
      return orderA - orderB;
    });

    sorted.forEach(function (card) {
      parent.appendChild(card);
    });
  }

  function initBooksFilterState(q, l, c, sort) {
    if (!q || !l || !c) {
      return {
        hasState: false,
      };
    }

    var params = null;
    try {
      params = new URLSearchParams(location.search || "");
    } catch (_e) {
      params = null;
    }
    if (!params) {
      return {
        hasState: false,
      };
    }

    var hasState = false;
    if (params.has("q")) q.value = params.get("q") || "";
    if (params.has("lang")) l.value = params.get("lang") || "";
    if (params.has("cat")) c.value = params.get("cat") || "";

    if (clean(q.value) || clean(l.value) || clean(c.value)) {
      hasState = true;
    }

    if (sort && params.has("sort")) {
      var sortValue = params.get("sort") || "";
      if (sort.querySelector("option[value='" + sortValue + "']")) {
        sort.value = sortValue;
        if (sortValue && sortValue !== "default") {
          hasState = true;
        }
      }
    }

    return {
      hasState: hasState,
    };
  }

  function syncBooksFilterState(q, l, c, sort) {
    if (!q || !l || !c) return;
    if (!window.history || !window.history.replaceState) return;

    var params = new URLSearchParams(location.search || "");
    if (clean(q.value)) {
      params.set("q", q.value);
    } else {
      params.delete("q");
    }
    if (l.value) {
      params.set("lang", l.value);
    } else {
      params.delete("lang");
    }
    if (c.value) {
      params.set("cat", c.value);
    } else {
      params.delete("cat");
    }
    if (sort && sort.value && sort.value !== "default") {
      params.set("sort", sort.value);
    } else {
      params.delete("sort");
    }

    var next = params.toString();
    var nextUrl = location.pathname + (next ? "?" + next : "") + location.hash;
    window.history.replaceState(null, "", nextUrl);
  }

  function initCollectionToolbar() {
    var grid = document.getElementById("grid") || document.querySelector(".wrap .grid");
    if (!grid) return;

    var cards = Array.prototype.slice.call(grid.querySelectorAll(".card"));
    if (!cards.length) return;

    var signature = getCardsSignature(cards);
    var existingRuntime = grid.__medlibCollectionRuntime;
    if (existingRuntime && existingRuntime.signature === signature) {
      return;
    }
    if (existingRuntime && typeof existingRuntime.dispose === "function") {
      existingRuntime.dispose();
    }

    grid.setAttribute("data-collection-init", "1");

    var disposeStack = [];
    var registerListener = function (target, eventName, handler, options) {
      if (!target || typeof target.addEventListener !== "function") return;
      target.addEventListener(eventName, handler, options);
      disposeStack.push(function () {
        try {
          target.removeEventListener(eventName, handler, options);
        } catch (_e) {
          return;
        }
      });
    };

    cards.forEach(function (card, index) {
      if (!card.getAttribute("data-origin-order")) {
        card.setAttribute("data-origin-order", String(index));
      }
    });

    var q = document.getElementById("q");
    var l = document.getElementById("l");
    var c = document.getElementById("c");
    var r = document.getElementById("r");
    var resultNode = document.getElementById("res");
    var filterRow = document.querySelector(".filters");

    var controlHost = filterRow;
    var customSearch = null;
    var customCount = null;

    if (!controlHost) {
      var panel = document.createElement("section");
      panel.className = "panel collection-tools";
      panel.innerHTML =
        "<div class='collection-tools-head'><h2>Sanaw gurallary</h2><p>Gözleg we tertipleme arkaly gerekli kitaby tiz tapyň.</p></div><div class='collection-actions'></div>";

      controlHost = panel.querySelector(".collection-actions");
      grid.parentNode.insertBefore(panel, grid);

      customSearch = document.createElement("input");
      customSearch.type = "search";
      customSearch.className = "collection-search";
      customSearch.placeholder = "Kitap ady, awtor, ýyl...";
      controlHost.appendChild(customSearch);

      var clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className = "collection-clear";
      clearButton.textContent = "Arassala";
      registerListener(clearButton, "click", function () {
        customSearch.value = "";
        applyClientSearch();
      });
      controlHost.appendChild(clearButton);

      customCount = document.createElement("div");
      customCount.className = "collection-result";
      panel.appendChild(customCount);
    }

    var sort = document.getElementById("medlibSort");
    if (!sort) {
      sort = document.createElement("select");
      sort.id = "medlibSort";
      sort.className = "collection-sort";
      sort.innerHTML =
        "<option value='default'>Asyl tertip</option>" +
        "<option value='title-asc'>Ady A-Z</option>" +
        "<option value='year-desc'>Ýyl: täze-ilki</option>" +
        "<option value='year-asc'>Ýyl: köne-ilki</option>";

      if (filterRow) {
        if (r) {
          filterRow.insertBefore(sort, r);
        } else {
          filterRow.appendChild(sort);
        }
      } else {
        controlHost.appendChild(sort);
      }
    }

    var countTarget = resultNode || customCount;
    var cardById = new Map();

    cards.forEach(function (card, index) {
      var id = clean(card.getAttribute("data-book-id"));
      if (!id) {
        id = "card_" + index;
        card.setAttribute("data-book-id", id);
      }
      cardById.set(id, card);
    });

    var refreshCount = function () {
      var visibleCount = getVisibleCardCount(cards);
      updateResultNode(countTarget, visibleCount, cards.length);
      emitCollectionUpdated(visibleCount, cards.length, "local-refresh");
    };

    var lastAppliedSortMode = sort ? clean(sort.value || "default") : "default";

    var applyOrderedVisibility = function (orderedIds, visibleCount) {
      var ordered = Array.isArray(orderedIds) ? orderedIds : [];
      var visible = new Set(ordered);
      var parent = cards[0] ? cards[0].parentElement : null;
      var sortMode = sort ? clean(sort.value || "default") : "default";
      var shouldReorder =
        !!parent &&
        ordered.length > 0 &&
        (sortMode !== "default" || lastAppliedSortMode !== "default");

      if (shouldReorder) {
        ordered.forEach(function (id) {
          var card = cardById.get(id);
          if (!card) return;
          if (card.style.display === "none") {
            card.style.display = "";
          }
          parent.appendChild(card);
        });
      }

      cards.forEach(function (card) {
        var id = clean(card.getAttribute("data-book-id"));
        var shouldShow = visible.has(id);
        if (shouldShow) {
          if (card.style.display === "none") {
            card.style.display = "";
          }
        } else if (card.style.display !== "none") {
          card.style.display = "none";
        }
      });

      lastAppliedSortMode = sortMode;
      updateResultNode(countTarget, Number(visibleCount) || 0, cards.length);
      emitCollectionUpdated(Number(visibleCount) || 0, cards.length, "ordered-visibility");
      if (q && l && c) {
        syncBooksFilterState(q, l, c, sort);
      }
    };

    var worker = null;
    var workerReady = false;
    var workerSeq = 0;
    var workerLastAppliedSeq = 0;
    var workerDisposed = false;
    var filterScheduled = false;

    var buildLocalSortedIds = function () {
      if (!q || !l || !c) return [];

      var query = normalizeForSearch(q.value);
      var langId = clean(l.value);
      var catId = clean(c.value);
      var mode = sort ? clean(sort.value) : "default";
      var filtered = [];

      cards.forEach(function (card) {
        var haystack = normalizeForSearch(card.getAttribute("data-search") || card.textContent);
        var cardLang = clean(card.getAttribute("data-lang"));
        var cardCats = clean(card.getAttribute("data-cats"))
          .split("|")
          .map(clean)
          .filter(Boolean);

        var matchesQuery = !query || haystack.indexOf(query) > -1;
        var matchesLang = !langId || cardLang === langId;
        var matchesCat = !catId || cardCats.indexOf(catId) > -1;
        if (matchesQuery && matchesLang && matchesCat) {
          filtered.push(card);
        }
      });

      filtered.sort(function (a, b) {
        var orderA = Number(a.getAttribute("data-origin-order") || 0);
        var orderB = Number(b.getAttribute("data-origin-order") || 0);
        if (mode === "title-asc") {
          var titleCmp = getCardTitle(a).localeCompare(getCardTitle(b));
          return titleCmp || orderA - orderB;
        }
        if (mode === "year-desc") {
          return getCardYear(b) - getCardYear(a) || orderA - orderB;
        }
        if (mode === "year-asc") {
          return getCardYear(a) - getCardYear(b) || orderA - orderB;
        }
        return orderA - orderB;
      });

      return filtered.map(function (card) {
        return clean(card.getAttribute("data-book-id"));
      });
    };

    var applyBooksFilters = function () {
      if (!q || !l || !c) return;
      if (workerDisposed) return;

      if (worker && workerReady) {
        workerSeq += 1;
        workerLastAppliedSeq = workerSeq;
        try {
          worker.postMessage({
            type: "query",
            seq: workerSeq,
            payload: {
              query: q.value,
              langId: l.value,
              catId: c.value,
              sort: sort ? sort.value : "default",
            },
          });
          return;
        } catch (_postMessageError) {
          worker = null;
          workerReady = false;
        }
      }

      var ids = buildLocalSortedIds();
      applyOrderedVisibility(ids, ids.length);
    };

    var scheduleBooksFilters = function () {
      if (filterScheduled) return;
      filterScheduled = true;
      setTimeout(function () {
        filterScheduled = false;
        applyBooksFilters();
      }, 0);
    };

    var applyClientSearch = function () {
      if (!customSearch) return;
      var query = normalizeForSearch(customSearch.value);
      cards.forEach(function (card) {
        var haystack = normalizeForSearch(card.getAttribute("data-search") || card.textContent);
        card.style.display = !query || haystack.indexOf(query) > -1 ? "" : "none";
      });
      refreshCount();
    };

    registerListener(sort, "change", function () {
      if (q && l && c) {
        scheduleBooksFilters();
      } else if (customSearch) {
        sortCardsInGrid(cards, sort.value);
        applyClientSearch();
      } else {
        sortCardsInGrid(cards, sort.value);
        refreshCount();
      }
    });

    if (q && l && c) {
      initBooksFilterState(q, l, c, sort);

      if (typeof Worker !== "undefined") {
        try {
          worker = new Worker(toRoot("assets/catalog-filter-worker.js"));
          var onWorkerMessage = function (event) {
            if (workerDisposed) return;
            var msg = event && event.data ? event.data : {};
            if (msg.type === "ready") {
              workerReady = true;
              scheduleBooksFilters();
              return;
            }
            if (msg.type === "result") {
              if (Number(msg.seq) !== Number(workerLastAppliedSeq)) return;
              applyOrderedVisibility(msg.ids || [], Number(msg.count) || 0);
            }
          };
          var onWorkerError = function () {
            if (workerDisposed) return;
            workerReady = false;
            worker = null;
            scheduleBooksFilters();
          };
          worker.addEventListener("message", onWorkerMessage);
          worker.addEventListener("error", onWorkerError);
          try {
            worker.postMessage({
              type: "init",
              items: cards.map(function (card, index) {
                return {
                  id: clean(card.getAttribute("data-book-id")) || "card_" + index,
                  search: card.getAttribute("data-search") || card.textContent || "",
                  lang: card.getAttribute("data-lang") || "",
                  cats: clean(card.getAttribute("data-cats"))
                    .split("|")
                    .map(clean)
                    .filter(Boolean),
                  title: card.getAttribute("data-title") || getCardTitle(card),
                  year: card.getAttribute("data-year") || getCardYear(card),
                  order: Number(card.getAttribute("data-origin-order") || index),
                };
              }),
            });
          } catch (_workerInitMessageError) {
            workerReady = false;
            worker = null;
          }

          var onBeforeUnload = function () {
            if (worker) worker.terminate();
            worker = null;
          };
          registerListener(window, "beforeunload", onBeforeUnload, { once: true });
        } catch (_workerInitError) {
          worker = null;
          workerReady = false;
        }
      }

      var sync = function () {
        scheduleBooksFilters();
      };
      var syncQuery = debounce(sync, 130);

      registerListener(q, "input", syncQuery);
      registerListener(l, "change", sync);
      registerListener(c, "change", sync);
      if (r) {
        registerListener(r, "click", function () {
          q.value = "";
          l.value = "";
          c.value = "";
          if (sort) {
            sort.value = "default";
          }
          scheduleBooksFilters();
        });
      }

      scheduleBooksFilters();
    } else {
      if (customSearch) {
        registerListener(customSearch, "input", applyClientSearch);
      }
      refreshCount();
    }

    grid.__medlibCollectionRuntime = {
      signature: signature,
      dispose: function () {
        workerDisposed = true;
        if (worker) {
          try {
            worker.terminate();
          } catch (_e) {
            return;
          }
        }
        worker = null;
        workerReady = false;
        disposeStack.forEach(function (dispose) {
          try {
            dispose();
          } catch (_e) {
            // ignore
          }
        });
        disposeStack = [];
        grid.removeAttribute("data-collection-init");
      },
    };
  }

  function initFacetGridSearch() {
    if (document.querySelector(".card")) return;

    var grid = null;
    var items = [];
    Array.prototype.slice.call(document.querySelectorAll(".wrap .grid")).some(function (node) {
      var links = Array.prototype.slice.call(node.querySelectorAll("a.panel"));
      if (links.length >= 4) {
        grid = node;
        items = links;
        return true;
      }
      return false;
    });

    if (!grid || !items.length) return;
    if (grid.getAttribute("data-facet-init") === "1") return;
    grid.setAttribute("data-facet-init", "1");

    items.forEach(function (item, index) {
      item.setAttribute("data-origin-order", String(index));
    });

    var panel = document.createElement("section");
    panel.className = "panel collection-tools";
    panel.innerHTML =
      "<div class='collection-tools-head'><h2>Tiz gözleg</h2><p>Lukmançylyk ugry ýa-da dil ady boýunça filtrlenen sanaw.</p></div><div class='collection-actions'></div>";

    var actions = panel.querySelector(".collection-actions");

    var search = document.createElement("input");
    search.type = "search";
    search.className = "collection-search";
    search.placeholder = "Ady boýunça gözleg...";
    actions.appendChild(search);

    var sort = document.createElement("select");
    sort.className = "collection-sort";
    sort.innerHTML =
      "<option value='default'>Asyl tertip</option>" +
      "<option value='name-asc'>Ady A-Z</option>" +
      "<option value='name-desc'>Ady Z-A</option>" +
      "<option value='count-desc'>Kitap sany köp-ilki</option>";
    actions.appendChild(sort);

    var clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "collection-clear";
    clearButton.textContent = "Arassala";
    actions.appendChild(clearButton);

    var result = document.createElement("div");
    result.className = "collection-result";
    panel.appendChild(result);

    grid.parentNode.insertBefore(panel, grid);

    var getFacetName = function (item) {
      return normalizeForSearch((item.querySelector("h2") || {}).textContent);
    };

    var getFacetCount = function (item) {
      var text = clean((item.querySelector("p") || {}).textContent);
      var match = text.match(/\d+/);
      return match ? Number(match[0]) : 0;
    };

    var sortItems = function (mode) {
      var sorted = items.slice();
      sorted.sort(function (a, b) {
        var orderA = Number(a.getAttribute("data-origin-order") || 0);
        var orderB = Number(b.getAttribute("data-origin-order") || 0);

        if (mode === "name-asc") {
          return getFacetName(a).localeCompare(getFacetName(b)) || orderA - orderB;
        }
        if (mode === "name-desc") {
          return getFacetName(b).localeCompare(getFacetName(a)) || orderA - orderB;
        }
        if (mode === "count-desc") {
          return getFacetCount(b) - getFacetCount(a) || orderA - orderB;
        }
        return orderA - orderB;
      });

      sorted.forEach(function (item) {
        grid.appendChild(item);
      });
    };

    var apply = function () {
      var query = normalizeForSearch(search.value);
      items.forEach(function (item) {
        var ok = !query || getFacetName(item).indexOf(query) > -1;
        item.style.display = ok ? "" : "none";
      });
      updateResultNode(result, getVisibleCardCount(items), items.length);
    };

    sort.addEventListener("change", function () {
      sortItems(sort.value);
      apply();
    });
    search.addEventListener("input", apply);
    clearButton.addEventListener("click", function () {
      search.value = "";
      sort.value = "default";
      sortItems("default");
      apply();
    });

    apply();
  }

  function setMessage(node, text, ok) {
    if (!node) return;
    node.textContent = text || "";
    node.classList.remove("ok", "err");
    if (text) node.classList.add(ok ? "ok" : "err");
  }

  function initLoginPage() {
    var form = document.getElementById("loginForm");
    if (!form) return;

    var msg = document.getElementById("loginMsg");
    var userInput = document.getElementById("loginUsername");
    var passInput = document.getElementById("loginPassword");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var res = loginUser(userInput.value, passInput.value);
      if (!res.ok) {
        setMessage(msg, res.message, false);
        return;
      }

      setMessage(msg, "Giriş üstünlikli. Ugrukdyrylýar...", true);
      var next = getQuery("next");
      location.href = next || toRoot("account.html");
    });
  }

  function initRegisterPage() {
    var form = document.getElementById("registerForm");
    if (!form) return;

    var msg = document.getElementById("registerMsg");
    var roleSelect = document.getElementById("regRole");
    var current = getCurrentUser();

    if (roleSelect && !ROLE_ORDER[roleSelect.value]) {
      roleSelect.value = "reader";
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var fullName = document.getElementById("regFullName").value;
      var username = document.getElementById("regUsername").value;
      var password = document.getElementById("regPassword").value;
      var confirm = document.getElementById("regConfirmPassword").value;
      var role = roleSelect ? roleSelect.value : "reader";

      if (password !== confirm) {
        setMessage(msg, "Açar sözler gabat gelenok.", false);
        return;
      }

      var res = registerUser({
        fullName: fullName,
        username: username,
        password: password,
        role: role,
      });

      if (!res.ok) {
        setMessage(msg, res.message, false);
        return;
      }

      if (roleAtLeast(current, "admin")) {
        setMessage(msg, "Ulanyjy hasaby döredildi.", true);
        form.reset();
        if (roleSelect) roleSelect.value = "reader";
        fire("medlib:auth-updated");
      } else {
        if (!setSession(res.user)) {
          setMessage(
            msg,
            "Sessiýa ýazyp bolmady. Brauzer storage rugsadyny barla.",
            false
          );
          return;
        }
        fire("medlib:auth-updated");
        setMessage(msg, "Registrasiýa tamam. Ugrukdyrylýar...", true);
        location.href = toRoot("account.html");
      }
    });
  }

  function exportFavorites() {
    var user = getCurrentUser();
    if (!user) return;

    var data = {
      user: { username: user.username, role: user.role, fullName: user.fullName },
      exportedAt: new Date().toISOString(),
      favorites: getFavorites(),
    };

    var blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "medlib_favorites_" + user.username + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function getSubscriptionSummary(user) {
    if (roleAtLeast(user, "admin")) {
      return {
        state: "active",
        label: "Çäksiz",
        details: "Admin",
      };
    }

    var active = isSubscriptionActive(user);
    var daysLeft = getSubscriptionDaysLeft(user);
    return {
      state: active ? "active" : "expired",
      label: active ? "Aktiw" : "Möhleti geçen",
      details:
        "Soňky gün " +
        formatDate(user.subscriptionExpiresAt) +
        " | " +
        daysLeft +
        " gün",
    };
  }

  function renderAdminUsers(current) {
    var tbody = document.getElementById("userRows");
    if (!tbody) return;

    var users = getUsers().sort(function (a, b) {
      return a.username.localeCompare(b.username);
    });

    tbody.innerHTML = "";

    users.forEach(function (u) {
      var tr = document.createElement("tr");

      var tdName = document.createElement("td");
      tdName.textContent = u.fullName;

      var tdUser = document.createElement("td");
      tdUser.textContent = u.username;

      var tdRole = document.createElement("td");
      var select = document.createElement("select");
      ["reader", "editor", "admin"].forEach(function (r) {
        var option = document.createElement("option");
        option.value = r;
        option.textContent = ROLE_LABEL[r] || r;
        if (u.role === r) option.selected = true;
        select.appendChild(option);
      });
      if (u.id === current.id) {
        select.disabled = true;
      }
      tdRole.appendChild(select);

      var tdSubscription = document.createElement("td");
      var summary = getSubscriptionSummary(u);
      var subBadge = document.createElement("span");
      subBadge.className =
        "sub-pill " + (summary.state === "active" ? "sub-active" : "sub-expired");
      subBadge.textContent = summary.label;
      var subNote = document.createElement("div");
      subNote.className = "sub-note";
      subNote.textContent = summary.details;
      tdSubscription.appendChild(subBadge);
      tdSubscription.appendChild(subNote);

      var tdActions = document.createElement("td");
      var saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.textContent = "Roly ýaz";
      saveBtn.className = "mini-btn";

      saveBtn.addEventListener("click", function () {
        var nextRole = select.value;
        var all = getUsers();
        var idx = all.findIndex(function (x) {
          return x.id === u.id;
        });
        if (idx < 0) return;

        if (all[idx].role === "admin" && nextRole !== "admin" && countAdmins(all) <= 1) {
          alert("In azy bir admin galmaly.");
          select.value = "admin";
          return;
        }

        all[idx].role = nextRole;
        if (!setUsers(all)) {
          alert("Storage yazylmady. Browser sazlamany barla.");
          return;
        }
        fire("medlib:auth-updated");
      });

      tdActions.appendChild(saveBtn);

      var renewBtn = document.createElement("button");
      renewBtn.type = "button";
      renewBtn.textContent = "+1 aý";
      renewBtn.className = "mini-btn";
      renewBtn.addEventListener("click", function () {
        var renewed = renewSubscriptionByUserId(u.id, 1);
        if (!renewed) {
          alert("Abunany uzaldyp bolmady. Storage barla.");
          return;
        }
        fire("medlib:auth-updated");
        renderAdminUsers(current);
      });
      tdActions.appendChild(renewBtn);

      if (u.id !== current.id) {
        var delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.textContent = "Poz";
        delBtn.className = "mini-btn danger";
        delBtn.addEventListener("click", function () {
          var all = getUsers();
          var target = all.find(function (x) {
            return x.id === u.id;
          });
          if (!target) return;
          if (target.role === "admin" && countAdmins(all) <= 1) {
            alert("Sonky admin pozulyp bilinmez.");
            return;
          }
          if (!confirm("Ulanyjyny pozmak isleýärsiňizmi?")) return;
          var nextUsers = all.filter(function (x) {
            return x.id !== u.id;
          });
          if (!setUsers(nextUsers)) {
            alert("Storage yazylmady. Browser sazlamany barla.");
            return;
          }
          fire("medlib:auth-updated");
          renderAdminUsers(current);
        });
        tdActions.appendChild(delBtn);
      }

      tr.appendChild(tdName);
      tr.appendChild(tdUser);
      tr.appendChild(tdRole);
      tr.appendChild(tdSubscription);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
  }

  function initAccountPage() {
    var root = document.getElementById("accountPage");
    if (!root) return;

    var user = getCurrentUser();
    if (!user) {
      location.href =
        toRoot("login.html") + "?next=" + encodeURIComponent(location.href);
      return;
    }

    var rolePill = document.getElementById("accountRole");
    var fullNameNode = document.getElementById("accountFullName");
    var usernameNode = document.getElementById("accountUsername");
    var accountSubNode = document.getElementById("accountSubscription");
    var accountSubHintNode = document.getElementById("accountSubscriptionHint");
    var renewSelfBtn = document.getElementById("renewSelfBtn");

    if (rolePill) rolePill.textContent = ROLE_LABEL[user.role] || user.role;
    if (fullNameNode) fullNameNode.textContent = user.fullName;
    if (usernameNode) usernameNode.textContent = user.username;

    var renderMySubscription = function () {
      var freshUser = findUserById(user.id) || user;
      var summary = getSubscriptionSummary(freshUser);

      if (accountSubNode) {
        accountSubNode.textContent = summary.label;
        accountSubNode.classList.remove("sub-active", "sub-expired");
        accountSubNode.classList.add(
          summary.state === "active" ? "sub-active" : "sub-expired"
        );
      }
      if (accountSubHintNode) {
        accountSubHintNode.textContent = summary.details;
      }
      if (renewSelfBtn) {
        if (roleAtLeast(freshUser, "admin")) {
          renewSelfBtn.classList.add("hidden");
        } else {
          renewSelfBtn.classList.remove("hidden");
          renewSelfBtn.textContent = "+1 aý abuna uzalt";
        }
      }
    };
    renderMySubscription();

    var logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        logoutUser();
        location.href = toRoot("index.html");
      });
    }

    var editorTools = document.getElementById("editorTools");
    var userCanUseEditorTools =
      roleAtLeast(user, "editor") &&
      (roleAtLeast(user, "admin") || isSubscriptionActive(user));
    if (editorTools && userCanUseEditorTools) {
      editorTools.classList.remove("hidden");
      var exportBtn = document.getElementById("exportFavBtn");
      if (exportBtn) {
        exportBtn.addEventListener("click", exportFavorites);
      }
    }

    if (renewSelfBtn && !roleAtLeast(user, "admin")) {
      renewSelfBtn.addEventListener("click", function () {
        var renewed = renewSubscriptionByUserId(user.id, 1);
        if (!renewed) {
          alert("Abunany uzaldyp bolmady. Storage barla.");
          return;
        }
        fire("medlib:auth-updated");
        location.reload();
      });
    }

    var adminTools = document.getElementById("adminTools");
    if (adminTools && roleAtLeast(user, "admin")) {
      adminTools.classList.remove("hidden");
      renderAdminUsers(user);
    }
  }

  function handleLogoutQuery() {
    if (getQuery("logout") !== "1") return;
    logoutUser();
    var next = getQuery("next");
    location.href = next || toRoot("index.html");
  }

  function refreshAuthSensitiveUi() {
    renderAuthNav();
    markCurrentNavLink();
    renderShelves();
    addDetailFavoriteButton();
    syncReaderAccessLinks();

    document.querySelectorAll(".card .fav-toggle").forEach(function (button) {
      var card = button.closest(".card");
      var book = card ? getCardBookData(card) : null;
      if (book) updateCardFavoriteButton(button, book.id);
    });
  }

  function applyCatalogRenderEnhancements() {
    var current = getCurrentDetailBook();
    if (current) saveRecent(current);

    enhanceCardsWithFavorites();
    addDetailFavoriteButton();
    renderShelves();
    syncReaderAccessLinks();
    initCollectionToolbar();
    initFacetGridSearch();
    setupCardReveal();
  }

  function init() {
    ensureSeedUsers();
    handleLogoutQuery();
    normalizeStaticBranding();
    normalizeCorruptedSummaryText();

    renderAuthNav();
    markCurrentNavLink();
    applyCatalogRenderEnhancements();
    animateStats();
    initBackToTop();

    initLoginPage();
    initRegisterPage();
    initAccountPage();

    document.addEventListener("medlib:catalog-rendered", applyCatalogRenderEnhancements);
    document.addEventListener("medlib:recent-updated", renderShelves);
    document.addEventListener("medlib:favorites-updated", refreshAuthSensitiveUi);
    document.addEventListener("medlib:auth-updated", refreshAuthSensitiveUi);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

