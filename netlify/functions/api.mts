import { Context } from "@netlify/functions";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";

// 確実に動くモデル名を使用
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
      
      const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
      const prompt = `以下のキーワードに関連する医学的なMeSH (Medical Subject Headings) タームを5つ、英語でリストアップしてください。カンマ区切りで出力してください。キーワード: ${payload}`;
      
      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/\n/g, "");
      return new Response(JSON.stringify({ meshTerms: text.split(",").map(s => s.trim()) }));
    }

    // 2. PubMed検索（ここを強化しました！）
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

          // ★ここが修正ポイント：結果がない場合も安全に空配列を返す
          const ids = searchRes.data.esearchresult?.idlist;

          if (!ids || ids.length === 0) {
             console.log("No papers found.");
             return new Response(JSON.stringify([]));
          }

          const summaryRes = await axios.get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi`, {
            params: { db: "pubmed", id: ids.join(","), retmode: "json" }
          });
          
          const papers = ids.map((id: string) => {
              const doc = summaryRes.data.result[id];
              // docが取れなかった場合もエラーにしない
              if (!doc) return null;
              
              return {
                  id,
                  title: doc.title || "No Title",
                  authors: doc.authors ? doc.authors.map((a: any) => a.name).join(", ") : "No authors"
              };
          }).filter((p: any) => p !== null); // nullを取り除く

          return new Response(JSON.stringify(papers));

      } catch (e: any) {
          console.error("PubMed API Error:", e.message);
          // エラーでも空配列を返して、画面が真っ白になるのを防ぐ
          return new Response(JSON.stringify([]));
      }
    }

    // 3. 論文詳細分析
    if (action === "analyzePapers") {
        const { paperIds } = payload;
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        
        const fetchRes = await axios.get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi`, {
            params: { db: "pubmed", id: paperIds.join(","), rettype: "abstract", retmode: "xml" }
        });

        const prompt = `
        以下のPubMed論文データについて、各論文ごとに以下の項目を日本語で出力してください。
        形式はMarkdownでお願いします。
        1. タイトル
        2. 著者
        3. 日本語要約
        4. ターゲット疾患・研究との関連性考察
        5. 次の研究ステップの提案 (3案)
        
        論文データ:
        ${fetchRes.data}
        `;

        const result = await model.generateContent(prompt);
        return new Response(JSON.stringify({ analysis: result.response.text() }));
    }

    return new Response("Unknown Action", { status: 400 });

  } catch (error: any) {
    console.error("Critical Error:", error);
    // どんなエラーが起きても、画面を壊さないJSONを返す
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200, 
      headers: { "Content-Type": "application/json" }
    });
  }
};
