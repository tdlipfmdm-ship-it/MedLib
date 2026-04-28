"use strict";

var state = {
  ready: false,
  items: [],
};

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value).toLowerCase();
}

function toYear(value) {
  var num = Number(value);
  if (Number.isFinite(num)) return num;
  var match = clean(value).match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : 0;
}

function bySort(a, b, mode) {
  if (mode === "title-asc") {
    var titleCmp = a.title.localeCompare(b.title);
    return titleCmp || a.order - b.order;
  }
  if (mode === "year-desc") {
    return b.year - a.year || a.order - b.order;
  }
  if (mode === "year-asc") {
    return a.year - b.year || a.order - b.order;
  }
  return a.order - b.order;
}

function filterAndSort(payload) {
  var query = normalize(payload && payload.query);
  var langId = clean(payload && payload.langId);
  var catId = clean(payload && payload.catId);
  var sort = clean(payload && payload.sort) || "default";

  var filtered = state.items.filter(function (item) {
    var matchesQuery = !query || item.search.indexOf(query) > -1;
    var matchesLang = !langId || item.lang === langId;
    var matchesCat = !catId || item.cats.indexOf(catId) > -1;
    return matchesQuery && matchesLang && matchesCat;
  });

  filtered.sort(function (a, b) {
    return bySort(a, b, sort);
  });

  return {
    ids: filtered.map(function (item) {
      return item.id;
    }),
    count: filtered.length,
  };
}

self.addEventListener("message", function (event) {
  var msg = event && event.data ? event.data : {};
  var type = msg.type;

  if (type === "init") {
    var incoming = Array.isArray(msg.items) ? msg.items : [];
    state.items = incoming
      .map(function (it, index) {
        return {
          id: clean(it.id || "card_" + index),
          search: normalize(it.search),
          lang: clean(it.lang),
          cats: Array.isArray(it.cats) ? it.cats.map(clean).filter(Boolean) : [],
          title: normalize(it.title),
          year: toYear(it.year),
          order: Number(it.order) || 0,
        };
      })
      .filter(function (it) {
        return !!it.id;
      });

    state.ready = true;
    self.postMessage({
      type: "ready",
      total: state.items.length,
    });
    return;
  }

  if (type === "query" && state.ready) {
    var result = filterAndSort(msg.payload || {});
    self.postMessage({
      type: "result",
      seq: Number(msg.seq) || 0,
      ids: result.ids,
      count: result.count,
    });
  }
});
