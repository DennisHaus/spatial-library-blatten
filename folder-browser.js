"use strict";

/*
  FOLDER BROWSER
  A folder of the library can be opened as its own window, showing its
  subfolders and files as a tree. Clicking a file opens it, exactly like
  in the library (media in a window, point clouds in the 3D view).

  Folders as locations:
    1. Click the small window button next to a folder name in the
       library. The folder window opens.
    2. With that window in front, Shift + Cmd-click (Mac) or
       Shift + Ctrl-click (Windows) on a point of a scan.
    3. "Save for everyone" works as for media files. The location is
       stored in catalog.json under "folderLocations".
  Clicking the folder icon in the viewer opens the folder window again.

  Include after app.js and media-pins.js:
    <script src="./app.js"></script>
    <script src="./media-pins.js"></script>
    <script src="./folder-browser.js"></script>

  Needs from app.js: state, CONFIG, loadScan, normalizeFolderPath,
  displayScanName, displayFolderName, isImageScan, isAudioScan,
  isTextScan, formatBytes, bringImagePopupToFront, closeImagePopup,
  bindImagePopupDragging, bindImagePopupResizing, nextImagePopupZIndex.
*/

(function () {
  var folderLocations = {};
  var entryCache = new Map();

  var ICONS = {
    folder:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4.5h4l1.3 1.5H14v6.5H2z"/></svg>',
    window:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="9" rx="1"/><path d="M2.5 6h11"/></svg>',
    cloud:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="4" cy="10" r="1"/><circle cx="7" cy="7" r="1"/>' +
      '<circle cx="10" cy="9" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="6" cy="12" r="1"/></svg>',
    image:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1"/>' +
      '<path d="M2.5 11.5 6 8l3 3 2-2 2.5 2.5"/></svg>',
    video:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path class="fill" d="M5.5 3.5v9l7-4.5z"/></svg>',
    audio:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path class="fill" d="M2.5 6h2.5L8.5 3v10L5 10H2.5z"/>' +
      '<path d="M10.5 5.8a3 3 0 0 1 0 4.4"/></svg>',
    text:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2h5.5L12.5 5v9h-8.5z"/>' +
      '<path d="M6.3 7.5h4M6.3 9.8h4"/></svg>'
  };

  var CSS = [
    ".folder-popup .image-popup-content { display: block; padding: 10px 6px 12px; overflow: auto; }",
    ".fb-path { padding: 0 8px 10px; color: #8d8d8d; font-size: 10px; letter-spacing: 0.04em;",
    "  border-bottom: 1px solid #282828; margin-bottom: 6px; word-break: break-word; }",
    ".fb-list { list-style: none; margin: 0; padding: 0; }",
    ".fb-list .fb-list { margin-left: 13px; padding-left: 8px; border-left: 1px solid #282828; }",
    ".fb-row { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 0;",
    "  padding: 5px 8px; border: 0; border-radius: 4px; color: #e6e6e6; background: none;",
    "  font: inherit; font-size: 12px; text-align: left; cursor: pointer; }",
    ".fb-row:hover { background: #202226; }",
    ".fb-row:focus-visible { outline: 1px solid #ffffff; }",
    ".fb-row svg { flex: 0 0 auto; width: 14px; height: 14px; fill: none; stroke: currentColor;",
    "  stroke-width: 1.3; stroke-linejoin: round; }",
    ".fb-row svg .fill, .fb-row svg circle { fill: currentColor; stroke: none; }",
    ".fb-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    ".fb-meta { flex: 0 0 auto; color: #666666; font-size: 10px; }",
    ".fb-caret { flex: 0 0 auto; width: 8px; color: #8d8d8d; transition: transform 0.12s ease; }",
    ".fb-folder.is-open > .fb-row .fb-caret { transform: rotate(90deg); }",
    ".fb-folder > .fb-row { color: #ffffff; }",
    ".fb-file.is-loaded .fb-name::after { content: ' ●'; color: #8d8d8d; font-size: 9px; }",
    ".fb-empty { padding: 6px 8px; color: #666666; font-size: 11px; }",
    ".fb-open-window { margin-left: auto; display: inline-flex; align-items: center; justify-content: center;",
    "  width: 20px; height: 20px; min-height: 0; padding: 0; border: 0; border-radius: 3px;",
    "  color: #8d8d8d; background: none; cursor: pointer; vertical-align: middle; }",
    ".fb-open-window:hover { color: #ffffff; background: #202226; }",
    ".fb-open-window svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.3; }",
    "@media (prefers-reduced-motion: reduce) { .fb-caret { transition: none; } }"
  ].join("\n");


  /* ------------------------------------------------------------------------ */
  /* DATA                                                                     */
  /* ------------------------------------------------------------------------ */

  function getCatalog() {
    return window.state && Array.isArray(state.catalog)
      ? state.catalog
      : [];
  }

  function normalize(path) {
    return typeof window.normalizeFolderPath === "function"
      ? window.normalizeFolderPath(path)
      : String(path || "").replace(/^\/+|\/+$/g, "");
  }

  function parentOf(path) {
    var index = path.lastIndexOf("/");
    return index < 0 ? "" : path.slice(0, index);
  }

  function lastPart(path) {
    return path.split("/").pop();
  }

  function folderTitle(path) {
    var name = lastPart(path);

    return typeof window.displayFolderName === "function"
      ? window.displayFolderName(name)
      : name;
  }

  function parseLocation(value) {
    return window.MediaPins && typeof window.MediaPins.parseLocation === "function"
      ? window.MediaPins.parseLocation(value)
      : null;
  }

  /* Every folder path in the library, including parents of nested ones */
  function allFolderPaths() {
    var paths = new Set();

    getCatalog().forEach(function (scan) {
      var path = normalize(scan.folderPath);

      if (!path) {
        return;
      }

      var parts = path.split("/");

      for (var i = 1; i <= parts.length; i++) {
        paths.add(parts.slice(0, i).join("/"));
      }
    });

    return Array.from(paths).sort();
  }

  /*
    Folders as entries the pin system understands. The objects are kept,
    so pins are not rebuilt unless a location changes.
  */
  function getFolders() {
    return allFolderPaths().map(function (path) {
      var location =
        folderLocations[path] ? parseLocation(folderLocations[path]) : null;

      var entry =
        entryCache.get(path);

      var locationKey =
        JSON.stringify(location);

      if (!entry || entry._locationKey !== locationKey) {
        entry = {
          id: "folder:" + path,
          isFolder: true,
          folderKey: path,
          name: lastPart(path),
          filename: lastPart(path),
          path: "./scans/" + path + "/",
          folderPath: parentOf(path),
          location: location || undefined,
          _locationKey: locationKey
        };

        entryCache.set(path, entry);
      }

      return entry;
    });
  }

  /* folderLocations live at the top of catalog.json */
  function loadFolderLocations() {
    var config = window.CONFIG || {};
    var url = config.catalogUrl || "./catalog.json";

    fetch(
      url + (url.indexOf("?") < 0 ? "?" : "&") + "cacheBust=" + Date.now(),
      { cache: "no-store" }
    )
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (data) {
        folderLocations =
          (data && data.folderLocations) || {};

        if (window.MediaPins) {
          window.MediaPins.refresh();
        }
      })
      .catch(function () {
        /* No folder locations; folders still open from the library */
      });
  }

  function kindOf(scan) {
    if (typeof window.isTextScan === "function" && window.isTextScan(scan)) {
      return "text";
    }

    if (typeof window.isAudioScan === "function" && window.isAudioScan(scan)) {
      return "audio";
    }

    if (typeof window.isImageScan === "function" && window.isImageScan(scan)) {
      return /\.(mp4|mov|webm|m4v)(\?.*)?$/i.test(scan.url || scan.filename || "")
        ? "video"
        : "image";
    }

    return "cloud";
  }

  function fileLabel(scan) {
    return typeof window.displayScanName === "function"
      ? window.displayScanName(scan)
      : scan.name;
  }


  /* ------------------------------------------------------------------------ */
  /* TREE                                                                     */
  /* ------------------------------------------------------------------------ */

  function childrenOf(path) {
    var folders = allFolderPaths().filter(function (candidate) {
      return parentOf(candidate) === path && candidate !== path;
    });

    var files = getCatalog()
      .filter(function (scan) {
        return normalize(scan.folderPath) === path;
      })
      .sort(function (a, b) {
        return fileLabel(a).localeCompare(fileLabel(b), undefined, { numeric: true });
      });

    return { folders: folders, files: files };
  }

  function countFiles(path) {
    return getCatalog().filter(function (scan) {
      var folder = normalize(scan.folderPath);
      return folder === path || folder.indexOf(path + "/") === 0;
    }).length;
  }

  function buildList(path) {
    var list = document.createElement("ul");
    list.className = "fb-list";

    var children = childrenOf(path);

    children.folders.forEach(function (folderPath) {
      var item = document.createElement("li");
      item.className = "fb-folder";

      var row = document.createElement("button");
      row.type = "button";
      row.className = "fb-row";
      row.setAttribute("aria-expanded", "false");
      row.innerHTML =
        '<span class="fb-caret">›</span>' + ICONS.folder +
        '<span class="fb-name"></span><span class="fb-meta"></span>';
      row.querySelector(".fb-name").textContent = folderTitle(folderPath);
      row.querySelector(".fb-meta").textContent = String(countFiles(folderPath));

      row.addEventListener("click", function () {
        var open = item.classList.toggle("is-open");
        row.setAttribute("aria-expanded", String(open));

        var sub = item.querySelector(":scope > .fb-list");

        /* Subfolders are built the first time they are opened */
        if (open && !sub) {
          item.appendChild(buildList(folderPath));
        } else if (sub) {
          sub.hidden = !open;
        }
      });

      item.appendChild(row);
      list.appendChild(item);
    });

    children.files.forEach(function (scan) {
      var item = document.createElement("li");
      item.className = "fb-file";

      var kind = kindOf(scan);

      var row = document.createElement("button");
      row.type = "button";
      row.className = "fb-row";
      row.title = scan.name || scan.filename || "";
      row.innerHTML =
        '<span class="fb-caret"></span>' + ICONS[kind] +
        '<span class="fb-name"></span><span class="fb-meta"></span>';
      row.querySelector(".fb-name").textContent = fileLabel(scan);
      row.querySelector(".fb-meta").textContent =
        typeof window.formatBytes === "function" && scan.sizeBytes
          ? window.formatBytes(scan.sizeBytes)
          : "";

      if (kind === "cloud" && state.loadedClouds && state.loadedClouds.has(scan.id)) {
        item.classList.add("is-loaded");
      }

      row.addEventListener("click", function () {
        if (typeof window.loadScan === "function") {
          var result = window.loadScan(scan);

          if (kind === "cloud" && result && result.then) {
            result.then(function () {
              item.classList.toggle(
                "is-loaded",
                Boolean(state.loadedClouds && state.loadedClouds.has(scan.id))
              );
            });
          }
        }
      });

      item.appendChild(row);
      list.appendChild(item);
    });

    if (!children.folders.length && !children.files.length) {
      var empty = document.createElement("li");
      empty.className = "fb-empty";
      empty.textContent = "Empty folder";
      list.appendChild(empty);
    }

    return list;
  }


  /* ------------------------------------------------------------------------ */
  /* WINDOW                                                                   */
  /* ------------------------------------------------------------------------ */

  function open(path) {
    path = normalize(path);

    if (!path || !window.state || !state.openImages) {
      return;
    }

    var id = "folder:" + path;
    var existing = state.openImages.get(id);

    if (existing) {
      if (typeof window.bringImagePopupToFront === "function") {
        window.bringImagePopupToFront(existing);
      }
      return;
    }

    var container = document.getElementById("imagePopupContainer");

    if (!container) {
      return;
    }

    var popup = document.createElement("div");
    popup.className = "image-popup text-popup folder-popup";
    popup.dataset.scanId = id;

    var offset = state.openImages.size * 30;
    popup.style.left = 80 + offset + "px";
    popup.style.top = 80 + offset + "px";
    popup.style.width = "340px";
    popup.style.height = "440px";
    popup.style.zIndex = String(window.nextImagePopupZIndex++);

    var titlebar = document.createElement("div");
    titlebar.className = "image-popup-titlebar";

    var title = document.createElement("span");
    title.className = "image-popup-title";
    title.textContent = folderTitle(path);
    title.title = path;

    var closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "image-popup-close";
    closeButton.textContent = "×";
    closeButton.title = "Close";
    closeButton.setAttribute("aria-label", "Close folder");

    titlebar.append(title, closeButton);

    var content = document.createElement("div");
    content.className = "image-popup-content";

    var pathLine = document.createElement("div");
    pathLine.className = "fb-path";
    pathLine.textContent =
      path.split("/").map(function (part) {
        return typeof window.displayFolderName === "function"
          ? window.displayFolderName(part)
          : part;
      }).join(" / ") +
      " · " + countFiles(path) + " files";

    content.append(pathLine, buildList(path));
    popup.append(titlebar, content);

    ["ne", "se", "sw", "nw"].forEach(function (direction) {
      var handle = document.createElement("div");
      handle.className = "image-resize-handle image-resize-" + direction;
      handle.dataset.direction = direction;
      popup.appendChild(handle);
    });

    container.appendChild(popup);
    state.openImages.set(id, popup);

    closeButton.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();

      if (typeof window.closeImagePopup === "function") {
        window.closeImagePopup(id);
      }
    });

    popup.addEventListener("pointerdown", function () {
      if (typeof window.bringImagePopupToFront === "function") {
        window.bringImagePopupToFront(popup);
      }
    });

    /* Arrow keys in the tree must not move the 3D camera */
    popup.addEventListener("keydown", function (event) {
      event.stopPropagation();
    });

    if (typeof window.bindImagePopupDragging === "function") {
      window.bindImagePopupDragging(popup, titlebar, closeButton);
    }

    if (typeof window.bindImagePopupResizing === "function") {
      window.bindImagePopupResizing(popup, content);
    }

    if (typeof window.setStatus === "function") {
      window.setStatus(
        folderTitle(path) +
          " opened · Shift + Cmd/Ctrl-click in the view places this folder",
        "idle"
      );
    }
  }


  /* ------------------------------------------------------------------------ */
  /* LIBRARY BUTTONS                                                          */
  /* ------------------------------------------------------------------------ */

  function addLibraryButtons(root) {
    (root || document)
      .querySelectorAll("#libraryList details.scan-folder > summary")
      .forEach(function (summary) {
        if (summary.querySelector(".fb-open-window")) {
          return;
        }

        var path = summary.parentElement.dataset.folderPath;

        if (!path) {
          return;
        }

        var button = document.createElement("button");
        button.type = "button";
        button.className = "fb-open-window";
        button.innerHTML = ICONS.window;
        button.title = "Open folder as window";
        button.setAttribute("aria-label", "Open " + folderTitle(path) + " as window");

        /* Opening the window must not also fold the folder */
        button.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          open(path);
        });

        summary.appendChild(button);
      });
  }

  function start() {
    var style = document.createElement("style");
    style.id = "folder-browser-style";
    style.textContent = CSS;
    document.head.appendChild(style);

    addLibraryButtons();

    var list = document.getElementById("libraryList");

    if (list) {
      new MutationObserver(function () {
        addLibraryButtons(list.parentElement || document);
      }).observe(list, { childList: true, subtree: true });
    }

    loadFolderLocations();
  }

  window.FolderBrowser = {
    getFolders: getFolders,
    open: open,
    reload: loadFolderLocations
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
