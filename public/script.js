/* ======================================================
   🔌 SOCKET INITIALIZATION
====================================================== */
const socket = io();
let allDevices = {};
let pendingAllRecordings = [];   // all_recordings_list ka data — call_logs se pehle aaye toh store karo
let pendingRecordingUpdates = []; // recording_updates ka data — call_logs se pehle aaye toh store karo

socket.on("connect", () => updateHeaderStatus(true));
socket.on("disconnect", () => updateHeaderStatus(false));

socket.on("update", devices => {
  allDevices = devices;
  renderDevices(devices);
  updateDeviceSelectors(devices);
});

// ✅ Sirf Online devices dikhao
function renderDevices(devices) {
  const container = document.getElementById("devicesContainer");
  if (!container) return;

  const onlineDevices = Object.values(devices).filter(d => d.online === true);
  const deviceCount = onlineDevices.length;

  const statusBadge = document.getElementById("deviceStatusBadge");
  if (statusBadge) {
    statusBadge.textContent = deviceCount === 0 ? "○ No Devices Online" : `● ${deviceCount} Online`;
    statusBadge.style.background = deviceCount === 0 ? "#95a5a6" : "#27ae60";
  }

  if (deviceCount === 0) {
    container.innerHTML = `<div class="no-devices-message"><h3>No Devices Connected</h3><p>Waiting for devices...</p></div>`;
    return;
  }

  container.innerHTML = "";
  onlineDevices.forEach(device => {
    const card = document.createElement("div");
    card.className = "device-card";
    card.innerHTML = `
      <div class="device-header">
        <h3 class="device-name">${device.brand || 'Unknown'} ${device.model || 'Device'}</h3>
        <p class="device-id">ID: ${device.deviceId}</p>
      </div>
      <div class="device-info">
        <div class="info-item">📱 <b>Brand:</b> ${device.brand || 'N/A'}</div>
        <div class="info-item">📦<b>Model:</b>${device.model || 'N/A'}</div>
        <div class="info-item">🤖<b>Android:</b>${device.androidVersion || 'N/A'} (SDK ${device.sdkInt || 'N/A'})</div>
        <div class="info-item">🌐 <b>IP:</b> ${device.ip || 'N/A'}</div>
        <div class="info-item">📋 <b>IMEI:</b> ${device.imei || 'N/A'}</div>
        <div class="info-item">👁️ <b>Last Seen:</b> ${new Date(device.lastSeen).toLocaleTimeString()}</div>
      </div>
      <div class="action-buttons">
        <button class="action-btn contacts-btn-action" onclick="openCallLogs('${device.deviceId}')">
          ☰ Contacts & Calls
        </button>
        <button class="action-btn file-btn-action" onclick="openFileManager('${device.deviceId}')">
          📁 File Manager
        </button>
        <button class="action-btn apps-btn-action" onclick="openInstalledApps('${device.deviceId}')">
          📦 Installed Apps
        </button>
      </div>`;
    container.appendChild(card);
  });
}

function updateDeviceSelectors(devices) {
  const callLogsSelect = document.getElementById("deviceSelect");
  const fileManagerSelect = document.getElementById("fileManagerDeviceSelect");

  if (callLogsSelect) {
    callLogsSelect.innerHTML = "";
    Object.values(devices).forEach(device => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = `${device.brand || 'Unknown'} ${device.model || 'Device'} (${device.deviceId})`;
      callLogsSelect.appendChild(option);
    });
  }

  if (fileManagerSelect) {
    fileManagerSelect.innerHTML = "";
    Object.values(devices).forEach(device => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = `${device.brand || 'Unknown'} ${device.model || 'Device'} (${device.wifiIp || device.ip || device.deviceId})`;
      fileManagerSelect.appendChild(option);
    });
  }
}

function updateHeaderStatus(connected) {
  const headerStatus = document.getElementById("headerStatus");
  if (headerStatus) {
    if (connected) {
      headerStatus.textContent = "● Connected";
      headerStatus.style.color = "#27ae60";
    } else {
      headerStatus.textContent = "○ Disconnected";
      headerStatus.style.color = "#e74c3c";
    }
  }
}

/* ======================================================
   📤 SEND COMMAND
====================================================== */
function sendCmd(deviceId, type, extraData = {}) {
  if (!socket || !socket.connected) {
    console.warn("⏳ Socket not connected, retrying...");
    setTimeout(() => sendCmd(deviceId, type, extraData), 500);
    return;
  }

  console.log(`📤 Sending: ${type} to ${deviceId}`);
  socket.emit("command", { deviceId, type, ...extraData });
}

/* ======================================================
   📞 CONTACTS & CALL LOGS POPUP
====================================================== */

function openCallLogs(deviceId) {
  console.log("📞 Opening Call Logs for:", deviceId);
  
  const popup = document.getElementById("callLogsPopup");
  if (!popup) {
    console.error("❌ Call logs popup not found!");
    return;
  }
  
  popup.style.display = "flex";

  const deviceSelect = document.getElementById("deviceSelect");
  if (deviceSelect) {
    deviceSelect.value = deviceId;
  }

  document.getElementById("totalContacts").textContent = "0";
  document.getElementById("incomingCalls").textContent = "0";
  document.getElementById("outgoingCalls").textContent = "0";
  document.getElementById("missedCalls").textContent = "0";

  const timeEl = document.getElementById("lastUpdatedTime");
  if (timeEl) {
    const now = new Date();
    timeEl.textContent = now.toLocaleString('en-US', { 
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true
    });
  }

  showPopupTab("callLogs");

  document.getElementById("popupCallLogs").innerHTML = 
    "<tr><td colspan='5' style='text-align:center; padding:40px; color:#999;'>Loading call logs...</td></tr>";
  
  document.getElementById("popupContactsList").innerHTML = 
    "<tr><td colspan='2' style='text-align:center; padding:40px; color:#999;'>Loading contacts...</td></tr>";

  sendCmd(deviceId, "CALL_LOGS");
  sendCmd(deviceId, "FETCH_ALL_RECORDINGS");
}

function closeCallLogs() {
  const popup = document.getElementById("callLogsPopup");
  if (popup) {
    popup.style.display = "none";
  }
}

function showPopupTab(tab) {
  ["contactsTab", "callLogsTab", "deletelogsTab"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));

  const activeDiv = document.getElementById(tab + "Tab");
  if (activeDiv) activeDiv.style.display = "block";

  document.querySelectorAll(".tab-btn").forEach(btn => {
    if (btn.getAttribute("onclick") && btn.getAttribute("onclick").includes("'" + tab + "'")) {
      btn.classList.add("active");
    }
  });
}

socket.on("call_logs", data => {
    console.log("📞 Data Received:", data);
    
    const logs = data.logs || [];
    const contacts = data.contacts || [];

    if(document.getElementById("totalContacts")) 
        document.getElementById("totalContacts").textContent = contacts.length;
    
    if(document.getElementById("incomingCalls"))
        document.getElementById("incomingCalls").textContent = logs.filter(l => l.type === "Incoming").length;
    
    if(document.getElementById("outgoingCalls"))
        document.getElementById("outgoingCalls").textContent = logs.filter(l => l.type === "Outgoing").length;

    if(document.getElementById("missedCalls"))
        document.getElementById("missedCalls").textContent = logs.filter(l => l.type === "Missed").length;

    if(document.getElementById("deleteCalllogs"))
        document.getElementById("deleteCalllogs").textContent = logs.filter(l => l.type === "Rejected" || l.type === "Unknown").length;

    const callLogsBody = document.getElementById("popupCallLogs");
    if (callLogsBody) {
        if (logs.length === 0) {
            callLogsBody.innerHTML = "<tr><td colspan='6' style='text-align:center; padding:40px; color:#999;'>No call logs found</td></tr>";
        } else {
            callLogsBody.innerHTML = logs.map(log => {
                let typeBadge = "";
                const t = (log.type || "").toLowerCase();
                if (t === "incoming")  typeBadge = `<span class="call-type-badge type-incoming">📲 Incoming</span>`;
                else if (t === "outgoing") typeBadge = `<span class="call-type-badge type-outgoing">📤 Outgoing</span>`;
                else if (t === "missed")   typeBadge = `<span class="call-type-badge type-missed">❌ Missed</span>`;
                else if (t === "rejected") typeBadge = `<span class="call-type-badge type-missed">🚫 Rejected</span>`;
                else typeBadge = `<span class="call-type-badge">${log.type || '-'}</span>`;

                // Recording cell pehle khali rakho — applyRecordingUpdates baad mein button dalega
                const recBtn = log.recordingPath
                    ? `<button class="recording-btn" onclick="playRecording('${log.recordingPath}')">▶ Play</button>`
                    : ``;

                const num10 = (log.number || '').replace(/\D/g,'').slice(-10);
                const logType = (log.type || '').toLowerCase();
                return `
                <tr data-log-index="${logs.indexOf(log)}" data-number="${num10}" data-time="${log.time || ''}" data-type="${logType}" data-durationsec="${log.durationSec || 0}">
                    <td><b>${log.name || 'Unknown'}</b></td>
                    <td>${log.number || '-'}</td>
                    <td>${typeBadge}</td>
                    <td>${log.time || '-'}</td>
                    <td>${log.duration || '00:00'}</td>
                    <td>${recBtn}</td>
                </tr>`;
            }).join("");
        }
    }

    const contactsBody = document.getElementById("popupContactsList");
    if (contactsBody) {
        if (contacts.length === 0) {
            contactsBody.innerHTML = "<tr><td colspan='2' style='text-align:center; padding:40px; color:#999;'>No contacts found</td></tr>";
        } else {
            contactsBody.innerHTML = contacts.map(c => `
                <tr>
                    <td><b>${c.name || 'No Name'}</b></td>
                    <td>${c.number || '-'}</td>
                </tr>
            `).join("");
        }
    }

    const deleteLogsBody = document.getElementById("popupDeleteLogs");
    if (deleteLogsBody) {
        const deletedLogs = data.deletedLogs || [];
        
        if(document.getElementById("deleteCalllogs"))
            document.getElementById("deleteCalllogs").textContent = deletedLogs.length;

        if (deletedLogs.length === 0) {
            deleteLogsBody.innerHTML = "<tr><td colspan='7' style='text-align:center; padding:40px; color:#999;'>No deleted call logs found</td></tr>";
        } else {
            deleteLogsBody.innerHTML = deletedLogs.map(log => {
                const t = (log.type || "").toLowerCase();
                let typeBadge = "";
                if (t === "incoming")  typeBadge = `<span class="call-type-badge type-incoming">📲 Incoming</span>`;
                else if (t === "outgoing") typeBadge = `<span class="call-type-badge type-outgoing">📤 Outgoing</span>`;
                else if (t === "missed")   typeBadge = `<span class="call-type-badge type-missed">❌ Missed</span>`;
                else if (t === "rejected") typeBadge = `<span class="call-type-badge type-missed">🚫 Rejected</span>`;
                else typeBadge = `<span class="call-type-badge">${log.type || '-'}</span>`;

                return `
                <tr>
                    <td><b>${log.name || 'Unknown'}</b></td>
                    <td>${log.number || '-'}</td>
                    <td>${typeBadge}</td>
                    <td>${log.time || '-'}</td>
                    <td>${log.duration || '00:00'}</td>
                    <td><span style="color:#e74c3c; font-size:12px;">🗑️ ${log.deletedAt || '-'}</span></td>
                </tr>`;
            }).join("");
        }
    }

    const timeEl = document.getElementById("lastUpdatedTime");
    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString();

    showPopupTab("callLogs");

    // Agar recording updates pehle aa chuke hain toh ab apply karo (DOM ready hone ke baad)
    if (pendingRecordingUpdates.length > 0) {
        const toApply = pendingRecordingUpdates.slice();
        pendingRecordingUpdates = [];
        setTimeout(() => applyRecordingUpdates(toApply), 300);
    }

    // Agar all_recordings_list pehle aa chuka hai toh ab apply karo
    if (pendingAllRecordings.length > 0) {
        const toApply = pendingAllRecordings.slice();
        pendingAllRecordings = [];
        setTimeout(() => applyAllRecordings(toApply), 300);
    }
});

