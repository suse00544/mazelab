import React, { useState, useEffect, useRef } from 'react';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { MessageModal } from '../components/MessageModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { db } from '../services/db';
import { Article, User, ContentMedia, Experiment } from '../types';
import { fetchJinaReader, searchJina, JinaSearchResult } from '../services/jinaService';
import { checkXHSCrawlerHealth, setXHSCookies, searchXHSNotes, getXHSNoteDetail, getXHSComments, getXHSNotesByIds, getUserNotes, getUserInfo, generateWordCloud, getNotesFromUrls, getUserFromUrl, getXHSCookieStatus, clearXHSCookies, CookieExpiredError, XHSNote, XHSNoteDetail, XHSComment, XHSUser } from '../services/xhsService';

interface Props {
    user: User;
    experiment?: Experiment | null;
    onStartExperiment?: () => void;
}

export const Admin: React.FC<Props> = ({ user, experiment, onStartExperiment }) => {
  const [activeTab, setActiveTab] = useState<'library' | 'jina' | 'xhs'>('library');
  const [libraryTab, setLibraryTab] = useState<'personal' | 'community'>('personal');
  
  // 格式化点赞数：转换为w单位
  const formatLikedCount = (count: string | number): string => {
      const num = typeof count === 'string' ? parseFloat(count.replace(/[^\d.]/g, '')) || 0 : count;
      if (num >= 10000) {
          return (num / 10000).toFixed(1).replace(/\.0$/, '') + 'w';
      }
      return num.toString();
  };
  
  // 消息弹窗状态
  const [messageModal, setMessageModal] = useState<{ show: boolean; message: string; type?: 'info' | 'success' | 'warning' | 'error' }>({ show: false, message: '', type: 'info' });
  const [confirmModal, setConfirmModal] = useState<{ show: boolean; message: string; title?: string; onConfirm?: () => void }>({ show: false, message: '', title: '' });
  const [personalArticles, setPersonalArticles] = useState<Article[]>([]);
  const [communityArticles, setCommunityArticles] = useState<Article[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  
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

  const [xhsCookies, setXhsCookies] = useState(() => localStorage.getItem('XHS_COOKIES') || '');
  const [xhsStatus, setXhsStatus] = useState<'unknown' | 'ready' | 'error'>('unknown');
  const [xhsError, setXhsError] = useState('');
  const [xhsSearchQuery, setXhsSearchQuery] = useState('');
  const [xhsSearchResults, setXhsSearchResults] = useState<XHSNote[]>([]);
  const [xhsSearchPage, setXhsSearchPage] = useState(1);
  const [xhsHasMore, setXhsHasMore] = useState(false);
  const [isXhsSearching, setIsXhsSearching] = useState(false);
  const [isXhsLoadingMore, setIsXhsLoadingMore] = useState(false);
  const [xhsNoteDetail, setXhsNoteDetail] = useState<XHSNoteDetail | null>(null);
  const [isXhsLoadingDetail, setIsXhsLoadingDetail] = useState(false);
  const [isSavingXhsNote, setIsSavingXhsNote] = useState(false);
  const [xhsSort, setXhsSort] = useState<'general' | 'popular' | 'latest'>('general');
  const [showXhsCookieModal, setShowXhsCookieModal] = useState(false);
  
  // 新功能相关 state
  const [xhsMode, setXhsMode] = useState<'search' | 'byIds' | 'byUser'>('search');
  const [xhsNoteIds, setXhsNoteIds] = useState('');
  const [xhsUserId, setXhsUserId] = useState('');
  const [xhsUserInfo, setXhsUserInfo] = useState<XHSUser | null>(null);
  const [xhsUserNotes, setXhsUserNotes] = useState<XHSNote[]>([]);
  const [isXhsLoadingUser, setIsXhsLoadingUser] = useState(false);
  const [isXhsLoadingByIds, setIsXhsLoadingByIds] = useState(false);
  
  // 评论相关 state
  const [xhsComments, setXhsComments] = useState<XHSComment[]>([]);
  const [isXhsLoadingComments, setIsXhsLoadingComments] = useState(false);
  const [xhsCommentNum, setXhsCommentNum] = useState(10);
  const [xhsGetSubComments, setXhsGetSubComments] = useState(true);
  const [showXhsComments, setShowXhsComments] = useState(false);
  
  // 词云图相关 state
  const [xhsWordCloud, setXhsWordCloud] = useState<string | null>(null);
  const [isXhsGeneratingWordCloud, setIsXhsGeneratingWordCloud] = useState(false);

  // 批量保存相关 state
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const [batchSaveProgress, setBatchSaveProgress] = useState({ current: 0, total: 0 });

  // 图片预览相关 state
  const [libraryLightboxImage, setLibraryLightboxImage] = useState<string | null>(null);
  const [xhsLightboxImage, setXhsLightboxImage] = useState<string | null>(null);

  // 显示消息弹窗的辅助函数
  const showMessage = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
      setMessageModal({ show: true, message, type });
  };

  // 显示确认弹窗的辅助函数
  const showConfirm = (message: string, title: string, onConfirm: () => void) => {
      setConfirmModal({ show: true, message, title, onConfirm });
  };

  // 加载数据 - 当实验ID变化时立即清空并重新加载
  useEffect(() => {
      // 立即清空个人库状态，确保不会显示旧数据
      setPersonalArticles([]);

      const loadData = async () => {
          const expId = experiment?.id;
          console.log('[Admin] loadData called with experimentId:', expId);
          console.log('[Admin] Full experiment object:', experiment ? JSON.stringify({id: experiment.id, name: experiment.name, mode: experiment.mode}) : 'null');

          // 验证实验ID存在
          if (!expId) {
              console.log('[Admin] No experiment selected, showing empty personal library');
              setCommunityArticles(await db.getCommunityLibrary());
              return;
          }

          const [personal, community] = await Promise.all([
              db.getPersonalLibrary(user.id, expId),
              db.getCommunityLibrary()
          ]);
          console.log('[Admin] Personal library loaded:', personal.length, 'articles for experiment:', expId);
          setPersonalArticles(personal);
          setCommunityArticles(community);
      };
      loadData();
  }, [user.id, experiment?.id, activeTab]);

  useEffect(() => {
      if (jinaApiKey) localStorage.setItem('JINA_API_KEY', jinaApiKey);
  }, [jinaApiKey]);

  useEffect(() => {
      if (xhsCookies) localStorage.setItem('XHS_COOKIES', xhsCookies);
  }, [xhsCookies]);

  useEffect(() => {
      if (activeTab === 'xhs') {
          checkXHSCrawlerHealth()
              .then(() => setXhsStatus('ready'))
              .catch(() => setXhsStatus('error'));
      }
  }, [activeTab]);

  // 用于手动刷新的 loadData
  const loadData = async () => {
      const expId = experiment?.id;
      console.log('[Admin] Manual loadData called with experimentId:', expId);
      if (!expId) {
          console.log('[Admin] No experiment for manual refresh, clearing personal library');
          setPersonalArticles([]);
          setCommunityArticles(await db.getCommunityLibrary());
          return;
      }
      const [personal, community] = await Promise.all([
          db.getPersonalLibrary(user.id, expId),
          db.getCommunityLibrary()
      ]);
      console.log('[Admin] Manual refresh: loaded', personal.length, 'articles for experiment:', expId);
      setPersonalArticles(personal);
      setCommunityArticles(community);
  };

  const handleClearPersonalLibrary = async () => {
      if (!experiment?.id) {
          showMessage('请先选择一个实验', 'warning');
          return;
      }

      showConfirm(
          `确定要清空当前实验「${experiment.name}」的个人库吗？这将删除该实验个人库中的所有 ${personalArticles.length} 篇内容，此操作不可撤销。`,
          '清空个人库',
          async () => {
              try {
                  await db.clearPersonalLibrary(user.id, experiment.id);
                  await loadData();
                  showMessage('个人库已清空', 'success');
              } catch (e: any) {
                  showMessage('清空失败: ' + e.message, 'error');
              }
          }
      );
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
      if (!experiment?.id) {
          showMessage('请先选择一个实验，才能添加内容到个人库', 'warning');
          return;
      }

      setIsJinaLoading(true);
      setJinaError('');

      try {
          const result = await fetchJinaReader(url, jinaApiKey || undefined);
          
          // 直接保存到数据库（个人库）
          const newArticle: Article = {
              id: `jina-${Date.now()}`,
              source: 'jina',
              original_url: url,
              title: result.title,
              summary: result.content.substring(0, 100) + '...',
              content: result.content,
              content_plain: result.content.replace(/[#*\[\]()]/g, ''),
              category: 'Jina导入',
              tags: [],
              tone: 'Professional',
              estimatedReadTime: Math.ceil(result.content.split(' ').length / 200 * 60),
              created_at: Date.now(),
              isPublic: true,
              ownerId: user.id,
              imageUrl: result.coverImageUrl || undefined,
              status: 'active',
              library_type: 'personal',
              owner_id: user.id,
              experiment_id: experiment?.id
          };

          await db.saveArticle(newArticle);
          await loadData();
          showMessage('导入成功！已添加到个人库。', 'success');
          setJinaSearchResults([]);
          setJinaSearchQuery('');
      } catch (e: any) {
          setJinaError(e.message || 'Failed to fetch content');
          showMessage('导入失败: ' + e.message, 'error');
      } finally {
          setIsJinaLoading(false);
      }
  };

  const handleJinaFetch = async () => {
      if (!jinaUrl.trim()) return;
      if (!experiment?.id) {
          showMessage('请先选择一个实验，才能添加内容到个人库', 'warning');
          return;
      }

      setIsJinaLoading(true);
      setJinaError('');

      try {
          const result = await fetchJinaReader(jinaUrl.trim(), jinaApiKey);
          
          // 直接保存到数据库（个人库）
          const newArticle: Article = {
              id: `jina-${Date.now()}`,
              source: 'jina',
              original_url: jinaUrl.trim(),
              title: result.title,
              summary: result.content.substring(0, 100) + '...',
              content: result.content,
              content_plain: result.content.replace(/[#*\[\]()]/g, ''),
              category: 'Jina导入',
              tags: [],
              tone: 'Professional',
              estimatedReadTime: Math.ceil(result.content.split(' ').length / 200 * 60),
              created_at: Date.now(),
              isPublic: true,
              ownerId: user.id,
              imageUrl: result.coverImageUrl || undefined,
              status: 'active',
              library_type: 'personal',
              owner_id: user.id,
              experiment_id: experiment?.id
          };

          await db.saveArticle(newArticle);
          await loadData();
          setJinaUrl('');
          showMessage('导入成功！已添加到个人库。', 'success');
      } catch (e: any) {
          setJinaError(e.message || 'Failed to fetch content');
          showMessage('导入失败: ' + e.message, 'error');
      } finally {
          setIsJinaLoading(false);
      }
  };

  const handleXhsSetCookies = async () => {
      if (!xhsCookies.trim()) return;
      setXhsError('');
      try {
          await setXHSCookies(xhsCookies.trim());
          setXhsStatus('ready');
          showMessage('Cookie 设置成功！', 'success');
      } catch (e: any) {
          setXhsError(e.message || 'Failed to set cookies');
          setXhsStatus('error');
      }
  };

  const handleXhsSearch = async (loadMore = false) => {
      if (!xhsSearchQuery.trim()) return;
      if (loadMore) {
          setIsXhsLoadingMore(true);
      } else {
          setIsXhsSearching(true);
          setXhsSearchResults([]);
          setXhsSearchPage(1);
          setXhsNoteDetail(null);
      }
      setXhsError('');
      const currentPage = loadMore ? xhsSearchPage + 1 : 1;
      try {
          const result = await searchXHSNotes(xhsSearchQuery.trim(), currentPage, 20, xhsSort, 'image');
          console.log('[XHS Search] Full result:', result);
          console.log('[XHS Search] Result keys:', result ? Object.keys(result) : 'null');
          
          // 检查返回结果
          if (result) {
              // 获取notes数组 - 确保字段名正确
              const notes = result.notes || result.data || result.items || [];
              
              if (!Array.isArray(notes)) {
                  console.error('[XHS Search] Notes is not an array:', typeof notes, notes);
                  setXhsSearchResults([]);
                  setXhsHasMore(false);
                  showMessage('搜索结果格式错误', 'error');
                  return;
              }
              
              console.log('[XHS Search] Notes count:', notes.length);
              
          if (loadMore) {
                  setXhsSearchResults(prev => [...prev, ...notes]);
              setXhsSearchPage(currentPage);
          } else {
                  setXhsSearchResults(notes);
              }
              setXhsHasMore(result.has_more || result.hasMore || false);
              
              if (notes.length === 0) {
                  showMessage('未找到相关笔记，请尝试其他关键词或检查Cookie配置', 'info');
              }
          } else {
              console.warn('[XHS Search] Result is null or undefined');
              setXhsSearchResults([]);
              setXhsHasMore(false);
              showMessage('搜索失败：未收到有效响应', 'error');
          }
      } catch (e: any) {
          console.error('[XHS Search] Error:', e);
          setXhsError(e.message || 'Search failed');
          setXhsSearchResults([]);
          showMessage('搜索失败: ' + (e.message || '未知错误'), 'error');
      } finally {
          setIsXhsSearching(false);
          setIsXhsLoadingMore(false);
      }
  };

  const handleXhsGetDetail = async (note: XHSNote) => {
      setIsXhsLoadingDetail(true);
      setXhsError('');
        setXhsComments([]);
        setShowXhsComments(false);
        setXhsWordCloud(null);
      try {
          const result = await getXHSNoteDetail(note.id, note.xsec_token);
          if (result.success && result.note) {
              // 保存 xsec_token 以便后续获取评论时使用
              setXhsNoteDetail({
                  ...result.note,
                  xsec_token: note.xsec_token || ''
              });
          } else {
              setXhsError(result.error || 'Failed to get note detail');
          }
      } catch (e: any) {
          setXhsError(e.message || 'Failed to get note detail');
      } finally {
          setIsXhsLoadingDetail(false);
      }
  };

  // 下载图片到服务器
  const downloadImage = async (url: string): Promise<string | null> => {
      if (!url) return null;
      try {
          console.log('[Download] Starting:', url.substring(0, 80) + '...');
          const response = await fetch('/api/image-download', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url })
          });
          if (response.ok) {
              const data = await response.json();
              console.log('[Download] Success:', data.url);
              return data.url; // 返回本地路径如 /uploads/xxx.jpg
          } else {
              const errText = await response.text();
              console.error('[Download] Failed:', response.status, errText);
          }
      } catch (e) {
          console.error('[Download] Error:', e);
      }
      return null;
  };

  const handleSaveXhsNote = async () => {
      if (!xhsNoteDetail) return;
      if (!experiment?.id) {
          showMessage('请先选择一个实验，才能添加内容到个人库', 'warning');
          return;
      }

      setIsSavingXhsNote(true);
      try {
          const downloadedImages: string[] = [];
          const images = xhsNoteDetail.images || [];
          const tagList = xhsNoteDetail.tag_list || [];
          
          // 下载所有图片
          for (const imgUrl of images) {
              const downloaded = await downloadImage(imgUrl);
              downloadedImages.push(downloaded || imgUrl);
          }
          
          // 构建媒体资源列表
          const media: ContentMedia[] = downloadedImages.map((url, idx) => ({
              type: 'image' as const,
              url_local: url,
              url_source: images[idx] || undefined,
              order: idx
          }));
          
          // 保存为与小红书预览格式一致的 Article
          // 参考 convertXHSNoteToArticle 的字段映射，完全复刻小红书字段
          const rawDesc = xhsNoteDetail.desc || '';
          // 处理 desc：删除话题标签 #xxx[话题]#
          const desc = tagList.length > 0
              ? rawDesc.replace(/#[^#\n]+\[话题\]#/g, '').trim()
              : rawDesc;
          const imagesMarkdown = downloadedImages.map((url, i) => `![图片${i + 1}](${url})`).join('\n\n');
          
          // 解析数字（处理"1w"格式）
          const parseNumber = (str: string | number): number => {
              if (typeof str === 'number') return str;
              if (!str) return 0;
              const numStr = str.toString();
              const num = parseFloat(numStr.replace(/[万w]/i, ''));
              if (numStr.includes('万') || numStr.toLowerCase().includes('w')) {
                  return Math.round(num * 10000);
              }
              return Math.round(num);
          };
          
          // 完全按照小红书爬虫返回的字段保存（个人库）
          const newArticle: any = {
              id: `xhs-${xhsNoteDetail.id}-${Date.now()}`,

              // 小红书核心字段（完全按照爬虫返回）
              xsec_token: (xhsNoteDetail as any).xsec_token || '',
              title: xhsNoteDetail.title || desc.slice(0, 50) || '无标题',
              desc: desc,
              type: xhsNoteDetail.type || 'normal',

              // 用户信息（扁平化存储）
              user_id: xhsNoteDetail.user?.user_id || '',
              user_nickname: xhsNoteDetail.user?.nickname || '',
              user_avatar: xhsNoteDetail.user?.avatar || '',

              // 媒体资源
              cover: (xhsNoteDetail as any).cover || downloadedImages[0] || '',
              images: downloadedImages.length > 0 ? downloadedImages : (xhsNoteDetail.images || []),
              video_url: xhsNoteDetail.video_url || '',

              // 统计数据（保持字符串格式）
              liked_count: xhsNoteDetail.liked_count || '0',
              collected_count: xhsNoteDetail.collected_count || '0',
              comment_count: xhsNoteDetail.comment_count || '0',
              share_count: xhsNoteDetail.share_count || '0',

              // 其他信息
              time: xhsNoteDetail.time || 0,
              tag_list: tagList,

              // 系统字段
              created_at: Date.now(),
              updated_at: Date.now(),

              // 库信息（手动添加到个人库）
              library_type: 'personal',
              owner_id: user.id,
              experiment_id: experiment?.id
          };

          // 调试：输出要保存的数据，确认不包含 subtitle
          console.log('[Admin] 准备保存的文章数据:', {
              id: newArticle.id,
              title: newArticle.title,
              keys: Object.keys(newArticle),
              hasSubtitle: 'subtitle' in newArticle
          });

          await db.saveArticle(newArticle);
          await loadData();
          showMessage('保存成功！已添加到个人库。', 'success');
          setXhsNoteDetail(null);
      } catch (e: any) {
          showMessage('保存失败: ' + e.message, 'error');
      } finally {
          setIsSavingXhsNote(false);
      }
  };

  // 按笔记 URL 批量抓取
  const handleXhsFetchByIds = async () => {
      if (!xhsNoteIds.trim()) {
          showMessage('请输入笔记链接或ID，多个用换行或逗号分隔', 'warning');
          return;
      }
      setIsXhsLoadingByIds(true);
      setXhsError('');
      try {
          const result = await getNotesFromUrls(xhsNoteIds);
          if (result.success && result.notes.length > 0) {
              // 将结果转换为 XHSNote 格式显示
              const notes: XHSNote[] = result.notes.map(note => ({
                  id: note.id,
                  xsec_token: (note as any).xsec_token || '',
                  title: note.title,
                  desc: note.desc,
                  type: note.type,
                  user: note.user,
                  cover: note.images && note.images.length > 0 ? note.images[0] : '',
                  liked_count: note.liked_count,
              }));
              setXhsSearchResults(notes);
              setXhsNoteDetail(null);
              setXhsComments([]);
              setShowXhsComments(false);
              const msg = result.failed > 0
                  ? `成功获取 ${result.fetched}/${result.total} 条笔记，${result.failed} 条失败`
                  : `成功获取 ${result.fetched} 条笔记`;
              showMessage(msg, result.failed > 0 ? 'warning' : 'success');
          } else {
              showMessage('未获取到笔记，请检查链接是否正确', 'warning');
          }
      } catch (e: any) {
          setXhsError(e.message || 'Failed to fetch notes');
          showMessage('获取失败: ' + e.message, 'error');
      } finally {
          setIsXhsLoadingByIds(false);
      }
  };

  // 按作者主页 URL 抓取
  const handleXhsFetchByUser = async () => {
      if (!xhsUserId.trim()) {
          showMessage('请输入用户主页链接或ID', 'warning');
          return;
      }
      setIsXhsLoadingUser(true);
      setXhsError('');
      try {
          // 使用新的 URL API 同时获取用户信息和笔记
          const result = await getUserFromUrl(xhsUserId.trim(), 20);

          if (result.success) {
              if (result.user) {
                  setXhsUserInfo(result.user);
              }

              if (result.notes && result.notes.length > 0) {
                  setXhsUserNotes(result.notes);
                  setXhsSearchResults(result.notes);
                  setXhsNoteDetail(null);
                  setXhsComments([]);
                  setShowXhsComments(false);
                  showMessage(`成功获取 ${result.notes.length} 条笔记`, 'success');
              } else {
                  showMessage('未获取到笔记', 'warning');
              }
          } else {
              showMessage('获取失败，请检查链接是否正确', 'warning');
          }
      } catch (e: any) {
          setXhsError(e.message || 'Failed to fetch user');
          showMessage('获取失败: ' + e.message, 'error');
      } finally {
          setIsXhsLoadingUser(false);
      }
  };

  // 获取评论
  const handleXhsGetComments = async () => {
      if (!xhsNoteDetail) return;
      setIsXhsLoadingComments(true);
      setXhsError('');
      try {
          const result = await getXHSComments(
              xhsNoteDetail.id,
              xhsNoteDetail.xsec_token || '',  // 使用保存的 xsec_token
              '',
              xhsCommentNum,
              xhsGetSubComments
          );
          if (result.success) {
              setXhsComments(result.comments);
              setShowXhsComments(true);
          } else {
              showMessage('获取评论失败', 'error');
          }
      } catch (e: any) {
          // 检查是否是 Cookie 失效错误
          if (e instanceof CookieExpiredError || e.name === 'CookieExpiredError' || e.message?.includes('Cookie')) {
              setXhsError('Cookie已失效');
              showMessage('Cookie已失效，请点击"设置Cookie"重新配置', 'warning');
              setShowXhsCookieModal(true);  // 自动打开 Cookie 设置弹窗
          } else {
              setXhsError(e.message || 'Failed to get comments');
              showMessage('获取评论失败: ' + e.message, 'error');
          }
      } finally {
          setIsXhsLoadingComments(false);
      }
  };

  // 生成词云图
  const handleXhsGenerateWordCloud = async () => {
      if (xhsComments.length === 0) {
          showMessage('请先获取评论', 'warning');
          return;
      }
      setIsXhsGeneratingWordCloud(true);
      try {
          const commentTexts = xhsComments.map(c => c.content);
          // 也包含二级评论
          xhsComments.forEach(c => {
              if (c.sub_comments) {
                  commentTexts.push(...c.sub_comments.map(sc => sc.content));
              }
          });
          
          const result = await generateWordCloud(commentTexts);
          if (result.success) {
              setXhsWordCloud(result.image);
          } else {
              showMessage('生成词云图失败', 'error');
          }
      } catch (e: any) {
          showMessage('生成词云图失败: ' + e.message, 'error');
      } finally {
          setIsXhsGeneratingWordCloud(false);
      }
  };

  // 批量保存相关函数
  const toggleNoteSelection = (noteId: string) => {
      setSelectedNoteIds(prev => {
          const newSet = new Set(prev);
          if (newSet.has(noteId)) {
              newSet.delete(noteId);
          } else {
              newSet.add(noteId);
          }
          return newSet;
      });
  };

  const toggleBatchMode = () => {
      setIsBatchMode(!isBatchMode);
      if (isBatchMode) {
          // 退出批量模式时清空选择
          setSelectedNoteIds(new Set());
      }
  };

  const toggleSelectAll = () => {
      if (selectedNoteIds.size === xhsSearchResults.length && selectedNoteIds.size > 0) {
          setSelectedNoteIds(new Set());
      } else {
          setSelectedNoteIds(new Set(xhsSearchResults.map(note => note.id)));
      }
  };

  const handleBatchSave = async () => {
      if (selectedNoteIds.size === 0) {
          showMessage('请先选择要保存的笔记', 'warning');
          return;
      }

      if (!experiment?.id) {
          showMessage('请先选择一个实验，才能添加内容到个人库', 'warning');
          return;
      }

      setIsBatchSaving(true);
      setBatchSaveProgress({ current: 0, total: selectedNoteIds.size });

      const selectedNotes = xhsSearchResults.filter(note => selectedNoteIds.has(note.id));
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < selectedNotes.length; i++) {
          const note = selectedNotes[i];
          try {
              // 获取笔记详情
              const detailResult = await getXHSNoteDetail(note.id, note.xsec_token);
              if (!detailResult.success || !detailResult.note) {
                  failCount++;
                  setBatchSaveProgress({ current: i + 1, total: selectedNoteIds.size });
                  continue;
              }

              const noteDetail = detailResult.note;

              // 下载图片
              const downloadedImages: string[] = [];
              const images = noteDetail.images || [];
              for (const imgUrl of images) {
                  try {
                      const downloadRes = await fetch('/api/image-download', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ url: imgUrl })
                      });
                      if (downloadRes.ok) {
                          const data = await downloadRes.json();
                          downloadedImages.push(data.url);  // 修复：使用正确的字段名 url
                      }
                  } catch (e) {
                      console.error('Image download failed:', e);
                  }
              }

              // 构建文章数据
              const tagList = noteDetail.tag_list || [];
              const rawDesc = noteDetail.desc || '';
              // 处理 desc：删除话题标签 #xxx[话题]#
              const processedDesc = tagList.length > 0
                  ? rawDesc.replace(/#[^#\n]+\[话题\]#/g, '').trim()
                  : rawDesc;

              const newArticle = {
                  id: noteDetail.id,
                  xsec_token: note.xsec_token || '',
                  title: noteDetail.title,
                  desc: processedDesc,
                  type: noteDetail.type,
                  user_id: noteDetail.user.user_id,
                  user_nickname: noteDetail.user.nickname,
                  user_avatar: noteDetail.user.avatar,
                  cover: downloadedImages[0] || '',
                  images: downloadedImages,
                  video_url: noteDetail.video_url || '',
                  liked_count: noteDetail.liked_count,
                  collected_count: noteDetail.collected_count,
                  comment_count: noteDetail.comment_count,
                  share_count: noteDetail.share_count,
                  time: noteDetail.time || 0,
                  tag_list: tagList,
                  created_at: Date.now(),
                  updated_at: Date.now(),
                  // 库信息（手动批量添加到个人库）
                  library_type: 'personal',
                  owner_id: user.id,
                  experiment_id: experiment?.id
              };

              await db.saveArticle(newArticle);
              successCount++;
          } catch (e: any) {
              console.error(`Save note ${note.id} failed:`, e);
              failCount++;
          }

          setBatchSaveProgress({ current: i + 1, total: selectedNoteIds.size });
      }

      setIsBatchSaving(false);
      setSelectedNoteIds(new Set());
      setIsBatchMode(false);  // 保存完成后退出批量模式
      await loadData();

      if (failCount === 0) {
          showMessage(`批量保存完成！成功保存 ${successCount} 条笔记`, 'success');
      } else {
          showMessage(`批量保存完成！成功 ${successCount} 条，失败 ${failCount} 条`, 'warning');
      }
  };


  const displayArticles = libraryTab === 'personal' ? personalArticles : communityArticles;

  // Render helpers (ArticlePreviewModal, StartConfirmationModal, renderArticleCard, renderTableRow) same as before...
  // Omitted for brevity, but logically identical, ensuring async functions are awaited where called.
  // ...
  
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 shrink-0">
        <h1 className="text-2xl font-bold text-slate-800">内容后台</h1>
        <div className="flex bg-slate-200 p-1 rounded-lg overflow-x-auto max-w-full w-full md:w-auto">
            <button onClick={() => setActiveTab('library')} className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${activeTab === 'library' ? 'bg-white shadow text-indigo-700' : 'text-slate-600'}`}>内容库 ({personalArticles.length + communityArticles.length})</button>
            <button onClick={() => setActiveTab('xhs')} className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap flex items-center gap-1 ${activeTab === 'xhs' ? 'bg-white shadow text-red-600' : 'text-slate-600'}`}>📕 小红书</button>
            <button onClick={() => setActiveTab('jina')} className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap flex items-center gap-1 ${activeTab === 'jina' ? 'bg-white shadow text-pink-700' : 'text-slate-600'}`}>🌏 Jina</button>
        </div>
      </div>

      {/* Library Sub-tabs */}
      {activeTab === 'library' && (
        <>
          <div className="flex bg-slate-100 p-1 rounded-lg mb-4 shrink-0">
            <button
              onClick={() => setLibraryTab('personal')}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium ${libraryTab === 'personal' ? 'bg-white shadow text-indigo-700' : 'text-slate-600'}`}
            >
              我的个人库 ({personalArticles.length})
            </button>
            <button
              onClick={() => setLibraryTab('community')}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium ${libraryTab === 'community' ? 'bg-white shadow text-green-700' : 'text-slate-600'}`}
            >
              社区库 ({communityArticles.length})
            </button>
          </div>

          {/* Library Info Banner */}
          {libraryTab === 'personal' && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 flex-1">
                  <span className="text-indigo-600 text-sm">💡</span>
                  <div className="text-sm text-indigo-800">
                    <div className="mb-1">
                      <strong>个人库说明：</strong>每个实验拥有独立的个人库，创建时为空，需手动添加内容。
                    </div>
                    {experiment ? (
                      <div className="text-xs text-indigo-700 mt-1">
                        当前实验：<strong>{experiment.name}</strong> ({experiment.mode === 'solo' ? 'Solo 模式' : 'Community 模式'}) | 个人库内容：<strong>{personalArticles.length}</strong> 篇
                      </div>
                    ) : (
                      <div className="text-xs text-orange-700 mt-1 font-medium">
                        ⚠️ 请先创建或选择一个实验，才能查看和管理个人库
                      </div>
                    )}
                  </div>
                </div>
                {experiment && personalArticles.length > 0 && (
                  <button
                    onClick={handleClearPersonalLibrary}
                    className="px-3 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors whitespace-nowrap"
                  >
                    清空个人库
                  </button>
                )}
              </div>
            </div>
          )}

          {libraryTab === 'community' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 shrink-0">
              <div className="flex items-start gap-2">
                <span className="text-green-600 text-sm">🌍</span>
                <div className="text-sm text-green-800">
                  <strong>社区库说明：</strong>社区库是只读的，内容由所有用户在实验中检索的小红书内容自动填充。每条内容都会显示贡献者信息。
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'xhs' && (
          <div className="flex-1 overflow-hidden flex flex-col h-full">
              {/* 顶部工具栏 */}
              <div className="bg-white border-b border-slate-200 p-4 shrink-0">
                  <div className="flex items-center justify-between gap-4 mb-3">
                      <div className="flex items-center gap-3">
                          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                      <span>📕</span> 小红书爬虫
                          </h3>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                          xhsStatus === 'ready' ? 'bg-green-100 text-green-700' :
                          xhsStatus === 'error' ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-600'
                      }`}>
                          {xhsStatus === 'ready' ? '✓ 服务就绪' : xhsStatus === 'error' ? '✗ 服务不可用' : '○ 检查中...'}
                      </span>
                      </div>
                      <div className="flex items-center gap-2">
                      <button 
                              onClick={() => setShowXhsCookieModal(true)}
                              className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600"
                              title="配置 Cookie"
                          >
                              ⚙️ 配置
                      </button>
                  </div>
              </div>

                  {/* 模式切换 */}
                  <div className="flex gap-2 mb-3">
                      <button
                          onClick={() => setXhsMode('search')}
                          className={`px-4 py-2 text-sm rounded-lg font-medium ${
                              xhsMode === 'search' 
                                  ? 'bg-red-500 text-white' 
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                      >
                          🔍 关键词搜索
                      </button>
                      <button
                          onClick={() => setXhsMode('byIds')}
                          className={`px-4 py-2 text-sm rounded-lg font-medium ${
                              xhsMode === 'byIds' 
                                  ? 'bg-red-500 text-white' 
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                      >
                          📝 按笔记ID
                      </button>
                      <button
                          onClick={() => setXhsMode('byUser')}
                          className={`px-4 py-2 text-sm rounded-lg font-medium ${
                              xhsMode === 'byUser' 
                                  ? 'bg-red-500 text-white' 
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                      >
                          👤 按作者主页
                      </button>
                  </div>

                  {/* 搜索模式 */}
                  {xhsMode === 'search' && (
                      <div className="flex items-center gap-2">
                          <input 
                              className="flex-1 bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm" 
                              placeholder="搜索关键词，例如：美食攻略" 
                              value={xhsSearchQuery} 
                              onChange={e => setXhsSearchQuery(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleXhsSearch()}
                          />
                          <select
                              className="bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm"
                              value={xhsSort}
                              onChange={e => setXhsSort(e.target.value as any)}
                          >
                              <option value="general">综合</option>
                              <option value="popular">最热</option>
                              <option value="latest">最新</option>
                          </select>
                          <button 
                              onClick={() => handleXhsSearch(false)} 
                              disabled={isXhsSearching || !xhsSearchQuery.trim() || xhsStatus !== 'ready'} 
                              className="px-6 bg-red-500 text-white font-bold rounded-lg shadow-sm disabled:opacity-50 hover:bg-red-600"
                          >
                              {isXhsSearching ? '搜索中...' : '搜索'}
                          </button>
                      </div>
                  )}

                  {/* 按ID模式 */}
                  {xhsMode === 'byIds' && (
                      <div className="flex items-center gap-2">
                          <textarea
                              className="flex-1 bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm h-20 font-mono"
                              placeholder="输入笔记链接或ID，多个用换行或逗号分隔&#10;例如：&#10;https://www.xiaohongshu.com/explore/xxxxx&#10;674c5e32000000001e019dd1"
                              value={xhsNoteIds}
                              onChange={e => setXhsNoteIds(e.target.value)}
                          />
                          <button 
                              onClick={handleXhsFetchByIds}
                              disabled={isXhsLoadingByIds || !xhsNoteIds.trim() || xhsStatus !== 'ready'} 
                              className="px-6 bg-red-500 text-white font-bold rounded-lg shadow-sm disabled:opacity-50 hover:bg-red-600"
                          >
                              {isXhsLoadingByIds ? '获取中...' : '获取笔记'}
                          </button>
                      </div>
                  )}

                  {/* 按作者模式 */}
                  {xhsMode === 'byUser' && (
                      <div className="flex items-center gap-2">
                          <input
                              className="flex-1 bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm"
                              placeholder="输入用户主页链接，如 https://www.xiaohongshu.com/user/profile/xxxxx"
                              value={xhsUserId}
                              onChange={e => setXhsUserId(e.target.value)}
                          />
                          <button 
                              onClick={handleXhsFetchByUser}
                              disabled={isXhsLoadingUser || !xhsUserId.trim() || xhsStatus !== 'ready'} 
                              className="px-6 bg-red-500 text-white font-bold rounded-lg shadow-sm disabled:opacity-50 hover:bg-red-600"
                          >
                              {isXhsLoadingUser ? '获取中...' : '获取笔记'}
                          </button>
                      </div>
                  )}

                  {xhsError && (
                      <div className="mt-2 bg-red-50 text-red-700 p-2 rounded text-sm">{xhsError}</div>
                  )}
              </div>

              {/* 左右布局主体 */}
              <div className="flex-1 flex overflow-hidden">
                  {/* 左侧：搜索结果列表 */}
                  <div className="w-80 border-r border-slate-200 overflow-y-auto bg-slate-50">
                      {xhsUserInfo && xhsMode === 'byUser' && (
                          <div className="p-4 bg-white border-b border-slate-200">
                              <div className="flex items-center gap-3 mb-2">
                                  {xhsUserInfo.avatar && (
                                      <img 
                                          src={`/api/image-proxy?url=${encodeURIComponent(xhsUserInfo.avatar)}`}
                                          alt={xhsUserInfo.nickname}
                                          className="w-12 h-12 rounded-full"
                                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                      />
                                  )}
                                  <div>
                                      <div className="font-bold text-slate-800">{xhsUserInfo.nickname}</div>
                                      <div className="text-xs text-slate-500">{xhsUserInfo.desc || '无简介'}</div>
                                  </div>
                              </div>
                              <div className="flex gap-4 text-xs text-slate-600">
                                  <span>粉丝: {xhsUserInfo.followers}</span>
                                  <span>关注: {xhsUserInfo.followed}</span>
                                  <span>笔记: {xhsUserInfo.notes_count}</span>
                              </div>
                          </div>
                      )}
                      {xhsSearchResults.length > 0 ? (
                          <div className="p-4 space-y-3">
                              {/* 批量操作工具栏 */}
                              <div className="bg-white border border-slate-200 rounded-lg p-3 mb-3 shadow-sm">
                                  {!isBatchMode ? (
                                      // 非批量模式：显示批量选择按钮
                                      <div className="flex items-center justify-between">
                                          <span className="text-sm text-slate-500">
                                              找到 {xhsSearchResults.length} 条结果
                                          </span>
                                          <button
                                              onClick={toggleBatchMode}
                                              className="px-3 py-1.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
                                          >
                                              批量选择
                                          </button>
                                      </div>
                                  ) : (
                                      // 批量模式：显示全选和操作按钮
                                      <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-3">
                                              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                                                  <input
                                                      type="checkbox"
                                                      checked={selectedNoteIds.size === xhsSearchResults.length && xhsSearchResults.length > 0}
                                                      onChange={toggleSelectAll}
                                                      className="w-4 h-4 rounded border-slate-300"
                                                  />
                                                  {selectedNoteIds.size === xhsSearchResults.length && xhsSearchResults.length > 0 ? '取消全选' : '全选'}
                                              </label>
                                              <span className="text-sm text-slate-500">
                                                  {selectedNoteIds.size > 0 ? `已选 ${selectedNoteIds.size} 条` : `共 ${xhsSearchResults.length} 条`}
                                              </span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                              <button
                                                  onClick={toggleBatchMode}
                                                  className="px-3 py-1.5 text-slate-600 text-sm hover:text-slate-800 transition-colors"
                                              >
                                                  取消
                                              </button>
                                              {selectedNoteIds.size > 0 && (
                                                  <button
                                                      onClick={handleBatchSave}
                                                      disabled={isBatchSaving}
                                                      className="px-4 py-1.5 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                  >
                                                      {isBatchSaving
                                                          ? `保存中 ${batchSaveProgress.current}/${batchSaveProgress.total}`
                                                          : `批量保存 (${selectedNoteIds.size})`}
                                                  </button>
                                              )}
                                          </div>
                                      </div>
                                  )}
                              </div>
                              {xhsSearchResults.map((note, idx) => {
                                  // 安全检查，防止崩溃
                                  if (!note || !note.id) return null;
                                  const title = note.title || (note.desc ? note.desc.substring(0, 50) : '无标题');
                                  const userNickname = note.user?.nickname || '未知用户';
                                  const likedCount = formatLikedCount(note.liked_count || '0');
                                  
                                  return (
                                      <div
                                          key={`${note.id}-${idx}`}
                                          className={`bg-white rounded-lg border-2 overflow-hidden transition-all relative ${
                                              xhsNoteDetail?.id === note.id
                                                  ? 'border-red-500 shadow-md'
                                                  : 'border-slate-200 hover:border-red-300'
                                          }`}
                                      >
                                          {/* 复选框 - 仅在批量模式下显示 */}
                                          {isBatchMode && (
                                              <div className="absolute top-2 right-2 z-10">
                                                  <div className="bg-white rounded-full p-1 shadow-md">
                                                      <input
                                                          type="checkbox"
                                                          checked={selectedNoteIds.has(note.id)}
                                                          onChange={(e) => {
                                                              e.stopPropagation();
                                                              toggleNoteSelection(note.id);
                                                          }}
                                                          className="w-4 h-4 rounded cursor-pointer"
                                                          onClick={(e) => e.stopPropagation()}
                                                      />
                                                  </div>
                                              </div>
                                          )}
                                          <div
                                              onClick={() => {
                                                  if (isBatchMode) {
                                                      toggleNoteSelection(note.id);
                                                  } else {
                                                      handleXhsGetDetail(note);
                                                  }
                                              }}
                                              className="cursor-pointer"
                                          >
                                              {note.cover && (
                                                  <img
                                                      src={`/api/image-proxy?url=${encodeURIComponent(note.cover)}`}
                                                      alt={title}
                                                      className="w-full h-40 object-cover"
                                                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                  />
                                              )}
                                              <div className="p-3">
                                                  <div className="font-medium text-slate-800 text-sm line-clamp-2 mb-2">
                                                      {title}
                                                  </div>
                                                  <div className="flex items-center justify-between text-xs">
                                                      <span className="text-slate-500">{userNickname}</span>
                                                      <span className="text-red-500">❤ {likedCount}</span>
                                                  </div>
                                              </div>
                                          </div>
                                      </div>
                                  );
                              })}
                              {xhsHasMore && (
                                  <button 
                                      onClick={() => handleXhsSearch(true)}
                                      disabled={isXhsLoadingMore}
                                      className="w-full py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50"
                                  >
                                      {isXhsLoadingMore ? '加载中...' : '加载更多'}
                                  </button>
                              )}
                          </div>
                      ) : (
                          <div className="p-8 text-center text-slate-400">
                              <div className="text-4xl mb-2">🔍</div>
                              <div>输入关键词搜索小红书笔记</div>
                          </div>
                      )}
              </div>

                  {/* 右侧：内容详情 */}
                  <div className="flex-1 overflow-hidden bg-white flex flex-col">
                      {isXhsLoadingDetail ? (
                          <div className="h-full flex items-center justify-center">
                              <div className="text-center">
                                  <div className="animate-pulse text-slate-500 text-lg mb-2">加载中...</div>
                                  <div className="text-sm text-slate-400">正在获取笔记详情</div>
                              </div>
                          </div>
                      ) : xhsNoteDetail ? (
                          <>
                              {/* 图片放大预览 */}
                              {xhsLightboxImage && (
                                  <div
                                      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
                                      onClick={() => setXhsLightboxImage(null)}
                                  >
                                      <button
                                          className="absolute top-4 right-4 text-white text-3xl font-bold hover:text-gray-300"
                                          onClick={() => setXhsLightboxImage(null)}
                                      >
                                          ×
                                      </button>
                                      <img
                                          src={`/api/image-proxy?url=${encodeURIComponent(xhsLightboxImage)}`}
                                          alt="预览"
                                          className="max-w-full max-h-full object-contain"
                                          onClick={(e) => e.stopPropagation()}
                                      />
                                  </div>
                              )}

                              {/* 内容区域 */}
                              <div className="flex-1 overflow-y-auto p-6">
                                  {/* 关闭按钮 */}
                                  <div className="mb-4 flex items-center justify-between">
                                      <h2 className="text-xl font-bold text-slate-800 leading-tight">{xhsNoteDetail.title || '无标题'}</h2>
                                      <button
                                          onClick={() => setXhsNoteDetail(null)}
                                          className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                                      >
                                          ✕ 关闭
                                      </button>
                                  </div>

                                  {/* 作者信息（紧凑） */}
                                  <div className="flex items-center gap-2 mb-3 text-sm">
                                      {xhsNoteDetail.user.avatar ? (
                                          <img
                                              src={`/api/image-proxy?url=${encodeURIComponent(xhsNoteDetail.user.avatar)}`}
                                              alt={xhsNoteDetail.user.nickname}
                                              className="w-6 h-6 rounded-full object-cover"
                                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                          />
                                      ) : (
                                          <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xs font-bold">
                                              {(xhsNoteDetail.user.nickname || '?')[0]}
                                          </div>
                                      )}
                                      <span className="text-gray-600">{xhsNoteDetail.user.nickname || '未知用户'}</span>
                                      <div className="ml-auto flex gap-3 text-xs text-slate-500">
                                          <span>❤ {xhsNoteDetail.liked_count}</span>
                                          <span>⭐ {xhsNoteDetail.collected_count}</span>
                                          <span>💬 {xhsNoteDetail.comment_count}</span>
                                      </div>
                                  </div>

                                  {/* 图片平铺展示 */}
                                  {(xhsNoteDetail.images?.length ?? 0) > 0 && (() => {
                                      const images = xhsNoteDetail.images || [];

                                      return (
                                          <div className="grid grid-cols-4 gap-2 mb-4">
                                              {images.map((img, idx) => (
                                                  <div key={idx} className="relative overflow-hidden bg-gray-100 rounded-lg" style={{ aspectRatio: '1/1' }}>
                                                      <img
                                                          src={`/api/image-proxy?url=${encodeURIComponent(img)}`}
                                                          alt={`图片 ${idx + 1}`}
                                                          className="w-full h-full object-cover hover:opacity-90 transition-opacity cursor-pointer"
                                                          onClick={() => setXhsLightboxImage(img)}
                                                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                      />
                                                  </div>
                                              ))}
                                          </div>
                                      );
                                  })()}

                                  {/* 描述内容 */}
                                  {xhsNoteDetail.desc && (
                                      <div className="mb-3 text-slate-700 whitespace-pre-wrap leading-relaxed text-sm">
                                          {xhsNoteDetail.tag_list && xhsNoteDetail.tag_list.length > 0
                                              ? xhsNoteDetail.desc.replace(/#[^#\n]+\[话题\]#/g, '').trim()
                                              : xhsNoteDetail.desc}
                                      </div>
                                  )}

                                  {/* 话题标签 */}
                                  {xhsNoteDetail.tag_list && xhsNoteDetail.tag_list.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5 mb-4">
                                          {xhsNoteDetail.tag_list.map((tag, idx) => (
                                              <span key={idx} className="px-2 py-0.5 bg-red-50 text-red-600 text-xs rounded-full">#{tag}</span>
                                          ))}
                                      </div>
                                  )}

                              {/* 评论和词云图功能区 */}
                              <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                                  <div className="flex items-center justify-between mb-4">
                                      <h3 className="text-lg font-bold text-slate-800">💬 评论</h3>
                                      <div className="flex items-center gap-2">
                                          <input
                                              type="number"
                                              min="1"
                                              max="50"
                                              value={xhsCommentNum}
                                              onChange={e => setXhsCommentNum(parseInt(e.target.value) || 10)}
                                              className="w-20 px-2 py-1 text-sm border border-slate-300 rounded"
                                              placeholder="数量"
                                          />
                                          <span className="text-sm text-slate-600">条</span>
                                          <label className="flex items-center gap-1 text-sm text-slate-600">
                                              <input
                                                  type="checkbox"
                                                  checked={xhsGetSubComments}
                                                  onChange={e => setXhsGetSubComments(e.target.checked)}
                                              />
                                              二级评论
                                          </label>
                                          <button
                                              onClick={handleXhsGetComments}
                                              disabled={isXhsLoadingComments || xhsStatus !== 'ready'}
                                              className="px-4 py-1 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50"
                                          >
                                              {isXhsLoadingComments ? '加载中...' : '获取评论'}
                                          </button>
                          </div>
                                  </div>

                                  {showXhsComments && xhsComments.length > 0 && (
                                      <div className="space-y-4 max-h-96 overflow-y-auto">
                                          {xhsComments.map((comment) => (
                                              <div key={comment.id} className="bg-white p-3 rounded-lg border border-slate-200">
                                                  <div className="flex items-start gap-2 mb-2">
                                                      {comment.user.avatar && (
                                                          <img 
                                                              src={`/api/image-proxy?url=${encodeURIComponent(comment.user.avatar)}`}
                                                              alt={comment.user.nickname}
                                                              className="w-8 h-8 rounded-full"
                                                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                          />
                                                      )}
                                                      <div className="flex-1">
                                                          <div className="font-medium text-sm text-slate-800">{comment.user.nickname}</div>
                                                          <div className="text-slate-700 text-sm mt-1">{comment.content}</div>
                                                          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                                                              <span>❤ {comment.like_count}</span>
                                                              <span>{new Date(comment.create_time * 1000).toLocaleString()}</span>
                                                          </div>
                                                      </div>
                                                  </div>
                                                  
                                                  {/* 二级评论 */}
                                                  {comment.sub_comments && comment.sub_comments.length > 0 && (
                                                      <div className="ml-10 mt-2 space-y-2 border-l-2 border-slate-200 pl-3">
                                                          {comment.sub_comments.map((sub) => (
                                                              <div key={sub.id} className="bg-slate-50 p-2 rounded">
                                                                  <div className="flex items-center gap-2">
                                                                      <span className="font-medium text-xs text-slate-700">{sub.user.nickname}</span>
                                                                      {sub.reply_to_user && (
                                                                          <span className="text-xs text-slate-500">回复 @{sub.reply_to_user}</span>
                                                                      )}
                                                                  </div>
                                                                  <div className="text-sm text-slate-600 mt-1">{sub.content}</div>
                                                                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                                                                      <span>❤ {sub.like_count}</span>
                                                                      <span>{new Date(sub.create_time * 1000).toLocaleString()}</span>
                                                                  </div>
                                                              </div>
                                                          ))}
                                                      </div>
                                                  )}
                                              </div>
                                          ))}
                                      </div>
                                  )}

                                  {showXhsComments && xhsComments.length > 0 && (
                                      <div className="mt-4 pt-4 border-t border-slate-200">
                                          <button
                                              onClick={handleXhsGenerateWordCloud}
                                              disabled={isXhsGeneratingWordCloud}
                                              className="px-4 py-2 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-600 disabled:opacity-50"
                                          >
                                              {isXhsGeneratingWordCloud ? '生成中...' : '📊 生成词云图'}
                                          </button>
                                      </div>
                                  )}

                                  {xhsWordCloud && (
                                      <div className="mt-4 pt-4 border-t border-slate-200">
                                          <h4 className="text-sm font-bold text-slate-800 mb-2">词云图</h4>
                                          <img 
                                              src={xhsWordCloud} 
                                              alt="词云图" 
                                              className="w-full rounded-lg border border-slate-200"
                                          />
                                          <button
                                              onClick={() => setXhsWordCloud(null)}
                                              className="mt-2 text-xs text-slate-500 hover:text-slate-700"
                                          >
                                              关闭
                                          </button>
                                      </div>
                                  )}
                              </div>

                              <div className="sticky bottom-0 bg-white pt-4 border-t border-slate-200">
                          <button
                              onClick={handleSaveXhsNote}
                              disabled={isSavingXhsNote}
                                      className="w-full bg-red-500 text-white font-bold py-3 rounded-lg shadow-sm disabled:opacity-50 hover:bg-red-600 transition-colors"
                          >
                              {isSavingXhsNote ? '保存中...' : '💾 保存到内容库'}
                          </button>
                              </div>
                          </div>
                      </>
                      ) : (
                          <div className="h-full flex items-center justify-center">
                              <div className="text-center text-slate-400">
                                  <div className="text-4xl mb-2">📝</div>
                                  <div>点击左侧笔记查看详情</div>
                              </div>
                          </div>
                      )}
                  </div>
              </div>

              {/* Cookie 配置弹窗 */}
              {showXhsCookieModal && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowXhsCookieModal(false)}>
                      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                          <div className="p-6 border-b border-slate-200">
                              <div className="flex items-center justify-between">
                                  <h3 className="text-lg font-bold text-slate-800">配置小红书 Cookie</h3>
                                  <button 
                                      onClick={() => setShowXhsCookieModal(false)}
                                      className="text-slate-400 hover:text-slate-600"
                                  >
                                      ✕
                                  </button>
                              </div>
                          </div>
                          <div className="p-6 space-y-4">
                              <div>
                                  <label className="block text-sm font-medium text-slate-700 mb-2">小红书 Cookie</label>
                                  <textarea 
                                      className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 font-mono text-xs h-32" 
                                      placeholder="从浏览器复制小红书的 Cookie，包含 a1 等字段" 
                                      value={xhsCookies} 
                                      onChange={e => setXhsCookies(e.target.value)}
                                  />
                                  <p className="text-xs text-slate-500 mt-2">
                                      提示：在浏览器登录小红书后，打开开发者工具 → 网络 → 复制请求头中的 Cookie
                                  </p>
                              </div>
                              {xhsError && (
                                  <div className="bg-red-50 text-red-700 p-3 rounded text-sm">{xhsError}</div>
                              )}
                              <div className="flex gap-3">
                                  <button 
                                      onClick={() => setShowXhsCookieModal(false)}
                                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
                                  >
                                      取消
                                  </button>
                                  <button 
                                      onClick={async () => {
                                          await handleXhsSetCookies();
                                          setShowXhsCookieModal(false);
                                      }}
                                      disabled={!xhsCookies.trim() || xhsStatus !== 'ready'}
                                      className="flex-1 px-4 py-2 bg-red-500 text-white font-bold rounded-lg shadow-sm disabled:opacity-50 hover:bg-red-600"
                                  >
                                      保存配置
                                  </button>
                              </div>
                          </div>
                      </div>
                  </div>
              )}
          </div>
      )}

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


      {activeTab !== 'jina' && activeTab !== 'xhs' && (
          <div className="flex-1 flex overflow-hidden">
              {/* 左侧：文章列表 */}
              <div className="w-80 border-r border-slate-200 overflow-y-auto bg-slate-50">
                  <div className="p-4 space-y-3">
                      {displayArticles.map(a => (
                          <div
                              key={a.id}
                              onClick={() => setSelectedArticle(a)}
                              className={`bg-white rounded-lg border-2 overflow-hidden transition-all cursor-pointer ${
                                  selectedArticle?.id === a.id
                                      ? 'border-red-500 shadow-md'
                                      : 'border-slate-200 hover:border-red-300'
                              }`}
                          >
                              {/* 封面图 */}
                              {a.imageUrl && (
                                  <img
                                      src={a.imageUrl}
                                      alt={a.title}
                                      className="w-full h-40 object-cover"
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                              )}

                              {/* 内容区 */}
                              <div className="p-3">
                                  {/* 标题 */}
                                  <div className="font-medium text-slate-800 text-sm line-clamp-2 mb-2">{a.title}</div>

                                  {/* 作者和统计 */}
                                  <div className="flex items-center justify-between text-xs">
                                      <span className="text-slate-500 truncate">{a.author?.name || '未知作者'}</span>
                                      {a.metrics && (
                                          <span className="text-red-500">❤ {formatLikedCount(a.metrics.likes?.toString() || '0')}</span>
                                      )}
                                  </div>

                                  {/* 社区库显示贡献者 */}
                                  {activeTab === 'library' && libraryTab === 'community' && a.owner_id && (
                                      <div className="mt-2 pt-2 border-t border-slate-100">
                                          <span className="text-xs text-green-600">
                                              🌍 贡献者: {a.owner_id === 'default' ? '系统' : a.owner_id}
                                          </span>
                                      </div>
                                  )}
                              </div>
                          </div>
                      ))}

                      {displayArticles.length === 0 && (
                          <div className="text-center py-20 text-slate-400">
                              暂无内容
                          </div>
                      )}
                  </div>
              </div>

              {/* 右侧：文章详情 */}
              <div className="flex-1 overflow-hidden bg-white flex flex-col">
                  {selectedArticle ? (
                      <>
                          {/* 图片放大预览 */}
                          {libraryLightboxImage && (
                              <div
                                  className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
                                  onClick={() => setLibraryLightboxImage(null)}
                              >
                                  <button
                                      className="absolute top-4 right-4 text-white text-3xl font-bold hover:text-gray-300"
                                      onClick={() => setLibraryLightboxImage(null)}
                                  >
                                      ×
                                  </button>
                                  <img
                                      src={libraryLightboxImage.startsWith('/') ? libraryLightboxImage : `/api/image-proxy?url=${encodeURIComponent(libraryLightboxImage)}`}
                                      alt="预览"
                                      className="max-w-full max-h-full object-contain"
                                      onClick={(e) => e.stopPropagation()}
                                  />
                              </div>
                          )}

                          {/* 内容区域 */}
                          <div className="flex-1 overflow-y-auto p-6">

                              {/* 标题 */}
                              <h1 className="text-xl font-bold text-slate-900 mb-2 leading-tight">{selectedArticle.title}</h1>

                              {/* 作者信息（紧凑） */}
                              {selectedArticle.author && (
                                  <div className="flex items-center gap-2 mb-3 text-sm">
                                      {selectedArticle.author.avatar ? (
                                          <img
                                              src={selectedArticle.author.avatar.startsWith('/') ? selectedArticle.author.avatar : `/api/image-proxy?url=${encodeURIComponent(selectedArticle.author.avatar)}`}
                                              alt={selectedArticle.author.name}
                                              className="w-6 h-6 rounded-full object-cover"
                                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                          />
                                      ) : (
                                          <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xs font-bold">
                                              {(selectedArticle.author.name || '?')[0]}
                                          </div>
                                      )}
                                      <span className="text-gray-600">{selectedArticle.author.name}</span>
                                      {selectedArticle.publish_time && (
                                          <span className="text-gray-400 text-xs">
                                              · {new Date(selectedArticle.publish_time).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                                          </span>
                                      )}
                                      {selectedArticle.metrics && (
                                          <div className="ml-auto flex gap-3 text-xs text-slate-500">
                                              <span>❤ {selectedArticle.metrics.likes}</span>
                                              <span>⭐ {selectedArticle.metrics.favorites || selectedArticle.metrics.collects}</span>
                                              <span>💬 {selectedArticle.metrics.comments}</span>
                                          </div>
                                      )}
                                  </div>
                              )}

                              {/* 图片平铺展示 */}
                              {(() => {
                                  // 构建媒体列表
                                  const mediaList: ContentMedia[] = [];
                                  if (selectedArticle.media && Array.isArray(selectedArticle.media) && selectedArticle.media.length > 0) {
                                      mediaList.push(...selectedArticle.media);
                                  } else if (selectedArticle.images && Array.isArray(selectedArticle.images) && selectedArticle.images.length > 0) {
                                      mediaList.push(...selectedArticle.images.map((url, idx) => ({
                                          type: 'image' as const,
                                          url_local: url,
                                          order: idx
                                      })));
                                  } else if (selectedArticle.imageUrl) {
                                      mediaList.push({
                                          type: 'image',
                                          url_local: selectedArticle.imageUrl,
                                          order: 0
                                      });
                                  }

                                  if (mediaList.length === 0) return null;

                                  return (
                                      <div className="grid grid-cols-4 gap-2 mb-4">
                                          {mediaList.map((item, index) => (
                                              <div key={index} className="relative overflow-hidden bg-gray-100 rounded-lg" style={{ aspectRatio: '1/1' }}>
                                                  {item.type === 'image' ? (
                                                      <img
                                                          src={item.url_local.startsWith('/') ? item.url_local : `/api/image-proxy?url=${encodeURIComponent(item.url_local)}`}
                                                          alt={`图片 ${index + 1}`}
                                                          className="w-full h-full object-cover hover:opacity-90 transition-opacity cursor-pointer"
                                                          onClick={() => setLibraryLightboxImage(item.url_local)}
                                                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                      />
                                                  ) : (
                                                      <video src={item.url_local} className="w-full h-full object-cover" controls />
                                                  )}
                                              </div>
                                          ))}
                                      </div>
                                  );
                              })()}

                              {/* 内容详情：只显示 desc */}
                              {selectedArticle.desc && (
                                  <div className="mb-3 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                                      {selectedArticle.desc}
                                  </div>
                              )}

                              {/* 标签 */}
                              {selectedArticle.tags && selectedArticle.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mb-3">
                                      {selectedArticle.tags.map((tag, idx) => (
                                          <span key={idx} className="px-2 py-0.5 bg-red-50 text-red-600 text-xs rounded-full">#{tag}</span>
                                      ))}
                                  </div>
                              )}

                              {/* 来源信息 */}
                              {selectedArticle.source && (
                                  <div className="pt-3 border-t border-gray-100">
                                      <span className="text-xs text-gray-400">
                                          来源: {selectedArticle.source === 'xhs' ? '小红书' : selectedArticle.source === 'jina' ? '网页导入' : '手动创建'}
                                      </span>
                                  </div>
                              )}
                          </div>
                      </>
                  ) : (
                      <div className="flex items-center justify-center h-full text-slate-400">
                          <div className="text-center">
                              <div className="text-6xl mb-4">📄</div>
                              <div className="text-lg">选择左侧文章查看详情</div>
                          </div>
                      </div>
                  )}
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
                                  </div>
                      </div>

              <div className="flex-1 overflow-y-auto w-full">
                  <div className="max-w-4xl mx-auto p-4 pt-8">
                      <div className="mb-6 flex items-center justify-between">
                          <h2 className="text-2xl font-bold text-slate-800">{previewArticle.title || '无标题'}</h2>
                              <button
                              onClick={() => setPreviewArticle(null)}
                              className="px-3 py-1 text-sm text-slate-500 hover:text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                          >
                              ✕ 关闭
                              </button>
                      </div>
                      
                      {/* 作者信息 */}
                      {previewArticle.author && (
                          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-200">
                              {previewArticle.author.avatar ? (
                                  <img 
                                      src={previewArticle.author.avatar.startsWith('/') ? previewArticle.author.avatar : `/api/image-proxy?url=${encodeURIComponent(previewArticle.author.avatar)}`}
                                      alt={previewArticle.author.name} 
                                      className="w-12 h-12 rounded-full object-cover"
                                                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                      />
                                                  ) : (
                                  <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold text-lg">
                                      {(previewArticle.author.name || '?')[0]}
                                                      </div>
                                                  )}
                                                  <div>
                                  <div className="font-medium text-slate-800">{previewArticle.author.name || '未知用户'}</div>
                                                      <div className="text-xs text-slate-400">作者</div>
                                                  </div>
                              {previewArticle.metrics && (
                                  <div className="ml-auto flex gap-4 text-sm text-slate-500">
                                      <span>❤ {previewArticle.metrics.likes}</span>
                                      <span>⭐ {previewArticle.metrics.favorites}</span>
                                      <span>💬 {previewArticle.metrics.comments}</span>
                                      {previewArticle.metrics.shares && <span>🔗 {previewArticle.metrics.shares}</span>}
                                              </div>
                              )}
                          </div>
                      )}

                      {/* 图片列表 */}
                      {previewArticle.media && previewArticle.media.length > 0 && (
                          <div className="mb-6 grid grid-cols-2 gap-4">
                              {previewArticle.media.map((media, idx) => (
                                  <img 
                                      key={idx}
                                      src={media.url_local.startsWith('/') ? media.url_local : `/api/image-proxy?url=${encodeURIComponent(media.url_local)}`}
                                      alt={`图片 ${idx + 1}`}
                                      className="w-full rounded-lg border border-slate-200"
                                                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                          />
                                                      ))}
                                                  </div>
                                              )}
                                              
                      {/* 内容描述 */}
                      <div className="mb-6 text-slate-700 whitespace-pre-wrap leading-relaxed text-base">
                          {previewArticle.content || previewArticle.summary}
                                                  </div>

                      {/* 标签 */}
                      {previewArticle.tags && previewArticle.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-6">
                              {previewArticle.tags.map((tag, idx) => (
                                  <span key={idx} className="px-3 py-1 bg-red-50 text-red-600 text-sm rounded-full">#{tag}</span>
                                      ))}
                                  </div>
                              )}
                              
                      <div className="h-12 flex items-center justify-center text-slate-300 text-xs">
                          Article ID: {previewArticle.id} | Source: {previewArticle.source}
                                                  </div>
                                          </div>
                                  </div>
                  </div>
              )}

      {/* 消息弹窗 */}
      {messageModal.show && (
          <MessageModal
              message={messageModal.message}
              type={messageModal.type}
              onClose={() => setMessageModal({ show: false, message: '', type: 'info' })}
          />
      )}

      {/* 确认弹窗 */}
      {confirmModal.show && confirmModal.onConfirm && (
          <ConfirmModal
              message={confirmModal.message}
              title={confirmModal.title || '确认操作'}
              onConfirm={() => {
                  if (confirmModal.onConfirm) {
                      confirmModal.onConfirm();
                  }
              }}
              onCancel={() => setConfirmModal({ show: false, message: '', title: '' })}
          />
      )}
    </div>
  );
};