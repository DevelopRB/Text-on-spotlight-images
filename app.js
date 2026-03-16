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
  const textEl = document.getElementById(p + '-text');

  let rawText = (textEl && textEl.value || '')
                .replace(/\r\n/g, '\n')
                .replace(/\r/g, '\n');

  return {
    text: rawText, // ✅ DO NOT modify case here
    font:    'Times New Roman',
    color:   $(p + '-color')?.value   || '#ded8ae',
    bold:    $(p + '-bold')?.checked  ?? true,
    italic:  $(p + '-italic')?.checked ?? false,
    spacing: parseInt($(p + '-spacing')?.value ?? 0),
    lineSpacing: parseInt($(p + '-line-spacing')?.value ?? 9),
    alignment: ($(p + '-alignment')?.value || 'center'),
    effect:  'none',
    // Curve/feather disabled: keep flat spine text with no feathering
    curve:         0,
    feather:       false,
    featherAmount: 50
  };
}

/** Reset all controls for a block to given defaults. */
function resetControls(type, defs) {
  const p = PREFIX[type];
  const el = s => $(p + '-' + s);
  if (el('text'))          el('text').value      = defs.text || '';
  if (el('color'))         el('color').value     = defs.color || '#ded8ae';
  if (el('color-hex'))     el('color-hex').textContent = defs.color || '#ded8ae';
  if (el('bold'))          el('bold').checked    = defs.bold ?? true;
  if (el('italic'))        el('italic').checked  = defs.italic ?? false;
  if (el('spacing'))           el('spacing').value   = defs.spacing ?? 0;
  if (el('spacing-value'))     el('spacing-value').textContent = ((defs.spacing ?? 0) / 10).toFixed(1) + 'em';
  if (el('line-spacing'))      el('line-spacing').value = defs.lineSpacing ?? 9;
  if (el('line-spacing-value')) el('line-spacing-value').textContent = ((defs.lineSpacing ?? 9) / 10).toFixed(1);
  if (el('alignment'))      el('alignment').value = defs.alignment || 'center';
  if (el('size'))           el('size').value     = defs.size;
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
let rotateTarget = null, rotateStart = null, rotateRaf = null;

let titleState       = null;
let authorState      = null;
let spineTitleState  = null;
let spineAuthorState = null;

let zoomLevel = 1.0; // 1.0 = 100%

/* ── DOM (preview / gallery — never change) ────────── */
const gallerySection         = $('gallery-section');
const editorSection          = $('editor-section');
const templateGallery        = $('template-gallery'); // Legacy - will be replaced
const defaultFrontGallery    = $('default-front-gallery');
const defaultSpineGallery    = $('default-spine-gallery');
const savedTemplateGallery   = $('saved-template-gallery');
const noSavedTemplatesMsg    = $('no-saved-templates');
const backBtn               = $('back-btn');

// Debug: Check if elements exist
if (!savedTemplateGallery) {
  console.error('saved-template-gallery element not found!');
}
const editorPreview      = $('editor-preview');
const previewImage       = $('preview-image');
const spineImagePreview  = $('spine-image-preview');
const spinePreviewImage  = $('spine-preview-image');
const titleBlock         = $('title-block');
const authorBlock        = $('author-block');
const spineTitleBlock    = $('spine-title-block');
const spineAuthorBlock   = $('spine-author-block');
const downloadBtn        = $('download-btn');
const saveTemplateBtn    = $('save-template-btn');
const zoomInBtn          = $('zoom-in-btn');
const zoomOutBtn         = $('zoom-out-btn');
const zoomResetBtn       = $('zoom-reset-btn');
const zoomLevelDisplay   = $('zoom-level');

/* ── template storage ───────────────────────────────── */

// File-based template storage using Electron IPC
let savedTemplatesCache = [];

async function getUserTemplates() {
  try {
    // Use Electron IPC if available, otherwise fallback to localStorage
    if (typeof require !== 'undefined' && require('electron')) {
      const { ipcRenderer } = require('electron');
      const result = await ipcRenderer.invoke('load-templates');
      if (result.success) {
        savedTemplatesCache = result.templates;
        console.log('Loaded templates from My templates folder:', result.templates.length);
        return result.templates.filter(t => t && t.id && t.image);
      }
    }
    
    // Fallback to localStorage for browser compatibility
    const STORAGE_KEY = 'textOnPhoto_userTemplates';
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const templates = JSON.parse(stored);
      return templates.filter(t => t && t.id && t.image);
    }
    return [];
  } catch (e) {
    console.error('Failed to load user templates:', e);
    return [];
  }
}

