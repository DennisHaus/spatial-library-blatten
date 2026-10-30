"use strict";

/*
  MEDIA PINS
  Images, videos, audio and text files can be linked to a location in the
  point cloud. They then appear as small icons in the viewer; clicking
  an icon opens the file.

  Setting or changing a location:
    1. Open a media file from the library (its window must be the
       frontmost media window).
    2. Shift + Cmd-click (Mac) or Shift + Ctrl-click (Windows) on a
       point of a scan. Doing it again moves the icon.
  Shift + Cmd/Ctrl-click on an icon removes the location.
  The icons button or the P key cycles through three modes:
    all     - every icon is shown
    colors  - every icon is shown, colored by its folder
    folders - only icons whose folder is expanded in the library
              (icons outside any folder are always shown)
    none    - no icons

  Where locations are stored:
    - First in this browser (localStorage), so they survive a reload.
    - "Save for everyone" in the bar at the bottom right opens GitHub
      with a small file locations/<date-time>.json already filled in.
      After "Commit changes", generate_catalog.py writes the locations
      into catalog.json as "location": [x, y, z], and every visitor
      sees them. Once catalog.json contains them, the browser copies
      are cleared automatically.

  Needs from app.js: viewer, state, CONFIG, pickPointAt, setStatus,
  openImagePopup, isImageScan, isAudioScan.
  Needs from measure.js: MeasureTool.project.
*/

