const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

// Resolve a writable "My templates" folder OUTSIDE the app.asar,
// so it works in both dev and packaged builds.
function getMyTemplatesDir() {
  // Use userData so each user gets a writable per-app folder
  const baseDir = app.getPath('userData');
  const dir = path.join(baseDir, 'My templates');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('Created My templates folder at:', dir);
  }
  return dir;
}

function getDefaultTemplatesDir() {
  // Built-in templates directory (read-only in packaged asar)
  return path.join(__dirname, 'templates');
}

function getDefaultTemplatesOverridesDir() {
  const dir = path.join(app.getPath('userData'), 'Default templates');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getDefaultTemplatesMetaPath() {
  return path.join(getDefaultTemplatesOverridesDir(), 'default-templates-meta.json');
}

function readDefaultTemplatesMeta() {
  const file = getDefaultTemplatesMetaPath();
  if (!fs.existsSync(file)) return { overrides: {}, extras: [], deletedDefaults: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      overrides: raw.overrides || {},
      extras: raw.extras || [],
      deletedDefaults: raw.deletedDefaults || []
    };
  } catch {
    return { overrides: {}, extras: [], deletedDefaults: [] };
  }
}

function writeDefaultTemplatesMeta(meta) {
  fs.writeFileSync(getDefaultTemplatesMetaPath(), JSON.stringify(meta, null, 2), 'utf8');
}

function toFileUrl(absPath) {
  return `file://${absPath.replace(/\\/g, '/')}`;
}

