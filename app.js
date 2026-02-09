/**
 * Text on Photo – fully independent settings per text block.
 *
 * Each of the 4 text blocks (Cover Title, Cover Author, Spine Title,
 * Spine Author) has its own font, colour, bold/italic, spacing, effect,
 * size, tilt, and (for spine) curve + feather controls.
 */

/* ── helpers ─────────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ID-prefix for each block type → matches the HTML id pattern */
const PREFIX = {
  title:       'title',
  author:      'author',
  spineTitle:  'spine-title',
  spineAuthor: 'spine-author'
};

/** Read every control value for a block by its type key. */
function readSettings(type) {
  const p = PREFIX[type];
  return {
    text:    ($(p + '-text')?.value || '').trim().toUpperCase()
                .replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
    font:    $(p + '-font')?.value    || 'Cinzel',
    color:   $(p + '-color')?.value   || '#ded8ae',
    bold:    $(p + '-bold')?.checked  ?? true,
    italic:  $(p + '-italic')?.checked ?? false,
    spacing: parseInt($(p + '-spacing')?.value ?? 1),
    effect:  $(p + '-effect')?.value  || 'embossed',
    curve:         parseInt($(p + '-curve')?.value ?? 0),
    feather:       $(p + '-feather')?.checked ?? false,
    featherAmount: parseInt($(p + '-feather-amount')?.value ?? 50)
  };
}

/** Reset all controls for a block to given defaults. */
function resetControls(type, defs) {
  const p = PREFIX[type];
  const el = s => $(p + '-' + s);
  if (el('text'))          el('text').value      = defs.text || '';
  if (el('font'))          el('font').value      = defs.font || 'Cinzel';
  if (el('color'))         el('color').value     = defs.color || '#ded8ae';
  if (el('color-hex'))     el('color-hex').textContent = defs.color || '#ded8ae';
  if (el('bold'))          el('bold').checked    = defs.bold ?? true;
  if (el('italic'))        el('italic').checked  = defs.italic ?? false;
  if (el('spacing'))       el('spacing').value   = defs.spacing ?? 1;
  if (el('spacing-value')) el('spacing-value').textContent = ((defs.spacing ?? 1) / 10).toFixed(1) + 'em';
  if (el('effect'))        el('effect').value    = defs.effect || 'embossed';
  if (el('size'))          el('size').value      = defs.size;
  if (el('size-value'))    el('size-value').textContent = defs.size + 'px';
  if (el('tilt-x'))        el('tilt-x').value    = defs.tiltX;
  if (el('tilt-x-value'))  el('tilt-x-value').textContent = defs.tiltX + '°';
  if (el('tilt-y'))        el('tilt-y').value    = defs.tiltY;
  if (el('tilt-y-value'))  el('tilt-y-value').textContent = defs.tiltY + '°';
  if (el('curve'))         el('curve').value     = defs.curve ?? 0;
  if (el('curve-value'))   el('curve-value').textContent = String(defs.curve ?? 0);
  if (el('feather'))              el('feather').checked = false;
  if (el('feather-amount'))       el('feather-amount').value = 50;
  if (el('feather-amount-value')) el('feather-amount-value').textContent = '50';
}

/* ── state ───────────────────────────────────────────── */
let currentTemplate = null;
let templateImage   = null;

let dragTarget = null, dragOffset = { x: 0, y: 0 }, dragRaf = null;
let resizeTarget = null, resizeHandle = null, resizeStart = null, resizeRaf = null;

let titleState       = null;
let authorState      = null;
let spineTitleState  = null;
let spineAuthorState = null;

/* ── DOM (preview / gallery — never change) ────────── */
const gallerySection     = $('gallery-section');
const editorSection      = $('editor-section');
const templateGallery    = $('template-gallery');
const backBtn            = $('back-btn');
const editorPreview      = $('editor-preview');
const previewImage       = $('preview-image');
const titleBlock         = $('title-block');
const authorBlock        = $('author-block');
const spineTitleBlock    = $('spine-title-block');
const spineAuthorBlock   = $('spine-author-block');
const downloadBtn        = $('download-btn');
const saveTemplateBtn    = $('save-template-btn');

/* ── template storage ───────────────────────────────── */

const STORAGE_KEY = 'textOnPhoto_userTemplates';

