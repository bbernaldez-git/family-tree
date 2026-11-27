// ==========================================
// 1. CONFIGURATION
// ==========================================
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycby8PGeCBC9JQLAX1Gh0fqOv5NSWd_oBHZ9fojJERZ0vp-4oFKUYHlmWDSfuuV_9a0YNgg/exec",
  CLOUDINARY_CLOUD_NAME: "di1fg6nu",
  CLOUDINARY_UPLOAD_PRESET: "family_tree_unsigned",
  FAMILY_NAME: "Bernaldez Family Tree"
};

const LINEAGE_BRANCHES = [
  "Crispin Bernaldez",
  "David Bernaldez",
  "Wenifreda Moral",
  "Oscar Bernaldez",
  "Joe Bernaldez",
  "Josephine Hermosura",
  "Edwin Bernaldez",
  "Maria Esta",
  "Vilma Dela Cruz"
];

const MOTHER_MEMBER_ID = "P004";
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.2;

let allMembers = [];
let selectedRole = "Descendant";
let currentZoom = 1;
let hasUserAdjustedZoom = false;
let viewerId = localStorage.getItem("family_tree_me_id") || "";
let viewerBranch = localStorage.getItem("family_tree_branch") || "";
let authenticatedMemberId = sessionStorage.getItem("family_tree_auth_id") || "";
let authenticatedPin = sessionStorage.getItem("family_tree_auth_pin") || "";
let adminPasscode = sessionStorage.getItem("family_tree_admin_code") || "";

// ==========================================
// 2. INITIALIZATION, AUTH & DATA FETCHING
// ==========================================
window.addEventListener("DOMContentLoaded", async () => {
  const titleEl = document.getElementById("header-title");
  if (titleEl) titleEl.textContent = CONFIG.FAMILY_NAME;
  ensureAuthButtonsExist();
  ensureJoinPinFieldExists();
  await fetchMembers();
  refreshAuthButtons();

  const params = new URLSearchParams(window.location.search);
  if (params.get("action") === "join") {
    openJoinForm(true);
  }
});

function ensureAuthButtonsExist() {
  const header = document.querySelector("header") || document.body;

  if (!document.getElementById("profile-login-btn")) {
    const loginBtn = document.createElement("button");
    loginBtn.id = "profile-login-btn";
    loginBtn.type = "button";
    loginBtn.style.marginLeft = "auto";
    loginBtn.style.padding = "6px 10px";
    loginBtn.style.borderRadius = "8px";
    loginBtn.style.border = "1px solid #cbd5e1";
    loginBtn.style.background = "#ffffff";
    loginBtn.style.cursor = "pointer";
    loginBtn.style.fontSize = "0.82rem";
    loginBtn.onclick = openProfileLoginModal;
    header.appendChild(loginBtn);
  }

  if (!document.getElementById("admin-login-btn")) {
    const adminBtn = document.createElement("button");
    adminBtn.id = "admin-login-btn";
    adminBtn.type = "button";
    adminBtn.style.marginLeft = "6px";
    adminBtn.style.padding = "6px 10px";
    adminBtn.style.borderRadius = "8px";
    adminBtn.style.border = "1px solid #cbd5e1";
    adminBtn.style.background = "#ffffff";
    adminBtn.style.cursor = "pointer";
    adminBtn.style.fontSize = "0.82rem";
    adminBtn.onclick = handleAdminLoginClick;
    header.appendChild(adminBtn);
  }

  refreshAuthButtons();
}

function refreshAuthButtons() {
  const loginBtn = document.getElementById("profile-login-btn");
  if (loginBtn) {
    const loggedInMember = allMembers.find(m => m.MemberID === authenticatedMemberId);
    loginBtn.textContent = loggedInMember
      ? `👤 ${loggedInMember.Nickname || loggedInMember.FullName}`
      : "🔑 Profile Login";
  }

  const adminBtn = document.getElementById("admin-login-btn");
  if (adminBtn) {
    adminBtn.textContent = adminPasscode ? "🔓 Admin (Active)" : "🔐 Admin Login";
  }
}

async function handleAdminLoginClick() {
  if (adminPasscode) {
    const logout = confirm("Admin mode is currently active. Log out of Admin mode?");
    if (logout) {
      adminPasscode = "";
      sessionStorage.removeItem("family_tree_admin_code");
      refreshAuthButtons();
    }
    return;
  }

  const code = prompt("Enter Admin Passcode:");
  if (!code) return;

  try {
    const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "adminLogin", AdminPasscode: code.trim() })
    });
    const result = await res.json();
    if (result.status !== "success") {
      alert(result.message || "Invalid admin passcode.");
      return;
    }
    adminPasscode = code.trim();
    sessionStorage.setItem("family_tree_admin_code", adminPasscode);
    refreshAuthButtons();
    alert("Admin mode enabled. You now have full edit control across all profiles.");
  } catch (err) {
    console.error(err);
    alert("Could not verify admin passcode.");
  }
}

