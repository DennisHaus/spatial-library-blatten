"use strict";

/*
  Local Potree COPC viewer.

  Required script order in index.html:

  1. Potree dependencies
  2. libs/copc/index.js
  3. build/potree/potree.js
  4. libs/plasio/js/laslaz.js
  5. app.js
*/


/* -------------------------------------------------------------------------- */
/* CONFIGURATION                                                              */
/* -------------------------------------------------------------------------- */

var LOCATION_CONFIG =
  window.LOCATION_CONFIG || {};

var CONFIG = {
  catalogUrl:
    LOCATION_CONFIG.catalogUrl ||
    "./catalog.json",

  defaultPointBudget:
    30000000,

  navigationSpeed:
    0.35,

  /*
    Mouse navigation: "orbit", "fly" or "walk" when the viewer opens
    (location-config.js can set navigationMode too). The last mode a
    visitor chose is remembered in their browser.
  */
  navigationMode:
    "fly",

  /* How far the view turns per pixel of mouse drag */
  lookSensitivity:
    0.004,

  /* Smoothing in seconds: higher = softer, lower = more direct */
  lookSmoothing:
    0.06,

  zoomSmoothing:
    0.12,

  glideTime:
    0.25,

  /*
    With a section active, the exported PNG is cropped to the
    visible points (plus a small margin). false = full viewer.
  */
  cropExportToSection:
    true,

  screenshotScale:
    5,

  screenshotWarmupMs:
    600,

  useRawBaseForPaths:
    LOCATION_CONFIG.useRawBaseForPaths === true,

  /*
    Share of the viewer the model fills when zooming to it
    (0.9 = 10% margin around the model).
  */
  fitFactor:
    0.9,

  /*
    1 = exact fit. Below 1 moves closer, above 1 farther away.
  */
  fitDistanceMultiplier:
    1,

  rawBaseUrl:
    LOCATION_CONFIG.rawBaseUrl ||
    "",

  scanPathPrefix:
    LOCATION_CONFIG.scanPathPrefix ||
    "scans/",

  downloadPassword:
    LOCATION_CONFIG.downloadPassword ||
    ""
};


/* -------------------------------------------------------------------------- */
/* APPLICATION STATE                                                          */
/* -------------------------------------------------------------------------- */

var state = {
  catalog: [],
  loadedClouds: new Map(),
  openImages: new Map(),
  activeScan: null,
  activeCloud: null,
  activeBounds: null,
  sectionVolume: null,
  navigationSpeed:
    Number(
      CONFIG.navigationSpeed
    ) ||
    0.35
};

var nextImagePopupZIndex = 10000;

var viewer =
  null;



/* -------------------------------------------------------------------------- */
/* STARTUP                                                                    */
/* -------------------------------------------------------------------------- */

document.addEventListener(
  "DOMContentLoaded",
  function () {
    initialize();
  }
);

function initialize() {
  bindEvents();
  initializeControls();

  if (!initializeViewer()) {
    return;
  }

  bindNavigationKeyboard();

  loadCatalog()
    .then(
      function () {
        renderLibrary();

        if (
          state.catalog.length >
          0
        ) {
          return loadScan(
            state.catalog[0]
          );
        }

        setViewerStatus(
          "No scans available",
          "idle"
        );

        setStatus(
          "No scans found in catalog.json",
          "idle"
        );

        return null;
      }
    )
    .catch(
      function (error) {
        console.error(
          "Application startup failed:",
          error
        );

        setStatus(
          "Application startup failed.",
          "error"
        );
      }
    );
}


/* -------------------------------------------------------------------------- */
/* DOM HELPERS                                                                */
/* -------------------------------------------------------------------------- */

function getElement(
  id
) {
  return document.getElementById(
    id
  );
}

function setText(
  id,
  value
) {
  var element =
    getElement(
      id
    );

  if (
    element
  ) {
    element.textContent =
      String(
        value
      );
  }
}

function addEvent(
  id,
  eventName,
  handler
) {
  var element =
    getElement(
      id
    );

  if (
    element
  ) {
    element.addEventListener(
      eventName,
      handler
    );
  }
}

function initializeControls() {
  applyPointSize();
  applyOpacity();
  applyPointBudget();
  applyPointDisplayMode();
  updateSectionControls();
}

function setDropdownState(
  button,
  content,
  expanded
) {
  if (
    !button ||
    !content
  ) {
    return;
  }

  content.classList.toggle(
    "hidden",
    !expanded
  );

  button.setAttribute(
    "aria-expanded",
    String(
      expanded
    )
  );

  var panel =
    button.closest(
      ".library-panel, .inspector-panel"
    );

  if (
    panel
  ) {
    panel.classList.toggle(
      "is-expanded",
      expanded
    );

    panel.classList.toggle(
      "is-collapsed",
      !expanded
    );
  }

  var arrow =
    button.querySelector(
      ".dropdown-arrow"
    );

  if (
    arrow
  ) {
    arrow.textContent =
      expanded
        ? "⌄"
        : "⌃";
  }

  updatePanelLayout();
}


function bindDropdown(
  buttonId,
  contentId
) {
  var button =
    getElement(
      buttonId
    );

  var content =
    getElement(
      contentId
    );

  if (
    !button ||
    !content
  ) {
    console.warn(
      "Dropdown elements not found:",
      buttonId,
      contentId
    );

    return;
  }

  var expanded =
    button.getAttribute(
      "aria-expanded"
    ) ===
    "true";

  setDropdownState(
    button,
    content,
    expanded
  );

  button.addEventListener(
    "click",
    function (event) {
      event.preventDefault();
      event.stopPropagation();

      var currentlyExpanded =
        button.getAttribute(
          "aria-expanded"
        ) ===
        "true";

      setDropdownState(
        button,
        content,
        !currentlyExpanded
      );
    }
  );
}

function updatePanelLayout() {
  var workspace =
    document.querySelector(
      ".workspace"
    );

  var topbar =
    document.querySelector(
      ".topbar"
    );

  var statusbar =
    document.querySelector(
      ".statusbar"
    );

  var library =
    getElement(
      "libraryDropdownContent"
    );

  var libraryPanel =
    document.querySelector(
      ".library-panel"
    );

  var inspectorPanel =
    document.querySelector(
      ".inspector-panel"
    );

  var inspectorButton =
    getElement(
      "toggleInspector"
    );

  if (
    !workspace ||
    !topbar ||
    !statusbar ||
    !libraryPanel ||
    !inspectorPanel ||
    !inspectorButton
  ) {
    return;
  }

  /*
    Keep the existing mobile layout.
  */
  if (
    window.innerWidth <=
    850
  ) {
    libraryPanel.style.removeProperty(
      "top"
    );

    libraryPanel.style.removeProperty(
      "height"
    );

    libraryPanel.style.removeProperty(
      "bottom"
    );

    inspectorPanel.style.removeProperty(
      "top"
    );

    inspectorPanel.style.removeProperty(
      "height"
    );

    inspectorPanel.style.removeProperty(
      "bottom"
    );

    return;
  }

  var workspaceHeight =
    workspace.clientHeight ||
    window.innerHeight;

  var headerHeight =
    topbar.offsetHeight;

  var statusHeight =
    statusbar.offsetHeight;

  var panelAreaTop =
    headerHeight;

  var panelAreaBottom =
    workspaceHeight -
    statusHeight;

  var panelAreaHeight =
    Math.max(
      panelAreaBottom -
      panelAreaTop,
      0
    );

  var libraryHeader =
    libraryPanel.querySelector(
      ".panel-header"
    );

  var libraryHeaderHeight =
    libraryHeader
      ? libraryHeader.offsetHeight
      : 48;

  var inspectorToggleHeight =
    inspectorButton.offsetHeight ||
    48;

  var libraryButton =
    getElement(
      "toggleLibrary"
    );

  var libraryExpanded =
    libraryButton &&
    libraryButton.getAttribute(
      "aria-expanded"
    ) ===
    "true";

  var inspectorExpanded =
    inspectorButton.getAttribute(
      "aria-expanded"
    ) ===
    "true";

  var libraryHeight;
  var inspectorHeight;

  if (
    libraryExpanded &&
    inspectorExpanded
  ) {
    /*
      The library takes only the height its scans need, the
      inspector gets the rest. A long library keeps at least 35%
      and scrolls.
    */
    var libraryNeed =
      measureLibraryHeight(
        libraryPanel,
        libraryHeaderHeight
      );

    var inspectorNeed =
      measureInspectorHeight(
        inspectorToggleHeight
      );

    libraryHeight =
      Math.min(
        libraryNeed,
        Math.max(
          panelAreaHeight - inspectorNeed,
          Math.floor(panelAreaHeight * 0.35)
        ),
        panelAreaHeight - inspectorToggleHeight
      );

    inspectorHeight =
      panelAreaHeight -
      libraryHeight;
  } else if (
    libraryExpanded
  ) {
    libraryHeight =
      Math.max(
        panelAreaHeight -
        inspectorToggleHeight,
        libraryHeaderHeight
      );

    inspectorHeight =
      panelAreaHeight -
      libraryHeight;
  } else if (
    inspectorExpanded
  ) {
    libraryHeight =
      libraryHeaderHeight;

    inspectorHeight =
      panelAreaHeight -
      libraryHeight;
  } else {
    libraryHeight =
      libraryHeaderHeight;

    inspectorHeight =
      inspectorToggleHeight;
  }

  libraryHeight =
    Math.max(
      libraryHeight,
      libraryHeaderHeight
    );

  inspectorHeight =
    Math.max(
      inspectorHeight,
      inspectorToggleHeight
    );

  /*
    Position the library.
  */
  libraryPanel.style.setProperty(
    "top",
    panelAreaTop +
    "px",
    "important"
  );

  libraryPanel.style.setProperty(
    "bottom",
    "auto",
    "important"
  );

  libraryPanel.style.setProperty(
    "height",
    libraryHeight +
    "px",
    "important"
  );

  /*
    Position the inspector directly below
    the library.
  */
  inspectorPanel.style.setProperty(
    "top",
    panelAreaTop +
    libraryHeight +
    "px",
    "important"
  );

  inspectorPanel.style.setProperty(
    "bottom",
    statusHeight +
    "px",
    "important"
  );

  inspectorPanel.style.setProperty(
    "height",
    inspectorHeight +
    "px",
    "important"
  );
}


/* -------------------------------------------------------------------------- */
/* POTREE INITIALIZATION                                                      */
/* -------------------------------------------------------------------------- */

function initializeViewer() {
  var potree =
    window.Potree;

  if (
    !potree
  ) {
    setStatus(
      "Potree is not loaded.",
      "error"
    );

    console.error(
      "window.Potree is undefined."
    );

    return false;
  }

  if (
    typeof potree.Viewer !==
    "function"
  ) {
    setStatus(
      "Potree Viewer is unavailable.",
      "error"
    );

    console.error(
      "Potree.Viewer is not available."
    );

    return false;
  }

  var renderArea =
    getElement(
      "potree_render_area"
    );

  if (
    !renderArea
  ) {
    setStatus(
      "The Potree render area is missing.",
      "error"
    );

    return false;
  }

  try {
    viewer =
      new potree.Viewer(
        renderArea
      );

    disableXROnViewer();

    if (
      typeof viewer.setEDLEnabled ===
      "function"
    ) {
      viewer.setEDLEnabled(
        false
      );
    }

    if (
      typeof viewer.setFOV ===
      "function"
    ) {
      viewer.setFOV(
        60
      );
    }

    if (
      typeof viewer.setPointBudget ===
      "function"
    ) {
      viewer.setPointBudget(
        CONFIG.defaultPointBudget
      );
    }

    if (
      typeof viewer.setBackground ===
      "function"
    ) {
      viewer.setBackground(
        "none"
      );
    }

    /*
      Start with a transparent WebGL clear color.
    */
    if (
      viewer.renderer
    ) {
      if (
        typeof viewer.renderer.setClearColor ===
        "function"
      ) {
        viewer.renderer.setClearColor(
          0x000000,
          0
        );
      }

      if (
        typeof viewer.renderer.setClearAlpha ===
        "function"
      ) {
        viewer.renderer.setClearAlpha(
          0
        );
      }
    }

    installNavigation();

    window.addEventListener(
      "resize",
      function () {
        if (
          viewer &&
          typeof viewer.onWindowResize ===
          "function"
        ) {
          viewer.onWindowResize();
        }
      }
    );

    setViewerStatus(
      "Ready",
      "idle"
    );

    setStatus(
      "Ready",
      "idle"
    );

    return true;
  } catch (
    error
  ) {
    console.error(
      "Potree initialization failed:",
      error
    );

    setViewerStatus(
      "Potree initialization failed",
      "error"
    );

    setStatus(
      "Could not initialize Potree.",
      "error"
    );

    return false;
  }
}

function disableXROnViewer() {
  if (
    !viewer
  ) {
    return;
  }

  if (
    viewer.vrControls
  ) {
    viewer.vrControls =
      null;
  }

  if (
    viewer.deviceOrientationControls
  ) {
    viewer.deviceOrientationControls =
      null;
  }

  var renderer =
    viewer.renderer ||
    null;

  if (
    renderer &&
    renderer.xr
  ) {
    renderer.xr.enabled =
      false;
  }
}


/* -------------------------------------------------------------------------- */
/* CATALOG                                                                    */
/* -------------------------------------------------------------------------- */

function loadCatalog() {
  var separator =
    CONFIG.catalogUrl.indexOf(
      "?"
    ) === -1
      ? "?"
      : "&";

  var requestUrl =
    CONFIG.catalogUrl +
    separator +
    "cacheBust=" +
    Date.now();

  return fetch(
    requestUrl,
    {
      cache: "no-store"
    }
  )
    .then(
      function (response) {
        if (
          !response.ok
        ) {
          throw new Error(
            "Catalog request failed with HTTP " +
            response.status
          );
        }

        return response.json();
      }
    )
    .then(
      function (data) {
        var entries =
  [];

if (
  Array.isArray(
    data
  )
) {
  entries =
    data;
} else if (
  data &&
  Array.isArray(
    data.scans
  )
) {
  entries =
    data.scans;
} else if (
  data &&
  Array.isArray(
    data.folders
  )
) {
  entries =
    data.folders;
}

var scans =
  flattenCatalogEntries(
    entries,
    ""
  );

        var previousScans =
          new Map();

        state.catalog.forEach(
          function (oldScan) {
            previousScans.set(
              oldScan.id,
              oldScan
            );
          }
        );

        state.catalog =
          scans.map(
            function (
              scan,
              index
            ) {
              var normalized =
                normalizeScan(
                  scan,
                  index
                );

              var previous =
                previousScans.get(
                  normalized.id
                );

              if (
                previous &&
                previous.loading
              ) {
                normalized.loading =
                  true;
              }

              return normalized;
            }
          );

        reconcileLoadedClouds();
        updateScanCount();

        return state.catalog;
      }
    )
    .catch(
      function (error) {
        console.error(
          "Could not load catalog.json:",
          error
        );

        setStatus(
          "Could not load catalog.json.",
          "error"
        );

        updateScanCount();

        return state.catalog;
      }
    );
}

function normalizeFolderPath(
  value
) {
  var path =
    String(
      value ||
      ""
    )
      .replace(
        /\\/g,
        "/"
      )
      .replace(
        /^\.\/+/,
        ""
      )
      .replace(
        /^\/+/,
        ""
      )
      .replace(
        /\/+$/,
        ""
      );

  var parts =
    path
      .split("/")
      .filter(
        function (part) {
          return Boolean(
            part
          );
        }
      );

  if (
    parts.length &&
    parts[0].toLowerCase() ===
    "scans"
  ) {
    parts.shift();
  }

  return parts.join("/");
}

function joinFolderPath(
  parent,
  child
) {
  var combined =
    [
      parent,
      child
    ]
      .filter(
        function (value) {
          return String(
            value ||
            ""
          ).trim();
        }
      )
      .join("/");

  return normalizeFolderPath(
    combined
  );
}

function flattenCatalogEntries(
  entries,
  parentFolder
) {
  var result =
    [];

  if (
    !Array.isArray(
      entries
    )
  ) {
    return result;
  }

  entries.forEach(
    function (entry) {
      if (
        !entry ||
        typeof entry !==
        "object"
      ) {
        return;
      }

      var children =
        Array.isArray(
          entry.children
        )
          ? entry.children
          : Array.isArray(
              entry.scans
            )
            ? entry.scans
            : null;

      if (
        children
      ) {
        var folderName =
          entry.folderName ||
          entry.folder ||
          entry.directory ||
          entry.name ||
          entry.title ||
          "";

        var folderPath =
          joinFolderPath(
            parentFolder,
            folderName
          );

        result =
          result.concat(
            flattenCatalogEntries(
              children,
              folderPath
            )
          );

        return;
      }

      var scan =
        Object.assign(
          {},
          entry
        );

      var ownFolder =
        scan.folderPath ||
        scan.folder ||
        scan.directory ||
        scan.category ||
        "";

      scan.folderPath =
        joinFolderPath(
          parentFolder,
          ownFolder
        );

      result.push(
        scan
      );
    }
  );

  return result;
}

function isImageScan(scan) {
  if (!scan) {
    return false;
  }

  var format =
    String(
      scan.format ||
      ""
    ).toLowerCase();

  if (
    format === "jpg" ||
    format === "jpeg" ||
    format === "png" ||
    format === "image" ||
    format === "mp4" ||
    format === "mov" ||
    format === "video"
  ) {
    return true;
  }

  return /\.(jpg|jpeg|png|mp4|mov)(\?.*)?$/i.test(
    scan.url ||
    scan.path ||
    scan.filename ||
    ""
  );
}

function normalizeScan(
  scan,
  index
) {
  scan =
    scan ||
    {};

  var fallbackId =
    "scan-" +
    (
      index +
      1
    );

  var id =
    String(
      scan.id ||
      scan.filename ||
      fallbackId
    );

  var filename =
    String(
      scan.filename ||
      ""
    );

  var name =
    String(
      scan.name ||
      filename ||
      id
    );

    var scanPathPrefix =
    String(
      CONFIG.scanPathPrefix ||
      "scans/"
    ).replace(
      /\/+$/,
      ""
    ) + "/";

  var path =
    String(
      scan.path ||
      (
        filename
          ? scanPathPrefix +
            filename
          : ""
      )
    );

  /*
    Folder can be supplied explicitly in the catalog.
    Supported properties:
      folderPath
      folder
      directory
      category
  */
  var folderPath =
    String(
      scan.folderPath ||
      scan.folder ||
      scan.directory ||
      scan.category ||
      ""
    ).trim();

  /*
    If no folder was explicitly supplied, derive it
    from the scan path.

    Example:
      scans/2026/day-01/scan.copc.laz
      becomes:
      2026/day-01
  */
  if (
    !folderPath &&
    path &&
    !/^https?:\/\//i.test(
      path
    )
  ) {
    var pathWithoutQuery =
      path.split(
        "?"
      )[0];

    var lastSlash =
      pathWithoutQuery.lastIndexOf(
        "/"
      );

    if (
      lastSlash >
      -1
    ) {
      folderPath =
        pathWithoutQuery.substring(
          0,
          lastSlash
        );
    }
  }

  folderPath =
    normalizeFolderPath(
      folderPath
    );

  var suppliedUrl =
    String(
      scan.url ||
      ""
    ).trim();

  var url =
    "";

  if (
    suppliedUrl
  ) {
    url =
      resolveUrl(
        suppliedUrl
      );
  } else if (
    path &&
    CONFIG.useRawBaseForPaths
  ) {
    url =
      buildRawUrl(
        path
      );
  } else if (
    path
  ) {
    url =
      resolveUrl(
        path
      );
  }
  var normalizedFormat =
    String(
      scan.format ||
      ""
    ).toLowerCase();

  if (
    !normalizedFormat
  ) {
    normalizedFormat =
      /\.(jpg|jpeg|png|mp4|mov)(\?.*)?$/i.test(
        path ||
        filename
      )
        ? "image"
        : "copc";
  }

  return {
    id: id,

    name: name,

    filename: filename,

    path: path,

    folderPath: folderPath,

    url: url,

    format:
      normalizedFormat,

    sizeBytes:
      Number(
        scan.sizeBytes ||
        0
      ),

    pointCount:
      Number(
        scan.pointCount ||
        0
      ),

    crs:
      scan.crs ||
      "Unknown",

    uploadedAt:
      scan.uploadedAt ||
      "",

    loading: false
  };
}

function resolveUrl(
  value
) {
  try {
    return new URL(
      value,
      document.baseURI
    ).href;
  } catch (
    error
  ) {
    console.error(
      "Invalid scan URL:",
      value,
      error
    );

    return "";
  }
}

