export interface XHSNote {
  id: string;
  xsec_token: string;
  title: string;
  desc: string;
  type: string;
  user: {
    user_id: string;
    nickname: string;
    avatar: string;
  };
  cover: string;
  liked_count: string;
}

export interface XHSNoteDetail {
  id: string;
  xsec_token?: string;
  title: string;
  desc: string;
  type: string;
  user: {
    user_id: string;
    nickname: string;
    avatar: string;
  };
  images: string[];
  video_url: string;
  liked_count: string;
  collected_count: string;
  comment_count: string;
  share_count: string;
  time: number;
  tag_list: string[];
}

export interface XHSComment {
  id: string;
  content: string;
  user: {
    user_id: string;
    nickname: string;
    avatar: string;
  };
  like_count: number;
  create_time: number;
  sub_comment_count: number;
  sub_comments?: XHSSubComment[];  // 二级评论
}

export interface XHSSubComment {
  id: string;
  content: string;
  user: {
    user_id: string;
    nickname: string;
    avatar: string;
  };
  like_count: number;
  create_time: number;
  reply_to_user?: string;  // 回复的用户名
}

export interface XHSUser {
  user_id: string;
  nickname: string;
  desc: string;
  avatar: string;
  followers: number;
  followed: number;
  notes_count: number;
  liked_count: number;
}

export async function checkXHSCrawlerHealth(): Promise<{ status: string; browser_ready: boolean }> {
  const res = await fetch('/api/xhs/health');
  if (!res.ok) throw new Error('Crawler service not available');
  return res.json();
}

export async function getXHSCookieStatus(): Promise<{
  has_cookie: boolean;
  has_cache: boolean;
  cookie_info: { count?: number; has_a1?: boolean; has_web_session?: boolean };
}> {
  const res = await fetch('/api/xhs/cookie-status');
  if (!res.ok) throw new Error('Failed to get cookie status');
  return res.json();
}

export async function clearXHSCookies(): Promise<{ success: boolean; message: string }> {
  const res = await fetch('/api/xhs/clear-cookies', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to clear cookies');
  return res.json();
}

// Cookie 失效错误类
export class CookieExpiredError extends Error {
  constructor(message: string = 'Cookie已失效，请重新设置') {
    super(message);
    this.name = 'CookieExpiredError';
  }
}

export async function setXHSCookies(cookies: string): Promise<{ success: boolean; cookies_count: number }> {
  const res = await fetch('/api/xhs/set-cookies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookies })
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to set cookies');
  }
  return res.json();
}

export async function searchXHSNotes(
  keyword: string,
  page: number = 1,
  page_size: number = 20,
  sort: string = 'general',
  note_type: string = 'all'
): Promise<{ success: boolean; has_more: boolean; notes: XHSNote[] }> {
  const res = await fetch('/api/xhs/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword, page, page_size, sort, note_type })
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Search failed');
  }
  return res.json();
}

export async function getXHSNoteDetail(
  note_id: string,
  xsec_token: string = '',
  xsec_source: string = ''
): Promise<{ success: boolean; note?: XHSNoteDetail; error?: string }> {
  const res = await fetch('/api/xhs/note/detail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note_id, xsec_token, xsec_source })
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get note detail');
  }
  return res.json();
}

export async function getXHSNoteFromUrl(
  url: string
): Promise<{ success: boolean; note?: XHSNoteDetail; error?: string }> {
  const res = await fetch('/api/xhs/note/from-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get note from URL');
  }
  return res.json();
}

export async function getXHSComments(
  note_id: string,
  xsec_token: string = '',
  cursor: string = '',
  num: number = 10,
  get_sub_comments: boolean = true
): Promise<{ success: boolean; has_more: boolean; cursor: string; comments: XHSComment[] }> {
  const res = await fetch('/api/xhs/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note_id, xsec_token, cursor, num, get_sub_comments })
  });

  // 检查 Cookie 失效错误
  if (res.status === 401) {
    const error = await res.json();
    if (error.error === 'COOKIE_EXPIRED') {
      throw new CookieExpiredError(error.message || 'Cookie已失效，请重新设置');
    }
  }

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get comments');
  }
  return res.json();
}

export async function getXHSNotesByIds(
  note_ids: string[]
): Promise<{ success: boolean; notes: (XHSNoteDetail & { xsec_token?: string; cover?: string })[]; total: number; fetched: number }> {
  const res = await fetch('/api/xhs/notes/by-ids', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note_ids })
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get notes by IDs');
  }
  return res.json();
}

export async function getUserNotes(
  user_id: string,
  cursor: string = '',
  num: number = 20
): Promise<{ success: boolean; has_more: boolean; cursor: string; notes: XHSNote[] }> {
  const res = await fetch('/api/xhs/user/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id, cursor, num })
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get user notes');
  }
  return res.json();
}

export async function getUserInfo(
  user_id: string
): Promise<{ success: boolean; user: XHSUser }> {
  const res = await fetch('/api/xhs/user/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id })
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get user info');
  }
  return res.json();
}

export async function generateWordCloud(
  comments: string[]
): Promise<{ success: boolean; image: string }> {
  const res = await fetch('/api/xhs/wordcloud', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comments })
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to generate wordcloud');
  }
  return res.json();
}

// ============= 新增：URL 解析 API =============

export async function getNotesFromUrls(
  urls: string
): Promise<{
  success: boolean;
  notes: XHSNoteDetail[];
  errors: { note_id: string; error: string }[];
  total: number;
  fetched: number;
  failed: number;
}> {
  const res = await fetch('/api/xhs/notes/from-urls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls })
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || error.detail || 'Failed to fetch notes from URLs');
  }
  return res.json();
}

export async function getUserFromUrl(
  url: string,
  num: number = 20
): Promise<{
  success: boolean;
  user: XHSUser | null;
  notes: XHSNote[];
  has_more: boolean;
  cursor: string;
}> {
  const res = await fetch('/api/xhs/user/from-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, num })
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || error.detail || 'Failed to fetch user from URL');
  }
  return res.json();
}