function ensureProfileLoginModalExists() {
  if (document.getElementById("profile-login-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "profile-login-overlay";
  overlay.style.cssText = [
    "display:none",
    "position:fixed",
    "inset:0",
    "background:rgba(15,23,42,0.5)",
    "align-items:center",
    "justify-content:center",
    "z-index:2000",
    "padding:16px"
  ].join(";");

  overlay.addEventListener("click", (e) => {
    if (e.target.id === "profile-login-overlay") closeProfileLoginModal();
  });

  overlay.innerHTML = `
    <div style="background:#ffffff; width:100%; max-width:380px; border-radius:14px; padding:20px; box-shadow:0 16px 40px rgba(0,0,0,0.18);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <h3 style="margin:0; font-size:1.05rem;">Log In to Your Profile</h3>
        <button type="button" onclick="closeProfileLoginModal()" style="border:none; background:none; font-size:1.3rem; cursor:pointer;">×</button>
      </div>
      <p style="margin:0 0 14px; font-size:0.85rem; color:#64748b;">
        Select your profile and enter your PIN to edit your own details.
      </p>

      <form id="profile-login-form" onsubmit="submitProfileLogin(event)">
        <label style="display:block; font-size:0.82rem; font-weight:600; margin-bottom:4px;">Find Your Name</label>
        <input
          type="text"
          id="login-name-filter"
          placeholder="Type name or nickname..."
          oninput="populateLoginMemberSelect(this.value)"
          style="width:100%; padding:8px 10px; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box;"
        />

        <label style="display:block; font-size:0.82rem; font-weight:600; margin-bottom:4px;">Select Profile *</label>
        <select
          id="login-member-select"
          required
          style="width:100%; padding:8px 10px; margin-bottom:12px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box;"
        ></select>

        <label style="display:block; font-size:0.82rem; font-weight:600; margin-bottom:4px;">Your PIN *</label>
        <input
          type="password"
          id="login-pin-input"
          inputmode="numeric"
          autocomplete="current-password"
          placeholder="Enter your PIN"
          required
          style="width:100%; padding:8px 10px; margin-bottom:14px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box;"
        />

        <div id="login-error-msg" style="color:#dc2626; font-size:0.82rem; margin-bottom:10px; display:none;"></div>

        <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
          ${authenticatedMemberId
            ? `<button type="button" onclick="logoutProfileSession()" style="padding:8px 12px; border-radius:8px; border:1px solid #fca5a5; background:#fef2f2; color:#b91c1c; cursor:pointer;">Log Out</button>`
            : ""
          }
          <button type="button" onclick="closeProfileLoginModal()" style="padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1; background:#f8fafc; cursor:pointer;">Cancel</button>
          <button type="submit" id="login-submit-btn" style="padding:8px 14px; border-radius:8px; border:none; background:#2f5233; color:#ffffff; font-weight:600; cursor:pointer;">Log In</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);
}

function populateLoginMemberSelect(filterText = "") {
  const select = document.getElementById("login-member-select");
  if (!select) return;
  const q = filterText.trim().toLowerCase();

  const matches = allMembers.filter(m =>
    !q ||
    (m.FullName || "").toLowerCase().includes(q) ||
    (m.Nickname || "").toLowerCase().includes(q)
  );

  select.innerHTML = matches.length
    ? matches.map(m => `<option value="${m.MemberID}">${m.FullName}${m.Nickname ? ` (${m.Nickname})` : ""}</option>`).join("")
    : `<option value="">No matching profile</option>`;

  if (authenticatedMemberId && matches.some(m => m.MemberID === authenticatedMemberId)) {
    select.value = authenticatedMemberId;
  }
}

function openProfileLoginModal() {
  ensureProfileLoginModalExists();
  const form = document.getElementById("profile-login-form");
  if (form) form.reset();
  const errEl = document.getElementById("login-error-msg");
  if (errEl) {
    errEl.style.display = "none";
    errEl.textContent = "";
  }
  populateLoginMemberSelect("");
  document.getElementById("profile-login-overlay").style.display = "flex";
  setTimeout(() => {
    const pinInput = document.getElementById("login-pin-input");
    if (pinInput) pinInput.focus();
  }, 50);
}

function closeProfileLoginModal() {
  const overlay = document.getElementById("profile-login-overlay");
  if (overlay) overlay.style.display = "none";
}

function logoutProfileSession() {
  authenticatedMemberId = "";
  authenticatedPin = "";
  sessionStorage.removeItem("family_tree_auth_id");
  sessionStorage.removeItem("family_tree_auth_pin");
  refreshAuthButtons();
  closeProfileLoginModal();
  renderTree();
  generateDidYouKnow();
}

async function submitProfileLogin(e) {
  e.preventDefault();
  const select = document.getElementById("login-member-select");
  const pinInput = document.getElementById("login-pin-input");
  const submitBtn = document.getElementById("login-submit-btn");
  const errEl = document.getElementById("login-error-msg");

  const memberId = select ? select.value : "";
  const pin = pinInput ? pinInput.value.trim() : "";

  if (!memberId || !pin) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Checking...";
  if (errEl) errEl.style.display = "none";

  try {
    const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "profileLogin",
        MemberID: memberId,
        ProfilePIN: pin
      })
    });
    const result = await res.json();

    if (result.status !== "success") {
      if (errEl) {
        errEl.textContent = result.message || "Invalid PIN.";
        errEl.style.display = "block";
      } else {
        alert(result.message || "Invalid PIN.");
      }
      return;
    }

    authenticatedMemberId = result.memberId || memberId;
    authenticatedPin = pin;
    viewerId = authenticatedMemberId;
    sessionStorage.setItem("family_tree_auth_id", authenticatedMemberId);
    sessionStorage.setItem("family_tree_auth_pin", authenticatedPin);
    localStorage.setItem("family_tree_me_id", viewerId);

    const me = allMembers.find(m => m.MemberID === viewerId);
    if (me) {
      viewerBranch = resolveMemberBranch(me);
      if (viewerBranch) localStorage.setItem("family_tree_branch", viewerBranch);
    }

    refreshAuthButtons();
    closeProfileLoginModal();
    renderTree();
    generateDidYouKnow();
    focusMember(authenticatedMemberId);
  } catch (err) {
    console.error(err);
    if (errEl) {
      errEl.textContent = "Could not connect to server. Please try again.";
      errEl.style.display = "block";
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Log In";
  }
}

async function fetchMembers() {
  try {
    const res = await fetch(CONFIG.APPS_SCRIPT_URL);
    const data = await res.json();
    allMembers = data.members || [];
    if (viewerId && !viewerBranch) {
      const me = allMembers.find(x => x.MemberID === viewerId);
      if (me) {
        viewerBranch = resolveMemberBranch(me);
        if (viewerBranch) localStorage.setItem("family_tree_branch", viewerBranch);
      }
    }
    renderTree();
    populateFormHelpers();
    generateDidYouKnow();
  } catch (err) {
    console.error(err);
    alert("Could not load family tree. Check your Apps Script deployment.");
  } finally {
    const loader = document.getElementById("loader");
    if (loader) loader.style.display = "none";
  }
}

// ==========================================
// 3. TREE RENDERING ENGINE (WITH BIRTH ORDER)
// ==========================================
function parseBirthDateValue(dateStr) {
  if (!dateStr || !String(dateStr).trim()) return Number.POSITIVE_INFINITY;
  const cleaned = String(dateStr).trim();
  const parsed = Date.parse(cleaned);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

function compareBirthDates(a, b) {
  const timeA = parseBirthDateValue(a.BirthDate);
  const timeB = parseBirthDateValue(b.BirthDate);
  if (timeA !== timeB) return timeA - timeB;
  return (a.BirthDate || "9999").localeCompare(b.BirthDate || "9999");
}

function toDateInputValue(dateVal) {
  if (!dateVal) return "";
  const str = String(dateVal).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return "";

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveMemberBranch(member) {
  if (!member) return "";
  if (member.LineageBranch && member.LineageBranch.trim()) {
    return member.LineageBranch.trim();
  }

  let current = member;
  const visited = new Set();
  while (current && !visited.has(current.MemberID)) {
    visited.add(current.MemberID);
    const matched = LINEAGE_BRANCHES.find(b => {
      const first = b.split(" ")[0].toLowerCase();
      return (
        (current.FullName || "").toLowerCase().includes(first) ||
        (current.Nickname || "").toLowerCase().includes(first)
      );
    });
    if (matched) return matched;
    current = allMembers.find(x => x.MemberID === current.RelatedToID);
  }
  return "";
}

function canEditMember(targetMember) {
  if (!targetMember) return false;
  if (adminPasscode) return true;
  return Boolean(authenticatedMemberId && targetMember.MemberID === authenticatedMemberId);
}

function renderTree() {
  const container = document.getElementById("tree-root");
  if (!container) return;
  if (!allMembers.length) {
    container.innerHTML = "<p style='padding:40px; color:var(--muted);'>No members yet. Tap '+ Join Tree' to start!</p>";
    return;
  }

  const roots = allMembers.filter(m => m.Role === "Root" || !m.RelatedToID);
  const html = `<ul>${roots.map(root => buildBranchHTML(root, null)).join("")}</ul>`;
  container.innerHTML = html;
  requestAnimationFrame(autoFitTreeToViewport);
}

function buildBranchHTML(person, birthOrderInfo) {
  const spouses = allMembers.filter(m => m.Role === "Spouse" && m.RelatedToID === person.MemberID);
  const parentIds = [person.MemberID, ...spouses.map(s => s.MemberID)];
  const children = allMembers
    .filter(m => m.Role === "Descendant" && parentIds.includes(m.RelatedToID))
    .sort(compareBirthDates);

  let nodeHTML = `<div class="couple-group">`;
  nodeHTML += buildCardHTML(person, birthOrderInfo);
  spouses.forEach(sp => {
    nodeHTML += `<div class="couple-link"></div>` + buildCardHTML(sp, null);
  });
  nodeHTML += `</div>`;

  let childrenHTML = "";
  if (children.length > 0) {
    childrenHTML = `<ul>${children.map((child, idx) => {
      const orderMeta = children.length > 1 ? { index: idx, total: children.length } : null;
      return buildBranchHTML(child, orderMeta);
    }).join("")}</ul>`;
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

function getBirthOrderBadge(orderInfo) {
  if (!orderInfo || orderInfo.total < 2) return "";
  if (orderInfo.index === 0) {
    return `<span class="order-badge special">Panganay</span>`;
  }
  if (orderInfo.index === orderInfo.total - 1) {
    return `<span class="order-badge special">Bunso</span>`;
  }
  return `<span class="order-badge">#${orderInfo.index + 1}</span>`;
}

function buildCardHTML(m, birthOrderInfo) {
  const initials = getInitials(m.FullName);
  const avatar = m.PhotoURL
    ? `<img src="${m.PhotoURL}" class="avatar" alt="${m.FullName}" />`
    : `<div class="avatar">${initials}</div>`;
  const isMe = m.MemberID === viewerId;
  const orderBadge = getBirthOrderBadge(birthOrderInfo);

  return `
    <div class="member-card ${isMe ? 'is-me' : ''}" id="node-${m.MemberID}" onclick="openProfile('${m.MemberID}')">
      ${orderBadge}
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
  if (!banner || !textEl || allMembers.length < 2) return;

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

function getParentIds(memberId) {
  const m = allMembers.find(x => x.MemberID === memberId);
  if (!m) return [];
  if (m.Role === "Descendant") {
    const directParent = allMembers.find(x => x.MemberID === m.RelatedToID);
    if (!directParent) return [];
    const spouses = allMembers
      .filter(x => x.Role === "Spouse" && x.RelatedToID === directParent.MemberID)
      .map(x => x.MemberID);
    return [directParent.MemberID, ...spouses];
  }
  if (m.Role === "Spouse") {
    const partner = allMembers.find(x => x.MemberID === m.RelatedToID);
    return partner ? getParentIds(partner.MemberID) : [];
  }
  return [];
}

function getRelationshipLabel(me, other) {
  if (!me || !other) return "relative";
  if (other.MemberID === MOTHER_MEMBER_ID) return "Mom";

  const myParents = getParentIds(me.MemberID);
  const otherParents = getParentIds(other.MemberID);

  if (myParents.includes(other.MemberID)) {
    return other.MemberID === MOTHER_MEMBER_ID || other.Gender === "Female" ? "Mom" : "Dad";
  }
  if (otherParents.includes(me.MemberID)) {
    return other.Gender === "Female" ? "Daughter" : "Son";
  }
  if (myParents.some(pid => otherParents.includes(pid))) {
    return other.Gender === "Female" ? "Sister" : "Brother";
  }

  const myGrandparents = myParents.flatMap(pid => getParentIds(pid));
  const otherGrandparents = otherParents.flatMap(pid => getParentIds(pid));

  if (otherParents.some(pid => myGrandparents.includes(pid))) {
    return other.Gender === "Female" ? "Tita / Aunt" : "Tito / Uncle";
  }
  if (myGrandparents.some(gid => otherGrandparents.includes(gid))) {
    return "Cousin";
  }
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
  const editable = canEditMember(m);
  const memberBranch = resolveMemberBranch(m);

  let html = `
    <button class="close-drawer" onclick="document.getElementById('profile-overlay').style.display='none'">×</button>
    <div class="profile-header">
      ${avatar}
      <div class="profile-title">
        <h2>${m.FullName}</h2>
        ${m.Nickname ? `<div class="profile-sub">${m.Nickname}</div>` : ''}
        <div class="profile-meta">
          ${m.Occupation || ''}
          ${m.BirthDate ? `<br/>🎂 ${m.BirthDate}` : ''}
          ${m.City ? `<br/>📍 ${m.City}` : ''}
          ${memberBranch ? `<br/>🌿 Second Line: ${memberBranch}` : ''}
        </div>
      </div>
    </div>

    <div class="action-row">
      ${m.Phone ? `<a href="tel:${m.Phone}" class="action-pill">📞 Call</a><a href="sms:${m.Phone}" class="action-pill">💬 SMS</a>` : ''}
      ${m.Email ? `<a href="mailto:${m.Email}" class="action-pill">✉️ Email</a>` : ''}
      ${editable
        ? `<button class="action-pill" onclick="openEditForm('${m.MemberID}')">✏️ Edit Profile</button>`
        : `<button class="action-pill" onclick="openProfileLoginModal()">🔑 Log In to Edit</button>`
      }
      <button class="action-pill" style="background:${isMe ? 'var(--accent-bg)' : 'var(--primary-light)'}; color:var(--primary);" onclick="setAsMe('${m.MemberID}')">
        ${isMe ? '★ Viewing as You' : '👁️ View as Me'}
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
  const picked = allMembers.find(x => x.MemberID === memberId);
  if (picked) {
    viewerBranch = resolveMemberBranch(picked);
    localStorage.setItem("family_tree_branch", viewerBranch);
  }
  renderTree();
  generateDidYouKnow();
  openProfile(memberId);
}

// ==========================================
// 6. ADD & EDIT FORM + CLOUDINARY UPLOAD
// ==========================================
function ensureJoinPinFieldExists() {
  const form = document.getElementById("join-form");
  const submitBtn = document.getElementById("submit-btn");
  if (!form || !submitBtn || document.getElementById("ProfilePIN")) return;

  const wrap = document.createElement("div");
  wrap.id = "profile-pin-group";
  wrap.style.margin = "10px 0 12px";
  wrap.innerHTML = `
    <label id="profile-pin-label" for="ProfilePIN" style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:4px;">
      Set Your Profile PIN *
    </label>
    <input
      type="password"
      id="ProfilePIN"
      inputmode="numeric"
      placeholder="e.g. 1234 (used to log back in later)"
      style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box;"
    />
  `;
  submitBtn.parentNode.insertBefore(wrap, submitBtn);
}

function populateLineageBranchSelect(selectedValue = "") {
  const select = document.getElementById("LineageBranch");
  if (!select) return;
  select.innerHTML =
    `<option value="">-- Select your 2nd line (Grandfather / Grandmother) --</option>` +
    LINEAGE_BRANCHES.map(name => `<option value="${name}">${name}</option>`).join("");
  if (selectedValue) {
    select.value = selectedValue;
  }
}

function onLineageBranchChange() {
  const branchEl = document.getElementById("LineageBranch");
  if (!branchEl || !branchEl.value) return;

  const firstWord = branchEl.value.split(" ")[0].toLowerCase();
  const matchedMember = allMembers.find(m =>
    m.FullName.toLowerCase() === branchEl.value.toLowerCase() ||
    m.FullName.toLowerCase().includes(firstWord) ||
    (m.Nickname || "").toLowerCase().includes(firstWord)
  );

  if (matchedMember) {
    const relSelect = document.getElementById("RelatedToID");
    if (!Array.from(relSelect.options).some(opt => opt.value === matchedMember.MemberID)) {
      const opt = document.createElement("option");
      opt.value = matchedMember.MemberID;
      opt.textContent = `${matchedMember.FullName}${matchedMember.Nickname ? ` (${matchedMember.Nickname})` : ""}`;
      relSelect.prepend(opt);
    }
    relSelect.value = matchedMember.MemberID;
  }
}

function openJoinForm(fromQr = false) {
  ensureJoinPinFieldExists();
  document.getElementById("join-form").reset();
  document.getElementById("EditMemberID").value = "";
  document.getElementById("form-heading").textContent = fromQr
    ? "Join via 2nd Line (Grandparent)"
    : "Join the Family Tree";
  document.getElementById("form-sub").textContent = fromQr
    ? "Choose your grandfather or grandmother's line and set a PIN so only you can edit your profile."
    : "Add your profile to view the tree and edit your own details.";
  document.getElementById("photo-label").textContent = "Profile Photo";
  document.getElementById("submit-btn").textContent = "✓ Save to Family Tree";
  document.getElementById("role-toggle-wrap").style.display = "grid";
  document.getElementById("relation-group").style.display = "block";
  document.getElementById("RelatedToID").required = true;

  const pinGroup = document.getElementById("profile-pin-group");
  const pinLabel = document.getElementById("profile-pin-label");
  const pinInput = document.getElementById("ProfilePIN");
  if (pinGroup) pinGroup.style.display = "block";
  if (pinLabel) pinLabel.textContent = "Set Your Profile PIN *";
  if (pinInput) {
    pinInput.required = true;
    pinInput.placeholder = "e.g. 1234 (used to log back in later)";
  }

  const passkeyGroup = document.getElementById("passkey-group");
  const passkeyInput = document.getElementById("FamilyPasscode");
  if (passkeyGroup) passkeyGroup.style.display = "block";
  if (passkeyInput) passkeyInput.required = true;

  populateLineageBranchSelect("");
  setRole("Descendant");
  filterRelativeDropdown("");
  document.getElementById("form-overlay").style.display = "flex";
}

function openEditForm(memberId) {
  const m = allMembers.find(x => x.MemberID === memberId);
  if (!m) return;

  if (!canEditMember(m)) {
    alert("You can only edit your own profile. Use Profile Login or Admin Login.");
    return;
  }

  ensureJoinPinFieldExists();
  document.getElementById("profile-overlay").style.display = "none";
  document.getElementById("join-form").reset();

  document.getElementById("EditMemberID").value = m.MemberID;
  document.getElementById("form-heading").textContent = `Edit Profile: ${m.FullName}`;
  document.getElementById("form-sub").textContent = "Update profile details, birthdate, or photo.";
  document.getElementById("photo-label").textContent = "Change Photo (Optional)";
  document.getElementById("submit-btn").textContent = "✓ Save Changes";

  const pinGroup = document.getElementById("profile-pin-group");
  const pinLabel = document.getElementById("profile-pin-label");
  const pinInput = document.getElementById("ProfilePIN");
  if (pinGroup) pinGroup.style.display = "block";
  if (pinLabel) {
    pinLabel.textContent = adminPasscode
      ? "Set / Reset Profile PIN (Optional)"
      : "Change Profile PIN (Optional)";
  }
  if (pinInput) {
    pinInput.required = false;
    pinInput.placeholder = "Leave blank to keep current PIN";
  }

  const passkeyGroup = document.getElementById("passkey-group");
  const passkeyInput = document.getElementById("FamilyPasscode");
  if (passkeyGroup) passkeyGroup.style.display = "none";
  if (passkeyInput) passkeyInput.required = false;

  populateLineageBranchSelect(resolveMemberBranch(m));

  if (m.Role === "Root") {
    document.getElementById("role-toggle-wrap").style.display = "none";
    document.getElementById("relation-group").style.display = "none";
    document.getElementById("RelatedToID").required = false;
  } else {
    document.getElementById("role-toggle-wrap").style.display = "grid";
    document.getElementById("relation-group").style.display = "block";
    document.getElementById("RelatedToID").required = true;
    setRole(m.Role || "Descendant");
    filterRelativeDropdown("", m.MemberID);
    document.getElementById("RelatedToID").value = m.RelatedToID;
  }

  document.getElementById("FullName").value = m.FullName || "";
  document.getElementById("Nickname").value = m.Nickname || "";
  document.getElementById("Gender").value = m.Gender || "Male";
  document.getElementById("BirthDate").value = toDateInputValue(m.BirthDate);
  document.getElementById("Occupation").value = m.Occupation || "";
  document.getElementById("Hobbies").value = m.Hobbies || "";
  document.getElementById("Sports").value = m.Sports || "";
  document.getElementById("Phone").value = m.Phone || "";
  document.getElementById("City").value = m.City || "";
  document.getElementById("Email").value = m.Email || "";

  let socials = {};
  try { socials = JSON.parse(m.Socials || "{}"); } catch (e) {}
  document.getElementById("SocialFB").value = socials.fb || "";
  document.getElementById("SocialIG").value = socials.ig || "";

  document.getElementById("form-overlay").style.display = "flex";
}

function setRole(role) {
  selectedRole = role;
  document.getElementById("btn-role-child").classList.toggle("active", role === "Descendant");
  document.getElementById("btn-role-spouse").classList.toggle("active", role === "Spouse");
  document.getElementById("relation-label").textContent =
    role === "Descendant"
      ? "Who is your Parent / Grandparent link in this family? *"
      : "Who is your Spouse / Partner in this family? *";
}

function filterRelativeDropdown(query, excludeId = "") {
  const select = document.getElementById("RelatedToID");
  const currentVal = select.value;
  const q = query.toLowerCase();
  const filtered = allMembers.filter(m =>
    m.MemberID !== excludeId &&
    (m.FullName.toLowerCase().includes(q) || (m.Nickname || "").toLowerCase().includes(q))
  );
  select.innerHTML = filtered.map(m =>
    `<option value="${m.MemberID}">${m.FullName} ${m.Nickname ? `(${m.Nickname})` : ''}</option>`
  ).join("");
  if (currentVal && filtered.some(m => m.MemberID === currentVal)) {
    select.value = currentVal;
  }
}

function populateFormHelpers() {
  const collectUnique = (field) => {
    const set = new Set();
    allMembers.forEach(m => (m[field] || "").split(",").forEach(v => { if (v.trim()) set.add(v.trim()); }));
    return Array.from(set).slice(0, 8);
  };

  const renderChips = (elId, inputId, items) => {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = items.map(item =>
      `<button type="button" class="chip-btn" onclick="appendTag('${inputId}', '${item.replace(/'/g, "\\'")}')">+ ${item}</button>`
    ).join("");
  };

  renderChips("hobby-chips", "Hobbies", collectUnique("Hobbies"));
  renderChips("sport-chips", "Sports", collectUnique("Sports"));
}

function appendTag(inputId, val) {
  const input = document.getElementById(inputId);
  if (!input) return;
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
  if (!res.ok || !data.secure_url) {
    throw new Error(data.error?.message || "Cloudinary upload failed");
  }
  return data.secure_url;
}

async function submitMember(e) {
  e.preventDefault();
  const btn = document.getElementById("submit-btn");
  const editId = document.getElementById("EditMemberID").value;
  const isEdit = Boolean(editId);

  btn.disabled = true;
  btn.textContent = isEdit ? "Updating..." : "Saving...";

  try {
    const existingMember = isEdit ? allMembers.find(x => x.MemberID === editId) : null;
    if (isEdit && existingMember && !canEditMember(existingMember)) {
      throw new Error("You can only edit your own profile. Use Profile Login or Admin Login.");
    }

    const fileInput = document.getElementById("PhotoFile");
    const hasNewFile = Boolean(fileInput && fileInput.files && fileInput.files[0]);

    const photoUrl = hasNewFile
      ? await uploadToCloudinary(fileInput.files[0])
      : (existingMember ? existingMember.PhotoURL : "");

    const birthDateInput = document.getElementById("BirthDate").value.trim();
    const birthDateVal = birthDateInput || (existingMember ? existingMember.BirthDate : "");

    const selectedBranch = document.getElementById("LineageBranch")
      ? document.getElementById("LineageBranch").value.trim()
      : "";
    const resolvedBranch = selectedBranch || (existingMember ? resolveMemberBranch(existingMember) : "");

    const familyPasscode = document.getElementById("FamilyPasscode")
      ? document.getElementById("FamilyPasscode").value.trim()
      : "";

    const pinInputVal = document.getElementById("ProfilePIN")
      ? document.getElementById("ProfilePIN").value.trim()
      : "";

    const payload = {
      action: isEdit ? "update" : "create",
      MemberID: editId,
      ActorMemberID: isEdit && editId === authenticatedMemberId ? authenticatedMemberId : viewerId,
      ProfilePIN: isEdit && editId === authenticatedMemberId ? authenticatedPin : pinInputVal,
      NewProfilePIN: isEdit ? pinInputVal : "",
      AdminPasscode: adminPasscode,
      Role: isEdit && existingMember && existingMember.Role === "Root" ? "Root" : selectedRole,
      RelatedToID: isEdit && existingMember && existingMember.Role === "Root" ? "" : document.getElementById("RelatedToID").value,
      FullName: document.getElementById("FullName").value.trim(),
      Nickname: document.getElementById("Nickname").value.trim(),
      Gender: document.getElementById("Gender").value,
      BirthDate: birthDateVal,
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
      },
      LineageBranch: resolvedBranch,
      FamilyPasscode: familyPasscode
    };

    const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.status === "success") {
      if (!isEdit) {
        viewerId = result.memberId;
        authenticatedMemberId = result.memberId;
        authenticatedPin = pinInputVal;
        localStorage.setItem("family_tree_me_id", viewerId);
        sessionStorage.setItem("family_tree_auth_id", authenticatedMemberId);
        if (pinInputVal) {
          sessionStorage.setItem("family_tree_auth_pin", pinInputVal);
        }
        if (resolvedBranch) {
          viewerBranch = resolvedBranch;
          localStorage.setItem("family_tree_branch", viewerBranch);
        }
        refreshAuthButtons();
      } else if (editId === authenticatedMemberId && pinInputVal) {
        authenticatedPin = pinInputVal;
        sessionStorage.setItem("family_tree_auth_pin", authenticatedPin);
      }

      document.getElementById("join-form").reset();
      document.getElementById("form-overlay").style.display = "none";
      await fetchMembers();
      focusMember(result.memberId);
    } else {
      alert("Error: " + result.message);
    }
  } catch (err) {
    console.error(err);
    alert("Submission failed: " + (err.message || "Please try again."));
  } finally {
    btn.disabled = false;
    btn.textContent = isEdit ? "✓ Save Changes" : "✓ Save to Family Tree";
  }
}

