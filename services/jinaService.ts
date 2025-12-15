export interface ProcessedJinaContent {
    title: string;
    content: string;
    coverImageUrl: string | null;
    originalUrl: string;
}

export interface JinaSearchResult {
    title: string;
    url: string;
    description: string;
    content?: string;
}

export const fetchJinaReader = async (url: string, apiKey?: string): Promise<ProcessedJinaContent> => {
    try {
        const res = await fetch('/api/jina/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, apiKey })
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || `Server Error ${res.status}`);
        }
        
        return await res.json();
    } catch (e: any) {
        console.error("Jina Fetch Error:", JSON.stringify(e, Object.getOwnPropertyNames(e)));
        throw new Error(e.message || 'Failed to fetch content from URL');
    }
};

export const searchJina = async (query: string, apiKey?: string): Promise<JinaSearchResult[]> => {
    try {
        const res = await fetch('/api/jina/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, apiKey })
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || `Server Error ${res.status}`);
        }
        
        const json = await res.json();
        return json.data || [];
    } catch (e: any) {
        console.error("Jina Search Error:", e);
        throw e;
    }
};