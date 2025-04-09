// === GLOBAL STATE ===
let selectedSegment = null;
let undoStack = [], redoStack = [];
let snapEnabled = true, zoomLevel = 1;
let loopStart = null, loopEnd = null, isLooping = false;

// === SEGMENT CREATION ===
function addSegment(trackId) {
  const track = document.getElementById(trackId);
  const segment = document.createElement("div");
  segment.className = "segment";
  segment.style.left = "100px";
  segment.style.width = "120px";
  segment.style.position = "absolute";
  segment.innerHTML = `
    <div contenteditable="true">${trackId.toUpperCase()} FX</div>
    <select class="fx-type">
      <option value="fade">Fade</option>
      <option value="pulse">Pulse</option>
      <option value="flash">Flash</option>
    </select>
    <input type="number" class="speed" placeholder="Speed" />
    <input type="number" class="delay" placeholder="Delay" />
    <input type="color" class="color" />
  `;
  makeDraggable(segment, track);
  addResizeHandles(segment);
  track.appendChild(segment);
  pushToUndo();
  log("> Added segment to " + trackId);
}

// === SEGMENT INTERACTION ===
function makeDraggable(segment, track) {
  segment.addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("resize-handle")) return;

    document.querySelectorAll(".segment").forEach(seg => seg.classList.remove("selected"));
    selectedSegment = segment;
    segment.classList.add("selected");

    let offsetX = e.offsetX;

    const onMouseMove = (e) => {
      const trackRect = track.getBoundingClientRect();
      let newLeft = e.clientX - trackRect.left - offsetX;
      newLeft = Math.max(100, newLeft);
      let snappedLeft = snapEnabled ? Math.round(newLeft / 10) * 10 : newLeft;
      segment.style.left = snappedLeft + "px";
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      pushToUndo();
      log("> Segment moved");
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
}

