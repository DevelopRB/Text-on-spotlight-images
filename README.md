# Text on Photo

Add custom text to pre-loaded template images (e.g. book covers). Choose a template from the gallery, enter your title and author, customize styling, and download the result.

## Setup

1. **Add your template images** to the `templates/` folder (e.g. `book-cover-1.jpg`, `book-cover-2.jpg`)

2. **Auto-generate templates config** (recommended):
   ```bash
   node generate-templates.js
   ```
   This automatically scans the `templates/` folder and generates `templates-config.js` with all images.

   Or **manually configure templates** in `templates-config.js` — add or edit entries to match your image filenames and adjust text regions if needed.

3. **Run the app** — open `index.html` in a browser, or run a local server (recommended for loading images):

   ```bash
   # Python
   python -m http.server 8000

   # Node (if you have npx)
   npx serve .
   ```

   Then open: http://localhost:8000

## Adding new templates

### Automatic (Recommended)
1. Add your image file to the `templates/` folder
2. Run `node generate-templates.js` to auto-generate the config
3. The script will:
   - Detect all images in the `templates/` folder
   - Create template entries with default regions
   - Generate display names from filenames
   - Sort templates in the correct order

### Manual
In `templates-config.js`, add an object like:

```javascript
{
  id: 'my-template',
  name: 'My Book Cover',
  image: 'templates/my-image.jpg',
  regions: {
    title:  { left: 15, top: 28, width: 70, height: 22 },  // percentages
    author: { left: 15, top: 52, width: 70, height: 18 },
    spineTitle: { left: 2, top: 20, width: 12, height: 28 },
    spineAuthor: { left: 2, top: 52, width: 12, height: 24 }
  },
  tiltY: -12,
  tiltX: -3
}
```

`regions` define where text is drawn on the image (percentages of width/height).
