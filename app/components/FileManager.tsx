"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";

import type { BreadcrumbEntry, PublicItem } from "@/lib/files-core";
import type { FileView, FolderOption, StorageSummary } from "@/lib/file-store";
import "./file-manager.css";

type LayoutMode = "list" | "grid";
type UploadState = "waiting" | "uploading" | "success" | "error";

type UploadTask = {
  id: string;
  name: string;
  size: number;
  progress: number;
  state: UploadState;
  message: string;
};

type BootstrapResponse = {
  items: PublicItem[];
  breadcrumb: BreadcrumbEntry[];
  validDirectory: boolean;
  folders: FolderOption[];
  storage: StorageSummary;
  upload: { maxBytes: number; maxLabel: string };
  notice: string | null;
};

type DialogState =
  | { type: "closed" }
  | { type: "new-folder" }
  | { type: "rename"; item: PublicItem }
  | { type: "move"; item: PublicItem }
  | { type: "trash"; item: PublicItem; count: number }
  | { type: "permanent"; item: PublicItem }
  | { type: "preview"; item: PublicItem }
  | { type: "details"; item: PublicItem };

type FileManagerProps = {
  displayName: string;
  email: string;
};

const NAV_ITEMS: Array<{ view: FileView; label: string; icon: string }> = [
  { view: "files", label: "我的文件", icon: "▰" },
  { view: "recent", label: "最近使用", icon: "◷" },
  { view: "favorites", label: "收藏", icon: "☆" },
  { view: "trash", label: "回收站", icon: "⌫" },
];

const DEFAULT_LIMIT = 25 * 1024 * 1024;

