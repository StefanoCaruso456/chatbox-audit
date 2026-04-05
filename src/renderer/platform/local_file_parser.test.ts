import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { normalizeExtractedText, parseFileInBrowser } from './local_file_parser'

describe('local_file_parser', () => {
  it('parses text-based files directly in the browser', async () => {
    const file = new File(['first line\nsecond line'], 'notes.md', { type: 'text/markdown' })

    const result = await parseFileInBrowser(file)

    expect(result.isSupported).toBe(true)
    expect(result.text).toContain('first line')
    expect(result.text).toContain('second line')
  })

  it('parses workbook uploads into sheet-aware plain text', async () => {
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Name', 'Score'],
      ['Ada', 98],
      ['Grace', 99],
    ])

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results')

    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const file = new File([buffer], 'scores.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const result = await parseFileInBrowser(file)

    expect(result.isSupported).toBe(true)
    expect(result.text).toContain('# Sheet: Results')
    expect(result.text).toContain('Ada\t98')
    expect(result.text).toContain('Grace\t99')
  })

  it('extracts readable text from zipped document formats', async () => {
    const zip = new JSZip()
    zip.file(
      'word/document.xml',
      '<w:document><w:body><w:p><w:r><w:t>Quarterly Report</w:t></w:r></w:p><w:p><w:r><w:t>Revenue grew 42%</w:t></w:r></w:p></w:body></w:document>'
    )

    const content = await zip.generateAsync({ type: 'arraybuffer' })
    const file = new File([content], 'report.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })

    const result = await parseFileInBrowser(file)

    expect(result.isSupported).toBe(true)
    expect(result.text).toContain('Quarterly Report')
    expect(result.text).toContain('Revenue grew 42%')
  })

  it('normalizes extracted text for downstream prompting', () => {
    expect(normalizeExtractedText('Title  \n\n\n  body\t\tvalue')).toBe('Title\n\n body value')
  })
})
