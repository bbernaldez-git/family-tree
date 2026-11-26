// ==========================================
// 1. CONFIGURATION
// ==========================================
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbzzjnGfl0RnXyax8oQdWbROQDVTfLP5ArxnKhayaYVjgN0o4j83E1BwKu-gwVQ-zeU4cg/exec",
  CLOUDINARY_CLOUD_NAME: "di1fg6nu",
  CLOUDINARY_UPLOAD_PRESET: "family_tree_unsigned",
  FAMILY_NAME: "Bernaldez Family Tree"
};

const LINEAGE_BRANCHES = [
  "Crispin Bernaldez",
  "David Bernaldez",
  "Wenefreda",
  "Oscar Bernaldez",
  "Joe Bernaldez",
  "Josephine Hermosura",
  "Edwin Bernaldez",
  "Maria Esta",
  "Vilma Dela Cruz"
];

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.2;

let allMembers = [];
let selectedRole = "Descendant";
let currentZoom = 1;
let hasUserAdjustedZoom = false;
let viewerId = localStorage.getItem("family_tree_me_id") || "";
let viewerBranch = localStorage.getItem("family_tree_branch") || "";

// ==========================================
// 2. INITIALIZATION & DATA FETCHING
// ==========================================
window.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("header-title").textContent = CONFIG.FAMILY_NAME;
  await fetchMembers();

  const params = new URLSearchParams(window.location.search);
  if (params.get("action") === "join") {
    openJoinForm(true);
  }
});

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

function getActiveEditorBranch() {
  if (viewerBranch && viewerBranch.trim()) return viewerBranch.trim();
  const me = allMembers.find(x => x.MemberID === viewerId);
  return me ? resolveMemberBranch(me) : "";
}

function canEditMember(targetMember) {
  if (!targetMember) return false;
  const activeBranch = getActiveEditorBranch().toLowerCase();
  const targetBranch = resolveMemberBranch(targetMember).toLowerCase();
  if (!activeBranch || !targetBranch) return true;
  return activeBranch === targetBranch;
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
          ${memberBranch ? `<br/>🌿 Line: ${memberBranch}` : ''}
        </div>
      </div>
    </div>

    <div class="action-row">
      ${m.Phone ? `<a href="tel:${m.Phone}" class="action-pill">📞 Call</a><a href="sms:${m.Phone}" class="action-pill">💬 SMS</a>` : ''}
      ${m.Email ? `<a href="mailto:${m.Email}" class="action-pill">✉️ Email</a>` : ''}
      ${editable
        ? `<button class="action-pill" onclick="openEditForm('${m.MemberID}')">✏️ Edit Profile</button>`
        : `<span class="action-pill" style="opacity:0.65; cursor:not-allowed;">🔒 ${memberBranch || 'Other'} Line Only</span>`
      }
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
function populateLineageBranchSelect(selectedValue = "") {
  const select = document.getElementById("LineageBranch");
  if (!select) return;
  select.innerHTML =
    `<option value="">-- Select whose descendant you are --</option>` +
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
  document.getElementById("join-form").reset();
  document.getElementById("EditMemberID").value = "";
  document.getElementById("form-heading").textContent = fromQr
    ? "Whose Descendant Are You?"
    : "Join the Family Tree";
  document.getElementById("form-sub").textContent = fromQr
    ? "Select which child of Monica and Lolo your line comes from."
    : "Add yourself so relatives can connect with you.";
  document.getElementById("photo-label").textContent = "Profile Photo";
  document.getElementById("submit-btn").textContent = "✓ Save to Family Tree";
  document.getElementById("role-toggle-wrap").style.display = "grid";
  document.getElementById("relation-group").style.display = "block";
  document.getElementById("RelatedToID").required = true;

  const passkeyGroup = document.getElementById("passkey-group");
  const passkeyInput = document.getElementById("FamilyPasscode");
  if (passkeyGroup) passkeyGroup.style.display = "block";
  if (passkeyInput) passkeyInput.required = true;

  populateLineageBranchSelect(getActiveEditorBranch());
  setRole("Descendant");
  filterRelativeDropdown("");
  document.getElementById("form-overlay").style.display = "flex";
}

function openEditForm(memberId) {
  const m = allMembers.find(x => x.MemberID === memberId);
  if (!m) return;

  if (!canEditMember(m)) {
    alert(`You can only update members from your own line branch (${getActiveEditorBranch() || "your branch"}).`);
    return;
  }

  document.getElementById("profile-overlay").style.display = "none";
  document.getElementById("join-form").reset();

  document.getElementById("EditMemberID").value = m.MemberID;
  document.getElementById("form-heading").textContent = `Edit Profile: ${m.FullName}`;
  document.getElementById("form-sub").textContent = "Update your details, birthdate, or profile photo.";
  document.getElementById("photo-label").textContent = "Change Photo (Optional)";
  document.getElementById("submit-btn").textContent = "✓ Save Changes";

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
      throw new Error(`You can only update members from your own line branch (${getActiveEditorBranch() || "your branch"}).`);
    }

    const fileInput = document.getElementById("PhotoFile");
    const hasNewFile = Boolean(fileInput.files && fileInput.files[0]);

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

    const payload = {
      action: isEdit ? "update" : "create",
      MemberID: editId,
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
      EditorLineageBranch: getActiveEditorBranch(),
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
        localStorage.setItem("family_tree_me_id", viewerId);
        if (resolvedBranch) {
          viewerBranch = resolvedBranch;
          localStorage.setItem("family_tree_branch", viewerBranch);
        }
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
  qrBox.innerHTML = "";
  const joinUrl = `${window.location.origin}${window.location.pathname}?action=join`;
  new QRCode(qrBox, { text: joinUrl, width: 200, height: 200, colorDark: "#2f5233", colorLight: "#ffffff" });
  document.getElementById("qr-overlay").style.display = "flex";
}

function closeOverlay(e, id) {
  if (e.target.id === id) document.getElementById(id).style.display = "none";
}
