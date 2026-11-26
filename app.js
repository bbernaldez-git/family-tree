// ==========================================
// 1. CONFIGURATION
// ==========================================
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxQRbL_WevS3ADoG6qsbB3DtetAWBAh1Lt4K17IFeOIh2KdsTkJiOVW5ZcdXnPw_1hIcA/exec",
  CLOUDINARY_CLOUD_NAME: "YOUR_CLOUDINARY_CLOUD_NAME",
  CLOUDINARY_UPLOAD_PRESET: "family_tree_unsigned",
  FAMILY_NAME: "Bernaldez Family Tree"
};

let allMembers = [];
let selectedRole = "Descendant";
let currentZoom = 1;
let viewerId = localStorage.getItem("family_tree_me_id") || "";

// ==========================================
// 2. INITIALIZATION & DATA FETCHING
// ==========================================
window.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("header-title").textContent = CONFIG.FAMILY_NAME;
  await fetchMembers();

  // Auto-open form if scanned via QR (?action=join)
  const params = new URLSearchParams(window.location.search);
  if (params.get("action") === "join") {
    openJoinForm();
  }
});

async function fetchMembers() {
  try {
    const res = await fetch(CONFIG.APPS_SCRIPT_URL);
    const data = await res.json();
    allMembers = data.members || [];
    renderTree();
    populateFormHelpers();
    generateDidYouKnow();
  } catch (err) {
    console.error(err);
    alert("Could not load family tree. Check your Apps Script deployment.");
  } finally {
    document.getElementById("loader").style.display = "none";
  }
}

// ==========================================
// 3. TREE RENDERING ENGINE
// ==========================================
function renderTree() {
  const container = document.getElementById("tree-root");
  if (!allMembers.length) {
    container.innerHTML = "<p style='padding:40px; color:var(--muted);'>No members yet. Tap '+ Join Tree' to start!</p>";
    return;
  }

  const roots = allMembers.filter(m => m.Role === "Root" || !m.RelatedToID);
  const html = `<ul>${roots.map(root => buildBranchHTML(root)).join("")}</ul>`;
  container.innerHTML = html;
}

function buildBranchHTML(person) {
  const spouses = allMembers.filter(m => m.Role === "Spouse" && m.RelatedToID === person.MemberID);
  const parentIds = [person.MemberID, ...spouses.map(s => s.MemberID)];
  const children = allMembers
    .filter(m => m.Role === "Descendant" && parentIds.includes(m.RelatedToID))
    .sort((a, b) => (a.BirthDate || "9999").localeCompare(b.BirthDate || "9999"));

  let nodeHTML = `<div class="couple-group">`;
  nodeHTML += buildCardHTML(person);
  spouses.forEach(sp => {
    nodeHTML += `<div class="couple-link"></div>` + buildCardHTML(sp);
  });
  nodeHTML += `</div>`;

  let childrenHTML = "";
  if (children.length > 0) {
    childrenHTML = `<ul>${children.map(child => buildBranchHTML(child)).join("")}</ul>`;
  }

  return `<li>${nodeHTML}${childrenHTML}</li>`;
}

