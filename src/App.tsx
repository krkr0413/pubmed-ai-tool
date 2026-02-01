import React, { useState } from 'react';
import { Search, FileText, Download, Loader2, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [keyword, setKeyword] = useState('');
  const [years, setYears] = useState(10);
  const [meshTerms, setMeshTerms] = useState<string[]>([]);
  const [selectedMesh, setSelectedMesh] = useState('');
  const [papers, setPapers] = useState<any[]>([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');

  const callApi = async (action: string, payload: any) => {
    const res = await fetch('/api', {
      method: 'POST',
      body: JSON.stringify({ action, payload }),
    });
    return res.json();
  };

  const handleGenerateMeSH = async () => {
    setLoading(true);
    const data = await callApi('generateMeSH', { keyword });
    setMeshTerms(data.meshTerms);
    setLoading(false);
  };

  const handleSearchPubMed = async (mesh: string) => {
    setSelectedMesh(mesh);
    setLoading(true);
    const data = await callApi('searchPubMed', { mesh, years });
    setPapers(data.papers);
    setLoading(false);
  };

  const handleAnalyze = async () => {
    setLoading(true);
    const data = await callApi('analyzePapers', { paperIds: selectedPaperIds });
    setAnalysisResult(data.analysis);
    setLoading(false);
  };

  const downloadMarkdown = () => {
    const blob = new Blob([analysisResult], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analysis_report.md`;
    a.click();
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <header className="text-center py-8">
        <h1 className="text-3xl font-bold text-indigo-700 flex items-center justify-center gap-2">
          <Search /> PubMed AI Insight
        </h1>
        <p className="text-gray-500 mt-2">Geminiを活用した医学論文検索・分析ツール</p>
      </header>

      {/* Step 1: Keyword Input */}
      <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold mb-4">1. キーワードからMeSHを生成</h2>
        <div className="flex gap-4">
          <input
            type="text"
            className="flex-1 border rounded-lg px-4 py-2"
            placeholder="例: Alzheimer's disease drug delivery"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <button
            onClick={handleGenerateMeSH}
            disabled={loading || !keyword}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'MeSH提案'}
          </button>
        </div>

        {meshTerms.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {meshTerms.map((mesh) => (
              <button
                key={mesh}
                onClick={() => handleSearchPubMed(mesh)}
                className={`px-4 py-1 rounded-full border ${selectedMesh === mesh ? 'bg-indigo-100 border-indigo-500' : 'hover:bg-gray-50'}`}
              >
                {mesh}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Step 2: Paper Selection */}
      {papers.length > 0 && (
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">2. 検索結果 (過去{years}年)</h2>
            <input 
              type="number" 
              className="border rounded w-20 px-2" 
              value={years} 
              onChange={(e) => setYears(Number(e.target.value))}
            />
          </div>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {papers.map((paper) => (
              <div key={paper.id} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50">
                <input
                  type="checkbox"
                  className="mt-1"
                  onChange={(e) => {
                    if (e.target.checked) setSelectedPaperIds([...selectedPaperIds, paper.id]);
                    else setSelectedPaperIds(selectedPaperIds.filter(id => id !== paper.id));
                  }}
                />
                <div>
                  <p className="font-medium text-sm">{paper.title}</p>
                  <p className="text-xs text-gray-400">{paper.authors}</p>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={handleAnalyze}
            disabled={loading || selectedPaperIds.length === 0}
            className="mt-4 w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 flex justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : <><FileText /> 選択した論文を分析</>}
          </button>
        </section>
      )}

      {/* Step 3: Results & Download */}
      {analysisResult && (
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CheckCircle2 className="text-green-500" /> 分析結果
            </h2>
            <button
              onClick={downloadMarkdown}
              className="flex items-center gap-2 text-indigo-600 font-semibold hover:underline"
            >
              <Download size={20} /> Markdownをダウンロード
            </button>
          </div>
          <div className="prose prose-sm max-w-none bg-gray-50 p-4 rounded-lg border">
            <pre className="whitespace-pre-wrap">{analysisResult}</pre>
          </div>
        </section>
      )}
    </div>
  );
}