(function () {
  var STORAGE_KEY =
    "mediaPins:" + window.location.pathname;

  var localPins =
    readLocalPins();

  var VISIBILITY_KEY =
    "mediaPinsVisible:" + window.location.pathname;

  var layer = null;
  var bar = null;
  var frame = null;
  var MODES = ["all", "colors", "folders", "none"];

  /* Folder colors: distinct, but soft enough for a dark point cloud */
  var FOLDER_COLORS = [
    "#6cc4ff", /* sky */
    "#ffb35c", /* apricot */
    "#7fdc8f", /* mint */
    "#f78fb3", /* rose */
    "#c3a2ff", /* lavender */
    "#ffe066", /* butter */
    "#4fd1c5", /* teal */
    "#ff7f6e", /* coral */
    "#a8d672", /* lime */
    "#9fb4ff"  /* periwinkle */
  ];
  var mode = readMode();
  var pinElements = new Map();

  var ICONS = {
    image:
      '<svg viewBox="0 0 16 16" aria-hidden="true">' +
        '<rect x="2" y="3" width="12" height="10" rx="1"/>' +
        '<path d="M2.5 11.5 6 8l3 3 2-2 2.5 2.5"/>' +
        '<circle cx="11" cy="6" r="1"/>' +
      "</svg>",

    video:
      '<svg viewBox="0 0 16 16" aria-hidden="true">' +
        '<path class="fill" d="M5.5 3.5v9l7-4.5z"/>' +
      "</svg>",

    audio:
      '<svg viewBox="0 0 16 16" aria-hidden="true">' +
        '<path class="fill" d="M2.5 6h2.5L8.5 3v10L5 10H2.5z"/>' +
        '<path d="M10.5 5.8a3 3 0 0 1 0 4.4M12.3 4a5.5 5.5 0 0 1 0 8"/>' +
      "</svg>",

    text:
      '<svg viewBox="0 0 16 16" aria-hidden="true">' +
        '<path d="M4 2h5.5L12.5 5v9h-8.5z"/>' +
        '<path d="M6.3 7.5h4M6.3 9.8h4M6.3 12h2.6"/>' +
      "</svg>"
  };


  /* ------------------------------------------------------------------------ */
  /* STORAGE                                                                  */
  /* ------------------------------------------------------------------------ */

  function readLocalPins() {
    try {
      var stored =
        JSON.parse(
          window.localStorage.getItem(STORAGE_KEY) || "{}"
        );

      return stored && typeof stored === "object"
        ? stored
        : {};
    } catch (error) {
      return {};
    }
  }

  function writeLocalPins() {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(localPins)
      );
    } catch (error) {
      status("Location could not be saved in this browser.", "error");
    }
  }

  function readMode() {
    try {
      var stored =
        window.localStorage.getItem(VISIBILITY_KEY);

      /* Older versions stored "true" / "false" */
      if (stored === "false") {
        return "none";
      }

      return MODES.indexOf(stored) >= 0 ? stored : "all";
    } catch (error) {
      return "all";
    }
  }

  function writeMode() {
    try {
      window.localStorage.setItem(VISIBILITY_KEY, mode);
    } catch (error) {
      /* ignore */
    }
  }

  function hasLocal(id) {
    return Object.prototype.hasOwnProperty.call(localPins, id);
  }

  function sameLocation(a, b) {
    if (!a || !b) {
      return !a && !b;
    }

    return (
      Math.abs(a.x - b.x) < 0.0015 &&
      Math.abs(a.y - b.y) < 0.0015 &&
      Math.abs(a.z - b.z) < 0.0015
    );
  }

  /* Repository path of a catalog entry, e.g. scans/photo.jpg */
  function repoPath(scan) {
    return String(scan.path || scan.filename || "")
      .replace(/\\/g, "/")
      .replace(/^\.\//, "");
  }

  function parseLocation(value) {
    if (!value) {
      return null;
    }

    var list =
      Array.isArray(value)
        ? value
        : [value.x, value.y, value.z];

    var numbers =
      list.slice(0, 3).map(Number);

    return numbers.length === 3 &&
      numbers.every(function (n) { return isFinite(n); })
      ? { x: numbers[0], y: numbers[1], z: numbers[2] }
      : null;
  }

  function round(value) {
    return Math.round(value * 1000) / 1000;
  }


  /* ------------------------------------------------------------------------ */
  /* HELPERS                                                                  */
  /* ------------------------------------------------------------------------ */

  function status(text, type) {
    if (typeof window.setStatus === "function") {
      window.setStatus(text, type || "idle");
    }
  }

  function getCatalog() {
    return window.state && Array.isArray(state.catalog)
      ? state.catalog
      : [];
  }

  function isMedia(scan) {
    return typeof window.isImageScan === "function" &&
      window.isImageScan(scan);
  }

  function mediaKind(scan) {
    if (
      typeof window.isTextScan === "function" &&
      window.isTextScan(scan)
    ) {
      return "text";
    }

    if (
      typeof window.isAudioScan === "function" &&
      window.isAudioScan(scan)
    ) {
      return "audio";
    }

    var format =
      String(scan.format || "").toLowerCase();

    if (
      format === "mp4" ||
      format === "mov" ||
      format === "video" ||
      /\.(mp4|mov)(\?.*)?$/i.test(scan.url || scan.path || scan.filename || "")
    ) {
      return "video";
    }

    return "image";
  }

  /*
    A location set in this browser wins over catalog.json.
    null in this browser means "removed".
  */
  function getLocation(scan) {
    if (hasLocal(scan.id)) {
      return parseLocation(localPins[scan.id]);
    }

    return scan.location || null;
  }

  /*
    Forget browser changes that catalog.json already contains,
    for example after "Save for everyone" went through.
  */
  function clearSavedChanges() {
    var changed = false;

    getCatalog().forEach(function (scan) {
      if (
        hasLocal(scan.id) &&
        sameLocation(
          parseLocation(localPins[scan.id]),
          scan.location || null
        )
      ) {
        delete localPins[scan.id];
        changed = true;
      }
    });

    if (changed) {
      writeLocalPins();
    }
  }

  function getChangedScans() {
    return getCatalog().filter(function (scan) {
      return hasLocal(scan.id);
    });
  }

  function getViewerPanel() {
    var renderArea =
      document.getElementById("potree_render_area");

    return renderArea
      ? renderArea.parentElement
      : null;
  }

  function getCanvas() {
    return (
      window.viewer &&
      viewer.renderer &&
      viewer.renderer.domElement
    ) || null;
  }

  /* The media file whose window is in front */
  function getFrontMedia() {
    if (!window.state || !state.openImages) {
      return null;
    }

    var bestId = null;
    var bestZ = -Infinity;

    state.openImages.forEach(function (popup, id) {
      var z =
        Number(popup.style.zIndex) || 0;

      if (z >= bestZ) {
        bestZ = z;
        bestId = id;
      }
    });

    if (bestId === null) {
      return null;
    }

    return getCatalog().find(function (scan) {
      return scan.id === bestId;
    }) || null;
  }


  /* ------------------------------------------------------------------------ */
  /* PINS IN THE VIEW                                                         */
  /* ------------------------------------------------------------------------ */

  function createLayer() {
    var host =
      getViewerPanel();

    if (!host) {
      return null;
    }

    layer =
      document.createElement("div");

    layer.className =
      "media-pin-layer";

    host.appendChild(layer);

    return layer;
  }

  function createPin(scan) {
    var pin =
      document.createElement("button");

    pin.type =
      "button";

    pin.className =
      "media-pin media-pin-" + mediaKind(scan);

    pin.innerHTML =
      ICONS[mediaKind(scan)] +
      '<span class="media-pin-label"></span>';

    pin.querySelector(".media-pin-label").textContent =
      typeof window.displayScanName === "function"
        ? window.displayScanName(scan)
        : scan.name;

    pin.setAttribute(
      "aria-label",
      "Open " + scan.name
    );

    /* Do not let a click on a pin move the camera */
    pin.addEventListener(
      "pointerdown",
      function (event) {
        event.stopPropagation();
      }
    );

    pin.addEventListener(
      "click",
      function (event) {
        event.preventDefault();

        if (
          event.shiftKey &&
          (event.metaKey || event.ctrlKey)
        ) {
          removePin(scan);
          return;
        }

        if (typeof window.openImagePopup === "function") {
          window.openImagePopup(scan);
        }
      }
    );

    return pin;
  }

  function rebuild() {
    if (!layer && !createLayer()) {
      return;
    }

    clearSavedChanges();

    var wanted =
      new Map();

    getCatalog().forEach(function (scan) {
      if (
        isMedia(scan) &&
        getLocation(scan)
      ) {
        wanted.set(scan.id, scan);
      }
    });

    pinElements.forEach(function (entry, id) {
      if (!wanted.has(id)) {
        entry.element.remove();
        pinElements.delete(id);
      }
    });

    wanted.forEach(function (scan, id) {
      var entry =
        pinElements.get(id);

      if (!entry || entry.scan !== scan) {
        if (entry) {
          entry.element.remove();
        }

        entry = {
          scan: scan,
          element: createPin(scan)
        };

        layer.appendChild(entry.element);
        pinElements.set(id, entry);
      }
    });

    updateBar();
    updateToggleButton();
    applyFolderColors();

    if (pinElements.size > 0) {
      startLoop();
    } else {
      stopLoop();
    }
  }

  function updatePins() {
    if (!layer) {
      return;
    }

    layer.style.display =
      mode === "none" ? "none" : "";

    if (mode === "none") {
      return;
    }

    var openFolders =
      mode === "folders" ? getOpenFolderPaths() : null;

    var project =
      window.MeasureTool && window.MeasureTool.project;

    if (typeof project !== "function") {
      return;
    }

    var front =
      getFrontMedia();

    pinElements.forEach(function (entry) {
      var location =
        getLocation(entry.scan);

      var position =
        location ? project(location) : null;

      var element =
        entry.element;

      if (
        !position ||
        (openFolders && !isInOpenFolder(entry.scan, openFolders)) ||
        (window.Timeline && !window.Timeline.allows(entry.scan))
      ) {
        element.style.display = "none";
        return;
      }

      element.style.display = "";
      element.style.transform =
        "translate(" + position.x + "px, " + position.y + "px)";

      element.classList.toggle(
        "is-current",
        Boolean(front && front.id === entry.scan.id)
      );
    });
  }

  /*
    Folder paths that are actually visible in the library: the folder
    itself and every parent folder must be expanded.
  */
  function getOpenFolderPaths() {
    var open =
      new Set();

    document
      .querySelectorAll("#libraryList details.scan-folder")
      .forEach(function (folder) {
        if (!folder.open || !folder.dataset.folderPath) {
          return;
        }

        var parent =
          folder.parentElement &&
          folder.parentElement.closest("details.scan-folder");

        while (parent) {
          if (!parent.open) {
            return;
          }

          parent =
            parent.parentElement &&
            parent.parentElement.closest("details.scan-folder");
        }

        open.add(folder.dataset.folderPath);
      });

    return open;
  }

  function isInOpenFolder(scan, openFolders) {
    var path =
      typeof window.normalizeFolderPath === "function"
        ? window.normalizeFolderPath(scan.folderPath)
        : String(scan.folderPath || "");

    /* Media at the top level of the library has no folder to expand */
    return !path || openFolders.has(path);
  }

  function folderPathOf(scan) {
    return typeof window.normalizeFolderPath === "function"
      ? window.normalizeFolderPath(scan.folderPath)
      : String(scan.folderPath || "");
  }

  function folderColor(index) {
    if (index < FOLDER_COLORS.length) {
      return FOLDER_COLORS[index];
    }

    /* More folders than colors: spread further hues by the golden angle */
    return "hsl(" + Math.round((index * 137.508) % 360) + ", 75%, 70%)";
  }

  /*
    Same folder, same color. The order comes from all media folders in
    the catalog, so a folder keeps its color when pins are added.
  */
  function applyFolderColors() {
    var colored =
      mode === "colors";

    var paths =
      new Set();

    if (colored) {
      getCatalog().forEach(function (scan) {
        var path =
          isMedia(scan) && folderPathOf(scan);

        if (path) {
          paths.add(path);
        }
      });
    }

    var order =
      Array.from(paths).sort();

    pinElements.forEach(function (entry) {
      var element =
        entry.element;

      var path =
        colored ? folderPathOf(entry.scan) : "";

      var label =
        element.querySelector(".media-pin-label");

      var folderLine =
        label && label.querySelector(".media-pin-folder");

      if (folderLine) {
        folderLine.remove();
      }

      /* Media at the top level of the library stays white */
      if (!path) {
        element.classList.remove("is-colored");
        element.style.removeProperty("--pin-color");
        return;
      }

      element.classList.add("is-colored");
      element.style.setProperty(
        "--pin-color",
        folderColor(order.indexOf(path))
      );

      if (label) {
        folderLine =
          document.createElement("span");

        folderLine.className =
          "media-pin-folder";

        folderLine.textContent =
          typeof window.displayFolderName === "function"
            ? window.displayFolderName(path.split("/").pop())
            : path.split("/").pop();

        label.appendChild(folderLine);
      }
    });
  }

  function loop() {
    updatePins();
    frame = window.requestAnimationFrame(loop);
  }

  function startLoop() {
    if (frame === null) {
      loop();
    }
  }

  function stopLoop() {
    if (frame !== null) {
      window.cancelAnimationFrame(frame);
      frame = null;
    }
  }


  /* ------------------------------------------------------------------------ */
  /* SETTING AND REMOVING LOCATIONS                                           */
  /* ------------------------------------------------------------------------ */

  function setLocalPin(scan, point) {
    localPins[scan.id] =
      [round(point.x), round(point.y), round(point.z)];

    writeLocalPins();
    rebuild();

    var entry =
      pinElements.get(scan.id);

    if (entry) {
      entry.element.classList.remove("is-new");
      void entry.element.offsetWidth;
      entry.element.classList.add("is-new");
    }

    status("Location set for " + scan.name);
  }

  function removePin(scan) {
    if (scan.location) {
      /* Hide the catalog location until it is saved for everyone */
      localPins[scan.id] = null;
    } else {
      delete localPins[scan.id];
    }

    writeLocalPins();
    rebuild();

    status("Location removed from " + scan.name);
  }

  /*
    Called by app.js at the start of its pointerdown handler.
    Shift + Cmd/Ctrl-click sets the location of the front media file.
  */
  function handlePointerDown(event) {
    if (
      !event.shiftKey ||
      !(event.metaKey || event.ctrlKey) ||
      event.button !== 0
    ) {
      return false;
    }

    event.preventDefault();

    var scan =
      getFrontMedia();

    if (!scan) {
      status(
        "Open an image, video or audio file from the library first.",
        "error"
      );

      return true;
    }

    var canvas =
      getCanvas();

    if (
      !canvas ||
      typeof window.pickPointAt !== "function"
    ) {
      return true;
    }

    var rect =
      canvas.getBoundingClientRect();

    var point =
      window.pickPointAt(
        event.clientX - rect.left,
        event.clientY - rect.top
      );

    if (!point) {
      status("No point found there. Click directly on a scan.", "error");
      return true;
    }

    setLocalPin(scan, point);

    return true;
  }


  /* ------------------------------------------------------------------------ */
  /* PINS BAR: SAVE FOR EVERYONE                                              */
  /* ------------------------------------------------------------------------ */

  function pad(number) {
    return String(number).padStart(2, "0");
  }

  function timestamp() {
    var now =
      new Date();

    return (
      now.getFullYear() + "-" +
      pad(now.getMonth() + 1) + "-" +
      pad(now.getDate()) + "-" +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      pad(now.getSeconds())
    );
  }

  function buildLocationsFile() {
    var locations = {};

    getChangedScans().forEach(function (scan) {
      var location =
        parseLocation(localPins[scan.id]);

      locations[repoPath(scan)] =
        location
          ? [round(location.x), round(location.y), round(location.z)]
          : null;
    });

    return {
      savedAt: new Date().toISOString(),
      locations: locations
    };
  }

  /*
    GitHub "create new file" page in the locations folder.
    Taken from locationsSaveUrl in location-config.js, or derived from
    uploadUrl (https://github.com/OWNER/REPO/upload/BRANCH/...).
  */
  function getGitHubNewFileUrl() {
    var config =
      window.LOCATION_CONFIG || {};

    if (config.locationsSaveUrl) {
      return String(config.locationsSaveUrl);
    }

    var match =
      String(config.uploadUrl || "").match(
        /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/upload\/([^/]+)/
      );

    return match
      ? "https://github.com/" + match[1] + "/" + match[2] +
        "/new/" + match[3] + "/locations"
      : null;
  }

  function downloadFile(name, content) {
    var blob =
      new Blob([content], { type: "application/json" });

    var link =
      document.createElement("a");

    link.href =
      URL.createObjectURL(blob);

    link.download =
      name;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(function () {
      URL.revokeObjectURL(link.href);
    }, 2000);
  }

  function saveForEveryone() {
    var changes =
      getChangedScans().length;

    if (changes === 0) {
      return;
    }

    var name =
      timestamp() + ".json";

    var content =
      JSON.stringify(buildLocationsFile(), null, 2) + "\n";

    var base =
      getGitHubNewFileUrl();

    var url =
      base
        ? base +
          "?filename=" + encodeURIComponent(name) +
          "&value=" + encodeURIComponent(content)
        : null;

    /* Very long addresses are refused by browsers and GitHub */
    if (url && url.length < 7500) {
      window.open(url, "_blank", "noopener");

      status(
        "GitHub opened: click \"Commit changes\". " +
        "The locations appear for everyone after the catalog update."
      );

      return;
    }

    downloadFile(name, content);

    status(
      "Downloaded " + name + ": upload it to the locations folder of the repository."
    );
  }

  function discardChanges() {
    getChangedScans().forEach(function (scan) {
      delete localPins[scan.id];
    });

    writeLocalPins();
    rebuild();

    status("Location changes discarded");
  }

  function createBar() {
    var host =
      getViewerPanel();

    if (!host) {
      return null;
    }

    bar =
      document.createElement("div");

    bar.className =
      "media-pin-bar hidden";

    bar.innerHTML =
      '<span class="media-pin-bar-text"></span>' +
      '<button type="button" class="measure-button" data-pins="discard" ' +
        'title="Undo the location changes made in this browser">Discard</button>' +
      '<button type="button" class="measure-button media-pin-save" data-pins="save" ' +
        'title="Commit these locations to the repository so every visitor sees them">' +
        "Save for everyone</button>";

    bar.addEventListener(
      "pointerdown",
      function (event) {
        event.stopPropagation();
      }
    );

    bar.addEventListener(
      "click",
      function (event) {
        var button =
          event.target.closest("[data-pins]");

        if (!button) {
          return;
        }

        if (button.dataset.pins === "save") {
          saveForEveryone();
        }

        if (button.dataset.pins === "discard") {
          discardChanges();
        }
      }
    );

    host.appendChild(bar);

    return bar;
  }

  function updateBar() {
    if (!bar && !createBar()) {
      return;
    }

    var count =
      getChangedScans().length;

    bar.classList.toggle(
      "hidden",
      count === 0
    );

    bar.querySelector(".media-pin-bar-text").textContent =
      count +
      (count === 1 ? " location change" : " location changes") +
      " in this browser only";
  }


  /* ------------------------------------------------------------------------ */
  /* SHOW / HIDE                                                              */
  /* ------------------------------------------------------------------------ */

  function updateToggleButton() {
    var button =
      document.getElementById("toggleMediaIcons");

    if (!button) {
      return;
    }

    button.textContent = {
      all: "Icons: All",
      colors: "Icons: By Folder",
      folders: "Icons: Open Folders",
      none: "Icons: Hidden"
    }[mode];

    button.setAttribute(
      "aria-pressed",
      String(mode !== "none")
    );
  }

  function setMode(value) {
    mode = MODES.indexOf(value) >= 0 ? value : "all";

    writeMode();
    updateToggleButton();
    applyFolderColors();
    updatePins();

    status({
      all: "All media icons shown",
      colors: "Media icons colored by folder",
      folders: "Media icons shown for expanded folders only",
      none: "Media icons hidden"
    }[mode]);
  }

  function cycleMode() {
    setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
  }

  /* Kept for older callers: true = all, false = none */
  function setVisible(value) {
    setMode(value ? "all" : "none");
  }

  /* ------------------------------------------------------------------------ */
  /* STARTUP                                                                  */
  /* ------------------------------------------------------------------------ */

  document.addEventListener(
    "keydown",
    function (event) {
      var tag =
        String(event.target && event.target.tagName || "").toLowerCase();

      if (
        (event.key === "p" || event.key === "P") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        tag !== "input" &&
        tag !== "textarea" &&
        tag !== "select" &&
        !(event.target && event.target.isContentEditable)
      ) {
        cycleMode();
      }
    }
  );

  function bindToggleButton() {
    var button =
      document.getElementById("toggleMediaIcons");

    if (button) {
      button.addEventListener("click", function () {
        cycleMode();
      });
    }

    updateToggleButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      bindToggleButton,
      { once: true }
    );
  } else {
    bindToggleButton();
  }

  window.MediaPins = {
    handlePointerDown: handlePointerDown,

    /* Called by app.js whenever the catalog is (re)loaded */
    refresh: function () {
      rebuild();
    },

    setVisible: setVisible,

    setMode: setMode,

    parseLocation: parseLocation
  };
})();
