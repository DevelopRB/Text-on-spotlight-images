/**
 * Pre-loaded template - single leather book cover
 * Text regions are defined as percentages of the image dimensions (0-100)
 */
const TEMPLATES = [
  {
    id: 'book-cover',
    name: 'Leather Book - Ornate Frame',
    image: 'templates/sample image.jpeg',
    regions: {
      title: { left: 15, top: 28, width: 70, height: 22 },
      author: { left: 15, top: 52, width: 70, height: 18 },
      // Spine text - vertical, left edge of book
      spineTitle: { left: 2, top: 20, width: 12, height: 28 },
      spineAuthor: { left: 2, top: 52, width: 12, height: 24 }
    },
    // Default 3D tilt to match book's angled view (degrees)
    tiltY: -12,
    tiltX: -3,
    perspectiveStrength: 0.7
  }
];