export function FileManager({ displayName, email }: FileManagerProps) {
  const [view, setView] = useState<FileView>("files");
  const [parentId, setParentId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState("updated");
  const [direction, setDirection] = useState("desc");
  const [layout, setLayout] = useState<LayoutMode>("list");
  const [items, setItems] = useState<PublicItem[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbEntry[]>([
    { id: null, name: "我的文件" },
  ]);
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [storage, setStorage] = useState<StorageSummary>({
    fileCount: 0,
    folderCount: 0,
    usedBytes: 0,
  });
  const [uploadLimit, setUploadLimit] = useState(DEFAULT_LIMIT);
  const [uploadLimitLabel, setUploadLimitLabel] = useState("25 MB");
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [dialog, setDialog] = useState<DialogState>({ type: "closed" });
  const [dialogValue, setDialogValue] = useState("");
  const [moveParentId, setMoveParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ view, sort, direction });
      if (parentId) params.set("parentId", parentId);
      if (view === "search") params.set("query", searchTerm);
      const response = await fetch(`/api/bootstrap?${params.toString()}`, {
        signal,
        cache: "no-store",
      });
      const data = await readResponse<BootstrapResponse>(response);
      setItems(data.items);
      setBreadcrumb(data.breadcrumb);
      setFolders(data.folders);
      setStorage(data.storage);
      setUploadLimit(data.upload.maxBytes);
      setUploadLimitLabel(data.upload.maxLabel);
      if (!data.validDirectory) {
        setParentId(null);
        window.history.replaceState(null, "", "/");
      }
      if (data.notice) setMessage(data.notice);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(errorMessage(error));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [direction, parentId, searchTerm, sort, view]);

  useEffect(() => {
    const initializeTimer = window.setTimeout(() => {
      const savedLayout = window.localStorage.getItem("yuexia-layout");
      if (savedLayout === "grid" || savedLayout === "list") setLayout(savedLayout);
      const initialFolder = new URLSearchParams(window.location.search).get("folder");
      if (initialFolder) setParentId(initialFolder);
    }, 0);
    const handlePopState = () => {
      setParentId(new URLSearchParams(window.location.search).get("folder"));
      setView("files");
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.clearTimeout(initializeTimer);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadTimer = window.setTimeout(() => void loadData(controller.signal), 0);
    return () => {
      window.clearTimeout(loadTimer);
      controller.abort();
    };
  }, [loadData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = query.trim();
      setSearchTerm(normalized);
      if (normalized) setView("search");
      else if (view === "search") setView("files");
    }, 260);
    return () => window.clearTimeout(timer);
  }, [query, view]);

  function selectView(nextView: FileView) {
    setView(nextView);
    setSidebarOpen(false);
    setQuery("");
    if (nextView === "files") navigateFolder(null);
  }

  function navigateFolder(id: string | null) {
    setView("files");
    setParentId(id);
    setQuery("");
    const url = id ? `/?folder=${encodeURIComponent(id)}` : "/";
    window.history.pushState(null, "", url);
  }

  function setLayoutMode(nextLayout: LayoutMode) {
    setLayout(nextLayout);
    window.localStorage.setItem("yuexia-layout", nextLayout);
  }

  function handleSort(event: ChangeEvent<HTMLSelectElement>) {
    const [nextSort, nextDirection] = event.target.value.split(":");
    setSort(nextSort ?? "updated");
    setDirection(nextDirection ?? "desc");
  }

  function openItem(item: PublicItem) {
    if (item.type === "folder") {
      navigateFolder(item.id);
      return;
    }
    setDialog({ type: item.previewKind === "details" ? "details" : "preview", item });
  }

  function openRename(item: PublicItem) {
    setDialogValue(item.name);
    setDialog({ type: "rename", item });
  }

  function openMove(item: PublicItem) {
    setMoveParentId(item.parentId ?? "");
    setDialog({ type: "move", item });
  }

  async function requestTrash(item: PublicItem) {
    let count = 0;
    if (item.type === "folder") {
      try {
        const response = await fetch(`/api/folders/${encodeURIComponent(item.id)}/count`);
        const data = await readResponse<{ total: number }>(response);
        count = data.total;
      } catch (error) {
        setMessage(errorMessage(error));
        return;
      }
    }
    setDialog({ type: "trash", item, count });
  }

  async function submitDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (dialog.type === "new-folder") {
        await mutate("/api/folders", "POST", { name: dialogValue, parentId });
        setMessage(`已新建文件夹“${dialogValue.trim()}”`);
      } else if (dialog.type === "rename") {
        await mutate(`/api/items/${encodeURIComponent(dialog.item.id)}`, "PATCH", {
          action: "rename",
          name: dialogValue,
        });
        setMessage("名称已更新");
      } else if (dialog.type === "move") {
        await mutate(`/api/items/${encodeURIComponent(dialog.item.id)}`, "PATCH", {
          action: "move",
          parentId: moveParentId || null,
        });
        setMessage("项目已移动");
      } else if (dialog.type === "trash") {
        await mutate(`/api/items/${encodeURIComponent(dialog.item.id)}/trash`, "POST", {
          ...(dialog.count > 0 ? { confirmedCount: dialog.count } : {}),
        });
        setMessage("项目已移入回收站");
      } else if (dialog.type === "permanent") {
        await mutate(`/api/items/${encodeURIComponent(dialog.item.id)}`, "DELETE");
        setMessage("项目已永久删除");
      }
      setDialog({ type: "closed" });
      setDialogValue("");
      await loadData();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite(item: PublicItem) {
    try {
      await mutate(`/api/items/${encodeURIComponent(item.id)}`, "PATCH", {
        action: "favorite",
        favorite: !item.isFavorite,
      });
      await loadData();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function restoreItem(item: PublicItem) {
    try {
      await mutate(`/api/items/${encodeURIComponent(item.id)}/restore`, "POST", {});
      setMessage("项目已恢复");
      await loadData();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  function chooseFiles() {
    fileInputRef.current?.click();
  }

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void uploadFiles(Array.from(event.target.files));
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (view !== "files" || event.dataTransfer.files.length === 0) return;
    void uploadFiles(Array.from(event.dataTransfer.files));
  }

  async function uploadFiles(filesToUpload: File[]) {
    const tasks = filesToUpload.map<UploadTask>((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      progress: 0,
      state: "waiting",
      message: "等待上传",
    }));
    setUploads((current) => [...tasks, ...current].slice(0, 20));
    await Promise.all(
      filesToUpload.map((file, index) => uploadOne(file, tasks[index].id)),
    );
    await loadData();
  }

  async function uploadOne(file: File, taskId: string): Promise<void> {
    if (file.size <= 0) {
      updateUpload(taskId, { state: "error", message: "不能上传空文件" });
      return;
    }
    if (file.size > uploadLimit) {
      updateUpload(taskId, {
        state: "error",
        message: `单个文件不能超过 ${uploadLimitLabel}`,
      });
      return;
    }
    updateUpload(taskId, { state: "uploading", message: "正在上传" });
    const form = new FormData();
    form.set("file", file);
    if (parentId) form.set("parentId", parentId);

    await new Promise<void>((resolve) => {
      const request = new XMLHttpRequest();
      request.open("POST", "/api/upload");
      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        updateUpload(taskId, {
          progress: Math.min(99, Math.round((event.loaded / event.total) * 100)),
        });
      };
      request.onerror = () => {
        updateUpload(taskId, { state: "error", message: "网络中断，请重试" });
        resolve();
      };
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) {
          updateUpload(taskId, { state: "success", progress: 100, message: "上传完成" });
        } else {
          updateUpload(taskId, { state: "error", message: xhrErrorMessage(request.responseText) });
        }
        resolve();
      };
      request.send(form);
    });
  }

  function updateUpload(taskId: string, update: Partial<UploadTask>) {
    setUploads((current) =>
      current.map((task) => (task.id === taskId ? { ...task, ...update } : task)),
    );
  }

  const pageTitle =
    view === "search"
      ? `搜索“${searchTerm}”`
      : NAV_ITEMS.find((item) => item.view === view)?.label ?? "我的文件";

  return (
    <main className="drive-shell">
      <a className="skip-link" href="#file-area">跳到文件区域</a>
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`} aria-label="文件导航">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <div><strong>跃匣</strong><span>PRIVATE FILES</span></div>
        </div>
        <nav>
          {NAV_ITEMS.map((navItem) => (
            <button
              key={navItem.view}
              type="button"
              className={view === navItem.view ? "nav-active" : ""}
              onClick={() => selectView(navItem.view)}
            >
              <span aria-hidden="true">{navItem.icon}</span>{navItem.label}
            </button>
          ))}
        </nav>
        <div className="storage-panel">
          <p><span>存储概览</span><strong>{formatBytes(storage.usedBytes)}</strong></p>
          <div className="storage-line" aria-hidden="true"><span /></div>
          <small>{storage.fileCount} 个文件 · {storage.folderCount} 个文件夹</small>
          <small>实际额度由当前 Sites 套餐决定</small>
        </div>
        <div className="account">
          <span className="avatar" aria-hidden="true">{displayName.slice(0, 1).toLocaleUpperCase()}</span>
          <span><strong>{displayName}</strong><small>{email}</small></span>
          <a href="/signout-with-chatgpt?return_to=%2F" aria-label="退出登录">↗</a>
        </div>
      </aside>

      {sidebarOpen && <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />}

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-menu" type="button" aria-label="打开导航" onClick={() => setSidebarOpen(true)}>☰</button>
          <div className="search-wrap">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="搜索文件"
              type="search"
              placeholder="搜索文件"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <kbd>⌘ K</kbd>
          </div>
          <div className="top-actions">
            <button type="button" className="secondary-button" onClick={() => { setDialogValue(""); setDialog({ type: "new-folder" }); }} disabled={view !== "files"}>＋ 新建文件夹</button>
            <button type="button" className="primary-button" onClick={chooseFiles} disabled={view !== "files"}>↑ 上传文件</button>
            <input ref={fileInputRef} className="visually-hidden" type="file" multiple onChange={handleFileSelection} />
          </div>
        </header>

        <div className="content" id="file-area">
          <div className="content-heading">
            <div>
              {view === "files" ? (
                <nav className="breadcrumb" aria-label="当前位置">
                  {breadcrumb.map((entry, index) => (
                    <span key={entry.id ?? "root"}>
                      {index > 0 && <b aria-hidden="true">/</b>}
                      <button type="button" onClick={() => navigateFolder(entry.id)} aria-current={index === breadcrumb.length - 1 ? "page" : undefined}>{entry.name}</button>
                    </span>
                  ))}
                </nav>
              ) : <h1>{pageTitle}</h1>}
              <p>{loading ? "正在读取…" : `${items.length} 个项目`}</p>
            </div>
            <div className="view-tools">
              <label><span className="visually-hidden">排序方式</span>
                <select value={`${sort}:${direction}`} onChange={handleSort}>
                  <option value="updated:desc">最近更新</option>
                  <option value="updated:asc">最早更新</option>
                  <option value="name:asc">名称 A–Z</option>
                  <option value="name:desc">名称 Z–A</option>
                  <option value="type:asc">按类型</option>
                  <option value="size:desc">大小：从大到小</option>
                  <option value="size:asc">大小：从小到大</option>
                </select>
              </label>
              <div className="layout-toggle" aria-label="视图方式">
                <button type="button" className={layout === "list" ? "selected" : ""} aria-label="列表视图" onClick={() => setLayoutMode("list")}>☷</button>
                <button type="button" className={layout === "grid" ? "selected" : ""} aria-label="网格视图" onClick={() => setLayoutMode("grid")}>▦</button>
              </div>
            </div>
          </div>

          <div
            className={`drop-zone ${dragActive ? "drop-active" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false); }}
            onDrop={handleDrop}
          >
            {dragActive && <div className="drop-message">松开即可上传到当前文件夹</div>}
            {loading ? (
              <div className="loading-state" role="status"><span /><p>正在整理你的文件匣</p></div>
            ) : items.length === 0 ? (
              <div className="empty-state">
                <div className="empty-box" aria-hidden="true"><span /></div>
                <h2>{emptyTitle(view)}</h2>
                <p>{emptyDescription(view)}</p>
                {view === "files" && <button type="button" className="primary-button" onClick={chooseFiles}>选择文件上传</button>}
              </div>
            ) : layout === "list" ? (
              <FileList
                items={items}
                trashView={view === "trash"}
                onOpen={openItem}
                onFavorite={toggleFavorite}
                onRename={openRename}
                onMove={openMove}
                onTrash={requestTrash}
                onRestore={restoreItem}
                onPermanent={(item) => setDialog({ type: "permanent", item })}
              />
            ) : (
              <FileGrid
                items={items}
                trashView={view === "trash"}
                onOpen={openItem}
                onFavorite={toggleFavorite}
                onRename={openRename}
                onMove={openMove}
                onTrash={requestTrash}
                onRestore={restoreItem}
                onPermanent={(item) => setDialog({ type: "permanent", item })}
              />
            )}
          </div>
        </div>
      </section>

      {uploads.length > 0 && (
        <section className="upload-panel" aria-label="上传队列">
          <header><strong>上传队列</strong><button type="button" aria-label="清除已完成任务" onClick={() => setUploads((current) => current.filter((task) => task.state === "uploading" || task.state === "waiting"))}>×</button></header>
          {uploads.slice(0, 5).map((task) => (
            <div className="upload-task" key={task.id}>
              <span className={`upload-status ${task.state}`} aria-hidden="true">{task.state === "success" ? "✓" : task.state === "error" ? "!" : "↑"}</span>
              <div><strong>{task.name}</strong><small>{formatBytes(task.size)} · {task.message}</small><span className="progress"><i style={{ width: `${task.progress}%` }} /></span></div>
              <b>{task.progress}%</b>
            </div>
          ))}
        </section>
      )}

      <div className="toast" aria-live="polite" aria-atomic="true">{message && <span>{message}<button type="button" aria-label="关闭提示" onClick={() => setMessage("")}>×</button></span>}</div>

      {dialog.type !== "closed" && (
        <FileDialog
          dialog={dialog}
          value={dialogValue}
          moveParentId={moveParentId}
          folders={folders}
          busy={busy}
          onValueChange={setDialogValue}
          onMoveParentChange={setMoveParentId}
          onClose={() => setDialog({ type: "closed" })}
          onSubmit={submitDialog}
        />
      )}
    </main>
  );
}