function buildRawUrl(
  path
) {
  var base =
    CONFIG.rawBaseUrl.replace(
      /\/+$/,
      ""
    );

  var encodedPath =
    path
      .split(
        "/"
      )
      .map(
        function (part) {
          return encodeURIComponent(
            part
          );
        }
      )
      .join(
        "/"
      );

  return (
    base +
    "/" +
    encodedPath
  );
}

function reconcileLoadedClouds() {
  var catalogIds =
    new Set(
      state.catalog.map(
        function (scan) {
          return scan.id;
        }
      )
    );

  var removedActiveCloud =
    false;

  state.loadedClouds.forEach(
    function (
      pointcloud,
      scanId
    ) {
      if (
        catalogIds.has(
          scanId
        )
      ) {
        return;
      }

      if (
        viewer &&
        viewer.scene &&
        typeof viewer.scene.removePointCloud ===
        "function"
      ) {
        viewer.scene.removePointCloud(
          pointcloud
        );
      }

      state.loadedClouds.delete(
        scanId
      );

      if (
        state.activeScan &&
        state.activeScan.id ===
        scanId
      ) {
        removedActiveCloud =
          true;
      }
    }
  );

  if (
    removedActiveCloud
  ) {
    removeSectionVolume();

    state.activeScan =
      null;

    state.activeCloud =
      null;

    state.activeBounds =
      null;

    setViewerStatus(
      "No scan selected",
      "idle"
    );
  }

  if (
    state.activeScan
  ) {
    var refreshedScan =
      state.catalog.find(
        function (scan) {
          return (
            scan.id ===
            state.activeScan.id
          );
        }
      );

    if (
      refreshedScan
    ) {
      state.activeScan =
        refreshedScan;

      state.activeCloud =
        state.loadedClouds.get(
          refreshedScan.id
        );

        state.activeBounds =
  getPointCloudBounds(
    state.activeCloud
  );

if (
  !state.activeBounds &&
  typeof window.getPointCloudWorldBounds ===
  "function"
) {
  state.activeBounds =
    window.getPointCloudWorldBounds(
      state.activeCloud
    );
}

  if (
    !state.activeBounds &&
    typeof getPointCloudWorldBounds ===
    "function"
  ) {
    state.activeBounds =
      getPointCloudWorldBounds(
        state.activeCloud
      );
  }
    }
  }

  updateInspector();
  updateSectionControls();
}


/* -------------------------------------------------------------------------- */
/* LIBRARY                                                                    */
/* -------------------------------------------------------------------------- */

function updateScanCount() {
  var count =
    Array.isArray(
      state.catalog
    )
      ? state.catalog.length
      : 0;

  setText(
    "scanCount",
    count +
    " " +
    (
      count === 1
        ? "scan"
        : "scans"
    )
  );
}

function buildLibraryTree(
  scans
) {
  var root = {
    folders: new Map(),
    scans: []
  };

  scans.forEach(
    function (scan) {
      var folderPath =
        normalizeFolderPath(
          scan.folderPath
        );

      if (
        !folderPath
      ) {
        root.scans.push(
          scan
        );

        return;
      }

      var parts =
        folderPath
          .split("/")
          .filter(
            function (part) {
              return Boolean(
                part
              );
            }
          );

      var node =
        root;

      parts.forEach(
        function (part) {
          if (
            !node.folders.has(
              part
            )
          ) {
            node.folders.set(
              part,
              {
                folders: new Map(),
                scans: []
              }
            );
          }

          node =
            node.folders.get(
              part
            );
        }
      );

      node.scans.push(
        scan
      );
    }
  );

  return root;
}

function scanMatchesQuery(
  scan,
  query
) {
  if (
    !query
  ) {
    return true;
  }

  var searchable =
    (
      scan.name +
      " " +
      scan.filename +
      " " +
      scan.path
    ).toLowerCase();

  return (
    searchable.indexOf(
      query
    ) !==
    -1
  );
}

function treeContainsQuery(
  node,
  query
) {
  if (
    !query
  ) {
    return true;
  }

  if (
    node.scans.some(
      function (scan) {
        return scanMatchesQuery(
          scan,
          query
        );
      }
    )
  ) {
    return true;
  }

  var found =
    false;

  node.folders.forEach(
    function (child) {
      if (
        treeContainsQuery(
          child,
          query
        )
      ) {
        found =
          true;
      }
    }
  );

  return found;
}

function countTreeScans(
  node
) {
  var count =
    node.scans.length;

  node.folders.forEach(
    function (child) {
      count +=
        countTreeScans(
          child
        );
    }
  );

  return count;
}

function createScanCard(
  scan
) {
  var card =
    document.createElement(
      "button"
    );

  card.type =
    "button";

  card.className =
    "scan-card";

  var imageScan =
    isImageScan(
      scan
    );

  if (
    imageScan
  ) {
    card.classList.add(
      "image-card"
    );
  }

  if (
    state.activeScan &&
    state.activeScan.id ===
    scan.id
  ) {
    card.classList.add(
      "active"
    );
  }

  var header =
    document.createElement(
      "div"
    );

  header.className =
    "scan-card-header";

  var icon =
    document.createElement(
      "div"
    );
    icon.className =
  "scan-card-icon";

  var name =
    document.createElement(
      "div"
    );

  name.className =
    "scan-name";

    if (
    imageScan
  ) {
    name.classList.add(
      "image-scan-name"
    );
  }


  name.textContent =
    scan.name;

  name.title =
    scan.name;

  var scanState =
    document.createElement(
      "div"
    );

  scanState.className =
    "scan-state";

  if (
    scan.loading
  ) {
    scanState.classList.add(
      "loading"
    );
  } else if (
    imageScan ||
    state.loadedClouds.has(
      scan.id
    )
  ) {
    scanState.classList.add(
      "loaded"
    );
  }

  var pointcloud =
    state.loadedClouds.get(
      scan.id
    );

  /*
    Images are considered loaded because
    they are regular browser resources rather
    than Potree point clouds.
  */
  var isLoaded =
    imageScan ||
    Boolean(
      pointcloud
    );

  var isVisible;

  if (
  imageScan
) {
  isVisible =
    state.openImages.has(
      scan.id
    );
} else {
    isVisible =
      isLoaded &&
      pointcloud.visible !==
      false;
  }

  var visibilityToggle =
    document.createElement(
      "span"
    );

  visibilityToggle.className =
    "scan-visibility-toggle";

  visibilityToggle.textContent =
    isLoaded
      ? (
          isVisible
            ? "●"
            : "○"
        )
      : "·";

  visibilityToggle.title =
    imageScan
      ? "Open image"
      : (
          isLoaded
            ? (
                isVisible
                  ? "Hide scan"
                  : "Show scan"
              )
            : "Load scan"
        );

  visibilityToggle.setAttribute(
    "role",
    "button"
  );

  visibilityToggle.setAttribute(
    "aria-label",
    visibilityToggle.title
  );

  visibilityToggle.setAttribute(
    "aria-pressed",
    String(
      isVisible
    )
  );

  visibilityToggle.tabIndex =
    0;

  visibilityToggle.addEventListener(
    "click",
    function (
      event
    ) {
      event.preventDefault();
      event.stopPropagation();

      toggleScanVisibility(
        scan
      );
    }
  );

  visibilityToggle.addEventListener(
    "keydown",
    function (
      event
    ) {
      if (
        event.key ===
          "Enter" ||
        event.key ===
          " "
      ) {
        event.preventDefault();
        event.stopPropagation();

        toggleScanVisibility(
          scan
        );
      }
    }
  );

  header.appendChild(
    icon
  );

  header.appendChild(
    name
  );

  header.appendChild(
    scanState
  );

  header.appendChild(
    visibilityToggle
  );

  var metadata =
    document.createElement(
      "div"
    );

  metadata.className =
    "scan-meta";

  var format =
    document.createElement(
      "span"
    );

  format.textContent =
    imageScan
      ? String(
          scan.format ||
          "image"
        ).toUpperCase()
      : "COPC";

  var size =
    document.createElement(
      "span"
    );

  size.textContent =
    scan.sizeBytes
      ? formatBytes(
          scan.sizeBytes
        )
      : "Size unknown";

  metadata.appendChild(
    format
  );

  metadata.appendChild(
    size
  );

  card.appendChild(
    header
  );

  card.appendChild(
    metadata
  );

  card.addEventListener(
    "click",
    function () {
      selectScan(
        scan
      );
    }
  );

  return card;
}

function renderLibraryTree(
  node,
  container,
  query,
  parentFolderPath,
  openFolders,
  firstRender
) {
  parentFolderPath =
    parentFolderPath ||
    "";

  openFolders =
    openFolders ||
    new Set();

  node.folders.forEach(
    function (
      child,
      folderName
    ) {
      if (
        !treeContainsQuery(
          child,
          query
        )
      ) {
        return;
      }

      var folderPath =
        parentFolderPath
          ? parentFolderPath +
            "/" +
            folderName
          : folderName;

      var folder =
        document.createElement(
          "details"
        );

      folder.className =
        "scan-folder";

      folder.dataset.folderPath =
        folderPath;

      /*
        Open foldopers on the first render.
        Afterwards, restore the user's
        previous open/closed state.
      */
      folder.open =
        firstRender
          ? false
          : openFolders.has(
              folderPath
            );

      var summary =
        document.createElement(
          "summary"
        );

      summary.textContent =
        folderName;

      var count =
        document.createElement(
          "span"
        );

      count.className =
        "scan-folder-count";

      count.textContent =
        countTreeScans(
          child
        );

      summary.appendChild(
        count
      );

      var contents =
        document.createElement(
          "div"
        );

      contents.className =
        "scan-folder-contents";

      folder.appendChild(
        summary
      );

      folder.appendChild(
        contents
      );

      renderLibraryTree(
        child,
        contents,
        query,
        folderPath,
        openFolders,
        firstRender
      );

      container.appendChild(
        folder
      );
    }
  );

  node.scans.forEach(
    function (
      scan
    ) {
      if (
        scanMatchesQuery(
          scan,
          query
        )
      ) {
        container.appendChild(
          createScanCard(
            scan
          )
        );
      }
    }
  );
}

function renderLibrary() {
  var list =
    getElement(
      "libraryList"
    );

  var empty =
    getElement(
      "libraryEmpty"
    );

  var search =
    getElement(
      "scanSearch"
    );

  if (
    !list
  ) {
    return;
  }

  /*
    Remember which folders are currently open.
  */
  var openFolders =
    new Set();

  list
    .querySelectorAll(
      "details.scan-folder"
    )
    .forEach(
      function (
        folder
      ) {
        if (
          folder.open &&
          folder.dataset.folderPath
        ) {
          openFolders.add(
            folder.dataset.folderPath
          );
        }
      }
    );

  var hasRenderedBefore =
    list.dataset.libraryRendered ===
    "true";

  var query =
    search &&
    search.value
      ? search.value
        .trim()
        .toLowerCase()
      : "";

  while (
    list.firstChild
  ) {
    list.removeChild(
      list.firstChild
    );
  }

  updateScanCount();

  var visibleScans =
    state.catalog.filter(
      function (
        scan
      ) {
        return scanMatchesQuery(
          scan,
          query
        );
      }
    );

  if (
    visibleScans.length ===
    0
  ) {
    if (
      empty
    ) {
      empty.classList.remove(
        "hidden"
      );
    }

    list.dataset.libraryRendered =
      "true";

    return;
  }

  if (
    empty
  ) {
    empty.classList.add(
      "hidden"
    );
  }

  var tree =
    buildLibraryTree(
      state.catalog
    );

  renderLibraryTree(
    tree,
    list,
    query,
    "",
    openFolders,
    !hasRenderedBefore
  );

  list.dataset.libraryRendered =
    "true";
}

function openImagePopup(
  scan
) {
  if (
    !scan ||
    !scan.url
  ) {
    setStatus(
      "This media file has no valid URL.",
      "error"
    );

    return;
  }

  var existingPopup =
    state.openImages.get(
      scan.id
    );

  if (
    existingPopup
  ) {
    bringImagePopupToFront(
      existingPopup
    );

    return;
  }

  var container =
    getElement(
      "imagePopupContainer"
    );

  if (
    !container
  ) {
    setStatus(
      "Media popup container is unavailable.",
      "error"
    );

    return;
  }

  var popup =
    document.createElement(
      "div"
    );

  popup.className =
    "image-popup";

  popup.dataset.scanId =
    scan.id;

  var offset =
    state.openImages.size *
    30;

  popup.style.left =
    80 +
    offset +
    "px";

  popup.style.top =
    80 +
    offset +
    "px";

  popup.style.zIndex =
    String(
      nextImagePopupZIndex++
    );

  var titlebar =
    document.createElement(
      "div"
    );

  titlebar.className =
    "image-popup-titlebar";

  var title =
    document.createElement(
      "span"
    );

  title.className =
    "image-popup-title";

  title.textContent =
    scan.name ||
    scan.filename ||
    "Media";

  var closeButton =
    document.createElement(
      "button"
    );

  closeButton.type =
    "button";

  closeButton.className =
    "image-popup-close";

  closeButton.textContent =
    "×";

  closeButton.title =
    "Close";

  closeButton.setAttribute(
    "aria-label",
    "Close media"
  );

  titlebar.appendChild(
    title
  );

  titlebar.appendChild(
    closeButton
  );

  var content =
    document.createElement(
      "div"
    );

  content.className =
    "image-popup-content";

  var media;
  var isVideo =
    /\.mp4(\?.*)?$/i.test(
      scan.url ||
      scan.path ||
      scan.filename ||
      ""
    ) ||
    String(
      scan.format ||
      ""
    ).toLowerCase() ===
      "mp4";

  if (
    isVideo
  ) {
    media =
      document.createElement(
        "video"
      );

    media.controls =
      true;

    media.preload =
      "metadata";

    media.playsInline =
      true;

    media.setAttribute(
      "aria-label",
      scan.name ||
      "Video"
    );
  } else {
    media =
      document.createElement(
        "img"
      );

    media.alt =
      scan.name ||
      scan.filename ||
      "Image";
  }

  media.src =
    scan.url;

  content.appendChild(
    media
  );

  popup.appendChild(
    titlebar
  );

  popup.appendChild(
    content
  );

  [
    "ne",
    "se",
    "sw",
    "nw"
  ].forEach(
    function (
      direction
    ) {
      var handle =
        document.createElement(
          "div"
        );

      handle.className =
        "image-resize-handle " +
        "image-resize-" +
        direction;

      handle.dataset.direction =
        direction;

      popup.appendChild(
        handle
      );
    }
  );

  container.appendChild(
    popup
  );

  state.openImages.set(
    scan.id,
    popup
  );

  closeButton.addEventListener(
    "click",
    function (
      event
    ) {
      event.preventDefault();
      event.stopPropagation();

      closeImagePopup(
        scan.id
      );
    }
  );

  popup.addEventListener(
    "pointerdown",
    function () {
      bringImagePopupToFront(
        popup
      );
    }
  );

  bindImagePopupDragging(
    popup,
    titlebar,
    closeButton
  );

  bindImagePopupResizing(
    popup,
    media
  );

  if (
    isVideo
  ) {
    media.addEventListener(
      "loadedmetadata",
      function () {
        setImagePopupAspectRatio(
          popup,
          media
        );
      }
    );
  } else {
    media.addEventListener(
      "load",
      function () {
        setImagePopupAspectRatio(
          popup,
          media
        );
      }
    );
  }

  if (
    (
      !isVideo &&
      media.complete &&
      media.naturalWidth >
      0
    ) ||
    (
      isVideo &&
      media.readyState >=
      1
    )
  ) {
    setImagePopupAspectRatio(
      popup,
      media
    );
  }

  setStatus(
    scan.name +
    " opened",
    "idle"
  );
}


function closeImagePopup(
  scanId
) {
  var popup =
    state.openImages.get(
      scanId
    );

  if (
    !popup
  ) {
    return;
  }

  popup.remove();

  state.openImages.delete(
    scanId
  );

  /*
    Do not call renderLibrary().
    Rebuilding the library would reset
    the folder state.
  */
  setStatus(
    "Image closed",
    "idle"
  );
}


function bringImagePopupToFront(
  popup
) {
  if (
    !popup
  ) {
    return;
  }

  popup.style.zIndex =
    String(
      nextImagePopupZIndex++
    );
}


function setImagePopupAspectRatio(
  popup,
  media
) {
  if (
    !popup ||
    !media
  ) {
    return;
  }

  var mediaWidth =
    media.naturalWidth ||
    media.videoWidth ||
    0;

  var mediaHeight =
    media.naturalHeight ||
    media.videoHeight ||
    0;

  if (
    !mediaWidth ||
    !mediaHeight
  ) {
    return;
  }

  var aspectRatio =
    mediaWidth /
    mediaHeight;

  if (
    !isFinite(
      aspectRatio
    ) ||
    aspectRatio <= 0
  ) {
    return;
  }

  popup.dataset.aspectRatio =
    String(
      aspectRatio
    );

  var width =
    popup.offsetWidth ||
    620;

  var height =
    width /
    aspectRatio;

  var minimumWidth =
    240;

  var minimumHeight =
    minimumWidth /
    aspectRatio;

  if (
    height <
    minimumHeight
  ) {
    height =
      minimumHeight;

    width =
      height *
      aspectRatio;
  }

  var maximumWidth =
    window.innerWidth *
    0.8;

  var maximumHeight =
    window.innerHeight *
    0.8;

  if (
    width >
    maximumWidth
  ) {
    width =
      maximumWidth;

    height =
      width /
      aspectRatio;
  }

  if (
    height >
    maximumHeight
  ) {
    height =
      maximumHeight;

    width =
      height *
      aspectRatio;
  }

  popup.style.width =
    Math.round(
      width
    ) +
    "px";

  popup.style.height =
    Math.round(
      height
    ) +
    "px";
}