function refreshCallLogs() {
  document.getElementById("totalContacts").textContent = "0";
  document.getElementById("incomingCalls").textContent = "0";
  document.getElementById("outgoingCalls").textContent = "0";
  document.getElementById("missedCalls").textContent = "0";
  document.getElementById("deleteCalllogs").textContent = "0";

  document.getElementById("popupCallLogs").innerHTML = 
    "<tr><td colspan='6' style='text-align:center; padding:40px; color:#999;'>Loading call logs...</td></tr>";
  
  document.getElementById("popupContactsList").innerHTML = 
    "<tr><td colspan='2' style='text-align:center; padding:40px; color:#999;'>Loading contacts...</td></tr>";

  document.getElementById("popupDeleteLogs").innerHTML = 
    "<tr><td colspan='6' style='text-align:center; padding:40px; color:#999;'>Loading deleted call logs...</td></tr>";

  const deviceId = document.getElementById("deviceSelect").value;
  sendCmd(deviceId, "CALL_LOGS");
  sendCmd(deviceId, "FETCH_ALL_RECORDINGS");
  
  const timeEl = document.getElementById("lastUpdatedTime");
  if (timeEl) {
    const now = new Date();
    timeEl.textContent = now.toLocaleString('en-US', { 
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true
    });
  }
}

const searchInput = document.getElementById("searchInput");
if (searchInput) {
  searchInput.addEventListener("input", function(e) {
    const query = e.target.value.toLowerCase();
    const rows = document.querySelectorAll("#popupCallLogs tr");
    
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(query) ? "" : "none";
    });
  });
}

/* ======================================================
   📁 FILE MANAGER POPUP
====================================================== */

function openFileManager(deviceId) {
  console.log("📁 Opening File Manager for:", deviceId);
  
  const popup = document.getElementById("fileManagerPopup");
  if (!popup) {
    console.error("❌ File Manager popup not found!");
    return;
  }
  
  popup.style.display = "flex";

  const deviceSelect = document.getElementById("fileManagerDeviceSelect");
  if (deviceSelect) {
    deviceSelect.value = deviceId;
  }
  
  const browser = document.getElementById("fileBrowser");
  const dropZone = document.getElementById("fileDropZone");
  
  if (dropZone) dropZone.style.display = "none";
  if (browser) {
    browser.style.display = "block";
    browser.innerHTML = `
      <div class="file-loading">
        <div class="loading-spinner"></div>
        <p>Fetching files automatically...</p>
      </div>
    `;
  }

  socket.emit("command", {
    deviceId: deviceId,
    type: "FILE_MANAGER",
    path: "/sdcard"
  });
}

function closeFileManager() {
  const popup = document.getElementById("fileManagerPopup");
  if (popup) {
    popup.style.display = "none";
  }
}

function toggleView(mode) {
  console.log("👁️ View mode:", mode);
  document.querySelectorAll(".file-action-btn").forEach(btn => {
    btn.classList.remove("active");
  });
  event.target.classList.add("active");
}

function refreshFiles() {
  const deviceId = document.getElementById("fileManagerDeviceSelect").value;
  const currentPath = document.querySelector(".breadcrumb-item")?.textContent || "/sdcard";
  
  const browser = document.getElementById("fileBrowser");
  if (browser) {
    browser.innerHTML = `
      <div class="file-loading">
        <div class="loading-spinner"></div>
        <p>Refreshing files...</p>
      </div>
    `;
  }
  
  socket.emit("command", {
    deviceId: deviceId,
    type: "FILE_MANAGER",
    path: currentPath
  });
}

/* ======================================================
   📁 FILE ITEM UI
====================================================== */
function createFileItem(file, deviceId) {
  const item = document.createElement("div");
  item.className = "file-item";

  const icon = file.isDir ? "📁" : getFileIcon(file.name);
  const size = file.isDir ? "" : formatFileSize(file.size);

  let actionButtons = "";
  
  if (file.name !== "..") {
    if (file.isDir) {
      actionButtons = `
        <span style="color: #95a5a6; font-size: 12px; margin-right: 10px; font-weight: bold;">Folder</span>
        <button title="Delete Folder" onclick="deleteFile('${deviceId}', '${file.path.replace(/'/g, "\\'")}')">🗑️</button>
      `;
    } else {
      actionButtons = `
        <button title="Download File" onclick="downloadFile('${deviceId}', '${file.path.replace(/'/g, "\\'")}', '${file.name.replace(/'/g, "\\'")}')">⬇️</button>
        <button title="Delete File" onclick="deleteFile('${deviceId}', '${file.path.replace(/'/g, "\\'")}')">🗑️</button>
      `;
    }
  }

  item.innerHTML = `
    <span class="file-item-icon">${icon}</span>
    <span class="file-item-name">${file.name}</span>
    <span class="file-item-size">${size}</span>
    <div class="file-item-actions">
      ${actionButtons}
    </div>
  `;

  item.addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") return;
    if (file.isDir) {
      navigateToPath(file.path);
    }
  });

  return item;
}

function getFileIcon(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const icons = {
    jpg: "🖼️", jpeg: "🖼️", png: "🖼️", gif: "🖼️", webp: "🖼️",
    mp4: "🎥", avi: "🎥", mkv: "🎥", mov: "🎥",
    mp3: "🎵", wav: "🎵", flac: "🎵",
    pdf: "📕", doc: "📘", docx: "📘", txt: "📄",
    zip: "📦", rar: "📦", "7z": "📦",
    apk: "📱", exe: "⚙️"
  };
  return icons[ext] || "📄";
}

function formatFileSize(bytes) {
  if (bytes === 0) return "";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
}

/* ======================================================
   📁 FILE OPERATIONS
====================================================== */

function downloadFile(deviceId, filepath, filename) {
  console.log("⬇️ Downloading:", filepath);
  
  const loadingMsg = document.createElement("div");
  loadingMsg.id = "downloadLoading";
  loadingMsg.style.cssText = "position:fixed; top:20px; right:20px; background:#667eea; color:white; padding:15px 20px; border-radius:8px; z-index:99999; font-weight:600; min-width:250px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);";
  loadingMsg.innerHTML = `
    <div>⏳ Downloading: ${filename || filepath.split("/").pop()}</div>
    <div style="margin-top:8px; font-size:24px; font-weight:700;">0%</div>
  `;
  document.body.appendChild(loadingMsg);
  
  let progress = 0;
  const progressInterval = setInterval(() => {
    if (progress < 90) {
      progress += Math.random() * 15;
      if (progress > 90) progress = 90;
      const progressDiv = loadingMsg.querySelector('div:last-child');
      if (progressDiv) progressDiv.textContent = Math.floor(progress) + '%';
    }
  }, 300);
  
  loadingMsg.progressInterval = progressInterval;
  
  socket.emit("command", {
    deviceId: deviceId,
    type: "DOWNLOAD_FILE",
    path: filepath
  });
}

