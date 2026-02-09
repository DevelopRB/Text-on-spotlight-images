# Text on Photo

Add custom text to pre-loaded template images (e.g. book covers). Choose a template from the gallery, enter your title and author, customize styling, and download the result.

## Setup

1. **Add your template images** to the `templates/` folder (e.g. `book-cover-1.jpg`, `book-cover-2.jpg`)

2. **Configure templates** in `templates-config.js` — add or edit entries to match your image filenames and adjust text regions if needed

3. **Run the app** — open `index.html` in a browser, or run a local server (recommended for loading images):

   ```bash
   # Python
   python -m http.server 8000

   # Node (if you have npx)
   npx serve .
   ```

   Then open: http://localhost:8000

## Adding new templates

In `templates-config.js`, add an object like:

```javascript
{
  id: 'my-template',
  name: 'My Book Cover',
  image: 'templates/my-image.jpg',
  regions: {
    title:  { left: 15, top: 28, width: 70, height: 22 },  // percentages
    author: { left: 15, top: 52, width: 70, height: 18 }
  }
}
```

`regions` define where text is drawn on the image (percentages of width/height).