type ItemActions = {
  items: PublicItem[];
  trashView: boolean;
  onOpen(item: PublicItem): void;
  onFavorite(item: PublicItem): void;
  onRename(item: PublicItem): void;
  onMove(item: PublicItem): void;
  onTrash(item: PublicItem): void;
  onRestore(item: PublicItem): void;
  onPermanent(item: PublicItem): void;
};

function FileList(props: ItemActions) {
  return (
    <div className="file-table" role="table" aria-label="文件列表">
      <div className="file-row table-header" role="row">
        <span role="columnheader">名称</span><span role="columnheader">类型</span><span role="columnheader">大小</span><span role="columnheader">更新时间</span><span role="columnheader">操作</span>
      </div>
      {props.items.map((item) => (
        <div className="file-row" role="row" key={item.id}>
          <div className="file-name" role="cell"><FileIcon item={item} /><span><button type="button" onClick={() => props.onOpen(item)}>{item.name}</button>{item.location && <small>{item.location}</small>}</span></div>
          <span role="cell">{typeLabel(item)}</span>
          <span role="cell">{item.type === "folder" ? "—" : formatBytes(item.sizeBytes)}</span>
          <span role="cell">{formatDate(item.updatedAt)}</span>
          <ItemActionButtons item={item} {...props} />
        </div>
      ))}
    </div>
  );
}