function getUserTemplates() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('Failed to load user templates:', e);
    return [];
  }
}

function saveUserTemplate(template) {
  const templates = getUserTemplates();
  templates.push(template);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    return true;
  } catch (e) {
    console.error('Failed to save template:', e);
    if (e.name === 'QuotaExceededError') {
      alert('Storage limit exceeded. Please delete some saved templates.');
    }
    return false;
  }
}

function deleteUserTemplate(id) {
  const templates = getUserTemplates().filter(t => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

function getAllTemplates() {
  return [...TEMPLATES, ...getUserTemplates()];
}

function captureCurrentState() {
  if (!currentTemplate || !previewImage.src) return null;

  // Use the original template image if it's a data URL, otherwise capture current preview
  let imageDataUrl = previewImage.src;
  
  // If it's not already a data URL, capture the current preview
  if (!imageDataUrl.startsWith('data:')) {
    if (!previewImage.complete || previewImage.naturalWidth === 0) {
      alert('Image is still loading. Please wait a moment and try again.');
      return null;
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = previewImage.naturalWidth || previewImage.width;
    canvas.height = previewImage.naturalHeight || previewImage.height;
    ctx.drawImage(previewImage, 0, 0);
    imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
  }

  // Capture all settings for each block
  const captureBlock = (type) => {
    const s = readSettings(type);
    let state = null;
    if (type === 'title') state = titleState;
    else if (type === 'author') state = authorState;
    else if (type === 'spineTitle') state = spineTitleState;
    else if (type === 'spineAuthor') state = spineAuthorState;
    return {
      settings: s,
      state: state ? { ...state } : null
    };
  };

  return {
    id: 'user_' + Date.now(),
    name: prompt('Enter a name for this template:') || `Saved Template ${new Date().toLocaleDateString()}`,
    image: imageDataUrl,
    isUserTemplate: true,
    timestamp: Date.now(),
    blocks: {
      title: captureBlock('title'),
      author: captureBlock('author'),
      spineTitle: captureBlock('spineTitle'),
      spineAuthor: captureBlock('spineAuthor')
    }
  };
}

function restoreTemplateState(savedTemplate) {
  if (!savedTemplate.blocks) return;

  const restoreBlock = (type, blockData) => {
    if (!blockData || !blockData.settings || !blockData.state) return;
    const { settings, state } = blockData;
    const p = PREFIX[type];

    // Restore all settings
    if ($(p + '-text'))          $(p + '-text').value = settings.text || '';
    if ($(p + '-font'))          $(p + '-font').value = settings.font || 'Cinzel';
    if ($(p + '-color'))         $(p + '-color').value = settings.color || '#ded8ae';
    if ($(p + '-color-hex'))     $(p + '-color-hex').textContent = settings.color || '#ded8ae';
    if ($(p + '-bold'))          $(p + '-bold').checked = settings.bold ?? true;
    if ($(p + '-italic'))        $(p + '-italic').checked = settings.italic ?? false;
    if ($(p + '-spacing'))       $(p + '-spacing').value = settings.spacing ?? 1;
    if ($(p + '-spacing-value')) $(p + '-spacing-value').textContent = ((settings.spacing ?? 1) / 10).toFixed(1) + 'em';
    if ($(p + '-effect'))        $(p + '-effect').value = settings.effect || 'embossed';
    if ($(p + '-size'))          $(p + '-size').value = state.fontSize;
    if ($(p + '-size-value'))    $(p + '-size-value').textContent = state.fontSize + 'px';
    if ($(p + '-tilt-x'))        $(p + '-tilt-x').value = state.tiltX;
    if ($(p + '-tilt-x-value'))  $(p + '-tilt-x-value').textContent = state.tiltX + '°';
    if ($(p + '-tilt-y'))        $(p + '-tilt-y').value = state.tiltY;
    if ($(p + '-tilt-y-value'))  $(p + '-tilt-y-value').textContent = state.tiltY + '°';
    if ($(p + '-curve'))         $(p + '-curve').value = settings.curve ?? 0;
    if ($(p + '-curve-value'))   $(p + '-curve-value').textContent = String(settings.curve ?? 0);
    if ($(p + '-feather'))              $(p + '-feather').checked = settings.feather ?? false;
    if ($(p + '-feather-amount'))       $(p + '-feather-amount').value = settings.featherAmount ?? 50;
    if ($(p + '-feather-amount-value')) $(p + '-feather-amount-value').textContent = String(settings.featherAmount ?? 50);

    // Restore state
    setState(type, { ...state });
  };

  restoreBlock('title', savedTemplate.blocks.title);
  restoreBlock('author', savedTemplate.blocks.author);
  restoreBlock('spineTitle', savedTemplate.blocks.spineTitle);
  restoreBlock('spineAuthor', savedTemplate.blocks.spineAuthor);
}

/* ── init ────────────────────────────────────────────── */
function init() {
  renderGallery();
  bindEvents();
}

function renderGallery() {
  const allTemplates = getAllTemplates();
  
  // Use the exact name from template config (already set correctly)
  const validTemplates = allTemplates.map(t => {
    // Use the name directly from config - it's already set correctly
    const displayName = t.name || 'Untitled Template';
    return { ...t, displayName: displayName.trim() };
  });

  templateGallery.innerHTML = validTemplates.map(t => {
    const name = t.displayName || t.name || 'Untitled';
    return `
    <div class="template-card" data-id="${t.id}" data-user="${t.isUserTemplate ? 'true' : 'false'}" data-card-id="${t.id}">
      <img src="${t.image}" alt="${name}" loading="lazy" 
           data-template-id="${t.id}">
      <div class="template-name">${name}</div>
      ${t.isUserTemplate ? `<button class="delete-template-btn" data-id="${t.id}" title="Delete template">×</button>` : ''}
    </div>
  `;
  }).join('');

  // Handle image load errors - hide cards with missing images
  templateGallery.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', function() {
      const card = this.closest('.template-card');
      if (card) {
        card.style.display = 'none';
      }
    });
    
    // Also check if image is already broken
    if (!img.complete || img.naturalWidth === 0) {
      img.addEventListener('load', function() {
        // Image loaded successfully, ensure card is visible
        const card = this.closest('.template-card');
        if (card) card.style.display = '';
      });
    }
  });

  // Add delete handlers for user templates
  templateGallery.querySelectorAll('.delete-template-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (confirm('Delete this saved template?')) {
        deleteUserTemplate(id);
        renderGallery();
      }
    });
  });
}