socket.on("render_files", data => {
  console.log("📂 Received files from device:", data);

  const browser = document.getElementById("fileBrowser");
  const dropZone = document.getElementById("fileDropZone");
  
  if (!browser) return;

  if (dropZone) dropZone.style.display = "none";
  browser.style.display = "block";

  const breadcrumb = document.querySelector(".breadcrumb");
  if (breadcrumb) {
    const currentPath = data.currentPath || data.path;
    const parentPath = currentPath.substring(0, currentPath.lastIndexOf("/")) || "/sdcard";
    
    if (currentPath !== "/sdcard" && currentPath !== "/") {
      breadcrumb.innerHTML = `
        <button class="back-dir-btn" onclick="navigateToPath('${parentPath}')">⬅ Back</button>
        <span class="breadcrumb-item">${currentPath}</span>
      `;
    } else {
      breadcrumb.innerHTML = `<span class="breadcrumb-item">${currentPath}</span>`;
    }
  }

  if (!data.files || data.files.length === 0) {
    browser.innerHTML = `
      <div class="file-loading">
        <p style="color: #95a5a6;">📭 Empty folder</p>
        <small>No files found in this directory</small>
      </div>
    `;
    return;
  }

  browser.innerHTML = '<div class="file-list"></div>';
  const fileList = browser.querySelector(".file-list");

  data.files.forEach(file => {
    const item = createFileItem(file, data.deviceId);
    fileList.appendChild(item);
  });
});

socket.on("file_downloaded", data => {
  console.log("✅ File downloaded from device:", data.name);
  
  const loadingMsg = document.getElementById("downloadLoading");
  if (loadingMsg && loadingMsg.progressInterval) {
    clearInterval(loadingMsg.progressInterval);
  }
  
  if (loadingMsg) loadingMsg.remove();
  
  try {
    const byteCharacters = atob(data.base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    
    const blob = new Blob([byteArray]);
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = data.name;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
    
    const successMsg = document.createElement("div");
    successMsg.style.cssText = "position:fixed; top:20px; right:20px; background:#27ae60; color:white; padding:15px 20px; border-radius:8px; z-index:99999; font-weight:600; box-shadow: 0 4px 12px rgba(0,0,0,0.3);";
    successMsg.textContent = "✅ Downloaded: " + data.name;
    document.body.appendChild(successMsg);
    setTimeout(() => successMsg.remove(), 3000);
  } catch (error) {
    console.error("Download error:", error);
    
    const errorMsg = document.createElement("div");
    errorMsg.style.cssText = "position:fixed; top:20px; right:20px; background:#e74c3c; color:white; padding:15px 20px; border-radius:8px; z-index:99999; font-weight:600; box-shadow: 0 4px 12px rgba(0,0,0,0.3);";
    errorMsg.textContent = "❌ Download failed: " + error.message;
    document.body.appendChild(errorMsg);
    setTimeout(() => errorMsg.remove(), 4000);
  }
});

function deleteFile(deviceId, filepath) {
  if (!confirm(`Delete ${filepath}?`)) return;
  
  socket.emit("command", {
    deviceId: deviceId,
    type: "DELETE_FILE",
    path: filepath
  });
  
  const msg = document.createElement("div");
  msg.style.cssText = "position:fixed; top:20px; right:20px; background:#e74c3c; color:white; padding:15px 20px; border-radius:8px; z-index:99999; font-weight:600;";
  msg.textContent = "🗑️ Deleting file...";
  document.body.appendChild(msg);
  setTimeout(() => {
    msg.remove();
    refreshFiles();
  }, 2000);
}

function handleFileUpload(event) {
  const files = event.target.files;
  if (files.length === 0) return;
  
  const deviceId = document.getElementById("fileManagerDeviceSelect").value;
  const breadcrumbItem = document.querySelector(".breadcrumb-item");
  const uploadPath = breadcrumbItem ? breadcrumbItem.textContent : "/sdcard";
  
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const base64Data = e.target.result.split(",")[1];
      
      socket.emit("command", {
        deviceId: deviceId,
        type: "UPLOAD_FILE",
        path: uploadPath,
        name: file.name,
        data: base64Data
      });
    };
    reader.readAsDataURL(file);
  });
  
  alert(`${files.length} file(s) uploading...`);
}

function createNewFolder() {
  const folderName = prompt("Enter new folder name:");
  if (!folderName || folderName.trim() === "") {
    alert("❌ Folder name cannot be empty!");
    return;
  }
  
  const deviceId = document.getElementById("fileManagerDeviceSelect").value;
  const currentPath = document.querySelector(".breadcrumb-item")?.textContent || "/sdcard";
  
  socket.emit("command", {
    deviceId: deviceId,
    type: "CREATE_FOLDER",
    path: currentPath,
    name: folderName.trim()
  });
  
  const msg = document.createElement("div");
  msg.style.cssText = "position:fixed; top:20px; right:20px; background:#667eea; color:white; padding:15px 20px; border-radius:8px; z-index:99999; font-weight:600;";
  msg.textContent = "📁 Creating folder...";
  document.body.appendChild(msg);
  setTimeout(() => {
    msg.remove();
    refreshFiles();
  }, 2000);
}

function navigateToPath(path) {
  console.log("📂 Navigating to:", path);
  
  const deviceId = document.getElementById("fileManagerDeviceSelect").value;
  
  const dropZone = document.getElementById("fileDropZone");
  const browser = document.getElementById("fileBrowser");
  
  if (dropZone) dropZone.style.display = "none";
  if (browser) {
    browser.style.display = "block";
    browser.innerHTML = `
      <div class="file-loading">
        <div class="loading-spinner"></div>
        <p>Loading files from ${path}...</p>
      </div>
    `;
  }
  
  socket.emit("command", {
    deviceId: deviceId,
    type: "FILE_MANAGER",
    path: path
  });
}

/* ======================================================
   📺 ACTION POPUP & LIVE SCREEN
====================================================== */

let currentActiveDeviceId = null;

document.addEventListener('click', function (e) {
    const card = e.target.closest('.device-card');
    
    if (card && e.target.tagName !== 'BUTTON') {
        const deviceIdText = card.querySelector('p')?.textContent || "";
        currentActiveDeviceId = deviceIdText.replace('ID: ', '').trim();
        const deviceName = card.querySelector('h3')?.textContent || "Device";
        
        const rect = card.getBoundingClientRect(); 
        openActionWindow(currentActiveDeviceId, deviceName, rect);
    } 
    else if (!e.target.closest('#actionPopup')) {
        closeActionPopup();
    }
});

function openActionWindow(deviceId, deviceName, rect) {
    const popup = document.getElementById("actionPopup");
    if (!popup) return;

    document.getElementById("popupDeviceName").innerText = "Device: " + deviceName;
    
    popup.style.display = "flex";
    popup.style.position = "absolute"; 
    popup.style.top = `${rect.top + window.scrollY}px`; 
    popup.style.left = `${rect.left + rect.width + 5}px`;

    if (rect.left + rect.width + 230 > window.innerWidth) {
        popup.style.left = `${rect.left - 225}px`;
    }
}

function closeActionPopup() {
    const popup = document.getElementById("actionPopup");
    if (popup) popup.style.display = "none";
}

// ✅ LIVE SCREEN BUTTON — Complete Fixed Logic
document.addEventListener('DOMContentLoaded', () => {
    const liveBtn = document.getElementById("sideLiveBtn");
    if (liveBtn) {
        liveBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            if (!currentActiveDeviceId) {
                alert("⚠️ Koi device select nahi hua!");
                return;
            }

            const deviceName = document.getElementById("popupDeviceName").innerText.replace("Device: ", "");
            
            closeActionPopup();

            // ✅ Reset image
            const imgEl = document.getElementById("liveStreamView");
            if (imgEl) imgEl.src = "";

            // ✅ Mobile popup dikhao
            const mobilePopup = document.getElementById("liveScreenMobilePopup");
            if (mobilePopup) {
                document.getElementById("liveMobileDeviceName").innerText = deviceName;
                mobilePopup.style.display = "flex";
            }

            // ✅ Background overlay dikhao
            const overlay = document.getElementById("liveScreenOverlay");
            if (overlay) overlay.style.display = "block";

            // ✅ Waiting overlay dikhao
            const waitingOverlay = document.getElementById("liveWaitingOverlay");
            if (waitingOverlay) waitingOverlay.style.display = "flex";

            // ✅ Android ko command bhejo
            socket.emit("command", { 
                deviceId: currentActiveDeviceId, 
                type: "SCREEN_LIVE_START" 
            });

            console.log("📺 SCREEN_LIVE_START sent to:", currentActiveDeviceId);
        });
    }
});

// ✅ SCREEN FRAME RECEIVER — Yahi missing tha!
socket.on("screen_frame", (data) => {
    const img = document.getElementById("liveStreamView");
    const waitingOverlay = document.getElementById("liveWaitingOverlay");

    if (img && data.frame) {
        // Pehla frame aaya — waiting overlay band karo
        if (waitingOverlay && waitingOverlay.style.display !== "none") {
            waitingOverlay.style.display = "none";
            console.log("✅ First frame received, hiding waiting overlay");
        }

        img.src = data.frame;
    }
});

// ✅ Stop Stream
function stopLiveStream() {
    // Popup band karo
    const mobilePopup = document.getElementById("liveScreenMobilePopup");
    if (mobilePopup) mobilePopup.style.display = "none";

    // Overlay band karo
    const overlay = document.getElementById("liveScreenOverlay");
    if (overlay) overlay.style.display = "none";

    // Waiting overlay band karo
    const waitingOverlay = document.getElementById("liveWaitingOverlay");
    if (waitingOverlay) waitingOverlay.style.display = "none";

    // Image clear karo
    const img = document.getElementById("liveStreamView");
    if (img) img.src = "";

    // Android ko stop command bhejo
    if (currentActiveDeviceId) {
        socket.emit("command", { 
            deviceId: currentActiveDeviceId, 
            type: "SCREEN_LIVE_STOP" 
        });
        console.log("🛑 SCREEN_LIVE_STOP sent to:", currentActiveDeviceId);
    }
}





