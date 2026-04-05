import { isTextFilePath } from '@shared/file-extensions'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

const ZIP_ENTRY_PATTERNS: Record<string, RegExp[]> = {
  '.docx': [
    /^word\/document\.xml$/i,
    /^word\/header\d+\.xml$/i,
    /^word\/footer\d+\.xml$/i,
    /^word\/footnotes\.xml$/i,
    /^word\/endnotes\.xml$/i,
    /^word\/comments\d*\.xml$/i,
  ],
  '.pptx': [/^ppt\/slides\/slide\d+\.xml$/i, /^ppt\/notesSlides\/notesSlide\d+\.xml$/i],
  '.odt': [/^content\.xml$/i],
  '.odp': [/^content\.xml$/i],
  '.epub': [/^(?:oebps\/|epub\/)?.+\.(xhtml|html|htm|xml)$/i, /^toc\.ncx$/i],
}

const SPREADSHEET_EXTENSIONS = new Set(['.xlsx', '.ods'])

function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : ''
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
}

export function stripMarkupToText(input: string): string {
  return decodeHtmlEntities(
    input
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/(w:p|w:tr|w:tbl|p|div|li|tr|h\d|text:p|text:h|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
}

export function normalizeExtractedText(input: string): string {
  return input
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

async function parseTextLikeFile(file: File): Promise<string> {
  return (await file.text()).replace(/\r/g, '')
}

async function parsePdfFile(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const document = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
  }).promise

  const pages: string[] = []

  for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex++) {
    const page = await document.getPage(pageIndex)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim()

    if (pageText) {
      pages.push(pageText)
    }
  }

  return normalizeExtractedText(pages.join('\n\n'))
}

export function formatWorkbookRows(sheetName: string, rows: unknown[][]): string {
  const lines = rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) {
            return ''
          }
          return String(cell).trim()
        })
        .join('\t')
        .trimEnd()
    )
    .filter(Boolean)

  return lines.length > 0 ? `# Sheet: ${sheetName}\n${lines.join('\n')}` : ''
}

async function parseSpreadsheetFile(file: File): Promise<string> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: 'array',
    cellText: true,
    cellDates: true,
  })

  const sheets = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    }) as unknown[][]

    return formatWorkbookRows(sheetName, rows)
  }).filter(Boolean)

  return normalizeExtractedText(sheets.join('\n\n'))
}

async function parseZipDocumentFile(file: File, extension: string): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const patterns = ZIP_ENTRY_PATTERNS[extension]

  if (!patterns) {
    return ''
  }

  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir && patterns.some((pattern) => pattern.test(entry.name)))
    .sort((left, right) => left.name.localeCompare(right.name))

  const parts = await Promise.all(
    entries.map(async (entry) => normalizeExtractedText(stripMarkupToText(await entry.async('text'))))
  )

  return normalizeExtractedText(parts.filter(Boolean).join('\n\n'))
}

export async function parseFileInBrowser(file: File): Promise<{ text: string; isSupported: boolean }> {
  try {
    if (isTextFilePath(file.name)) {
      const text = await parseTextLikeFile(file)
      return { text, isSupported: text.trim().length > 0 }
    }

    const extension = getFileExtension(file.name)

    let text = ''

    if (extension === '.pdf') {
      text = await parsePdfFile(file)
    } else if (SPREADSHEET_EXTENSIONS.has(extension)) {
      text = await parseSpreadsheetFile(file)
    } else if (ZIP_ENTRY_PATTERNS[extension]) {
      text = await parseZipDocumentFile(file, extension)
    }

    if (!text) {
      return { text: '', isSupported: false }
    }

    return { text, isSupported: true }
  } catch {
    return { text: '', isSupported: false }
  }
}