async function saveUserTemplate(template) {
  // Validate template before saving
  if (!template || !template.id || !template.image) {
    console.error('Invalid template structure:', template);
    alert('Template structure is invalid. Cannot save.');
    return false;
  }
  
  try {
    // Use Electron IPC if available
    if (typeof require !== 'undefined' && require('electron')) {
      const { ipcRenderer } = require('electron');
      const result = await ipcRenderer.invoke('save-template', template);
      if (result.success) {
        console.log('Template saved to My templates folder:', result.filename);
        savedTemplatesCache.push(template);
        return true;
      } else {
        alert('Failed to save template: ' + (result.error || 'Unknown error'));
        return false;
      }
    }
    
    // Fallback to localStorage
    const STORAGE_KEY = 'textOnPhoto_userTemplates';
    const templates = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    templates.push(template);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    console.log('Template saved to localStorage (fallback)');
    return true;
  } catch (e) {
    console.error('Failed to save template:', e);
    alert('Failed to save template: ' + e.message);
    return false;
  }
}

async function addNewTemplate() {
  try {
    if (typeof require === 'undefined' || !require('electron')) {
      alert('Add new template is only available in the desktop app.');
      return;
    }
    const { ipcRenderer } = require('electron');
    const result = await ipcRenderer.invoke('add-new-template');
    if (result.cancelled) return;
    if (!result.success) {
      alert('Failed to add template: ' + (result.error || 'Unknown error'));
      return;
    }
    if (result.template) {
      savedTemplatesCache.push(result.template);
      await renderGallery();
      await selectTemplate(result.template.id);
    }
  } catch (e) {
    console.error('Add new template:', e);
    alert('Failed to add template: ' + (e.message || 'Unknown error'));
  }
}

async function deleteUserTemplate(id) {
  try {
    // Use Electron IPC if available
    if (typeof require !== 'undefined' && require('electron')) {
      const { ipcRenderer } = require('electron');
      const result = await ipcRenderer.invoke('delete-template', id);
      if (result.success) {
        savedTemplatesCache = savedTemplatesCache.filter(t => t.id !== id);
        console.log('Template deleted from My templates folder');
        return true;
      }
    }
    
    // Fallback to localStorage
    const STORAGE_KEY = 'textOnPhoto_userTemplates';
    const templates = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates.filter(t => t.id !== id)));
    return true;
  } catch (e) {
    console.error('Failed to delete template:', e);
    return false;
  }
}

async function getAllTemplates() {
  const defaultTemplates = (typeof TEMPLATES !== 'undefined' && Array.isArray(TEMPLATES)) 
    ? TEMPLATES 
    : (typeof window !== 'undefined' && window.TEMPLATES && Array.isArray(window.TEMPLATES))
      ? window.TEMPLATES
      : [];
  const savedTemplates = await getUserTemplates();
  return [...defaultTemplates, ...savedTemplates];
}

function captureCurrentState() {
  if (!currentTemplate || !previewImage.src) {
    return Promise.resolve(null);
  }

  // Check if html2canvas is available
  if (typeof html2canvas === 'undefined') {
    alert('html2canvas library is not loaded. Cannot capture preview.');
    return Promise.resolve(null);
  }

  // Check if preview image is loaded
  if (!previewImage.complete || previewImage.naturalWidth === 0) {
    alert('Image is still loading. Please wait a moment and try again.');
    return Promise.resolve(null);
  }

  // Hide resize handles temporarily for clean capture
  const handles = document.querySelectorAll('.resize-handle');
  const originalOpacities = Array.from(handles).map(h => h.style.opacity);
  handles.forEach(h => { h.style.opacity = '0'; });

  // Store original zoom transform
  const originalTransform = editorPreview.style.transform;
  
  // Temporarily reset zoom for capture
  editorPreview.style.transform = 'scale(1)';

  // Use html2canvas to capture the entire preview with text overlays
  return new Promise((resolve) => {
    // Wait a bit for transform to apply and ensure fonts are loaded
    setTimeout(() => {
      // Ensure element is visible and has dimensions
      if (editorPreview.offsetWidth === 0 || editorPreview.offsetHeight === 0) {
        editorPreview.style.transform = originalTransform;
        handles.forEach((h, i) => { h.style.opacity = originalOpacities[i] || ''; });
        alert('Preview element is not visible. Please ensure the editor is displayed.');
        resolve(null);
        return;
      }

      // Wait for fonts to load
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          performCapture();
        }).catch(() => {
          // If fonts.ready fails, proceed anyway
          performCapture();
        });
      } else {
        performCapture();
      }

      async function performCapture() {
        try {
          const canvas = await html2canvas(editorPreview, {
            useCORS: true,
            allowTaint: true,
            scale: 2,
            backgroundColor: null,
            logging: false,
            onclone: (clonedDoc) => {
              const clonedPreview = clonedDoc.getElementById('editor-preview');
              if (clonedPreview) {
                clonedPreview.style.transform = 'scale(1)';
                // Hide text overlays so saved image has no baked-in text;
                // when user loads template, only the overlay shows their input
                const overlay = clonedPreview.querySelector('.text-overlay-wrapper');
                if (overlay) overlay.style.display = 'none';
              }
            }
          });

          // Restore zoom transform
          editorPreview.style.transform = originalTransform;
          
          // Restore resize handles
          handles.forEach((h, i) => { h.style.opacity = originalOpacities[i] || ''; });

          const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
          const frontBgImage = previewImage.src || '';
          const spineBgImage = (typeof spinePreviewImage !== 'undefined' && spinePreviewImage && spinePreviewImage.src) ? spinePreviewImage.src : '';

          // Capture all settings for each block
          const captureBlock = (type) => {
            const p = PREFIX[type];
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

          // Show custom modal for template name
          const templateName = await showTemplateNameDialog();
          if (!templateName) {
            // User cancelled
            resolve(null);
            return;
          }

          const template = {
            id: 'user_' + Date.now(),
            name: templateName.trim() || `Saved Template ${new Date().toLocaleDateString()}`,
            image: imageDataUrl,        // thumbnail / preview of front
            frontImage: frontBgImage,   // actual front background image
            spineImage: spineBgImage,   // actual spine background image (if any)
            isUserTemplate: true,
            timestamp: Date.now(),
            blocks: {
              title: captureBlock('title'),
              author: captureBlock('author'),
              spineTitle: captureBlock('spineTitle'),
              spineAuthor: captureBlock('spineAuthor')
            }
          };

          console.log('Template captured:', {
            id: template.id,
            name: template.name,
            imageLength: template.image ? template.image.length : 0,
            imageType: template.image ? template.image.substring(0, 50) : 'none',
            hasBlocks: !!template.blocks
          });

          resolve(template);
        } catch (err) {
          // Restore zoom transform on error
          editorPreview.style.transform = originalTransform;
          
          // Restore resize handles on error
          handles.forEach((h, i) => { h.style.opacity = originalOpacities[i] || ''; });
          console.error('Failed to capture preview:', err);
          console.error('Error details:', {
            message: err.message,
            stack: err.stack,
            previewElement: editorPreview,
            previewVisible: editorPreview.offsetWidth > 0 && editorPreview.offsetHeight > 0,
            imageLoaded: previewImage.complete && previewImage.naturalWidth > 0
          });
          alert('Failed to capture preview: ' + (err.message || 'Unknown error') + '. Please ensure the preview is visible and try again.');
          resolve(null);
        }
      }
    }, 200); // Small delay to ensure transform is applied
  });
}