function bindImagePopupDragging(
  popup,
  titlebar,
  closeButton
) {
  titlebar.addEventListener(
    "pointerdown",
    function (
      event
    ) {
      if (
        event.target ===
        closeButton
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      bringImagePopupToFront(
        popup
      );

      var rect =
        popup.getBoundingClientRect();

      var startX =
        event.clientX;

      var startY =
        event.clientY;

      var startLeft =
        rect.left;

      var startTop =
        rect.top;

      function move(
        moveEvent
      ) {
        var left =
          startLeft +
          moveEvent.clientX -
          startX;

        var top =
          startTop +
          moveEvent.clientY -
          startY;

        var maxLeft =
          window.innerWidth -
          popup.offsetWidth;

        var maxTop =
          window.innerHeight -
          popup.offsetHeight;

        popup.style.left =
          clamp(
            left,
            0,
            Math.max(
              maxLeft,
              0
            )
          ) +
          "px";

        popup.style.top =
          clamp(
            top,
            0,
            Math.max(
              maxTop,
              0
            )
          ) +
          "px";
      }

      function end() {
        window.removeEventListener(
          "pointermove",
          move
        );

        window.removeEventListener(
          "pointerup",
          end
        );

        window.removeEventListener(
          "pointercancel",
          end
        );
      }

      window.addEventListener(
        "pointermove",
        move
      );

      window.addEventListener(
        "pointerup",
        end
      );

      window.addEventListener(
        "pointercancel",
        end
      );
    }
  );
}


function bindImagePopupResizing(
  popup,
  media
) {
  var handles =
    popup.querySelectorAll(
      ".image-resize-handle"
    );

  handles.forEach(
    function (
      handle
    ) {
      handle.addEventListener(
        "pointerdown",
        function (
          event
        ) {
          event.preventDefault();
          event.stopPropagation();

          bringImagePopupToFront(
            popup
          );

          var aspectRatio =
            Number(
              popup.dataset.aspectRatio
            );

          if (
            !isFinite(
              aspectRatio
            ) ||
            aspectRatio <= 0
          ) {
            var mediaWidth =
  image.naturalWidth ||
  image.videoWidth ||
  0;

var mediaHeight =
  image.naturalHeight ||
  image.videoHeight ||
  0;

if (
  mediaWidth &&
  mediaHeight
) {
  aspectRatio =
    mediaWidth /
    mediaHeight;
}
          }

          if (
            !isFinite(
              aspectRatio
            ) ||
            aspectRatio <= 0
          ) {
            return;
          }

          var direction =
            handle.dataset.direction;

          var rect =
            popup.getBoundingClientRect();

          var startX =
            event.clientX;

          var startY =
            event.clientY;

          var startLeft =
            rect.left;

          var startTop =
            rect.top;

          var startWidth =
            rect.width;

          var startHeight =
            rect.height;

          var minimumWidth =
            240;

          function resize(
            moveEvent
          ) {
            var dx =
              moveEvent.clientX -
              startX;

            var dy =
              moveEvent.clientY -
              startY;

            var widthFromX =
              (
                direction === "ne" ||
                direction === "se"
              )
                ? startWidth + dx
                : startWidth - dx;

            var heightFromY =
              (
                direction === "se" ||
                direction === "sw"
              )
                ? startHeight + dy
                : startHeight - dy;

            var widthFromY =
              heightFromY *
              aspectRatio;

            var width =
              Math.abs(
                dx
              ) >=
              Math.abs(
                dy *
                aspectRatio
              )
                ? widthFromX
                : widthFromY;

            width =
              Math.max(
                width,
                minimumWidth
              );

            var height =
              width /
              aspectRatio;

            var left =
              startLeft;

            var top =
              startTop;

            if (
              direction === "nw" ||
              direction === "sw"
            ) {
              left =
                startLeft +
                startWidth -
                width;
            }

            if (
              direction === "nw" ||
              direction === "ne"
            ) {
              top =
                startTop +
                startHeight -
                height;
            }

            popup.style.left =
              Math.round(
                left
              ) +
              "px";

            popup.style.top =
              Math.round(
                top
              ) +
              "px";

            popup.style.width =
              Math.round(
                width
              ) +
              "px";

            popup.style.height =
              Math.round(
                height
              ) +
              "px";
          }

          function end() {
            window.removeEventListener(
              "pointermove",
              resize
            );

            window.removeEventListener(
              "pointerup",
              end
            );

            window.removeEventListener(
              "pointercancel",
              end
            );
          }

          window.addEventListener(
            "pointermove",
            resize
          );

          window.addEventListener(
            "pointerup",
            end
          );

          window.addEventListener(
            "pointercancel",
            end
          );
        }
      );
    }
  );
}

/* -------------------------------------------------------------------------- */
/* POINT-CLOUD LOADING                                                        */
/* -------------------------------------------------------------------------- */
function selectScan(
  scan
) {
  if (
    !scan
  ) {
    return;
  }

  /*
    Images open in the floating popup.
    They do not become the active Potree scan.
  */
  if (
    isImageScan(
      scan
    )
  ) {
    openImagePopup(
      scan
    );

    return;
  }

  var pointcloud =
    state.loadedClouds.get(
      scan.id
    );

  /*
    Loading an unloaded point cloud
    also makes it the active scan.
  */
  if (
    !pointcloud
  ) {
    loadScan(
      scan
    );

    return;
  }

  /*
    Selecting a loaded scan changes only
    the active scan. Other visibility states
    remain unchanged.
  */
  setActiveScan(
    scan,
    pointcloud
  );

  renderLibrary();

  setStatus(
    scan.name +
    " selected",
    "idle"
  );
}

function loadScan(
  scan
) {
  if (
    !scan
  ) {
    return Promise.resolve(
      null
    );
  }

  /*
    Images are not loaded through Potree.
    They are opened in the floating image popup.
  */
  if (
    isImageScan(
      scan
    )
  ) {
    openImagePopup(
      scan
    );

    return Promise.resolve(
      scan
    );
  }

  if (
    !scan.url
  ) {
    setStatus(
      "This scan has no valid COPC URL.",
      "error"
    );

    return Promise.resolve(
      null
    );
  }

  /*
    If the point cloud is already loaded,
    activate it instead of loading it again.
  */
  if (
    state.loadedClouds.has(
      scan.id
    )
  ) {
    var existingCloud =
      state.loadedClouds.get(
        scan.id
      );

    setActiveScan(
      scan,
      existingCloud
    );

    fitActiveScan();

    return Promise.resolve(
      existingCloud
    );
  }

  /*
    Prevent duplicate loading requests.
  */
  if (
    scan.loading
  ) {
    return Promise.resolve(
      null
    );
  }

  scan.loading =
    true;

  renderLibrary();

  showLoading(
    "Loading " +
    scan.name +
    "..."
  );

  setViewerStatus(
    "Loading point cloud",
    "loading"
  );

  setStatus(
    "Loading " +
    scan.name +
    "...",
    "loading"
  );

  console.log(
    "Loading scan:",
    {
      id:
        scan.id,

      name:
        scan.name,

      path:
        scan.path,

      url:
        scan.url,

      documentBaseURI:
        document.baseURI
    }
  );

  return loadCopcPointCloud(
    scan
  )
    .then(
      function (
        pointcloud
      ) {
        if (
          !pointcloud
        ) {
          throw new Error(
            "Potree returned no point cloud."
          );
        }

        pointcloud.name =
          scan.name;

        pointcloud.visible =
          true;

        if (
          !viewer ||
          !viewer.scene ||
          typeof viewer.scene.addPointCloud !==
          "function"
        ) {
          throw new Error(
            "Potree scene is unavailable."
          );
        }

        viewer.scene.addPointCloud(
          pointcloud
        );

        configurePointCloud(
          pointcloud
        );

        state.loadedClouds.set(
          scan.id,
          pointcloud
        );

        scan.loading =
          false;

        setActiveScan(
          scan,
          pointcloud
        );

        renderLibrary();

        hideLoading();

        setViewerStatus(
          "Point cloud loaded",
          "idle"
        );

        setStatus(
          scan.name +
          " loaded",
          "idle"
        );

        window.setTimeout(
          function () {
            if (
              state.activeCloud !==
              pointcloud
            ) {
              return;
            }

            /*
              The first scan opens at the start view from
              location-config.js, if one is set.
            */
            var useStartView =
              !state.startViewApplied;

            state.startViewApplied =
              true;

            if (
              useStartView &&
              applyStartView()
            ) {
              setStatus(
                scan.name +
                " loaded",
                "idle"
              );

              return;
            }

            fitActiveScan();
          },
          500
        );

        return pointcloud;
      }
    )
    .catch(
      function (
        error
      ) {
        scan.loading =
          false;

        hideLoading();

        renderLibrary();

        console.error(
          "Point-cloud loading failed:",
          error
        );

        setViewerStatus(
          "Point-cloud loading failed",
          "error"
        );

        setStatus(
          "Could not load " +
          scan.name,
          "error"
        );

        return null;
      }
    );
}

function loadCopcPointCloud(
  scan
) {
  return new Promise(
    function (
      resolve,
      reject
    ) {
      var potree =
        window.Potree;

      if (
        !potree ||
        typeof potree.loadPointCloud !==
        "function"
      ) {
        reject(
          new Error(
            "Potree.loadPointCloud is unavailable."
          )
        );

        return;
      }

      var finished =
        false;

      function finishWithCloud(
        cloud
      ) {
        if (
          finished ||
          !cloud
        ) {
          return;
        }

        finished =
          true;

        resolve(
          cloud
        );
      }

      function finishWithError(
        error
      ) {
        if (
          finished
        ) {
          return;
        }

        finished =
          true;

        reject(
          error instanceof Error
            ? error
            : new Error(
                String(
                  error
                )
              )
        );
      }

      try {
        var result =
          potree.loadPointCloud(
            scan.url,
            scan.name,
            function (event) {
              if (
                !event
              ) {
                return;
              }

              if (
                event.pointcloud
              ) {
                finishWithCloud(
                  event.pointcloud
                );

                return;
              }

              if (
                event.error
              ) {
                finishWithError(
                  event.error
                );

                return;
              }

              if (
                event.material ||
                event.pcoGeometry ||
                event.boundingBox
              ) {
                finishWithCloud(
                  event
                );
              }
            }
          );

        if (
          result &&
          typeof result.then ===
          "function"
        ) {
          result
            .then(
              function (value) {
                if (
                  value &&
                  value.pointcloud
                ) {
                  finishWithCloud(
                    value.pointcloud
                  );
                } else {
                  finishWithCloud(
                    value
                  );
                }
              }
            )
            .catch(
              function (error) {
                finishWithError(
                  error
                );
              }
            );
        } else if (
          result &&
          result.pointcloud
        ) {
          finishWithCloud(
            result.pointcloud
          );
        }
      } catch (
        error
      ) {
        finishWithError(
          error
        );
      }
    }
  );
}

function configurePointCloud(
  pointcloud
) {
  if (
    !pointcloud ||
    !pointcloud.material
  ) {
    return;
  }

  var material =
    pointcloud.material;

  material.size =
    getNumberValue(
      "pointSize",
      1.0
    );

  var potree =
    window.Potree;

  if (
    potree &&
    potree.PointSizeType &&
    potree.PointSizeType.ADAPTIVE !==
    undefined
  ) {
    material.pointSizeType =
      potree.PointSizeType.ADAPTIVE;
  }

  if (
    potree &&
    potree.PointShape &&
    potree.PointShape.CIRCLE !==
    undefined
  ) {
    material.shape =
      potree.PointShape.CIRCLE;
  }

  applyPointDisplayMode(
  pointcloud
);

  applyColorMode(
    pointcloud
  );

  applyOpacity(
    pointcloud
  );

  material.needsUpdate =
    true;
}

function toggleScanVisibility(
  scan
) {
  if (
    !scan
  ) {
    return;
  }

  /*
    Images use the popup as their visibility
    state. They are only closed through the X
    button, so clicking the library visibility
    control opens the image.
  */
  if (
    isImageScan(
      scan
    )
  ) {
    openImagePopup(
      scan
    );

    return;
  }

  var pointcloud =
    state.loadedClouds.get(
      scan.id
    );

  /*
    If the point cloud is not loaded yet,
    loadScan() will load and display it.
  */
  if (
    !pointcloud
  ) {
    loadScan(
      scan
    );

    return;
  }

  pointcloud.visible =
    pointcloud.visible ===
    false;

  renderLibrary();

  setStatus(
    scan.name +
    (
      pointcloud.visible
        ? " shown"
        : " hidden"
    ),
    "idle"
  );
}


/* -------------------------------------------------------------------------- */
/* ACTIVE SCAN AND INSPECTOR                                                  */
/* -------------------------------------------------------------------------- */

function setActiveScan(
  scan,
  pointcloud
) {
  if (
    !scan
  ) {
    return;
  }

  removeSectionVolume();

  var sectionMode =
    getElement(
      "sectionMode"
    );

  if (
    sectionMode
  ) {
    sectionMode.value =
      "none";
  }

  state.activeScan =
    scan;

  state.activeCloud =
    pointcloud ||
    state.loadedClouds.get(
      scan.id
    ) ||
    null;

  state.activeBounds =
    null;

  if (
    state.activeCloud &&
    typeof window.getPointCloudWorldBounds ===
    "function"
  ) {
    state.activeBounds =
      window.getPointCloudWorldBounds(
        state.activeCloud
      );
  }

  if (
    !state.activeBounds &&
    state.activeCloud &&
    typeof window.getPointCloudBounds ===
    "function"
  ) {
    state.activeBounds =
      window.getPointCloudBounds(
        state.activeCloud
      );
  }

  if (
    typeof applyPointDisplayMode ===
    "function"
  ) {
    applyPointDisplayMode(
      state.activeCloud
    );
  }

  updateInspector();
  updateSectionControls();
  renderLibrary();
}

function updateInspector() {
  var empty =
    getElement(
      "inspectorEmpty"
    );

  var content =
    getElement(
      "inspectorContent"
    );

  if (
    !state.activeScan ||
    !state.activeCloud
  ) {
    if (
      empty
    ) {
      empty.classList.remove(
        "hidden"
      );
    }

    if (
      content
    ) {
      content.classList.add(
        "hidden"
      );
    }

    return;
  }

  if (
    empty
  ) {
    empty.classList.add(
      "hidden"
    );
  }

  if (
    content
  ) {
    content.classList.remove(
      "hidden"
    );
  }

  setText(
    "activeScanName",
    state.activeScan.name
  );

  setText(
    "activePointCount",
    state.activeScan.pointCount && state.activeScan.pointCount !== 0
      ? formatNumber(state.activeScan.pointCount)
      : "Loaded"
  );



  setText(
    "activeFileSize",
    state.activeScan.sizeBytes
      ? formatBytes(
          state.activeScan.sizeBytes
        )
      : "Unknown"
  );

  setText(
    "activeCrs",
    state.activeScan.crs ||
    "Unknown"
  );

  if (
    !state.activeBounds
  ) {
    setText(
      "boundsX",
      "Unavailable"
    );

    setText(
      "boundsY",
      "Unavailable"
    );

    setText(
      "boundsZ",
      "Unavailable"
    );

    return;
  }

  setText(
    "boundsX",
    formatCoordinate(
      state.activeBounds.min.x
    ) +
    " -> " +
    formatCoordinate(
      state.activeBounds.max.x
    )
  );

  setText(
    "boundsY",
    formatCoordinate(
      state.activeBounds.min.y
    ) +
    " -> " +
    formatCoordinate(
      state.activeBounds.max.y
    )
  );

  setText(
    "boundsZ",
    formatCoordinate(
      state.activeBounds.min.z
    ) +
    " -> " +
    formatCoordinate(
      state.activeBounds.max.z
    )
  );
}


function getVectorValue(
  vector,
  property,
  index
) {
  if (
    vector &&
    typeof vector[property] ===
    "number"
  ) {
    return vector[property];
  }

  if (
    vector &&
    typeof vector[index] ===
    "number"
  ) {
    return vector[index];
  }

  return 0;
}

window.getPointCloudBounds =
  function (
    pointcloud
  ) {
    if (
      !pointcloud
    ) {
      return null;
    }

    function readCoordinate(
      vector,
      property,
      index
    ) {
      if (
        vector &&
        typeof vector[property] ===
        "number" &&
        isFinite(
          vector[property]
        )
      ) {
        return vector[property];
      }

      if (
        vector &&
        typeof vector[index] ===
        "number" &&
        isFinite(
          vector[index]
        )
      ) {
        return vector[index];
      }

      return null;
    }

    function readBox(
      box
    ) {
      if (
        !box
      ) {
        return null;
      }

      var minX =
        null;

      var minY =
        null;

      var minZ =
        null;

      var maxX =
        null;

      var maxY =
        null;

      var maxZ =
        null;

      /*
        Standard THREE.Box3 format.
      */
      if (
        box.min &&
        box.max
      ) {
        minX =
          readCoordinate(
            box.min,
            "x",
            0
          );

        minY =
          readCoordinate(
            box.min,
            "y",
            1
          );

        minZ =
          readCoordinate(
            box.min,
            "z",
            2
          );

        maxX =
          readCoordinate(
            box.max,
            "x",
            0
          );

        maxY =
          readCoordinate(
            box.max,
            "y",
            1
          );

        maxZ =
          readCoordinate(
            box.max,
            "z",
            2
          );
      }

      /*
        Potree metadata-style format.
      */
      if (
        minX === null &&
        typeof box.lx ===
          "number" &&
        typeof box.ly ===
          "number" &&
        typeof box.lz ===
          "number" &&
        typeof box.ux ===
          "number" &&
        typeof box.uy ===
          "number" &&
        typeof box.uz ===
          "number"
      ) {
        minX =
          box.lx;

        minY =
          box.ly;

        minZ =
          box.lz;

        maxX =
          box.ux;

        maxY =
          box.uy;

        maxZ =
          box.uz;
      }

      if (
        minX === null ||
        minY === null ||
        minZ === null ||
        maxX === null ||
        maxY === null ||
        maxZ === null
      ) {
        return null;
      }

      return {
        min: {
          x:
            Math.min(
              minX,
              maxX
            ),

          y:
            Math.min(
              minY,
              maxY
            ),

          z:
            Math.min(
              minZ,
              maxZ
            )
        },

        max: {
          x:
            Math.max(
              minX,
              maxX
            ),

          y:
            Math.max(
              minY,
              maxY
            ),

          z:
            Math.max(
              minZ,
              maxZ
            )
        }
      };
    }

    var boxes =
      [];

    if (
      pointcloud.boundingBox
    ) {
      boxes.push(
        pointcloud.boundingBox
      );
    }

    if (
      pointcloud.pcoGeometry
    ) {
      if (
        pointcloud.pcoGeometry.tightBoundingBox
      ) {
        boxes.push(
          pointcloud.pcoGeometry.tightBoundingBox
        );
      }

      if (
        pointcloud.pcoGeometry.boundingBox
      ) {
        boxes.push(
          pointcloud.pcoGeometry.boundingBox
        );
      }
    }

    if (
      pointcloud.geometry &&
      pointcloud.geometry.boundingBox
    ) {
      boxes.push(
        pointcloud.geometry.boundingBox
      );
    }

    for (
      var index = 0;
      index < boxes.length;
      index += 1
    ) {
      var bounds =
        readBox(
          boxes[index]
        );

      if (
        bounds
      ) {
        return bounds;
      }
    }

    return null;
  };


/* -------------------------------------------------------------------------- */
/* APPEARANCE                                                                 */
/* -------------------------------------------------------------------------- */

function isSinglePixelMode() {
  var button =
    getElement(
      "pointDisplayMode"
    );

  return (
    button &&
    button.getAttribute(
      "aria-pressed"
    ) ===
    "true"
  );
}

function updatePointDisplayButton() {
  var button =
    getElement(
      "pointDisplayMode"
    );

  if (
    !button
  ) {
    return;
  }

  var singlePixel =
    isSinglePixelMode();

  button.textContent =
    singlePixel
      ? "Single pixels"
      : "Depth-sized";

  button.setAttribute(
    "aria-pressed",
    String(
      singlePixel
    )
  );
}

function applyPointDisplayMode(
  pointcloud
) {
  var cloud =
    pointcloud ||
    state.activeCloud;

  updatePointDisplayButton();

  if (
    !cloud ||
    !cloud.material
  ) {
    return;
  }

  var material =
    cloud.material;

  var potree =
    window.Potree;

  var pointSizeType =
    potree &&
    potree.PointSizeType
      ? potree.PointSizeType
      : null;

  if (
    isSinglePixelMode()
  ) {
    if (
      pointSizeType &&
      pointSizeType.FIXED !==
      undefined
    ) {
      material.pointSizeType =
        pointSizeType.FIXED;
    }

    material.size =
      1;
  } else {
    if (
      pointSizeType &&
      pointSizeType.ADAPTIVE !==
      undefined
    ) {
      material.pointSizeType =
        pointSizeType.ADAPTIVE;
    }

    material.size =
      getNumberValue(
        "pointSize",
        0.5
      );
  }

  material.needsUpdate =
    true;
}

function togglePointDisplayMode() {
  var button =
    getElement(
      "pointDisplayMode"
    );

  if (
    !button
  ) {
    return;
  }

  var enabled =
    button.getAttribute(
      "aria-pressed"
    ) ===
    "true";

  button.setAttribute(
    "aria-pressed",
    String(
      !enabled
    )
  );

  applyPointDisplayMode();

  setStatus(
    !enabled
      ? "Single-pixel display enabled"
      : "Depth-sized display enabled",
    "idle"
  );
}

function applyColorMode(
  pointcloud
) {
  var cloud =
    pointcloud ||
    state.activeCloud;

  var potree =
    window.Potree;

  if (
    !cloud ||
    !cloud.material ||
    !potree ||
    !potree.PointColorType
  ) {
    return;
  }

  var select =
    getElement(
      "colorMode"
    );

  if (
    !select
  ) {
    return;
  }

  var colorType =
    potree.PointColorType[
      select.value
    ];

  if (
    colorType !==
    undefined
  ) {
    cloud.material.pointColorType =
      colorType;

    cloud.material.needsUpdate =
      true;
  }
}

function applyPointSize() {
  var value =
    getNumberValue(
      "pointSize",
      0.5
    );

  setText(
    "pointSizeValue",
    value.toFixed(
      0.5
    )
  );

  if (
    state.activeCloud &&
    state.activeCloud.material
  ) {
    state.activeCloud.material.size =
      isSinglePixelMode()
        ? 1
        : value;

    state.activeCloud.material.needsUpdate =
      true;

    applyPointDisplayMode(
      state.activeCloud
    );
  }
}

function applyOpacity(
  pointcloud
) {
  var value =
    getNumberValue(
      "pointOpacity",
      1
    );

  setText(
    "pointOpacityValue",
    Math.round(
      value *
      100
    ) +
    "%"
  );

  var cloud =
    pointcloud ||
    state.activeCloud;

  if (
    cloud &&
    cloud.material
  ) {
    cloud.material.opacity =
      value;

    cloud.material.transparent =
      value < 1;

    cloud.material.needsUpdate =
      true;
  }
}

function applyPointBudget() {
  var value =
    getNumberValue(
      "pointBudget",
      CONFIG.defaultPointBudget
    );

  if (
    viewer &&
    typeof viewer.setPointBudget ===
    "function"
  ) {
    viewer.setPointBudget(
      value
    );
  }

  setText(
    "pointBudgetValue",
    formatCompactNumber(
      value
    )
  );
}


/* -------------------------------------------------------------------------- */
/* SECTION TOOLS                                                              */
/* -------------------------------------------------------------------------- */

function getSectionRange() {
  if (
    !state.activeBounds
  ) {
    return null;
  }

  var modeElement =
    getElement(
      "sectionMode"
    );

  var mode =
    modeElement
      ? modeElement.value
      : "none";

  if (
    mode ===
    "horizontal"
  ) {
    return {
      min:
        state.activeBounds.min.z,
      max:
        state.activeBounds.max.z
    };
  }

  /*
    Vertical section: the range along the section direction,
    which can be rotated around Z.
  */
  var angle =
    getSectionAngle();

  var nx =
    Math.cos(angle);

  var ny =
    Math.sin(angle);

  var b =
    state.activeBounds;

  var projections = [
    b.min.x * nx + b.min.y * ny,
    b.max.x * nx + b.min.y * ny,
    b.min.x * nx + b.max.y * ny,
    b.max.x * nx + b.max.y * ny
  ];

  return {
    min:
      Math.min.apply(null, projections),

    max:
      Math.max.apply(null, projections)
  };
}

/* Section direction in radians: 0° cuts across X, 90° across Y */
function getSectionAngle() {
  var element =
    getElement(
      "sectionAngle"
    );

  var degrees =
    element
      ? Number(element.value)
      : 0;

  return (isFinite(degrees) ? degrees : 0) *
    Math.PI / 180;
}

function updateSectionControls() {
  var modeElement =
    getElement(
      "sectionMode"
    );

  var positionElement =
    getElement(
      "sectionPosition"
    );

  var thicknessElement =
    getElement(
      "sectionThickness"
    );

  var axisWrapper =
    getElement(
      "sectionAxisWrapper"
    );

  if (
    !modeElement ||
    !positionElement ||
    !thicknessElement
  ) {
    return;
  }

  var mode =
    modeElement.value;

  var active =
    mode !== "none" &&
    Boolean(
      state.activeBounds
    );

  if (
    axisWrapper
  ) {
    if (
      mode ===
      "vertical"
    ) {
      axisWrapper.classList.remove(
        "hidden"
      );
    } else {
      axisWrapper.classList.add(
        "hidden"
      );
    }
  }

  positionElement.disabled =
    !active;

  thicknessElement.disabled =
    !active;

  if (
    !active
  ) {
    setText(
      "sectionPositionValue",
      "—"
    );

    setText(
      "sectionThicknessValue",
      "—"
    );

    return;
  }

  var range =
    getSectionRange();

  if (
    !range
  ) {
    return;
  }

  var length =
    Math.max(
      range.max -
      range.min,
      0.001
    );

  var center =
    (
      range.min +
      range.max
    ) / 2;

  var thickness =
    Math.max(
      length *
      0.08,
      0.01
    );

  positionElement.min =
    range.min;

  positionElement.max =
    range.max;

  positionElement.step =
    Math.max(
      length /
      1000,
      0.000001
    );

  positionElement.value =
    center;

  thicknessElement.min =
    0.001;

  thicknessElement.max =
    length;

  thicknessElement.step =
    Math.max(
      length /
      1000,
      0.000001
    );

  thicknessElement.value =
    thickness.toFixed(
      3
    );

  setText(
    "sectionPositionValue",
    formatCoordinate(
      center
    )
  );

  setText(
    "sectionThicknessValue",
    formatCoordinate(
      thickness
    ) +
    " units"
  );
}

function applySection() {
  if (
    !state.activeCloud ||
    !state.activeBounds
  ) {
    setStatus(
      "Load a scan before creating a section.",
      "error"
    );

    return;
  }

  var modeElement =
    getElement(
      "sectionMode"
    );

  var mode =
    modeElement
      ? modeElement.value
      : "none";

  if (
    mode ===
    "none"
  ) {
    clearSection();

    return;
  }

  var range =
    getSectionRange();

  if (
    !range
  ) {
    return;
  }

  removeSectionVolume();

  var position =
    getNumberValue(
      "sectionPosition",
      (
        range.min +
        range.max
      ) / 2
    );

  var thickness =
    getNumberValue(
      "sectionThickness",
      (
        range.max -
        range.min
      ) *
      0.08
    );

  thickness =
    Math.max(
      thickness,
      0.001
    );

  var safePosition =
    clamp(
      position,
      range.min,
      range.max
    );

  var min = {
    x:
      state.activeBounds.min.x,
    y:
      state.activeBounds.min.y,
    z:
      state.activeBounds.min.z
  };

  var max = {
    x:
      state.activeBounds.max.x,
    y:
      state.activeBounds.max.y,
    z:
      state.activeBounds.max.z
  };

  if (
    mode ===
    "horizontal"
  ) {
    min.z =
      safePosition -
      thickness /
      2;

    max.z =
      safePosition +
      thickness /
      2;
  }

  if (
    mode ===
    "vertical"
  ) {
    var axisElement =
      getElement(
        "sectionAxis"
      );

    var axis =
      axisElement &&
      axisElement.value
        ? axisElement.value
        : "x";

    min[axis] =
      safePosition -
      thickness /
      2;

    max[axis] =
      safePosition +
      thickness /
      2;
  }

  var potree =
    window.Potree;

  if (
    !potree ||
    !potree.BoxVolume ||
    !viewer ||
    !viewer.scene
  ) {
    setStatus(
      "Potree clipping volumes are unavailable.",
      "error"
    );

    return;
  }

  var volume =
    new potree.BoxVolume();

  volume.name =
    mode === "horizontal"
      ? "Horizontal section"
      : "Vertical section";

  volume.position.set(
    (
      min.x +
      max.x
    ) / 2,
    (
      min.y +
      max.y
    ) / 2,
    (
      min.z +
      max.z
    ) / 2
  );

  volume.scale.set(
    Math.max(
      max.x -
      min.x,
      0.001
    ),
    Math.max(
      max.y -
      min.y,
      0.001
    ),
    Math.max(
      max.z -
      min.z,
      0.001
    )
  );

  /*
    Vertical section: a thin slab across the whole scan, turned
    around Z by the chosen direction.
  */
  if (
    mode ===
    "vertical"
  ) {
    var angle =
      getSectionAngle();

    var nx =
      Math.cos(angle);

    var ny =
      Math.sin(angle);

    var b =
      state.activeBounds;

    var cx =
      (b.min.x + b.max.x) / 2;

    var cy =
      (b.min.y + b.max.y) / 2;

    var shift =
      safePosition -
      (cx * nx + cy * ny);

    var span =
      Math.hypot(
        b.max.x - b.min.x,
        b.max.y - b.min.y
      ) * 1.1 + 0.01;

    volume.position.set(
      cx + nx * shift,
      cy + ny * shift,
      (b.min.z + b.max.z) / 2
    );

    volume.scale.set(
      thickness,
      span,
      Math.max(b.max.z - b.min.z, 0.001) * 1.02
    );

    volume.rotation.set(
      0,
      0,
      angle
    );

    if (
      typeof volume.updateMatrixWorld ===
      "function"
    ) {
      volume.updateMatrixWorld(
        true
      );
    }
  }

  volume.clip =
    true;

  volume.visible =
    false;

  if (
    typeof viewer.scene.addVolume ===
    "function"
  ) {
    viewer.scene.addVolume(
      volume
    );
  }

  state.sectionVolume =
    volume;

  if (
    potree.ClipTask &&
    potree.ClipTask.SHOW_INSIDE !==
    undefined &&
    typeof viewer.setClipTask ===
    "function"
  ) {
    viewer.setClipTask(
      potree.ClipTask.SHOW_INSIDE
    );
  }

  if (
    potree.ClipMethod &&
    potree.ClipMethod.INSIDE_ANY !==
    undefined &&
    typeof viewer.setClipMethod ===
    "function"
  ) {
    viewer.setClipMethod(
      potree.ClipMethod.INSIDE_ANY
    );
  }

  setText(
    "sectionPositionValue",
    formatCoordinate(
      safePosition
    )
  );

  setText(
    "sectionThicknessValue",
    formatCoordinate(
      thickness
    ) +
    " units"
  );

  setStatus(
    "Section applied",
    "idle"
  );
}

function removeSectionVolume() {
  if (
    !state.sectionVolume
  ) {
    return;
  }

  if (
    viewer &&
    viewer.scene &&
    typeof viewer.scene.removeVolume ===
    "function"
  ) {
    viewer.scene.removeVolume(
      state.sectionVolume
    );
  }

  state.sectionVolume =
    null;

  var potree =
    window.Potree;

  if (
    viewer &&
    potree &&
    potree.ClipTask &&
    potree.ClipTask.NONE !==
    undefined &&
    typeof viewer.setClipTask ===
    "function"
  ) {
    viewer.setClipTask(
      potree.ClipTask.NONE
    );
  }
}

function clearSection() {
  removeSectionVolume();

  var modeElement =
    getElement(
      "sectionMode"
    );

  if (
    modeElement
  ) {
    modeElement.value =
      "none";
  }

  updateSectionControls();

  setStatus(
    "Section cleared",
    "idle"
  );
}


/* -------------------------------------------------------------------------- */
/* KEYBOARD NAVIGATION                                                        */
/* -------------------------------------------------------------------------- */

var navigationKeys = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  up: false,
  down: false
};