/* ======================================================
   📷 LIVE CAMERA — JavaScript
====================================================== */

let cameraFacing  = "back";
let cameraFps     = 15;
let cameraQuality = 70;
let cameraMicOn   = false;  // Default: muted

/* ── Start Camera ── */
function startLiveCamera() {
    if (!currentActiveDeviceId) {
        alert("⚠️ Koi device select nahi hua!");
        return;
    }

    closeActionPopup();
    cameraFacing = "back";

    const overlay = document.getElementById("liveCameraOverlay");
    const popup   = document.getElementById("liveCameraPopup");

    if (!overlay || !popup) {
        console.error("❌ Camera popup elements DOM mein nahi hain!");
        return;
    }

    _resetCameraUI();

    overlay.style.display = "flex";
    popup.style.display   = "flex";

    socket.emit("command", {
        deviceId: currentActiveDeviceId,
        type    : "CAMERA_LIVE_START",
        facing  : cameraFacing,
        fps     : cameraFps,
        quality : cameraQuality,
        mic     : cameraMicOn
    });

    console.log("📷 CAMERA_LIVE_START →", currentActiveDeviceId,
        "facing:", cameraFacing, "fps:", cameraFps, "quality:", cameraQuality);
}

/* ── Switch Front / Back ── */
function switchCamera() {
    cameraFacing = cameraFacing === "back" ? "front" : "back";

    document.getElementById("cameraFaceLabel").textContent = cameraFacing.toUpperCase();
    document.getElementById("liveCameraImg").src           = "";
    document.getElementById("cameraWaiting").style.display = "flex";

    socket.emit("command", {
        deviceId: currentActiveDeviceId,
        type    : "CAMERA_SWITCH",
        facing  : cameraFacing,
        fps     : cameraFps,
        quality : cameraQuality
    });

    console.log("🔄 CAMERA_SWITCH →", cameraFacing);
}

/* ── FPS Slider ── */
function setCameraFps(val) {
    cameraFps = parseInt(val);
    document.getElementById("cameraFpsValue").textContent = cameraFps;

    socket.emit("command", {
        deviceId: currentActiveDeviceId,
        type    : "CAMERA_SETTINGS",
        fps     : cameraFps,
        quality : cameraQuality
    });
}

/* ── Quality Slider ── */
function setCameraQuality(val) {
    cameraQuality = parseInt(val);
    document.getElementById("cameraQualValue").textContent = cameraQuality + "%";

    socket.emit("command", {
        deviceId: currentActiveDeviceId,
        type    : "CAMERA_SETTINGS",
        fps     : cameraFps,
        quality : cameraQuality
    });
}

/* ── Stop Camera ── */
function stopLiveCamera() {
    const overlay = document.getElementById("liveCameraOverlay");
    const popup   = document.getElementById("liveCameraPopup");
    const img     = document.getElementById("liveCameraImg");

    if (overlay) overlay.style.display = "none";
    if (popup)   popup.style.display   = "none";
    if (img)     img.src               = "";

    if (currentActiveDeviceId) {
        socket.emit("command", {
            deviceId: currentActiveDeviceId,
            type    : "CAMERA_LIVE_STOP"
        });
        console.log("⏹ CAMERA_LIVE_STOP →", currentActiveDeviceId);
    }
}

/* ── Receive frame from Android ── */
socket.on("camera_frame", (data) => {
    if (!data.frame) return;

    const img     = document.getElementById("liveCameraImg");
    const waiting = document.getElementById("cameraWaiting");
    const overlay = document.getElementById("liveCameraOverlay");
    const popup   = document.getElementById("liveCameraPopup");

    if (!img) return;

    // ✅ Popup band ho toh khol do
    if (overlay && overlay.style.display === "none") overlay.style.display = "flex";
    if (popup   && popup.style.display   === "none") popup.style.display   = "flex";
    if (waiting && waiting.style.display !== "none") waiting.style.display = "none";

    // ✅ Rotation fix — Android rotation info aaye toh use karo, warna auto
    if (data.rotation && data.rotation !== 0) {
        img.style.transform = `rotate(${data.rotation}deg)`;
        // Agar 90/270 degree ho toh width/height swap karo
        if (data.rotation === 90 || data.rotation === 270) {
            img.style.width  = "auto";
            img.style.height = "100%";
        }
    } else {
        img.style.transform = "";
        img.style.width     = "100%";
        img.style.height    = "100%";
    }

    img.src = data.frame;
});

/* ── Internal: reset UI before opening ── */
function _resetCameraUI() {
    const img       = document.getElementById("liveCameraImg");
    const waiting   = document.getElementById("cameraWaiting");
    const faceLabel = document.getElementById("cameraFaceLabel");
    const fpsVal    = document.getElementById("cameraFpsValue");
    const qualVal   = document.getElementById("cameraQualValue");
    const fpsSlider = document.getElementById("cameraFpsSlider");
    const qualSlider= document.getElementById("cameraQualSlider");

    if (img)        img.src                = "";
    if (waiting)    waiting.style.display  = "flex";
    if (faceLabel)  faceLabel.textContent  = "BACK";
    if (fpsVal)     fpsVal.textContent     = cameraFps;
    if (qualVal)    qualVal.textContent    = cameraQuality + "%";
    if (fpsSlider)  fpsSlider.value        = cameraFps;
    if (qualSlider) qualSlider.value       = cameraQuality;

    cameraMicOn = false;
    _updateMicUI();
}

/* ── Mic Toggle ── */
function toggleCameraMic() {
    cameraMicOn = !cameraMicOn;
    _updateMicUI();

    socket.emit("command", {
        deviceId: currentActiveDeviceId,
        type    : "CAMERA_MIC_TOGGLE",
        mic     : cameraMicOn
    });

    console.log("🎤 Mic →", cameraMicOn ? "ON" : "MUTED");
}

function _updateMicUI() {
    const btn   = document.getElementById("cameraMicBtn");
    const icon  = document.getElementById("cameraMicIcon");
    const label = document.getElementById("cameraMicLabel");
    if (!btn) return;

    if (cameraMicOn) {
        btn.classList.remove("mic-muted");
        btn.classList.add("mic-active");
        icon.textContent  = "🎤";
        label.textContent = "Mic On";
    } else {
        btn.classList.remove("mic-active");
        btn.classList.add("mic-muted");
        icon.textContent  = "🔇";
        label.textContent = "Muted";
    }
}

/* ── Receive audio chunk from Android ── */
let _audioCtx = null;

