export interface ProcessedJinaContent {
    title: string;
    content: string;
    coverImageUrl: string | null;
    originalUrl: string;
}

export const fetchJinaReader = async (url: string, apiKey?: string): Promise<ProcessedJinaContent> => {
    try {
        const res = await fetch('http://localhost:3001/api/jina/import', {
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
        console.error("Jina Fetch Error:", e);
        throw e;
    }
};