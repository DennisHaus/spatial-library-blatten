"use strict";

/*
  USAGE STATS
  Counts downloads, renders (PNG exports), documents (entries in the
  model library) and visits, and shows them in the Read Me dialog.

  Downloads, renders and visits are stored on a counter service
  (Abacus, https://abacus.jasoncameron.dev) so that all visitors share
  the same totals. Documents is the current number of catalog entries.

  Settings: LOCATION_CONFIG.usageStats in location-config.js
*/

(function () {
  var settings =
    (window.LOCATION_CONFIG &&
      window.LOCATION_CONFIG.usageStats) ||
    {};

  var enabled =
    settings.enabled !== false;

  var apiBase =
    String(
      settings.apiBase ||
      "https://abacus.jasoncameron.dev"
    ).replace(/\/+$/, "");

  var namespace =
    String(
      settings.namespace ||
      "spatial-library"
    ).replace(/[^A-Za-z0-9_.-]/g, "-");

  var COUNTERS = [
    { key: "downloads", label: "Downloads", remote: true },
    { key: "renders", label: "Renders", remote: true },
    { key: "documents", label: "Documents", remote: false },
    { key: "visits", label: "Visits", remote: true }
  ];

  var values = {
    downloads: null,
    renders: null,
    documents: null,
    visits: null
  };

  var VISIT_SESSION_KEY =
    "usageStats:visited:" + namespace;


  /* ------------------------------------------------------------------------ */
  /* RENDERING                                                                */
  /* ------------------------------------------------------------------------ */

  function formatValue(value) {
    if (value === null || value === undefined) {
      return "—";
    }

    return Number(value).toLocaleString("de-CH");
  }

  function buildMarkup(container) {
    container.innerHTML = "";

    var heading =
      document.createElement("h3");

    heading.textContent =
      "Usage";

    var grid =
      document.createElement("dl");

    grid.className =
      "usage-stats-grid";

    COUNTERS.forEach(function (counter) {
      var item =
        document.createElement("div");

      item.className =
        "usage-stat";

      var number =
        document.createElement("dd");

      number.className =
        "usage-stat-value";

      number.id =
        "usageStat-" + counter.key;

      number.textContent =
        formatValue(values[counter.key]);

      var label =
        document.createElement("dt");

      label.className =
        "usage-stat-label";

      label.textContent =
        counter.label;

      item.appendChild(label);
      item.appendChild(number);
      grid.appendChild(item);
    });

    container.appendChild(heading);
    container.appendChild(grid);
  }

  function updateDisplay() {
    COUNTERS.forEach(function (counter) {
      var element =
        document.getElementById(
          "usageStat-" + counter.key
        );

      if (element) {
        element.textContent =
          formatValue(values[counter.key]);
      }
    });
  }


  /* ------------------------------------------------------------------------ */
  /* COUNTER SERVICE                                                          */
  /* ------------------------------------------------------------------------ */

  function counterUrl(action, key) {
    return (
      apiBase +
      "/" + action +
      "/" + encodeURIComponent(namespace) +
      "/" + encodeURIComponent(key)
    );
  }

  function requestCounter(action, key) {
    return fetch(
      counterUrl(action, key),
      { cache: "no-store" }
    )
      .then(function (response) {
        /*
          A counter that has never been hit does not exist yet.
        */
        if (response.status === 404) {
          return { value: 0 };
        }

        if (!response.ok) {
          throw new Error(
            "Counter request failed: " + response.status
          );
        }

        return response.json();
      })
      .then(function (data) {
        var value =
          Number(data && data.value);

        values[key] =
          isFinite(value) ? value : null;

        updateDisplay();

        return values[key];
      })
      .catch(function (error) {
        console.warn(
          "Usage stats (" + key + "):",
          error
        );

        return null;
      });
  }

  function refresh() {
    if (!enabled) {
      return Promise.resolve();
    }

    return Promise.all(
      COUNTERS
        .filter(function (counter) {
          return counter.remote;
        })
        .map(function (counter) {
          return requestCounter("get", counter.key);
        })
    );
  }

  function track(key) {
    if (!enabled) {
      return Promise.resolve(null);
    }

    return requestCounter("hit", key);
  }

  function setDocuments(count) {
    var value =
      Number(count);

    values.documents =
      isFinite(value) ? value : null;

    updateDisplay();
  }


  /* ------------------------------------------------------------------------ */
  /* VISITS                                                                   */
  /* ------------------------------------------------------------------------ */

  /*
    One visit per browser session, so reloading the page
    does not inflate the number.
  */
  function trackVisit() {
    var alreadyCounted = false;

    try {
      alreadyCounted =
        window.sessionStorage.getItem(VISIT_SESSION_KEY) === "1";
    } catch (error) {
      alreadyCounted = false;
    }

    if (alreadyCounted) {
      return requestCounter("get", "visits");
    }

    return track("visits").then(function (value) {
      if (value !== null) {
        try {
          window.sessionStorage.setItem(VISIT_SESSION_KEY, "1");
        } catch (error) {
          /* Storage unavailable: the visit is still counted. */
        }
      }

      return value;
    });
  }


  /* ------------------------------------------------------------------------ */
  /* STARTUP                                                                  */
  /* ------------------------------------------------------------------------ */

  function initialize() {
    var container =
      document.getElementById("usageStats");

    if (!container) {
      return;
    }

    if (!enabled) {
      container.classList.add("hidden");
      return;
    }

    buildMarkup(container);

    trackVisit().then(function () {
      return Promise.all([
        requestCounter("get", "downloads"),
        requestCounter("get", "renders")
      ]);
    });

    /*
      Reload the totals whenever the Read Me is opened,
      so the numbers include other visitors' activity.
    */
    var openButton =
      document.getElementById("OpenDescription");

    if (openButton) {
      openButton.addEventListener("click", refresh);
    }
  }

  window.UsageStats = {
    track: track,
    refresh: refresh,
    setDocuments: setDocuments
  };

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }
})();