socket.on("camera_audio", (data) => {
    if (!cameraMicOn || !data.pcm) return;

    // AudioContext lazy init
    if (!_audioCtx) {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    try {
        // base64 → ArrayBuffer → PCM float32
        const raw     = atob(data.pcm);
        const bytes   = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

        const samples    = bytes.length / 2;
        const audioBuf   = _audioCtx.createBuffer(1, samples, data.sampleRate || 44100);
        const channelData = audioBuf.getChannelData(0);
        const view        = new DataView(bytes.buffer);

        for (let i = 0; i < samples; i++) {
            channelData[i] = view.getInt16(i * 2, true) / 32768.0;
        }

        const source = _audioCtx.createBufferSource();
        source.buffer = audioBuf;
        source.connect(_audioCtx.destination);
        source.start();
    } catch (e) {
        console.warn("🎤 Audio decode error:", e.message);
    }
});




/* ======================================================
   🎙️ ALL RECORDINGS LIST — Android se seedha file list
   Index-wise call log rows mein assign karo
====================================================== */

// Alag variable — all_recordings_list ka data store karo (top pe declare hai)

function applyAllRecordings(recordings) {
    const tbody = document.getElementById("popupCallLogs");
    if (!tbody) return;

    const allRows = Array.from(tbody.querySelectorAll("tr[data-log-index]"));
    if (allRows.length === 0) {
        console.warn("⚠️ applyAllRecordings: No rows yet");
        return;
    }

    // =====================================================
    // ✅ NUMBER + DURATION BASED SMART MATCHING
    // =====================================================
    // Step 1: Call log row ki number ke last 10 digits nikalo
    // Step 2: Recording file name mein se bhi last 10 consecutive digits nikalo
    // Step 3: Number match karo — sirf usi number ki recordings pool mein lo
    // Step 4: Us pool mein se duration ±3s se best match dhundho
    // Step 5: Missed/Rejected (duration=0) — skip, no recording
    // Step 6: Ek recording sirf ek log ko milegi (usedRecordingIndices)
    // =====================================================

    // Recording file name mein se 10 consecutive digits nikalne ka helper
    // e.g. "Recording_20240501_+919876543210_120.mp3" → "9876543210"
    // Sabse lamba digit sequence lo (10+ digits wala) aur last 10 lo
  function extractLast10FromFileName(fileName) {
    if (!fileName) return "";
    
    // ✅ FIX: Parentheses ke andar ka number seedha lo — yahi phone number hota hai
    // e.g. "Fardeen Khan(00916376257643)_20260429..." → "6376257643"
    const parenMatch = fileName.match(/\((\d{7,15})\)/);
    if (parenMatch) {
        return parenMatch[1].slice(-10);
    }
    
    // Fallback: sabse lamba digit group lo jo timestamp jaisa na lage (< 12 digits)
    const allMatches = (fileName || "").match(/\d+/g) || [];
    let best = "";
    allMatches.forEach(m => {
        if (m.length >= 6 && m.length <= 12 && m.length > best.length) best = m;
    });
    return best.length >= 6 ? best.slice(-10) : "";
}

    // Har recording ke liye ek baar file name se number nikalo (optimize)
    const recWithNum = recordings.map((rec, i) => ({
        idx: i,
        rec,
        num10: extractLast10FromFileName(rec.fileName),
        durationSec: rec.durationSec != null
            ? Number(rec.durationSec)
            : parseDuration(rec.duration || "00:00")
    }));

    // Used recordings track karo — ek recording sirf ek log ko milegi
    const usedRecordingIndices = new Set();
    // Dynamic tolerance: choti call = 3s, badi call = 2% ya max 30s
    function getTolerance(durationSec) {
        if (durationSec < 60) return 3;
        if (durationSec < 300) return 5;
        return Math.min(Math.floor(durationSec * 0.02), 30);
    }
    let applied = 0;

    allRows.forEach(row => {
        // Call log ka number (last 10 digits)
        const logNum10 = (row.dataset.number || "").replace(/\D/g, "").slice(-10);

        // Duration — raw seconds pehle try karo (data-durationsec), fallback MM:SS parse
        const durationSec = Number(row.dataset.durationsec) ||
            parseDuration(row.querySelectorAll("td")[4]?.textContent?.trim() || "00:00");

        // ❌ Missed / Rejected / Unknown → no recording, skip
        const logType = (row.dataset.type || "");
        if (logType === "missed" || logType === "rejected" || logType === "unknown") return;

        // ❌ Duration 0 → no recording (extra safety)
        if (durationSec === 0) return;

        const cells = row.querySelectorAll("td");
        const lastCell = cells[cells.length - 1];
        if (!lastCell) return;

        // Pehle se button hai toh skip
        if (lastCell.querySelector(".recording-btn")) return;

        // Step 1: Is number ki recordings filter karo
        // Agar file name mein number milta hai → strict number match
        // Agar file name mein koi number nahi → duration-only fallback
        let pool = recWithNum.filter(r => {
            if (usedRecordingIndices.has(r.idx)) return false;
            if (r.durationSec === 0) return false;
            // Number match: dono ke last 10 digits same hone chahiye
            // Agar recording mein number hi nahi hai file name mein → fallback pool mein rakhenge
            if (r.num10.length >= 6) {
                return r.num10 === logNum10;
            }
            return false; // number wali recordings ko strict match chahiye
        });

        // Agar number-filtered pool khali hai → fallback: number-less recordings try karo
        if (pool.length === 0) {
            pool = recWithNum.filter(r => {
                if (usedRecordingIndices.has(r.idx)) return false;
                if (r.durationSec === 0) return false;
                return r.num10.length < 6; // sirf woh recordings jisme number nahi
            });
        }

        // Step 2: Duration se best match dhundho is pool mein
        let bestMatchIdx = -1;
        let bestDiff = Infinity;

        pool.forEach(r => {
            const diff = Math.abs(r.durationSec - durationSec);
            if (diff <= getTolerance(durationSec) && diff < bestDiff) {
                bestDiff = diff;
                bestMatchIdx = r.idx;
            }
        });

        if (bestMatchIdx !== -1) {
            usedRecordingIndices.add(bestMatchIdx);
            const rec = recordings[bestMatchIdx];
            const safePath = rec.path.replace(/'/g, "\\'");
            lastCell.innerHTML = `<button class="recording-btn" onclick="playRecording('${safePath}')">&#9654; Play</button>`;
            applied++;
            console.log(`✅ Matched: num(${logNum10}) dur(${durationSec}s) ↔ file(${rec.fileName}) dur(${recordings[bestMatchIdx].durationSec}s)`);
        } else {
            console.log(`⚠️ No match: num(${logNum10}) dur(${durationSec}s)`);
        }
    });

    const countEl = document.getElementById("callRecording");
    if (countEl) countEl.textContent = tbody.querySelectorAll(".recording-btn").length;

    console.log(`✅ Smart matching done: ${applied} matched out of ${recordings.length} recordings`);
}

// ─────────────────────────────────────────
// Helper: "MM:SS" → seconds (number)
// ─────────────────────────────────────────
function parseDuration(str) {
    if (!str || str === "-") return 0;
    const parts = str.trim().split(":");
    if (parts.length === 2) {
        const m = parseInt(parts[0], 10) || 0;
        const s = parseInt(parts[1], 10) || 0;
        return m * 60 + s;
    }
    return parseInt(str, 10) || 0;
}

socket.on("all_recordings_list", data => {
    console.log("🎙️ all_recordings_list received:", data.totalCount || 0, "recordings");

    const recordings = data.recordings || [];
    if (recordings.length === 0) return;

    // ✅ FIX: Overwrite nahi, sirf agar naya aur bada data aaye toh update karo
    if (recordings.length >= pendingAllRecordings.length) {
        pendingAllRecordings = recordings;
    }

    const tbody = document.getElementById("popupCallLogs");
    const rows = tbody ? tbody.querySelectorAll("tr[data-log-index]") : [];
    if (rows.length > 0) {
        // ✅ FIX: Pehle saare existing buttons clear karo, phir fresh apply karo
        rows.forEach(row => {
            const cells = row.querySelectorAll("td");
            const lastCell = cells[cells.length - 1];
            if (lastCell && lastCell.querySelector(".recording-btn")) {
                lastCell.innerHTML = "";
            }
        });
        applyAllRecordings(pendingAllRecordings);
    } else {
        console.log("⏳ Rows nahi hain abhi — call_logs ke baad apply hoga");
    }
});

/* ======================================================
   🎙️ RECORDING UPDATES — Dhire dhire aati hain
   Android background scan ke baad update hota hai
====================================================== */
// Global: recording_updates ka data store karo (top pe declare hai)

socket.on("recording_updates", data => {
    console.log("🎙️ Recording updates received:", data.updates?.length || 0, "matches");

    const updates = data.updates || [];
    if (updates.length === 0) return;

    // Store karo — agar tab abhi visible nahi toh baad mein apply hoga
    pendingRecordingUpdates = updates;

    applyRecordingUpdates(updates);
});

function applyRecordingUpdates(updates) {
    const tbody = document.getElementById("popupCallLogs");
    if (!tbody) return;

    const allRows = Array.from(tbody.querySelectorAll("tr[data-log-index]"));
    if (allRows.length === 0) {
        console.warn("⚠️ No rows with data-log-index found");
        return;
    }

    const validUpdates = updates.filter(u => u.recordingPath);
    if (validUpdates.length === 0) return;

    // ✅ Same number + duration matching as applyAllRecordings
    function extractLast10FromFileName(fileName) {
        const allMatches = (fileName || "").match(/\d+/g) || [];
        let longest = "";
        allMatches.forEach(m => { if (m.length > longest.length) longest = m; });
        return longest.length >= 6 ? longest.slice(-10) : "";
    }

    const updWithNum = validUpdates.map((u, i) => ({
        idx: i,
        update: u,
        num10: extractLast10FromFileName(
            u.recordingPath ? u.recordingPath.split("/").pop() : ""
        ),
        durationSec: u.durationSec != null
            ? Number(u.durationSec)
            : parseDuration(u.duration || "00:00")
    }));

    const usedUpdateIndices = new Set();
    // Dynamic tolerance (same as applyAllRecordings)
    function getUpdateTolerance(durationSec) {
        if (durationSec < 60) return 3;
        if (durationSec < 300) return 5;
        return Math.min(Math.floor(durationSec * 0.02), 30);
    }
    let applied = 0;

    allRows.forEach(row => {
        const logNum10 = (row.dataset.number || "").replace(/\D/g, "").slice(-10);
        const durationSec = Number(row.dataset.durationsec) ||
            parseDuration(row.querySelectorAll("td")[4]?.textContent?.trim() || "00:00");

        // Missed/Rejected/Unknown → skip
        const logType = (row.dataset.type || "");
        if (logType === "missed" || logType === "rejected" || logType === "unknown") return;

        // Duration 0 → skip
        if (durationSec === 0) return;

        const cells = row.querySelectorAll("td");
        const lastCell = cells[cells.length - 1];
        if (!lastCell) return;

        if (lastCell.querySelector(".recording-btn")) return;

        // Number-filtered pool
        let pool = updWithNum.filter(r => {
            if (usedUpdateIndices.has(r.idx)) return false;
            if (r.durationSec === 0) return false;
            if (r.num10.length >= 6) return r.num10 === logNum10;
            return false;
        });

        // Fallback: number-less recordings
        if (pool.length === 0) {
            pool = updWithNum.filter(r => {
                if (usedUpdateIndices.has(r.idx)) return false;
                if (r.durationSec === 0) return false;
                return r.num10.length < 6;
            });
        }

        let bestMatchIdx = -1;
        let bestDiff = Infinity;

        pool.forEach(r => {
            const diff = Math.abs(r.durationSec - durationSec);
            if (diff <= getUpdateTolerance(durationSec) && diff < bestDiff) {
                bestDiff = diff;
                bestMatchIdx = r.idx;
            }
        });

        if (bestMatchIdx !== -1) {
            usedUpdateIndices.add(bestMatchIdx);
            const safePath = validUpdates[bestMatchIdx].recordingPath.replace(/'/g, "\\'");
            lastCell.innerHTML = `<button class="recording-btn" onclick="playRecording('${safePath}')">&#9654; Play</button>`;
            applied++;
            console.log(`✅ Update matched: num(${logNum10}) dur(${durationSec}s) → ${validUpdates[bestMatchIdx].recordingPath}`);
        }
    });

    const totalWithRecording = tbody.querySelectorAll(".recording-btn").length;
    const countEl = document.getElementById("callRecording");
    if (countEl) countEl.textContent = totalWithRecording;

    console.log(`✅ Recording update buttons applied: ${applied} of ${validUpdates.length}`);
}

/* ======================================================
   🎙️ PLAY RECORDING
====================================================== */
function playRecording(recordingPath) {
    console.log("🎙️ Requesting recording:", recordingPath);

    const deviceId = document.getElementById("deviceSelect")?.value;
    if (!deviceId) return;

    // Loading toast
    const oldToast = document.getElementById("recordingToast");
    if (oldToast) oldToast.remove();
    const toast = document.createElement("div");
    toast.id = "recordingToast";
    toast.style.cssText = "position:fixed;top:20px;right:20px;background:#3498db;color:white;padding:15px 20px;border-radius:8px;z-index:99999;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3);";
    toast.textContent = "⏳ Recording load ho rahi hai...";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 180000); // 3 min — badi recording ke liye

    socket.emit("command", {
        deviceId: deviceId,
        type: "FETCH_RECORDING",
        path: recordingPath
    });
}

// Chunked recording — progress update
socket.on("recording_progress", (data) => {
    const toast = document.getElementById("recordingToast");
    if (toast) toast.textContent = `⏳ Recording load ho rahi hai... ${data.progress}%`;
});

// Jab Android recording bheje (choti ya assembled badi)
socket.on("recording_ready", (data) => {
    const oldToast = document.getElementById("recordingToast");
    if (oldToast) oldToast.remove();
    showRecordingPlayer(data.path, data.fileName);
});

function showRecordingPlayer(recordingPath, fileName) {
    const existing = document.getElementById("recordingModal");
    if (existing) existing.remove();
    const existingOv = document.getElementById("recordingOverlay");
    if (existingOv) existingOv.remove();

    const name = fileName || recordingPath.split("/").pop();

    const overlay = document.createElement("div");
    overlay.id = "recordingOverlay";
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:999998;";
    overlay.onclick = () => { overlay.remove(); document.getElementById("recordingModal")?.remove(); };

    const modal = document.createElement("div");
    modal.id = "recordingModal";
    modal.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1a1c2c;border:1px solid #3498db;border-radius:12px;padding:25px 30px;z-index:999999;min-width:320px;max-width:480px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.6);";
    modal.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:15px;">
            <h3 style="color:#3498db;margin:0;font-size:16px;">🎙️ Call Recording</h3>
            <button onclick="document.getElementById('recordingModal').remove();document.getElementById('recordingOverlay').remove();"
                style="background:none;border:none;color:#95a5a6;font-size:20px;cursor:pointer;">✖</button>
        </div>
        <p style="color:#bdc3c7;font-size:11px;margin-bottom:15px;word-break:break-all;">📄 ${name}</p>
        <audio controls style="width:100%;margin-bottom:15px;border-radius:8px;">
            <source src="/recording?path=${encodeURIComponent(recordingPath)}" type="audio/mpeg">
            <source src="/recording?path=${encodeURIComponent(recordingPath)}" type="audio/mp4">
            <source src="/recording?path=${encodeURIComponent(recordingPath)}" type="audio/amr">
        </audio>
        <div style="display:flex;gap:10px;justify-content:center;">
            <a href="/recording?path=${encodeURIComponent(recordingPath)}" download="${name}"
                style="background:#27ae60;color:white;padding:8px 20px;border-radius:6px;font-weight:600;text-decoration:none;display:inline-block;">
                ⬇️ Download
            </a>
            <button onclick="document.getElementById('recordingModal').remove();document.getElementById('recordingOverlay').remove();"
                style="background:#e74c3c;color:white;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-weight:600;">
                ✖ Close
            </button>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);
}
/* ======================================================
   📦 INSTALLED APPS — Full Implementation
====================================================== */
let allInstalledApps = [];
let currentAppsView  = 'list';
let currentAppsTab   = 'all';
let ctxCurrentApp    = null;

// ── Open popup ────────────────────────────────────────
function openInstalledApps(deviceId) {
    const popup = document.getElementById("installedAppsPopup");
    if (!popup) return;
    popup.style.display = "flex";

    // ✅ FIX: allDevices se directly populate karo — FM pe depend nahi
    const appsSelect = document.getElementById("appsDeviceSelect");
    if (appsSelect) {
        appsSelect.innerHTML = "";
        Object.values(allDevices).forEach(d => {
            const option = document.createElement("option");
            option.value = d.deviceId;
            option.textContent = `${d.brand || 'Unknown'} ${d.model || 'Device'} (${d.deviceId})`;
            appsSelect.appendChild(option);
        });
        if (deviceId) appsSelect.value = deviceId;
    }

    allInstalledApps = [];
    currentAppsView  = 'list';
    currentAppsTab   = 'all';
    const si = document.getElementById("appsSearchInput");
    if (si) si.value = "";
    _setAppsViewUI('list');
    showAppsTab('all');
    _updateStatsCounts(0, 0, 0);
    _clearAllContainers();

    const selectedId = appsSelect?.value || deviceId;
    if (selectedId) fetchInstalledApps(selectedId);
}

function closeInstalledApps() {
    const popup = document.getElementById("installedAppsPopup");
    if (popup) popup.style.display = "none";
    allInstalledApps = [];
    closeAppContextMenu();
}

function fetchInstalledApps(deviceId) {
    if (!deviceId) return;
    _updateStatsCounts('...','...','...');
    const tb = document.getElementById("appsTableBody");
    if (tb) tb.innerHTML = '<tr><td colspan="5" class="apps-empty-msg">&#9203; Loading apps...</td></tr>';
    socket.emit("command", { deviceId, type: "GET_INSTALLED_APPS" });
}

function refreshInstalledApps() {
    const deviceId = document.getElementById("appsDeviceSelect")?.value;
    if (deviceId) fetchInstalledApps(deviceId);
}

// ── Socket: Apps received ─────────────────────────────
socket.on("installed_apps", data => {
    const apps = data.apps || [];
    allInstalledApps = apps;
    _renderAll(apps);
});

// ── Socket: Uninstall result ──────────────────────────
socket.on("uninstall_result", data => {
    _showAppsToast(
        data.success ? `✅ Uninstall: ${data.packageName}` : `❌ ${data.message}`,
        data.success ? '#27ae60' : '#e74c3c'
    );
    if (data.success) {
        // Local list se bhi remove karo
        allInstalledApps = allInstalledApps.filter(a => a.packageName !== data.packageName);
        _renderAll(allInstalledApps);
        // ✅ Server se fresh list bhi reload karo (2s baad)
        setTimeout(() => {
            const deviceId = document.getElementById("appsDeviceSelect")?.value;
            if (deviceId) fetchInstalledApps(deviceId);
        }, 2000);
    }
});

// ── Socket: App action result ─────────────────────────
socket.on("app_action_result", data => {
    const icons = { open:'▶', disable:'🚫', enable:'✅' };
    _showAppsToast(
        `${icons[data.action]||'📱'} ${data.action}: ${data.message}`,
        data.success ? '#27ae60' : '#e74c3c'
    );
    // Disable/Enable ke baad list refresh karo
    if ((data.action === 'disable' || data.action === 'enable') && data.success) {
        const app = allInstalledApps.find(a => a.packageName === data.packageName);
        if (app) { app.isEnabled = data.action === 'enable'; _renderAll(allInstalledApps); }
    }
});

// ── Render All ────────────────────────────────────────
function _renderAll(apps) {
    const user   = apps.filter(a => !a.isSystem);
    const system = apps.filter(a =>  a.isSystem);
    _updateStatsCounts(apps.length, user.length, system.length);
    _renderListTable(apps,   "appsTableBody",       true);
    _renderListTable(user,   "userAppsTableBody",   false);
    _renderListTable(system, "systemAppsTableBody", false);
    _renderGridCards(apps,   "appsGridAll");
    _renderGridCards(user,   "appsGridUser");
    _renderGridCards(system, "appsGridSystem");
}

// ── Icon generator ────────────────────────────────────
function _makeIconEl(app, size) {
    if (app.iconBase64) {
        return `<img src="data:image/png;base64,${app.iconBase64}"
            style="width:${size}px;height:${size}px;border-radius:${Math.round(size*.22)}px;object-fit:cover;"
            onerror="this.style.display='none'" />`;
    }
    const letter = (app.appName || app.packageName || '?').charAt(0).toUpperCase();
    const userColors   = ['#2980b9','#8e44ad','#27ae60','#e67e22','#e74c3c','#16a085','#2471a3','#1abc9c','#d35400'];
    const systemColors = ['#2c3e50','#34495e','#2e4057','#1a252f','#212f3d'];
    const colors = app.isSystem ? systemColors : userColors;
    const bg  = colors[letter.charCodeAt(0) % colors.length];
    const fs  = Math.round(size * .44);
    const rad = Math.round(size * .22);
    return `<div style="width:${size}px;height:${size}px;border-radius:${rad}px;
        background:${bg};display:flex;align-items:center;justify-content:center;
        font-size:${fs}px;font-weight:700;color:#fff;flex-shrink:0;
        box-shadow:0 2px 8px rgba(0,0,0,.35);">${letter}</div>`;
}

// ── List table renderer ───────────────────────────────
function _renderListTable(apps, tbodyId, showType) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const cols = showType ? 5 : 4;
    if (!apps.length) {
        tbody.innerHTML = `<tr><td colspan="${cols}" class="apps-empty-msg">No apps found.</td></tr>`;
        return;
    }
    tbody.innerHTML = apps.map(app => {
        const name    = app.appName || app.packageName;
        const pkg     = app.packageName || 'N/A';
        const ver     = app.versionName || 'N/A';
        const icon    = _makeIconEl(app, 36);
        const safePkg = pkg.replace(/'/g,"\\'");
        const safeName= name.replace(/'/g,"\\'");
        const disabledBadge = app.isEnabled === false
            ? '<span style="margin-left:6px;padding:2px 6px;background:#c0392b33;color:#e74c3c;border-radius:3px;font-size:10px;">Disabled</span>' : '';
        const typeCell = showType
            ? `<td><span class="apps-type-badge ${app.isSystem?'badge-system':'badge-user'}">${app.isSystem?'⚙ System':'👤 User'}</span></td>`
            : '';
        return `<tr class="apps-list-row" onclick="openAppContextMenu(event,'${safePkg}','${safeName}',${!!app.isSystem})">
            <td><div class="apps-icon-cell">${icon}</div></td>
            <td class="apps-name">${name}${disabledBadge}</td>
            <td class="apps-pkg">${pkg}</td>
            <td class="apps-ver">${ver}</td>
            ${typeCell}
        </tr>`;
    }).join('');
}

// ── Grid cards renderer ───────────────────────────────
function _renderGridCards(apps, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!apps.length) { el.innerHTML = '<div class="apps-grid-empty">No apps found.</div>'; return; }
    el.innerHTML = apps.map(app => {
        const name    = app.appName || app.packageName;
        const pkg     = app.packageName || 'N/A';
        const ver     = app.versionName || 'N/A';
        const icon    = _makeIconEl(app, 52);
        const safePkg = pkg.replace(/'/g,"\\'");
        const safeName= name.replace(/'/g,"\\'");
        const badgeCls= app.isSystem ? 'badge-system' : 'badge-user';
        const disabledStyle = app.isEnabled === false ? 'opacity:.6;' : '';
        return `<div class="apps-grid-card" style="${disabledStyle}" onclick="openAppContextMenu(event,'${safePkg}','${safeName}',${!!app.isSystem})">
            <div class="apps-grid-icon-wrap">${icon}</div>
            <div class="apps-grid-name" title="${name}">${name}</div>
            <div class="apps-grid-pkg"  title="${pkg}">${pkg}</div>
            <div class="apps-grid-ver">v${ver}</div>
            <span class="apps-type-badge ${badgeCls}">${app.isSystem?'System':'User'}</span>
            ${app.isEnabled===false?'<span style="color:#e74c3c;font-size:10px;margin-top:3px;">Disabled</span>':''}
        </div>`;
    }).join('');
}

// ── Context Menu ──────────────────────────────────────
function openAppContextMenu(e, packageName, appName, isSystem) {
    e.stopPropagation();
    ctxCurrentApp = { packageName, appName, isSystem };
    document.getElementById("ctxAppName").textContent = appName;
    document.getElementById("ctxAppPkg").textContent  = packageName;
    const app = allInstalledApps.find(a => a.packageName === packageName) || { appName, packageName, isSystem };
    document.getElementById("ctxAppIcon").innerHTML   = _makeIconEl(app, 44);

    // Disabled badge in menu
    const disabledEl = document.getElementById("ctxDisabledBadge");
    if (disabledEl) disabledEl.style.display = app.isEnabled === false ? 'inline-block' : 'none';

    document.getElementById("appCtxOverlay").style.display = "block";
    const menu = document.getElementById("appContextMenu");
    menu.style.display = "block";

    // Smart position — screen edge pe nahi jaaye
    const x = Math.min(e.clientX, window.innerWidth  - 290);
    const y = Math.min(e.clientY, window.innerHeight - 280);
    menu.style.left = x + "px";
    menu.style.top  = y + "px";
}

function closeAppContextMenu() {
    document.getElementById("appContextMenu").style.display  = "none";
    document.getElementById("appCtxOverlay").style.display   = "none";
    ctxCurrentApp = null;
}

// ── App Actions ───────────────────────────────────────
function appAction(action) {
    if (!ctxCurrentApp) return;
    const { packageName, appName } = ctxCurrentApp;
    const deviceId = document.getElementById("appsDeviceSelect")?.value;
    if (!deviceId) { _showAppsToast('❌ Pehle device select karo', '#e74c3c'); return; }

    const cmdMap = { open:'OPEN_APP', uninstall:'UNINSTALL_APP', disable:'DISABLE_APP', enable:'ENABLE_APP' };
    socket.emit("command", { deviceId, type: cmdMap[action], packageName });

    const msgMap = {
        open:      `▶ "${appName}" open ho raha hai...`,
        uninstall: `🗑 "${appName}" uninstall request bheji...`,
        disable:   `🚫 "${appName}" disable ho raha hai...`,
        enable:    `✅ "${appName}" enable ho raha hai...`
    };
    _showAppsToast(msgMap[action], '#3498db');
    closeAppContextMenu();
}

// ── View & Tab switchers ──────────────────────────────
function switchAppsView(view) {
    currentAppsView = view;
    _setAppsViewUI(view);
    _applyGridTab(currentAppsTab);
}

function _setAppsViewUI(view) {
    const isGrid = view === 'grid';
    const lv = document.getElementById("appsListView");
    const gv = document.getElementById("appsGridView");
    const lb = document.getElementById("appsListViewBtn");
    const gb = document.getElementById("appsGridViewBtn");
    if (lv) lv.style.display = isGrid ? "none" : "block";
    if (gv) gv.style.display = isGrid ? "block" : "none";
    if (lb) lb.classList.toggle("active", !isGrid);
    if (gb) gb.classList.toggle("active",  isGrid);
}

function showAppsTab(tab) {
    currentAppsTab = tab;
    const listMap = { all:'appsAllTab', user:'appsUserTab', system:'appsSystemTab' };
    Object.values(listMap).forEach(id => { const el=document.getElementById(id); if(el) el.style.display="none"; });
    const al = document.getElementById(listMap[tab]);
    if (al) al.style.display = "block";
    _applyGridTab(tab);
    document.querySelectorAll("#installedAppsPopup .tab-btn").forEach(btn => {
        btn.classList.toggle("active", !!btn.getAttribute("onclick")?.includes(`'${tab}'`));
    });
}

function _applyGridTab(tab) {
    const gm = { all:'appsGridAll', user:'appsGridUser', system:'appsGridSystem' };
    Object.values(gm).forEach(id => { const el=document.getElementById(id); if(el) el.style.display="none"; });
    const ag = document.getElementById(gm[tab]);
    if (ag) ag.style.display = "flex";
}

// ── Search ────────────────────────────────────────────
function filterApps(q) {
    const ql = (q||'').toLowerCase();
    const filtered = allInstalledApps.filter(a =>
        (a.appName||'').toLowerCase().includes(ql) ||
        (a.packageName||'').toLowerCase().includes(ql)
    );
    _renderAll(filtered);
}

// ── Helpers ───────────────────────────────────────────
function _updateStatsCounts(t, u, s) {
    ['totalAppsCount','userAppsCount','systemAppsCount'].forEach((id,i) => {
        const el = document.getElementById(id);
        if (el) el.textContent = [t,u,s][i];
    });
}

function _clearAllContainers() {
    const tb = document.getElementById("appsTableBody");
    if (tb) tb.innerHTML = '<tr><td colspan="5" class="apps-empty-msg">Select a device...</td></tr>';
    ['userAppsTableBody','systemAppsTableBody'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<tr><td colspan="4" class="apps-empty-msg">No apps.</td></tr>';
    });
    ['appsGridAll','appsGridUser','appsGridSystem'].forEach(id => {
        const el = document.getElementById(id); if(el) el.innerHTML='';
    });
}

function _showAppsToast(msg, color) {
    const old = document.getElementById("appsToast");
    if (old) old.remove();
    const t = document.createElement("div");
    t.id = "appsToast";
    t.textContent = msg;
    t.style.cssText = `position:fixed;bottom:30px;left:50%;transform:translateX(-50%);
        background:${color||'#3498db'};color:#fff;padding:12px 24px;border-radius:8px;
        font-weight:600;font-size:14px;z-index:999999;box-shadow:0 4px 16px rgba(0,0,0,.4);
        pointer-events:none;transition:opacity .3s;`;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 3000);
}


/* ======================================================
   💬 SMS POPUP — script.js ke SABSE NEECHE add karo
====================================================== */

let allSmsThreads     = [];
let currentSmsContact = null;

/* ── Open SMS Popup ── */
function openSmsPopup(deviceId) {
    if (!deviceId) {
        alert("⚠️ Koi device select nahi hua!");
        return;
    }

    if (typeof closeActionPopup === "function") closeActionPopup();

    const popup = document.getElementById("smsPopup");
    if (!popup) {
        console.error("❌ #smsPopup element HTML mein nahi mila!");
        return;
    }

    popup.style.display = "flex";

    // Device selector populate karo
    const sel = document.getElementById("smsDeviceSelect");
    if (sel) {
        sel.innerHTML = "";
        Object.values(allDevices).forEach(d => {
            const opt       = document.createElement("option");
            opt.value       = d.deviceId;
            opt.textContent = `${d.brand || 'Unknown'} ${d.model || 'Device'}`;
            sel.appendChild(opt);
        });
        sel.value = deviceId;
    }

    // UI reset
    allSmsThreads     = [];
    currentSmsContact = null;

    const searchEl = document.getElementById("smsSearchInput");
    if (searchEl) searchEl.value = "";

    _resetSmsRightPanel();

    const listEl = document.getElementById("smsThreadList");
    if (listEl) {
        listEl.innerHTML = `
            <div class="sms-loading">
                <div class="loading-spinner"></div>
                <p>Loading messages...</p>
            </div>`;
    }

    // Android ko command bhejo
    sendCmd(deviceId, "FETCH_SMS");
}

/* ── Close SMS Popup ── */
function closeSmsPopup() {
    const popup = document.getElementById("smsPopup");
    if (popup) popup.style.display = "none";
    allSmsThreads     = [];
    currentSmsContact = null;
}

/* ── Fetch SMS from device ── */
function fetchSms(deviceId) {
    if (!deviceId) return;
    const listEl = document.getElementById("smsThreadList");
    if (listEl) {
        listEl.innerHTML = `
            <div class="sms-loading">
                <div class="loading-spinner"></div>
                <p>Loading...</p>
            </div>`;
    }
    sendCmd(deviceId, "FETCH_SMS");
}

/* ── Receive SMS data from Android ── */
socket.on("sms_data", data => {
// ✅ Sahi — server data.threads bhejta hai
    console.log("💬 SMS data received:", data.threads?.length || 0, "messages");
    const threads = data.threads || [];
    allSmsThreads = threads;

    renderSmsThreadList(threads);

    if (currentSmsContact) {
        const updated = threads.find(t => t.address === currentSmsContact.address);
        if (updated) selectSmsThread(updated);
    }
});

/* ── Render Thread List (left panel) ── */
function renderSmsThreadList(threads) {
    const list = document.getElementById("smsThreadList");
    if (!list) return;

    if (threads.length === 0) {
        list.innerHTML = `<div class="sms-empty"><p>📭 No SMS found</p></div>`;
        return;
    }

    list.innerHTML = threads.map((thread, idx) => {
        const name       = thread.name || thread.address || "Unknown";
        const initials   = _smsInitials(name);
        const color      = _smsAvatarColor(name);
        const preview    = (thread.lastMessage || "").substring(0, 46)
                           + ((thread.lastMessage || "").length > 46 ? "…" : "");
        const dateStr    = _smsFormatDate(thread.date);
        const unread     = thread.unreadCount || 0;
        const isActive   = currentSmsContact && currentSmsContact.address === thread.address;

        return `
        <div class="sms-thread-item ${isActive ? 'active' : ''}"
             onclick="selectSmsThread(${idx})">
            <div class="sms-thread-avatar" style="background:${color}">${initials}</div>
            <div class="sms-thread-content">
                <div class="sms-thread-top">
                    <span class="sms-thread-name">${_escHtml(name)}</span>
                    <span class="sms-thread-date">${dateStr}</span>
                </div>
                <div class="sms-thread-bottom">
                    <span class="sms-thread-preview">${_escHtml(preview) || 'No messages'}</span>
                    ${unread > 0 ? `<span class="sms-unread-badge">${unread}</span>` : ''}
                </div>
            </div>
        </div>`;
    }).join("");
}

/* ── Select a Thread → show messages (right panel) ── */
function selectSmsThread(indexOrThread) {
    const thread = typeof indexOrThread === 'number'
        ? allSmsThreads[indexOrThread]
        : indexOrThread;

    if (!thread) return;
    currentSmsContact = thread;

    document.querySelectorAll(".sms-thread-item").forEach((item, i) => {
        item.classList.toggle("active", allSmsThreads[i]?.address === thread.address);
    });

    const name     = thread.name || thread.address || "Unknown";
    const initials = _smsInitials(name);
    const color    = _smsAvatarColor(name);

    const avatarEl = document.getElementById("smsChatAvatar");
    if (avatarEl) {
        avatarEl.style.background = color;
        avatarEl.textContent      = initials;
    }

    const nameEl = document.getElementById("smsChatName");
    if (nameEl) nameEl.textContent = name;

    const numEl = document.getElementById("smsChatNumber");
    if (numEl) numEl.textContent = thread.address || "";

    const headerEl = document.getElementById("smsChatHeader");
    const noChatEl = document.getElementById("smsNoChat");
    const areaEl   = document.getElementById("smsMessagesArea");

    if (headerEl) headerEl.style.display = "flex";
    if (noChatEl) noChatEl.style.display = "none";
    if (areaEl)   areaEl.style.display   = "flex";

    renderSmsMessages(thread.messages || []);
}

/* ── Render chat bubbles (right panel) ── */
function renderSmsMessages(messages) {
    const area = document.getElementById("smsMessagesArea");
    if (!area) return;

    if (messages.length === 0) {
        area.innerHTML = `<div class="sms-no-messages"><p>📭 No messages in this conversation</p></div>`;
        return;
    }

    const grouped = {};
    messages.forEach(msg => {
        const ts      = typeof msg.date === 'number' ? msg.date : parseInt(msg.date);
        const dateObj = new Date(ts);
        const key     = _smsDayLabel(dateObj);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(msg);
    });

    let html = "";

    Object.keys(grouped).forEach(dateKey => {
        html += `<div class="sms-date-separator"><span>${dateKey}</span></div>`;

        grouped[dateKey].forEach(msg => {
            const isSent = msg.type === 2;       // 1 = received, 2 = sent
            const time   = _smsFormatTime(msg.date);
            const body   = _escHtml(msg.body || "").replace(/\n/g, "<br>");

            html += `
            <div class="sms-bubble-wrap ${isSent ? 'sent' : 'received'}">
                <div class="sms-bubble ${isSent ? 'sms-bubble-sent' : 'sms-bubble-received'}">
                    <div class="sms-bubble-body">${body}</div>
                    <div class="sms-bubble-time">${time}</div>
                </div>
            </div>`;
        });
    });

    area.innerHTML = html;
    area.scrollTop = area.scrollHeight;
}

/* ── Search threads ── */
function filterSmsThreads(query) {
    if (!query) {
        renderSmsThreadList(allSmsThreads);
        return;
    }
    const q        = query.toLowerCase();
    const filtered = allSmsThreads.filter(t =>
        (t.name       || "").toLowerCase().includes(q) ||
        (t.address    || "").toLowerCase().includes(q) ||
        (t.lastMessage|| "").toLowerCase().includes(q)
    );
    renderSmsThreadList(filtered);
}

/* ── Refresh current ── */
function refreshSmsCurrent() {
    const deviceId = document.getElementById("smsDeviceSelect")?.value;
    if (deviceId) fetchSms(deviceId);
}

/* ── Reset right panel to "no chat" state ── */
function _resetSmsRightPanel() {
    const header  = document.getElementById("smsChatHeader");
    const msgArea = document.getElementById("smsMessagesArea");
    const noChat  = document.getElementById("smsNoChat");
    if (header)  header.style.display   = "none";
    if (msgArea) msgArea.style.display  = "none";
    if (noChat)  noChat.style.display   = "flex";
}

/* ======================================================
   💬 SMS Helper Functions
====================================================== */

function _smsInitials(name) {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
}

function _smsAvatarColor(name) {
    const colors = [
        '#2980b9','#8e44ad','#27ae60','#e67e22',
        '#e74c3c','#16a085','#2471a3','#1abc9c',
        '#d35400','#7f8c8d','#c0392b','#2c3e50',
        '#0097a7','#6d4c41','#455a64'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
    return colors[Math.abs(hash) % colors.length];
}

function _smsFormatDate(timestamp) {
    if (!timestamp) return "";
    const date = new Date(typeof timestamp === 'number' ? timestamp : parseInt(timestamp));
    const now  = new Date();
    const diff = now - date;
    if (diff < 86400000)   return date.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true });
    if (diff < 604800000)  return date.toLocaleDateString('en-US', { weekday:'short' });
    return date.toLocaleDateString('en-US', { month:'short', day:'numeric' });
}