function FileGrid(props: ItemActions) {
  return (
    <div className="file-grid" aria-label="文件网格">
      {props.items.map((item) => (
        <article className="file-card" key={item.id}>
          <header><FileIcon item={item} large /><button type="button" className="favorite-button" aria-label={item.isFavorite ? "取消收藏" : "收藏"} onClick={() => props.onFavorite(item)} disabled={props.trashView}>{item.isFavorite ? "★" : "☆"}</button></header>
          <button type="button" className="card-name" onClick={() => props.onOpen(item)}>{item.name}</button>
          <p>{item.type === "folder" ? typeLabel(item) : `${typeLabel(item)} · ${formatBytes(item.sizeBytes)}`}</p>
          {item.location && <small>{item.location}</small>}
          <footer><span>{formatDate(item.updatedAt)}</span><ItemActionButtons item={item} {...props} compact /></footer>
        </article>
      ))}
    </div>
  );
}

function ItemActionButtons(props: ItemActions & { item: PublicItem; compact?: boolean }) {
  const { item } = props;
  if (props.trashView) {
    return <div className="row-actions" role="cell"><button type="button" onClick={() => props.onRestore(item)}>恢复</button><button type="button" className="danger-link" onClick={() => props.onPermanent(item)}>永久删除</button></div>;
  }
  return (
    <div className="row-actions" role="cell">
      {!props.compact && <button type="button" aria-label={item.isFavorite ? `取消收藏 ${item.name}` : `收藏 ${item.name}`} onClick={() => props.onFavorite(item)}>{item.isFavorite ? "★" : "☆"}</button>}
      {item.type === "file" && <a href={`/api/items/${encodeURIComponent(item.id)}/content?mode=download`} download aria-label={`下载 ${item.name}`}>↓</a>}
      <button type="button" aria-label={`重命名 ${item.name}`} onClick={() => props.onRename(item)}>改名</button>
      <button type="button" aria-label={`移动 ${item.name}`} onClick={() => props.onMove(item)}>移动</button>
      <button type="button" className="danger-link" aria-label={`删除 ${item.name}`} onClick={() => props.onTrash(item)}>删除</button>
    </div>
  );
}