function restoreTemplateState(savedTemplate) {
  if (!savedTemplate.blocks) return;

  const restoreBlock = (type, blockData) => {
    if (!blockData || !blockData.settings || !blockData.state) return;
    const { settings, state } = blockData;
    const p = PREFIX[type];

    // Restore all settings
    const textToRestore = settings.originalText !== undefined ? settings.originalText : (settings.text || '');
    if ($(p + '-text'))          $(p + '-text').value = textToRestore;
    if ($(p + '-color'))         $(p + '-color').value = settings.color || '#ded8ae';
    if ($(p + '-color-hex'))     $(p + '-color-hex').textContent = settings.color || '#ded8ae';
    if ($(p + '-bold'))          $(p + '-bold').checked = settings.bold ?? true;
    if ($(p + '-italic'))        $(p + '-italic').checked = settings.italic ?? false;
    if ($(p + '-spacing'))           $(p + '-spacing').value = settings.spacing ?? 0;
    if ($(p + '-spacing-value'))     $(p + '-spacing-value').textContent = ((settings.spacing ?? 0) / 10).toFixed(1) + 'em';
    if ($(p + '-line-spacing'))      $(p + '-line-spacing').value = settings.lineSpacing ?? 9;
    if ($(p + '-line-spacing-value')) $(p + '-line-spacing-value').textContent = ((settings.lineSpacing ?? 9) / 10).toFixed(1);
    if ($(p + '-alignment'))        $(p + '-alignment').value = settings.alignment || 'center';
    if ($(p + '-size'))             $(p + '-size').value = state.fontSize;
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

/* ── template name dialog ────────────────────────────── */
function showTemplateNameDialog() {
  return new Promise((resolve) => {
    const modal = document.getElementById('template-name-modal');
    const input = document.getElementById('template-name-input');
    const saveBtn = document.getElementById('template-name-save');
    const cancelBtn = document.getElementById('template-name-cancel');
    
    if (!modal || !input || !saveBtn || !cancelBtn) {
      console.error('Template name modal elements not found');
      resolve(null);
      return;
    }
    
    // Reset input
    input.value = '';
    modal.style.display = 'flex';
    input.focus();
    
    const handleSave = () => {
      const name = input.value.trim();
      modal.style.display = 'none';
      saveBtn.removeEventListener('click', handleSave);
      cancelBtn.removeEventListener('click', handleCancel);
      input.removeEventListener('keydown', handleKeyDown);
      resolve(name || `Saved Template ${new Date().toLocaleDateString()}`);
    };
    
    const handleCancel = () => {
      modal.style.display = 'none';
      saveBtn.removeEventListener('click', handleSave);
      cancelBtn.removeEventListener('click', handleCancel);
      input.removeEventListener('keydown', handleKeyDown);
      resolve(null);
    };
    
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    };
    
    saveBtn.addEventListener('click', handleSave);
    cancelBtn.addEventListener('click', handleCancel);
    input.addEventListener('keydown', handleKeyDown);
  });
}

/* ── init ────────────────────────────────────────────── */
function init() {
  console.log('=== INIT STARTED ===');
  
  // Wait for everything to be ready
  function initializeApp() {
    console.log('=== INITIALIZING APP ===');
    console.log('TEMPLATES available:', typeof TEMPLATES !== 'undefined', typeof window !== 'undefined' && typeof window.TEMPLATES !== 'undefined');
    
    // Render gallery
    renderGallery();
    bindEvents();
    
    // Retry after delay to ensure everything loaded
    setTimeout(async () => {
      console.log('=== RETRY RENDER ===');
      await renderGallery();
    }, 1000);
  }
  
  // Wait for DOM and scripts
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initializeApp, 200);
    });
  } else {
    setTimeout(initializeApp, 200);
  }
}