var navigationKeyboardBound =
  false;

var navigationLastTime =
  0;

  var navigationRamp =
    0;

  var navigationDirection =
    null;

  var navigationAccelerationTime =
    0.9;

  var navigationDecelerationTime =
    0.9;

  var navigationTurnTime =
    0.9;

function isTypingInField(
  target
) {
  if (
    !target
  ) {
    return false;
  }

  var tagName =
    target.tagName
      ? target.tagName.toLowerCase()
      : "";

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable ===
      true
  );
}

function getNavigationKey(
  event
) {
  var key =
    String(
      event.key ||
      ""
    ).toLowerCase();

  if (
    key === "," ||
    key === "."
  ) {
    return key;
  }

  if (
    key === "w" ||
    key === "a" ||
    key === "s" ||
    key === "d" ||
    key === "e" ||
    key === "c" ||
    key === "arrowup" ||
    key === "arrowdown" ||
    key === "arrowleft" ||
    key === "arrowright"
  ) {
    return key;
  }

  var code =
    String(
      event.code ||
      ""
    ).toLowerCase();

  if (
    code === "keyw"
  ) {
    return "w";
  }

  if (
    code === "keya"
  ) {
    return "a";
  }

  if (
    code === "keys"
  ) {
    return "s";
  }

  if (
    code === "keyd"
  ) {
    return "d";
  }

  if (
    code === "keye"
  ) {
    return "e";
  }

  if (
    code === "keyc"
  ) {
    return "c";
  }

  if (
    code === "keye"
  ) {
    return "e";
  }

  if (
    code === "keyc"
  ) {
    return "c";
  }

  if (
    code === "arrowup"
  ) {
    return "arrowup";
  }

  if (
    code === "arrowdown"
  ) {
    return "arrowdown";
  }

  if (
    code === "arrowleft"
  ) {
    return "arrowleft";
  }

  if (
    code === "arrowright"
  ) {
    return "arrowright";
  }

  if (
    code === "comma"
  ) {
    return ",";
  }

  if (
    code === "period"
  ) {
    return ".";
  }

  return "";
}

function setNavigationKey(
  key,
  pressed
) {
  if (
    key === "w" ||
    key === "arrowup"
  ) {
    navigationKeys.forward =
      pressed;
  }

  if (
    key === "s" ||
    key === "arrowdown"
  ) {
    navigationKeys.backward =
      pressed;
  }

  if (
    key === "a" ||
    key === "arrowleft"
  ) {
    navigationKeys.left =
      pressed;
  }

  if (
    key === "d" ||
    key === "arrowright"
  ) {
    navigationKeys.right =
      pressed;
  }

  if (
  key === "e"
) {
  navigationKeys.up =
    pressed;
}

if (
  key === "c"
) {
  navigationKeys.down =
    pressed;
}

}

function clearNavigationKeys() {
  navigationKeys.forward =
    false;

  navigationKeys.backward =
    false;

  navigationKeys.left =
    false;

  navigationKeys.right =
    false;

  navigationKeys.up =
    false;

  navigationKeys.down =
    false;
}

function adjustNavigationSpeed(
  direction
) {
  var currentSpeed =
    Number(
      state.navigationSpeed
    ) ||
    Number(
      CONFIG.navigationSpeed
    ) ||
    0.35;

  var multiplier =
    direction > 0
      ? 1.25
      : 0.8;

  state.navigationSpeed =
    clamp(
      currentSpeed *
      multiplier,
      0.02,
      8
    );

  setStatus(
    "Navigation speed: " +
    state.navigationSpeed.toFixed(
      2
    ),
    "idle"
  );
}

function moveViewerWithKeyboard(
  deltaSeconds
) {
  if (
    !viewer ||
    !viewer.scene ||
    !viewer.scene.view
  ) {
    return;
  }

  var view =
    viewer.scene.view;

  if (
    !view.position
  ) {
    return;
  }

  var direction =
    null;

  if (
    view.direction &&
    typeof view.direction.clone ===
    "function"
  ) {
    direction =
      view.direction.clone();
  } else if (
    typeof view.getDirection ===
    "function"
  ) {
    direction =
      view.getDirection();
  }

  if (
    !direction ||
    typeof direction.normalize !==
    "function"
  ) {
    return;
  }

  direction.normalize();

  /*
    Walk mode: move level, whatever the camera looks at.
  */
  if (
    navigation.mode ===
    "walk"
  ) {
    var level =
      directionFromYawPitch(
        view.yaw,
        0
      );

    direction.set(
      level.x,
      level.y,
      0
    );
  }

  var right =
    direction.clone();

  if (
    typeof right.cross !==
    "function"
  ) {
    return;
  }

  right.cross(
    direction.clone().set(
      0,
      0,
      1
    )
  );

  if (
    typeof right.lengthSq ===
    "function" &&
    right.lengthSq() <
    0.000001
  ) {
    right.set(
      1,
      0,
      0
    );
  } else {
    right.normalize();
  }

  /*
    Build the desired movement direction.
    This is the target direction, not the
    final movement yet.
  */
  var targetMovement =
    direction.clone().set(
      0,
      0,
      0
    );

  if (
    navigationKeys.forward
  ) {
    targetMovement.add(
      direction
    );
  }

  if (
    navigationKeys.backward
  ) {
    targetMovement.sub(
      direction
    );
  }

  if (
    navigationKeys.left
  ) {
    targetMovement.sub(
      right
    );
  }

  if (
    navigationKeys.right
  ) {
    targetMovement.add(
      right
    );
  }

  if (
    navigationKeys.up
  ) {
    targetMovement.add(
      direction.clone().set(
        0,
        0,
        1
      )
    );
  }

  if (
    navigationKeys.down
  ) {
    targetMovement.sub(
      direction.clone().set(
        0,
        0,
        1
      )
    );
  }

  var hasTargetMovement =
    typeof targetMovement.lengthSq ===
    "function" &&
    targetMovement.lengthSq() >
    0.000001;

  if (
    hasTargetMovement
  ) {
    targetMovement.normalize();

    /*
      Ramp from 0 to 1 while a direction
      is being pressed.
    */
    navigationRamp =
      Math.min(
        1,
        navigationRamp +
        deltaSeconds /
        navigationAccelerationTime
      );
  } else {
    /*
      Ramp from 1 back to 0 after release.
    */
    navigationRamp =
      Math.max(
        0,
        navigationRamp -
        deltaSeconds /
        navigationDecelerationTime
      );
  }

  /*
    Convert the linear ramp into a soft
    Catmull-Rom acceleration/deceleration.
  */
  var speedFactor =
    navigationCatmullEase(
      navigationRamp
    );

  /*
    Smooth changes between directions too.
    This prevents an abrupt snap when changing
    from forward to left, for example.
  */
  if (
    hasTargetMovement
  ) {
    if (
      !navigationDirection
    ) {
      navigationDirection =
        targetMovement.clone();
    } else {
      var turnAlpha =
        1 -
        Math.exp(
          -deltaSeconds /
          navigationTurnTime
        );

      navigationDirection.lerp(
        targetMovement,
        turnAlpha
      );

      if (
        navigationDirection.lengthSq() <
        0.000001
      ) {
        navigationDirection =
          targetMovement.clone();
      } else {
        navigationDirection.normalize();
      }
    }
  }

  /*
    Once fully stopped, discard the old
    direction so a new direction starts cleanly.
  */
  if (
    !hasTargetMovement &&
    navigationRamp ===
    0
  ) {
    navigationDirection =
      null;

    return;
  }

  if (
    !navigationDirection ||
    speedFactor <=
    0
  ) {
    return;
  }

  var radius =
    Number(
      view.radius
    );

  if (
    !isFinite(
      radius
    ) ||
    radius <=
    0
  ) {
    radius =
      1;
  }

  var navigationSpeed =
    Number(
      state.navigationSpeed
    ) ||
    Number(
      CONFIG.navigationSpeed
    ) ||
    0.35;

  var speed =
    radius *
    navigationSpeed;

  if (
    !isFinite(
      speed
    ) ||
    speed <=
    0
  ) {
    return;
  }

  var displacement =
    navigationDirection.clone();

  displacement.multiplyScalar(
    speed *
    speedFactor *
    deltaSeconds
  );

  view.position.add(
    displacement
  );

  navigationCameraMoved(
    displacement
  );
}

function clearNavigationKeys() {
  navigationKeys.forward =
    false;

  navigationKeys.backward =
    false;

  navigationKeys.left =
    false;

  navigationKeys.right =
    false;

  navigationKeys.up =
    false;

  navigationKeys.down =
    false;

  navigationRamp =
    0;

  navigationDirection =
    null;
}

function navigationAnimationLoop(
  timestamp
) {
  if (
    !navigationLastTime
  ) {
    navigationLastTime =
      timestamp;
  }

  var deltaSeconds =
    (
      timestamp -
      navigationLastTime
    ) / 1000;

  navigationLastTime =
    timestamp;

  if (
    !isFinite(
      deltaSeconds
    ) ||
    deltaSeconds <= 0 ||
    deltaSeconds > 0.1
  ) {
    deltaSeconds =
      0.016;
  }

  moveViewerWithKeyboard(
    deltaSeconds
  );

  if (
    navigation.controls &&
    performance.now() -
    navigation.lastUpdate >
    250
  ) {
    updateNavigation(
      deltaSeconds
    );
  }

  window.requestAnimationFrame(
    navigationAnimationLoop
  );
}

function bindNavigationKeyboard() {
  if (
    navigationKeyboardBound
  ) {
    return;
  }

  navigationKeyboardBound =
    true;

  document.addEventListener(
    "keydown",
    function (
      event
    ) {
      /*
        Do not use W/A/S/D/E/C for Potree
        navigation while interacting with the
        image popup.
      */
      if (
        event.target &&
        event.target.closest &&
        event.target.closest(
          ".image-popup"
        )
      ) {
        return;
      }

      if (
        isTypingInField(
          event.target
        )
      ) {
        return;
      }

      var key =
        getNavigationKey(
          event
        );

      if (
        !key
      ) {
        return;
      }

      /*
        Comma and period change navigation speed.
      */
      if (
        key === "," ||
        key === "."
      ) {
        if (
          !event.repeat
        ) {
          adjustNavigationSpeed(
            key === "."
              ? 1
              : -1
          );
        }

        event.preventDefault();

        return;
      }

      event.preventDefault();

      setNavigationKey(
        key,
        true
      );
    },
    true
  );

  document.addEventListener(
    "keyup",
    function (
      event
    ) {
      /*
        Do not change navigation keys when
        releasing a key while inside the popup.
      */
      if (
        event.target &&
        event.target.closest &&
        event.target.closest(
          "#imagePopup"
        )
      ) {
        return;
      }

      var key =
        getNavigationKey(
          event
        );

      if (
        !key
      ) {
        return;
      }

      if (
        key === "," ||
        key === "."
      ) {
        return;
      }

      event.preventDefault();

      setNavigationKey(
        key,
        false
      );
    },
    true
  );

  window.addEventListener(
    "blur",
    clearNavigationKeys
  );

  document.addEventListener(
    "visibilitychange",
    function () {
      if (
        document.hidden
      ) {
        clearNavigationKeys();
      }
    }
  );

  window.requestAnimationFrame(
    navigationAnimationLoop
  );
}