/* ── events ──────────────────────────────────────────── */
function bindEvents() {
  templateGallery.addEventListener('click', e => {
    const card = e.target.closest('.template-card');
    if (card) selectTemplate(card.dataset.id);
  });

  backBtn.addEventListener('click', () => {
    editorSection.classList.add('hidden');
    gallerySection.classList.remove('hidden');
    currentTemplate = null;
  });

  /* All inputs inside the controls panel trigger updateOverlays */
  const panel = document.querySelector('.controls-panel');
  const debouncedUpdate = debounce(updateOverlays, 80);
  panel.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('input',  debouncedUpdate);
    el.addEventListener('change', debouncedUpdate);
  });

  /* Auto-update value display spans for range / colour inputs */
  panel.querySelectorAll('input[type="range"]').forEach(el => {
    el.addEventListener('input', () => {
      const valEl = $(el.id + '-value');
      if (!valEl) return;
      if (el.id.endsWith('-spacing'))              valEl.textContent = (parseInt(el.value) / 10).toFixed(1) + 'em';
      else if (el.id.endsWith('-curve'))            valEl.textContent = el.value;
      else if (el.id.endsWith('-feather-amount'))   valEl.textContent = el.value;
      else if (el.id.endsWith('-tilt-x') || el.id.endsWith('-tilt-y')) valEl.textContent = el.value + '°';
      else                                          valEl.textContent = el.value + 'px';
    });
  });

  panel.querySelectorAll('input[type="color"]').forEach(el => {
    el.addEventListener('input', () => {
      const hex = $(el.id + '-hex');
      if (hex) hex.textContent = el.value;
    });
  });

  downloadBtn.addEventListener('click', downloadImage);

  saveTemplateBtn.addEventListener('click', () => {
    if (!currentTemplate || !previewImage.src) {
      alert('Please select a template and add some text first.');
      return;
    }

    const saved = captureCurrentState();
    if (!saved) {
      alert('Failed to capture current state. Please try again.');
      return;
    }

    if (saveUserTemplate(saved)) {
      alert(`Template "${saved.name}" saved successfully!`);
      renderGallery(); // Refresh gallery to show new template
    } else {
      alert('Failed to save template. Storage may be full.');
    }
  });

  /* Drag — on block body (not handles) */
  [titleBlock, authorBlock, spineTitleBlock, spineAuthorBlock].filter(Boolean).forEach(b => {
    b.addEventListener('mousedown', startDrag);
  });

  /* Resize — on handles */
  document.querySelectorAll('.resize-handle').forEach(h => {
    h.addEventListener('mousedown', startResize);
  });

  document.addEventListener('mousemove', onPointerMove);
  document.addEventListener('mouseup',   endPointer);
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ── spine canvas renderer ───────────────────────────── */

