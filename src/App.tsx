import { useState } from 'react';
import axios from 'axios';
import { Search, BookOpen, Brain, Activity, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';

export default function App() {
  const [keyword, setKeyword] = useState('');
  const [meshTerms, setMeshTerms] = useState<string[]>([]);
  const [papers, setPapers] = useState<any[]>([]);
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedMesh, setSelectedMesh] = useState('');

  // 1. MeSHタームの生成
  const generateMeSH = async () => {
    if (!keyword) return;
    setLoading(true);
    setError('');
    setMeshTerms([]);
    
    try {
      const res = await axios.post('/.netlify/functions/api', {
        action: 'generateMeSH',
        payload: keyword
      });

      if (res.data.error) {
        throw new Error(res.data.error);
      }
      setMeshTerms(res.data.meshTerms || []);
    } catch (err: any) {
      console.error(err);
      setError('MeSHの生成に失敗しました: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  // 2. PubMed検索
  const searchPubMed = async (mesh: string) => {
    setLoading(true);
    setError('');
    setPapers([]);
    setSelectedMesh(mesh);
    setAnalysis(''); // 分析結果もリセット

    try {
      const res = await axios.post('/.netlify/functions/api', {
        action: 'searchPubMed',
        payload: { mesh, years: 5 }
      });

      // ★ここが修正ポイント：配列かどうかチェックする！
      if (Array.isArray(res.data)) {
        setPapers(res.data);
        if (res.data.length === 0) {
           setError('論文が見つかりませんでした。');
        }
      } else if (res.data.error) {
        throw new Error(res.data.error);
      } else {
        // 予想外のデータが来た場合
        console.error("Unexpected response:", res.data);
        setError('検索結果の形式が正しくありません。');
      }

    } catch (err: any) {
      console.error(err);
      setError('検索中にエラーが発生しました: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  // 3. 論文分析
  const analyzePapers = async () => {
    if (papers.length === 0) return;
    setLoading(true);
    setError('');
    
    try {
      const res = await axios.post('/.netlify/functions/api', {
        action: 'analyzePapers',
        payload: { paperIds: papers.map(p => p.id) }
      });

      if (res.data.error) {
         throw new Error(res.data.error);
      }
      setAnalysis(res.data.analysis || '分析結果が空でした');

    } catch (err: any) {
      console.error(err);
      setError('分析に失敗しました: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans text-slate-900">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* ヘッダー */}
        <header className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-3 bg-blue-600 rounded-full shadow-lg">
            <Brain className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800">PubMed AI Insight</h1>
          <p className="text-slate-600">Geminiを活用した医学論文検索・分析ツール</p>
        </header>

        {/* エラー表示エリア */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* 1. キーワード入力 */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-600" />
            1. キーワードからMeSHを生成
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="例: depression, diabetes..."
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
              onClick={generateMeSH}
              disabled={loading || !keyword}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'MeSH提案'}
            </button>
          </div>

          {/* MeSHタグ表示 */}
          {meshTerms.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {meshTerms.map((mesh) => (
                <button
                  key={mesh}
                  onClick={() => searchPubMed(mesh)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
                    selectedMesh === mesh 
                      ? 'bg-blue-100 text-blue-800 border-blue-200' 
                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {mesh}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 2. 検索結果リスト */}
        {papers.length > 0 && (
          <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                2. 検索結果 ({papers.length}件)
              </h2>
              <button
                onClick={analyzePapers}
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Activity className="w-4 h-4" /> AI分析開始</>}
              </button>
            </div>
            
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
              {papers.map((paper) => (
                <div key={paper.id} className="p-4 rounded-lg bg-slate-50 border border-slate-100 hover:border-blue-200 transition-colors">
                  <h3 className="font-semibold text-slate-800 mb-1">{paper.title}</h3>
                  <div className="text-sm text-slate-500 flex justify-between items-center">
                    <span>{paper.authors}</span>
                    <span className="bg-slate-200 px-2 py-0.5 rounded text-xs">PMID: {paper.id}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 3. AI分析結果 */}
        {analysis && (
          <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 ring-2 ring-blue-100">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-blue-800">
              <Brain className="w-5 h-5" />
              3. AIインサイト
            </h2>
            <div className="prose prose-slate max-w-none">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed bg-slate-50 p-4 rounded-lg">
                {analysis}
              </pre>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
