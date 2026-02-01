import { Context } from "@netlify/functions";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";

console.log("Function Loaded with Spy Mode 🕵️");

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

    // ★★★ ここがスパイ・コードです ★★★
    // 検索ボタン(generateMeSH)が押されたら、使えるモデルを強制的に調査する
    if (action === "generateMeSH") {
        console.log("🔍 Checking available models via API...");
        try {
            // SDKを使わず直接Googleに問い合わせる
            const listRes = await axios.get(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
            );
            console.log("✅ 【成功】使えるモデル一覧:", listRes.data.models.map((m: any) => m.name));
        } catch (e: any) {
            // もしここでエラーが出たら、キー自体がおかしい
            console.error("❌ 【失敗】モデル一覧が取れません:", e.response?.data || e.message);
        }
    }
    // ★★★★★★★★★★★★★★★★★★★

    // 1. MeSH生成
    if (action === "generateMeSH") {
      // 最新のモデル名でトライ
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
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
      
      const searchRes = await axios.get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi`, {
        params: { db: "pubmed", term, retmax: 10, retmode: "json" }
      });
      const ids = searchRes.data.esearchresult.idlist;

      if (!ids || ids.length === 0) {
         return new Response(JSON.stringify([]));
      }

      const summaryRes = await axios.get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi`, {
        params: { db: "pubmed", id: ids.join(","), retmode: "json" }
      });
      
      const papers = ids.map((id: string) => {
          const doc = summaryRes.data.result[id];
          return {
              id,
              title: doc.title,
              authors: doc.authors ? doc.authors.map((a: any) => a.name).join(", ") : "No authors"
          };
      });

      return new Response(JSON.stringify(papers));
    }

    // 3. 論文詳細分析
    if (action === "analyzePapers") {
        const { paperIds } = payload;
        // ここも最新モデルにする
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
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
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      status: 200, 
      headers: { "Content-Type": "application/json" }
    });
  }
};