/**
 * Render spine text with cylindrical barrel distortion.
 *
 * 1.  Draws flat text + emboss shadows onto an offscreen canvas.
 * 2.  Warps column-by-column through barrel projection.
 * 3.  Optionally feathers the left edge.
 */
function renderSpineArcText(canvas, text, opts) {
  const {
    fontSize, fontFamily, color, curve, bold, italic,
    effect, effectColor, letterSpacingEm, feather, featherAmount
  } = opts;

  const parent = canvas.parentElement;
  if (!parent) return;
  const parentW = parent.offsetWidth, parentH = parent.offsetHeight;
  if (parentW < 2 || parentH < 2) return;

  const scale = 3;
  const w = Math.round(parentW * scale);
  const h = Math.round(parentH * scale);
  canvas.width = w;  canvas.height = h;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  const lines = text.split('\n').filter(l => l.length > 0);
  if (!lines.length) return;

  const fontWeight = bold ? '700' : '400';
  const fontStyle  = italic ? 'italic ' : '';
  const scaledSize = Math.round(fontSize * scale);
  const fontStr    = `${fontStyle}${fontWeight} ${scaledSize}px "${fontFamily}", Georgia, serif`;

  const lineHeight   = scaledSize * 1.3;
  const totalTextH   = lines.length * lineHeight;
  const startY       = (h - totalTextH) / 2 + lineHeight / 2;
  const extraSpacing = (letterSpacingEm || 0) * scaledSize;

  /* step 1: flat render to offscreen */
  const off = document.createElement('canvas');
  off.width = w;  off.height = h;
  const oc = off.getContext('2d');

  const shadows = getCanvasTextShadows(effect, effectColor || color, scale);

  for (let li = 0; li < lines.length; li++) {
    const y = startY + li * lineHeight;
    shadows.forEach(s => {
      oc.save();
      oc.font = fontStr; oc.fillStyle = s.color; oc.globalAlpha = s.alpha;
      oc.textAlign = 'center'; oc.textBaseline = 'middle';
      if (s.blur > 0) oc.filter = `blur(${s.blur * scale}px)`;
      _drawSpacedText(oc, lines[li], w/2 + s.ox*scale, y + s.oy*scale, extraSpacing);
      oc.restore();
    });
    oc.save();
    oc.font = fontStr; oc.fillStyle = color; oc.globalAlpha = 1;
    oc.textAlign = 'center'; oc.textBaseline = 'middle'; oc.filter = 'none';
    _drawSpacedText(oc, lines[li], w/2, y, extraSpacing);
    oc.restore();
  }

  /* step 2: barrel warp */
  const k = Math.abs(curve) * 0.08;
  if (k < 0.01) {
    ctx.drawImage(off, 0, 0);
  } else {
    const cx = w / 2;
    for (let x = 0; x < w; x++) {
      const nxOut = (x - cx) / cx;
      const r     = Math.abs(nxOut);
      const srcR  = r * (1 + k * r * r) / (1 + k);
      const nxSrc = nxOut >= 0 ? srcR : -srcR;
      const srcX  = cx + nxSrc * cx;
      if (srcX < 0 || srcX >= w) continue;
      const edgeFade = 1 - 0.25 * r * r * (k / (k + 1));
      ctx.save();
      ctx.globalAlpha = edgeFade;
      ctx.drawImage(off, Math.round(srcX), 0, 1, h, x, 0, 1, h);
      ctx.restore();
    }
  }

  /* step 3: first-letter feather (fade the first char from transparent→opaque) */
  if (feather && featherAmount > 0 && lines.length > 0) {
    // Measure the first line to find where the first character sits
    const measCanvas = document.createElement('canvas');
    const measCtx    = measCanvas.getContext('2d');
    measCtx.font     = fontStr;

    const firstLine  = lines[0];
    const chars      = firstLine.split('');
    const charWidths = chars.map(c => measCtx.measureText(c).width);
    const totalLineW = charWidths.reduce((a, b) => a + b, 0)
                     + extraSpacing * Math.max(0, chars.length - 1);

    // Left edge of the first character (text is centered horizontally)
    const textLeftX  = (w - totalLineW) / 2;
    const firstCharW = charWidths[0] + extraSpacing;

    // Slider (1-100) → feather zone width relative to first char
    //   50 → exactly first char width
    //  100 → 2× first char width (broader)
    //    1 → tiny sliver
    const fadeWidth = Math.max(scale * 2, firstCharW * (featherAmount / 50));
    const fadeStart = Math.max(0, textLeftX);
    const fadeEnd   = fadeStart + fadeWidth;

    // Build ONE gradient that spans the entire canvas width so we can
    // apply the mask in a single fillRect (destination-in erases pixels
    // outside each individual draw call, so multiple fills would wipe text).
    const stopStart = Math.min(fadeStart / w, 0.999);
    const stopEnd   = Math.min(fadeEnd   / w, 1);

    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0,         'rgba(0,0,0,0)');   // left margin: transparent
    grad.addColorStop(stopStart, 'rgba(0,0,0,0)');   // still transparent at text edge
    grad.addColorStop(stopEnd,   'rgba(0,0,0,1)');   // fully opaque after feather
    grad.addColorStop(1,         'rgba(0,0,0,1)');   // rest of text: untouched

    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);                        // single call — covers whole canvas
    ctx.globalCompositeOperation = 'source-over';
  }
}