/* -------------------------------------------------------------------------- */
/* VIEW CONTROLS                                                              */
/* -------------------------------------------------------------------------- */

function readBoxCoordinate(
  vector,
  property,
  index
) {
  if (
    vector &&
    typeof vector[property] ===
    "number" &&
    isFinite(
      vector[property]
    )
  ) {
    return vector[property];
  }

  if (
    vector &&
    typeof vector[index] ===
    "number" &&
    isFinite(
      vector[index]
    )
  ) {
    return vector[index];
  }

  return null;
}


function readPointCloudBox(
  box
) {
  if (
    !box
  ) {
    return null;
  }

  var minX =
    null;

  var minY =
    null;

  var minZ =
    null;

  var maxX =
    null;

  var maxY =
    null;

  var maxZ =
    null;

  if (
    box.min &&
    box.max
  ) {
    minX =
      readBoxCoordinate(
        box.min,
        "x",
        0
      );

    minY =
      readBoxCoordinate(
        box.min,
        "y",
        1
      );

    minZ =
      readBoxCoordinate(
        box.min,
        "z",
        2
      );

    maxX =
      readBoxCoordinate(
        box.max,
        "x",
        0
      );

    maxY =
      readBoxCoordinate(
        box.max,
        "y",
        1
      );

    maxZ =
      readBoxCoordinate(
        box.max,
        "z",
        2
      );
  } else if (
    typeof box.lx ===
      "number" &&
    typeof box.ly ===
      "number" &&
    typeof box.lz ===
      "number" &&
    typeof box.ux ===
      "number" &&
    typeof box.uy ===
      "number" &&
    typeof box.uz ===
      "number"
  ) {
    minX =
      box.lx;

    minY =
      box.ly;

    minZ =
      box.lz;

    maxX =
      box.ux;

    maxY =
      box.uy;

    maxZ =
      box.uz;
  }

  if (
    minX ===
      null ||
    minY ===
      null ||
    minZ ===
      null ||
    maxX ===
      null ||
    maxY ===
      null ||
    maxZ ===
      null
  ) {
    return null;
  }

  return {
    min: {
      x:
        Math.min(
          minX,
          maxX
        ),

      y:
        Math.min(
          minY,
          maxY
        ),

      z:
        Math.min(
          minZ,
          maxZ
        )
    },

    max: {
      x:
        Math.max(
          minX,
          maxX
        ),

      y:
        Math.max(
          minY,
          maxY
        ),

      z:
        Math.max(
          minZ,
          maxZ
        )
    }
  };
}

function catmullRomScalar(
  p0,
  p1,
  p2,
  p3,
  t
) {
  var t2 =
    t *
    t;

  var t3 =
    t2 *
    t;

  return 0.5 * (
    2 *
    p1 +
    (
      -p0 +
      p2
    ) *
    t +
    (
      2 *
      p0 -
      5 *
      p1 +
      4 *
      p2 -
      p3
    ) *
    t2 +
    (
      -p0 +
      3 *
      p1 -
      3 *
      p2 +
      p3
    ) *
    t3
  );
}

function navigationCatmullEase(
  t
) {
  t =
    Math.max(
      0,
      Math.min(
        1,
        t
      )
    );

  /*
    These virtual control points create
    zero-slope start and stop behavior.

    Result:
    3t² - 2t³
  */
  return catmullRomScalar(
    1,
    0,
    1,
    0,
    t
  );
}

function getPointCloudBounds(
  pointcloud
) {
  if (
    !pointcloud
  ) {
    return null;
  }

  var box =
    pointcloud.boundingBox ||
    (
      pointcloud.pcoGeometry &&
      (
        pointcloud.pcoGeometry.tightBoundingBox ||
        pointcloud.pcoGeometry.boundingBox
      )
    ) ||
    (
      pointcloud.geometry &&
      pointcloud.geometry.boundingBox
    ) ||
    null;

  if (
    !box
  ) {
    return null;
  }

  function coordinate(
    vector,
    property,
    index
  ) {
    if (
      vector &&
      typeof vector[property] ===
      "number" &&
      isFinite(
        vector[property]
      )
    ) {
      return vector[property];
    }

    if (
      vector &&
      typeof vector[index] ===
      "number" &&
      isFinite(
        vector[index]
      )
    ) {
      return vector[index];
    }

    return null;
  }

  var minX =
    null;

  var minY =
    null;

  var minZ =
    null;

  var maxX =
    null;

  var maxY =
    null;

  var maxZ =
    null;

  if (
    box.min &&
    box.max
  ) {
    minX =
      coordinate(
        box.min,
        "x",
        0
      );

    minY =
      coordinate(
        box.min,
        "y",
        1
      );

    minZ =
      coordinate(
        box.min,
        "z",
        2
      );

    maxX =
      coordinate(
        box.max,
        "x",
        0
      );

    maxY =
      coordinate(
        box.max,
        "y",
        1
      );

    maxZ =
      coordinate(
        box.max,
        "z",
        2
      );
  } else if (
    typeof box.lx ===
      "number" &&
    typeof box.ly ===
      "number" &&
    typeof box.lz ===
      "number" &&
    typeof box.ux ===
      "number" &&
    typeof box.uy ===
      "number" &&
    typeof box.uz ===
      "number"
  ) {
    minX =
      box.lx;

    minY =
      box.ly;

    minZ =
      box.lz;

    maxX =
      box.ux;

    maxY =
      box.uy;

    maxZ =
      box.uz;
  }

  if (
    minX === null ||
    minY === null ||
    minZ === null ||
    maxX === null ||
    maxY === null ||
    maxZ === null
  ) {
    return null;
  }

  return {
    min: {
      x:
        Math.min(
          minX,
          maxX
        ),

      y:
        Math.min(
          minY,
          maxY
        ),

      z:
        Math.min(
          minZ,
          maxZ
        )
    },

    max: {
      x:
        Math.max(
          minX,
          maxX
        ),

      y:
        Math.max(
          minY,
          maxY
        ),

      z:
        Math.max(
          minZ,
          maxZ
        )
    }
  };
}

window.getPointCloudBounds =
  getPointCloudBounds;

function getPointCloudWorldBounds(
  pointcloud
) {
  if (
    !pointcloud
  ) {
    return null;
  }

  /*
    The tight box hugs the actual points. The regular box is the
    octree cube, which is larger and puts the center off the model.
  */
  var tightBounds =
    getTightWorldBounds(
      pointcloud
    );

  if (
    tightBounds
  ) {
    return tightBounds;
  }

  /*
    First try Potree's own world-bounds method.
  */
  if (
    typeof pointcloud.getBoundingBoxWorld ===
    "function"
  ) {
    try {
      var worldBox =
        pointcloud.getBoundingBoxWorld();

      var worldBounds =
        readPointCloudBox(
          worldBox
        );

      if (
        worldBounds
      ) {
        return worldBounds;
      }
    } catch (
      error
    ) {
      console.warn(
        "Could not read world bounds:",
        error
      );
    }
  }

  /*
    Try the point cloud's direct bounding box.
  */
  var box =
    pointcloud.boundingBox;

  if (
    !box &&
    pointcloud.pcoGeometry
  ) {
    box =
      pointcloud.pcoGeometry.tightBoundingBox ||
      pointcloud.pcoGeometry.boundingBox;
  }

  if (
    !box &&
    pointcloud.geometry
  ) {
    box =
      pointcloud.geometry.boundingBox;
  }

  /*
    Use the original application bounds helper
    if it is available.
  */
  if (
    !box &&
    typeof getPointCloudBounds ===
    "function"
  ) {
    var applicationBounds =
      window.getPointCloudBounds(
        pointcloud
      );

    if (
      applicationBounds
    ) {
      return applicationBounds;
    }
  }

  if (
    !box
  ) {
    return null;
  }

  /*
    Transform the bounds if Potree has a
    world transformation matrix.
  */
  if (
    typeof box.clone ===
      "function" &&
    typeof box.applyMatrix4 ===
      "function" &&
    pointcloud.matrixWorld
  ) {
    try {
      if (
        typeof pointcloud.updateMatrixWorld ===
        "function"
      ) {
        pointcloud.updateMatrixWorld(
          true
        );
      }

      var transformedBox =
        box.clone();

      transformedBox.applyMatrix4(
        pointcloud.matrixWorld
      );

      var transformedBounds =
        readPointCloudBox(
          transformedBox
        );

      if (
        transformedBounds
      ) {
        return transformedBounds;
      }
    } catch (
      error
    ) {
      console.warn(
        "Could not transform point-cloud bounds:",
        error
      );
    }
  }

  return readPointCloudBox(
    box
  );
}


function getTightWorldBounds(
  pointcloud
) {
  var geometry =
    pointcloud.pcoGeometry;

  var box =
    geometry &&
    geometry.tightBoundingBox;

  if (
    !box ||
    typeof box.clone !==
    "function" ||
    (
      typeof box.isEmpty ===
      "function" &&
      box.isEmpty()
    )
  ) {
    return null;
  }

  try {
    if (
      typeof pointcloud.updateMatrixWorld ===
      "function"
    ) {
      pointcloud.updateMatrixWorld(
        true
      );
    }

    var worldBox =
      box.clone();

    if (
      pointcloud.matrixWorld
    ) {
      worldBox.applyMatrix4(
        pointcloud.matrixWorld
      );
    }

    return readPointCloudBox(
      worldBox
    );
  } catch (
    error
  ) {
    return null;
  }
}


function getCombinedPointCloudBounds(
  pointclouds
) {
  if (
    !Array.isArray(
      pointclouds
    ) ||
    pointclouds.length ===
    0
  ) {
    return null;
  }

  var combined =
    null;

  pointclouds.forEach(
    function (pointcloud) {
      var bounds =
        getPointCloudWorldBounds(
          pointcloud
        );

      if (
        !bounds
      ) {
        return;
      }

      if (
        !combined
      ) {
        combined = {
          min: {
            x:
              bounds.min.x,

            y:
              bounds.min.y,

            z:
              bounds.min.z
          },

          max: {
            x:
              bounds.max.x,

            y:
              bounds.max.y,

            z:
              bounds.max.z
          }
        };

        return;
      }

      combined.min.x =
        Math.min(
          combined.min.x,
          bounds.min.x
        );

      combined.min.y =
        Math.min(
          combined.min.y,
          bounds.min.y
        );

      combined.min.z =
        Math.min(
          combined.min.z,
          bounds.min.z
        );

      combined.max.x =
        Math.max(
          combined.max.x,
          bounds.max.x
        );

      combined.max.y =
        Math.max(
          combined.max.y,
          bounds.max.y
        );

      combined.max.z =
        Math.max(
          combined.max.z,
          bounds.max.z
        );
    }
  );

  return combined;
}


function setOrbitCenter(
  center
) {
  if (
    !viewer ||
    !viewer.scene ||
    !center
  ) {
    return;
  }

  setNavigationPivot(
    center
  );

  var view =
    viewer.scene.view;

  var controls =
    viewer.orbitControls ||
    viewer.controls ||
    null;

  if (
    view
  ) {
    if (
      typeof view.setPivot ===
      "function"
    ) {
      view.setPivot(
        center
      );
    }

    if (
      view.pivot &&
      typeof view.pivot.copy ===
      "function"
    ) {
      view.pivot.copy(
        center
      );
    }

    if (
      view.target &&
      typeof view.target.copy ===
      "function"
    ) {
      view.target.copy(
        center
      );
    }
  }

  if (
    controls
  ) {
    if (
      typeof controls.setPivot ===
      "function"
    ) {
      controls.setPivot(
        center
      );
    }

    if (
      controls.pivot &&
      typeof controls.pivot.copy ===
      "function"
    ) {
      controls.pivot.copy(
        center
      );
    }

    if (
      controls.target &&
      typeof controls.target.copy ===
      "function"
    ) {
      controls.target.copy(
        center
      );
    }
  }
}


function getViewDirection(
  view,
  center
) {
  var direction =
    null;

  if (
    view &&
    view.direction &&
    typeof view.direction.clone ===
    "function"
  ) {
    direction =
      view.direction.clone();
  }

  if (
    !direction &&
    view &&
    typeof view.getDirection ===
    "function"
  ) {
    direction =
      view.getDirection();

    if (
      direction &&
      typeof direction.clone ===
      "function"
    ) {
      direction =
        direction.clone();
    }
  }

  if (
    !direction &&
    view &&
    view.position &&
    center &&
    typeof center.clone ===
    "function"
  ) {
    direction =
      center.clone()
        .sub(
          view.position
        );
  }

  if (
    !direction ||
    typeof direction.normalize !==
    "function" ||
    direction.lengthSq() <
    0.000001
  ) {
    if (
      view &&
      view.position &&
      typeof view.position.clone ===
      "function"
    ) {
      direction =
        view.position.clone();

      direction.set(
        0,
        -1,
        -0.5
      );
    }
  }

  if (
    direction &&
    typeof direction.normalize ===
    "function"
  ) {
    direction.normalize();
  }

  return direction;
}

/*
  Frames the bounds exactly: the box center lands in the middle of
  the viewer and the camera keeps its current viewing direction.
  The distance is computed from all 8 box corners, so tall, flat or
  long scans are framed tightly instead of using a loose sphere.
*/
function fitBounds(
  bounds,
  fitFactor,
  statusMessage
) {
  if (
    !viewer ||
    !viewer.scene ||
    !bounds ||
    !bounds.min ||
    !bounds.max
  ) {
    return false;
  }

  var view =
    viewer.scene.view;

  if (
    !view ||
    !view.position ||
    typeof view.position.clone !==
    "function"
  ) {
    return false;
  }

  var minX = Number(bounds.min.x);
  var minY = Number(bounds.min.y);
  var minZ = Number(bounds.min.z);
  var maxX = Number(bounds.max.x);
  var maxY = Number(bounds.max.y);
  var maxZ = Number(bounds.max.z);

  if (
    ![minX, minY, minZ, maxX, maxY, maxZ].every(isFinite)
  ) {
    return false;
  }

  var center = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    z: (minZ + maxZ) / 2
  };

  /*
    Camera axes. Z is up.
  */
  var currentDirection =
    getViewDirection(
      view,
      null
    );

  var forward =
    normalize3(
      currentDirection
        ? {
          x: currentDirection.x,
          y: currentDirection.y,
          z: currentDirection.z
        }
        : {
          x: 0,
          y: -1,
          z: -0.5
        }
    );

  var right =
    cross3(
      forward,
      { x: 0, y: 0, z: 1 }
    );

  if (
    length3(right) < 0.000001
  ) {
    right = { x: 1, y: 0, z: 0 };
  }

  right =
    normalize3(right);

  var up =
    normalize3(
      cross3(
        right,
        forward
      )
    );

  /*
    Field of view and aspect ratio of the canvas.
  */
  var fov =
    typeof viewer.getFOV === "function"
      ? Number(viewer.getFOV())
      : 60;

  if (
    !isFinite(fov) ||
    fov <= 0
  ) {
    fov = 60;
  }

  var canvas =
    viewer.renderer &&
    viewer.renderer.domElement;

  var aspect =
    canvas
      ? (canvas.clientWidth || canvas.width || 1) /
        Math.max(canvas.clientHeight || canvas.height || 1, 1)
      : 1;

  if (
    !isFinite(aspect) ||
    aspect <= 0
  ) {
    aspect = 1;
  }

  var tanVertical =
    Math.tan(
      fov * Math.PI / 360
    );

  var tanHorizontal =
    tanVertical * aspect;

  /*
    fitFactor = share of the screen the model may fill (0.9 = 10% margin).
  */
  var margin =
    Number(fitFactor);

  if (
    !isFinite(margin) ||
    margin <= 0 ||
    margin > 1
  ) {
    margin = 0.9;
  }

  var distance = 0;

  var halfWidth = 0;

  [minX, maxX].forEach(function (x) {
    [minY, maxY].forEach(function (y) {
      [minZ, maxZ].forEach(function (z) {
        var p = {
          x: x - center.x,
          y: y - center.y,
          z: z - center.z
        };

        var screenX = Math.abs(dot3(p, right));
        var screenY = Math.abs(dot3(p, up));
        var depth = dot3(p, forward);

        halfWidth = Math.max(
          halfWidth,
          screenX / margin,
          screenY * aspect / margin
        );

        distance = Math.max(
          distance,
          screenX / (tanHorizontal * margin) - depth,
          screenY / (tanVertical * margin) - depth
        );
      });
    });
  });

  var multiplier =
    Number(CONFIG.fitDistanceMultiplier);

  if (
    isFinite(multiplier) &&
    multiplier > 0
  ) {
    distance *= multiplier;
  }

  var largestSize =
    Math.max(
      maxX - minX,
      maxY - minY,
      maxZ - minZ
    );

  distance =
    Math.max(
      distance,
      largestSize * 0.01,
      0.01
    );

  var target =
    view.position.clone();

  target.set(
    center.x,
    center.y,
    center.z
  );

  var position =
    view.position.clone();

  position.set(
    center.x - forward.x * distance,
    center.y - forward.y * distance,
    center.z - forward.z * distance
  );

  placeCamera(
    position,
    target,
    halfWidth
  );

  if (
    statusMessage
  ) {
    setStatus(
      statusMessage,
      "idle"
    );
  }

  return true;
}


/*
  Puts the camera at position, looking at target, and makes target
  the orbit center so orbiting doesn't make the model jump.
*/
function placeCamera(
  position,
  target,
  orthoHalfWidth
) {
  var view =
    viewer.scene.view;

  view.position.copy(
    position
  );

  if (
    typeof view.lookAt ===
    "function"
  ) {
    view.lookAt(
      target
    );
  }

  var distance =
    position.distanceTo(
      target
    );

  view.radius =
    distance;

  setOrbitCenter(
    target
  );

  navigation.perspectiveRadius =
    distance;

  /*
    In orthographic view Potree uses view.radius as half the visible
    width, so convert the distance into that scale.
  */
  if (
    isOrthographic()
  ) {
    view.radius =
      orthoHalfWidth ||
      distance *
      Math.tan(getViewerFov() * Math.PI / 360) *
      getViewerAspect();

    navigation.orthoTarget =
      view.radius;
  }

  if (
    typeof viewer.scene.getActiveCamera ===
    "function"
  ) {
    var camera =
      viewer.scene.getActiveCamera();

    if (
      camera &&
      typeof camera.updateProjectionMatrix ===
      "function"
    ) {
      camera.updateProjectionMatrix();
    }
  }
}


function dot3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function length3(a) {
  return Math.sqrt(dot3(a, a));
}

function normalize3(a) {
  var length =
    length3(a) || 1;

  return {
    x: a.x / length,
    y: a.y / length,
    z: a.z / length
  };
}


/* -------------------------------------------------------------------------- */
/* START VIEW                                                                 */
/* -------------------------------------------------------------------------- */

/*
  Reads startView from location-config.js:

  startView: {
    position: [x, y, z],
    target: [x, y, z]
  }
*/
function readVector3(
  value
) {
  if (
    !value
  ) {
    return null;
  }

  var parts =
    Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(/[;,\s]+/).filter(Boolean)
        : [value.x, value.y, value.z];

  var numbers =
    parts.slice(0, 3).map(Number);

  return numbers.length === 3 &&
    numbers.every(isFinite)
    ? numbers
    : null;
}

function readStartView() {
  var startView =
    LOCATION_CONFIG.startView;

  if (
    !startView
  ) {
    return null;
  }

  var position =
    readVector3(startView.position);

  var target =
    readVector3(startView.target);

  return position && target
    ? { position: position, target: target }
    : null;
}

function applyStartView() {
  var startView =
    readStartView();

  if (
    !startView ||
    !viewer ||
    !viewer.scene ||
    !viewer.scene.view
  ) {
    return false;
  }

  var view =
    viewer.scene.view;

  var position =
    view.position.clone();

  position.set(
    startView.position[0],
    startView.position[1],
    startView.position[2]
  );

  var target =
    view.position.clone();

  target.set(
    startView.target[0],
    startView.target[1],
    startView.target[2]
  );

  placeCamera(
    position,
    target
  );

  return true;
}

function getCurrentTarget() {
  var view =
    viewer.scene.view;

  if (
    typeof view.getPivot ===
    "function"
  ) {
    return view.getPivot();
  }

  var direction =
    getViewDirection(
      view,
      null
    );

  return view.position.clone()
    .add(
      direction.clone()
        .multiplyScalar(
          view.radius || 1
        )
    );
}

