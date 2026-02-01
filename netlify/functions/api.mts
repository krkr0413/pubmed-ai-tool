import { Context } from "@netlify/functions";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";

// ★ここが修正点：確実に動く「gemini-flash-latest」を使用
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export default async (req: Request, context: Context) => {
  // CORS設定
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const body = await req.json();
    const { action, payload } = body;
    console.log("Received Action:", action);

    // 1. MeSH生成
    if (action === "generateMeSH") {
      if (!process.env.GEMINI_API_KEY) throw new Error("API Key is missing!");
      
      // ★修正：動くモデル名に戻しました
      const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
      const prompt = `以下のキーワードに関連する医学的なMeSH (Medical Subject Headings) タームを5つ、英語でリストアップしてください。カンマ区切りで出力してください。キーワード: ${payload}`;
      
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
      
      console.log(`Searching PubMed for: ${term}`);

      try {
          const searchRes = await axios.get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi`, {
            params: { db: "pubmed", term, retmax: 10, retmode: "json" }
          });

          const ids = searchRes.data.esearchresult?.idlist;

          if (!ids || ids.length === 0) {
             return new Response(JSON.stringify([]));
          }

          const summaryRes = await axios.get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi`, {
            params: { db: "pubmed", id: ids.join(","), retmode: "json" }
          });
          
          const papers = ids.map((id: string) => {
              const doc = summaryRes.data.result[id];
              if (!doc) return null;
              return {
                  id,
                  title: doc.title || "No Title",
                  authors: doc.authors ? doc.authors.map((a: any) => a.name).join(", ") : "No authors"
              };
          }).filter((p: any) => p !== null);

          return new Response(JSON.stringify(papers));

      } catch (e: any) {
          console.error("PubMed API Error:", e.message);
          return new Response(JSON.stringify([]));
      }
    }

    // 3. 論文詳細分析
    if (action === "analyzePapers") {
        const { paperIds } = payload;

        // ★タイムアウト対策：上位3件のみ分析
        const limitedIds = paperIds.slice(0, 3);
        console.log(`Analyzing top ${limitedIds.length} papers...`);

        // ★修正：動くモデル名に戻しました
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        
        const fetchRes = await axios.get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi`, {
            params: { db: "pubmed", id: limitedIds.join(","), rettype: "abstract", retmode: "xml" }
        });

        const prompt = `
        以下のPubMed論文データ（上位3件）について、重要ポイントを日本語で要約してください。
        形式はMarkdownで見やすく出力してください。
        
        ## 出力フォーマット
        - **論文タイトル**
          - 要約: ...
          - 臨床への示唆: ...
        
        論文データ:
        ${fetchRes.data}
        `;

        const result = await model.generateContent(prompt);
        return new Response(JSON.stringify({ analysis: result.response.text() }));
    }

    return new Response("Unknown Action", { status: 400 });

  } catch (error: any) {
    console.error("Critical Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200, 
      headers: { "Content-Type": "application/json" }
    });
  }
};
