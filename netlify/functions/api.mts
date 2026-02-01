import { Config, Context } from "@netlify/functions";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") return new Response("ok");

  try {
    const body = await req.json();
    const { action, payload } = body;

    // 1. MeSHタームの生成
    if (action === "generateMeSH") {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `以下のキーワードに関連する医学的なMeSH (Medical Subject Headings) タームを5つ、英語でリストアップしてください。カンマ区切りで出力してください。キーワード: ${payload.keyword}`;
      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/\n/g, "");
      return new Response(JSON.stringify({ meshTerms: text.split(",").map(s => s.trim()) }));
    }

    // 2. PubMed検索
    if (action === "searchPubMed") {
      const { mesh, years } = payload;
      const currentYear = new Date().getFullYear();
      const startYear = currentYear - years;
      const term = `${mesh}[Mesh] AND ${startYear}:${currentYear}[DP]`;
      
      const searchRes = await axios.get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi`, {
        params: { db: "pubmed", term, retmax: 10, retmode: "json" }
      });
      const ids = searchRes.data.esearchresult.idlist;

      const summaryRes = await axios.get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi`, {
        params: { db: "pubmed", id: ids.join(","), retmode: "json" }
      });

      const papers = ids.map((id: string) => ({
        id,
        title: summaryRes.data.result[id].title,
        authors: summaryRes.data.result[id].authors.map((a: any) => a.name).join(", "),
      }));

      return new Response(JSON.stringify({ papers }));
    }

    // 3. 論文詳細分析
    if (action === "analyzePapers") {
      const { paperIds } = payload;
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      // Fetch details from PubMed
      const fetchRes = await axios.get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi`, {
        params: { db: "pubmed", id: paperIds.join(","), rettype: "abstract", retmode: "xml" }
      });
      // Note: 本来はXMLをパースすべきですが、ここでは簡略化のためGeminiに生データを渡し、
      // 構造化を依頼するプロンプトにします（実用上はXMLパースを推奨）

      const prompt = `
        以下のPubMed論文データについて、各論文ごとに以下の項目を日本語で出力してください。
        形式はMarkdownでお願いします。
        1. タイトル
        2. 著者
        3. 日本語要約
        4. ターゲット疾患・研究との関連性考察
        5. 次の研究ステップの提案（3案）
        
        データ:
        ${fetchRes.data}
      `;

      const result = await model.generateContent(prompt);
      return new Response(JSON.stringify({ analysis: result.response.text() }));
    }

    return new Response("Not Found", { status: 404 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};

export const config: Config = {
  path: "/api"
};
