// ==========================================
// 1. CONFIGURATION
// ==========================================
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyT_spiceGv_Jd2pn4ld6bQIc4hOtCGcGZbELqno2GXoDlgs8H-ZhYIo_ELS7DzPQETJA/exec",
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
let adminPasscode = sessionStorage.getItem("family_tree_admin_code") || "";

// ==========================================
// 2. INITIALIZATION & DATA FETCHING
// ==========================================
window.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("header-title").textContent = CONFIG.FAMILY_NAME;
  ensureAdminButtonExists();
  await fetchMembers();

  const params = new URLSearchParams(window.location.search);
  if (params.get("action") === "join") {
    openJoinForm(true);
  }
});

function ensureAdminButtonExists() {
  if (document.getElementById("admin-login-btn")) return;
  const header = document.querySelector("header") || document.body;
  const btn = document.createElement("button");
  btn.id = "admin-login-btn";
  btn.type = "button";
  btn.style.marginLeft = "auto";
  btn.style.padding = "6px 10px";
  btn.style.borderRadius = "8px";
  btn.style.border = "1px solid #cbd5e1";
  btn.style.background = "#ffffff";
  btn.style.cursor = "pointer";
  btn.style.fontSize = "0.82rem";
  btn.onclick = handleAdminLoginClick;
  refreshAdminButtonLabel(btn);
  header.appendChild(btn);
}

function refreshAdminButtonLabel(btn = document.getElementById("admin-login-btn")) {
  if (!btn) return;
  btn.textContent = adminPasscode ? "🔓 Admin (Active)" : "🔐 Admin Login";
}

async function handleAdminLoginClick() {
  if (adminPasscode) {
    const logout = confirm("Admin mode is currently active. Log out of Admin mode?");
    if (logout) {
      adminPasscode = "";
      sessionStorage.removeItem("family_tree_admin_code");
      refreshAdminButtonLabel();
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
    refreshAdminButtonLabel();
    alert("Admin mode enabled. You now have full edit control across all profiles.");
  } catch (err) {
    console.error(err);
    alert("Could not verify admin passcode.");
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
    document.getElementById("loader").style.display = "none";
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
  return Boolean(viewerId && targetMember.MemberID === viewerId);
}

function renderTree() {
  const container = document.getElementById("tree-root");
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

function getParentIds(memberId) {
  const m = allMembers.find(x => x.MemberID === memberId);
  if (!m) return [];
  if (m.Role === "Descendant") {
    const directParent = allMembers.find(x => x.MemberID === m.RelatedToID);
    if (!directParent) return [];
    const spouses = allMembers
      .filter(x => x.Role === "Spouse" && x.
