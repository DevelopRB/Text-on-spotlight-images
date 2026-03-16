const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

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
