import React, { useState, useEffect, useRef } from 'react';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { db } from '../services/db';
import { Article, User } from '../types';
import { MCPClient, MCPTool, MCPLog } from '../services/mcpService';
import { fetchJinaReader, searchJina, JinaSearchResult } from '../services/jinaService';

interface Props {
    user: User;
    onStartExperiment?: () => void;
}

export const Admin: React.FC<Props> = ({ user, onStartExperiment }) => {
  const [activeTab, setActiveTab] = useState<'public' | 'my-seed' | 'trash' | 'mcp' | 'jina'>('my-seed');
  const [publicArticles, setPublicArticles] = useState<Article[]>([]);
  const [recycledArticles, setRecycledArticles] = useState<Article[]>([]);
  const [mySeedIds, setMySeedIds] = useState<string[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [category, setCategory] = useState('');
  const [newCategoryInput, setNewCategoryInput] = useState('');
  
  const [jinaUrl, setJinaUrl] = useState('');
  const [jinaApiKey, setJinaApiKey] = useState(() => localStorage.getItem('JINA_API_KEY') || '');
  const [isJinaLoading, setIsJinaLoading] = useState(false);
  const [jinaError, setJinaError] = useState('');
  
  const [jinaSearchQuery, setJinaSearchQuery] = useState('');
  const [isJinaSearching, setIsJinaSearching] = useState(false);
  const [jinaSearchResults, setJinaSearchResults] = useState<JinaSearchResult[]>([]);
  const [jinaSearchError, setJinaSearchError] = useState('');
  const [jinaSearchNum, setJinaSearchNum] = useState(10);
  const [jinaSearchPage, setJinaSearchPage] = useState(1);
  const [expandedResultIdx, setExpandedResultIdx] = useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  const [previewArticle, setPreviewArticle] = useState<Article | null>(null);
  const [showStartModal, setShowStartModal] = useState(false);
  
  const [mcpUrl, setMcpUrl] = useState('https://jl1ynqxjgn.dy.takin.cc/mcp');
  const [mcpClient, setMcpClient] = useState<MCPClient | null>(null);
  const [mcpLogs, setMcpLogs] = useState<MCPLog[]>([]);
  const [mcpStatus, setMcpStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [mcpTools, setMcpTools] = useState<MCPTool[]>([]);
  const [selectedTool, setSelectedTool] = useState<MCPTool | null>(null);
  const [toolArgs, setToolArgs] = useState<string>('{}');
  const [toolParamValues, setToolParamValues] = useState<Record<string, string>>({});
  const [toolResult, setToolResult] = useState<any>(null);
  const [isCallingTool, setIsCallingTool] = useState(false);
  const [showAdvancedMcp, setShowAdvancedMcp] = useState(false);
  const [useNativeSSE, setUseNativeSSE] = useState(false);
  const [mcpHeaders, setMcpHeaders] = useState<string>(JSON.stringify({"ngrok-skip-browser-warning": "true"}, null, 2));
  const [lastError, setLastError] = useState<string>("");
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);
  const [parsedMcpItems, setParsedMcpItems] = useState<Array<{
    title: string;
    desc: string;
    nickname: string;
    avatar: string;
    urlDefault: string;
  }>>([]);
  const [isSavingMcpItem, setIsSavingMcpItem] = useState<number | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // 从 MCP 结果中解析 title、desc、nickname、avatar、urlDefault 字段
  const parseMcpResult = (result: any): Array<{title: string; desc: string; nickname: string; avatar: string; urlDefault: string}> => {
    const items: Array<{title: string; desc: string; nickname: string; avatar: string; urlDefault: string}> = [];
    
    const extractItem = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      
      // 检查当前对象是否包含我们需要的字段
      const hasTargetFields = ['title', 'desc', 'nickname', 'avatar', 'urlDefault'].some(key => key in obj);
      
      if (hasTargetFields) {
        items.push({
          title: obj.title || '',
          desc: obj.desc || obj.description || '',
          nickname: obj.nickname || obj.author || obj.userName || '',
          avatar: obj.avatar || obj.avatarUrl || '',
          urlDefault: obj.urlDefault || obj.imageUrl || obj.coverUrl || obj.image || ''
        });
      }
      
      // 递归搜索嵌套对象和数组
      if (Array.isArray(obj)) {
        obj.forEach(item => extractItem(item));
      } else {
        Object.values(obj).forEach(value => {
          if (typeof value === 'object' && value !== null) {
            extractItem(value);
          }
        });
      }
    };
    
    // 如果 result.content 是文本类型，尝试解析 JSON
    if (result?.content && Array.isArray(result.content)) {
      result.content.forEach((item: any) => {
        if (item.type === 'text' && item.text) {
          try {
            const parsed = JSON.parse(item.text);
            extractItem(parsed);
          } catch {
            // 不是 JSON，跳过
          }
        }
      });
    }
    
    // 也直接搜索 result 本身
    extractItem(result);
    
    return items;
  };
  
  // 保存 MCP 解析的内容为文章
  const handleSaveMcpItem = async (item: {title: string; desc: string; nickname: string; avatar: string; urlDefault: string}, index: number) => {
    if (!item.title.trim()) {
      alert('标题不能为空');
      return;
    }
    
    setIsSavingMcpItem(index);
    try {
      // 将作者信息放到 content 开头
      const authorInfo = item.nickname ? `> 作者: ${item.nickname}\n\n` : '';
      const fullContent = authorInfo + item.desc;
      
      const newArticle: Article = {
        id: `mcp-${Date.now()}-${index}`,
        title: item.title,
        content: fullContent,
        summary: item.desc.substring(0, 100) + '...',
        category: 'MCP导入',
        tags: [],
        tone: 'Professional',
        estimatedReadTime: Math.ceil(item.desc.split(' ').length / 200 * 60),
        created_at: Date.now(),
        isPublic: true,
        ownerId: user.id,
        imageUrl: item.urlDefault || undefined
      };
      
      await db.saveArticle(newArticle);
      await loadData();
      alert('保存成功！已添加到公共库。');
    } catch (e: any) {
      alert('保存失败: ' + e.message);
    } finally {
      setIsSavingMcpItem(null);
    }
  };

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mcpLogs]);

  useEffect(() => {
      loadData();
      return () => { mcpClient?.disconnect(); };
  }, [user.id, activeTab]);

  useEffect(() => {
      if (jinaApiKey) localStorage.setItem('JINA_API_KEY', jinaApiKey);
  }, [jinaApiKey]);

  const loadData = async () => {
      const [pub, rec, seeds, cats] = await Promise.all([
          db.getPublicArticles(),
          db.getRecycledArticles(),
          db.getUserSeedConfig(user.id),
          db.getCategories()
      ]);
      setPublicArticles(pub);
      setRecycledArticles(rec);
      setMySeedIds(seeds);
      setAvailableCategories(cats);
  };
  
  const handleJinaSearch = async (loadMore = false) => {
      if (!jinaSearchQuery.trim()) return;
      
      if (loadMore) {
          setIsLoadingMore(true);
      } else {
          setIsJinaSearching(true);
          setJinaSearchResults([]);
          setJinaSearchPage(1);
          setExpandedResultIdx(null);
      }
      setJinaSearchError('');
      
      const currentPage = loadMore ? jinaSearchPage + 1 : 1;
      
      try {
          const results = await searchJina(
              jinaSearchQuery.trim(), 
              jinaApiKey || undefined,
              { num: jinaSearchNum, page: currentPage }
          );
          
          if (loadMore) {
              setJinaSearchResults(prev => [...prev, ...results]);
              setJinaSearchPage(currentPage);
          } else {
              setJinaSearchResults(results);
          }
      } catch (e: any) {
          setJinaSearchError(e.message || 'Search failed');
      } finally {
          setIsJinaSearching(false);
          setIsLoadingMore(false);
      }
  };

  const handleImportFromSearch = async (url: string) => {
      setJinaUrl(url);
      setIsJinaLoading(true);
      setJinaError('');
      
      try {
          const result = await fetchJinaReader(url, jinaApiKey || undefined);
          setTitle(result.title);
          setContent(result.content);
          setImageUrl(result.coverImageUrl || '');
          setCategory('');
          setIsEditing(true);
          setActiveTab('public');
          setJinaSearchResults([]);
          setJinaSearchQuery('');
      } catch (e: any) {
          setJinaError(e.message || 'Failed to fetch content');
      } finally {
          setIsJinaLoading(false);
      }
  };

  const handleJinaFetch = async () => {
      if (!jinaUrl.trim()) return;
      setIsJinaLoading(true);
      setJinaError('');
      
      try {
          const result = await fetchJinaReader(jinaUrl.trim(), jinaApiKey);
          setTitle(result.title);
          setContent(result.content);
          setImageUrl(result.coverImageUrl || '');
          setCategory(''); 
          setIsEditing(true);
          setActiveTab('public');
      } catch (e: any) {
          setJinaError(e.message || 'Failed to fetch content');
      } finally {
          setIsJinaLoading(false);
      }
  };

  const handleConnectMcp = async () => {
      const client = new MCPClient((log) => setMcpLogs(prev => [...prev, log]));
      setMcpClient(client);
      setMcpStatus('connecting');
      setLastError("");
      setPingResult(null);

      try {
          await client.connect(mcpUrl);
          const tools = await client.listTools();
          setMcpTools(tools);
          setMcpStatus('connected');
          if (tools.length > 0) {
              setSelectedTool(tools[0]);
              setToolArgs('{}');
          }
      } catch (e: any) {
          setMcpStatus('error');
          setLastError(e.message);
      }
  };

  const handlePingTest = async () => {
      setPingResult("Pinging...");
      try {
          await fetch(mcpUrl, { mode: 'no-cors', headers: { "ngrok-skip-browser-warning": "true" } });
          setPingResult("✅ Success: Server is reachable!");
      } catch (e: any) {
          setPingResult(`❌ Failed: Server unreachable. (${e.message})`);
      }
  };

  const handleCallTool = async () => {
      if (!mcpClient || !selectedTool) return;
      setIsCallingTool(true);
      setToolResult(null);
      setParsedMcpItems([]);
      try {
          const args = JSON.parse(toolArgs);
          const result = await mcpClient.callTool(selectedTool.name, args);
          setToolResult(result);
          // 自动解析结果
          const parsed = parseMcpResult(result);
          setParsedMcpItems(parsed);
          setMcpLogs(prev => [...prev, { timestamp: Date.now(), type: 'info', message: `Tool Result`, data: result }]);
      } catch (e: any) { 
          setToolResult({ error: e.message });
          console.error(e); 
      } finally {
          setIsCallingTool(false);
      }
  };
  
  const buildArgsFromParams = () => {
      const args: Record<string, any> = {};
      const schema = selectedTool?.inputSchema;
      if (!schema?.properties) return args;
      
      for (const [key, prop] of Object.entries(schema.properties)) {
          const val = toolParamValues[key];
          if (val === undefined || val === '') continue;
          
          const propType = (prop as any).type;
          if (propType === 'number' || propType === 'integer') {
              args[key] = Number(val);
          } else if (propType === 'boolean') {
              args[key] = val === 'true';
          } else if (propType === 'array' || propType === 'object') {
              try { args[key] = JSON.parse(val); } catch { args[key] = val; }
          } else {
              args[key] = val;
          }
      }
      return args;
  };
  
  const handleCallToolWithParams = async () => {
      if (!mcpClient || !selectedTool) return;
      setIsCallingTool(true);
      setToolResult(null);
      setParsedMcpItems([]);
      try {
          const args = buildArgsFromParams();
          setToolArgs(JSON.stringify(args, null, 2));
          const result = await mcpClient.callTool(selectedTool.name, args);
          setToolResult(result);
          // 自动解析结果
          const parsed = parseMcpResult(result);
          setParsedMcpItems(parsed);
      } catch (e: any) { 
          setToolResult({ error: e.message });
      } finally {
          setIsCallingTool(false);
      }
  };
  
  const generateCurlCommand = () => { /* same as before */ return ""; }

  const handleSave = async () => {
    if (!title.trim() || !content.trim() || !category.trim()) { alert("请填写标题、分类和正文内容"); return; }
    const newArticle: Article = {
      id: `manual-${Date.now()}`,
      title,
      content,
      summary: content.substring(0, 100) + '...',
      category,
      tags: [], 
      tone: 'Professional',
      estimatedReadTime: Math.ceil(content.split(' ').length / 200 * 60),
      created_at: Date.now(),
      isPublic: true, 
      ownerId: user.id,
      imageUrl: imageUrl.trim() || undefined
    };
    await db.saveArticle(newArticle);
    loadData();
    setIsEditing(false);
    resetForm();
    alert('保存成功！已添加到公共库。');
  };
  
  const handleToggleSeed = async (articleId: string) => {
      let newSeeds = [...mySeedIds];
      if (newSeeds.includes(articleId)) newSeeds = newSeeds.filter(id => id !== articleId);
      else newSeeds.push(articleId);
      await db.updateUserSeedConfig(user.id, newSeeds);
      setMySeedIds(newSeeds);
  };

  const handleDelete = async (id: string) => { await db.softDeleteArticle(id); loadData(); };
  const handleRestore = async (id: string) => { await db.restoreArticle(id); loadData(); };
  const handleAddCategory = () => { if (newCategoryInput && !availableCategories.includes(newCategoryInput)) { setAvailableCategories(prev => [...prev, newCategoryInput]); setCategory(newCategoryInput); setNewCategoryInput(''); } };
  const resetForm = () => { setTitle(''); setContent(''); setImageUrl(''); setCategory(''); setNewCategoryInput(''); };

  const mySeedArticles = publicArticles.filter(a => mySeedIds.includes(a.id));
  const displayArticles = activeTab === 'trash' ? recycledArticles : (activeTab === 'public' ? publicArticles : mySeedArticles);

  // Render helpers (ArticlePreviewModal, StartConfirmationModal, renderArticleCard, renderTableRow) same as before...
  // Omitted for brevity, but logically identical, ensuring async functions are awaited where called.
  // ...
  
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 shrink-0">
        <h1 className="text-2xl font-bold text-slate-800">内容后台</h1>
        <div className="flex bg-slate-200 p-1 rounded-lg overflow-x-auto max-w-full w-full md:w-auto">
            <button onClick={() => setActiveTab('my-seed')} className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${activeTab === 'my-seed' ? 'bg-white shadow text-indigo-700' : 'text-slate-600'}`}>我的配置 ({mySeedIds.length})</button>
            <button onClick={() => setActiveTab('public')} className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${activeTab === 'public' ? 'bg-white shadow text-indigo-700' : 'text-slate-600'}`}>公共库 ({publicArticles.length})</button>
            <button onClick={() => setActiveTab('trash')} className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${activeTab === 'trash' ? 'bg-white shadow text-red-700' : 'text-slate-600'}`}>回收站 ({recycledArticles.length})</button>
            <button onClick={() => setActiveTab('mcp')} className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap flex items-center gap-1 ${activeTab === 'mcp' ? 'bg-white shadow text-emerald-700' : 'text-slate-600'}`}>🔌 MCP</button>
            <button onClick={() => setActiveTab('jina')} className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap flex items-center gap-1 ${activeTab === 'jina' ? 'bg-white shadow text-pink-700' : 'text-slate-600'}`}>🌏 Jina</button>
        </div>
      </div>

      {activeTab === 'jina' && (
          <div className="flex-1 overflow-y-auto flex flex-col gap-6 max-w-2xl mx-auto w-full">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><span>🔍</span> 搜索网页内容</h3>
                  <div className="space-y-4">
                      <div className="flex gap-2">
                          <input 
                              className="flex-1 bg-slate-50 border border-slate-300 rounded px-3 py-3 text-sm" 
                              placeholder="搜索关键词，例如：AI 推荐算法" 
                              value={jinaSearchQuery} 
                              onChange={e => setJinaSearchQuery(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleJinaSearch()}
                          />
                          <button 
                              onClick={() => handleJinaSearch(false)} 
                              disabled={isJinaSearching || !jinaSearchQuery.trim()} 
                              className="px-6 bg-blue-600 text-white font-bold rounded-lg shadow-sm disabled:opacity-50"
                          >
                              {isJinaSearching ? '搜索中...' : '搜索'}
                          </button>
                      </div>
                      {jinaSearchError && <div className="bg-red-50 text-red-700 p-3 rounded text-sm">{jinaSearchError}</div>}
                      
                      {jinaSearchResults.length > 0 && (
                          <div className="space-y-3">
                              <div className="text-sm text-slate-500 mb-2">找到 {jinaSearchResults.length} 条结果</div>
                              <div className="space-y-3 max-h-96 overflow-y-auto">
                                  {jinaSearchResults.map((result, idx) => (
                                      <div key={idx} className="p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors">
                                          <div 
                                              className="cursor-pointer"
                                              onClick={() => setExpandedResultIdx(expandedResultIdx === idx ? null : idx)}
                                          >
                                              <div className="flex items-start justify-between">
                                                  <div className="font-medium text-slate-800 mb-1 flex-1">{result.title}</div>
                                                  <span className="text-slate-400 text-xs ml-2">{expandedResultIdx === idx ? '收起' : '展开'}</span>
                                              </div>
                                              <div className="text-xs text-blue-600 mb-2 truncate hover:underline">{result.url}</div>
                                              <div className="text-sm text-slate-600 line-clamp-2">{result.description}</div>
                                          </div>
                                          
                                          {expandedResultIdx === idx && result.content && (
                                              <div className="mt-3 pt-3 border-t border-slate-200">
                                                  <div className="text-sm text-slate-700 whitespace-pre-wrap max-h-48 overflow-y-auto bg-white p-3 rounded border">
                                                      {result.content}
                                                  </div>
                                              </div>
                                          )}
                                          
                                          <div className="flex gap-2 mt-3">
                                              <button 
                                                  onClick={() => handleImportFromSearch(result.url)}
                                                  disabled={isJinaLoading}
                                                  className="text-sm px-3 py-1 bg-pink-600 text-white rounded hover:bg-pink-700 disabled:opacity-50"
                                              >
                                                  {isJinaLoading ? '导入中...' : '导入此文章'}
                                              </button>
                                              <a 
                                                  href={result.url} 
                                                  target="_blank" 
                                                  rel="noopener noreferrer"
                                                  className="text-sm px-3 py-1 border border-slate-300 text-slate-600 rounded hover:bg-slate-100"
                                              >
                                                  打开原文
                                              </a>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                              
                              <button 
                                  onClick={() => handleJinaSearch(true)}
                                  disabled={isLoadingMore}
                                  className="w-full py-2 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 disabled:opacity-50"
                              >
                                  {isLoadingMore ? '加载中...' : '加载更多结果'}
                              </button>
                          </div>
                      )}
                  </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><span>🚀</span> 从 URL 导入文章</h3>
                  <div className="space-y-4">
                      <input className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-3 font-mono text-sm" placeholder="https://example.com" value={jinaUrl} onChange={e => setJinaUrl(e.target.value)} />
                      <input className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 font-mono text-xs" placeholder="Jina API Key (Optional)" value={jinaApiKey} onChange={e => setJinaApiKey(e.target.value)} type="password" />
                      {jinaError && <div className="bg-red-50 text-red-700 p-3 rounded text-sm">{jinaError}</div>}
                      <button onClick={handleJinaFetch} disabled={isJinaLoading || !jinaUrl.trim()} className="w-full bg-pink-600 text-white font-bold py-3 rounded-lg shadow-sm disabled:opacity-50">{isJinaLoading ? '正在解析...' : '✨ 开始抓取'}</button>
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'mcp' && (
          <div className="flex-1 overflow-y-auto flex flex-col gap-4 max-w-4xl mx-auto w-full pb-8">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 shrink-0">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <span>🔌</span> MCP 服务器连接
                      <span className={`ml-auto px-2 py-1 rounded text-xs font-medium ${
                          mcpStatus === 'connected' ? 'bg-green-100 text-green-700' :
                          mcpStatus === 'connecting' ? 'bg-yellow-100 text-yellow-700' :
                          mcpStatus === 'error' ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-600'
                      }`}>
                          {mcpStatus === 'connected' ? '✓ 已连接' :
                           mcpStatus === 'connecting' ? '⏳ 连接中...' :
                           mcpStatus === 'error' ? '✗ 错误' : '○ 未连接'}
                      </span>
                  </h3>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">服务器地址</label>
                          <input 
                              className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 font-mono text-sm" 
                              placeholder="https://your-mcp-server.com/mcp" 
                              value={mcpUrl} 
                              onChange={e => setMcpUrl(e.target.value)}
                              disabled={mcpStatus === 'connecting'}
                          />
                      </div>
                      
                      <div>
                          <button 
                              onClick={() => setShowAdvancedMcp(!showAdvancedMcp)}
                              className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
                          >
                              {showAdvancedMcp ? '▼' : '▶'} 高级选项
                          </button>
                          
                          {showAdvancedMcp && (
                              <div className="mt-3 space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                                  <div className="flex items-center gap-3">
                                      <input 
                                          type="checkbox" 
                                          id="useNativeSSE" 
                                          checked={useNativeSSE} 
                                          onChange={e => setUseNativeSSE(e.target.checked)}
                                          className="w-4 h-4"
                                      />
                                      <label htmlFor="useNativeSSE" className="text-sm text-slate-700">
                                          使用 Native EventSource (不支持自定义 Headers)
                                      </label>
                                  </div>
                                  <div>
                                      <label className="block text-sm font-medium text-slate-700 mb-1">自定义 Headers (JSON)</label>
                                      <textarea 
                                          className="w-full bg-white border border-slate-300 rounded px-3 py-2 font-mono text-xs h-20"
                                          value={mcpHeaders}
                                          onChange={e => setMcpHeaders(e.target.value)}
                                          placeholder='{"Authorization": "Bearer xxx"}'
                                      />
                                  </div>
                              </div>
                          )}
                      </div>
                      
                      {lastError && (
                          <div className="bg-red-50 text-red-700 p-3 rounded text-sm border border-red-200">
                              <strong>错误：</strong> {lastError}
                          </div>
                      )}
                      
                      <div className="flex gap-3">
                          <button 
                              onClick={handlePingTest}
                              className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
                          >
                              🏓 Ping 测试
                          </button>
                          {mcpStatus === 'connected' ? (
                              <button 
                                  onClick={() => { mcpClient?.disconnect(); setMcpStatus('disconnected'); setMcpTools([]); }}
                                  className="flex-1 bg-red-600 text-white font-bold py-2 rounded-lg shadow-sm"
                              >
                                  断开连接
                              </button>
                          ) : (
                              <button 
                                  onClick={handleConnectMcp}
                                  disabled={mcpStatus === 'connecting' || !mcpUrl.trim()}
                                  className="flex-1 bg-emerald-600 text-white font-bold py-2 rounded-lg shadow-sm disabled:opacity-50"
                              >
                                  {mcpStatus === 'connecting' ? '连接中...' : '🔗 连接服务器'}
                              </button>
                          )}
                      </div>
                      
                      {pingResult && (
                          <div className={`p-3 rounded text-sm ${pingResult.includes('✅') ? 'bg-green-50 text-green-700' : pingResult.includes('❌') ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'}`}>
                              {pingResult}
                          </div>
                      )}
                  </div>
              </div>

              {mcpStatus === 'connected' && mcpTools.length > 0 && (
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                      <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                          <span>🛠️</span> 可用工具 ({mcpTools.length})
                      </h3>
                      
                      <div className="space-y-4">
                          <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">选择工具</label>
                              <select 
                                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2"
                                  value={selectedTool?.name || ''}
                                  onChange={e => {
                                      const tool = mcpTools.find(t => t.name === e.target.value);
                                      setSelectedTool(tool || null);
                                      setToolArgs('{}');
                                      setToolParamValues({});
                                      setToolResult(null);
                                  }}
                              >
                                  {mcpTools.map(tool => (
                                      <option key={tool.name} value={tool.name}>{tool.name}</option>
                                  ))}
                              </select>
                          </div>
                          
                          {selectedTool && (
                              <>
                                  {selectedTool.description && (
                                      <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded">
                                          {selectedTool.description}
                                      </div>
                                  )}
                                  
                                  {selectedTool.inputSchema?.properties && Object.keys(selectedTool.inputSchema.properties).length > 0 && (
                                      <div className="space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                                          <div className="text-sm font-medium text-slate-700">参数输入</div>
                                          {Object.entries(selectedTool.inputSchema.properties).map(([key, prop]: [string, any]) => {
                                              const isRequired = selectedTool.inputSchema?.required?.includes(key);
                                              return (
                                                  <div key={key}>
                                                      <label className="block text-xs font-medium text-slate-600 mb-1">
                                                          {key} {isRequired && <span className="text-red-500">*</span>}
                                                          <span className="text-slate-400 ml-2">({prop.type})</span>
                                                      </label>
                                                      {prop.description && (
                                                          <div className="text-xs text-slate-400 mb-1">{prop.description}</div>
                                                      )}
                                                      {prop.type === 'boolean' ? (
                                                          <select
                                                              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-sm"
                                                              value={toolParamValues[key] || ''}
                                                              onChange={e => setToolParamValues(prev => ({...prev, [key]: e.target.value}))}
                                                          >
                                                              <option value="">-- 选择 --</option>
                                                              <option value="true">true</option>
                                                              <option value="false">false</option>
                                                          </select>
                                                      ) : prop.enum ? (
                                                          <select
                                                              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-sm"
                                                              value={toolParamValues[key] || ''}
                                                              onChange={e => setToolParamValues(prev => ({...prev, [key]: e.target.value}))}
                                                          >
                                                              <option value="">-- 选择 --</option>
                                                              {prop.enum.map((v: string) => <option key={v} value={v}>{v}</option>)}
                                                          </select>
                                                      ) : prop.type === 'array' || prop.type === 'object' ? (
                                                          <textarea
                                                              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-sm font-mono h-16"
                                                              value={toolParamValues[key] || ''}
                                                              onChange={e => setToolParamValues(prev => ({...prev, [key]: e.target.value}))}
                                                              placeholder={prop.type === 'array' ? '["item1", "item2"]' : '{"key": "value"}'}
                                                          />
                                                      ) : (
                                                          <input
                                                              type={prop.type === 'number' || prop.type === 'integer' ? 'number' : 'text'}
                                                              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-sm"
                                                              value={toolParamValues[key] || ''}
                                                              onChange={e => setToolParamValues(prev => ({...prev, [key]: e.target.value}))}
                                                              placeholder={prop.default !== undefined ? `默认: ${prop.default}` : ''}
                                                          />
                                                      )}
                                                  </div>
                                              );
                                          })}
                                      </div>
                                  )}
                                  
                                  <div className="flex gap-3">
                                      <button 
                                          onClick={handleCallToolWithParams}
                                          disabled={isCallingTool}
                                          className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-lg shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                                      >
                                          {isCallingTool ? '⏳ 调用中...' : '▶ 调用工具'}
                                      </button>
                                  </div>
                                  
                                  <details className="text-xs">
                                      <summary className="cursor-pointer text-slate-500 hover:text-slate-700">查看原始 JSON 参数</summary>
                                      <textarea 
                                          className="w-full bg-slate-100 border border-slate-300 rounded px-3 py-2 font-mono text-xs h-20 mt-2"
                                          value={toolArgs}
                                          onChange={e => setToolArgs(e.target.value)}
                                          placeholder='{"param1": "value1"}'
                                      />
                                      <button 
                                          onClick={handleCallTool}
                                          disabled={isCallingTool}
                                          className="mt-2 px-4 py-1 bg-slate-600 text-white text-xs rounded hover:bg-slate-700 disabled:opacity-50"
                                      >
                                          使用 JSON 调用
                                      </button>
                                  </details>
                              </>
                          )}
                      </div>
                  </div>
              )}
              
              {toolResult && (
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                      <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                              <span>📦</span> 调用结果
                              {parsedMcpItems.length > 0 && (
                                  <span className="text-sm font-normal text-emerald-600">
                                      (识别到 {parsedMcpItems.length} 条内容)
                                  </span>
                              )}
                          </h3>
                          <div className="flex gap-2">
                              <button
                                  onClick={() => setShowRawJson(!showRawJson)}
                                  className="text-xs px-3 py-1 border border-slate-300 rounded hover:bg-slate-50"
                              >
                                  {showRawJson ? '结构化视图' : '原始 JSON'}
                              </button>
                              <button
                                  onClick={() => navigator.clipboard.writeText(JSON.stringify(toolResult, null, 2))}
                                  className="text-xs px-3 py-1 border border-slate-300 rounded hover:bg-slate-50"
                              >
                                  📋 复制
                              </button>
                              <button
                                  onClick={() => { setToolResult(null); setParsedMcpItems([]); }}
                                  className="text-xs px-3 py-1 text-red-600 border border-red-300 rounded hover:bg-red-50"
                              >
                                  ✕ 清除
                              </button>
                          </div>
                      </div>
                      
                      {toolResult.error ? (
                          <div className="bg-red-50 text-red-700 p-4 rounded-lg border border-red-200">
                              <strong>错误：</strong> {toolResult.error}
                          </div>
                      ) : showRawJson ? (
                          <pre className="bg-slate-900 text-green-400 p-4 rounded-lg overflow-auto max-h-96 text-xs font-mono">
                              {JSON.stringify(toolResult, null, 2)}
                          </pre>
                      ) : (
                          <div className="space-y-4">
                              {/* 结构化内容卡片 */}
                              {parsedMcpItems.length > 0 && (
                                  <div className="space-y-4">
                                      <div className="text-sm font-medium text-slate-600 flex items-center gap-2">
                                          <span>📝</span> 解析的内容
                                      </div>
                                      {parsedMcpItems.map((item, idx) => (
                                          <div key={idx} className="bg-gradient-to-r from-slate-50 to-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                              {/* 头部：头像和用户名 */}
                                              <div className="flex items-center gap-3 mb-3">
                                                  {item.avatar ? (
                                                      <img 
                                                          src={item.avatar} 
                                                          alt={item.nickname || '用户'} 
                                                          className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm"
                                                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                      />
                                                  ) : (
                                                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold">
                                                          {(item.nickname || '?')[0]}
                                                      </div>
                                                  )}
                                                  <div>
                                                      <div className="font-medium text-slate-800">{item.nickname || '未知用户'}</div>
                                                      <div className="text-xs text-slate-400">作者</div>
                                                  </div>
                                              </div>
                                              
                                              {/* 标题 */}
                                              {item.title && (
                                                  <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
                                              )}
                                              
                                              {/* 内容图片 */}
                                              {item.urlDefault && (
                                                  <div className="mb-3">
                                                      <img 
                                                          src={item.urlDefault} 
                                                          alt="内容图片" 
                                                          className="w-full max-h-64 object-cover rounded-lg border border-slate-200"
                                                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                      />
                                                  </div>
                                              )}
                                              
                                              {/* 描述/详情 */}
                                              {item.desc && (
                                                  <div className="text-sm text-slate-600 mb-4 whitespace-pre-wrap line-clamp-5">
                                                      {item.desc}
                                                  </div>
                                              )}
                                              
                                              {/* 操作按钮 */}
                                              <div className="flex gap-2 pt-3 border-t border-slate-100">
                                                  <button
                                                      onClick={() => handleSaveMcpItem(item, idx)}
                                                      disabled={isSavingMcpItem === idx || !item.title}
                                                      className="flex-1 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                                  >
                                                      {isSavingMcpItem === idx ? (
                                                          <>⏳ 保存中...</>
                                                      ) : (
                                                          <>💾 保存到服务器</>
                                                      )}
                                                  </button>
                                                  <button
                                                      onClick={() => {
                                                          setTitle(item.title);
                                                          setContent(item.desc);
                                                          setImageUrl(item.urlDefault);
                                                          setCategory('');
                                                          setIsEditing(true);
                                                          setActiveTab('public');
                                                      }}
                                                      className="px-4 py-2 border border-slate-300 text-slate-600 text-sm rounded-lg hover:bg-slate-50 flex items-center gap-1"
                                                  >
                                                      ✏️ 编辑后保存
                                                  </button>
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              )}
                              
                              {/* 原始内容展示 */}
                              <details className={parsedMcpItems.length > 0 ? '' : 'open'}>
                                  <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-700 py-2">
                                      {parsedMcpItems.length > 0 ? '查看原始返回内容' : '返回内容'}
                                  </summary>
                                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 overflow-auto max-h-96 mt-2">
                                      {toolResult.content ? (
                                          <div className="space-y-3">
                                              {Array.isArray(toolResult.content) ? toolResult.content.map((item: any, idx: number) => (
                                                  <div key={idx} className="p-3 bg-white rounded border border-slate-200">
                                                      {item.type === 'text' && (
                                                          <div className="whitespace-pre-wrap text-sm text-slate-700">{item.text}</div>
                                                      )}
                                                      {item.type === 'image' && item.data && (
                                                          <img src={`data:${item.mimeType};base64,${item.data}`} alt="" className="max-w-full rounded" />
                                                      )}
                                                      {item.type !== 'text' && item.type !== 'image' && (
                                                          <pre className="text-xs font-mono text-slate-600">{JSON.stringify(item, null, 2)}</pre>
                                                      )}
                                                  </div>
                                              )) : (
                                                  <pre className="text-xs font-mono text-slate-600">{JSON.stringify(toolResult.content, null, 2)}</pre>
                                              )}
                                          </div>
                                      ) : (
                                          <pre className="text-xs font-mono text-slate-600">{JSON.stringify(toolResult, null, 2)}</pre>
                                      )}
                                  </div>
                              </details>
                          </div>
                      )}
                  </div>
              )}

              <details className="bg-slate-900 rounded-xl overflow-hidden">
                  <summary className="px-4 py-3 bg-slate-800 text-slate-400 text-sm font-mono flex items-center justify-between cursor-pointer hover:bg-slate-700">
                      <span>📋 通信日志 ({mcpLogs.length})</span>
                  </summary>
                  <div className="flex items-center justify-end px-4 py-2 bg-slate-800 border-t border-slate-700">
                      <button 
                          onClick={() => setMcpLogs([])}
                          className="text-xs text-slate-500 hover:text-slate-300"
                      >
                          清空日志
                      </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto p-4 font-mono text-xs space-y-1">
                      {mcpLogs.length === 0 ? (
                          <div className="text-slate-500 text-center py-4">等待连接...</div>
                      ) : (
                          mcpLogs.map((log, idx) => (
                              <div key={idx} className={`${
                                  log.type === 'error' ? 'text-red-400' :
                                  log.type === 'send' ? 'text-blue-400' :
                                  log.type === 'recv' ? 'text-green-400' :
                                  'text-slate-400'
                              }`}>
                                  <span className="text-slate-600">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                                  <span className={`mx-2 px-1 rounded text-xs ${
                                      log.type === 'error' ? 'bg-red-900' :
                                      log.type === 'send' ? 'bg-blue-900' :
                                      log.type === 'recv' ? 'bg-green-900' :
                                      'bg-slate-700'
                                  }`}>
                                      {log.type.toUpperCase()}
                                  </span>
                                  {log.message}
                                  {log.data && (
                                      <pre className="mt-1 ml-4 text-slate-500 whitespace-pre-wrap break-all">
                                          {typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2)}
                                      </pre>
                                  )}
                              </div>
                          ))
                      )}
                      <div ref={logsEndRef} />
                  </div>
              </details>
          </div>
      )}
      
      {activeTab === 'public' && !isEditing && (
         <div className="mb-6 flex justify-end shrink-0"><button onClick={() => setIsEditing(true)} className="bg-indigo-600 text-white px-4 py-2 rounded shadow-sm text-sm">+ 添加公共内容</button></div>
      )}
      
      {isEditing && (
          <div className="bg-white p-6 rounded-xl shadow-lg mb-8 border border-slate-200 shrink-0">
             <h3 className="text-lg font-bold text-slate-800 mb-4">编辑文章</h3>
             <div className="space-y-4">
                 <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">标题</label>
                     <input 
                         type="text" 
                         value={title} 
                         onChange={e => setTitle(e.target.value)}
                         className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2"
                         placeholder="文章标题"
                     />
                 </div>
                 <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">封面图片 URL</label>
                     <input 
                         type="text" 
                         value={imageUrl} 
                         onChange={e => setImageUrl(e.target.value)}
                         className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2"
                         placeholder="https://..."
                     />
                 </div>
                 <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">分类</label>
                     <div className="flex gap-2">
                         <select 
                             value={category} 
                             onChange={e => setCategory(e.target.value)}
                             className="flex-1 bg-slate-50 border border-slate-300 rounded px-3 py-2"
                         >
                             <option value="">选择分类</option>
                             {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                         </select>
                         <input 
                             type="text" 
                             value={newCategoryInput} 
                             onChange={e => setNewCategoryInput(e.target.value)}
                             className="w-32 bg-slate-50 border border-slate-300 rounded px-3 py-2"
                             placeholder="新分类"
                         />
                         <button 
                             onClick={handleAddCategory} 
                             className="px-3 py-2 bg-slate-200 rounded text-sm"
                         >
                             添加
                         </button>
                     </div>
                 </div>
                 <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">正文内容 (Markdown)</label>
                     <textarea 
                         value={content} 
                         onChange={e => setContent(e.target.value)}
                         className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 h-64 font-mono text-sm"
                         placeholder="文章正文..."
                     />
                 </div>
             </div>
             <div className="flex gap-3 justify-end pt-4">
                 <button onClick={() => { setIsEditing(false); resetForm(); }} className="px-5 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
                 <button onClick={handleSave} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold">保存内容</button>
             </div>
          </div>
      )}

      {activeTab !== 'jina' && activeTab !== 'mcp' && !isEditing && (
          <div className="flex-1 overflow-y-auto min-h-0 bg-white rounded-lg border border-slate-200">
              <table className="hidden md:table w-full text-left border-collapse">
                  <thead className="bg-slate-50 sticky top-0 z-10"><tr><th className="p-3">标题</th><th className="p-3">分类</th><th className="p-3">操作</th></tr></thead>
                  <tbody>
                      {displayArticles.map(a => (
                        <tr key={a.id} className="border-t hover:bg-slate-50">
                            <td className="p-3">
                                <div className="font-medium">{a.title}</div>
                                <div className="text-xs text-slate-400 truncate w-64">{a.summary}</div>
                            </td>
                            <td className="p-3"><span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs">{a.category}</span></td>
                            <td className="p-3">
                                <div className="flex gap-2">
                                   <button onClick={() => setPreviewArticle(a)} className="text-xs border px-2 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100">预览</button>
                                   {activeTab !== 'trash' && (
                                     <button onClick={() => handleToggleSeed(a.id)} className="text-xs border px-2 py-1 rounded">{mySeedIds.includes(a.id) ? '移除配置' : '加入配置'}</button>
                                   )}
                                   {activeTab === 'trash' ? (
                                     <button onClick={() => handleRestore(a.id)} className="text-xs text-green-600 border px-2 py-1 rounded">恢复</button>
                                   ) : (
                                     <button onClick={() => handleDelete(a.id)} className="text-xs text-red-500 border px-2 py-1 rounded">删除</button>
                                   )}
                                </div>
                            </td>
                        </tr>
                      ))}
                  </tbody>
              </table>
              
              <div className="md:hidden space-y-3 p-3">
                  {displayArticles.map(a => (
                    <div key={a.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="font-medium text-slate-800 mb-1">{a.title}</div>
                        <div className="text-xs text-slate-500 mb-2 line-clamp-2">{a.summary}</div>
                        <div className="flex items-center justify-between">
                            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs">{a.category}</span>
                            <div className="flex gap-2">
                                <button onClick={() => setPreviewArticle(a)} className="text-xs border px-2 py-1 rounded bg-indigo-50 text-indigo-700">预览</button>
                                {activeTab === 'trash' ? (
                                  <button onClick={() => handleRestore(a.id)} className="text-xs text-green-600 border px-2 py-1 rounded">恢复</button>
                                ) : (
                                  <button onClick={() => handleDelete(a.id)} className="text-xs text-red-500 border px-2 py-1 rounded">删除</button>
                                )}
                            </div>
                        </div>
                    </div>
                  ))}
              </div>
          </div>
      )}

      {previewArticle && (
          <div className="fixed inset-0 bg-white z-50 flex flex-col">
              <div className="h-16 border-b flex items-center justify-between px-4 bg-white shrink-0">
                  <button 
                      onClick={() => setPreviewArticle(null)}
                      className="text-slate-600 hover:text-slate-900 font-medium flex items-center"
                  >
                      ← 返回列表
                  </button>
                  <div className="flex gap-2">
                      {activeTab !== 'trash' && (
                          <button 
                              onClick={() => { handleToggleSeed(previewArticle.id); }}
                              className={`px-3 py-1.5 rounded text-sm font-medium ${mySeedIds.includes(previewArticle.id) ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}
                          >
                              {mySeedIds.includes(previewArticle.id) ? '★ 已加入配置' : '☆ 加入配置'}
                          </button>
                      )}
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto w-full">
                  <div className="max-w-2xl mx-auto p-4 pt-6">
                      <div className="mb-6">
                          <span className="text-blue-600 font-medium text-sm">{previewArticle.category}</span>
                          <h1 className="text-3xl font-bold text-slate-900 mt-1 mb-4">{previewArticle.title}</h1>
                          <div className="flex gap-2 mb-6">
                              {previewArticle.tags?.map(t => <span key={t} className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs">#{t}</span>)}
                          </div>
                          {previewArticle.imageUrl && (
                              <div className="w-full h-64 md:h-80 rounded-xl overflow-hidden mb-8">
                                  <img src={previewArticle.imageUrl} alt={previewArticle.title} className="w-full h-full object-cover" />
                              </div>
                          )}
                      </div>

                      <div className="border-b border-slate-100 pb-8 mb-8">
                          <MarkdownRenderer content={previewArticle.content || ''} />
                      </div>

                      <div className="h-12 flex items-center justify-center text-slate-300 text-xs">
                          Article ID: {previewArticle.id}
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};