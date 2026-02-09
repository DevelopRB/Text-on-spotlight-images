/**
 * Auto-generate templates-config.js from images in templates/ folder
 * Run: node generate-templates.js
 */

const fs = require('fs');
const path = require('path');

const templatesDir = path.join(__dirname, 'templates');
const configFile = path.join(__dirname, 'templates-config.js');

// Default regions for all templates (can be customized per template later)
const defaultRegions = {
  title: { left: 15, top: 28, width: 70, height: 22 },
  author: { left: 15, top: 52, width: 70, height: 18 },
  spineTitle: { left: 2, top: 20, width: 12, height: 28 },
  spineAuthor: { left: 2, top: 52, width: 12, height: 24 }
};

const defaultTilt = {
  tiltY: -12,
  tiltX: -3,
  perspectiveStrength: 0.7
};

// Helper to clean filename and create display name
function filenameToName(filename) {
  // Remove extension
  let name = filename.replace(/\.[^/.]+$/, '');
  // Remove numbers in parentheses like "(2)"
  name = name.replace(/\s*\([0-9]+\)\s*/g, '').trim();
  
  // Special name mappings
  const nameMap = {
    'light brown': 'Brown',
    'lightbrown': 'Brown'
  };
  
  const lowerName = name.toLowerCase();
  if (nameMap[lowerName]) {
    return nameMap[lowerName];
  }
  
  // Capitalize first letter of each word
  name = name.split(/[\s_-]+/)
    .filter(w => w.length > 0)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  return name || 'Untitled';
}

// Order priority for sorting (lower number = appears first)
function getSortOrder(filename) {
  const lower = filename.toLowerCase();
  const orderMap = {
    'light brown': 1,
    'lightbrown': 1,
    'black': 2,
    'blue': 3,
    'dark brown': 4,
    'green': 5,
    'pink': 6,
    'red': 7
  };
  
  for (const [key, order] of Object.entries(orderMap)) {
    if (lower.includes(key)) {
      return order;
    }
  }
  return 999; // Unknown files go to end
}

// Helper to create ID from filename
function filenameToId(filename) {
  return 'book-' + filename.replace(/\.[^/.]+$/, '')
    .replace(/\s*\([0-9]+\)\s*/g, '')
    .replace(/[\s_-]+/g, '-')
    .toLowerCase();
}

try {
  // Read all files in templates directory
  const files = fs.readdirSync(templatesDir);
  
  // Filter image files
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
  const imageFiles = files.filter(file => {
    const ext = path.extname(file).toLowerCase();
    return imageExtensions.includes(ext) && file !== '.gitkeep';
  });

  if (imageFiles.length === 0) {
    console.log('No image files found in templates/ folder.');
    process.exit(1);
  }

  // Sort files by custom order, then alphabetically for same priority
  imageFiles.sort((a, b) => {
    const orderA = getSortOrder(a);
    const orderB = getSortOrder(b);
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.localeCompare(b);
  });

  // Generate template entries
  const templates = imageFiles.map(file => {
    const filename = file;
    const imagePath = `templates/${filename}`;
    const name = filenameToName(filename);
    const id = filenameToId(filename);

    return {
      id: id,
      name: name,
      image: imagePath,
      regions: { ...defaultRegions },
      ...defaultTilt
    };
  });

  // Generate the config file content
  const configContent = `/**
 * Auto-generated templates configuration
 * Generated from images in templates/ folder
 * To regenerate: node generate-templates.js
 * 
 * Text regions are defined as percentages of the image dimensions (0-100)
 */
const TEMPLATES = ${JSON.stringify(templates, null, 2)};
`;

  // Write to file
  fs.writeFileSync(configFile, configContent, 'utf8');
  
  console.log(`✅ Generated templates-config.js with ${templates.length} templates:`);
  templates.forEach((t, i) => {
    console.log(`   ${i + 1}. ${t.name} (${t.image})`);
  });
  console.log('\n✨ Done! Refresh your browser to see the new templates.');

} catch (error) {
  console.error('Error generating templates:', error);
  process.exit(1);
}