// ==========================================
// 7. SEARCH, MOBILE ZOOM & QR MODAL
// ==========================================
function handleSearch(query) {
  const box = document.getElementById("search-results");
  if (!box) return;
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
  const box = document.getElementById("search-results");
  const input = document.getElementById("search-input");
  if (box) box.style.display = "none";
  if (input) input.value = "";
  focusMember(id);
}

function syncScaledBounds() {
  const viewport = document.querySelector(".tree-viewport");
  const canvas = document.getElementById("tree-canvas");
  if (!viewport || !canvas) return;

  const prevTransform = canvas.style.transform;
  canvas.style.transform = "none";
  const naturalWidth = canvas.offsetWidth;
  const naturalHeight = canvas.offsetHeight;
  canvas.style.transform = prevTransform;

  const scaledWidth = naturalWidth * currentZoom;
  const scaledHeight = naturalHeight * currentZoom;

  const horizontalOffset = Math.min(0, (scaledWidth - naturalWidth) / 2);
  const verticalOffset = Math.min(0, scaledHeight - naturalHeight);

  canvas.style.marginLeft = `${horizontalOffset}px`;
  canvas.style.marginRight = `${horizontalOffset}px`;
  canvas.style.marginBottom = `${verticalOffset}px`;
}

function applyZoom(nextZoom, fromUser = true) {
  if (fromUser) hasUserAdjustedZoom = true;
  currentZoom = Math.min(Math.max(MIN_ZOOM, Number(nextZoom.toFixed(2))), MAX_ZOOM);
  const canvas = document.getElementById("tree-canvas");
  if (canvas) {
    canvas.style.transform = `scale(${currentZoom})`;
    syncScaledBounds();
  }
}

