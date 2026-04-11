import * as cheerio from "cheerio";
import translate from "translate-google";

import delay from "./delay.js";

export default async function translateComplexHtml(htmlStr: string, lang: string): Promise<string> {
  const isFullDoc = /<html/i.test(htmlStr);

  const $ = cheerio.load(htmlStr, null, isFullDoc);

  const textNodes: any[] = [];
  const textsToTranslate: string[] = [];

  $('*').contents().each((_, el) => {
    if (el.type === 'text') {
      const text = $(el).text().trim();
      const parentTag = $(el).parent()[0]?.name?.toLowerCase();
      if (text && parentTag !== 'script' && parentTag !== 'style') {
        textNodes.push(el);
        textsToTranslate.push(text);
      }
    }
  });

  if (textsToTranslate.length === 0) return htmlStr.trim();

  const translatedTexts: string[] = [];
  for (let i = 0; i < textsToTranslate.length; i += 30) {
    const chunk = textsToTranslate.slice(i, i + 30);
    try {
      const res = await translate(chunk, { to: lang });
      translatedTexts.push(...res);
      await delay(1000);
    } catch (err) {
      for (const text of chunk) {
        try {
          const singleRes = await translate(text, { to: lang });
          translatedTexts.push(singleRes);
          await delay(500);
        } catch (singleErr) {
          translatedTexts.push(text);
        }
      }
    }
  }

  textNodes.forEach((el, index) => {
    if (translatedTexts[index]) {
      el.data = el.data.replace($(el).text().trim(), translatedTexts[index]);
    }
  });

  return $.html().trim();
}