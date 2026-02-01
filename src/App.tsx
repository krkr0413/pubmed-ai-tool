import React, { useState } from 'react';
import axios from 'axios';
import { Search, BookOpen, Brain, Activity, AlertCircle, Loader2 } from 'lucide-react';

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

      if (Array.isArray(res.data)) {
        setPapers(res.data);
        if (res.data.length === 0) {
           setError('論文が見つかりませんでした。');
        }
      } else if (res.data.error) {
        throw new Error(res.data.error);
      } else {
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
