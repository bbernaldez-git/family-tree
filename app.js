// ==========================================
// 1. CONFIGURATION
// ==========================================
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycby8PGeCBC9JQLAX1Gh0fqOv5NSWd_oBHZ9fojJERZ0vp-4oFKUYHlmWDSfuuV_9a0YNgg/exec",
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
  const titleEl = document.getElementById("header-title");
  if (titleEl) titleEl.textContent = CONFIG.FAMILY_NAME;
  await fetchMembers();

  const params = new URLSearchParams(window.location.search);
  if (params.get("action") === "join") {
    openJoinForm(false);
  }
});

async function fetchMembers() {
  try {
    const res = await fetch(CONFIG.APPS_SCRIPT_URL);
    const data = await res.json();
    allMembers = data.members || [];
    renderTree();
    renderViewerStatus();
    populateLineageOptions();
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
// 4. WELCOME BANNER & "DID YOU KNOW?" ENGINE
// ==========================================
function showWelcomeBanner(member) {
  const displayName = member.Nickname || member.FullName || "relative";
  let banner = document.getElementById("welcome-banner");

  if (!banner) {
    const dykBanner = document.getElementById("dyk-banner");
    banner = document.createElement("div");
    banner.id = "welcome-banner";
    banner.style.cssText = [
      "display:flex",
      "align-items:center",
      "justify-content:space-between",
      "gap:10px",
      "padding:10px 14px",
      "margin:8px auto 0",
      "max-width:920px",
      "background:var(--primary-light, #e6efe7)",
      "color:var(--ink, #1f2923)",
      "border:1px solid var(--primary, #2f5233)",
      "border-radius:10px",
      "font-size:0.86rem",
      "z-index:16"
    ].join(";");

    if (dykBanner && dykBanner.parentNode) {
      dykBanner.parentNode.insertBefore(banner, dykBanner);
    } else {
      document.body.prepend(banner);
    }
  }

  banner.innerHTML = `
    <div>
      <strong>Welcome to ${CONFIG.FAMILY_NAME}, ${displayName}!</strong>
      Browse the tree to explore your family and clan members—tap any card to view profiles, hobbies, sports, and connections.
    </div>
    <button type="button" onclick="dismissWelcomeBanner()" style="background:transparent;border:none;font-size:1.15rem;cursor:pointer;color:inherit;padding:2px 6px;" aria-label="Dismiss welcome message">×</button>
  `;
  banner.style.display = "flex";
}

function dismissWelcomeBanner() {
  const banner = document.getElementById("welcome-banner");
  if (banner) banner.style.display = "none";
}

function isImmediateFamily(personA, personB) {
  if (!personA || !personB || personA.MemberID === personB.MemberID) return true;

  if (
    (personA.Role === "Spouse" && personA.RelatedToID === personB.MemberID) ||
    (personB.Role === "Spouse" && personB.RelatedToID === personA.MemberID) ||
    (personA.Role === "Spouse" && personB.Role === "Spouse" && personA.RelatedToID && personA.RelatedToID === personB.RelatedToID)
  ) {
    return true;
  }

  const label = getRelationshipLabel(personA, personB);
  return ["Mom", "Dad", "Daughter", "Son", "Sister", "Brother"].includes(label);
}

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
      if (isImmediateFamily(pA, pB)) return;

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
// 5. PROFILE DRAWER, LOGIN / LOGOUT & NAVIGATION
// ==========================================
function renderViewerStatus() {
  const me = allMembers.find(m => m.MemberID === viewerId);
  const actionsWrap = document.querySelector(".header-actions");
  if (!actionsWrap) return;

  let bar = document.getElementById("viewer-session-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "viewer-session-bar";
    bar.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "gap:5px",
      "padding:4px 8px",
      "border-radius:999px",
      "background:var(--primary-light, #e6efe7)",
      "color:var(--primary, #2f5233)",
      "font-size:0.76rem",
      "white-space:nowrap"
    ].join(";");
    actionsWrap.prepend(bar);
  }

  if (me) {
    const label = me.Nickname || me.FullName;
    bar.innerHTML = `
      <span><strong>${label}</strong></span>
      <button type="button" onclick="logoutViewer()" style="background:#ffffff;color:var(--ink);border:1px solid var(--border);border-radius:999px;padding:2px 7px;font-size:0.72rem;font-weight:600;">Logout</button>
    `;
  } else {
    bar.innerHTML = `
      <button type="button" onclick="openLoginPicker()" style="background:#ffffff;color:var(--primary);border:1px solid var(--border);border-radius:999px;padding:2px 8px;font-size:0.74rem;font-weight:600;">👤 Login</button>
    `;
  }
}

function openLoginPicker() {
  if (!allMembers.length) return;
  const listHtml = allMembers
    .slice()
    .sort((a, b) => (a.FullName || "").localeCompare(b.FullName || ""))
    .map(m => {
      const nick = m.Nickname ? ` (${m.Nickname})` : "";
      return `
        <button
          type="button"
          class="action-pill"
          style="width:100%;justify-content:space-between;border-radius:10px;padding:9px 12px;margin-bottom:6px;"
          onclick="setAsMe('${m.MemberID}')"
        >
          <span><strong>${m.FullName}</strong>${nick}</span>
          <span>Select →</span>
        </button>
      `;
    })
    .join("");

  document.getElementById("profile-drawer-content").innerHTML = `
    <button class="close-drawer" onclick="document.getElementById('profile-overlay').style.display='none'">×</button>
    <h2 style="margin:0 0 4px;">Select Your Profile</h2>
    <p class="modal-sub" style="margin-bottom:12px;">Choose who you are so you can view personalized connections and manage your profile.</p>
    <div style="max-height:60dvh;overflow-y:auto;">${listHtml}</div>
  `;
  document.getElementById("profile-overlay").style.display = "flex";
}

function logoutViewer() {
  viewerId = "";
  localStorage.removeItem("family_tree_me_id");
  const overlay = document.getElementById("profile-overlay");
  if (overlay) overlay.style.display = "none";
  renderViewerStatus();
  renderTree();
  generateDidYouKnow();
}

function focusMember(memberId, shouldOpenProfile = true) {
  const node = document.getElementById(`node-${memberId}`);
  if (node) {
    document.querySelectorAll(".member-card").forEach(c => c.classList.remove("highlighted"));
    node.classList.add("highlighted");
    node.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }
  if (shouldOpenProfile) {
    openProfile(memberId);
  }
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
          ${m.BirthDate ? `<br/>🎂 ${m.BirthDate}` : ''}
          ${m.City ? `<br/>📍 ${m.City}` : ''}
        </div>
      </div>
    </div>

    <div class="action-row">
      ${m.Phone ? `<a href="tel:${m.Phone}" class="action-pill">📞 Call</a><a href="sms:${m.Phone}" class="action-pill">💬 SMS</a>` : ''}
      ${m.Email ? `<a href="mailto:${m.Email}" class="action-pill">✉️ Email</a>` : ''}
      ${isMe ? `<button class="action-pill" onclick="openEditForm('${m.MemberID}')">✏️ Edit Profile</button>` : ''}
      ${
        isMe
          ? `<button class="action-pill" style="background:var(--accent-bg); color:var(--ink);" onclick="logoutViewer()">🚪 Logout ("Not me")</button>`
          : `<button class="action-pill" style="background:var(--primary-light); color:var(--primary);" onclick="setAsMe('${m.MemberID}')">👤 This is me</button>`
      }
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
  renderViewerStatus();
  renderTree();
  generateDidYouKnow();
  openProfile(memberId);
}

// ==========================================
// 6. ADD & EDIT FORM + CLOUDINARY UPLOAD
// ==========================================
function populateLineageOptions() {
  const select = document.getElementById("LineageBranch");
  if (!select) return;

  const currentVal = select.value;
  const roots = allMembers.filter(m => m.Role === "Root" || !m.RelatedToID);
  const rootIds = roots.map(r => r.MemberID);
  const gen1Children = allMembers
    .filter(m => m.Role === "Descendant" && rootIds.includes(m.RelatedToID))
    .sort(compareBirthDates);

  const options = ['<option value="">-- Select whose descendant you are --</option>'];
  gen1Children.forEach(child => {
    const label = child.Nickname ? `${child.FullName} (${child.Nickname})` : child.FullName;
    options.push(`<option value="${child.MemberID}">${label}</option>`);
  });
  roots.forEach(r => {
    const label = r.Nickname ? `${r.FullName} (${r.Nickname}) — Root` : `${r.FullName} — Root`;
    options.push(`<option value="${r.MemberID}">${label}</option>`);
  });

  select.innerHTML = options.join("");
  if (currentVal) select.value = currentVal;
}

function onLineageBranchChange() {
  const branchSelect = document.getElementById("LineageBranch");
  const relSelect = document.getElementById("RelatedToID");
  if (!branchSelect || !relSelect || !branchSelect.value) return;

  const branchId = branchSelect.value;
  const branchSpouses = allMembers.filter(m => m.Role === "Spouse" && m.RelatedToID === branchId);
  const parentPool = [branchId, ...branchSpouses.map(s => s.MemberID)];
  const descendantsInBranch = allMembers.filter(
    m => m.Role === "Descendant" && (m.MemberID === branchId || parentPool.includes(m.RelatedToID))
  );

  const validIds = new Set([...parentPool, ...descendantsInBranch.map(d => d.MemberID)]);
  const candidates = allMembers.filter(m => validIds.has(m.MemberID));

  if (candidates.length) {
    relSelect.innerHTML = candidates.map(m =>
      `<option value="${m.MemberID}">${m.FullName} ${m.Nickname ? `(${m.Nickname})` : ''}</option>`
    ).join("");
    if (validIds.has(branchId)) relSelect.value = branchId;
  }
}

function openJoinForm() {
  const form = document.getElementById("join-form");
  if (form) form.reset();
  document.getElementById("EditMemberID").value = "";
  document.getElementById("form-heading").textContent = "Join the Family Tree";
  document.getElementById("form-sub").textContent = "Add yourself so relatives can connect with you.";
  document.getElementById("photo-label").textContent = "Profile Photo";
  document.getElementById("submit-btn").textContent = "✓ Save to Family Tree";
  document.getElementById("role-toggle-wrap").style.display = "grid";
  document.getElementById("relation-group").style.display = "block";
  document.getElementById("RelatedToID").required = true;

  const lineageGroup = document.getElementById("lineage-group");
  const lineageSelect = document.getElementById("LineageBranch");
  if (lineageGroup && lineageSelect) {
    lineageGroup.style.display = "flex";
    lineageSelect.required = true;
  }

  const passkeyGroup = document.getElementById("passkey-group");
  const passkeyInput = document.getElementById("FamilyPasscode");
  if (passkeyGroup && passkeyInput) {
    passkeyGroup.style.display = "flex";
    passkeyInput.required = true;
  }

  setRole("Descendant");
  filterRelativeDropdown("");
  document.getElementById("form-overlay").style.display = "flex";
}

function openEditForm(memberId) {
  const m = allMembers.find(x => x.MemberID === memberId);
  if (!m) return;

  document.getElementById("profile-overlay").style.display = "none";
  document.getElementById("join-form").reset();

  document.getElementById("EditMemberID").value = m.MemberID;
  document.getElementById("form-heading").textContent = `Edit Profile: ${m.FullName}`;
  document.getElementById("form-sub").textContent = "Update your details, birthdate, or profile photo.";
  document.getElementById("photo-label").textContent = "Change Photo (Optional)";
  document.getElementById("submit-btn").textContent = "✓ Save Changes";

  const lineageGroup = document.getElementById("lineage-group");
  const lineageSelect = document.getElementById("LineageBranch");
  if (lineageGroup && lineageSelect) {
    lineageGroup.style.display = "none";
    lineageSelect.required = false;
  }

  const passkeyGroup = document.getElementById("passkey-group");
  const passkeyInput = document.getElementById("FamilyPasscode");
  if (passkeyGroup && passkeyInput) {
    passkeyGroup.style.display = "none";
    passkeyInput.required = false;
  }

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
  document.getElementById("BirthDate").value = m.BirthDate || "";
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
      ? "Who is your Parent in this family? *"
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
  const editId = document.getElementById("EditMemberID").value;
  const isEdit = Boolean(editId);

  btn.disabled = true;
  btn.textContent = isEdit ? "Updating..." : "Saving...";

  try {
    const fileInput = document.getElementById("PhotoFile");
    const photoUrl = fileInput.files && fileInput.files[0] ? await uploadToCloudinary(fileInput.files[0]) : "";
    const existingMember = isEdit ? allMembers.find(x => x.MemberID === editId) : null;
    const passkeyInput = document.getElementById("FamilyPasscode");
    const lineageInput = document.getElementById("LineageBranch");

    const payload = {
      action: isEdit ? "update" : "create",
      MemberID: editId,
      Role: isEdit && existingMember && existingMember.Role === "Root" ? "Root" : selectedRole,
      RelatedToID: isEdit && existingMember && existingMember.Role === "Root" ? "" : document.getElementById("RelatedToID").value,
      LineageBranch: lineageInput ? lineageInput.value : "",
      FamilyPasscode: passkeyInput ? passkeyInput.value : "",
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
      if (!isEdit) {
        viewerId = result.memberId;
        localStorage.setItem("family_tree_me_id", viewerId);
      }
      document.getElementById("join-form").reset();
      document.getElementById("form-overlay").style.display = "none";
      await fetchMembers();

      if (!isEdit) {
        const createdMember = allMembers.find(m => m.MemberID === result.memberId) || {
          FullName: payload.FullName,
          Nickname: payload.Nickname
        };
        focusMember(result.memberId, false);
        showWelcomeBanner(createdMember);
      } else {
        focusMember(result.memberId, true);
      }
    } else {
      alert("Error: " + result.message);
    }
  } catch (err) {
    console.error(err);
    alert("Submission failed. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = isEdit ? "✓ Save Changes" : "✓ Save to Family Tree";
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

function applyZoom() {
  const canvas = document.getElementById("tree-canvas");
  if (canvas) canvas.style.transform = `scale(${currentZoom})`;
}

function adjustZoom(delta) {
  currentZoom = Math.min(Math.max(0.45, Number((currentZoom + delta).toFixed(2))), 1.6);
  applyZoom();
}

function resetZoom() {
  currentZoom = 1;
  applyZoom();
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