function FileIcon({ item, large = false }: { item: PublicItem; large?: boolean }) {
  const label = item.type === "folder" ? "文件夹" : typeLabel(item);
  return <span className={`file-icon ${item.type} ${large ? "large" : ""}`} aria-label={label}><i />{item.type === "folder" ? "" : fileGlyph(item)}</span>;
}

type FileDialogProps = {
  dialog: Exclude<DialogState, { type: "closed" }>;
  value: string;
  moveParentId: string;
  folders: FolderOption[];
  busy: boolean;
  onValueChange(value: string): void;
  onMoveParentChange(value: string): void;
  onClose(): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
};

function FileDialog(props: FileDialogProps) {
  const { dialog } = props;
  if (dialog.type === "preview" || dialog.type === "details") {
    const item = dialog.item;
    return (
      <dialog open className="modal preview-modal" aria-labelledby="preview-title">
        <div className="modal-card">
          <header><div><FileIcon item={item} /><span><strong id="preview-title">{item.name}</strong><small>{typeLabel(item)} · {formatBytes(item.sizeBytes)}</small></span></div><button type="button" aria-label="关闭预览" onClick={props.onClose}>×</button></header>
          {dialog.type === "preview" ? (
            <iframe title={`预览 ${item.name}`} src={`/api/items/${encodeURIComponent(item.id)}/content?mode=preview`} />
          ) : (
            <div className="details-panel"><FileIcon item={item} large /><h2>此格式暂不支持站内预览</h2><p>文件内容不会被执行或解压。你可以安全地查看详情，或下载到本地后打开。</p><dl><div><dt>文件名</dt><dd>{item.name}</dd></div><div><dt>类型</dt><dd>{item.mimeType ?? "未知"}</dd></div><div><dt>大小</dt><dd>{formatBytes(item.sizeBytes)}</dd></div><div><dt>更新时间</dt><dd>{formatDate(item.updatedAt)}</dd></div></dl></div>
          )}
          <footer><button type="button" className="secondary-button" onClick={props.onClose}>关闭</button><a className="primary-button" href={`/api/items/${encodeURIComponent(item.id)}/content?mode=download`} download>下载文件</a></footer>
        </div>
      </dialog>
    );
  }

  const title = dialogTitle(dialog);
  return (
    <dialog open className="modal" aria-labelledby="dialog-title">
      <form className="modal-card compact-modal" onSubmit={props.onSubmit}>
        <header><div><span className={dialog.type === "permanent" ? "modal-danger-icon" : "modal-icon"} aria-hidden="true">{dialog.type === "permanent" ? "!" : "↗"}</span><span><strong id="dialog-title">{title}</strong><small>{dialogSubtitle(dialog)}</small></span></div><button type="button" aria-label="关闭对话框" onClick={props.onClose}>×</button></header>
        {(dialog.type === "new-folder" || dialog.type === "rename") && (
          <label className="field-label">名称<input required maxLength={180} value={props.value} onChange={(event) => props.onValueChange(event.target.value)} placeholder={dialog.type === "new-folder" ? "例如：旅行资料" : undefined} /></label>
        )}
        {dialog.type === "move" && (
          <label className="field-label">移动到<select value={props.moveParentId} onChange={(event) => props.onMoveParentChange(event.target.value)}><option value="">我的文件（根目录）</option>{props.folders.filter((folder) => folder.id !== dialog.item.id).map((folder) => <option key={folder.id} value={folder.id}>{folder.location} / {folder.name}</option>)}</select></label>
        )}
        {dialog.type === "trash" && dialog.count > 0 && <div className="warning-box"><strong>此文件夹中包含 {dialog.count} 个项目</strong><p>确认后，这些项目会一起进入回收站，之后仍可恢复。</p></div>}
        {dialog.type === "permanent" && <div className="danger-box"><strong>此操作无法撤销</strong><p>“{dialog.item.name}”及其中内容会从存储中彻底清除，之后无法下载或恢复。</p></div>}
        <footer><button type="button" className="secondary-button" onClick={props.onClose}>取消</button><button type="submit" disabled={props.busy} className={dialog.type === "permanent" ? "danger-button" : "primary-button"}>{props.busy ? "正在处理…" : dialogAction(dialog)}</button></footer>
      </form>
    </dialog>
  );
}

