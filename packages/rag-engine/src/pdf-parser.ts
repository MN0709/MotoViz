import { extractText } from 'unpdf';

export interface ParsedPdfPage {
  pageNumber: number;
  text: string;
}

export interface ParsedPdf {
  totalPages: number;
  pages: ParsedPdfPage[];
  text: string;
}

// 选型：首选 unpdf（类型完善、API 简洁，并为 Node 提供 CJK 字体映射）；备选 pdfjs-dist（上游控制力最强，但需自行处理逐页拼接和 CMap 配置）。
export function sanitizePdfText(value: string): string {
  return value
    .normalize('NFC')
    .split('\u0000')
    .join('')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function parsePdf(input: Uint8Array): Promise<ParsedPdf> {
  if (input.byteLength === 0) {
    throw new Error('PDF 文件不能为空');
  }

  const result = await extractText(input, { mergePages: false });
  if (!Array.isArray(result.text)) {
    throw new Error('PDF 解析器未返回逐页文本');
  }

  const pages = result.text.map((text, index) => ({
    pageNumber: index + 1,
    text: sanitizePdfText(text),
  }));

  return {
    totalPages: result.totalPages,
    pages,
    text: pages
      .map((page) => page.text)
      .filter(Boolean)
      .join('\n\n'),
  };
}