function _drawSpacedText(ctx, text, x, y, spacing) {
  if (spacing <= 0) { ctx.fillText(text, x, y); return; }
  const chars  = text.split('');
  const widths = chars.map(c => ctx.measureText(c).width);
  const totalW = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = x - totalW / 2;
  const saved = ctx.textAlign;
  ctx.textAlign = 'left';
  for (let i = 0; i < chars.length; i++) { ctx.fillText(chars[i], cx, y); cx += widths[i] + spacing; }
  ctx.textAlign = saved;
}

function getCanvasTextShadows(effect, _color, scale) {
  if (effect === 'embossed') return [
    { ox:-1, oy:-1, blur:0, color:'rgba(255,255,255,0.7)', alpha:0.7 },
    { ox:-1.5, oy:-1.5, blur:1, color:'rgba(255,255,240,0.5)', alpha:0.5 },
    { ox:1, oy:1, blur:0, color:'rgba(0,0,0,0.3)', alpha:0.3 },
    { ox:2, oy:2, blur:1, color:'rgba(0,0,0,0.5)', alpha:0.5 },
    { ox:3, oy:3, blur:2, color:'rgba(0,0,0,0.4)', alpha:0.4 }
  ];
  if (effect === 'debossed') return [
    { ox:0, oy:0, blur:1, color:'rgba(0,0,0,0.8)', alpha:0.8 },
    { ox:1, oy:1, blur:1, color:'rgba(0,0,0,0.6)', alpha:0.6 },
    { ox:2, oy:2, blur:2, color:'rgba(0,0,0,0.5)', alpha:0.5 },
    { ox:-1, oy:-1, blur:0, color:'rgba(255,255,240,0.5)', alpha:0.5 }
  ];
  return [];
}