function renderTemplateCard(t) {
  if (!t || !t.id) {
    console.error('Invalid template:', t);
    return '';
  }
  const name = t.name || 'Untitled';
  let imageSrc = t.image || '';
  
  console.log('Rendering template card:', name, 'image:', imageSrc);
  
  // Handle different image path types
  if (imageSrc) {
    // Already a file URL - leave as-is
    if (imageSrc.startsWith('file://')) {
      // no-op
    }
    // Default templates: keep relative paths as-is (templates/filename.ext)
    else if (imageSrc.startsWith('templates/')) {
      // Keep relative path - Electron will resolve it relative to index.html
      // No conversion needed
    }
    // Data URLs: keep as-is
    else if (imageSrc.startsWith('data:')) {
      // Keep data URL as-is
    }
    // My templates: convert to file:// URL
    else if (imageSrc.startsWith('My templates/')) {
      if (typeof require !== 'undefined') {
        try {
          const pathModule = require('path');
          const fullPath = pathModule.join(__dirname || process.cwd(), imageSrc);
          imageSrc = `file://${fullPath.replace(/\\/g, '/')}`;
        } catch(e) {
          console.warn('Could not convert My templates image path:', e);
        }
      }
    }
    // Absolute paths: convert to file:// URL
    else if ((imageSrc.includes('\\') || imageSrc.includes('/')) && !imageSrc.startsWith('http')) {
      if (typeof require !== 'undefined') {
        try {
          imageSrc = `file://${imageSrc.replace(/\\/g, '/')}`;
        } catch(e) {
          console.warn('Could not convert absolute image path:', e);
        }
      }
    }
  }
  
  return `
    <div class="template-card" data-id="${t.id}" data-user="${t.isUserTemplate ? 'true' : 'false'}" data-card-id="${t.id}">
      <img src="${imageSrc}" alt="${name}" loading="lazy" 
           data-template-id="${t.id}" 
           onerror="console.error('Failed to load image for template:', '${name}', 'src:', this.src); this.style.border='2px solid red';">
      <div class="template-name">${name}</div>
      ${t.isUserTemplate ? `<button class="delete-template-btn" data-id="${t.id}" title="Delete template">×</button>` : ''}
    </div>
  `;
}

function setupGalleryEvents(gallery) {
  // Handle image load errors - hide cards with missing images
  gallery.querySelectorAll('img').forEach(img => {
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
  gallery.querySelectorAll('.delete-template-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (confirm('Delete this saved template?')) {
        await deleteUserTemplate(id);
        await renderGallery();
      }
    });
  });
}

