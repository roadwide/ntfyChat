import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import "./style.css";

const defaults = {
  apiBase: "/ntfy",
  topic: "",
  device: "",
  theme: "system",
  remember: false,
  authType: "basic",
  username: "",
  password: "",
  token: "",
};
const settingKey = "private-transfer.settings";
const authKey = "private-transfer.auth";

function readJSON(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) || "{}");
  } catch {
    try { storage.removeItem(key); } catch { /* Storage may be unavailable in private mode. */ }
    return {};
  }
}

function loadSettings() {
  return {
    ...defaults,
    ...readJSON(localStorage, settingKey),
    ...readJSON(localStorage, authKey),
    ...readJSON(sessionStorage, authKey),
  };
}

const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const escapeTopic = (topic) => topic.trim().replace(/[^-_A-Za-z0-9]/g, "").slice(0, 64);
const hasCredentials = (settings) => settings.authType === "token" ? Boolean(settings.token.trim()) : Boolean(settings.username.trim() && settings.password);
const isConfigured = (settings) => Boolean(settings.topic && hasCredentials(settings));

function encodeBasic(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function authorization(settings) {
  return settings.authType === "token"
    ? `Bearer ${settings.token}`
    : `Basic ${encodeBasic(`${settings.username}:${settings.password}`)}`;
}

function authHeaders(settings) {
  return hasCredentials(settings) ? {Authorization: authorization(settings)} : {};
}

function api(settings, path) {
  return `${settings.apiBase.trim().replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function parseLines(text) {
  return text.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function fmtSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

function fmtTime(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {hour: "2-digit", minute: "2-digit"}).format(new Date(timestamp * 1000));
}

function fmtDate(timestamp) {
  const date = new Date(timestamp * 1000);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "今天";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "昨天";
  return new Intl.DateTimeFormat("zh-CN", {month: "long", day: "numeric"}).format(date);
}

function Icon({name, size = 20}) {
  const paths = {
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
    copy: <><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 21h14"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    install: <><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 21h14"/></>,
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function RichText({text}) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, index) => /^https?:\/\//.test(part)
    ? <a key={index} href={part} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>{part}</a>
    : part);
}

function Settings({value, onSave, onClose, canClose, installPrompt, onInstall}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  const firstInput = useRef(null);
  const set = (key, next) => setDraft((current) => ({...current, [key]: next}));

  useEffect(() => {
    firstInput.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape" && canClose) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canClose, onClose]);

  const submit = (event) => {
    event.preventDefault();
    const next = {...draft, apiBase: draft.apiBase.trim().replace(/\/$/, ""), topic: escapeTopic(draft.topic), device: draft.device.trim()};
    if (!next.apiBase) return setError("请输入 API 地址");
    if (!next.topic) return setError("请输入仅含字母、数字、连字符或下划线的内部主题");
    if (!next.device) return setError("请填写本设备名称，方便区分消息来源");
    if (!hasCredentials(next)) return setError(next.authType === "token" ? "请输入 Access Token" : "请输入用户名和密码");
    onSave(next);
  };

  return <div className="sheet" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && canClose && onClose()}>
    <form className="panel settings" role="dialog" aria-modal="true" aria-labelledby="settings-title" onSubmit={submit}>
      <header className="panel-title">
        <div><p className="eyebrow">连接偏好</p><h2 id="settings-title">设置私人通道</h2></div>
        {canClose && <button className="icon-button" type="button" aria-label="关闭设置" onClick={onClose}><Icon name="close"/></button>}
      </header>
      <p className="panel-intro">凭据只保存在这台设备的浏览器中，不会进入离线缓存。</p>

      <div className="field-group">
        <label htmlFor="api-base">API 地址</label>
        <input ref={firstInput} id="api-base" inputMode="url" spellCheck="false" value={draft.apiBase} onChange={(event) => set("apiBase", event.target.value)} />
        <span className="hint">通常保持为 /ntfy</span>
      </div>
      <div className="field-row">
        <div className="field-group">
          <label htmlFor="topic">内部主题</label>
          <input id="topic" autoCapitalize="none" autoCorrect="off" spellCheck="false" placeholder="transfer_xxx" value={draft.topic} onChange={(event) => set("topic", escapeTopic(event.target.value))}/>
        </div>
        <div className="field-group">
          <label htmlFor="device">设备名称</label>
          <input id="device" placeholder="MacBook、iPhone" maxLength="40" value={draft.device} onChange={(event) => set("device", event.target.value)}/>
        </div>
      </div>
      <div className="field-row">
        <div className="field-group">
          <label htmlFor="auth-type">认证方式</label>
          <select id="auth-type" value={draft.authType} onChange={(event) => set("authType", event.target.value)}>
            <option value="basic">用户名与密码</option>
            <option value="token">Access Token</option>
          </select>
        </div>
        <div className="field-group">
          <label htmlFor="theme">外观</label>
          <select id="theme" value={draft.theme} onChange={(event) => set("theme", event.target.value)}>
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>
      </div>
      {draft.authType === "basic" ? <div className="field-row">
        <div className="field-group"><label htmlFor="username">用户名</label><input id="username" autoComplete="username" value={draft.username} onChange={(event) => set("username", event.target.value)}/></div>
        <div className="field-group"><label htmlFor="password">密码</label><input id="password" type="password" autoComplete="current-password" value={draft.password} onChange={(event) => set("password", event.target.value)}/></div>
      </div> : <div className="field-group"><label htmlFor="token">Access Token</label><input id="token" type="password" autoComplete="off" value={draft.token} onChange={(event) => set("token", event.target.value)}/></div>}

      <label className="remember"><input type="checkbox" checked={draft.remember} onChange={(event) => set("remember", event.target.checked)}/><span><b>在本设备记住凭据</b><small>共享或办公设备请勿启用</small></span></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary" type="submit">保存并连接 <Icon name="chevron" size={18}/></button>
      {installPrompt && <button className="secondary install" type="button" onClick={onInstall}><Icon name="install" size={18}/> 安装到本设备</button>}
    </form>
  </div>;
}

function Attachment({attachment, settings}) {
  const image = attachment.type?.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|heic)$/i.test(attachment.name || "");
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!attachment.url) return undefined;
    let alive = true;
    let objectUrl = "";
    const attachmentUrl = new URL(attachment.url, window.location.href);
    const apiUrl = new URL(settings.apiBase, window.location.href);
    const apiPath = `${apiUrl.pathname.replace(/\/$/, "")}/`;
    const trustedPath = attachmentUrl.pathname.startsWith(apiPath) || attachmentUrl.pathname.startsWith("/file/");
    const requestHeaders = attachmentUrl.origin === apiUrl.origin && trustedPath ? authHeaders(settings) : {};
    fetch(attachmentUrl, {headers: requestHeaders})
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (alive) setUrl(objectUrl);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.url, settings]);

  const download = (event) => {
    event.stopPropagation();
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.name || "attachment";
    link.click();
  };

  if (error) return <div className="attachment-error"><span>附件无法读取</span><small>请检查权限或文件是否已过期</small></div>;
  if (image) return <div className={`image-wrap ${url ? "loaded" : ""}`}>{url && <a href={url} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}><img src={url} alt={attachment.name || "图片附件"}/></a>}</div>;
  return <button className="file-card" type="button" onClick={download} disabled={!url}>
    <span className="file-icon">{(attachment.name || "文件").split(".").pop().slice(0, 4).toUpperCase()}</span>
    <span className="file-info"><b>{attachment.name || "附件"}</b><small>{fmtSize(attachment.size)} · {url ? "点击下载" : "正在读取"}</small></span>
    <Icon name="download" size={18}/>
  </button>;
}

function Bubble({message, mine, settings, onRetry, onToast}) {
  const copy = async (event) => {
    event.stopPropagation();
    if (!message.message) return;
    try {
      await navigator.clipboard.writeText(message.message);
      onToast("消息已复制");
    } catch {
      onToast("复制失败，请手动选择文字");
    }
  };

  const initial = (message.title || "未知设备").trim().slice(0, 1).toUpperCase();
  return <article className={`message-row ${mine ? "mine" : ""}`}>
    {!mine && <span className="avatar" aria-hidden="true">{initial}</span>}
    <div className="message-stack">
      <div className="sender">{mine ? "我" : (message.title || "未知设备")}</div>
      <div className={`bubble ${message.failed ? "is-failed" : ""}`}>
        {message.attachment && <Attachment attachment={message.attachment} settings={settings}/>} 
        {message.message && <div className="message-text"><RichText text={message.message}/></div>}
        {message.pending && <div className="sending"><span className="spinner"/> 正在发送</div>}
        <footer>
          {message.failed ? <><span className="failed">发送失败</span><button type="button" onClick={() => onRetry(message)}>重试</button></> : <>
            {message.message && <button className="copy" type="button" aria-label="复制消息" title="复制消息" onClick={copy}><Icon name="copy" size={13}/></button>}
            <time dateTime={new Date((message.time || Date.now() / 1000) * 1000).toISOString()}>{fmtTime(message.time || Date.now() / 1000)}</time>
          </>}
        </footer>
      </div>
    </div>
  </article>;
}

function EmptyState({configured, onSetup}) {
  return <div className="empty-state">
    <div className="empty-mark"><span/><span/><span/></div>
    <p className="eyebrow">PRIVATE CHANNEL</p>
    <h1>{configured ? "通道里还没有消息" : "从这里开始私人传输"}</h1>
    <p>{configured ? "在另一台设备打开相同主题，或先发送一条消息。" : "连接你的私有 ntfy，在电脑与手机之间传文字、截图和文件。"}</p>
    {!configured && <button className="primary compact" type="button" onClick={onSetup}>配置连接 <Icon name="chevron" size={18}/></button>}
    <div className="shortcut"><kbd>Enter</kbd><span>发送</span><kbd>Shift Enter</kbd><span>换行</span></div>
  </div>;
}

function App() {
  const initial = useMemo(loadSettings, []);
  const [settings, setSettings] = useState(initial);
  const [ready, setReady] = useState(() => isConfigured(initial));
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("offline");
  const [text, setText] = useState("");
  const [sheet, setSheet] = useState(() => !isConfigured(initial));
  const [newCount, setNewCount] = useState(0);
  const [drag, setDrag] = useState(false);
  const [toast, setToast] = useState("");
  const [installPrompt, setInstallPrompt] = useState(null);
  const list = useRef(null);
  const fileInput = useRef(null);
  const textarea = useRef(null);
  const abort = useRef(null);
  const reconnectTimer = useRef(null);
  const retryCount = useRef(0);
  const toastTimer = useRef(null);

  const showToast = useCallback((message) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  }, []);

  const headers = useCallback(() => authHeaders(settings), [settings]);
  const nearBottom = useCallback(() => {
    const element = list.current;
    return !element || element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  }, []);
  const scrollToBottom = useCallback((behavior = "smooth") => requestAnimationFrame(() => list.current?.scrollTo({top: list.current.scrollHeight, behavior})), []);

  const addMessages = useCallback((items) => setMessages((current) => {
    const ids = new Set(current.map((message) => message.id));
    const accepted = items.filter((message) => (message.local || message.event === "message") && !ids.has(message.id));
    return [...current, ...accepted].sort((a, b) => a.time - b.time);
  }), []);

  const replacePending = useCallback((tempId, real) => setMessages((current) => {
    const withoutTempOrReal = current.filter((message) => message.id !== tempId && message.id !== real.id);
    return [...withoutTempOrReal, real].sort((a, b) => a.time - b.time);
  }), []);

  const history = useCallback(async () => {
    const response = await fetch(api(settings, `${settings.topic}/json?poll=1`), {headers: headers()});
    if (!response.ok) throw new Error(String(response.status));
    addMessages(parseLines(await response.text()));
  }, [settings, headers, addMessages]);

  const connect = useCallback(async () => {
    abort.current?.abort();
    clearTimeout(reconnectTimer.current);
    if (!ready || document.visibilityState === "hidden") return;
    if (!navigator.onLine) {
      setStatus("offline");
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setStatus("connecting");
    try {
      await history();
      const response = await fetch(api(settings, `${settings.topic}/sse`), {headers: headers(), signal: controller.signal});
      if (!response.ok) throw new Error(String(response.status));
      setStatus("online");
      retryCount.current = 0;
      scrollToBottom("auto");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const {value, done} = await reader.read();
        if (done) throw new Error("closed");
        buffer += decoder.decode(value, {stream: true}).replace(/\r\n/g, "\n");
        const events = buffer.split("\n\n");
        buffer = events.pop();
        for (const event of events) {
          const data = event.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
          if (!data) continue;
          try {
            const message = JSON.parse(data);
            if (message.event === "message") {
              const shouldScroll = nearBottom();
              addMessages([message]);
              if (shouldScroll) scrollToBottom(); else setNewCount((count) => count + 1);
            }
          } catch { /* Ignore malformed keepalive events. */ }
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error.message === "401" || error.message === "403") {
        setStatus("auth-error");
        return;
      }
      setStatus("offline");
      const delay = Math.min(30000, 1000 * 2 ** retryCount.current++);
      reconnectTimer.current = setTimeout(connect, delay);
    }
  }, [ready, settings, headers, history, nearBottom, addMessages, scrollToBottom]);

  useEffect(() => {
    connect();
    return () => {
      abort.current?.abort();
      clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    const colorScheme = matchMedia("(prefers-color-scheme: dark)");
    const updateThemeColor = () => {
      const dark = settings.theme === "dark" || (settings.theme === "system" && colorScheme.matches);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#171a17" : "#f4f6f1");
    };
    updateThemeColor();
    colorScheme.addEventListener("change", updateThemeColor);
    return () => colorScheme.removeEventListener("change", updateThemeColor);
  }, [settings.theme]);

  useEffect(() => {
    const resume = () => document.visibilityState === "visible" && connect();
    const offline = () => { abort.current?.abort(); setStatus("offline"); };
    window.addEventListener("online", connect);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("online", connect);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [connect]);

  useEffect(() => {
    const capture = (event) => { event.preventDefault(); setInstallPrompt(event); };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const save = (next) => {
    const safe = {...next, password: "", token: ""};
    localStorage.setItem(settingKey, JSON.stringify(safe));
    const credentialStorage = next.remember ? localStorage : sessionStorage;
    credentialStorage.setItem(authKey, JSON.stringify({username: next.username, password: next.password, token: next.token, authType: next.authType}));
    (next.remember ? sessionStorage : localStorage).removeItem(authKey);
    setMessages([]);
    setSettings(next);
    setReady(isConfigured(next));
    setSheet(false);
    showToast("设置已保存");
  };

  const postText = async (body, existing = null) => {
    if (!body.trim() || !ready) return;
    const temp = existing ? {...existing, pending: true, failed: false} : {id: uid(), local: true, message: body.trim(), time: Date.now() / 1000, title: settings.device || "本设备", pending: true};
    if (existing) setMessages((current) => current.map((message) => message.id === existing.id ? temp : message));
    else addMessages([temp]);
    setText("");
    scrollToBottom();
    try {
      const response = await fetch(api(settings, settings.topic), {method: "POST", headers: {...headers(), Title: settings.device || "本设备", "Content-Type": "text/plain; charset=utf-8"}, body: body.trim()});
      if (!response.ok) throw new Error(String(response.status));
      replacePending(temp.id, await response.json());
    } catch {
      setMessages((current) => current.map((message) => message.id === temp.id ? {...message, pending: false, failed: true} : message));
    }
  };

  const uploadFiles = async (files, existing = null) => {
    if (!ready || !files.length) return;
    for (const uploadFile of files) {
      const temp = existing ? {...existing, pending: true, failed: false} : {id: uid(), local: true, time: Date.now() / 1000, title: settings.device || "本设备", pending: true, attachment: {name: uploadFile.name, size: uploadFile.size, type: uploadFile.type}, _file: uploadFile};
      if (existing) setMessages((current) => current.map((message) => message.id === existing.id ? temp : message));
      else addMessages([temp]);
      scrollToBottom();
      try {
        const response = await fetch(api(settings, `${settings.topic}?filename=${encodeURIComponent(uploadFile.name)}`), {method: "PUT", headers: {...headers(), Title: settings.device || "本设备", Type: uploadFile.type || "application/octet-stream"}, body: uploadFile});
        if (!response.ok) throw new Error(String(response.status));
        replacePending(temp.id, await response.json());
      } catch {
        setMessages((current) => current.map((message) => message.id === temp.id ? {...message, pending: false, failed: true} : message));
      }
      existing = null;
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  const paste = (event) => {
    const files = [...event.clipboardData.files].filter((item) => item.type.startsWith("image/")).map((item) => new File([item], `screenshot-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}.${item.type.split("/")[1] || "png"}`, {type: item.type}));
    if (files.length) {
      event.preventDefault();
      uploadFiles(files);
    }
  };

  const retryMessage = (message) => message._file ? uploadFiles([message._file], message) : postText(message.message, message);
  const install = async () => {
    await installPrompt?.prompt();
    await installPrompt?.userChoice;
    setInstallPrompt(null);
  };

  const statusText = {online: "已连接", connecting: "连接中", offline: "已断开", "auth-error": "认证失败"}[status];
  let previousDate = "";

  return <main
    onDragEnter={(event) => { event.preventDefault(); setDrag(true); }}
    onDragOver={(event) => event.preventDefault()}
    onDragLeave={(event) => event.currentTarget === event.target && setDrag(false)}
    onDrop={(event) => { event.preventDefault(); setDrag(false); uploadFiles([...event.dataTransfer.files]); }}
  >
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><i/><i/><i/></span><div><b>私人传输</b><small>{ready ? settings.device : "尚未配置"}</small></div></div>
      <div className={`status ${status}`} role="status"><span/>{statusText}</div>
      <button className="icon-button" type="button" aria-label="打开设置" title="设置" onClick={() => setSheet(true)}><Icon name="settings"/></button>
    </header>

    <section className="messages" ref={list} aria-live="polite" onScroll={() => { if (nearBottom()) setNewCount(0); }}>
      {!messages.length && <EmptyState configured={ready} onSetup={() => setSheet(true)}/>} 
      {messages.map((message) => {
        const date = fmtDate(message.time || Date.now() / 1000);
        const showDate = date !== previousDate;
        previousDate = date;
        return <React.Fragment key={message.id}>{showDate && <div className="date-divider"><span>{date}</span></div>}<Bubble message={message} mine={message.title === (settings.device || "本设备")} settings={settings} onRetry={retryMessage} onToast={showToast}/></React.Fragment>;
      })}
    </section>

    {newCount > 0 && <button className="new-messages" type="button" onClick={() => { scrollToBottom(); setNewCount(0); }}>↓ {newCount} 条新消息</button>}
    <footer className="composer-shell">
      <div className="composer">
        <input ref={fileInput} type="file" multiple hidden onChange={(event) => uploadFiles([...event.target.files])}/>
        <button className="attach-button" type="button" aria-label="添加文件" title="添加文件" disabled={!ready} onClick={() => fileInput.current?.click()}><Icon name="plus"/></button>
        <textarea
          ref={textarea}
          rows="1"
          value={text}
          onPaste={paste}
          disabled={!ready}
          placeholder={ready ? "输入消息，或粘贴截图…" : "请先完成连接设置"}
          aria-label="消息"
          onChange={(event) => {
            setText(event.target.value);
            event.target.style.height = "auto";
            event.target.style.height = `${Math.min(event.target.scrollHeight, 132)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
              event.preventDefault();
              postText(text);
              event.currentTarget.style.height = "auto";
            }
          }}
        />
        <button className="send-button" type="button" aria-label="发送消息" disabled={!ready || !text.trim()} onClick={() => { postText(text); if (textarea.current) textarea.current.style.height = "auto"; }}><Icon name="send" size={19}/><span>发送</span></button>
      </div>
      <small className="privacy-note">传输由你的私有 ntfy 服务处理</small>
    </footer>

    {drag && <div className="drop-zone"><div><Icon name="plus" size={28}/><b>释放以发送文件</b><span>支持同时发送多个文件</span></div></div>}
    {toast && <div className="toast" role="status">{toast}</div>}
    {sheet && <Settings value={settings} onSave={save} onClose={() => setSheet(false)} canClose={ready} installPrompt={installPrompt} onInstall={install}/>} 
  </main>;
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}

createRoot(document.getElementById("root")).render(<App/>);
