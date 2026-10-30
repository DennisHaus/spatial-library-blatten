"use strict";

/*
  TIMELINE
  The "Timeline" button next to the icons button shows a year slider at
  the bottom of the viewer. Moving it to a year:
    - shows every point cloud whose name contains that year
      (it is loaded first if needed),
    - hides every other point cloud whose name contains a year,
    - shows only the media icons of that year and closes open media
      windows of other years.
  Point clouds and media without a year in their name are not touched.
  "All" shows every loaded point cloud and every icon again.

  The year is the first number from 1900 to 2099 in the name, so
  "2025 Brinzauls Color" belongs to 2025.

  Needs from app.js: state, loadScan, isImageScan, closeImagePopup,
  renderLibrary, setStatus.
*/

(function () {
  var ALL = "all";

  var panel = null;
  var stops = null;
  var years = [];
  var current = ALL;
  var open = false;
  var loadTimer = null;

  function getCatalog() {
    return window.state && Array.isArray(state.catalog)
      ? state.catalog
      : [];
  }

  function yearOf(scan) {
    var match =
      String(scan && scan.name || "").match(/(?:^|\D)((?:19|20)\d{2})(?!\d)/);

    return match ? match[1] : null;
  }

  function isMedia(scan) {
    return typeof window.isImageScan === "function" &&
      window.isImageScan(scan);
  }

  function collectYears() {
    var found =
      new Set();

    getCatalog().forEach(function (scan) {
      var year =
        yearOf(scan);

      if (year) {
        found.add(year);
      }
    });

    return Array.from(found).sort();
  }

  function status(message) {
    if (typeof window.setStatus === "function") {
      window.setStatus(message, "idle");
    }
  }


  /* ------------------------------------------------------------------------ */
  /* APPLYING A YEAR                                                          */
  /* ------------------------------------------------------------------------ */

  /* Hide or show what is already loaded; returns scans still to load */
  function applyVisibility() {
    var toLoad = [];

    getCatalog().forEach(function (scan) {
      var year =
        yearOf(scan);

      if (!year) {
        return;
      }

      var match =
        current === ALL || year === current;

      if (isMedia(scan)) {
        if (
          !match &&
          state.openImages &&
          state.openImages.has(scan.id) &&
          typeof window.closeImagePopup === "function"
        ) {
          window.closeImagePopup(scan.id);
        }

        return;
      }

      var cloud =
        state.loadedClouds && state.loadedClouds.get(scan.id);

      if (cloud) {
        cloud.visible = match;
      } else if (match && current !== ALL && !scan.loading) {
        toLoad.push(scan);
      }
    });

    return toLoad;
  }

  function loadMissing(scans) {
    if (typeof window.loadScan !== "function") {
      return;
    }

    scans.forEach(function (scan) {
      /* Keep the camera where it is while scrubbing through years */
      scan.skipFitOnLoad = true;

      window.loadScan(scan).then(function () {
        /* The year may have changed while this cloud was loading */
        applyVisibility();

        if (typeof window.renderLibrary === "function") {
          window.renderLibrary();
        }
      });
    });
  }

  function setYear(year) {
    current = year;

    updateStops();

    var toLoad =
      applyVisibility();

    if (typeof window.renderLibrary === "function") {
      window.renderLibrary();
    }

    status(
      current === ALL
        ? "Timeline: all years"
        : "Timeline: " + current +
          (toLoad.length ? " (loading " + toLoad.length + ")" : "")
    );

    /* Wait until the slider stops moving before loading large files */
    window.clearTimeout(loadTimer);

    if (toLoad.length) {
      loadTimer = window.setTimeout(function () {
        loadMissing(applyVisibility());
      }, 350);
    }
  }


  /* ------------------------------------------------------------------------ */
  /* PANEL                                                                    */
  /* ------------------------------------------------------------------------ */

  function valueList() {
    return [ALL].concat(years);
  }

  function createPanel() {
    var renderArea =
      document.getElementById("potree_render_area");

    var host =
      renderArea && renderArea.parentElement;

    if (!host) {
      return null;
    }

    panel =
      document.createElement("div");

    panel.className =
      "timeline-panel hidden";

    /* A thin line with one tick per year; the line itself is the slider */
    panel.innerHTML =
      '<div class="timeline-track" role="slider" tabindex="0" ' +
        'aria-label="Year">' +
        '<div class="timeline-line"></div>' +
      '</div>';

    stops =
      panel.querySelector(".timeline-track");

    var dragging =
      false;

    function pickAt(clientX) {
      var rect =
        stops.getBoundingClientRect();

      var values =
        valueList();

      var ratio =
        (clientX - rect.left) / Math.max(rect.width, 1);

      var index =
        Math.round(Math.min(Math.max(ratio, 0), 1) * (values.length - 1));

      if (values[index] !== current) {
        setYear(values[index]);
      }
    }

    stops.addEventListener("pointerdown", function (event) {
      dragging = true;
      stops.setPointerCapture(event.pointerId);
      pickAt(event.clientX);
    });

    stops.addEventListener("pointermove", function (event) {
      if (dragging) {
        pickAt(event.clientX);
      }
    });

    ["pointerup", "pointercancel"].forEach(function (type) {
      stops.addEventListener(type, function () {
        dragging = false;
      });
    });

    stops.addEventListener("keydown", function (event) {
      var values =
        valueList();

      var index =
        values.indexOf(current);

      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        index -= 1;
      } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        index += 1;
      } else if (event.key === "Home") {
        index = 0;
      } else if (event.key === "End") {
        index = values.length - 1;
      } else {
        return;
      }

      event.preventDefault();
      setYear(values[Math.min(Math.max(index, 0), values.length - 1)]);
    });

    /* Keep clicks, drags and arrow keys from reaching the 3D viewer */
    ["pointerdown", "wheel", "keydown"].forEach(function (type) {
      panel.addEventListener(type, function (event) {
        event.stopPropagation();
      });
    });

    host.appendChild(panel);

    return panel;
  }

  function buildStops() {
    years =
      collectYears();

    var values =
      valueList();

    if (values.indexOf(current) < 0) {
      current = ALL;
    }

    stops.querySelectorAll(".timeline-tick").forEach(function (tick) {
      tick.remove();
    });

    values.forEach(function (value, index) {
      var tick =
        document.createElement("div");

      tick.className =
        "timeline-tick" + (value === ALL ? " timeline-tick-all" : "");

      tick.dataset.year = value;

      /* Even spacing, so close years stay readable */
      tick.style.left =
        (values.length > 1 ? index / (values.length - 1) * 100 : 50) + "%";

      tick.innerHTML =
        '<span class="timeline-mark"></span>' +
        '<span class="timeline-label"></span>';

      tick.querySelector(".timeline-label").textContent =
        value === ALL ? "All" : value;

      stops.appendChild(tick);
    });

    updateStops();
  }

  function updateStops() {
    if (!panel) {
      return;
    }

    stops.setAttribute(
      "aria-valuetext",
      current === ALL ? "All years" : current
    );

    stops.querySelectorAll(".timeline-tick").forEach(function (tick) {
      tick.classList.toggle("is-active", tick.dataset.year === current);
    });
  }

  function updateButton() {
    var button =
      document.getElementById("toggleTimeline");

    if (button) {
      button.setAttribute("aria-pressed", String(open));
    }
  }

  function setOpen(value) {
    if (!panel && !createPanel()) {
      return;
    }

    open = Boolean(value);

    if (open) {
      buildStops();
    }

    panel.classList.toggle("hidden", !open);
    updateButton();

    if (!open) {
      /* Closing releases the icon filter; point clouds stay as they are */
      window.clearTimeout(loadTimer);
      current = ALL;
      status("Timeline closed");
    } else if (years.length === 0) {
      status("Timeline: no names with a year found");
    }
  }

  function bindButton() {
    var button =
      document.getElementById("toggleTimeline");

    if (button) {
      button.addEventListener("click", function () {
        setOpen(!open);
      });
    }

    updateButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindButton, { once: true });
  } else {
    bindButton();
  }

  window.Timeline = {
    /* Used by media-pins.js: false hides the icon of this scan */
    allows: function (scan) {
      if (!open || current === ALL) {
        return true;
      }

      var year =
        yearOf(scan);

      return !year || year === current;
    },

    /* Called by app.js whenever the catalog is (re)loaded */
    refresh: function () {
      if (open) {
        buildStops();
      }
    },

    setYear: setYear,
    setOpen: setOpen
  };
})();
