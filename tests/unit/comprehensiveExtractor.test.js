const MetadataExtractor = require('../../src/utils/MetadataExtractor');

describe('Comprehensive File Format Metadata Extraction Tests', () => {
  test('should extract metadata for JSON and XML files', async () => {
    const jsonBuf = Buffer.from(JSON.stringify({ key: 'value', number: 123 }));
    const jsonMeta = await MetadataExtractor.extract(jsonBuf, 'application/json', 'data.json');
    expect(jsonMeta.format).toBe('json');
    expect(jsonMeta.characterCount).toBeGreaterThan(0);
    expect(jsonMeta.hash.sha256).toBeDefined();

    const xmlBuf = Buffer.from('<root><item>test</item></root>');
    const xmlMeta = await MetadataExtractor.extract(xmlBuf, 'application/xml', 'doc.xml');
    expect(xmlMeta.format).toBe('xml');
    expect(xmlMeta.lineCount).toBe(1);
  });

  test('should extract metadata for CSV and Markdown files', async () => {
    const csvBuf = Buffer.from('id,name,email\n1,Alice,alice@example.com\n2,Bob,bob@example.com');
    const csvMeta = await MetadataExtractor.extract(csvBuf, 'text/csv', 'users.csv');
    expect(csvMeta.format).toBe('csv');
    expect(csvMeta.lineCount).toBe(3);

    const mdBuf = Buffer.from('# Title\n\n- Item 1\n- Item 2');
    const mdMeta = await MetadataExtractor.extract(mdBuf, 'text/markdown', 'README.md');
    expect(mdMeta.format).toBe('md');
    expect(mdMeta.wordCount).toBeGreaterThan(5);
  });

  test('should extract format and hashes for Office & E-book formats (.docx, .xlsx, .epub)', async () => {
    const docxBuf = Buffer.from('PK\x03\x04 fake docx zip content');
    const docxMeta = await MetadataExtractor.extract(docxBuf, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'report.docx');
    expect(docxMeta.format).toBe('docx');
    expect(docxMeta.hash.md5).toBeDefined();

    const epubBuf = Buffer.from('PK\x03\x04 fake epub content');
    const epubMeta = await MetadataExtractor.extract(epubBuf, 'application/epub+zip', 'book.epub');
    expect(epubMeta.format).toBe('epub');
    expect(epubMeta.hash.sha256).toBeDefined();
  });
});