function adjustZoom(delta) {
  applyZoom(currentZoom + delta, true);
}

function resetZoom() {
  hasUserAdjustedZoom = false;
  applyZoom(1, false);
}

function autoFitTreeToViewport() {
  if (hasUserAdjustedZoom) return;
  const viewport = document.querySelector(".tree-viewport");
  const canvas = document.getElementById("tree-canvas");
  if (!viewport || !canvas) return;

  if (window.innerWidth > 768) {
    applyZoom(1, false);
    return;
  }

  canvas.style.transform = "none";
  canvas.style.marginLeft = "0px";
  canvas.style.marginRight = "0px";
  canvas.style.marginBottom = "0px";

  const availableWidth = viewport.clientWidth - 24;
  const treeWidth = canvas.scrollWidth || canvas.offsetWidth;

  if (treeWidth > 0 && availableWidth > 0 && treeWidth > availableWidth) {
    const fitScale = Math.max(MIN_ZOOM, Math.min(1, availableWidth / treeWidth));
    applyZoom(fitScale, false);
  } else {
    applyZoom(1, false);
  }
}

(function enablePinchZoom() {
  let pinchStartDist = 0;
  let pinchStartZoom = 1;

  document.addEventListener("DOMContentLoaded", () => {
    const viewport = document.querySelector(".tree-viewport");
    if (!viewport) return;

    const getDistance = (t1, t2) =>
      Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

    viewport.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        pinchStartDist = getDistance(e.touches[0], e.touches[1]);
        pinchStartZoom = currentZoom;
      }
    }, { passive: true });

    viewport.addEventListener("touchmove", (e) => {
      if (e.touches.length === 2 && pinchStartDist > 0) {
        const currentDist = getDistance(e.touches[0], e.touches[1]);
        applyZoom(pinchStartZoom * (currentDist / pinchStartDist), true);
      }
    }, { passive: true });

    viewport.addEventListener("touchend", (e) => {
      if (e.touches.length < 2) {
        pinchStartDist = 0;
      }
    }, { passive: true });

    window.addEventListener("resize", () => {
      if (!hasUserAdjustedZoom) {
        autoFitTreeToViewport();
      } else {
        syncScaledBounds();
      }
    });
  });
})();