function getInitials(name) {
  return (name || "?")
    .trim()
    .split(/\s+/)
    .map(part => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function buildCardHTML(m) {
  const initials = getInitials(m.FullName);
  const avatar = m.PhotoURL
    ? `<img src="${m.PhotoURL}" class="avatar" alt="${m.FullName}" />`
    : `<div class="avatar">${initials}</div>`;
  const isMe = m.MemberID === viewerId;

  return `
    <div class="member-card ${isMe ? 'is-me' : ''}" id="node-${m.MemberID}" onclick="openProfile('${m.MemberID}')">
      ${isMe ? '<span class="me-badge">You</span>' : ''}
      ${avatar}
      <div class="card-name">${m.FullName}</div>
      ${m.Nickname ? `<div class="card-nickname">${m.Nickname}</div>` : ''}
    </div>
  `;
}

// ==========================================
// 4. "DID YOU KNOW?" FUN FACT ENGINE
// ==========================================
function generateDidYouKnow() {
  const banner = document.getElementById("dyk-banner");
  const textEl = document.getElementById("dyk-text");
  if (allMembers.length < 2) return;

  const me = allMembers.find(m => m.MemberID === viewerId);
  const facts = [];

  const extractTags = (m) => {
    const list = [];
    (m.Sports || "").split(",").forEach(s => { if (s.trim()) list.push({ type: "sport", val: s.trim() }); });
    (m.Hobbies || "").split(",").forEach(h => { if (h.trim()) list.push({ type: "hobby", val: h.trim() }); });
    if (m.Occupation && m.Occupation.trim()) list.push({ type: "occupation", val: m.Occupation.trim() });
    if (m.City && m.City.trim()) list.push({ type: "city", val: m.City.trim() });
    return list;
  };

  const formatSentence = (personA, personB, match, isViewer) => {
    const relLabel = isViewer ? getRelationshipLabel(personA, personB) : "";
    const prefix = isViewer
      ? `<strong>Did you know?</strong> You and ${relLabel ? `your ${relLabel}, ` : ""}<strong>${personB.FullName}</strong>`
      : `<strong>Did you know?</strong> <strong>${personA.FullName}</strong> and <strong>${personB.FullName}</strong>`;

    let action = "";
    if (match.type === "sport") action = `both play <strong>${match.val}</strong>!`;
    if (match.type === "hobby") action = `both enjoy <strong>${match.val}</strong>!`;
    if (match.type === "occupation") action = `are both in <strong>${match.val}</strong>!`;
    if (match.type === "city") action = `both live in <strong>${match.val}</strong>!`;

    return `${prefix} ${action} <span class="dyk-link" onclick="focusMember('${personB.MemberID}')">View ${personB.Nickname || personB.FullName}'s Profile →</span>`;
  };

  const sourceList = me ? [me] : allMembers;
  sourceList.forEach(pA => {
    const tagsA = extractTags(pA);
    allMembers.forEach(pB => {
      if (pA.MemberID === pB.MemberID) return;
      const tagsB = extractTags(pB);
      tagsA.forEach(tA => {
        if (tagsB.some(tB => tB.type === tA.type && tB.val.toLowerCase() === tA.val.toLowerCase())) {
          facts.push(formatSentence(pA, pB, tA, Boolean(me)));
        }
      });
    });
  });

  if (facts.length > 0) {
    const randomFact = facts[Math.floor(Math.random() * facts.length)];
    textEl.innerHTML = randomFact;
    banner.style.display = "flex";
  } else {
    banner.style.display = "none";
  }
}

function getRelationshipLabel(me, other) {
  const getParent = (id) => {
    const m = allMembers.find(x => x.MemberID === id);
    if (!m) return null;
    if (m.Role === "Descendant") return m.RelatedToID;
    if (m.Role === "Spouse") {
      const partner = allMembers.find(x => x.MemberID === m.RelatedToID);
      return partner ? partner.RelatedToID : null;
    }
    return null;
  };

  const myParent = getParent(me.MemberID);
  const otherParent = getParent(other.MemberID);
  const myGrandparent = myParent ? getParent(myParent) : null;
  const otherGrandparent = otherParent ? getParent(otherParent) : null;

  if (myParent && myParent === other.MemberID) return other.Gender === "Female" ? "Mom" : "Dad";
  if (otherParent && otherParent === me.MemberID) return other.Gender === "Female" ? "Daughter" : "Son";
  if (myParent && myParent === otherParent) return other.Gender === "Female" ? "Sister" : "Brother";
  if (myGrandparent && myGrandparent === otherParent) return other.Gender === "Female" ? "Tita / Aunt" : "Tito / Uncle";
  if (myGrandparent && myGrandparent === otherGrandparent) return "Cousin";
  return "relative";
}

// ==========================================
// 5. PROFILE DRAWER & NAVIGATION
// ==========================================
function focusMember(memberId) {
  const node = document.getElementById(`node-${memberId}`);
  if (node) {
    document.querySelectorAll(".member-card").forEach(c => c.classList.remove("highlighted"));
    node.classList.add("highlighted");
    node.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }
  openProfile(memberId);
}

function openProfile(memberId) {
  const m = allMembers.find(x => x.MemberID === memberId);
  if (!m) return;

  const initials = getInitials(m.FullName);
  const avatar = m.PhotoURL
    ? `<img src="${m.PhotoURL}" class="profile-avatar" alt="${m.FullName}" />`
    : `<div class="profile-avatar">${initials}</div>`;

  let socials = {};
  try { socials = JSON.parse(m.Socials || "{}"); } catch (e) {}

  const hobbies = (m.Hobbies || "").split(",").map(s => s.trim()).filter(Boolean);
  const sports = (m.Sports || "").split(",").map(s => s.trim()).filter(Boolean);
  const isMe = m.MemberID === viewerId;

  let html = `
    <button class="close-drawer" onclick="document.getElementById('profile-overlay').style.display='none'">×</button>
    <div class="profile-header">
      ${avatar}
      <div class="profile-title">
        <h2>${m.FullName}</h2>
        ${m.Nickname ? `<div class="profile-sub">${m.Nickname}</div>` : ''}
        <div class="profile-meta">
          ${m.Occupation || ''}
          ${m.City ? `<br/>📍 ${m.City}` : ''}
        </div>
      </div>
    </div>

    <div class="action-row">
      ${m.Phone ? `<a href="tel:${m.Phone}" class="action-pill">📞 Call</a><a href="sms:${m.Phone}" class="action-pill">💬 SMS</a>` : ''}
      ${m.Email ? `<a href="mailto:${m.Email}" class="action-pill">✉️ Email</a>` : ''}
      <button class="action-pill" style="background:${isMe ? 'var(--accent-bg)' : 'var(--primary-light)'}; color:var(--primary);" onclick="setAsMe('${m.MemberID}')">
        ${isMe ? '★ Viewing as You' : '👤 This is me'}
      </button>
    </div>
  `;

  if (hobbies.length) {
    html += `<div class="section-label">Hobbies</div><div class="tag-list">${hobbies.map(h => `<span class="tag">${h}</span>`).join("")}</div>`;
  }
  if (sports.length) {
    html += `<div class="section-label">Sports</div><div class="tag-list">${sports.map(s => `<span class="tag">${s}</span>`).join("")}</div>`;
  }
  if (socials.fb || socials.ig) {
    html += `<div class="section-label">Social Profiles</div><div class="action-row">`;
    if (socials.fb) {
      const fbUrl = socials.fb.startsWith("http") ? socials.fb : `https://facebook.com/${socials.fb.replace(/^@/, "")}`;
      html += `<a href="${fbUrl}" target="_blank" class="action-pill">Facebook: ${socials.fb}</a>`;
    }
    if (socials.ig) {
      const igUrl = socials.ig.startsWith("http") ? socials.ig : `https://instagram.com/${socials.ig.replace(/^@/, "")}`;
      html += `<a href="${igUrl}" target="_blank" class="action-pill">Instagram: ${socials.ig}</a>`;
    }
    html += `</div>`;
  }

  document.getElementById("profile-drawer-content").innerHTML = html;
  document.getElementById("profile-overlay").style.display = "flex";
}

function setAsMe(memberId) {
  viewerId = memberId;
  localStorage.setItem("family_tree_me_id", memberId);
  renderTree();
  generateDidYouKnow();
  openProfile(memberId);
}

// ==========================================
// 6. SINGLE-QR FORM & CLOUDINARY UPLOAD
// ==========================================
function openJoinForm() {
  document.getElementById("form-overlay").style.display = "flex";
  filterRelativeDropdown("");
}

function setRole(role) {
  selectedRole = role;
  document.getElementById("btn-role-child").classList.toggle("active", role === "Descendant");
  document.getElementById("btn-role-spouse").classList.toggle("active", role === "Spouse");
  document.getElementById("relation-label").textContent =
    role === "Descendant"
      ? "Who is your Parent in this family? *"
      : "Who is your Spouse / Partner in this family? *";
}

function filterRelativeDropdown(query) {
  const select = document.getElementById("RelatedToID");
  const q = query.toLowerCase();
  const filtered = allMembers.filter(m =>
    m.FullName.toLowerCase().includes(q) || (m.Nickname || "").toLowerCase().includes(q)
  );
  select.innerHTML = filtered.map(m =>
    `<option value="${m.MemberID}">${m.FullName} ${m.Nickname ? `(${m.Nickname})` : ''}</option>`
  ).join("");
}

function populateFormHelpers() {
  const collectUnique = (field) => {
    const set = new Set();
    allMembers.forEach(m => (m[field] || "").split(",").forEach(v => { if (v.trim()) set.add(v.trim()); }));
    return Array.from(set).slice(0, 8);
  };

  const renderChips = (elId, inputId, items) => {
    document.getElementById(elId).innerHTML = items.map(item =>
      `<button type="button" class="chip-btn" onclick="appendTag('${inputId}', '${item.replace(/'/g, "\\'")}')">+ ${item}</button>`
    ).join("");
  };

  renderChips("hobby-chips", "Hobbies", collectUnique("Hobbies"));
  renderChips("sport-chips", "Sports", collectUnique("Sports"));
}

function appendTag(inputId, val) {
  const input = document.getElementById(inputId);
  const existing = input.value.split(",").map(s => s.trim()).filter(Boolean);
  if (!existing.some(e => e.toLowerCase() === val.toLowerCase())) {
    existing.push(val);
    input.value = existing.join(", ");
  }
}

async function uploadToCloudinary(file) {
  if (!file || CONFIG.CLOUDINARY_CLOUD_NAME === "YOUR_CLOUDINARY_CLOUD_NAME") return "";
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CONFIG.CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CONFIG.CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: formData
  });
  const data = await res.json();
  return data.secure_url || "";
}

