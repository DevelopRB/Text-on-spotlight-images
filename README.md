## Text on Photo – Book Cover & Spine Editor

Desktop Electron app to place and style text on **book front covers and spines**, save reusable templates, and export final images.

### Features

- **Dual preview:** edit front cover and matching spine side‑by‑side.
- **Four text blocks:** Cover Title, Cover Author, Spine Title, Spine Author.
- **Rich text controls:** color, bold, italic, letter spacing, line spacing, alignment, size.
- **Direct manipulation:** drag, resize, and rotate text boxes directly on the images.
- **Zoom for editing:** zoom in/out/reset without affecting exported image size.
- **User templates:** save and reload full layouts (front+spine images + text placements).
- **Upload templates:** add new book images from disk as reusable templates.
- **Clean exports:** download front and spine as separate PNGs (no handles/icons, always at 100%).

---

### 1. Running the App (Development)

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the Electron app:

   ```bash
   npm start
   ```

3. The editor window will open with default templates loaded.

---

### 2. Building the Desktop App

To create a distributable Windows build:

```bash
npm run dist
```

This uses `electron-builder` and outputs a portable app in:

- `dist/win-unpacked/Text on Photo.exe`

You can zip the `win-unpacked` folder and share it with your team; they just unzip and run the `.exe`.

> Note: On some Windows setups, `electron-builder` may show warnings/errors about winCodeSign and symlinks; these only affect optional code‑signing for macOS tools and do **not** prevent the Windows `win-unpacked` build from working.

---

### 3. Using the Editor

#### Choose a template

- **Default templates**
  - **Front** section: front‑cover images.
  - **Spine** section: spine‑only images.
- **My Saved Templates**
  - Templates you have saved from the editor.
  - Includes a `+ Add new template` card to upload new images.

When you select a front template, the app tries to automatically load the matching spine template (based on ID/name patterns) and shows both in the editor.

#### Edit text blocks

There are four logical text blocks:

- Cover Title
- Cover Author
- Spine Title
- Spine Author

For each block you can control:

- **Text:** multi‑line input.
- **Color:** picker + hex display.
- **Bold / Italic**
- **Letter spacing:** default `0.0em`.
- **Line spacing:** default `0.9`.
- **Alignment:** Left / Center / Right.
- **Size:** independent font size per block.

**On‑image controls:**

- Drag the text box to reposition it on the front or spine.
- Resize using corner handles.
- Rotate using the small circular **rotation handle** above the box (front and spine both supported).

#### Zoom

- Zoom in/out and reset controls affect both front and spine previews.
- Zoom is only for editing:
  - Downloads always temporarily reset to **100%** so exported images are consistent.

---

### 4. Saving Templates

Click **`Save as Template`** in the editor to create a reusable template.

The app will:

- Ask for a **template name**.
- Capture a front **thumbnail** using `html2canvas`.
- Store:
  - `frontImage`: original front background image.
  - `spineImage`: original spine background image (if available).
  - `blocks`: for all four text blocks, including:
    - Styling: color, bold, italic, spacing, alignment, rotation, etc.
    - Layout: left/top, width/height, font size, tilt values.
- Save a JSON file plus any needed images to:

```text
<app userData>/My templates/
```

(Electron `app.getPath('userData')/My templates`.)

#### Loading a saved template

- Go to **My Saved Templates** and click its card.
- The app restores:
  - Front and spine images from `frontImage` / `spineImage`.
  - All text, styling, and placements for all four blocks.

You can then tweak and save again as a new template.

---

### 5. Uploading New Templates

To create a template from a new image:

1. In **My Saved Templates**, click the **`+ Add new template`** card.
2. Choose an image file from disk.
3. The app:
   - Copies the image into `My templates` under the app’s user data directory.
   - Creates a JSON template with default regions for title/author and spine blocks.
   - Adds the new template to the gallery as `isUserTemplate: true`.

The uploaded template can then be selected and edited like any other.

---

### 6. Downloading Final Images

Click **`Download image`** to export:

- `text-on-photo-front-<timestamp>.png`
- `text-on-photo-spine-<timestamp>.png` (if a spine image is present)

Download behavior:

1. Ensure there is at least some text in any block.
2. Temporarily **reset zoom to 100%** for both previews.
3. Hide all resize and rotation handles.
4. Export:
   - **Front:** from an off‑screen clone of the front preview (no UI elements).
   - **Spine:** from the live spine preview, so the canvas‑rendered spine text is included.
5. Restore handles and the original zoom level.

Result: two clean PNGs (front and spine), with all text and styling applied, no editor UI artifacts, and a consistent 100% scale.

---

### 7. Template & Code Structure

- `templates/` – default template images (front + matching spine variants).
- `templates-config.js` – configuration for default templates and their text regions.
- `generate-templates.js` – helper script to auto‑generate `templates-config.js` from `templates/`.
- `app.js` – main front‑end logic (editor, templates, drag/resize/rotate, zoom, download).
- `index.html` – main UI layout.
- `styles.css` – styling for the editor and galleries.
- `main.js` – Electron main process:
  - Creates the window.
  - Manages file operations via IPC (saving/loading/deleting templates, file dialogs).

