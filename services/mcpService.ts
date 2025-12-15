
// A lightweight MCP Client implementation for the browser
// Follows MCP HTTP Transport spec: https://spec.modelcontextprotocol.io/transport/http/

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface MCPLog {
  timestamp: number;
  type: 'info' | 'error' | 'send' | 'recv';
  message: string;
  data?: any;
}

export class MCPClient {
  private abortController: AbortController | null = null;
  private postEndpoint: string | null = null;
  private eventSource: EventSource | null = null;
  private onLog: (log: MCPLog) => void;
  private _isConnected: boolean = false;
  private customHeaders: Record<string, string> = {};

  constructor(onLog: (log: MCPLog) => void) {
    this.onLog = onLog;
  }

  get isConnected() {
    return this._isConnected;
  }

  private log(type: MCPLog['type'], message: string, data?: any) {
    this.onLog({
      timestamp: Date.now(),
      type,
      message,
      data
    });
  }

  private originalUrl: string = '';

  /**
   * Connect to the MCP Server
   * @param url The SSE endpoint URL
   * @param options Configuration options
   */
  async connect(url: string, options: { 
      useNativeEventSource?: boolean;
      headers?: Record<string, string>;
      useProxy?: boolean;
  } = {}): Promise<void> {
    
    this.disconnect();
    this.customHeaders = options.headers || {};
    this.originalUrl = url;
    
    // Default to using proxy to avoid CORS issues
    const useProxy = options.useProxy !== false;
    
    if (useProxy) {
        return this.connectViaProxy(url);
    } else if (options.useNativeEventSource) {
        return this.connectNative(url);
    } else {
        return this.connectFetch(url);
    }
  }

  /**
   * Method C: Connect via backend proxy (recommended - bypasses CORS)
   */
  private async connectViaProxy(url: string): Promise<void> {
    this.abortController = new AbortController();
    const proxyUrl = `/api/mcp/proxy?url=${encodeURIComponent(url)}`;
    this.log('info', `Connecting via backend proxy: ${url}`);

    try {
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP Error ${response.status}: ${errorText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      this.log('info', 'Proxy stream connected. Reading...');
      
      return new Promise<void>((resolve, reject) => {
          this.readStream(response.body!, url, resolve, reject);
      });

    } catch (e: any) {
      this.log('error', `Connection failed: ${e.message}`);
      throw e;
    }
  }

  /**
   * Method A: Native EventSource (Limited headers support, but handles some browser quirks)
   */
  private async connectNative(url: string): Promise<void> {
      this.log('info', `Connecting via Native EventSource: ${url}`);
      
      // Note: Native EventSource does NOT support custom headers. 
      // This is a browser limitation.
      if (Object.keys(this.customHeaders).length > 0) {
          this.log('info', 'WARNING: Custom headers are ignored when using Native EventSource.');
      }

      return new Promise((resolve, reject) => {
          try {
              this.eventSource = new EventSource(url);
          } catch (e: any) {
              reject(e);
              return;
          }

          this.eventSource.onopen = () => {
             this.log('info', 'Native EventSource opened.');
          };

          this.eventSource.onerror = (e) => {
             this.log('error', 'Native EventSource error.');
             // We don't reject immediately as it might reconnect, but for initial connection we should?
          };

          this.eventSource.addEventListener('endpoint', (event: MessageEvent) => {
             try {
                 this.postEndpoint = new URL(event.data, url).toString();
                 this._isConnected = true;
                 this.log('recv', `Received POST endpoint: ${this.postEndpoint}`);
                 resolve();
             } catch (e) {
                 reject(e);
             }
          });
      });
  }

  /**
   * Method B: Fetch Stream (Supports headers, full control)
   */
  private async connectFetch(url: string): Promise<void> {
    this.abortController = new AbortController();
    this.log('info', `Connecting via Fetch Stream: ${url}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...this.customHeaders // Inject custom headers (e.g. ngrok-skip-browser-warning)
        },
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP Error ${response.status}: ${errorText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      this.log('info', 'Stream connected. Reading...');
      
      // Start reading in background
      return new Promise<void>((resolve, reject) => {
          this.readStream(response.body!, url, resolve, reject);
      });

    } catch (e: any) {
      this.log('error', `Connection failed: ${e.message}`);
      throw e;
    }
  }

  private async readStream(
      body: ReadableStream<Uint8Array>, 
      baseUrl: string,
      onEndpointFound: () => void,
      onInitialError: (e: Error) => void
  ) {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let hasFoundEndpoint = false;

      try {
          while (true) {
              const { done, value } = await reader.read();
              if (done) {
                  this.log('info', 'Stream closed by server.');
                  break;
              }
              
              buffer += decoder.decode(value, { stream: true });
              const parts = buffer.split('\n\n');
              buffer = parts.pop() || '';

              for (const part of parts) {
                  if (!part.trim()) continue;
                  
                  const lines = part.split('\n');
                  let eventType = 'message';
                  let data = '';

                  for (const line of lines) {
                      if (line.startsWith('event:')) eventType = line.substring(6).trim();
                      else if (line.startsWith('data:')) data = line.substring(5).trim();
                  }

                  if (eventType === 'endpoint') {
                      try {
                          this.postEndpoint = new URL(data, baseUrl).toString();
                          this._isConnected = true;
                          this.log('recv', `Received POST endpoint: ${this.postEndpoint}`);
                          
                          if (!hasFoundEndpoint) {
                              hasFoundEndpoint = true;
                              onEndpointFound();
                          }
                      } catch (e) {
                          this.log('error', `Invalid endpoint URL: ${data}`);
                      }
                  } else {
                      if (data) this.log('recv', `SSE Event [${eventType}]`, data);
                  }
              }
          }
      } catch (e: any) {
          if (e.name === 'AbortError') {
              this.log('info', 'Connection aborted.');
          } else {
              this.log('error', `Stream read error: ${e.message}`);
              if (!hasFoundEndpoint) onInitialError(e);
          }
      } finally {
          reader.releaseLock();
          this._isConnected = false;
      }
  }

  private async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.postEndpoint) {
      throw new Error("NOT_CONNECTED: No POST endpoint established.");
    }

    const requestId = Date.now();
    const payload = {
      jsonrpc: "2.0",
      id: requestId,
      method,
      params
    };

    this.log('send', `Sending JSON-RPC: ${method}`, payload);

    try {
      // Use proxy for POST requests too
      const proxyUrl = `/api/mcp/proxy?url=${encodeURIComponent(this.postEndpoint)}`;
      
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      if (!text) return null;

      const json = JSON.parse(text);
      this.log('recv', `Response for ${method}`, json);

      if (json.error) {
        throw new Error(`MCP Error ${json.error.code}: ${json.error.message}`);
      }

      return json.result;

    } catch (e: any) {
      this.log('error', `Request failed: ${e.message}`);
      throw e;
    }
  }

  async initialize() {
    return this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { roots: { listChanged: false }, sampling: {} },
      clientInfo: { name: "MazeLabWebClient", version: "1.0.0" }
    });
  }

  async listTools(): Promise<MCPTool[]> {
    const result = await this.sendRequest('tools/list');
    return result.tools || [];
  }

  async callTool(name: string, args: Record<string, any>) {
    return this.sendRequest('tools/call', { name, arguments: args });
  }

  disconnect() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this._isConnected = false;
    this.postEndpoint = null;
    this.log('info', 'Disconnected.');
  }
}