/* CSS text-shadow for cover blocks */
function getTextEffectStyles(effect, colorHex) {
  const r = parseInt(colorHex.slice(1,3),16), g = parseInt(colorHex.slice(3,5),16), b = parseInt(colorHex.slice(5,7),16);
  const h = Math.min(255,r+100), hg = Math.min(255,g+100), hb = Math.min(255,b+100);
  const highlight = 'rgba(255,255,255,0.75)', lightEdge = `rgba(${h},${hg},${hb},0.95)`;
  const shadow = 'rgba(0,0,0,0.55)', deepShadow = 'rgba(0,0,0,0.75)';
  if (effect === 'embossed') return { textShadow: [
    `0 0 0 rgba(0,0,0,0.1)`,`-1px -1px 0 ${highlight}`,`-2px -2px 2px ${lightEdge}`,
    `-3px -3px 4px rgba(255,255,240,0.4)`,`1px 1px 0 rgba(0,0,0,0.2)`,`2px 2px 1px ${shadow}`,
    `3px 3px 3px ${shadow}`,`4px 4px 6px ${deepShadow}`,`5px 5px 8px rgba(0,0,0,0.4)`,
    `0 0 2px rgba(0,0,0,0.15)`
  ].join(', ') };
  if (effect === 'debossed') return { textShadow: [
    `0 0 1px ${deepShadow}`,`0 0 3px rgba(0,0,0,0.9)`,`1px 1px 2px ${deepShadow}`,
    `2px 2px 4px rgba(0,0,0,0.85)`,`3px 3px 6px rgba(0,0,0,0.7)`,`-1px -1px 0 ${lightEdge}`,
    `-2px -2px 1px rgba(255,255,240,0.5)`,`0 -1px 0 rgba(255,255,255,0.3)`,`1px 2px 0 rgba(0,0,0,0.6)`
  ].join(', ') };
  return { textShadow: 'none' };
}

/* ── drag / resize ───────────────────────────────────── */

function startDrag(e) {
  if (e.target.closest('.resize-handle')) return;
  e.preventDefault();
  const block = e.currentTarget.classList.contains('text-block') ? e.currentTarget : e.currentTarget.closest('.text-block');
  if (!block) return;
  const tc = block.querySelector('.text-content');
  const cv = block.querySelector('.spine-canvas');
  if (!(tc?.textContent?.trim() || (cv && cv.width > 0))) return;
  dragTarget = block;
  block.classList.add('dragging');
  const blockRect = block.getBoundingClientRect();
  dragOffset = { x: e.clientX - blockRect.left, y: e.clientY - blockRect.top };
}

function startResize(e) {
  e.preventDefault(); e.stopPropagation();
  const handle = e.currentTarget;
  const block  = handle.closest('.text-block');
  const type   = block.dataset.type;
  resizeTarget = block;
  resizeHandle = handle.dataset.handle;
  handle.classList.add('resizing');
  const state = getState(type);
  resizeStart = { left: state.left, top: state.top, width: state.width, height: state.height, fontSize: state.fontSize, mouseX: e.clientX, mouseY: e.clientY };
}

function getState(type) {
  return type === 'title' ? titleState : type === 'author' ? authorState : type === 'spineTitle' ? spineTitleState : spineAuthorState;
}

function setState(type, s) {
  if (type === 'title')            titleState       = s;
  else if (type === 'author')      authorState      = s;
  else if (type === 'spineTitle')  spineTitleState  = s;
  else if (type === 'spineAuthor') spineAuthorState = s;
}

function onPointerMove(e) {
  const rect = editorPreview.getBoundingClientRect();

  if (resizeTarget && resizeHandle) {
    const type  = resizeTarget.dataset.type;
    const dx    = ((e.clientX - resizeStart.mouseX) / rect.width)  * 100;
    const dy    = ((e.clientY - resizeStart.mouseY) / rect.height) * 100;
    let { left, top, width, height, fontSize } = resizeStart;
    const minW = 5, minH = 3;

    switch (resizeHandle) {
      case 'se': width = Math.max(minW, resizeStart.width + dx); height = Math.max(minH, resizeStart.height + dy); break;
      case 'sw': width = Math.max(minW, resizeStart.width - dx); height = Math.max(minH, resizeStart.height + dy); left = resizeStart.left + dx; break;
      case 'ne': width = Math.max(minW, resizeStart.width + dx); height = Math.max(minH, resizeStart.height - dy); top = resizeStart.top + dy; break;
      case 'nw': width = Math.max(minW, resizeStart.width - dx); height = Math.max(minH, resizeStart.height - dy); left = resizeStart.left + dx; top = resizeStart.top + dy; break;
    }

    const maxFontMap = { title: 200, author: 150, spineTitle: 80, spineAuthor: 60 };
    const maxFont = maxFontMap[type] || 150;
    fontSize = Math.round(Math.max(6, Math.min(maxFont, resizeStart.fontSize * Math.min(width / resizeStart.width, height / resizeStart.height))));

    const prev = getState(type);
    setState(type, { ...prev, left, top, width, height, fontSize });

    /* sync the size slider */
    const p = PREFIX[type];
    const sizeEl = $(p + '-size'), sizeVal = $(p + '-size-value');
    if (sizeEl)  sizeEl.value = fontSize;
    if (sizeVal) sizeVal.textContent = fontSize + 'px';

    if (!resizeRaf) { resizeRaf = requestAnimationFrame(() => { updateOverlays(); resizeRaf = null; }); }
    return;
  }

  if (dragTarget) {
    const leftPct = ((e.clientX - rect.left - dragOffset.x) / rect.width)  * 100;
    const topPct  = ((e.clientY - rect.top  - dragOffset.y) / rect.height) * 100;
    const type = dragTarget.dataset.type;
    const s    = getState(type);
    setState(type, { ...s, left: Math.max(0, Math.min(95 - s.width, leftPct)), top: Math.max(0, Math.min(95 - s.height, topPct)) });
    if (!dragRaf) { dragRaf = requestAnimationFrame(() => { updateOverlays(); dragRaf = null; }); }
  }
}

