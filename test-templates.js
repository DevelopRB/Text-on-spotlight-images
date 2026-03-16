/**
 * Test script to verify templates are loading correctly
 * Run: node test-templates.js
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Template Configuration...\n');

// 1. Check if templates-config.js exists
const configPath = path.join(__dirname, 'templates-config.js');
if (!fs.existsSync(configPath)) {
  console.error('❌ templates-config.js not found!');
  process.exit(1);
}
console.log('✅ templates-config.js exists');

// 2. Check if templates-config.js has TEMPLATES defined
const configContent = fs.readFileSync(configPath, 'utf8');
if (!configContent.includes('var TEMPLATES') && !configContent.includes('const TEMPLATES')) {
  console.error('❌ TEMPLATES variable not found in templates-config.js');
  process.exit(1);
}
console.log('✅ TEMPLATES variable found');

// 3. Try to parse and count templates
try {
  // Extract TEMPLATES array using regex
  const match = configContent.match(/TEMPLATES\s*=\s*(\[[\s\S]*?\]);/);
  if (match) {
    const templatesArray = eval(match[1]);
    console.log(`✅ Found ${templatesArray.length} templates:`);
    templatesArray.forEach((t, i) => {
      console.log(`   ${i + 1}. ${t.name} (${t.image})`);
      // Check if image file exists
      const imagePath = path.join(__dirname, t.image);
      if (fs.existsSync(imagePath)) {
        console.log(`      ✅ Image file exists`);
      } else {
        console.log(`      ⚠️  Image file NOT found: ${t.image}`);
      }
    });
  } else {
    console.error('❌ Could not parse TEMPLATES array');
  }
} catch (e) {
  console.error('❌ Error parsing templates:', e.message);
}

// 4. Check HTML file includes templates-config.js
const htmlPath = path.join(__dirname, 'index.html');
if (fs.existsSync(htmlPath)) {
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  if (htmlContent.includes('templates-config.js')) {
    console.log('\n✅ index.html includes templates-config.js');
    // Check script order
    const configIndex = htmlContent.indexOf('templates-config.js');
    const appIndex = htmlContent.indexOf('app.js');
    if (configIndex < appIndex) {
      console.log('✅ Scripts are in correct order (templates-config.js before app.js)');
    } else {
      console.error('❌ Scripts are in wrong order! templates-config.js must come before app.js');
    }
  } else {
    console.error('❌ index.html does not include templates-config.js');
  }
}

// 5. Check templates folder
const templatesDir = path.join(__dirname, 'templates');
if (fs.existsSync(templatesDir)) {
  const files = fs.readdirSync(templatesDir);
  const imageFiles = files.filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
  console.log(`\n✅ Templates folder exists with ${imageFiles.length} image files`);
} else {
  console.error('\n❌ Templates folder not found!');
}

console.log('\n✨ Test complete!');