async function mutate(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) await readResponse(response);
}

async function readResponse<T = unknown>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (isObject(data) && isObject(data.error) && typeof data.error.message === "string") {
      throw new Error(data.error.message);
    }
    throw new Error("操作失败，请稍后重试");
  }
  return data as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

function xhrErrorMessage(responseText: string): string {
  try {
    const data: unknown = JSON.parse(responseText);
    if (isObject(data) && isObject(data.error) && typeof data.error.message === "string") {
      return data.error.message;
    }
  } catch {
    return "上传失败，请重试";
  }
  return "上传失败，请重试";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function typeLabel(item: PublicItem): string {
  if (item.type === "folder") return "文件夹";
  if (item.mimeType === "application/pdf") return "PDF";
  if (item.mimeType?.startsWith("image/")) return "图片";
  if (item.mimeType?.startsWith("text/")) return "文本";
  if (item.mimeType?.includes("spreadsheet") || item.mimeType?.includes("excel")) return "表格";
  if (item.mimeType?.includes("word")) return "文档";
  if (item.mimeType?.includes("zip")) return "压缩文件";
  return "文件";
}

function fileGlyph(item: PublicItem): string {
  const type = typeLabel(item);
  return type === "PDF" ? "PDF" : type === "图片" ? "IMG" : type === "表格" ? "XLS" : type === "文本" ? "TXT" : "FILE";
}

function emptyTitle(view: FileView): string {
  if (view === "trash") return "回收站是空的";
  if (view === "favorites") return "还没有收藏项目";
  if (view === "recent") return "还没有最近使用的项目";
  if (view === "search") return "没有找到匹配文件";
  return "这里还没有文件";
}

function emptyDescription(view: FileView): string {
  if (view === "trash") return "删除的文件和文件夹会暂存在这里。";
  if (view === "favorites") return "给常用文件点亮星标，稍后可快速找到。";
  if (view === "recent") return "打开、预览或下载项目后，会在这里出现。";
  if (view === "search") return "试试更短的名称，或检查输入是否正确。";
  return "拖放文件到这里，或点击下方按钮开始使用。";
}

function dialogTitle(dialog: Exclude<DialogState, { type: "closed" | "preview" | "details" }>): string {
  if (dialog.type === "new-folder") return "新建文件夹";
  if (dialog.type === "rename") return "重命名";
  if (dialog.type === "move") return "移动项目";
  if (dialog.type === "trash") return "移入回收站";
  return "永久删除";
}

function dialogSubtitle(dialog: Exclude<DialogState, { type: "closed" | "preview" | "details" }>): string {
  if (dialog.type === "new-folder") return "在当前位置创建一个新目录";
  if (dialog.type === "rename") return `正在修改“${dialog.item.name}”`;
  if (dialog.type === "move") return `为“${dialog.item.name}”选择新位置`;
  if (dialog.type === "trash") return `“${dialog.item.name}”可在回收站恢复`;
  return `即将彻底删除“${dialog.item.name}”`;
}

function dialogAction(dialog: Exclude<DialogState, { type: "closed" | "preview" | "details" }>): string {
  if (dialog.type === "new-folder") return "创建文件夹";
  if (dialog.type === "rename") return "保存名称";
  if (dialog.type === "move") return "确认移动";
  if (dialog.type === "trash") return "移入回收站";
  return "永久删除";
}