async function submitMember(e) {
  e.preventDefault();
  const btn = document.getElementById("submit-btn");
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    const fileInput = document.getElementById("PhotoFile");
    const photoUrl = fileInput.files && fileInput.files[0] ? await uploadToCloudinary(fileInput.files[0]) : "";

    const payload = {
      Role: selectedRole,
      RelatedToID: document.getElementById("RelatedToID").value,
      FullName: document.getElementById("FullName").value.trim(),
      Nickname: document.getElementById("Nickname").value.trim(),
      Gender: document.getElementById("Gender").value,
      BirthDate: document.getElementById("BirthDate").value,
      PhotoURL: photoUrl,
      Occupation: document.getElementById("Occupation").value.trim(),
      Hobbies: document.getElementById("Hobbies").value.trim(),
      Sports: document.getElementById("Sports").value.trim(),
      Phone: document.getElementById("Phone").value.trim(),
      Email: document.getElementById("Email").value.trim(),
      City: document.getElementById("City").value.trim(),
      Socials: {
        fb: document.getElementById("SocialFB").value.trim(),
        ig: document.getElementById("SocialIG").value.trim()
      }
    };

    const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.status === "success") {
      viewerId = result.memberId;
      localStorage.setItem("family_tree_me_id", viewerId);
      document.getElementById("join-form").reset();
      document.getElementById("form-overlay").style.display = "none";
      await fetchMembers();
      focusMember(viewerId);
    } else {
      alert("Error: " + result.message);
    }
  } catch (err) {
    console.error(err);
    alert("Submission failed. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "✓ Save to Family Tree";
  }
}

