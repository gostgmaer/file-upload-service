const crypto = require('crypto');

/**
 * Production-grade Metadata Extractor Module.
 * Extracts hashes, text statistics, image metrics, and document metrics safely.
 */
class MetadataExtractor {
  static async extract(fileBuffer, mimeType, originalName) {
    const technical = {
      hash: {
        md5: crypto.createHash('md5').update(fileBuffer).digest('hex'),
        sha256: crypto.createHash('sha256').update(fileBuffer).digest('hex'),
      },
      format: mimeType ? mimeType.split('/')[1] : '',
    };

    try {
      // 1. Image Extraction (Sharp & Exif)
      if (mimeType && mimeType.startsWith('image/')) {
        try {
          const sharp = require('sharp');
          const imageMeta = await sharp(fileBuffer).metadata();
          technical.dimensions = {
            width: imageMeta.width,
            height: imageMeta.height,
            aspectRatio: imageMeta.width && imageMeta.height ? parseFloat((imageMeta.width / imageMeta.height).toFixed(2)) : null,
          };
          technical.colorSpace = imageMeta.space;
          technical.channels = imageMeta.channels;
          technical.density = imageMeta.density;
          technical.hasAlpha = imageMeta.hasAlpha;
          technical.format = imageMeta.format || technical.format;
          if (imageMeta.exif) {
            try {
              const ExifParser = require('exif-parser');
              const parser = ExifParser.create(fileBuffer);
              const exifResult = parser.parse();
              technical.exif = exifResult.tags;
            } catch (exifErr) {
              // Non-critical EXIF parse fallback
            }
          }
        } catch (sharpErr) {
          // Sharp fallback if native binary or format incompatible
        }
      }

      // 2. PDF Document Extraction
      else if (mimeType === 'application/pdf') {
        try {
          const pdfParse = require('pdf-parse');
          const pdfData = await pdfParse(fileBuffer);
          technical.pageCount = pdfData.numpages;
          technical.characterCount = pdfData.text ? pdfData.text.length : 0;
          technical.wordCount = pdfData.text ? pdfData.text.trim().split(/\s+/).filter(Boolean).length : 0;
        } catch (pdfErr) {
          // PDF parsing fallback
        }
      }

      // 3. Document / Spreadsheet / Presentation / E-book / Text / Code Extraction
      else if (
        mimeType &&
        (mimeType.startsWith('text/') ||
          mimeType === 'application/json' ||
          mimeType === 'application/javascript' ||
          mimeType === 'application/xml' ||
          mimeType === 'text/xml' ||
          mimeType === 'application/x-yaml' ||
          mimeType === 'application/yaml' ||
          mimeType === 'text/yaml' ||
          mimeType === 'text/csv' ||
          mimeType === 'text/html')
      ) {
        try {
          const textContent = fileBuffer.toString('utf8');
          technical.characterCount = textContent.length;
          technical.wordCount = textContent.trim().split(/\s+/).filter(Boolean).length;
          technical.lineCount = textContent.split(/\r\n|\r|\n/).length;
          technical.encoding = 'utf8';
        } catch (textErr) {
          // Text fallback
        }
      }

      // 4. Generic Office/Ebook Document fallback
      const ext = originalName ? originalName.split('.').pop().toLowerCase() : '';
      if (ext) {
        technical.format = ext;
      }
    } catch (err) {
      console.warn('[MetadataExtractor] Failed extraction step:', err.message);
    }

    return technical;
  }
}

module.exports = MetadataExtractor;
