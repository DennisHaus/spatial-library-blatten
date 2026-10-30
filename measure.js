"use strict";

/*
  MEASURE TOOL
  Cmd-click (Mac) or Ctrl-click (Windows) on a point of a scan shows its
  X, Y, Z coordinates. A second Cmd-click shows the second point and the
  differences between the two: ΔX, ΔY, ΔZ, horizontal distance,
  3D distance and slope. A third Cmd-click starts a new measurement.
  Esc or the × button clears it.

  Needs from app.js: viewer, pickPointAt(x, y), setStatus(text, type).
*/

(function () {
  var points = [];
  var panel = null;
  var overlay = null;
  var frame = null;

  var SVG_NS =
    "http://www.w3.org/2000/svg";


  /* ------------------------------------------------------------------------ */
  /* HELPERS                                                                  */
  /* ------------------------------------------------------------------------ */

  function formatNumber(value, decimals) {
    return Number(value).toFixed(
      decimals === undefined ? 3 : decimals
    );
  }

  function formatSigned(value) {
    var text =
      formatNumber(value);

    return value > 0
      ? "+" + text
      : text;
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

  function isTyping(target) {
    if (!target) {
      return false;
    }

    var tag =
      String(target.tagName || "").toLowerCase();

    return (
      tag === "input" ||
      tag === "textarea" ||
      tag === "select" ||
      target.isContentEditable === true
    );
  }

  function status(text) {
    if (typeof window.setStatus === "function") {
      window.setStatus(text, "idle");
    }
  }


  /* ------------------------------------------------------------------------ */
  /* MEASUREMENT                                                              */
  /* ------------------------------------------------------------------------ */

  function getDeltas() {
    if (points.length < 2) {
      return null;
    }

    var a = points[0];
    var b = points[1];

    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var dz = b.z - a.z;

    var horizontal =
      Math.sqrt(dx * dx + dy * dy);

    var distance =
      Math.sqrt(dx * dx + dy * dy + dz * dz);

    var slopeDegrees =
      horizontal > 0
        ? Math.atan2(dz, horizontal) * 180 / Math.PI
        : (dz === 0 ? 0 : (dz > 0 ? 90 : -90));

    var slopePercent =
      horizontal > 0
        ? dz / horizontal * 100
        : null;

    return {
      dx: dx,
      dy: dy,
      dz: dz,
      horizontal: horizontal,
      distance: distance,
      slopeDegrees: slopeDegrees,
      slopePercent: slopePercent
    };
  }

  function addPoint(point) {
    if (points.length >= 2) {
      points = [];
    }

    points.push({
      x: point.x,
      y: point.y,
      z: point.z
    });

    renderPanel();
    startOverlay();
    pulseMarker(points.length - 1);

    var deltas =
      getDeltas();

    status(
      deltas
        ? "Distance: " + formatNumber(deltas.distance) + " m"
        : "Point A: " +
          formatNumber(point.x) + ", " +
          formatNumber(point.y) + ", " +
          formatNumber(point.z)
    );
  }

  function clear() {
    points = [];

    if (panel) {
      panel.classList.add("hidden");
    }

    stopOverlay();
  }

  function asText() {
    var lines = [];

    points.forEach(function (point, index) {
      lines.push(
        (index === 0 ? "A" : "B") +
        "\tX " + formatNumber(point.x) +
        "\tY " + formatNumber(point.y) +
        "\tZ " + formatNumber(point.z)
      );
    });

    var deltas =
      getDeltas();

    if (deltas) {
      lines.push("ΔX\t" + formatSigned(deltas.dx));
      lines.push("ΔY\t" + formatSigned(deltas.dy));
      lines.push("ΔZ\t" + formatSigned(deltas.dz));
      lines.push("Horizontal\t" + formatNumber(deltas.horizontal));
      lines.push("Distance 3D\t" + formatNumber(deltas.distance));
      lines.push(
        "Slope\t" +
        formatNumber(deltas.slopeDegrees, 1) + "°" +
        (
          deltas.slopePercent !== null
            ? " / " + formatNumber(deltas.slopePercent, 1) + "%"
            : ""
        )
      );
    }

    return lines.join("\n");
  }


  /* ------------------------------------------------------------------------ */
  /* PANEL                                                                    */
  /* ------------------------------------------------------------------------ */

  function createPanel() {
    var host =
      getViewerPanel();

    if (!host) {
      return null;
    }

    panel =
      document.createElement("div");

    panel.className =
      "measure-panel hidden";

    panel.setAttribute(
      "aria-live",
      "polite"
    );

    panel.innerHTML =
      '<div class="measure-header">' +
        '<span class="measure-title">Measure</span>' +
        '<div class="measure-actions">' +
          '<button type="button" class="measure-button" data-measure="copy" title="Copy values">Copy</button>' +
          '<button type="button" class="measure-button measure-close" data-measure="clear" title="Clear (Esc)" aria-label="Clear measurement">×</button>' +
        "</div>" +
      "</div>" +
      '<div class="measure-body"></div>' +
      '<div class="measure-hint"></div>';

    panel.addEventListener(
      "click",
      function (event) {
        var button =
          event.target.closest("[data-measure]");

        if (!button) {
          return;
        }

        if (button.dataset.measure === "clear") {
          clear();
          status("Measurement cleared");
        }

        if (button.dataset.measure === "copy") {
          copyValues(button);
        }
      }
    );

    /* Clicks in the panel must not move the camera */
    panel.addEventListener(
      "pointerdown",
      function (event) {
        event.stopPropagation();
      }
    );

    host.appendChild(panel);

    return panel;
  }

  function copyValues(button) {
    var text =
      asText();

    var done = function () {
      button.textContent = "Copied";

      window.setTimeout(function () {
        button.textContent = "Copy";
      }, 1200);
    };

    if (
      navigator.clipboard &&
      navigator.clipboard.writeText
    ) {
      navigator.clipboard
        .writeText(text)
        .then(done)
        .catch(function () {
          status("Copy failed");
        });
    }
  }

  function row(label, value, className) {
    return (
      '<div class="measure-row' + (className ? " " + className : "") + '">' +
        '<span class="measure-label">' + label + "</span>" +
        '<span class="measure-value">' + value + "</span>" +
      "</div>"
    );
  }

  function pointBlock(point, name) {
    return (
      '<div class="measure-point">' +
        '<span class="measure-point-name">' + name + "</span>" +
        row("X", formatNumber(point.x)) +
        row("Y", formatNumber(point.y)) +
        row("Z", formatNumber(point.z)) +
      "</div>"
    );
  }

  function renderPanel() {
    if (!panel && !createPanel()) {
      return;
    }

    var html = "";

    points.forEach(function (point, index) {
      html += pointBlock(
        point,
        index === 0 ? "A" : "B"
      );
    });

    var deltas =
      getDeltas();

    if (deltas) {
      html +=
        '<div class="measure-deltas">' +
          row("ΔX", formatSigned(deltas.dx)) +
          row("ΔY", formatSigned(deltas.dy)) +
          row("ΔZ", formatSigned(deltas.dz)) +
          row("Horizontal", formatNumber(deltas.horizontal) + " m") +
          row("Distance", formatNumber(deltas.distance) + " m", "measure-total") +
          row(
            "Slope",
            formatNumber(deltas.slopeDegrees, 1) + "°" +
            (
              deltas.slopePercent !== null
                ? " · " + formatNumber(deltas.slopePercent, 1) + "%"
                : ""
            )
          ) +
        "</div>";
    }

    panel.querySelector(".measure-body").innerHTML =
      html;

    panel.querySelector(".measure-hint").textContent =
      points.length < 2
        ? "⌘/Ctrl-click a second point to measure"
        : "⌘/Ctrl-click to start a new measurement";

    panel.classList.remove("hidden");
  }


  /* ------------------------------------------------------------------------ */
  /* MARKERS IN THE VIEW                                                      */
  /* ------------------------------------------------------------------------ */

  function svgElement(name, attributes) {
    var element =
      document.createElementNS(SVG_NS, name);

    Object.keys(attributes || {}).forEach(function (key) {
      element.setAttribute(key, attributes[key]);
    });

    return element;
  }

  function createOverlay() {
    var host =
      getViewerPanel();

    if (!host) {
      return null;
    }

    overlay =
      svgElement("svg", { class: "measure-overlay" });

    overlay.appendChild(
      svgElement("line", { class: "measure-line" })
    );

    ["A", "B"].forEach(function (name) {
      var group =
        svgElement("g", { class: "measure-marker", "data-name": name });

      group.appendChild(
        svgElement("circle", { class: "measure-pulse", r: "10" })
      );

      group.appendChild(
        svgElement("circle", { class: "measure-ring", r: "9" })
      );

      group.appendChild(
        svgElement("circle", { class: "measure-dot", r: "3" })
      );

      var label =
        svgElement("text", { x: "13", y: "-11" });

      label.textContent = name;

      group.appendChild(label);
      overlay.appendChild(group);
    });

    var distanceLabel =
      svgElement("text", { class: "measure-distance" });

    overlay.appendChild(distanceLabel);

    host.appendChild(overlay);

    return overlay;
  }

  /*
    Screen position of a 3D point. Done with the camera matrices
    directly, because this Potree build does not expose THREE globally.
  */
  function project(point) {
    var canvas =
      getCanvas();

    if (
      !canvas ||
      !viewer.scene ||
      typeof viewer.scene.getActiveCamera !== "function"
    ) {
      return null;
    }

    var camera =
      viewer.scene.getActiveCamera();

    if (
      !camera ||
      !camera.matrixWorldInverse ||
      !camera.projectionMatrix
    ) {
      return null;
    }

    var v =
      camera.matrixWorldInverse.elements;

    var p =
      camera.projectionMatrix.elements;

    /* world -> camera space */
    var cx = v[0] * point.x + v[4] * point.y + v[8] * point.z + v[12];
    var cy = v[1] * point.x + v[5] * point.y + v[9] * point.z + v[13];
    var cz = v[2] * point.x + v[6] * point.y + v[10] * point.z + v[14];

    /* camera space -> clip space */
    var clipX = p[0] * cx + p[4] * cy + p[8] * cz + p[12];
    var clipY = p[1] * cx + p[5] * cy + p[9] * cz + p[13];
    var clipZ = p[2] * cx + p[6] * cy + p[10] * cz + p[14];
    var clipW = p[3] * cx + p[7] * cy + p[11] * cz + p[15];

    /* behind the camera */
    if (clipW <= 0) {
      return null;
    }

    var ndcZ =
      clipZ / clipW;

    if (
      ndcZ < -1 ||
      ndcZ > 1
    ) {
      return null;
    }

    return {
      x: (clipX / clipW + 1) / 2 * canvas.clientWidth,
      y: (1 - clipY / clipW) / 2 * canvas.clientHeight
    };
  }

  function updateOverlay() {
    if (!overlay) {
      return;
    }

    var screen =
      points.map(project);

    ["A", "B"].forEach(function (name, index) {
      var marker =
        overlay.querySelector('[data-name="' + name + '"]');

      var position =
        screen[index];

      if (position) {
        marker.setAttribute(
          "transform",
          "translate(" + position.x + " " + position.y + ")"
        );

        marker.style.display = "";
      } else {
        marker.style.display = "none";
      }
    });

    var line =
      overlay.querySelector(".measure-line");

    var label =
      overlay.querySelector(".measure-distance");

    if (screen[0] && screen[1]) {
      line.setAttribute("x1", screen[0].x);
      line.setAttribute("y1", screen[0].y);
      line.setAttribute("x2", screen[1].x);
      line.setAttribute("y2", screen[1].y);
      line.style.display = "";

      /*
        The label sits above the middle of the line. When A and B are
        close together on screen, it is raised above both markers so
        it never covers them.
      */
      var midX =
        (screen[0].x + screen[1].x) / 2;

      var midY =
        (screen[0].y + screen[1].y) / 2;

      var screenLength =
        Math.hypot(
          screen[1].x - screen[0].x,
          screen[1].y - screen[0].y
        );

      var labelY =
        midY - 16;

      if (screenLength < 120) {
        labelY =
          Math.min(
            labelY,
            Math.min(screen[0].y, screen[1].y) - 30
          );
      }

      label.setAttribute("x", midX);
      label.setAttribute("y", labelY);
      label.textContent = formatNumber(getDeltas().distance, 2) + " m";
      label.style.display = "";
    } else {
      line.style.display = "none";
      label.style.display = "none";
    }
  }

  function pulseMarker(index) {
    if (!overlay) {
      return;
    }

    var marker =
      overlay.querySelector(
        '[data-name="' + (index === 0 ? "A" : "B") + '"]'
      );

    if (!marker) {
      return;
    }

    /* A new measurement hides the old point B */
    if (index === 0) {
      var other =
        overlay.querySelector('[data-name="B"]');

      if (other) {
        other.classList.remove("is-new");
      }
    }

    marker.classList.remove("is-new");

    /* force a reflow so the animation starts again */
    void marker.getBoundingClientRect();

    marker.classList.add("is-new");
  }

  function loop() {
    updateOverlay();

    frame =
      window.requestAnimationFrame(loop);
  }

  function startOverlay() {
    if (!overlay && !createOverlay()) {
      return;
    }

    overlay.style.display = "";

    if (frame === null) {
      loop();
    }
  }

  function stopOverlay() {
    if (frame !== null) {
      window.cancelAnimationFrame(frame);
      frame = null;
    }

    if (overlay) {
      overlay.style.display = "none";
    }
  }


  /* ------------------------------------------------------------------------ */
  /* INPUT                                                                    */
  /* ------------------------------------------------------------------------ */

  function isMeasureClick(event) {
    /*
      Mac: Cmd-click. Windows/Linux: Ctrl-click.
      On a Mac, Ctrl-click can arrive as a right click.
    */
    return (
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      (
        event.button === 0 ||
        (event.button === 2 && event.ctrlKey)
      )
    );
  }

  /*
    Called by app.js at the start of its pointerdown handler.
    Returns true when the click was used for measuring,
    so app.js does not start a camera drag.
  */
  function handlePointerDown(event) {
    if (!isMeasureClick(event)) {
      return false;
    }

    var canvas =
      getCanvas();

    if (
      !canvas ||
      typeof window.pickPointAt !== "function"
    ) {
      return false;
    }

    event.preventDefault();

    var rect =
      canvas.getBoundingClientRect();

    var point =
      window.pickPointAt(
        event.clientX - rect.left,
        event.clientY - rect.top
      );

    if (point) {
      addPoint(point);
    } else {
      status("No point found there. ⌘/Ctrl-click directly on a scan.");
    }

    return true;
  }

  function setReadyCursor(active) {
    var host =
      getViewerPanel();

    if (host) {
      host.classList.toggle("measure-ready", active);
    }
  }

  document.addEventListener(
    "keydown",
    function (event) {
      if (
        event.key === "Meta" ||
        event.key === "Control"
      ) {
        setReadyCursor(true);
      }

      if (
        event.key === "Escape" &&
        points.length > 0 &&
        !isTyping(event.target) &&
        !document.querySelector("dialog[open]")
      ) {
        clear();
        status("Measurement cleared");
      }
    }
  );

  document.addEventListener(
    "keyup",
    function (event) {
      if (
        event.key === "Meta" ||
        event.key === "Control"
      ) {
        setReadyCursor(false);
      }
    }
  );

  window.addEventListener(
    "blur",
    function () {
      setReadyCursor(false);
    }
  );

  window.MeasureTool = {
    handlePointerDown: handlePointerDown,
    clear: clear,
    project: project,
    getPoints: function () {
      return points.slice();
    }
  };
})();