async function renderGallery() {
  console.log('=== RENDER GALLERY ===');
  console.log('Window object:', typeof window);
  console.log('TEMPLATES check:', typeof TEMPLATES);
  console.log('window.TEMPLATES check:', typeof window !== 'undefined' ? typeof window.TEMPLATES : 'window undefined');
  
  // Get templates - try all possible ways with more aggressive checking
  let defaultTemplates = [];
  
  // Method 1: Direct TEMPLATES
  if (typeof TEMPLATES !== 'undefined' && Array.isArray(TEMPLATES)) {
    defaultTemplates = TEMPLATES;
    console.log('✅ Method 1: Found TEMPLATES directly:', defaultTemplates.length);
  }
  // Method 2: window.TEMPLATES
  else if (typeof window !== 'undefined' && window.TEMPLATES && Array.isArray(window.TEMPLATES)) {
    defaultTemplates = window.TEMPLATES;
    console.log('✅ Method 2: Found window.TEMPLATES:', defaultTemplates.length);
  }
  // Method 3: Try global scope
  else {
    try {
      // Try accessing via globalThis or this
      if (typeof globalThis !== 'undefined' && globalThis.TEMPLATES) {
        defaultTemplates = globalThis.TEMPLATES;
        console.log('✅ Method 3: Found globalThis.TEMPLATES:', defaultTemplates.length);
      } else {
        console.error('❌ TEMPLATES not found in any scope!');
        console.error('Available window properties:', Object.keys(window || {}).slice(0, 20));
      }
    } catch(e) {
      console.error('Error accessing TEMPLATES:', e);
    }
  }
  
  console.log('Final templates count:', defaultTemplates.length);
  if (defaultTemplates.length > 0) {
    console.log('First template:', defaultTemplates[0]);
  }
  
  // Split default templates into front vs spine groups based on filename
  const frontTemplates = defaultTemplates.filter(t => {
    const img = (t.image || '').toLowerCase();
    return !img.includes('spine');
  });
  const spineTemplates = defaultTemplates.filter(t => {
    const img = (t.image || '').toLowerCase();
    return img.includes('spine');
  });
  
  const frontGallery = document.getElementById('default-front-gallery');
  const spineGallery = document.getElementById('default-spine-gallery');

  if (frontGallery) {
    if (frontTemplates.length > 0) {
      const html = frontTemplates.map(renderTemplateCard).join('');
      console.log('Rendering front templates, count:', frontTemplates.length);
      frontGallery.innerHTML = html;
      setupGalleryEvents(frontGallery);
    } else {
      frontGallery.innerHTML = '<p style="color: var(--text-muted); padding: 1rem;">No front templates found.</p>';
    }
  }

  if (spineGallery) {
    if (spineTemplates.length > 0) {
      const html = spineTemplates.map(renderTemplateCard).join('');
      console.log('Rendering spine templates, count:', spineTemplates.length);
      spineGallery.innerHTML = html;
      setupGalleryEvents(spineGallery);
    } else {
      spineGallery.innerHTML = '<p style="color: var(--text-muted); padding: 1rem;">No spine templates found.</p>';
    }
  }
  
  // Fallback to legacy gallery
  const legacyGallery = document.getElementById('template-gallery');
  if (legacyGallery && defaultTemplates.length > 0) {
    const savedTemplates = await getUserTemplates();
    const allTemplates = [...defaultTemplates, ...savedTemplates];
    legacyGallery.innerHTML = allTemplates.map(renderTemplateCard).join('');
    setupGalleryEvents(legacyGallery);
    console.log('✅ Rendered to legacy gallery:', allTemplates.length, 'templates');
  }

  // Render saved templates (async)
  await renderSavedTemplates();
}

async function renderSavedTemplates() {
  const savedTemplates = await getUserTemplates();
  console.log('Saved templates:', savedTemplates.length);
  
  const savedGallery = document.getElementById('saved-template-gallery');
  const noSavedMsg = document.getElementById('no-saved-templates');
  const addCardHtml = `
    <div class="template-card add-template-card" id="add-new-template-card" title="Upload an image to use as a template">
      <span class="add-template-plus">+</span>
      <div class="template-name">Add new template</div>
    </div>`;

  if (savedGallery) {
    if (savedTemplates.length > 0) {
      savedGallery.innerHTML = addCardHtml + savedTemplates.map(renderTemplateCard).join('');
      setupGalleryEvents(savedGallery);
      if (noSavedMsg) noSavedMsg.style.display = 'none';
      console.log('✅ Rendered', savedTemplates.length, 'saved templates');
    } else {
      savedGallery.innerHTML = addCardHtml;
      setupGalleryEvents(savedGallery);
      if (noSavedMsg) noSavedMsg.style.display = 'block';
    }
  } else {
    console.error('❌ saved-template-gallery element not found!');
  }
}