/*
  Copies the current camera as a startView block for location-config.js.
*/
function copyStartView() {
  if (
    !viewer ||
    !viewer.scene ||
    !viewer.scene.view
  ) {
    return;
  }

  var round = function (n) {
    return Math.round(n * 1000) / 1000;
  };

  var position =
    viewer.scene.view.position;

  var target =
    getCurrentTarget();

  var snippet =
    "  startView: {\n" +
    "    position: [" + [position.x, position.y, position.z].map(round).join(", ") + "],\n" +
    "    target: [" + [target.x, target.y, target.z].map(round).join(", ") + "]\n" +
    "  },";

  console.log(
    "Start view for location-config.js:\n" +
    snippet
  );

  var done = function () {
    setStatus(
      "Start view copied. Paste it into location-config.js.",
      "idle"
    );
  };

  if (
    navigator.clipboard &&
    navigator.clipboard.writeText
  ) {
    navigator.clipboard
      .writeText(snippet)
      .then(done)
      .catch(function () {
        window.prompt("Copy this into location-config.js:", snippet);
      });
  } else {
    window.prompt("Copy this into location-config.js:", snippet);
  }
}


function fitUsingPotree(
  cloudsToFit,
  centerBounds,
  statusMessage
) {
  if (
    !viewer ||
    !viewer.scene ||
    typeof viewer.fitToScreen !==
    "function"
  ) {
    return false;
  }

  var allClouds =
    viewer.scene.pointclouds ||
    [];

  var previousVisibility =
    [];

  allClouds.forEach(
    function (cloud) {
      previousVisibility.push({
        cloud:
          cloud,

        visible:
          cloud.visible !==
          false
      });

      cloud.visible =
        cloudsToFit.indexOf(
          cloud
        ) !==
        -1;
    }
  );

  try {
    viewer.fitToScreen(
      0.9
    );
  } finally {
    previousVisibility.forEach(
      function (item) {
        item.cloud.visible =
          item.visible;
      }
    );
  }

  if (
    centerBounds &&
    viewer.scene.view &&
    viewer.scene.view.position
  ) {
    var center =
      viewer.scene.view.position.clone();

    center.set(
      (
        centerBounds.min.x +
        centerBounds.max.x
      ) /
      2,

      (
        centerBounds.min.y +
        centerBounds.max.y
      ) /
      2,

      (
        centerBounds.min.z +
        centerBounds.max.z
      ) /
      2
    );

    setOrbitCenter(
      center
    );
  }

  if (
    statusMessage
  ) {
    setStatus(
      statusMessage,
      "idle"
    );
  }

  return true;
}


function fitActiveScan() {
  if (
    !viewer ||
    !viewer.scene ||
    !state.activeCloud
  ) {
    setStatus(
      "Select a scan first.",
      "error"
    );

    return;
  }

  /*
    Fit the active scan even if it is hidden.
  */
  var bounds =
    getPointCloudWorldBounds(
      state.activeCloud
    ) ||
    state.activeBounds;

  if (
    bounds &&
    fitBounds(
      bounds,
      CONFIG.fitFactor,
      "Focused on " +
      (
        state.activeScan
          ? state.activeScan.name
          : "active scan"
      )
    )
  ) {
    return;
  }

  /*
    Fallback for Potree versions where the
    bounds are not exposed directly.
  */
  fitUsingPotree(
    [
      state.activeCloud
    ],
    bounds,
    "Focused on " +
    (
      state.activeScan
        ? state.activeScan.name
        : "active scan"
    )
  );
}


function fitAllScans() {
  if (
    !viewer ||
    !viewer.scene
  ) {
    setStatus(
      "Potree scene is unavailable.",
      "error"
    );

    return;
  }

  var pointclouds =
    viewer.scene.pointclouds ||
    [];

  var visibleClouds =
    pointclouds.filter(
      function (cloud) {
        return (
          cloud &&
          cloud.visible !==
          false
        );
      }
    );

  if (
    visibleClouds.length ===
    0
  ) {
    setStatus(
      "No visible scans.",
      "error"
    );

    return;
  }

  var bounds =
    getCombinedPointCloudBounds(
      visibleClouds
    );

  var allBoundsAvailable =
    visibleClouds.every(
      function (cloud) {
        return Boolean(
          getPointCloudWorldBounds(
            cloud
          )
        );
      }
    );

  if (
    allBoundsAvailable &&
    bounds &&
    fitBounds(
      bounds,
      CONFIG.fitFactor,
      "Focused on all visible scans."
    )
  ) {
    return;
  }

  fitUsingPotree(
    visibleClouds,
    bounds,
    "Focused on all visible scans."
  );
}


function resetView() {
  fitAllScans();
}


function activateOrbitMode() {
  setNavigationMode(
    "orbit"
  );
}


function downloadActiveScan() {
  if (
    !state.activeScan ||
    !state.activeScan.url
  ) {
    setStatus(
      "Select a scan first.",
      "error"
    );
    return;
  }

  // 1. Passwort-Abfrage über ein Browser-Popup
  var password = prompt("ENTER PASSWORD");

  // 2. Überprüfung: Wenn abgebrochen wurde oder das Passwort falsch ist
  if (password === null) {
    return; // Nutzer hat auf "Abbrechen" geklickt
  }

  var configuredPassword =
    String(
      CONFIG.downloadPassword ||
      ""
    );

  if (
    !configuredPassword ||
    password !== configuredPassword
  ) {
    setStatus(
      "Falsches Passwort!",
      "error"
    );
    return; // Funktion abbrechen
  }

  // 3. Download-Logik (wird nur ausgeführt, wenn das Passwort erfüllt ist)
  var link =
    document.createElement(
      "a"
    );

  link.href =
    state.activeScan.url;

  link.download =
    state.activeScan.filename ||
    state.activeScan.name +
    ".copc.laz";

  link.target =
    "_blank";

  link.rel =
    "noopener";

  document.body.appendChild(
    link
  );

  link.click();

  link.remove();
}



/* -------------------------------------------------------------------------- */
/* SCREENSHOT EXPORT                                                          */
/* -------------------------------------------------------------------------- */

function getActiveViewerCamera() {
  if (
    !viewer ||
    !viewer.scene
  ) {
    return null;
  }

  if (
    typeof viewer.scene.getActiveCamera ===
    "function"
  ) {
    return viewer.scene.getActiveCamera();
  }

  return (
    viewer.scene.camera ||
    viewer.scene.cameraP ||
    null
  );
}

function getScreenshotFilename(
  width,
  height,
  scale
) {
  var name =
    state.activeScan &&
    state.activeScan.name
      ? state.activeScan.name
      : "potree-viewer";

  name =
    String(
      name
    )
      .replace(
        /[^\w-]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      );

  if (
    !name
  ) {
    name =
      "potree-viewer";
  }

  var safeScale =
    Number(
      scale
    );

  if (
    !isFinite(
      safeScale
    ) ||
    safeScale <= 0
  ) {
    safeScale =
      1;
  }

  return (
    name +
    "_" +
    safeScale +
    "x_" +
    width +
    "x" +
    height +
    ".png"
  );
}

function getScreenshotScale() {
  var select =
    getElement(
      "screenshotScale"
    );

  var value =
    select
      ? Number(
          select.value
        )
      : Number(
          CONFIG.screenshotScale
        );

  if (
    value !== 1 &&
    value !== 2 &&
    value !== 3 &&
    value !== 4 &&
    value !== 5
  ) {
    value =
      Number(
        CONFIG.screenshotScale
      );

    if (
      value !== 1 &&
      value !== 2 &&
      value !== 3 &&
      value !== 4 &&
      value !== 5
    ) {
      value =
        3;
    }
  }

  return value;
}

function exportScreenshot() {
  if (
    !viewer ||
    !viewer.renderer ||
    !viewer.renderer.domElement
  ) {
    setStatus(
      "Potree renderer is unavailable.",
      "error"
    );

    return;
  }

  var renderer =
    viewer.renderer;

  var canvas =
    renderer.domElement;

  var renderArea =
    getElement(
      "potree_render_area"
    );

  var camera =
    getActiveViewerCamera();

  var button =
    getElement(
      "exportScreenshot"
    );

    var screenshotScale =
    getScreenshotScale();

  /*
    Use the current physical drawing-buffer dimensions.

    Example:
      current viewer canvas: 3374 x 1400
      scale: 2
      export: 6748 x 2800
  */
  var baseWidth =
    Number(
      canvas.width
    );

  var baseHeight =
    Number(
      canvas.height
    );

  if (
    !isFinite(
      baseWidth
    ) ||
    baseWidth <= 0
  ) {
    var fallbackPixelRatio =
      typeof renderer.getPixelRatio ===
      "function"
        ? renderer.getPixelRatio()
        : 1;

    baseWidth =
      Math.round(
        (
          canvas.clientWidth ||
          (
            renderArea &&
            renderArea.clientWidth
          ) ||
          1
        ) *
        fallbackPixelRatio
      );
  }

  if (
    !isFinite(
      baseHeight
    ) ||
    baseHeight <= 0
  ) {
    var fallbackHeightPixelRatio =
      typeof renderer.getPixelRatio ===
      "function"
        ? renderer.getPixelRatio()
        : 1;

    baseHeight =
      Math.round(
        (
          canvas.clientHeight ||
          (
            renderArea &&
            renderArea.clientHeight
          ) ||
          1
        ) *
        fallbackHeightPixelRatio
      );
  }

  baseWidth =
    Math.max(
      1,
      Math.round(
        baseWidth
      )
    );

  baseHeight =
    Math.max(
      1,
      Math.round(
        baseHeight
      )
    );

  var targetWidth =
    Math.max(
      1,
      Math.round(
        baseWidth *
        screenshotScale
      )
    );

  var targetHeight =
    Math.max(
      1,
      Math.round(
        baseHeight *
        screenshotScale
      )
    );

  var originalPixelRatio =
    typeof renderer.getPixelRatio ===
    "function"
      ? renderer.getPixelRatio()
      : 1;

  if (
    !isFinite(
      originalPixelRatio
    ) ||
    originalPixelRatio <= 0
  ) {
    originalPixelRatio =
      1;
  }

  var originalRendererSize =
    null;

  if (
    typeof renderer.getSize ===
    "function" &&
    window.THREE &&
    window.THREE.Vector2
  ) {
    try {
      originalRendererSize =
        renderer.getSize(
          new window.THREE.Vector2()
        );
    } catch (
      error
    ) {
      originalRendererSize =
        null;
    }
  }

  var originalCanvasWidth =
    canvas.width;

  var originalCanvasHeight =
    canvas.height;

  var originalCanvasStyle =
    canvas.style.cssText;

  var originalRenderAreaStyle =
    renderArea
      ? renderArea.style.cssText
      : "";

  var originalCameraAspect =
    camera &&
    typeof camera.aspect ===
    "number"
      ? camera.aspect
      : null;

  var originalViewerBackground =
    viewer.background;

  var hasSceneBackground =
    Boolean(
      viewer.scene &&
      "background" in viewer.scene
    );

  var originalSceneBackground =
    hasSceneBackground
      ? viewer.scene.background
      : null;

  var originalClearAlpha =
    typeof renderer.getClearAlpha ===
    "function"
      ? renderer.getClearAlpha()
      : 1;

  var originalClearColor =
    null;

  if (
    typeof renderer.getClearColor ===
    "function" &&
    window.THREE &&
    window.THREE.Color
  ) {
    try {
      originalClearColor =
        renderer.getClearColor(
          new window.THREE.Color()
        ).clone();
    } catch (
      error
    ) {
      originalClearColor =
        null;
    }
  }

  var originalAutoClear =
    typeof renderer.autoClear ===
    "boolean"
      ? renderer.autoClear
      : null;

  var originalAutoClearColor =
    typeof renderer.autoClearColor ===
    "boolean"
      ? renderer.autoClearColor
      : null;

  var originalAutoClearDepth =
    typeof renderer.autoClearDepth ===
    "boolean"
      ? renderer.autoClearDepth
      : null;

  var originalAutoClearStencil =
    typeof renderer.autoClearStencil ===
    "boolean"
      ? renderer.autoClearStencil
      : null;

  var originalSetSize =
    renderer.setSize;

  var originalSetPixelRatio =
    typeof renderer.setPixelRatio ===
    "function"
      ? renderer.setPixelRatio
      : null;

  var originalSetViewport =
    typeof renderer.setViewport ===
    "function"
      ? renderer.setViewport
      : null;

  var originalSetScissor =
    typeof renderer.setScissor ===
    "function"
      ? renderer.setScissor
      : null;

  var originalSetClearColor =
    typeof renderer.setClearColor ===
    "function"
      ? renderer.setClearColor
      : null;

  var originalSetClearAlpha =
    typeof renderer.setClearAlpha ===
    "function"
      ? renderer.setClearAlpha
      : null;

  var originalOnWindowResize =
    viewer &&
    typeof viewer.onWindowResize ===
    "function"
      ? viewer.onWindowResize
      : null;

  var originalButtonText =
    button
      ? button.textContent
      : "";

  var restored =
    false;

  function forceTransparentBackground() {
    if (
      renderArea
    ) {
      renderArea.style.setProperty(
        "background",
        "transparent",
        "important"
      );

      renderArea.style.setProperty(
        "background-image",
        "none",
        "important"
      );

      renderArea.style.setProperty(
        "background-color",
        "transparent",
        "important"
      );
    }

    canvas.style.setProperty(
      "background",
      "transparent",
      "important"
    );

    canvas.style.setProperty(
      "background-image",
      "none",
      "important"
    );

    canvas.style.setProperty(
      "background-color",
      "transparent",
      "important"
    );

    if (
      viewer &&
      typeof viewer.setBackground ===
      "function"
    ) {
      try {
        viewer.setBackground(
          "none"
        );
      } catch (
        error
      ) {
        console.warn(
          "Could not set Potree background to none:",
          error
        );
      }
    }

    /*
      Potree versions differ in how they store the background.
      Set both representations.
    */
    viewer.background =
      "none";

    if (
      hasSceneBackground
    ) {
      viewer.scene.background =
        null;
    }

    if (
      originalSetClearColor
    ) {
      originalSetClearColor.call(
        renderer,
        0x000000,
        0
      );
    }

    if (
      originalSetClearAlpha
    ) {
      originalSetClearAlpha.call(
        renderer,
        0
      );
    }

    /*if (
      originalAutoClear !==
      null
    ) {
      renderer.autoClear =
        true;
    }

    if (
      originalAutoClearColor !==
      null
    ) {
      renderer.autoClearColor =
        true;
    }

    if (
      originalAutoClearDepth !==
      null
    ) {
      renderer.autoClearDepth =
        true;
    }

    if (
      originalAutoClearStencil !==
      null
    ) {
      renderer.autoClearStencil =
        true;
    }*/
  }

  function setScreenshotSize() {
    /*
      Use pixel ratio 1 because targetWidth and targetHeight
      are already physical pixel dimensions.
    */
    if (
      originalSetPixelRatio
    ) {
      originalSetPixelRatio.call(
        renderer,
        1
      );
    }

    originalSetSize.call(
      renderer,
      targetWidth,
      targetHeight,
      false
    );

    /*
      Older Three.js/Potree combinations can occasionally
      leave the canvas at its previous drawing-buffer size.
    */
    if (
      canvas.width !==
      targetWidth
    ) {
      canvas.width =
        targetWidth;
    }

    if (
      canvas.height !==
      targetHeight
    ) {
      canvas.height =
        targetHeight;
    }

    if (
      originalSetViewport
    ) {
      originalSetViewport.call(
        renderer,
        0,
        0,
        targetWidth,
        targetHeight
      );
    }

    if (
      originalSetScissor
    ) {
      originalSetScissor.call(
        renderer,
        0,
        0,
        targetWidth,
        targetHeight
      );
    }

    if (
      camera &&
      typeof camera.aspect ===
      "number"
    ) {
      camera.aspect =
        targetWidth /
        targetHeight;

      if (
        typeof camera.updateProjectionMatrix ===
        "function"
      ) {
        camera.updateProjectionMatrix();
      }
    }

    forceTransparentBackground();
  }

  function installScreenshotOverrides() {
    /*
      Potree may call renderer.setSize() internally.
      Prevent it from changing the export back to the
      normal viewer size.
    */
    renderer.setSize =
      function () {
        return originalSetSize.call(
          renderer,
          targetWidth,
          targetHeight,
          false
        );
      };

    if (
      originalSetPixelRatio
    ) {
      renderer.setPixelRatio =
        function () {
          return originalSetPixelRatio.call(
            renderer,
            1
          );
        };
    }

    if (
      originalSetViewport
    ) {
      renderer.setViewport =
        function () {
          return originalSetViewport.call(
            renderer,
            0,
            0,
            targetWidth,
            targetHeight
          );
        };
    }

    if (
      originalSetScissor
    ) {
      renderer.setScissor =
        function () {
          return originalSetScissor.call(
            renderer,
            0,
            0,
            targetWidth,
            targetHeight
          );
        };
    }

    /*
      Keep the WebGL background transparent even if Potree
      changes the clear color while rendering.
    */
    if (
      originalSetClearColor
    ) {
      renderer.setClearColor =
        function () {
          return originalSetClearColor.call(
            renderer,
            0x000000,
            0
          );
        };
    }

    if (
      originalSetClearAlpha
    ) {
      renderer.setClearAlpha =
        function () {
          return originalSetClearAlpha.call(
            renderer,
            0
          );
        };
    }

    /*
      Prevent Potree's resize handler from restoring the
      normal viewer dimensions.
    */
    if (
      originalOnWindowResize
    ) {
      viewer.onWindowResize =
        function () {
          setScreenshotSize();
        };
    }
  }

  function restoreViewer() {
    if (
      restored
    ) {
      return;
    }

    restored =
      true;

    renderer.setSize =
      originalSetSize;

    if (
      originalSetPixelRatio
    ) {
      renderer.setPixelRatio =
        originalSetPixelRatio;
    }

    if (
      originalSetViewport
    ) {
      renderer.setViewport =
        originalSetViewport;
    }

    if (
      originalSetScissor
    ) {
      renderer.setScissor =
        originalSetScissor;
    }

    if (
      originalSetClearColor
    ) {
      renderer.setClearColor =
        originalSetClearColor;
    }

    if (
      originalSetClearAlpha
    ) {
      renderer.setClearAlpha =
        originalSetClearAlpha;
    }

    if (
      originalOnWindowResize
    ) {
      viewer.onWindowResize =
        originalOnWindowResize;
    }

    if (
      renderArea
    ) {
      renderArea.style.cssText =
        originalRenderAreaStyle;
    }

    canvas.style.cssText =
      originalCanvasStyle;

    if (
      originalSetPixelRatio
    ) {
      originalSetPixelRatio.call(
        renderer,
        originalPixelRatio
      );
    }

    if (
      originalRendererSize
    ) {
      originalSetSize.call(
        renderer,
        originalRendererSize.x,
        originalRendererSize.y,
        false
      );
    } else {
      originalSetSize.call(
        renderer,
        canvas.clientWidth ||
        1,
        canvas.clientHeight ||
        1,
        false
      );
    }

    if (
      canvas.width !==
      originalCanvasWidth
    ) {
      canvas.width =
        originalCanvasWidth;
    }

    if (
      canvas.height !==
      originalCanvasHeight
    ) {
      canvas.height =
        originalCanvasHeight;
    }

    if (
      originalClearColor &&
      originalSetClearColor
    ) {
      originalSetClearColor.call(
        renderer,
        originalClearColor,
        originalClearAlpha
      );
    }

    if (
      originalSetClearAlpha
    ) {
      originalSetClearAlpha.call(
        renderer,
        originalClearAlpha
      );
    }

    if (
      originalAutoClear !==
      null
    ) {
      renderer.autoClear =
        originalAutoClear;
    }

    if (
      originalAutoClearColor !==
      null
    ) {
      renderer.autoClearColor =
        originalAutoClearColor;
    }

    if (
      originalAutoClearDepth !==
      null
    ) {
      renderer.autoClearDepth =
        originalAutoClearDepth;
    }

    if (
      originalAutoClearStencil !==
      null
    ) {
      renderer.autoClearStencil =
        originalAutoClearStencil;
    }

    if (
      viewer &&
      typeof viewer.setBackground ===
      "function" &&
      originalViewerBackground !==
      undefined
    ) {
      try {
        viewer.setBackground(
          originalViewerBackground
        );
      } catch (
        error
      ) {
        console.warn(
          "Could not restore Potree background:",
          error
        );
      }
    }

    if (
      hasSceneBackground
    ) {
      viewer.scene.background =
        originalSceneBackground;
    }

    if (
      camera &&
      originalCameraAspect !==
      null
    ) {
      camera.aspect =
        originalCameraAspect;

      if (
        typeof camera.updateProjectionMatrix ===
        "function"
      ) {
        camera.updateProjectionMatrix();
      }
    }

    if (
      originalOnWindowResize
    ) {
      try {
        originalOnWindowResize.call(
          viewer
        );
      } catch (
        error
      ) {
        console.warn(
          "Could not restore Potree window size:",
          error
        );
      }
    }

    if (
      button
    ) {
      button.disabled =
        false;

      button.textContent =
        originalButtonText;
    }
  }

  function downloadImage(
    dataUrl
  ) {
    var filename =
  getScreenshotFilename(
    targetWidth,
    targetHeight,
    screenshotScale
  );

    var link =
      document.createElement(
        "a"
      );

    link.href =
      dataUrl;

    link.download =
      filename;

    document.body.appendChild(
      link
    );

    link.click();

    link.remove();

    setStatus(
      "Screenshot exported: " +
      filename,
      "idle"
    );
  }

  function renderScreenshotFrame() {
    setScreenshotSize();

    if (
      !viewer ||
      typeof viewer.render !==
      "function"
    ) {
      throw new Error(
        "viewer.render() is unavailable."
      );
    }

    viewer.render();

    /*
      If Potree changed the drawing buffer for any reason,
      restore it and render one more frame.
    */
    if (
      canvas.width !==
        targetWidth ||
      canvas.height !==
        targetHeight
    ) {
      setScreenshotSize();

      viewer.render();
    }
  }

  function captureAfterFrames(
    frame,
    startedAt
  ) {
    try {
      renderScreenshotFrame();
    } catch (
      error
    ) {
      console.error(
        "Screenshot rendering failed:",
        error
      );

      restoreViewer();

      setStatus(
        "Screenshot export failed.",
        "error"
      );

      return;
    }

    var elapsed =
      Date.now() -
      startedAt;

    var warmupMs =
      Math.max(
        0,
        Number(
          CONFIG.screenshotWarmupMs
        ) ||
        0
      );

    if (
      frame < 3 ||
      elapsed < warmupMs
    ) {
      window.requestAnimationFrame(
        function () {
          captureAfterFrames(
            frame +
            1,
            startedAt
          );
        }
      );

      return;
    }

    try {
      if (
        canvas.width !==
          targetWidth ||
        canvas.height !==
          targetHeight
      ) {
        renderScreenshotFrame();
      }

      if (
        canvas.width !==
          targetWidth ||
        canvas.height !==
          targetHeight
      ) {
        throw new Error(
          "The renderer produced " +
          canvas.width +
          " x " +
          canvas.height +
          " instead of " +
          targetWidth +
          " x " +
          targetHeight +
          "."
        );
      }

      var dataUrl =
        exportCanvasDataUrl(
          canvas
        );

      restoreViewer();

      downloadImage(
        dataUrl
      );
    } catch (
      error
    ) {
      console.error(
        "Screenshot export failed:",
        error
      );

      restoreViewer();

      setStatus(
        "Screenshot export failed.",
        "error"
      );
    }
  }

  try {
    var gl =
      typeof renderer.getContext ===
      "function"
        ? renderer.getContext()
        : null;

    if (
      gl
    ) {
      var maxRenderbufferSize =
        gl.getParameter(
          gl.MAX_RENDERBUFFER_SIZE
        );

      if (
        maxRenderbufferSize &&
        (
          targetWidth >
          maxRenderbufferSize ||
          targetHeight >
          maxRenderbufferSize
        )
      ) {
        throw new Error(
          "The GPU does not support " +
          targetWidth +
          " x " +
          targetHeight +
          ". Maximum renderbuffer size: " +
          maxRenderbufferSize
        );
      }

      var contextAttributes =
        gl.getContextAttributes &&
        gl.getContextAttributes();

      if (
        contextAttributes &&
        contextAttributes.alpha ===
        false
      ) {
        console.warn(
          "The WebGL renderer was created without alpha support. " +
          "Transparent PNG output requires an alpha-enabled WebGL context."
        );
      }
    }

    if (
      button
    ) {
      button.disabled =
        true;

      button.textContent =
        "Rendering...";
    }

    setStatus(
      "Rendering high-resolution screenshot...",
      "loading"
    );

    installScreenshotOverrides();

    setScreenshotSize();

    captureAfterFrames(
      0,
      Date.now()
    );
  } catch (
    error
  ) {
    console.error(
      "Could not prepare screenshot:",
      error
    );

    restoreViewer();

    setStatus(
      "Could not prepare screenshot.",
      "error"
    );
  }
}