// ==========================================
// 7. SEARCH, ZOOM & QR MODAL
// ==========================================
function handleSearch(query) {
  const box = document.getElementById("search-results");
  const q = query.trim().toLowerCase();
  if (!q) {
    box.style.display = "none";
    return;
  }

  const matches = allMembers.filter(m =>
    [m.FullName, m.Nickname, m.Occupation, m.Hobbies, m.Sports, m.City]
      .some(field => (field || "").toLowerCase().includes(q))
  );

  box.innerHTML = matches.length
    ? matches.map(m => `<div class="search-item" onclick="selectSearch('${m.MemberID}')"><strong>${m.FullName}</strong> ${m.Nickname ? `(${m.Nickname})` : ''} <span style="color:var(--muted); font-size:0.75rem;">${m.Occupation || ''}</span></div>`).join("")
    : `<div class="search-item" style="color:var(--muted);">No matches found</div>`;
  box.style.display = "block";
}

function selectSearch(id) {
  document.getElementById("search-results").style.display = "none";
  document.getElementById("search-input").value = "";
  focusMember(id);
}

function adjustZoom(delta) {
  currentZoom = Math.min(Math.max(0.45, currentZoom + delta), 1.6);
  document.getElementById("tree-canvas").style.transform = `scale(${currentZoom})`;
}

function openQrModal() {
  const qrBox = document.getElementById("qrcode-box");
  qrBox.innerHTML = "";
  const joinUrl = `${window.location.origin}${window.location.pathname}?action=join`;
  new QRCode(qrBox, { text: joinUrl, width: 200, height: 200, colorDark: "#2f5233", colorLight: "#ffffff" });
  document.getElementById("qr-overlay").style.display = "flex";
}

function closeOverlay(e, id) {
  if (e.target.id === id) document.getElementById(id).style.display = "none";
}