function endPointer() {
  if (dragTarget)  { dragTarget.classList.remove('dragging'); dragTarget = null; }
  if (resizeTarget){ resizeTarget.querySelectorAll('.resize-handle').forEach(h => h.classList.remove('resizing')); resizeTarget = null; resizeHandle = null; }
}

/* ── template selection ──────────────────────────────── */

function selectTemplate(id) {
  const allTemplates = getAllTemplates();
  const template = allTemplates.find(t => t.id === id);
  if (!template) return;

  currentTemplate = template;
  templateImage   = new Image();

  templateImage.onload = () => {
    document.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
    document.querySelector(`[data-id="${id}"]`)?.classList.add('selected');
    gallerySection.classList.add('hidden');
    editorSection.classList.remove('hidden');

    if (template.isUserTemplate && template.blocks) {
      // User template: restore all saved settings
      titleState       = template.blocks.title?.state       || null;
      authorState      = template.blocks.author?.state      || null;
      spineTitleState  = template.blocks.spineTitle?.state  || null;
      spineAuthorState = template.blocks.spineAuthor?.state || null;
      restoreTemplateState(template);
    } else {
      // System template: use default regions
      const r = template.regions;
      const defTiltX = template.tiltX ?? -3, defTiltY = template.tiltY ?? -12;
      const spTiltX = -5, spTiltY = -15;

      titleState       = { left: r.title.left, top: r.title.top, width: r.title.width, height: r.title.height, fontSize: 36, tiltX: defTiltX, tiltY: defTiltY };
      authorState      = { left: r.author.left, top: r.author.top, width: r.author.width, height: r.author.height, fontSize: 24, tiltX: defTiltX, tiltY: defTiltY };
      spineTitleState  = r.spineTitle  ? { left: r.spineTitle.left, top: r.spineTitle.top, width: r.spineTitle.width, height: r.spineTitle.height, fontSize: 14, tiltX: spTiltX, tiltY: spTiltY } : null;
      spineAuthorState = r.spineAuthor ? { left: r.spineAuthor.left, top: r.spineAuthor.top, width: r.spineAuthor.width, height: r.spineAuthor.height, fontSize: 10, tiltX: spTiltX, tiltY: spTiltY } : null;

      resetControls('title',       { text:'', size:36, tiltX:defTiltX, tiltY:defTiltY });
      resetControls('author',      { text:'', size:24, tiltX:defTiltX, tiltY:defTiltY });
      resetControls('spineTitle',  { text:'', size:14, tiltX:spTiltX, tiltY:spTiltY, curve:8 });
      resetControls('spineAuthor', { text:'', size:10, tiltX:spTiltX, tiltY:spTiltY, curve:8 });
    }

    previewImage.src = template.image;
    updateOverlays();
  };

  templateImage.onerror = () => {
    alert('Could not load image: ' + template.image + '\nAdd your images to the templates/ folder.');
  };
  templateImage.src = template.image;
}

/* ── main render loop ────────────────────────────────── */