/* ── events ──────────────────────────────────────────── */
function bindEvents() {
  // Handle clicks on both galleries using event delegation
  const handleGalleryClick = async (e) => {
    // Don't trigger on delete button clicks
    if (e.target.classList.contains('delete-template-btn')) {
      return;
    }
    
    const card = e.target.closest('.template-card');
    if (card) {
      if (card.classList.contains('add-template-card')) {
        await addNewTemplate();
        return;
      }
      const templateId = card.dataset.id;
      console.log('Template card clicked, id:', templateId);
      if (templateId) {
        await selectTemplate(templateId);
      } else {
        console.error('Template card has no id:', card);
      }
    }
  };
  
  // Use event delegation on gallery section to catch dynamically added cards
  if (gallerySection) {
    gallerySection.addEventListener('click', handleGalleryClick);
    console.log('✅ Event listener added to gallerySection');
  }
  
  // Also add to individual galleries as backup
  if (defaultFrontGallery) {
    defaultFrontGallery.addEventListener('click', handleGalleryClick);
    console.log('✅ Event listener added to defaultFrontGallery');
  }
  if (defaultSpineGallery) {
    defaultSpineGallery.addEventListener('click', handleGalleryClick);
    console.log('✅ Event listener added to defaultSpineGallery');
  }
  if (savedTemplateGallery) {
    savedTemplateGallery.addEventListener('click', handleGalleryClick);
    console.log('✅ Event listener added to savedTemplateGallery');
  }
  
  // Legacy support for old templateGallery reference
  if (templateGallery && templateGallery !== defaultTemplateGallery && templateGallery !== savedTemplateGallery) {
    templateGallery.addEventListener('click', handleGalleryClick);
  }

  backBtn.addEventListener('click', () => {
    editorSection.classList.add('hidden');
    gallerySection.classList.remove('hidden');
    currentTemplate = null;
  });

  ['title', 'author', 'spine-title', 'spine-author'].forEach(type => {
    const textInput = $(type + '-text');

    if (textInput) {
      textInput.addEventListener('input', function() {
        updateOverlays();
      });
    }
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
      if (el.id.endsWith('-spacing') && !el.id.includes('line-')) valEl.textContent = (parseInt(el.value) / 10).toFixed(1) + 'em';
      else if (el.id.endsWith('-line-spacing'))    valEl.textContent = (parseInt(el.value) / 10).toFixed(1);
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

  saveTemplateBtn.addEventListener('click', async () => {
    if (!currentTemplate || !previewImage.src) {
      alert('Please select a template and add some text first.');
      return;
    }

    // Disable button during capture
    saveTemplateBtn.disabled = true;
    saveTemplateBtn.textContent = 'Capturing...';

    const saved = await captureCurrentState();
    
    // Re-enable button
    saveTemplateBtn.disabled = false;
    saveTemplateBtn.textContent = 'Save as Template';

    if (!saved) {
      alert('Failed to capture current state. Please try again.');
      return;
    }

    const saveResult = await saveUserTemplate(saved);
    if (saveResult) {
      alert(`Template "${saved.name}" saved successfully to My templates folder!`);
      // Refresh gallery to show new template
      await renderGallery();
    } else {
      alert('Failed to save template. Please try again.');
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

  /* Rotate — on rotation handles */
  document.querySelectorAll('.rotate-handle').forEach(h => {
    h.addEventListener('mousedown', startRotate);
  });

  document.addEventListener('mousemove', onPointerMove);
  document.addEventListener('mouseup',   endPointer);

  /* Zoom controls */
  if (zoomInBtn) zoomInBtn.addEventListener('click', zoomIn);
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', zoomOut);
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', resetZoom);
  
  /* Mouse wheel zoom (Ctrl/Cmd + scroll) */
  document.addEventListener('wheel', handleWheelZoom, { passive: false });
  
  /* Initialize zoom display */
  updateZoom(1.0);
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ── zoom functionality ───────────────────────────────── */

const MIN_ZOOM = 0.25; // 25%
const MAX_ZOOM = 3.0;  // 300%
const ZOOM_STEP = 0.1; // 10% per step

function updateZoom(level) {
  zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level));
  if (editorPreview) {
    editorPreview.style.transform = `scale(${zoomLevel})`;
  }
  if (spineImagePreview) {
    spineImagePreview.style.transform = `scale(${zoomLevel})`;
  }
  if (zoomLevelDisplay) {
    zoomLevelDisplay.textContent = Math.round(zoomLevel * 100) + '%';
  }
}

function zoomIn() {
  updateZoom(zoomLevel + ZOOM_STEP);
}

function zoomOut() {
  updateZoom(zoomLevel - ZOOM_STEP);
}

function resetZoom() {
  updateZoom(1.0);
}

function handleWheelZoom(e) {
  // Only zoom when hovering over the preview area
  if (!editorPreview.contains(e.target) && !e.target.closest('.editor-preview')) {
    return;
  }
  
  // Prevent default scrolling when Ctrl/Cmd is held
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    updateZoom(zoomLevel + delta);
  }
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
    effect, effectColor, letterSpacingEm, feather, featherAmount,
    lineSpacing = 9, alignment = 'center'
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

  const lineHeightMult = (lineSpacing !== undefined ? lineSpacing / 10 : 0.9);
  const lineHeight   = scaledSize * lineHeightMult;
  const totalTextH   = lines.length * lineHeight;
  const startY       = (h - totalTextH) / 2 + lineHeight / 2;
  const extraSpacing = (letterSpacingEm || 0) * scaledSize;
  const anchorX      = alignment === 'left' ? scaledSize : alignment === 'right' ? w - scaledSize : w / 2;

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
      _drawSpacedText(oc, lines[li], anchorX + s.ox*scale, y + s.oy*scale, extraSpacing, alignment);
      oc.restore();
    });
    oc.save();
    oc.font = fontStr; oc.fillStyle = color; oc.globalAlpha = 1;
    oc.textAlign = 'center'; oc.textBaseline = 'middle'; oc.filter = 'none';
    _drawSpacedText(oc, lines[li], anchorX, y, extraSpacing, alignment);
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

function _drawSpacedText(ctx, text, x, y, spacing, align) {
  align = align || 'center';
  if (spacing <= 0) {
    const saved = ctx.textAlign;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
    ctx.textAlign = saved;
    return;
  }
  const chars  = text.split('');
  const widths = chars.map(c => ctx.measureText(c).width);
  const totalW = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = align === 'left' ? x : align === 'right' ? x - totalW : x - totalW / 2;
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
  if (e.target.closest('.resize-handle') || e.target.closest('.rotate-handle')) return;
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

function startRotate(e) {
  e.preventDefault(); e.stopPropagation();
  const handle = e.currentTarget;
  const block  = handle.closest('.text-block');
  if (!block) return;
  const type   = block.dataset.type;
  const state  = getState(type);
  const rect = block.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top  + rect.height / 2;
  const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
  const currentRot = state.rotation || 0;
  rotateTarget = block;
  block.classList.add('rotating');
  rotateStart = { type, cx, cy, startAngle, startRotation: currentRot };
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
  const active = rotateTarget || resizeTarget || dragTarget;
  const activeType = active && active.dataset ? active.dataset.type : null;
  const container = (activeType === 'spineTitle' || activeType === 'spineAuthor')
    ? (spineImagePreview || editorPreview)
    : editorPreview;
  const rect = container.getBoundingClientRect();

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

  if (rotateTarget && rotateStart) {
    const { type, cx, cy, startAngle, startRotation } = rotateStart;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    let rotation = startRotation + (angle - startAngle);
    rotation = Math.max(-90, Math.min(90, rotation));
    const prev = getState(type);
    setState(type, { ...prev, rotation });
    if (!rotateRaf) { rotateRaf = requestAnimationFrame(() => { updateOverlays(); rotateRaf = null; }); }
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
  if (rotateTarget){ rotateTarget.classList.remove('rotating'); rotateTarget = null; rotateStart = null; }
}

/* ── template selection ──────────────────────────────── */

async function selectTemplate(id) {
  console.log('selectTemplate called with id:', id);
  
  // Get all templates - combine default and saved
  let allTemplates = [];
  try {
    // Get default templates
    if (typeof TEMPLATES !== 'undefined' && Array.isArray(TEMPLATES)) {
      allTemplates = [...TEMPLATES];
    } else if (typeof window !== 'undefined' && window.TEMPLATES && Array.isArray(window.TEMPLATES)) {
      allTemplates = [...window.TEMPLATES];
    }
    
    // Get saved templates
    const savedTemplates = await getUserTemplates();
    allTemplates = [...allTemplates, ...savedTemplates];
    
    console.log('All templates:', allTemplates.length, 'Default:', typeof TEMPLATES !== 'undefined' ? TEMPLATES?.length : 0, 'Saved:', savedTemplates.length);
  } catch(e) {
    console.error('Error getting templates:', e);
  }
  
  const template = allTemplates.find(t => t.id === id);
  console.log('Found template:', template ? template.name : 'NOT FOUND');
  if (!template) {
    console.error('Template not found with id:', id);
    alert('Template not found. Please try again.');
    return;
  }

  currentTemplate = template;
  templateImage   = new Image();

  templateImage.onload = () => {
    document.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
    document.querySelector(`[data-id="${id}"]`)?.classList.add('selected');
    gallerySection.classList.add('hidden');
    editorSection.classList.remove('hidden');
    
    // Reset zoom when selecting a new template
    resetZoom();

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

    // For user templates, prefer stored frontImage; fall back to image (thumbnail)
    if (template.isUserTemplate && template.frontImage) {
      previewImage.src = template.frontImage;
    } else {
      previewImage.src = template.image;
    }

    // Also show matching spine-only image (if available) below the main preview
    if (spinePreviewImage) {
      // For user templates, use stored spineImage if present
      if (template.isUserTemplate && template.spineImage) {
        spinePreviewImage.src = template.spineImage;
        spinePreviewImage.parentElement.style.display = '';
      } else {
        const baseId = template.id.replace(/-spine$/, '');
        const spineIdCandidates = [
          baseId + '-spine',
          baseId.replace(/-front$/, '') + '-spine'
        ];
        const matchingSpine = allTemplates.find(t => spineIdCandidates.includes(t.id)) ||
          allTemplates.find(t => (t.image || '').toLowerCase().includes('spine') &&
            (t.name || '').split(' ')[0] === (template.name || '').split(' ')[0]);
        if (matchingSpine && matchingSpine.image) {
          spinePreviewImage.src = matchingSpine.image;
          spinePreviewImage.parentElement.style.display = '';
        } else {
          spinePreviewImage.src = '';
          spinePreviewImage.parentElement.style.display = 'none';
        }
      }
    }
    updateOverlays();
  };

  templateImage.onerror = () => {
    console.error('Failed to load template image:', template.image);
    alert('Could not load image: ' + template.image + '\nPlease check if the image file exists.');
    // Don't hide editor, just show error
  };
  
  console.log('Loading template image:', template.image);
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
  if (!tc) return;
  // Use text from readSettings (already transformed by caps lock there)
  const displayText = s.text || '';
  tc.textContent = displayText;
  tc.style.textTransform = 'none'; // prevent any CSS from changing case
  block.style.display = displayText ? 'flex' : 'none';

  if (displayText) {
    block.style.left      = `${state.left}%`;
    block.style.top       = `${state.top}%`;
    block.style.width     = `${state.width}%`;
    block.style.height    = `${state.height}%`;
    block.style.fontSize  = `${state.fontSize}px`;
    block.style.fontFamily = `"${s.font}", Georgia, serif`;
    block.style.color     = s.color;
    const rot = state.rotation || 0;
    block.style.transform = `perspective(600px) rotateX(${state.tiltX}deg) rotateY(${state.tiltY}deg) rotateZ(${rot}deg)`;

    const spacingEm = (s.spacing / 10).toFixed(1) + 'em';
    const lineHeight = (s.lineSpacing / 10).toFixed(1);
    const fx        = getTextEffectStyles(s.effect, s.color);
    tc.style.fontWeight    = s.bold ? '700' : '400';
    tc.style.fontStyle     = s.italic ? 'italic' : 'normal';
    tc.style.letterSpacing = spacingEm;
    tc.style.lineHeight    = lineHeight;
    tc.style.textAlign     = s.alignment || 'center';
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

  // Use text from readSettings (already transformed by caps lock there)
  const displayText = s.text || '';

  const canvas = block.querySelector('.spine-canvas');
  block.style.display = displayText ? 'flex' : 'none';

  if (displayText && canvas) {
    block.style.left   = `${state.left}%`;
    block.style.top    = `${state.top}%`;
    block.style.width  = `${state.width}%`;
    block.style.height = `${state.height}%`;
    const rot = state.rotation || 0;
    block.style.transform = `perspective(600px) rotateX(${state.tiltX}deg) rotateY(${state.tiltY}deg) rotateZ(${rot}deg)`;

    renderSpineArcText(canvas, displayText, {
      fontSize:       state.fontSize,
      fontFamily:     s.font,
      color:          s.color,
      curve:          s.curve,
      bold:           s.bold,
      italic:         s.italic,
      effect:         s.effect,
      effectColor:    s.color,
      letterSpacingEm: s.spacing / 10,
      lineSpacing:    s.lineSpacing,
      alignment:      s.alignment,
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

   // Temporarily reset zoom to 100% for clean export
  const originalZoom = zoomLevel;
  updateZoom(1.0);

  // Hide handles on the live DOM so they don't appear in capture
  const liveHandles = document.querySelectorAll('.resize-handle, .rotate-handle');
  const liveHandleOpacities = Array.from(liveHandles).map(h => h.style.opacity);
  liveHandles.forEach(h => { h.style.opacity = '0'; });

  const bgColor = getComputedStyle(document.body).backgroundColor || '#111';

  const captureElement = (sourceElem, suffix, useLive = false) => {
    return new Promise((resolve, reject) => {
      if (!sourceElem) {
        resolve(null);
        return;
      }

      // For spine (canvas-based), capture the live element so the drawn pixels are included.
      if (useLive) {
        html2canvas(sourceElem, { useCORS:true, allowTaint:true, scale:2, backgroundColor:null, logging:false })
          .then(canvas => {
            const link = document.createElement('a');
            link.download = `text-on-photo-${suffix}-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            resolve(true);
          })
          .catch(err => {
            console.error('Export failed for', suffix, err);
            reject(err);
          });
        return;
      }

      // For front, we can safely clone into an off-screen wrapper.
      const wrapper = document.createElement('div');
      wrapper.style.position = 'fixed';
      wrapper.style.left = '-10000px';
      wrapper.style.top = '-10000px';
      wrapper.style.background = bgColor;
      wrapper.style.padding = '16px';
      wrapper.style.display = 'inline-block';

      const clone = sourceElem.cloneNode(true);
      wrapper.appendChild(clone);

      // Hide all resize/rotate handles in the cloned content
      wrapper.querySelectorAll('.resize-handle, .rotate-handle').forEach(h => {
        h.style.display = 'none';
      });

      document.body.appendChild(wrapper);

      html2canvas(wrapper, { useCORS:true, allowTaint:true, scale:2, backgroundColor:null, logging:false })
        .then(canvas => {
          document.body.removeChild(wrapper);
          const link = document.createElement('a');
          link.download = `text-on-photo-${suffix}-${Date.now()}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
          resolve(true);
        })
        .catch(err => {
          document.body.removeChild(wrapper);
          console.error('Export failed for', suffix, err);
          reject(err);
        });
    });
  };

  Promise.all([
    captureElement(editorPreview, 'front'),
    spineImagePreview && spinePreviewImage && spinePreviewImage.src ? captureElement(spineImagePreview, 'spine', true) : Promise.resolve(null)
  ])
    .then(() => {
      liveHandles.forEach((h, i) => { h.style.opacity = liveHandleOpacities[i] || ''; });
      // Restore original zoom
      updateZoom(originalZoom);
    })
    .catch(err => {
      liveHandles.forEach((h, i) => { h.style.opacity = liveHandleOpacities[i] || ''; });
      updateZoom(originalZoom);
      alert('Export failed. Try again.');
    });
}

init();