/* -------------------------------------------------------------------------- */
/* DESCRIPTION DIALOG                                                         */
/* -------------------------------------------------------------------------- */

function openDescriptionDialog() {
  var dialog =
    getElement("descriptionDialog");

  if (!dialog) {
    return;
  }

  if (typeof dialog.showModal === "function") {
    if (!dialog.open) {
      dialog.showModal();
    }

    return;
  }

  /*
    Fallback for browsers without dialog.showModal().
  */
  dialog.setAttribute("open", "");
}

function closeDescriptionDialog() {
  var dialog =
    getElement("descriptionDialog");

  if (!dialog) {
    return;
  }

  if (
    typeof dialog.close === "function" &&
    dialog.open
  ) {
    dialog.close();
    return;
  }

  dialog.removeAttribute("open");
}

function bindDescriptionDialog() {
  var dialog =
    getElement("descriptionDialog");

  var openButton =
    getElement("OpenDescription");

  var closeButton =
    getElement("closeDescription");

  if (!dialog) {
    console.warn("descriptionDialog was not found.");
    return;
  }

  if (openButton) {
    openButton.addEventListener(
      "click",
      function () {
        openDescriptionDialog();
      }
    );
  } else {
    console.warn("OpenDescription button was not found.");
  }

  if (closeButton) {
    closeButton.addEventListener(
      "click",
      function () {
        closeDescriptionDialog();
      }
    );
  }

  /*
    Close when clicking the dialog backdrop.
  */
  dialog.addEventListener(
    "click",
    function (event) {
      if (event.target === dialog) {
        closeDescriptionDialog();
      }
    }
  );

  /*
    Allow closing with the Escape key.
  */
  dialog.addEventListener(
    "cancel",
    function () {
      closeDescriptionDialog();
    }
  );
}

/* -------------------------------------------------------------------------- */
/* EVENTS                                                                     */
/* -------------------------------------------------------------------------- */


function bindEvents() {
  bindDropdown(
  "toggleLibrary",
  "libraryDropdownContent"
);

bindDropdown(
  "toggleInspector",
  "inspectorDropdownContent"
);

window.addEventListener(
  "resize",
  updatePanelLayout
);

window.setTimeout(
  updatePanelLayout,
  0
);

  addEvent(
    "scanSearch",
    "input",
    function () {
      renderLibrary();
    }
  );

  addEvent(
    "refreshLibrary",
    "click",
    function () {
      loadCatalog()
        .then(
          function () {
            renderLibrary();

            setStatus(
              "Library refreshed",
              "idle"
            );
          }
        );
    }
  );

  addEvent(
    "fitView",
    "click",
    fitActiveScan
  );

  addEvent(
  "pointDisplayMode",
  "click",
  togglePointDisplayMode
);

  addEvent(
    "resetView",
    "click",
    fitAllScans
  );

  addEvent(
    "copyStartView",
    "click",
    copyStartView
  );

  addEvent(
    "toggleProjection",
    "click",
    toggleProjection
  );

  addEvent(
    "toggleNavigation",
    "click",
    toggleNavigationMode
  );

  document.addEventListener(
    "keydown",
    function (event) {
      if (
        (event.key === "o" || event.key === "O" || event.code === "KeyO") &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.repeat &&
        !isTypingInField(event.target)
      ) {
        toggleNavigationMode();
      }
    }
  );

  /*
    Once location-config.js has a startView, the camera button is
    hidden. Open the site with ?setview at the end of the address
    to show it again.
  */
  var startViewButton =
    getElement(
      "copyStartView"
    );

  if (
    startViewButton &&
    readStartView() &&
    !/[?&]setview\b/.test(window.location.search)
  ) {
    startViewButton.classList.add(
      "hidden"
    );
  }



  addEvent(
    "orbitMode",
    "click",
    activateOrbitMode
  );

  addEvent(
    "downloadScan",
    "click",
    downloadActiveScan
  );

  addEvent(
    "exportScreenshot",
    "click",
    exportScreenshot
  );

  addEvent(
    "colorMode",
    "change",
    function () {
      applyColorMode();

      setStatus(
        "Color mode updated",
        "idle"
      );
    }
  );

  addEvent(
    "pointSize",
    "input",
    applyPointSize
  );

  addEvent(
    "pointOpacity",
    "input",
    applyOpacity
  );

  addEvent(
    "pointBudget",
    "input",
    applyPointBudget
  );

  addEvent(
    "sectionMode",
    "change",
    function () {
      var mode =
        getElement(
          "sectionMode"
        );

      updateSectionControls();

      if (
        mode &&
        mode.value ===
        "none"
      ) {
        clearSection();
      }
    }
  );

  addEvent(
    "sectionAngle",
    "input",
    function () {
      var degrees =
        Math.round(
          getSectionAngle() * 180 / Math.PI
        );

      setText(
        "sectionAngleValue",
        degrees + "°"
      );

      /* Keep the position slider at the same relative place */
      var positionElement =
        getElement(
          "sectionPosition"
        );

      var range =
        getSectionRange();

      if (
        positionElement &&
        range
      ) {
        var oldMin = Number(positionElement.min);
        var oldMax = Number(positionElement.max);
        var oldValue = Number(positionElement.value);

        var fraction =
          oldMax > oldMin
            ? (oldValue - oldMin) / (oldMax - oldMin)
            : 0.5;

        var length =
          Math.max(range.max - range.min, 0.001);

        positionElement.min = range.min;
        positionElement.max = range.max;
        positionElement.step = Math.max(length / 1000, 0.000001);
        positionElement.value = range.min + clamp(fraction, 0, 1) * length;

        setText(
          "sectionPositionValue",
          formatCoordinate(
            Number(positionElement.value)
          )
        );
      }

      if (
        state.sectionVolume
      ) {
        applySection();
      }
    }
  );

  addEvent(
    "sectionPosition",
    "input",
    function () {
      var value =
        getNumberValue(
          "sectionPosition",
          0
        );

      setText(
        "sectionPositionValue",
        formatCoordinate(
          value
        )
      );

      if (
        state.sectionVolume
      ) {
        applySection();
      }
    }
  );

  addEvent(
    "sectionThickness",
    "input",
    function () {
      var value =
        getNumberValue(
          "sectionThickness",
          0
        );

      setText(
        "sectionThicknessValue",
        formatCoordinate(
          value
        ) +
        " units"
      );

      if (
        state.sectionVolume
      ) {
        applySection();
      }
    }
  );

  addEvent(
    "applySection",
    "click",
    applySection
  );

  addEvent(
    "clearSection",
    "click",
    clearSection
  );
}


/* -------------------------------------------------------------------------- */
/* STATUS                                                                     */
/* -------------------------------------------------------------------------- */

function setStatus(
  message,
  type
) {
  setText(
    "statusMessage",
    message
  );

  setViewerStatus(
    message,
    type
  );
}

function setViewerStatus(
  message,
  type
) {
  setText(
    "viewerStatus",
    message
  );

  var dot =
    getElement(
      "viewerStatusDot"
    );

  if (
    !dot
  ) {
    return;
  }

  dot.className =
    "status-dot status-idle";

  if (
    type ===
    "loading"
  ) {
    dot.className =
      "status-dot status-loading";
  }

  if (
    type ===
    "error"
  ) {
    dot.className =
      "status-dot status-error";
  }
}

function showLoading(
  message
) {
  setText(
    "loadingMessage",
    message
  );

  var overlay =
    getElement(
      "loadingOverlay"
    );

  if (
    overlay
  ) {
    overlay.classList.remove(
      "hidden"
    );
  }
}

function hideLoading() {
  var overlay =
    getElement(
      "loadingOverlay"
    );

  if (
    overlay
  ) {
    overlay.classList.add(
      "hidden"
    );
  }
}


/* -------------------------------------------------------------------------- */
/* UTILITIES                                                                  */
/* -------------------------------------------------------------------------- */

function getNumberValue(
  id,
  fallback
) {
  var element =
    getElement(
      id
    );

  if (
    !element
  ) {
    return fallback;
  }

  var value =
    Number(
      element.value
    );

  return isFinite(
    value
  )
    ? value
    : fallback;
}

function clamp(
  value,
  min,
  max
) {
  return Math.min(
    Math.max(
      value,
      min
    ),
    max
  );
}

function formatBytes(
  bytes
) {
  if (
    !bytes ||
    bytes <= 0
  ) {
    return "Unknown";
  }

  var units = [
    "B",
    "KiB",
    "MiB",
    "GiB"
  ];

  var index =
    Math.min(
      Math.floor(
        Math.log(
          bytes
        ) /
        Math.log(
          1024
        )
      ),
      units.length -
      1
    );

  var value =
    bytes /
    Math.pow(
      1024,
      index
    );

  return (
    value.toFixed(
      index ===
      0
        ? 0
        : 1
    ) +
    " " +
    units[index]
  );
}

function formatNumber(
  value
) {
  return new Intl.NumberFormat()
    .format(
      value
    );
}

function formatCompactNumber(
  value
) {
  if (
    value >=
    1000000
  ) {
    return (
      (
        value /
        1000000
      ).toFixed(
        1
      ) +
      "M"
    );
  }

  if (
    value >=
    1000
  ) {
    return (
      Math.round(
        value /
        1000
      ) +
      "K"
    );
  }

  return String(
    value
  );
}

function formatCoordinate(
  value
) {
  if (
    !isFinite(
      value
    )
  ) {
    return "—";
  }

  return Number(
    value
  ).toFixed(
    3
  );
}


bindDescriptionDialog();


/* -------------------------------------------------------------------------- */
/* SMOOTH NAVIGATION                                                          */
/* -------------------------------------------------------------------------- */

/*
  Replaces Potree's mouse controls with three predictable modes:

  Orbit  rotate around a fixed point (the model center after zooming,
         or any point you double-click). The point only changes when
         you zoom to a model or double-click, so it never wanders.
  Fly    first-person, like a game: drag to look, WASD to move in the
         direction you look, E/C up and down, wheel to glide forward.
  Walk   like Fly, but moving stays level (no climbing or falling).
         Height changes only with E/C. No jumping.

  Keyboard movement keeps its smooth start and stop in all modes.
*/

var navigation = {
  mode: "fly",
  controls: null,
  pivot: null,
  radius: null,
  targetRadius: null,
  targetYaw: 0,
  targetPitch: 0,
  appliedYaw: null,
  appliedPitch: null,
  holdPosition: false,
  glide: 0,
  drag: null,
  lastUpdate: 0
};

var NAVIGATION_HELP = {
  orbit:
    "Orbit · Rotate around model: left drag · Pan: right drag · Zoom: wheel · New center: double-click · Move: WASD/arrows · Up/down: E/C · Speed: , . · Switch: O",
  fly:
    "Fly · Look around: left drag · Pan: right drag · Glide: wheel · Move: WASD/arrows · Up/down: E/C · Speed: , . · Look at point: double-click · Switch: O",
  walk:
    "Look: left drag · Walk: WASD/arrows (stays level) · Up/down: E/C · Glide: wheel · Speed: , ."
};

function smoothFactor(
  deltaSeconds,
  timeConstant
) {
  return timeConstant > 0
    ? 1 - Math.exp(-deltaSeconds / timeConstant)
    : 1;
}

function clampPitch(
  pitch
) {
  var limit =
    Math.PI / 2 - 0.02;

  return Math.max(
    -limit,
    Math.min(limit, pitch)
  );
}

/*
  Potree direction: (0, 1, 0) turned by pitch around X, then by yaw around Z.
*/
function yawPitchFromDirection(
  direction
) {
  var d =
    normalize3({
      x: direction.x,
      y: direction.y,
      z: direction.z
    });

  return {
    yaw: Math.atan2(-d.x, d.y),
    pitch: Math.asin(Math.max(-1, Math.min(1, d.z)))
  };
}

function directionFromYawPitch(
  yaw,
  pitch
) {
  return {
    x: -Math.sin(yaw) * Math.cos(pitch),
    y: Math.cos(yaw) * Math.cos(pitch),
    z: Math.sin(pitch)
  };
}

/* Shortest way round, so a turn never spins the long way */
function nearestAngle(
  from,
  to
) {
  var difference =
    to - from;

  difference =
    Math.atan2(
      Math.sin(difference),
      Math.cos(difference)
    );

  return from + difference;
}

function installNavigation() {
  if (
    !viewer ||
    navigation.controls
  ) {
    return;
  }

  /*
    Potree calls update() on the active controls every frame and then
    copies the view into the camera. This object only uses that hook;
    all mouse input is handled below.
  */
  /*
    Potree renders an overlay scene that belongs to the active
    controls (sceneControls). Ours stays empty. It is created with
    the same Scene class Potree's own controls use.
  */
  var sceneControls =
    null;

  var potreeControls =
    viewer.orbitControls ||
    viewer.fpControls ||
    viewer.earthControls ||
    null;

  if (
    window.THREE &&
    typeof window.THREE.Scene ===
    "function"
  ) {
    sceneControls =
      new window.THREE.Scene();
  } else if (
    potreeControls &&
    potreeControls.sceneControls
  ) {
    sceneControls =
      new potreeControls.sceneControls.constructor();
  }

  var controls = {
    name: "SmoothNavigation",
    enabled: true,
    scene: null,
    sceneControls: sceneControls,
    setScene: function (scene) { this.scene = scene; },
    update: function (delta) { updateNavigation(delta); },
    stop: function () {},
    zoomToLocation: function () {},
    dispatchEvent: function () {},
    addEventListener: function () {},
    removeEventListener: function () {},
    hasEventListener: function () { return false; }
  };

  navigation.controls =
    controls;

  if (
    typeof viewer.setControls ===
    "function"
  ) {
    viewer.setControls(
      controls
    );
  } else {
    viewer.controls =
      controls;
  }

  if (
    viewer.renderer &&
    viewer.renderer.domElement
  ) {
    bindNavigationMouse(
      viewer.renderer.domElement
    );
  }

  var savedMode =
    null;

  try {
    savedMode =
      window.localStorage.getItem(
        "viewer:navigationMode"
      );
  } catch (
    error
  ) {
    savedMode = null;
  }

  setNavigationMode(
    savedMode ||
    LOCATION_CONFIG.navigationMode ||
    CONFIG.navigationMode,
    true
  );
}

function toggleNavigationMode() {
  setNavigationMode(
    navigation.mode === "orbit"
      ? "fly"
      : "orbit"
  );
}

function getCanvasDistance() {
  var view =
    viewer.scene.view;

  if (
    navigation.mode === "orbit" &&
    navigation.radius
  ) {
    return navigation.radius;
  }

  var radius =
    Number(view.radius);

  return isFinite(radius) && radius > 0
    ? radius
    : 10;
}

/*
  Called by placeCamera (zoom buttons, start view) and setOrbitCenter.
*/
function setNavigationPivot(
  center
) {
  if (
    !viewer ||
    !viewer.scene ||
    !center ||
    typeof center.clone !==
    "function"
  ) {
    return;
  }

  var view =
    viewer.scene.view;

  navigation.pivot =
    center.clone();

  navigation.radius =
    navigation.targetRadius =
      Math.max(
        view.position.distanceTo(center),
        0.01
      );

  navigation.targetYaw =
    view.yaw;

  navigation.targetPitch =
    view.pitch;

  navigation.appliedYaw =
    view.yaw;

  navigation.appliedPitch =
    view.pitch;

  navigation.holdPosition =
    false;

  navigation.glide =
    0;
}

/* Keyboard movement in orbit mode carries the center along */
function navigationCameraMoved(
  displacement
) {
  if (
    navigation.mode === "orbit" &&
    navigation.pivot
  ) {
    navigation.pivot.add(
      displacement
    );
  }
}