function updateOverlays() {
  if (!currentTemplate || !templateImage) return;
  renderCoverBlock('title',  titleBlock,  titleState);
  renderCoverBlock('author', authorBlock, authorState);
  renderSpineBlock('spineTitle',  spineTitleBlock,  spineTitleState);
  renderSpineBlock('spineAuthor', spineAuthorBlock, spineAuthorState);
}

function renderCoverBlock(type, block, state) {
  if (!block || !state) return;
  const s   = readSettings(type);
  const p   = PREFIX[type];

  /* sync size / tilt from sliders (skip during active resize) */
  if (resizeTarget?.dataset.type !== type) {
    state.fontSize = parseInt($(p + '-size')?.value   ?? state.fontSize);
    state.tiltX    = parseInt($(p + '-tilt-x')?.value ?? state.tiltX);
    state.tiltY    = parseInt($(p + '-tilt-y')?.value ?? state.tiltY);
  }

  const tc = block.querySelector('.text-content');
  tc.textContent   = s.text || '';
  block.style.display = s.text ? 'flex' : 'none';

  if (s.text) {
    block.style.left      = `${state.left}%`;
    block.style.top       = `${state.top}%`;
    block.style.width     = `${state.width}%`;
    block.style.height    = `${state.height}%`;
    block.style.fontSize  = `${state.fontSize}px`;
    block.style.fontFamily = `"${s.font}", Georgia, serif`;
    block.style.color     = s.color;
    block.style.transform = `perspective(600px) rotateX(${state.tiltX}deg) rotateY(${state.tiltY}deg)`;

    const spacingEm = (s.spacing / 10).toFixed(1) + 'em';
    const fx        = getTextEffectStyles(s.effect, s.color);
    tc.style.fontWeight    = s.bold ? '700' : '400';
    tc.style.fontStyle     = s.italic ? 'italic' : 'normal';
    tc.style.letterSpacing = spacingEm;
    tc.style.textShadow    = s.effect !== 'none' ? fx.textShadow : 'none';
  }
}

function renderSpineBlock(type, block, state) {
  if (!block || !state) return;
  const s = readSettings(type);
  const p = PREFIX[type];

  if (resizeTarget?.dataset.type !== type) {
    state.fontSize = parseInt($(p + '-size')?.value   ?? state.fontSize);
    state.tiltX    = parseInt($(p + '-tilt-x')?.value ?? state.tiltX);
    state.tiltY    = parseInt($(p + '-tilt-y')?.value ?? state.tiltY);
  }

  const canvas = block.querySelector('.spine-canvas');
  block.style.display = s.text ? 'flex' : 'none';

  if (s.text && canvas) {
    block.style.left   = `${state.left}%`;
    block.style.top    = `${state.top}%`;
    block.style.width  = `${state.width}%`;
    block.style.height = `${state.height}%`;
    block.style.transform = `perspective(600px) rotateX(${state.tiltX}deg) rotateY(${state.tiltY}deg)`;

    renderSpineArcText(canvas, s.text, {
      fontSize:       state.fontSize,
      fontFamily:     s.font,
      color:          s.color,
      curve:          s.curve,
      bold:           s.bold,
      italic:         s.italic,
      effect:         s.effect,
      effectColor:    s.color,
      letterSpacingEm: s.spacing / 10,
      feather:        s.feather,
      featherAmount:  s.featherAmount
    });
  }
}

/* ── download ────────────────────────────────────────── */

function downloadImage() {
  if (!editorPreview || !currentTemplate) return;
  const has = ['title','author','spineTitle','spineAuthor'].some(t => readSettings(t).text);
  if (!has) { alert('Add some text first.'); return; }

  document.querySelectorAll('.resize-handle').forEach(h => { h.style.opacity = '0'; });

  html2canvas(editorPreview, { useCORS:true, allowTaint:true, scale:2, backgroundColor:null, logging:false })
    .then(canvas => {
      document.querySelectorAll('.resize-handle').forEach(h => { h.style.opacity = ''; });
      const link = document.createElement('a');
      link.download = `text-on-photo-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    })
    .catch(err => {
      document.querySelectorAll('.resize-handle').forEach(h => { h.style.opacity = ''; });
      console.error('Export failed:', err);
      alert('Export failed. Try again.');
    });
}

init();
