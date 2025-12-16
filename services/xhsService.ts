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
}

export async function checkXHSCrawlerHealth(): Promise<{ status: string; browser_ready: boolean }> {
  const res = await fetch('/api/xhs/health');
  if (!res.ok) throw new Error('Crawler service not available');
  return res.json();
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
  sort: string = 'general'
): Promise<{ success: boolean; has_more: boolean; notes: XHSNote[] }> {
  const res = await fetch('/api/xhs/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword, page, page_size, sort })
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
  cursor: string = ''
): Promise<{ success: boolean; has_more: boolean; cursor: string; comments: XHSComment[] }> {
  const res = await fetch('/api/xhs/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note_id, xsec_token, cursor })
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get comments');
  }
  return res.json();
}