function setNavigationMode(
  mode,
  silent
) {
  if (
    ["orbit", "fly", "walk"].indexOf(mode) === -1
  ) {
    mode = "fly";
  }

  navigation.mode =
    mode;

  navigation.glide =
    0;

  if (
    mode === "orbit" &&
    viewer &&
    viewer.scene
  ) {
    /*
      Orbit around what is in the middle of the screen, or around a
      point straight ahead at the usual distance.
    */
    var view =
      viewer.scene.view;

    var canvas =
      viewer.renderer &&
      viewer.renderer.domElement;

    var hit =
      canvas
        ? pickPointAt(
          canvas.clientWidth / 2,
          canvas.clientHeight / 2
        )
        : null;

    if (
      !hit
    ) {
      hit =
        view.position.clone().add(
          view.direction.multiplyScalar(
            getCanvasDistance()
          )
        );
    }

    setNavigationPivot(
      hit
    );
  }

  var toggle =
    getElement(
      "toggleNavigation"
    );

  if (
    toggle
  ) {
    toggle.dataset.mode =
      mode;

    toggle.title =
      mode === "orbit"
        ? "Orbit: dragging rotates around the model. Click for Fly (O)"
        : "Fly: dragging looks around like in a game. Click for Orbit (O)";
  }

  try {
    window.localStorage.setItem(
      "viewer:navigationMode",
      mode
    );
  } catch (
    error
  ) {
    /* storage unavailable */
  }

  var help =
    document.querySelector(
      ".viewer-help"
    );

  if (
    help
  ) {
    help.textContent =
      NAVIGATION_HELP[mode];
  }

  if (
    !silent
  ) {
    setStatus(
      mode.charAt(0).toUpperCase() +
      mode.slice(1) +
      " navigation",
      "idle"
    );
  }
}

/* Point of the scan under a pixel of the canvas, or null */
function pickPointAt(
  x,
  y
) {
  try {
    if (
      !window.Potree ||
      !Potree.Utils ||
      typeof Potree.Utils.getMousePointCloudIntersection !==
      "function"
    ) {
      return null;
    }

    var clouds =
      (viewer.scene.pointclouds || []).filter(
        function (cloud) {
          return cloud.visible !== false;
        }
      );

    if (
      clouds.length === 0
    ) {
      return null;
    }

    var hit =
      Potree.Utils.getMousePointCloudIntersection(
        { x: x, y: y },
        viewer.scene.getActiveCamera(),
        viewer,
        clouds,
        { pickClipped: false }
      );

    return hit && hit.location
      ? hit.location.clone()
      : null;
  } catch (
    error
  ) {
    return null;
  }
}

/* Turn smoothly toward a point without moving the camera */
function lookAtSmoothly(
  point
) {
  var view =
    viewer.scene.view;

  var angles =
    yawPitchFromDirection(
      point.clone().sub(
        view.position
      )
    );

  navigation.targetYaw =
    nearestAngle(
      view.yaw,
      angles.yaw
    );

  navigation.targetPitch =
    clampPitch(
      angles.pitch
    );

  if (
    navigation.mode === "orbit"
  ) {
    navigation.pivot =
      point.clone();

    navigation.radius =
      navigation.targetRadius =
        Math.max(
          view.position.distanceTo(point),
          0.01
        );

    navigation.holdPosition =
      true;
  } else {
    navigation.pivot =
      point.clone();
  }
}

function bindNavigationMouse(
  canvas
) {
  /*
    Listen on the whole render area, not only the canvas, so
    elements Potree places above the canvas can't swallow input.
  */
  var surface =
    document.getElementById(
      "potree_render_area"
    ) ||
    canvas;

  surface.addEventListener(
    "contextmenu",
    function (event) {
      event.preventDefault();
    }
  );

  surface.addEventListener(
    "pointerdown",
    function (event) {
      var pan =
        event.button === 2 ||
        event.button === 1 ||
        (event.button === 0 && event.shiftKey);

      if (
        event.button !== 0 &&
        !pan
      ) {
        return;
      }

      var orbit =
        !pan &&
        event.altKey;

      navigation.drag = {
        id: event.pointerId,
        type: pan ? "pan" : orbit ? "orbit" : "look",
        x: event.clientX,
        y: event.clientY
      };

      if (
        orbit
      ) {
        startOrbitDrag(
          canvas
        );
      }

      navigation.holdPosition =
        false;

      try {
        surface.setPointerCapture(
          event.pointerId
        );
      } catch (
        error
      ) {
        /* ignore */
      }

      surface.style.cursor =
        pan ? "move" : "grabbing";
    }
  );

  surface.addEventListener(
    "pointermove",
    function (event) {
      var drag =
        navigation.drag;

      if (
        !drag ||
        drag.id !== event.pointerId
      ) {
        return;
      }

      var dx =
        event.clientX - drag.x;

      var dy =
        event.clientY - drag.y;

      drag.x =
        event.clientX;

      drag.y =
        event.clientY;

      if (
        drag.type === "look" ||
        drag.type === "orbit"
      ) {
        var sensitivity =
          Number(CONFIG.lookSensitivity) || 0.004;

        navigation.targetYaw -=
          dx * sensitivity;

        navigation.targetPitch =
          clampPitch(
            navigation.targetPitch -
            dy * sensitivity
          );
      } else {
        panView(
          dx,
          dy,
          canvas
        );
      }
    }
  );

  var endDrag =
    function (event) {
      if (
        navigation.drag &&
        navigation.drag.id === event.pointerId
      ) {
        navigation.drag =
          null;

        surface.style.cursor =
          "";
      }
    };

  surface.addEventListener(
    "pointerup",
    endDrag
  );

  surface.addEventListener(
    "pointercancel",
    endDrag
  );

  surface.addEventListener(
    "wheel",
    function (event) {
      event.preventDefault();

      /* Lines and pages become pixels so every mouse feels the same */
      var amount =
        event.deltaY *
        (event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1);

      amount =
        Math.max(-300, Math.min(300, amount));

      if (
        isOrthographic()
      ) {
        navigation.orthoTarget =
          Math.max(
            (navigation.orthoTarget || viewer.scene.view.radius || 1) *
            Math.pow(1.0012, amount),
            0.01
          );

        return;
      }

      if (
        navigation.mode === "orbit"
      ) {
        navigation.holdPosition =
          false;

        navigation.targetRadius =
          Math.max(
            (navigation.targetRadius || getCanvasDistance()) *
            Math.pow(1.0012, amount),
            0.02
          );
      } else {
        var speedScale =
          (Number(state.navigationSpeed) || 0.35) /
          (Number(CONFIG.navigationSpeed) || 0.35);

        /* one wheel notch glides about 8% of the scene distance */
        navigation.glide -=
          (amount / 100) *
          0.08 *
          getCanvasDistance() *
          speedScale /
          CONFIG.glideTime;
      }
    },
    { passive: false }
  );

  surface.addEventListener(
    "dblclick",
    function (event) {
      var rect =
        canvas.getBoundingClientRect();

      var point =
        pickPointAt(
          event.clientX - rect.left,
          event.clientY - rect.top
        );

      if (
        point
      ) {
        lookAtSmoothly(
          point
        );
      }
    }
  );
}

/* Drag the scene with the mouse: right drag, middle drag or shift + left drag */
function panView(
  dx,
  dy,
  canvas
) {
  var view =
    viewer.scene.view;

  var fov =
    typeof viewer.getFOV === "function"
      ? Number(viewer.getFOV()) || 60
      : 60;

  var worldPerPixel =
    2 *
    Math.tan(fov * Math.PI / 360) *
    getCanvasDistance() /
    Math.max(canvas.clientHeight, 1);

  var forward =
    view.direction;

  var right =
    forward.clone().cross(
      forward.clone().set(0, 0, 1)
    );

  if (
    right.lengthSq() < 0.000001
  ) {
    right.set(1, 0, 0);
  }

  right.normalize();

  var up =
    navigation.mode === "walk"
      ? forward.clone().set(0, 0, 1)
      : right.clone().cross(forward).normalize();

  var offset =
    right.multiplyScalar(-dx * worldPerPixel)
      .add(
        up.multiplyScalar(dy * worldPerPixel)
      );

  view.position.add(
    offset
  );

  if (
    navigation.pivot
  ) {
    navigation.pivot.add(
      offset
    );
  }
}

function updateNavigation(
  delta
) {
  navigation.lastUpdate =
    performance.now();

  if (
    !viewer ||
    !viewer.scene ||
    !viewer.scene.view
  ) {
    return;
  }

  var view =
    viewer.scene.view;

  var dt =
    Number(delta);

  if (
    !isFinite(dt) ||
    dt <= 0 ||
    dt > 0.1
  ) {
    dt = 0.016;
  }

  /*
    Someone else moved the camera (zoom buttons, start view):
    take over its angles instead of turning back.
  */
  if (
    navigation.appliedYaw === null ||
    Math.abs(view.yaw - navigation.appliedYaw) > 0.000001 ||
    Math.abs(view.pitch - navigation.appliedPitch) > 0.000001
  ) {
    navigation.targetYaw =
      view.yaw;

    navigation.targetPitch =
      view.pitch;
  }

  var lookAlpha =
    smoothFactor(
      dt,
      CONFIG.lookSmoothing
    );

  /*
    Potree keeps yaw within one full turn, so steer by the shortest
    angle and keep the target in the same turn as the view.
  */
  var yawDifference =
    Math.atan2(
      Math.sin(navigation.targetYaw - view.yaw),
      Math.cos(navigation.targetYaw - view.yaw)
    );

  view.yaw +=
    yawDifference *
    lookAlpha;

  navigation.targetYaw =
    view.yaw +
    yawDifference *
    (1 - lookAlpha);

  view.pitch +=
    (navigation.targetPitch - view.pitch) *
    lookAlpha;

  navigation.appliedYaw =
    view.yaw;

  navigation.appliedPitch =
    view.pitch;

  /* Orthographic: the wheel changes the scale of the view */
  if (
    isOrthographic() &&
    navigation.orthoTarget
  ) {
    view.radius +=
      (navigation.orthoTarget - view.radius) *
      smoothFactor(dt, CONFIG.zoomSmoothing);
  }

  if (
    navigation.mode === "orbit"
  ) {
    if (
      !navigation.pivot
    ) {
      setNavigationPivot(
        view.position.clone().add(
          view.direction.multiplyScalar(
            getCanvasDistance()
          )
        )
      );
    }

    if (
      navigation.holdPosition
    ) {
      /* turning toward a double-clicked point: stay in place */
      navigation.radius =
        navigation.targetRadius =
          Math.max(
            view.position.distanceTo(navigation.pivot),
            0.01
          );

      if (
        Math.abs(navigation.targetYaw - view.yaw) < 0.0005 &&
        Math.abs(navigation.targetPitch - view.pitch) < 0.0005
      ) {
        navigation.holdPosition =
          false;
      }
    } else {
      navigation.radius +=
        (navigation.targetRadius - navigation.radius) *
        smoothFactor(dt, CONFIG.zoomSmoothing);

      view.position.copy(
        navigation.pivot.clone().sub(
          view.direction.multiplyScalar(
            navigation.radius
          )
        )
      );
    }

    if (
      !isOrthographic()
    ) {
      view.radius =
        navigation.radius;
    }

    return;
  }

  /*
    Alt + drag: circle around the orbit point. Keeps going until the
    smoothed rotation has caught up after the mouse is released.
  */
  if (
    navigation.orbitActive &&
    navigation.orbitPoint
  ) {
    view.position.copy(
      navigation.orbitPoint.clone().sub(
        view.direction.multiplyScalar(
          navigation.orbitDistance
        )
      )
    );

    var stillDragging =
      navigation.drag &&
      navigation.drag.type === "orbit";

    if (
      !stillDragging &&
      Math.abs(navigation.targetYaw - view.yaw) < 0.0005 &&
      Math.abs(navigation.targetPitch - view.pitch) < 0.0005
    ) {
      navigation.orbitActive =
        false;
    }
  }

  /* Fly and walk: wheel glide with a soft stop */
  if (
    Math.abs(navigation.glide) > 0.000001
  ) {
    var direction =
      view.direction;

    if (
      navigation.mode === "walk"
    ) {
      direction.z = 0;

      if (
        direction.lengthSq() < 0.000001
      ) {
        var level =
          directionFromYawPitch(view.yaw, 0);

        direction.set(level.x, level.y, 0);
      }

      direction.normalize();
    }

    view.position.add(
      direction.multiplyScalar(
        navigation.glide * dt
      )
    );

    navigation.glide *=
      Math.exp(-dt / CONFIG.glideTime);

    if (
      Math.abs(navigation.glide) < 0.0001
    ) {
      navigation.glide = 0;
    }
  }
}

function bindNavigationModeButtons() {
  document
    .querySelectorAll("[data-nav-mode]")
    .forEach(function (button) {
      button.addEventListener(
        "click",
        function () {
          setNavigationMode(
            button.dataset.navMode
          );
        }
      );
    });

  /* 1 Orbit, 2 Fly, 3 Walk */
  document.addEventListener(
    "keydown",
    function (event) {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTypingInField(event.target)
      ) {
        return;
      }

      var modes = {
        "1": "orbit",
        "2": "fly",
        "3": "walk"
      };

      if (
        modes[event.key]
      ) {
        setNavigationMode(
          modes[event.key]
        );
      }
    }
  );
}


/* -------------------------------------------------------------------------- */
/* PERSPECTIVE / ORTHOGRAPHIC                                                 */
/* -------------------------------------------------------------------------- */

function getViewerFov() {
  var fov =
    viewer && typeof viewer.getFOV === "function"
      ? Number(viewer.getFOV())
      : 60;

  return isFinite(fov) && fov > 0
    ? fov
    : 60;
}

function getViewerAspect() {
  var canvas =
    viewer &&
    viewer.renderer &&
    viewer.renderer.domElement;

  var aspect =
    canvas
      ? (canvas.clientWidth || canvas.width || 1) /
        Math.max(canvas.clientHeight || canvas.height || 1, 1)
      : 1;

  return isFinite(aspect) && aspect > 0
    ? aspect
    : 1;
}

function isOrthographic() {
  return Boolean(
    viewer &&
    viewer.scene &&
    window.Potree &&
    Potree.CameraMode &&
    viewer.scene.cameraMode === Potree.CameraMode.ORTHOGRAPHIC
  );
}

/*
  Switches between perspective and orthographic. What is in the
  middle of the screen keeps roughly the same size.
*/
function toggleProjection() {
  if (
    !viewer ||
    !window.Potree ||
    !Potree.CameraMode ||
    typeof viewer.setCameraMode !== "function"
  ) {
    setStatus(
      "Orthographic view is not available in this Potree version.",
      "error"
    );

    return;
  }

  var view =
    viewer.scene.view;

  var canvas =
    viewer.renderer.domElement;

  var tanHalf =
    Math.tan(getViewerFov() * Math.PI / 360);

  if (
    !isOrthographic()
  ) {
    var hit =
      pickPointAt(
        canvas.clientWidth / 2,
        canvas.clientHeight / 2
      );

    var focusDistance =
      hit
        ? view.position.distanceTo(hit)
        : Number(view.radius) || 10;

    navigation.perspectiveRadius =
      view.radius;

    viewer.setCameraMode(
      Potree.CameraMode.ORTHOGRAPHIC
    );

    view.radius =
      focusDistance * tanHalf * getViewerAspect();

    navigation.orthoTarget =
      view.radius;

    setStatus(
      "Orthographic view",
      "idle"
    );
  } else {
    var orthoHalfWidth =
      Number(view.radius) || 1;

    viewer.setCameraMode(
      Potree.CameraMode.PERSPECTIVE
    );

    view.radius =
      orthoHalfWidth / (tanHalf * getViewerAspect()) ||
      navigation.perspectiveRadius ||
      10;

    navigation.orthoTarget =
      null;

    setStatus(
      "Perspective view",
      "idle"
    );
  }

  var button =
    getElement(
      "toggleProjection"
    );

  if (
    button
  ) {
    var ortho =
      isOrthographic();

    button.setAttribute(
      "aria-pressed",
      String(ortho)
    );

    button.dataset.projection =
      ortho
        ? "orthographic"
        : "perspective";

    button.title =
      ortho
        ? "Orthographic view. Click for perspective"
        : "Perspective view. Click for orthographic";
  }
}


/* Alt + drag: orbit around the point in the middle of the screen */
function startOrbitDrag(
  canvas
) {
  var view =
    viewer.scene.view;

  var hit =
    pickPointAt(
      canvas.clientWidth / 2,
      canvas.clientHeight / 2
    );

  var distance =
    hit
      ? view.position.distanceTo(hit)
      : Number(view.radius) || 10;

  navigation.orbitDistance =
    Math.max(distance, 0.05);

  /* straight ahead at that depth, so starting the orbit never jumps */
  navigation.orbitPoint =
    view.position.clone().add(
      view.direction.multiplyScalar(
        navigation.orbitDistance
      )
    );

  navigation.orbitActive =
    true;
}


/* -------------------------------------------------------------------------- */
/* EXPORT CROP                                                                */
/* -------------------------------------------------------------------------- */

/*
  With an active section the PNG is cropped to the visible points,
  so the export shows the section and not the empty viewer around it.
*/
function exportCanvasDataUrl(
  canvas
) {
  if (
    !state.sectionVolume ||
    CONFIG.cropExportToSection === false
  ) {
    return canvas.toDataURL(
      "image/png"
    );
  }

  try {
    var width =
      canvas.width;

    var height =
      canvas.height;

    /* find the points on a small copy: fast even for 5x exports */
    var scale =
      Math.min(
        1,
        1600 / Math.max(width, height)
      );

    var smallWidth =
      Math.max(1, Math.round(width * scale));

    var smallHeight =
      Math.max(1, Math.round(height * scale));

    var small =
      document.createElement("canvas");

    small.width =
      smallWidth;

    small.height =
      smallHeight;

    var smallContext =
      small.getContext("2d");

    smallContext.drawImage(
      canvas,
      0,
      0,
      smallWidth,
      smallHeight
    );

    var pixels =
      smallContext.getImageData(
        0,
        0,
        smallWidth,
        smallHeight
      ).data;

    var minX = smallWidth;
    var minY = smallHeight;
    var maxX = -1;
    var maxY = -1;

    for (var y = 0; y < smallHeight; y++) {
      for (var x = 0; x < smallWidth; x++) {
        if (pixels[(y * smallWidth + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (
      maxX < 0
    ) {
      return canvas.toDataURL(
        "image/png"
      );
    }

    var padding =
      Math.round(
        Math.max(width, height) * 0.02
      );

    var left =
      Math.max(0, Math.floor(minX / scale) - padding);

    var top =
      Math.max(0, Math.floor(minY / scale) - padding);

    var right =
      Math.min(width, Math.ceil((maxX + 1) / scale) + padding);

    var bottom =
      Math.min(height, Math.ceil((maxY + 1) / scale) + padding);

    var output =
      document.createElement("canvas");

    output.width =
      right - left;

    output.height =
      bottom - top;

    output.getContext("2d").drawImage(
      canvas,
      left,
      top,
      output.width,
      output.height,
      0,
      0,
      output.width,
      output.height
    );

    return output.toDataURL(
      "image/png"
    );
  } catch (
    error
  ) {
    console.warn(
      "Could not crop the export to the section:",
      error
    );

    return canvas.toDataURL(
      "image/png"
    );
  }
}


/* -------------------------------------------------------------------------- */
/* PANEL HEIGHTS                                                              */
/* -------------------------------------------------------------------------- */

/* Height the library needs to show all its entries without scrolling */
function measureLibraryHeight(
  libraryPanel,
  headerHeight
) {
  var total =
    headerHeight + 1;

  var list =
    getElement("libraryList");

  if (
    list &&
    list.children.length > 0
  ) {
    var first =
      list.firstElementChild.getBoundingClientRect();

    var last =
      list.lastElementChild.getBoundingClientRect();

    var style =
      window.getComputedStyle(list);

    total +=
      (last.bottom - first.top) +
      parseFloat(style.paddingTop || 0) +
      parseFloat(style.paddingBottom || 0) +
      parseFloat(window.getComputedStyle(list.lastElementChild).marginBottom || 0);
  }

  var empty =
    getElement("libraryEmpty");

  if (
    empty &&
    empty.offsetParent !== null
  ) {
    total +=
      empty.offsetHeight;
  }

  return Math.ceil(total);
}

/* Height the inspector needs for its content plus its toggle bar */
function measureInspectorHeight(
  toggleHeight
) {
  var total =
    toggleHeight;

  ["inspectorEmpty", "inspectorContent"].forEach(function (id) {
    var element =
      getElement(id);

    if (
      element &&
      !element.classList.contains("hidden")
    ) {
      total +=
        element.offsetHeight;
    }
  });

  return Math.ceil(total);
}

/* Re-measure the panels whenever the library or inspector content changes */
(function () {
  ["renderLibrary", "updateInspector", "updateSectionControls"].forEach(function (name) {
    var original =
      window[name];

    if (
      typeof original !== "function"
    ) {
      return;
    }

    window[name] =
      function () {
        var result =
          original.apply(this, arguments);

        window.requestAnimationFrame(
          updatePanelLayout
        );

        return result;
      };
  });
})();