function addResizeHandles(segment) {
  const leftHandle = document.createElement("div");
  const rightHandle = document.createElement("div");
  leftHandle.className = "resize-handle left-handle";
  rightHandle.className = "resize-handle right-handle";
  segment.appendChild(leftHandle);
  segment.appendChild(rightHandle);

  [leftHandle, rightHandle].forEach(handle => {
    handle.addEventListener("mousedown", e => {
      e.stopPropagation();
      const isLeft = handle.classList.contains("left-handle");
      const startX = e.clientX;
      const startLeft = parseInt(segment.style.left, 10);
      const startWidth = parseInt(segment.style.width, 10);

      const onMouseMove = (e) => {
        const dx = e.clientX - startX;
        let newWidth = isLeft ? startWidth - dx : startWidth + dx;
        let newLeft = isLeft ? startLeft + dx : startLeft;

        if (snapEnabled) {
          newWidth = Math.max(30, Math.round(newWidth / 10) * 10);
          newLeft = Math.round(newLeft / 10) * 10;
        }

        segment.style.width = newWidth + "px";
        if (isLeft) segment.style.left = newLeft + "px";
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        pushToUndo();
        log("> Segment resized");
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  });
}

// === UNDO/REDO & STATE ===
function pushToUndo() {
  const segments = [];
  document.querySelectorAll(".segment").forEach(seg => {
    segments.push({
      track: seg.parentElement.id,
      text: seg.querySelector("div").innerText,
      type: seg.querySelector(".fx-type").value,
      left: seg.style.left,
      width: seg.style.width,
      speed: seg.querySelector(".speed").value,
      delay: seg.querySelector(".delay").value,
      color: seg.querySelector(".color").value
    });
  });
  undoStack.push(JSON.stringify(segments));
  redoStack = [];
  localStorage.setItem("autosave", JSON.stringify(segments));
}

function restoreFromState(stateJSON) {
  clearTimeline();
  const segments = JSON.parse(stateJSON);
  segments.forEach(seg => {
    const track = document.getElementById(seg.track);
    const segment = document.createElement("div");
    segment.className = "segment";
    segment.style.left = seg.left;
    segment.style.width = seg.width;
    segment.style.position = "absolute";
    segment.innerHTML = `
      <div contenteditable="true">${seg.text}</div>
      <select class="fx-type">
        <option value="fade">Fade</option>
        <option value="pulse">Pulse</option>
        <option value="flash">Flash</option>
      </select>
      <input type="number" class="speed" placeholder="Speed" value="${seg.speed}" />
      <input type="number" class="delay" placeholder="Delay" value="${seg.delay}" />
      <input type="color" class="color" value="${seg.color}" />
    `;
    segment.querySelector(".fx-type").value = seg.type;
    makeDraggable(segment, track);
    addResizeHandles(segment);
    track.appendChild(segment);
  });
}

function undo() {
  if (undoStack.length === 0) return;
  const state = undoStack.pop();
  redoStack.push(state);
  restoreFromState(state);
  log("> Undo");
}

function redo() {
  if (redoStack.length === 0) return;
  const state = redoStack.pop();
  undoStack.push(state);
  restoreFromState(state);
  log("> Redo");
}

// === SAVE / LOAD ===
function saveTimeline() {
  const state = undoStack[undoStack.length - 1] || "[]";
  const blob = new Blob([state], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "timeline.json";
  a.click();
  log("> Timeline saved");
}

function loadTimeline(event) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      restoreFromState(e.target.result);
      pushToUndo();
      log("> Timeline loaded");
    } catch {
      log("> Failed to load file.");
    }
  };
  reader.readAsText(event.target.files[0]);
}

// === LOOPING ===
function setLoopPoint(pos) {
  if (loopStart === null) {
    loopStart = pos;
    log("> Loop start set at " + pos.toFixed(1) + "s");
  } else {
    loopEnd = pos;
    isLooping = true;
    log("> Loop end set at " + pos.toFixed(1) + "s");
  }
}

function trackPlayhead(audio) {
  const playhead = document.getElementById("playhead");
  const interval = setInterval(() => {
    if (isLooping && loopEnd && audio.currentTime >= loopEnd) {
      audio.currentTime = loopStart;
    }
    const px = audio.currentTime * 10;
    playhead.style.left = px + "px";
    if (audio.paused || audio.ended) clearInterval(interval);
  }, 100);
}

// === LOGGING ===
function log(msg) {
  const logBox = document.getElementById("log");
  logBox.textContent += "\n" + msg;
  logBox.scrollTop = logBox.scrollHeight;
}

// === INIT EVERYTHING ===
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnMp3A").addEventListener("click", () => addSegment("mp3a"));
  document.getElementById("btnMp3B").addEventListener("click", () => addSegment("mp3b"));
  document.getElementById("btnFX").addEventListener("click", () => addSegment("fx"));
  document.getElementById("btnClear").addEventListener("click", clearTimeline);
  document.getElementById("btnSave").addEventListener("click", saveTimeline);
  document.getElementById("loadInput").addEventListener("change", loadTimeline);
  document.getElementById("audioA").addEventListener("play", () => trackPlayhead(audioA));
  document.getElementById("audioB").addEventListener("play", () => trackPlayhead(audioB));
  document.getElementById("zoomIn").addEventListener("click", () => {
    zoomLevel = Math.min(2, zoomLevel + 0.1);
    document.querySelector(".tracks").style.transform = `scaleX(${zoomLevel})`;
    log("> Zoom In");
  });
  document.getElementById("zoomOut").addEventListener("click", () => {
    zoomLevel = Math.max(0.5, zoomLevel - 0.1);
    document.querySelector(".tracks").style.transform = `scaleX(${zoomLevel})`;
    log("> Zoom Out");
  });
  document.getElementById("snapToggle").addEventListener("change", (e) => {
    snapEnabled = e.target.checked;
    log("> Snap: " + (snapEnabled ? "On" : "Off"));
  });

  // === KEYBOARD SHORTCUTS ===
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === 'z') return undo();
    if (e.ctrlKey && e.key === 'y') return redo();
    if (!selectedSegment) return;

    const step = e.shiftKey ? 10 : 5;
    const left = parseInt(selectedSegment.style.left, 10);
    const width = parseInt(selectedSegment.style.width, 10);

    switch (e.key) {
      case "Delete":
      case "Backspace":
        selectedSegment.remove();
        selectedSegment = null;
        pushToUndo();
        log("> Segment deleted");
        break;
      case "ArrowLeft":
        if (e.shiftKey) {
          selectedSegment.style.width = Math.max(30, width - step) + "px";
        } else {
          selectedSegment.style.left = (left - step) + "px";
        }
        e.preventDefault();
        break;
      case "ArrowRight":
        if (e.shiftKey) {
          selectedSegment.style.width = (width + step) + "px";
        } else {
          selectedSegment.style.left = (left + step) + "px";
        }
        e.preventDefault();
        break;
      case "Escape":
        selectedSegment.classList.remove("selected");
        selectedSegment = null;
        break;
    }
  });

  // === Drag & Drop JSON ===
  document.body.addEventListener("dragover", e => e.preventDefault());
  document.body.addEventListener("drop", e => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      loadTimeline({ target: { files: e.dataTransfer.files } });
    }
  });

  // === Auto-restore if saved
  const saved = localStorage.getItem("autosave");
  if (saved) {
    restoreFromState(saved);
    log("> Autosaved timeline restored");
  }
});