function defaultTemplateStruct(imageUrl, id, name) {
  return {
    id,
    name,
    image: imageUrl,
    regions: {
      title: { left: 22, top: 28, width: 56, height: 22 },
      author: { left: 22, top: 52, width: 56, height: 18 },
      spineTitle: { left: 2, top: 20, width: 12, height: 28 },
      spineAuthor: { left: 2, top: 52, width: 12, height: 24 }
    },
    tiltX: -3,
    tiltY: -12,
    perspectiveStrength: 0.7
  };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true, // Enable for file operations
      contextIsolation: false, // Allow global variables
      webSecurity: false, // Allow loading local files
      allowRunningInsecureContent: true // Allow local resources
    }
  });

  // Load with file protocol to ensure local resources working
  const indexPath = path.join(__dirname, 'index.html');
  win.loadFile(indexPath);
  
  // Open DevTools in development for debugging
  win.webContents.openDevTools();
  
  // IPC handlers for file operations
  ipcMain.handle('save-template', async (event, templateData) => {
    try {
      const myTemplatesDir = getMyTemplatesDir();
      // Save image to file if it's a data URL
      let imagePath = templateData.image;
      if (templateData.image && templateData.image.startsWith('data:')) {
        const base64Data = templateData.image.replace(/^data:image\/\w+;base64,/, '');
        const imageExt = templateData.image.match(/^data:image\/(\w+);base64,/)?.[1] || 'png';
        const imageFilename = `template_${templateData.id}_${Date.now()}.${imageExt}`;
        const imageFilepath = path.join(myTemplatesDir, imageFilename);
        fs.writeFileSync(imageFilepath, base64Data, 'base64');
        imagePath = `My templates/${imageFilename}`;
        templateData.image = imagePath;
        console.log('Saved template image to:', imageFilepath);
      }
      
      // Save template JSON
      const filename = `template_${templateData.id}.json`;
      const filepath = path.join(myTemplatesDir, filename);
      fs.writeFileSync(filepath, JSON.stringify(templateData, null, 2), 'utf8');
      console.log('Saved template to:', filepath);
      return { success: true, filename, imagePath };
    } catch (error) {
      console.error('Error saving template:', error);
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('add-new-template', async (event) => {
    try {
      const myTemplatesDir = getMyTemplatesDir();
      const win = BrowserWindow.getFocusedWindow();
      const result = await dialog.showOpenDialog(win || BrowserWindow.getAllWindows()[0], {
        title: 'Choose a book cover image',
        properties: ['openFile'],
        filters: [
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }
        ]
      });
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { success: false, cancelled: true };
      }
      const sourcePath = result.filePaths[0];
      const ext = path.extname(sourcePath).toLowerCase() || '.png';
      const imageFilename = `upload_${Date.now()}${ext}`;
      const destPath = path.join(myTemplatesDir, imageFilename);
      fs.copyFileSync(sourcePath, destPath);
      const templateId = 'upload-' + Date.now();
      const template = {
        id: templateId,
        image: 'My templates/' + imageFilename,
        name: 'My template',
        isUserTemplate: true,
        regions: {
          title: { left: 22, top: 28, width: 56, height: 22 },
          author: { left: 22, top: 52, width: 56, height: 18 },
          spineTitle: { left: 2, top: 20, width: 12, height: 28 },
          spineAuthor: { left: 2, top: 52, width: 12, height: 24 }
        },
        tiltX: -3,
        tiltY: -12
      };
      const jsonPath = path.join(myTemplatesDir, `template_${templateId}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(template, null, 2), 'utf8');
      console.log('Added new template from upload:', jsonPath);
      return { success: true, template };
    } catch (error) {
      console.error('Error adding new template:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('load-default-template-customizations', async () => {
    try {
      const meta = readDefaultTemplatesMeta();
      return { success: true, ...meta };
    } catch (error) {
      return { success: false, error: error.message, overrides: {}, extras: [], deletedDefaults: [] };
    }
  });

  ipcMain.handle('replace-default-template-image', async (event, payload) => {
    try {
      const relImagePath = (payload && payload.imagePath ? String(payload.imagePath) : '').replace(/\\/g, '/');
      if (!relImagePath.startsWith('templates/')) {
        return { success: false, error: 'Only default template images can be replaced.' };
      }

      const win = BrowserWindow.getFocusedWindow();
      const result = await dialog.showOpenDialog(win || BrowserWindow.getAllWindows()[0], {
        title: 'Choose replacement image',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }]
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { success: false, cancelled: true };
      }

      const sourcePath = result.filePaths[0];
      const ext = path.extname(sourcePath).toLowerCase() || '.png';
      const outName = `${path.basename(relImagePath, path.extname(relImagePath))}-override-${Date.now()}${ext}`;
      const outAbs = path.join(getDefaultTemplatesOverridesDir(), outName);
      fs.copyFileSync(sourcePath, outAbs);

      const meta = readDefaultTemplatesMeta();
      const prev = meta.overrides[relImagePath];
      meta.overrides[relImagePath] = toFileUrl(outAbs);
      // If this template was previously marked deleted, un-delete it when replacing.
      meta.deletedDefaults = (meta.deletedDefaults || []).filter(p => p !== relImagePath);
      writeDefaultTemplatesMeta(meta);

      // Try deleting previous override file to avoid clutter.
      if (prev && prev.startsWith('file://')) {
        const prevAbs = prev.replace(/^file:\/\//, '');
        if (fs.existsSync(prevAbs)) {
          try { fs.unlinkSync(prevAbs); } catch {}
        }
      }
      console.log('Replaced default template image override:', outAbs);
      return { success: true, imagePath: relImagePath };
    } catch (error) {
      console.error('Error replacing default template image:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('delete-default-template-image', async (event, payload) => {
    try {
      const imagePath = (payload && payload.imagePath ? String(payload.imagePath) : '').replace(/\\/g, '/');
      const meta = readDefaultTemplatesMeta();

      if (imagePath.startsWith('templates/')) {
        // Built-in default image: mark as deleted in metadata.
        if (!meta.deletedDefaults.includes(imagePath)) {
          meta.deletedDefaults.push(imagePath);
        }
        // Clean override for this image if present.
        const overrideUrl = meta.overrides[imagePath];
        if (overrideUrl && overrideUrl.startsWith('file://')) {
          const overrideAbs = overrideUrl.replace(/^file:\/\//, '');
          if (fs.existsSync(overrideAbs)) {
            try { fs.unlinkSync(overrideAbs); } catch {}
          }
        }
        delete meta.overrides[imagePath];
        writeDefaultTemplatesMeta(meta);
        return { success: true, imagePath };
      }

      // Custom extra image (file://): remove from extras and delete file
      if (imagePath.startsWith('file://')) {
        const abs = imagePath.replace(/^file:\/\//, '');
        meta.extras = (meta.extras || []).filter(t => t.image !== imagePath);
        if (fs.existsSync(abs)) {
          try { fs.unlinkSync(abs); } catch {}
        }
        writeDefaultTemplatesMeta(meta);
        return { success: true, imagePath };
      }

      return { success: false, error: 'Unsupported image path for deletion.' };
    } catch (error) {
      console.error('Error deleting default template image:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('add-new-color-set', async (event, payload) => {
    try {
      const rawName = (payload && payload.colorName ? String(payload.colorName) : '').trim();
      if (!rawName) {
        return { success: false, error: 'Color name is required.' };
      }
      const colorSlug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      if (!colorSlug) {
        return { success: false, error: 'Invalid color name.' };
      }

      const templatesDir = getDefaultTemplatesOverridesDir();
      const win = BrowserWindow.getFocusedWindow();
      const parentWin = win || BrowserWindow.getAllWindows()[0];

      const pickImage = async (label) => {
        const result = await dialog.showOpenDialog(parentWin, {
          title: `Choose ${label} image for ${rawName}`,
          properties: ['openFile'],
          filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }]
        });
        if (result.canceled || !result.filePaths || result.filePaths.length === 0) return null;
        return result.filePaths[0];
      };

      const spotlight = await pickImage('Spotlight');
      if (!spotlight) return { success: false, cancelled: true };
      const randomBg = await pickImage('Random BG');
      if (!randomBg) return { success: false, cancelled: true };
      const randomBgSpine = await pickImage('Random Bg Spine');
      if (!randomBgSpine) return { success: false, cancelled: true };
      const spine = await pickImage('Spine');
      if (!spine) return { success: false, cancelled: true };

      const copyWithExt = (source, targetBaseName) => {
        const ext = path.extname(source).toLowerCase() || '.png';
        const targetPath = path.join(templatesDir, `${targetBaseName}${ext}`);
        fs.copyFileSync(source, targetPath);
        return targetPath;
      };

      const spotlightPath = copyWithExt(spotlight, `${colorSlug}-spotlight`);
      const randomBgPath = copyWithExt(randomBg, `${colorSlug}-random-bg`);
      const randomBgSpinePath = copyWithExt(randomBgSpine, `${colorSlug}-random-bg-spine`);
      const spinePath = copyWithExt(spine, `${colorSlug}-spine`);

      const title = rawName
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');

      const meta = readDefaultTemplatesMeta();
      meta.extras = (meta.extras || []).filter(t => !(t.id || '').startsWith(`book-${colorSlug}-`));
      meta.extras.push(defaultTemplateStruct(toFileUrl(spotlightPath), `book-${colorSlug}-spotlight`, `${title} Spotlight`));
      meta.extras.push(defaultTemplateStruct(toFileUrl(randomBgPath), `book-${colorSlug}-random-bg`, `${title} Random Bg`));
      meta.extras.push(defaultTemplateStruct(toFileUrl(randomBgSpinePath), `book-${colorSlug}-random-bg-spine`, `${title} Random Bg Spine`));
      meta.extras.push(defaultTemplateStruct(toFileUrl(spinePath), `book-${colorSlug}-spine`, `${title} Spine`));
      writeDefaultTemplatesMeta(meta);

      return { success: true, colorName: rawName, slug: colorSlug, added: 4 };
    } catch (error) {
      console.error('Error adding new color set:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('add-default-image-to-color', async (event, payload) => {
    try {
      const rawSlug = (payload && payload.colorSlug ? String(payload.colorSlug) : '').trim().toLowerCase();
      const colorSlug = rawSlug.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
      if (!colorSlug) return { success: false, error: 'Color is required.' };

      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      const typePick = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Spotlight', 'Random BG', 'Random Bg Spine', 'Spine', 'Cancel'],
        defaultId: 0,
        cancelId: 4,
        title: 'Select image type',
        message: `Choose image type for "${colorSlug}"`,
      });
      if (typePick.response === 4) return { success: false, cancelled: true };

      const typeKey = (
        typePick.response === 0 ? 'spotlight' :
        typePick.response === 1 ? 'random-bg' :
        typePick.response === 2 ? 'random-bg-spine' :
        'spine'
      );

      const filePick = await dialog.showOpenDialog(win, {
        title: `Choose ${typeKey} image`,
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }]
      });
      if (filePick.canceled || !filePick.filePaths || filePick.filePaths.length === 0) {
        return { success: false, cancelled: true };
      }

      const sourcePath = filePick.filePaths[0];
      const ext = path.extname(sourcePath).toLowerCase() || '.png';
      const outName = `${colorSlug}-${typeKey}-custom-${Date.now()}${ext}`;
      const outAbs = path.join(getDefaultTemplatesOverridesDir(), outName);
      fs.copyFileSync(sourcePath, outAbs);

      const title = colorSlug
        .split('-')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      const typeTitle = (
        typeKey === 'random-bg' ? 'Random Bg' :
        typeKey === 'random-bg-spine' ? 'Random Bg Spine' :
        typeKey === 'spine' ? 'Spine' :
        'Spotlight'
      );

      const meta = readDefaultTemplatesMeta();
      meta.extras = meta.extras || [];
      meta.extras.push(
        defaultTemplateStruct(
          toFileUrl(outAbs),
          `book-${colorSlug}-${typeKey}-custom-${Date.now()}`,
          `${title} ${typeTitle}`
        )
      );
      writeDefaultTemplatesMeta(meta);

      return { success: true, colorSlug, typeKey };
    } catch (error) {
      console.error('Error adding image to color:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('delete-color-set', async (event, payload) => {
    try {
      const rawSlug = (payload && payload.colorSlug ? String(payload.colorSlug) : '').trim().toLowerCase();
      const colorSlug = rawSlug.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
      if (!colorSlug) {
        return { success: false, error: 'Color slug is required.' };
      }

      const meta = readDefaultTemplatesMeta();

      // Remove custom extras for this color and delete their files
      const extras = meta.extras || [];
      const keep = [];
      let deleted = 0;
      extras.forEach(t => {
        const id = String(t.id || '').toLowerCase();
        if (id.startsWith(`book-${colorSlug}-`)) {
          const img = String(t.image || '');
          if (img.startsWith('file://')) {
            const abs = img.replace(/^file:\/\//, '');
            if (fs.existsSync(abs)) {
              try { fs.unlinkSync(abs); } catch {}
            }
          }
          deleted += 1;
        } else {
          keep.push(t);
        }
      });
      meta.extras = keep;

      // Hide built-in defaults for this color
      const builtInDir = getDefaultTemplatesDir();
      if (fs.existsSync(builtInDir)) {
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];
        fs.readdirSync(builtInDir).forEach(name => {
          const lower = name.toLowerCase();
          if (lower.startsWith(`${colorSlug}-`) && imageExtensions.includes(path.extname(lower))) {
            const rel = `templates/${name}`.replace(/\\/g, '/');
            if (!meta.deletedDefaults.includes(rel)) meta.deletedDefaults.push(rel);
          }
        });
      }

      // Remove overrides for this color
      Object.keys(meta.overrides || {}).forEach(rel => {
        const fileName = path.basename(rel).toLowerCase();
        if (fileName.startsWith(`${colorSlug}-`)) {
          const oldUrl = meta.overrides[rel];
          if (oldUrl && oldUrl.startsWith('file://')) {
            const abs = oldUrl.replace(/^file:\/\//, '');
            if (fs.existsSync(abs)) {
              try { fs.unlinkSync(abs); } catch {}
            }
          }
          delete meta.overrides[rel];
        }
      });

      writeDefaultTemplatesMeta(meta);
      return { success: true, deleted, colorSlug };
    } catch (error) {
      console.error('Error deleting color set:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('load-templates', async () => {
    try {
      const myTemplatesDir = getMyTemplatesDir();
      if (!fs.existsSync(myTemplatesDir)) {
        fs.mkdirSync(myTemplatesDir, { recursive: true });
        return { success: true, templates: [] };
      }
      
      const files = fs.readdirSync(myTemplatesDir);
      const templates = files
        .filter(f => f.endsWith('.json'))
        .map(filename => {
          try {
            const filepath = path.join(myTemplatesDir, filename);
            const content = fs.readFileSync(filepath, 'utf8');
            const template = JSON.parse(content);
            // Ensure image path is a usable file:// URL for the renderer
            if (template.image && !template.image.startsWith('data:') && !template.image.startsWith('file://')) {
              const fileName = path.basename(template.image);
              const absPath = path.join(myTemplatesDir, fileName);
              if (fs.existsSync(absPath)) {
                template.image = `file://${absPath.replace(/\\/g, '/')}`;
              }
            }
            return template;
          } catch (e) {
            console.error('Error loading template file', filename, ':', e);
            return null;
          }
        })
        .filter(t => t !== null);
      return { success: true, templates };
    } catch (error) {
      console.error('Error loading templates:', error);
      return { success: false, templates: [], error: error.message };
    }
  });
  
  ipcMain.handle('delete-template', async (event, templateId) => {
    try {
      const myTemplatesDir = getMyTemplatesDir();
      const files = fs.readdirSync(myTemplatesDir);
      const file = files.find(f => {
        if (!f.endsWith('.json')) return false;
        const filepath = path.join(myTemplatesDir, f);
        const content = fs.readFileSync(filepath, 'utf8');
        const template = JSON.parse(content);
        return template.id === templateId;
      });
      
      if (file) {
        const filepath = path.join(myTemplatesDir, file);
        const content = fs.readFileSync(filepath, 'utf8');
        const template = JSON.parse(content);
        
        // Delete JSON file
        fs.unlinkSync(filepath);
        
        // Delete associated image file if it exists
        if (template.image && template.image.startsWith('My templates/')) {
          const imagePath = path.join(myTemplatesDir, path.basename(template.image));
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log('Deleted template image:', imagePath);
          }
        }
        
        console.log('Deleted template:', filepath);
        return { success: true };
      }
      return { success: false, error: 'Template not found' };
    } catch (error) {
      console.error('Error deleting template:', error);
      return { success: false, error: error.message };
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
