/* Token Radar's page: one dataset, three views, no framework and no network.
 *
 * The page renders window.RADAR, which main.ts writes from the same board as board.json. It never
 * recomputes the model: every rank, multiple and band it shows is the model's own figure, so what
 * the screenshots show and what the board holds cannot drift apart.
 */
(function () {
  "use strict";

  var DATA = window.RADAR;
  var main = document.getElementById("main");
  var snapshotEl = document.getElementById("snapshot");
  var footMeta = document.getElementById("foot-meta");

  if (!DATA || !DATA.rows) {
    main.innerHTML =
      '<div class="empty"><b>The radar has no data.</b>Open this page from the program\'s output directory, beside data.js.</div>';
    return;
  }

  /* ---------- formatting ---------- */

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return "—";
    var a = Math.abs(n);
    if (a >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
    if (a >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (a >= 1e7) return "$" + (n / 1e6).toFixed(0) + "M";
    if (a >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return "$" + Math.round(n / 1e3) + "K";
    return "$" + Math.round(n);
  }

  function usdExact(n) {
    return "$" + Math.round(n).toLocaleString("en-US");
  }

  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return "—";
    var s = n > 0 ? "+" : n < 0 ? "−" : "";
    return s + Math.abs(n).toFixed(1) + "%";
  }

  function tone(n) {
    if (n === null || n === undefined || Math.abs(n) < 0.05) return "flat";
    return n > 0 ? "up" : "down";
  }

  function age(d) {
    if (d === null || d === undefined) return "—";
    if (d < 730) return d + " d";
    return (d / 365).toFixed(1) + " y";
  }

  function mult(n) {
    if (n === null || n === undefined) return "—";
    return n.toFixed(n < 1 ? 2 : 2) + "×";
  }

  function dateLabel(iso) {
    if (!iso) return "—";
    var p = iso.split("-");
    if (p.length !== 3) return iso;
    return Number(p[2]) + " " + (MONTHS[Number(p[1]) - 1] || p[1]) + " " + p[0];
  }

  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many || one + "s");
  }

  /* ---------- DOM ---------- */

  function el(tag, props) {
    var node = document.createElement(tag);
    if (props) {
      for (var key in props) {
        if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
        var value = props[key];
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key === "html") node.innerHTML = value;
        else if (key === "href") node.setAttribute("href", value);
        else if (key === "on") for (var ev in value) node.addEventListener(ev, value[ev]);
        else node.setAttribute(key, value === true ? "" : value);
      }
    }
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }

  function append(node, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) {
      for (var i = 0; i < child.length; i++) append(node, child[i]);
      return;
    }
    node.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
  }

  /* ---------- state and routing ---------- */

  var SORTS = [
    { id: "implied", label: "Implied value" },
    { id: "tvl", label: "TVL" },
    { id: "growth", label: "Seven-day growth" },
    { id: "multiple", label: "Category multiple" },
    { id: "age", label: "Age" },
    { id: "name", label: "Name" }
  ];

  var state = readHash();

  function defaults() {
    return { view: "board", scope: "all", cat: "all", chain: "all", growth: "any", sort: "implied", q: "", slug: "" };
  }

  function readHash() {
    var s = defaults();
    var raw = (location.hash || "#/board").replace(/^#\/?/, "");
    var cut = raw.indexOf("?");
    var path = cut >= 0 ? raw.slice(0, cut) : raw;
    var query = cut >= 0 ? raw.slice(cut + 1) : "";
    var parts = path.split("/").filter(Boolean);
    if (parts[0] === "p" && parts[1]) {
      s.view = "detail";
      s.slug = decodeURIComponent(parts[1]);
    } else if (parts[0] === "method") s.view = "method";
    else if (parts[0] === "live") s.view = "live";
    else s.view = "board";
    query.split("&").forEach(function (pair) {
      if (!pair) return;
      var eq = pair.indexOf("=");
      var key = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
      var value = eq < 0 ? "" : decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, " "));
      if (key in s) s[key] = value;
    });
    return s;
  }

  function hashFor(s) {
    if (s.view === "detail") return "#/p/" + encodeURIComponent(s.slug);
    if (s.view === "method") return "#/method";
    if (s.view === "live") return "#/live";
    var q = [];
    if (s.scope !== "all") q.push("scope=" + s.scope);
    if (s.cat !== "all") q.push("cat=" + encodeURIComponent(s.cat));
    if (s.chain !== "all") q.push("chain=" + encodeURIComponent(s.chain));
    if (s.growth !== "any") q.push("growth=" + s.growth);
    if (s.sort !== "implied") q.push("sort=" + s.sort);
    if (s.q) q.push("q=" + encodeURIComponent(s.q));
    return "#/board" + (q.length ? "?" + q.join("&") : "");
  }

  function go(patch, replace) {
    for (var key in patch) state[key] = patch[key];
    var hash = hashFor(state);
    if (replace && location.hash !== hash) history.replaceState(null, "", hash);
    else if (location.hash !== hash) location.hash = hash;
    else render();
  }

  window.addEventListener("hashchange", function () {
    state = readHash();
    render();
  });

  /* ---------- shared pieces ---------- */

  function navCurrent() {
    var links = document.querySelectorAll("[data-nav]");
    for (var i = 0; i < links.length; i++) {
      var name = links[i].getAttribute("data-nav");
      if (name === state.view || (state.view === "detail" && name === "board")) links[i].setAttribute("aria-current", "page");
      else links[i].removeAttribute("aria-current");
    }
  }

  function categoryColor(cat) {
    var palette = ["#0d5a49", "#a9552b", "#3f5e8c", "#7a5c9e", "#8a6d1f", "#2f7a6b", "#8c4a52", "#4a6b3a"];
    var hash = 0;
    var text = cat || "Uncategorized";
    for (var i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 9973;
    return palette[hash % palette.length];
  }

  function categoryCell(cat) {
    return el(
      "span",
      { class: "tag" },
      el("span", { style: "display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:5px;background:" + categoryColor(cat) }),
      cat || "Uncategorized"
    );
  }

  function growthCell(v) {
    return el("span", { class: tone(v), text: pct(v) });
  }

  function chainText(chains) {
    if (!chains || !chains.length) return "no chain recorded";
    if (chains.length <= 2) return chains.join(" · ");
    return chains.slice(0, 2).join(" · ") + " +" + (chains.length - 2);
  }

  /* ---------- top bar and footer ---------- */

  if (snapshotEl) {
    append(snapshotEl, [
      el("span", { class: "dot" }),
      el("span", { text: "snapshot " }),
      el("b", { text: dateLabel(DATA.as_of) }),
      el("span", { text: " · " }),
      el("b", { text: String(DATA.stats.protocols) }),
      el("span", { text: " protocols · model " }),
      el("b", { text: DATA.model_version })
    ]);
  }

  if (footMeta) {
    footMeta.textContent =
      "snapshot " +
      DATA.as_of +
      " · " +
      DATA.source +
      " · model " +
      DATA.model_version +
      " · board rebuilt from the snapshot on every run";
  }

  /* ---------- board ---------- */

  function match(row, s) {
    if (s.scope === "watchlist" && !row.watchlist) return false;
    if (s.scope === "early" && row.watchlist) return false;
    if (s.cat !== "all" && (row.category || "Uncategorized") !== s.cat) return false;
    if (s.chain !== "all" && row.chains.indexOf(s.chain) === -1) return false;
    var change = row.change_7d === null ? 0 : row.change_7d;
    if (s.growth === "rising" && change <= 0) return false;
    if (s.growth === "falling" && change >= 0) return false;
    if (s.growth === "hot" && change < 10) return false;
    if (s.q) {
      var needle = s.q.toLowerCase();
      var hay = (row.name + " " + (row.category || "") + " " + row.chains.join(" ") + " " + row.slug).toLowerCase();
      if (hay.indexOf(needle) === -1) return false;
    }
    return true;
  }

  function compare(a, b, sort) {
    if (sort === "tvl") return b.tvl_usd - a.tvl_usd;
    if (sort === "growth") return (b.change_7d || 0) - (a.change_7d || 0);
    if (sort === "multiple") return b.model.multiple - a.model.multiple;
    if (sort === "age") return (a.age_days === null ? 1e9 : a.age_days) - (b.age_days === null ? 1e9 : b.age_days);
    if (sort === "name") return a.name.localeCompare(b.name);
    return a.rank - b.rank;
  }

  function bandCell(row) {
    var lo = Math.log10(Math.max(1, row.band_low_usd));
    var hi = Math.log10(Math.max(1, row.band_high_usd));
    var pin = Math.log10(Math.max(1, row.implied_value_usd));
    var span = BAND_MAX - BAND_MIN || 1;
    var left = Math.max(0, Math.min(100, ((lo - BAND_MIN) / span) * 100));
    var width = Math.max(2, Math.min(100 - left, ((hi - lo) / span) * 100));
    var at = Math.max(0, Math.min(100, ((pin - BAND_MIN) / span) * 100));
    return el(
      "div",
      { class: "band", title: "band " + usd(row.band_low_usd) + " to " + usd(row.band_high_usd) },
      el(
        "div",
        { class: "band-track" },
        el("div", { class: "band-fill", style: "left:" + left.toFixed(1) + "%;width:" + width.toFixed(1) + "%" }),
        el("div", { class: "band-pin", style: "left:" + at.toFixed(1) + "%" })
      )
    );
  }

  var BAND_MIN = Math.log10(
    Math.max(1, Math.min.apply(null, DATA.rows.map(function (r) { return r.band_low_usd; })))
  );
  var BAND_MAX = Math.log10(
    Math.max(1, Math.max.apply(null, DATA.rows.map(function (r) { return r.band_high_usd; })))
  );

  function statStrip() {
    var st = DATA.stats;
    var cells = [
      ["Protocols read", String(st.protocols), st.pre_token + " without a token"],
      ["Watchlist", st.watchlist_in_board + "/" + st.watchlist, "every slug on the board"],
      ["Board rows", String(st.board), st.early + " early, outside the floor"],
      ["Median multiple", mult(st.median_multiple), "mcap per $1 of TVL"],
      ["Median TVL", usd(st.median_tvl), "of the rows scored"],
      ["Rising 7d", String(st.rising), st.falling + " falling, " + (st.board - st.rising - st.falling) + " flat"]
    ];
    return el(
      "section",
      { class: "stats", "aria-label": "Radar at a glance" },
      cells.map(function (c) {
        return el("div", { class: "stat" }, el("span", { text: c[0] }), el("b", { text: c[1] }), el("small", { text: c[2] }));
      })
    );
  }

  function renderBoard() {
    var rows = DATA.rows.slice();
    var categories = unique(DATA.rows.map(function (r) { return r.category || "Uncategorized"; })).sort();
    var chains = unique(
      DATA.rows.reduce(function (all, r) {
        return all.concat(r.chains);
      }, [])
    ).sort();

    main.textContent = "";

    append(main, [
      el(
        "section",
        { class: "hero" },
        el(
          "div",
          null,
          el("h1", { text: "Pre-token protocols, ranked by what their token could be worth." }),
          el(
            "p",
            { text: "The radar reads the whole protocol universe, prices each category from the tokens that already trade, and turns TVL, seven-day growth and age into one implied value — then gives every row a farm plan with its costs and its clock." }
          )
        ),
        el(
          "div",
          { class: "hero-side" },
          el("b", { text: usd(DATA.rows[0].implied_value_usd) }),
          el("span", { text: "implied value at rank 1" }),
          el("br"),
          el("span", { text: DATA.stats.watchlist_in_board + " of " + DATA.stats.watchlist + " watchlist slugs covered" })
        )
      ),
      statStrip()
    ]);

    var countEl = el("span", { class: "toolbar-meta" });
    var chipsEl = el("div", { class: "chips" });

    var search = el("input", {
      type: "search",
      placeholder: "Search protocol, category or chain",
      "aria-label": "Search the board",
      value: state.q
    });
    search.addEventListener("input", function () {
      state.q = search.value;
      history.replaceState(null, "", hashFor(state));
      apply();
    });

    var scope = el(
      "div",
      { class: "seg", role: "group", "aria-label": "Scope" },
      [
        ["all", "All"],
        ["watchlist", "Watchlist"],
        ["early", "Early radar"]
      ].map(function (pair) {
        return el("button", {
          type: "button",
          "aria-pressed": state.scope === pair[0] ? "true" : "false",
          text: pair[1],
          on: { click: function () { go({ scope: pair[0] }); } }
        });
      })
    );

    var catSelect = el(
      "select",
      { "aria-label": "Filter by category", on: { change: function () { go({ cat: catSelect.value }); } } },
      [el("option", { value: "all", text: "All categories" })].concat(
        categories.map(function (c) {
          return el("option", { value: c, text: c, selected: state.cat === c });
        })
      )
    );
    catSelect.value = state.cat;

    var chainSelect = el(
      "select",
      { "aria-label": "Filter by chain", on: { change: function () { go({ chain: chainSelect.value }); } } },
      [el("option", { value: "all", text: "All chains" })].concat(
        chains.map(function (c) {
          return el("option", { value: c, text: c, selected: state.chain === c });
        })
      )
    );
    chainSelect.value = state.chain;

    var growth = el(
      "div",
      { class: "seg", role: "group", "aria-label": "Seven-day growth" },
      [
        ["any", "Any 7d"],
        ["rising", "Rising"],
        ["hot", "Above +10%"],
        ["falling", "Falling"]
      ].map(function (pair) {
        return el("button", {
          type: "button",
          "aria-pressed": state.growth === pair[0] ? "true" : "false",
          text: pair[1],
          on: { click: function () { go({ growth: pair[0] }); } }
        });
      })
    );

    var sortSelect = el(
      "select",
      { "aria-label": "Sort by", on: { change: function () { go({ sort: sortSelect.value }); } } },
      SORTS.map(function (s) {
        return el("option", { value: s.id, text: "Sort: " + s.label, selected: state.sort === s.id });
      })
    );

    var toolbar = el(
      "div",
      { class: "toolbar" },
      el("div", { class: "search" }, search, el("kbd", { text: "/" })),
      scope,
      el("div", { class: "select" }, catSelect),
      el("div", { class: "select" }, chainSelect),
      growth,
      el("div", { class: "select" }, sortSelect),
      countEl
    );

    var tbody = el("tbody");
    var thead = el(
      "thead",
      null,
      el(
        "tr",
        null,
        el("th", { scope: "col", text: "#", style: "width:52px" }),
        el("th", { scope: "col", text: "Protocol" }),
        el("th", { scope: "col", text: "Category" }),
        el("th", { scope: "col", class: "num", text: "TVL" }),
        el("th", { scope: "col", class: "num", text: "7d" }),
        el("th", { scope: "col", class: "num", text: "Age" }),
        el("th", { scope: "col", class: "num", text: "Multiple" }),
        el("th", { scope: "col", class: "num", text: "Implied value" }),
        el("th", { scope: "col", text: "Value band" })
      )
    );

    var table = el("table", { class: "board" }, thead, tbody);
    var footNote = el("div", { class: "panel-foot" });
    var panel = el("div", { class: "panel" }, el("div", { class: "table-wrap" }, table), footNote);

    append(main, [toolbar, chipsEl, panel]);

    function apply() {
      var filtered = rows.filter(function (row) { return match(row, state); });
      filtered.sort(function (a, b) { return compare(a, b, state.sort); });
      tbody.textContent = "";
      countEl.textContent = filtered.length + " of " + rows.length + " rows";

      if (filtered.length === 0) {
        tbody.appendChild(
          el(
            "tr",
            null,
            el(
              "td",
              { colspan: "9" },
              el(
                "div",
                { class: "empty" },
                el("b", { text: "No rows on this screen." }),
                el("span", { text: "Loosen a filter, or clear the search." }),
                el("div", { style: "margin-top:10px" }, el("button", { class: "seg", type: "button", text: "Clear filters", on: { click: function () { go({ scope: "all", cat: "all", chain: "all", growth: "any", q: "" }); } } }))
              )
            )
          )
        );
        chipsEl.textContent = "";
        footNote.textContent = "";
        return;
      }

      filtered.forEach(function (row) {
        var tr = el(
          "tr",
          {
            class: "row" + (row.rank === 1 ? " top1" : row.rank <= 3 ? " top2" : ""),
            tabindex: "0",
            role: "link",
            "aria-label": "#" + row.rank + " " + row.name + ", implied " + usd(row.implied_value_usd),
            on: {
              click: function () { go({ view: "detail", slug: row.slug }); },
              keydown: function (e) {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  go({ view: "detail", slug: row.slug });
                }
              }
            }
          },
          el("td", null, el("span", { class: "rank", text: String(row.rank) })),
          el(
            "td",
            null,
            el(
              "div",
              { class: "who" },
              el("b", { text: row.name }),
              el("span", null, chainText(row.chains), row.watchlist ? el("span", { class: "wl", text: "· watchlist" }) : null)
            )
          ),
          el("td", null, categoryCell(row.category)),
          el("td", { class: "num", text: usd(row.tvl_usd) }),
          el("td", { class: "num" }, growthCell(row.change_7d)),
          el(
            "td",
            { class: "num" },
            row.age_days === null
              ? el("span", { class: "flat", text: "—" })
              : el("span", null, age(row.age_days), row.model.age_estimated ? el("small", { style: "color:var(--muted)", text: " est." }) : null)
          ),
          el(
            "td",
            { class: "num" },
            el("div", { class: "multiple" }, mult(row.model.multiple), el("small", { text: plural(row.model.comps, "comp") }))
          ),
          el("td", { class: "num" }, el("div", { class: "implied" }, usd(row.implied_value_usd), el("small", { text: "band " + usd(row.band_low_usd) + "–" + usd(row.band_high_usd) }))),
          el("td", null, bandCell(row))
        );
        tbody.appendChild(tr);
      });

      chipsEl.textContent = "";
      if (state.scope !== "all")
        chipsEl.appendChild(chip(state.scope === "watchlist" ? "Watchlist only" : "Early radar only", function () { go({ scope: "all" }); }));
      if (state.cat !== "all") chipsEl.appendChild(chip("Category: " + state.cat, function () { go({ cat: "all" }); }));
      if (state.chain !== "all") chipsEl.appendChild(chip("Chain: " + state.chain, function () { go({ chain: "all" }); }));
      if (state.growth !== "any")
        chipsEl.appendChild(chip({ rising: "Rising only", hot: "Above +10% only", falling: "Falling only" }[state.growth], function () { go({ growth: "any" }); }, true));
      if (state.q) chipsEl.appendChild(chip('Search: "' + state.q + '"', function () { go({ q: "" }); }));

      footNote.textContent = "";
      append(footNote, [
        el("span", { text: "Showing " + filtered.length + " of " + rows.length + " scored protocols · sort: " + SORTS.filter(function (s) { return s.id === state.sort; })[0].label.toLowerCase() }),
        el("span", { text: "Pick a row for its arithmetic and its farm plan →" })
      ]);
    }

    apply();
    search.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        search.value = "";
        go({ q: "" });
      }
    });
  }

  function chip(label, onRemove, warm) {
    return el(
      "span",
      { class: "chip" + (warm ? " warm" : "") },
      label,
      el("button", { type: "button", "aria-label": "Remove filter " + label, text: "×", on: { click: onRemove } })
    );
  }

  function unique(list) {
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (!seen[list[i]]) {
        seen[list[i]] = 1;
        out.push(list[i]);
      }
    }
    return out;
  }

  /* ---------- detail ---------- */

  function renderDetail() {
    var row = DATA.rows.filter(function (r) { return r.slug === state.slug; })[0];
    if (!row) {
      main.textContent = "";
      append(main, [
        el("a", { class: "back", href: "#/board", text: "← Back to the board" }),
        el("div", { class: "empty" }, el("b", { text: "That protocol is not on the board." }), "It may be outside the snapshot, or below the early radar's cut.")
      ]);
      return;
    }
    var st = DATA.stats;
    var market = DATA.market;
    var priced = DATA.categories.filter(function (c) { return c.category === (row.category || "Uncategorized"); })[0];
    var momentum = row.model.growth_multiplier;
    var maturity = row.model.maturity_multiplier;

    main.textContent = "";

    append(main, [
      el("a", { class: "back", href: hashFor(defaults()), text: "← Back to the board" }),
      el(
        "section",
        { class: "detail-head" },
        el(
          "div",
          { class: "detail-title" },
          el("h1", { text: row.name }),
          el(
            "div",
            { class: "meta" },
            el("span", { class: "rank", text: "#" + row.rank }),
            categoryCell(row.category),
            el("span", { text: row.chains.length ? row.chains.join(" · ") : "no chain recorded" }),
            row.watchlist ? el("span", { class: "chip", text: "watchlist" }) : el("span", { class: "chip warm", text: "early radar" })
          )
        ),
        el(
          "div",
          { class: "headline" },
          el("div", { class: "label", text: "Implied value" }),
          el("div", { class: "value", text: usd(row.implied_value_usd) }),
          el("div", { class: "range", text: usd(row.band_low_usd) + " – " + usd(row.band_high_usd) + " band" })
        )
      ),
      el(
        "div",
        { class: "detail-grid" },
        el(
          "div",
          null,
          el(
            "div",
            { class: "card" },
            el("h2", { text: "How this number is built" }),
            el("p", { class: "sub", text: "One function of four snapshot figures. The multiple is the market's own price for this category; the two multipliers are the protocol's own growth and age." }),
            el(
              "table",
              { class: "ledger" },
              el(
                "tbody",
                null,
                el(
                  "tr",
                  null,
                  el("th", null, "TVL", el("span", { class: "why", text: "DefiLlama's record of assets in the protocol" })),
                  el("td", { text: usdExact(row.tvl_usd) })
                ),
                el(
                  "tr",
                  null,
                  el(
                    "th",
                    null,
                    "× Category multiple",
                    el("span", { class: "why", text: (row.category || "Uncategorized") + ": " + plural(row.model.comps, "live comparable") + ", shrunk toward the market median" })
                  ),
                  el("td", { text: mult(row.model.multiple) })
                ),
                el(
                  "tr",
                  null,
                  el(
                    "th",
                    null,
                    "× Momentum",
                    el("span", { class: "why", text: "seven-day TVL change " + pct(row.change_7d) + ", clamped at " + DATA.model.growth_floor + "% to +" + DATA.model.growth_cap + "%" })
                  ),
                  el("td", { text: momentum.toFixed(2) + "×" })
                ),
                el(
                  "tr",
                  null,
                  el(
                    "th",
                    null,
                    "× Maturity",
                    el("span", { class: "why", text: age(row.age_days) + " since the protocol was first listed" + (row.model.age_estimated ? " (no listing date: 365 days assumed)" : "") })
                  ),
                  el("td", { text: maturity.toFixed(2) + "×" })
                ),
                el("tr", { class: "total" }, el("th", null, "Implied value"), el("td", { text: usdExact(row.implied_value_usd) }))
              )
            )
          ),
          el(
            "div",
            { class: "card" },
            el("h2", { text: "Why it ranks here" }),
            el(
              "p",
              { class: "why-rank" },
              row.name + " sits at rank " + row.rank + " of " + st.board + ". Its " + usd(row.tvl_usd) + " of TVL is priced at " + mult(row.model.multiple) + ", " + (priced === undefined ? "the whole market's median" : priced.used ? "the " + (row.category || "market") + " median from " + plural(priced.comps, "live comparable") + " (raw median " + mult(priced.median) + ")" : "the " + (row.category || "market") + " median shrunk hard toward the market's " + mult(market.multiple) + " because its " + plural(priced.comps, "comparable") + " is thin (raw median " + mult(priced.median) + ")") + ", then adjusted for " + pct(row.change_7d) + " seven-day growth and " + age(row.age_days) + " without a token. The band runs from " + usd(row.band_low_usd) + " to " + usd(row.band_high_usd) + ", set by the market's own dispersion and by how many comparables the category has."
            )
          ),
          el(
            "div",
            { class: "card" },
            el("h2", { text: "Comparables that price the category" }),
            el("p", { class: "sub", text: "Protocols whose token already trades, in the same category. Their market cap over TVL is what the model applies to this row." }),
            comparablesTable(priced)
          )
        ),
        el(
          "div",
          null,
          el(
            "div",
            { class: "card" },
            el("h2", { text: "Farm plan" }),
            el("p", { class: "sub", text: "Six steps, sized to this protocol's own TVL tier, each with what it costs and how long it takes." }),
            planList(row.farm_steps)
          ),
          el(
            "div",
            { class: "card" },
            el("h2", { text: "Protocol facts" }),
            factsList(row, priced)
          )
        )
      )
    ]);
  }

  function comparablesTable(priced) {
    if (!priced || !priced.top.length) {
      return el("div", { class: "note warm", text: "No live token in this category: the row is priced at the whole market's median multiple." });
    }
    return el(
      "div",
      { class: "table-wrap" },
      el(
        "table",
        { class: "data" },
        el("thead", null, el("tr", null, el("th", { text: "Protocol" }), el("th", { class: "num", text: "TVL" }), el("th", { class: "num", text: "Market cap" }), el("th", { class: "num", text: "Mcap / TVL" }))),
        el(
          "tbody",
          null,
          priced.top.map(function (t) {
            return el(
              "tr",
              null,
              el("td", null, t.name + (t.symbol ? " (" + t.symbol + ")" : "")),
              el("td", { class: "num", text: usd(t.tvl_usd) }),
              el("td", { class: "num", text: usd(t.mcap_usd) }),
              el("td", { class: "num", text: mult(t.multiple) })
            );
          })
        )
      )
    );
  }

  function factsList(row, priced) {
    var items = [
      ["Listed", dateLabel(row.listed_at) + (row.age_days === null ? " (not recorded)" : "")],
      ["Age with no token", age(row.age_days)],
      ["Seven-day TVL", pct(row.change_7d)],
      ["TVL today", usdExact(row.tvl_usd)],
      ["Chains", row.chains.length ? row.chains.join(", ") : "none recorded"],
      ["Watchlist floor", row.tvl_usd >= DATA.floor_usd ? "above the $" + usd(DATA.floor_usd) + " floor" : "below the floor, found by the model"],
      ["Category sample", priced ? plural(priced.comps, "live comparable") : "none"],
      ["Slug", row.slug]
    ];
    return el(
      "dl",
      { class: "facts" },
      items.map(function (pair) {
        return el("div", null, el("dt", { text: pair[0] }), el("dd", { class: typeof pair[1] === "string" && pair[1].indexOf(" ") >= 0 ? "text" : "", text: pair[1] }));
      })
    );
  }

  function planList(steps) {
    var parsed = steps.map(function (text) {
      var m = /^(.*) Cost: (.*)\. Time: (.*)\.$/.exec(text);
      if (!m) return { body: text, cost: "", time: "" };
      return { body: m[1], cost: m[2], time: m[3] };
    });
    return el(
      "ol",
      { class: "plan" },
      parsed.map(function (step) {
        return el(
          "li",
          null,
          el("p", { text: step.body }),
          el("div", { class: "cost" }, el("span", { text: "cost · " + step.cost }), el("span", { text: "time · " + step.time }))
        );
      })
    );
  }

  /* ---------- method ---------- */

  function renderMethod() {
    var m = DATA.model;
    var st = DATA.stats;
    var used = DATA.categories.filter(function (c) { return c.used; });
    var market = DATA.market;

    main.textContent = "";

    append(main, [
      el(
        "section",
        { class: "hero" },
        el(
          "div",
          null,
          el("h1", { text: "The model: what the market pays for a dollar of TVL." }),
          el(
            "p",
            { text: "One function scores every row. Its multiple is measured in the snapshot, its two multipliers are the protocol's own seven-day growth and age, and no protocol name is ever special-cased." }
          )
        ),
        el("div", { class: "hero-side" }, el("b", { text: String(used.length) }), el("span", { text: "of " + DATA.categories.length + " categories priced from " + m.min_comps + "+ comparables" }))
      ),
      el("div", {
        class: "formula",
        html:
          '<span class="c">// one function, four figures, every row</span><br>' +
          'multiple<span class="op">(</span>category<span class="op">) = </span><span class="v">shrink</span><span class="op">(</span> median<span class="op">(</span> mcap / tvl <span class="op">), </span>n, k=' + m.shrink_k + ' <span class="op">)</span><br>' +
          'momentum   <span class="op">= </span>1 + ' + m.growth_weight + ' × <span class="v">clamp</span><span class="op">(</span> change_7d, ' + m.growth_floor + ', +' + m.growth_cap + ' <span class="op">) </span>/ 100<br>' +
          'maturity   <span class="op">= </span>' + m.maturity_floor + ' + ' + (1 - m.maturity_floor).toFixed(2) + ' × min<span class="op">(</span> age_days, ' + m.maturity_days + ' <span class="op">) </span>/ ' + m.maturity_days + '<br>' +
          'implied    <span class="op">= </span><span class="v">round</span><span class="op">(</span> tvl × multiple × momentum × maturity <span class="op">)</span><br>' +
          '<span class="c">// the band divides the market\'s own log dispersion by the square root of the category\'s comparables, capped at ±' + m.band_log_cap + '</span>',
      }),
      el(
        "div",
        { class: "factors" },
        el("div", { class: "factor" }, el("div", { class: "n", text: "01" }), el("h3", { text: "Multiple" }), el("p", null, "For each category, the median market cap over TVL of its " + "protocols whose token already trades, shrunk toward the market median by how few stand behind it: ", el("code", { text: "(n·median + " + m.shrink_k + "·market)/(n+" + m.shrink_k + ")" }), ". Thin categories cannot claim a wild multiple on two comparables.")),
        el("div", { class: "factor" }, el("div", { class: "n", text: "02" }), el("h3", { text: "Momentum" }), el("p", null, "Seven-day TVL change is the snapshot's only forward-looking figure. It is clamped to " + m.growth_floor + "% to +" + m.growth_cap + "% so one campaign cannot swing a row, then weighted at " + m.growth_weight + ".")),
        el("div", { class: "factor" }, el("div", { class: "n", text: "03" }), el("h3", { text: "Maturity" }), el("p", null, "Age runs from the day DefiLlama began tracking the protocol — the snapshot's own record of how long it has run without a token — from " + m.maturity_floor + "× at listing to 1× after " + (m.maturity_days / 365) + " years.")),
        el("div", { class: "factor" }, el("div", { class: "n", text: "04" }), el("h3", { text: "The band" }), el("p", null, "The market's own log dispersion, divided by how many comparables the category has, sets a low and a high around the point estimate; it is capped at ±" + m.band_log_cap + " log units so no thin category claims an unbounded range. The rank is the point estimate; the band shows how much the market disagrees with itself.")),
        el("div", { class: "factor" }, el("div", { class: "n", text: "05" }), el("h3", { text: "What is left out" }), el("p", null, "Exchanges, versioned pools and wrapped, staked or bridged receipt tokens never enter the early radar, and never price a category: their TVL belongs to a token that already exists.")),
        el("div", { class: "factor" }, el("div", { class: "n", text: "06" }), el("h3", { text: "What it cannot know" }), el("p", null, "Whether a protocol will ever launch, how much it will give away, and what the market will pay on the day. The radar prices the field, not the announcement."))
      ),
      el(
        "div",
        { class: "two-col", style: "margin-top:18px" },
        el(
          "div",
          { class: "card" },
          el("h2", { text: "Category multiples" }),
          el("p", { class: "sub", text: "The raw median, the shrunk multiple the model uses, and the band its comparables support. Categories with fewer than " + m.min_comps + " comparables are shrunk toward the market median." }),
          el(
            "div",
            { class: "table-wrap" },
            el(
              "table",
              { class: "data" },
              el("thead", null, el("tr", null, el("th", { text: "Category" }), el("th", { class: "num", text: "Comps" }), el("th", { class: "num", text: "Raw" }), el("th", { class: "num", text: "Model" }), el("th", { class: "num", text: "Band" }))),
              el(
                "tbody",
                null,
                DATA.categories.slice(0, 16).map(function (c) {
                  return el(
                    "tr",
                    { class: c.used ? "" : "muted" },
                    el("td", null, c.category),
                    el("td", { class: "num", text: String(c.comps) }),
                    el("td", { class: "num", text: mult(c.median) }),
                    el("td", { class: "num" }, mult(c.multiple)),
                    el("td", { class: "num", text: mult(c.multiple_low) + " – " + mult(c.multiple_high) })
                  );
                })
              )
            )
          )
        ),
        el(
          "div",
          null,
          el(
            "div",
            { class: "card" },
            el("h2", { text: "Constants" }),
            el(
              "table",
              { class: "ledger" },
              el(
                "tbody",
                null,
                [
                  ["Shrinkage k", String(m.shrink_k)],
                  ["Minimum comps", String(m.min_comps)],
                  ["Market median", mult(market.multiple) + " · " + market.comps + " comps"],
                  ["Market dispersion", market.dispersion + " log units"],
                  ["Band cap", "±" + m.band_log_cap + " log units"],
                  ["Growth weight", String(m.growth_weight)],
                  ["Growth clamp", m.growth_floor + "% to +" + m.growth_cap + "%"],
                  ["Maturity floor", String(m.maturity_floor)],
                  ["Maturity horizon", m.maturity_days + " days"],
                  ["Unknown age", m.unknown_age_days + " days"],
                  ["Multiple clamp", m.multiple_floor + "× to " + m.multiple_cap + "×"]
                ].map(function (pair) {
                  return el("tr", null, el("th", { text: pair[0] }), el("td", { text: pair[1] }));
                })
              )
            )
          ),
          el(
            "div",
            { class: "card" },
            el("h2", { text: "Provenance" }),
            el(
              "p",
              { class: "sub" },
              "The snapshot is " + plural(st.protocols, "protocol") + " fetched " + dateLabel(DATA.as_of) + " from DefiLlama's protocols endpoint and sealed with the competition. " + st.pre_token + " record no token; " + st.watchlist + " of those meet the house's $" + usd(DATA.floor_usd) + " watchlist floor and " + st.watchlist_in_board + " of " + st.watchlist + " appear on the board, which reaches below the floor for the early radar. The live set is " + st.live + " protocols, of which " + market.comps + " are clean enough to price a category. The market's own median is " + mult(market.multiple) + " of market cap per dollar of TVL, with a log dispersion of " + market.dispersion + "."
            ),
            el("div", { class: "note", text: "Re-run the program on a new snapshot and every row, multiple and band is recomputed: the radar is the function, not this list." })
          )
        )
      )
    ]);
  }

  /* ---------- live tokens ---------- */

  function renderLive() {
    var live = DATA.live.slice().sort(function (a, b) { return (b.multiple || 0) - (a.multiple || 0); });
    var st = DATA.stats;

    main.textContent = "";

    append(main, [
      el(
        "section",
        { class: "hero" },
        el(
          "div",
          null,
          el("h1", { text: "Tokens that already trade: the model's calibration." }),
          el(
            "p",
            { text: "These protocols are never ranked on the board. Their market cap over TVL is what the model measures to price the categories the pre-token rows sit in." }
          )
        ),
        el("div", { class: "hero-side" }, el("b", { text: String(st.live) }), el("span", { text: "protocols with a token" }))
      ),
      el(
        "div",
        { class: "panel" },
        el(
          "div",
          { class: "table-wrap" },
          el(
            "table",
            { class: "board" },
            el(
              "thead",
              null,
              el("tr", null, el("th", { text: "Protocol" }), el("th", { text: "Symbol" }), el("th", { text: "Category" }), el("th", { class: "num", text: "TVL" }), el("th", { class: "num", text: "Market cap" }), el("th", { class: "num", text: "Mcap / TVL" }), el("th", { class: "num", text: "7d" }))
            ),
            el(
              "tbody",
              null,
              live.map(function (row) {
                return el(
                  "tr",
                  null,
                  el("td", null, el("div", { class: "who" }, el("b", { text: row.name }), el("span", { text: chainText(row.chains) }))),
                  el("td", { class: "num", text: row.symbol || "—" }),
                  el("td", null, categoryCell(row.category)),
                  el("td", { class: "num", text: usd(row.tvl_usd) }),
                  el("td", { class: "num", text: usd(row.mcap_usd) }),
                  el("td", { class: "num" }, el("span", { class: "multiple", text: mult(row.multiple) })),
                  el("td", { class: "num" }, growthCell(row.change_7d))
                );
              })
            )
          )
        ),
        el("div", { class: "panel-foot" }, el("span", { text: "The 30 largest by market cap among the " + st.live + " token-bearing protocols · every multiple is winsorised at the market's 5th–95th percentile before a category median is taken" }))
      )
    ]);
  }

  /* ---------- render ---------- */

  function render() {
    navCurrent();
    if (state.view === "detail") renderDetail();
    else if (state.view === "method") renderMethod();
    else if (state.view === "live") renderLive();
    else renderBoard();
    document.title =
      (state.view === "detail" && DATA.rows.filter(function (r) { return r.slug === state.slug; })[0]
        ? DATA.rows.filter(function (r) { return r.slug === state.slug; })[0].name + " · "
        : state.view === "method"
        ? "The model · "
        : state.view === "live"
        ? "Live tokens · "
        : "") + "Token Radar";
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "SELECT") {
      e.preventDefault();
      var input = document.querySelector(".search input");
      if (input) input.focus();
    }
  });

  render();
})();