function _smsFormatTime(timestamp) {
    if (!timestamp) return "";
    const date = new Date(typeof timestamp === 'number' ? timestamp : parseInt(timestamp));
    return date.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true });
}

function _smsDayLabel(dateObj) {
    const now    = new Date();
    const today  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const diff   = today - msgDay;

    if (diff === 0)        return "Today";
    if (diff === 86400000) return "Yesterday";
    return dateObj.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
}

function _escHtml(str) {
    return (str || "")
        .replace(/&/g,  "&amp;")
        .replace(/</g,  "&lt;")
        .replace(/>/g,  "&gt;")
        .replace(/"/g,  "&quot;");
}



function toggleSmsFullscreen() {
    const leftPanel = document.getElementById("smsLeftPanel");
    const btn       = document.getElementById("smsToggleBtn");
    const icon      = btn.querySelector(".btn-icon");

    smsIsFullscreen = !smsIsFullscreen;

    if (smsIsFullscreen) {
        leftPanel.classList.add("sms-panel-hidden");
        btn.classList.add("panel-hidden");
        icon.style.opacity = "0";
        setTimeout(() => {
            icon.textContent = "☰";
            icon.style.opacity = "1";
        }, 150);
    } else {
        leftPanel.classList.remove("sms-panel-hidden");
        btn.classList.remove("panel-hidden");
        icon.style.opacity = "0";
        setTimeout(() => {
            icon.textContent = "✖";
            icon.style.opacity = "1";
        }, 150);
    }
}


function sendPhoneCommand(type) {
    if (!currentActiveDeviceId) {
        alert("⚠️ Koi device select nahi hai");
        return;
    }
    socket.emit("command", {
        type: type,
        deviceId: currentActiveDeviceId
    });
    console.log(`📱 ${type} command bheja → Device: ${currentActiveDeviceId}`);
}
