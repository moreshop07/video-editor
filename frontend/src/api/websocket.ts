type MessageCallback = (data: unknown) => void;

export class ProjectWebSocket {
  private ws: WebSocket | null = null;
  private projectId: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private isManualClose = false;

  // Callback arrays
  private jobProgressCallbacks: MessageCallback[] = [];
  private projectSyncCallbacks: MessageCallback[] = [];
  private autoSaveAckCallbacks: MessageCallback[] = [];
  private userJoinedCallbacks: MessageCallback[] = [];
  private userLeftCallbacks: MessageCallback[] = [];
  private presenceCallbacks: MessageCallback[] = [];
  private remoteOpCallbacks: MessageCallback[] = [];
  private selectionUpdateCallbacks: MessageCallback[] = [];
  private cursorUpdateCallbacks: MessageCallback[] = [];

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  connect(): void {
    const token = localStorage.getItem("auth_token") || "";
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const url = `${protocol}//${host}/api/v1/ws/${this.projectId}?token=${token}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log(`WebSocket connected for project ${this.projectId}`);
      this.reconnectAttempts = 0;
      this.startHeartbeat();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        switch (message.type) {
          case "job_progress":
            this.jobProgressCallbacks.forEach((cb) => cb(message.data));
            break;
          case "job_status":
            this.jobProgressCallbacks.forEach((cb) => cb(message.payload));
            break;
          case "project_sync":
            this.projectSyncCallbacks.forEach((cb) => cb(message.data));
            break;
          case "auto_save_ack":
            this.autoSaveAckCallbacks.forEach((cb) => cb(message));
            break;
          case "user_joined":
            this.userJoinedCallbacks.forEach((cb) => cb(message));
            break;
          case "user_left":
            this.userLeftCallbacks.forEach((cb) => cb(message));
            break;
          case "presence":
            this.presenceCallbacks.forEach((cb) => cb(message));
            break;
          case "remote_op":
            this.remoteOpCallbacks.forEach((cb) => cb(message));
            break;
          case "selection_update":
            this.selectionUpdateCallbacks.forEach((cb) => cb(message));
            break;
          case "cursor_update":
            this.cursorUpdateCallbacks.forEach((cb) => cb(message));
            break;
          case "heartbeat_ack":
            // No-op, just keeps connection alive
            break;
          default:
            console.log("Unknown WebSocket message type:", message.type);
        }
      } catch {
        console.error("Failed to parse WebSocket message");
      }
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      if (!this.isManualClose) {
        this.attemptReconnect();
      }
    };

    this.ws.onerror = (error: Event) => {
      console.error("WebSocket error:", error);
    };
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "heartbeat" }));
      }
    }, 5000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max WebSocket reconnect attempts reached");
      return;
    }

    const delay = this.baseDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(
      `Reconnecting WebSocket in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // --- Send methods ---

  sendProjectUpdate(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "project_update", data }));
    }
  }

  sendAutoSave(projectData: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "auto_save", project_data: projectData }));
    }
  }

  sendOperation(opType: string, payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "operation", op_type: opType, payload }));
    }
  }

  sendSelection(selectedClipIds: string[]): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "selection", selectedClipIds }));
    }
  }

  sendCursor(currentTime: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "cursor", currentTime }));
    }
  }

  // --- Subscribe methods ---

  private _subscribe(arr: MessageCallback[], callback: MessageCallback): () => void {
    arr.push(callback);
    return () => {
      const idx = arr.indexOf(callback);
      if (idx >= 0) arr.splice(idx, 1);
    };
  }

  onJobProgress(callback: MessageCallback): () => void {
    return this._subscribe(this.jobProgressCallbacks, callback);
  }

  onProjectSync(callback: MessageCallback): () => void {
    return this._subscribe(this.projectSyncCallbacks, callback);
  }

  onAutoSaveAck(callback: MessageCallback): () => void {
    return this._subscribe(this.autoSaveAckCallbacks, callback);
  }

  onUserJoined(callback: MessageCallback): () => void {
    return this._subscribe(this.userJoinedCallbacks, callback);
  }

  onUserLeft(callback: MessageCallback): () => void {
    return this._subscribe(this.userLeftCallbacks, callback);
  }

  onPresence(callback: MessageCallback): () => void {
    return this._subscribe(this.presenceCallbacks, callback);
  }

  onRemoteOp(callback: MessageCallback): () => void {
    return this._subscribe(this.remoteOpCallbacks, callback);
  }

  onSelectionUpdate(callback: MessageCallback): () => void {
    return this._subscribe(this.selectionUpdateCallbacks, callback);
  }

  onCursorUpdate(callback: MessageCallback): () => void {
    return this._subscribe(this.cursorUpdateCallbacks, callback);
  }

  disconnect(): void {
    this.isManualClose = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