function openQrModal() {
  const qrBox = document.getElementById("qrcode-box");
  if (!qrBox || typeof QRCode === "undefined") return;
  qrBox.innerHTML = "";
  const joinUrl = `${window.location.origin}${window.location.pathname}?action=join`;
  new QRCode(qrBox, { text: joinUrl, width: 200, height: 200, colorDark: "#2f5233", colorLight: "#ffffff" });
  const qrOverlay = document.getElementById("qr-overlay");
  if (qrOverlay) qrOverlay.style.display = "flex";
}

function closeOverlay(e, id) {
  if (e.target.id === id) document.getElementById(id).style.display = "none";
}

// ==========================================
// 8. HIDE SEARCH BAR ON SCROLL UP, SHOW ON SCROLL DOWN
// ==========================================
(function initSearchScrollBehavior() {
  document.addEventListener("DOMContentLoaded", () => {
    const searchWrap = document.querySelector(".search-wrap");
    const searchInput = document.getElementById("search-input");
    const viewport = document.querySelector(".tree-viewport");
    if (!searchWrap || !viewport) return;

    let lastScrollTop = 0;

    const handleVerticalMove = (currentScrollTop) => {
      if (document.activeElement === searchInput || (searchInput && searchInput.value.trim() !== "")) {
        searchWrap.classList.remove("search-hidden");
        return;
      }

      if (currentScrollTop <= 10) {
        searchWrap.classList.remove("search-hidden");
      } else if (currentScrollTop < lastScrollTop - 6) {
        searchWrap.classList.add("search-hidden");
      } else if (currentScrollTop > lastScrollTop + 6) {
        searchWrap.classList.remove("search-hidden");
      }

      lastScrollTop = Math.max(0, currentScrollTop);
    };

    viewport.addEventListener("scroll", () => {
      handleVerticalMove(viewport.scrollTop);
    }, { passive: true });

    window.addEventListener("scroll", () => {
      handleVerticalMove(window.scrollY);
    }, { passive: true });
  });
})();
