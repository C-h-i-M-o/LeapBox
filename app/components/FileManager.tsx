"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type MouseEvent,
} from "react";

import type { BreadcrumbEntry, PublicItem } from "@/lib/files-core";
import type { FileView, FolderOption, StorageSummary } from "@/lib/file-store";
import {
  MAX_ACTIVE_FILES,
  abortUploadSession,
  runWithConcurrency,
  uploadFileInParts,
  type UploadProgress,
} from "./upload-client";
import "./file-manager.css";

gsap.registerPlugin(useGSAP);

type LayoutMode = "list" | "grid";
type UploadState = "waiting" | "uploading" | "paused" | "success" | "error" | "cancelled";

type SelectedFile = {
  file: File;
  relativePath: string | null;
};

type UploadTask = SelectedFile & {
  id: string;
  parentId: string | null;
  progress: number;
  speedBytesPerSecond: number;
  remainingSeconds: number | null;
  state: UploadState;
  message: string;
  controller: AbortController;
  sessionId: string | null;
};

type ListingResponse = {
  items: PublicItem[];
  breadcrumb: BreadcrumbEntry[];
  validDirectory: boolean;
  nextCursor: string | null;
  notice: string | null;
};

type BootstrapResponse = ListingResponse & {
  folders: FolderOption[];
  storage: StorageSummary;
  upload: { maxBytes: number; maxLabel: string };
};

type DialogState =
  | { type: "closed" }
  | { type: "new-folder" }
  | { type: "rename"; item: PublicItem }
  | { type: "move"; item: PublicItem }
  | { type: "trash"; item: PublicItem; count: number }
  | { type: "permanent"; item: PublicItem }
  | { type: "preview"; item: PublicItem }
  | { type: "details"; item: PublicItem }
  | { type: "batch-move"; count: number }
  | { type: "batch-trash"; count: number; descendants: number }
  | { type: "batch-permanent"; count: number };

type FileManagerProps = {
  displayName: string;
  email: string;
};

type LoadOptions = {
  append?: boolean;
  cursor?: string | null;
  bootstrap?: boolean;
};

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
};

type FileSystemFileEntryLike = FileSystemEntryLike & {
  file(success: (file: File) => void, failure?: (error: DOMException) => void): void;
};

type FileSystemDirectoryReaderLike = {
  readEntries(
    success: (entries: FileSystemEntryLike[]) => void,
    failure?: (error: DOMException) => void,
  ): void;
};

type FileSystemDirectoryEntryLike = FileSystemEntryLike & {
  createReader(): FileSystemDirectoryReaderLike;
};

const NAV_ITEMS: Array<{ view: FileView; label: string; icon: string }> = [
  { view: "files", label: "我的文件", icon: "▰" },
  { view: "recent", label: "最近使用", icon: "◷" },
  { view: "favorites", label: "收藏", icon: "☆" },
  { view: "trash", label: "回收站", icon: "⌫" },
];

const DEFAULT_LIMIT = 5 * 1024 * 1024 * 1024;
const FOLDER_INPUT_ATTRIBUTES = { webkitdirectory: "", directory: "" };

export function FileManager({ displayName, email }: FileManagerProps) {
  const shellRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const didBootstrapRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const lastSelectedIndexRef = useRef<number | null>(null);
  const cancelledUploadsRef = useRef(new Set<string>());

  const [view, setView] = useState<FileView>("files");
  const [parentId, setParentId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState("updated");
  const [direction, setDirection] = useState("desc");
  const [layout, setLayout] = useState<LayoutMode>("list");
  const [items, setItems] = useState<PublicItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
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
  const [uploadLimitLabel, setUploadLimitLabel] = useState("5 GB");
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [dialog, setDialog] = useState<DialogState>({ type: "closed" });
  const [dialogValue, setDialogValue] = useState("");
  const [moveParentId, setMoveParentId] = useState("");
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async (signal?: AbortSignal, options: LoadOptions = {}) => {
    const sequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = sequence;
    if (options.append) setLoadingMore(true);
    else if (!didBootstrapRef.current) setLoading(true);
    else setRefreshing(true);
    try {
      const params = new URLSearchParams({ view, sort, direction });
      if (parentId) params.set("parentId", parentId);
      if (view === "search") params.set("query", searchTerm);
      if (options.cursor) params.set("cursor", options.cursor);
      const useBootstrap = options.bootstrap === true || !didBootstrapRef.current;
      const response = await fetch((useBootstrap ? "/api/bootstrap?" : "/api/items?") + params.toString(), {
        signal,
        cache: "no-store",
      });
      const data = await readResponse<ListingResponse | BootstrapResponse>(response);
      if (signal?.aborted || sequence !== requestSequenceRef.current) return;
      setItems((current) => options.append ? [...current, ...data.items] : data.items);
      setNextCursor(data.nextCursor);
      setBreadcrumb(data.breadcrumb);
      if ("storage" in data) {
        setFolders(data.folders);
        setStorage(data.storage);
        setUploadLimit(data.upload.maxBytes);
        setUploadLimitLabel(data.upload.maxLabel);
        didBootstrapRef.current = true;
      }
      if (!data.validDirectory) {
        setParentId(null);
        window.history.replaceState(null, "", "/");
      }
      if (data.notice) setMessage(data.notice);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(errorMessage(error));
    } finally {
      if (!signal?.aborted && sequence === requestSequenceRef.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
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
      setSelectedIds(new Set());
      lastSelectedIndexRef.current = null;
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
      setSelectedIds(new Set());
      lastSelectedIndexRef.current = null;
      if (normalized) setView("search");
      else if (view === "search") setView("files");
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, view]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedIds(new Set());
        setDialog({ type: "closed" });
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>("[data-search-input]")?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const targets = gsap.utils
        .toArray<HTMLElement>(".file-row:not(.table-header), .file-card", shellRef.current)
        .slice(0, 12);
      if (targets.length > 0) {
        gsap.from(targets, {
          autoAlpha: 0,
          y: 8,
          duration: 0.24,
          stagger: 0.025,
          ease: "power2.out",
          clearProps: "transform,opacity,visibility",
        });
      }
      const batchToolbar = shellRef.current?.querySelector<HTMLElement>(".batch-toolbar");
      if (batchToolbar) {
        gsap.fromTo(
          batchToolbar,
          { autoAlpha: 0, y: 18 },
          { autoAlpha: 1, y: 0, duration: 0.24, ease: "power2.out" },
        );
      }
      const panels = shellRef.current?.querySelectorAll<HTMLElement>("[data-animate-panel]");
      if (panels && panels.length > 0) {
        gsap.fromTo(
          panels,
          { autoAlpha: 0, y: 10 },
          { autoAlpha: 1, y: 0, duration: 0.2, ease: "power2.out" },
        );
      }
    });
    media.add("(prefers-reduced-motion: reduce)", () => {
      const statePanels = shellRef.current?.querySelectorAll<HTMLElement>(
        ".batch-toolbar, [data-animate-panel]",
      );
      if (statePanels && statePanels.length > 0) gsap.set(statePanels, { autoAlpha: 1 });
    });
    return () => media.revert();
  }, { scope: shellRef, dependencies: [items, message, selectedIds.size, uploads.length] });

  function selectView(nextView: FileView) {
    setView(nextView);
    setSidebarOpen(false);
    setQuery("");
    clearSelection();
    if (nextView === "files") navigateFolder(null);
  }

  function navigateFolder(id: string | null) {
    setView("files");
    setParentId(id);
    setQuery("");
    clearSelection();
    window.history.pushState(null, "", id ? "/?folder=" + encodeURIComponent(id) : "/");
  }

  function setLayoutMode(nextLayout: LayoutMode) {
    setLayout(nextLayout);
    window.localStorage.setItem("yuexia-layout", nextLayout);
  }

  function handleSort(event: ChangeEvent<HTMLSelectElement>) {
    const [nextSort, nextDirection] = event.target.value.split(":");
    setSort(nextSort ?? "updated");
    setDirection(nextDirection ?? "desc");
    clearSelection();
  }

  function clearSelection() {
    setSelectedIds(new Set());
    lastSelectedIndexRef.current = null;
  }

  function openItem(item: PublicItem) {
    if (item.type === "folder") {
      navigateFolder(item.id);
      return;
    }
    setDialog({ type: item.previewKind === "details" ? "details" : "preview", item });
  }

  function toggleSelection(item: PublicItem, index: number, shiftKey: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (shiftKey && lastSelectedIndexRef.current !== null) {
        const start = Math.min(lastSelectedIndexRef.current, index);
        const end = Math.max(lastSelectedIndexRef.current, index);
        for (let currentIndex = start; currentIndex <= end; currentIndex += 1) {
          const currentItem = items[currentIndex];
          if (currentItem) next.add(currentItem.id);
        }
      } else if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
      lastSelectedIndexRef.current = index;
      return next;
    });
  }

  function selectCurrentPage() {
    setSelectedIds((current) =>
      current.size === items.length
        ? new Set()
        : new Set(items.map((item) => item.id)),
    );
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
        const response = await fetch("/api/folders/" + encodeURIComponent(item.id) + "/count");
        const data = await readResponse<{ total: number }>(response);
        count = data.total;
      } catch (error) {
        setMessage(errorMessage(error));
        return;
      }
    }
    setDialog({ type: "trash", item, count });
  }

  async function requestBatchTrash() {
    try {
      const preview = await mutate<{ selected: number; descendants: number; total: number }>(
        "/api/items/batch",
        "POST",
        { action: "trash-preview", ids: [...selectedIds] },
      );
      setDialog({
        type: "batch-trash",
        count: preview.total,
        descendants: preview.descendants,
      });
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function submitDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (dialog.type === "new-folder") {
        await mutate("/api/folders", "POST", { name: dialogValue, parentId });
        setMessage("已新建文件夹“" + dialogValue.trim() + "”");
      } else if (dialog.type === "rename") {
        await mutate("/api/items/" + encodeURIComponent(dialog.item.id), "PATCH", {
          action: "rename",
          name: dialogValue,
        });
        setItems((current) => current.map((item) =>
          item.id === dialog.item.id ? { ...item, name: dialogValue.trim() } : item,
        ));
        setMessage("名称已更新");
      } else if (dialog.type === "move") {
        await mutate("/api/items/" + encodeURIComponent(dialog.item.id), "PATCH", {
          action: "move",
          parentId: moveParentId || null,
        });
        setItems((current) => current.filter((item) => item.id !== dialog.item.id));
        setMessage("项目已移动");
      } else if (dialog.type === "trash") {
        await mutate("/api/items/" + encodeURIComponent(dialog.item.id) + "/trash", "POST", {
          ...(dialog.count > 0 ? { confirmedCount: dialog.count } : {}),
        });
        setItems((current) => current.filter((item) => item.id !== dialog.item.id));
        setMessage("项目已移入回收站");
      } else if (dialog.type === "permanent") {
        await mutate("/api/items/" + encodeURIComponent(dialog.item.id), "DELETE");
        setItems((current) => current.filter((item) => item.id !== dialog.item.id));
        setMessage("项目已永久删除");
      } else if (dialog.type === "batch-move") {
        await runBatch({ action: "move", parentId: moveParentId || null }, "所选项目已移动");
      } else if (dialog.type === "batch-trash") {
        await runBatch(
          { action: "trash", confirmedDescendantCount: dialog.descendants },
          "所选项目已移入回收站",
        );
      } else if (dialog.type === "batch-permanent") {
        await runBatch({ action: "delete" }, "所选项目已永久删除");
      }
      setDialog({ type: "closed" });
      setDialogValue("");
      void loadData(undefined);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function runBatch(body: Record<string, unknown>, successMessage: string) {
    const ids = [...selectedIds];
    await mutate("/api/items/batch", "POST", { ...body, ids });
    if (body.action === "favorite") {
      setItems((current) => current.map((item) =>
        selectedIds.has(item.id) ? { ...item, isFavorite: body.favorite === true } : item,
      ));
    } else {
      setItems((current) => current.filter((item) => !selectedIds.has(item.id)));
    }
    setSelectedIds(new Set());
    setMessage(successMessage);
  }

  async function executeBatch(body: Record<string, unknown>, successMessage: string) {
    try {
      await runBatch(body, successMessage);
      void loadData(undefined);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function toggleFavorite(item: PublicItem) {
    const favorite = !item.isFavorite;
    setItems((current) => current.map((entry) =>
      entry.id === item.id ? { ...entry, isFavorite: favorite } : entry,
    ));
    try {
      await mutate("/api/items/" + encodeURIComponent(item.id), "PATCH", {
        action: "favorite",
        favorite,
      });
    } catch (error) {
      setItems((current) => current.map((entry) =>
        entry.id === item.id ? { ...entry, isFavorite: !favorite } : entry,
      ));
      setMessage(errorMessage(error));
    }
  }

  async function restoreItem(item: PublicItem) {
    try {
      await mutate("/api/items/" + encodeURIComponent(item.id) + "/restore", "POST", {});
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setMessage("项目已恢复");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  function chooseFiles() {
    fileInputRef.current?.click();
  }

  function chooseFolder() {
    folderInputRef.current?.click();
  }

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []).map((file) => ({
      file,
      relativePath: file.webkitRelativePath || null,
    }));
    if (selected.length > 0) {
      void uploadFiles(selected).catch((error) => setMessage(errorMessage(error)));
    }
    event.target.value = "";
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (view !== "files") return;
    try {
      const selected = await collectDroppedFiles(event.dataTransfer);
      if (selected.length > 0) await uploadFiles(selected);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function uploadFiles(filesToUpload: SelectedFile[]) {
    const accepted = filesToUpload.filter(({ file }) => {
      if (file.size <= 0) {
        setMessage("已忽略空文件“" + file.name + "”");
        return false;
      }
      if (file.size > uploadLimit) {
        setMessage("“" + file.name + "”超过 " + uploadLimitLabel + " 上限");
        return false;
      }
      return true;
    });
    if (accepted.length === 0) return;

    let folderMapping: Record<string, string> = {};
    const directoryPaths = [...new Set(accepted.flatMap(({ relativePath }) => {
      if (!relativePath || !relativePath.includes("/")) return [];
      return [relativePath.split("/").slice(0, -1).join("/")];
    }))];
    if (directoryPaths.length > 0) {
      const response = await mutate<{ mapping: Record<string, string> }>(
        "/api/folder-trees",
        "POST",
        { parentId, paths: directoryPaths },
      );
      folderMapping = response.mapping;
    }

    const tasks = accepted.map<UploadTask>(({ file, relativePath }) => {
      const directoryPath = relativePath?.includes("/")
        ? relativePath.split("/").slice(0, -1).join("/")
        : "";
      return {
        id: crypto.randomUUID(),
        file,
        relativePath,
        parentId: directoryPath ? folderMapping[directoryPath] ?? parentId : parentId,
        progress: 0,
        speedBytesPerSecond: 0,
        remainingSeconds: null,
        state: "waiting",
        message: "等待上传",
        controller: new AbortController(),
        sessionId: null,
      };
    });
    setUploads((current) => [...tasks, ...current].slice(0, 40));
    await runWithConcurrency(tasks, MAX_ACTIVE_FILES, startUpload);
    await loadData(undefined, { bootstrap: true });
  }

  async function startUpload(task: UploadTask): Promise<void> {
    updateUpload(task.id, { state: "uploading", message: "正在分片上传" });
    try {
      await uploadFileInParts({
        file: task.file,
        parentId: task.parentId,
        relativePath: task.relativePath,
        signal: task.controller.signal,
        onSession: (sessionId) => updateUpload(task.id, { sessionId }),
        onProgress: (progress) => updateUploadProgress(task.id, progress),
      });
      updateUpload(task.id, {
        state: "success",
        progress: 100,
        speedBytesPerSecond: 0,
        remainingSeconds: 0,
        message: "上传完成",
      });
    } catch (error) {
      if (task.controller.signal.aborted && !cancelledUploadsRef.current.has(task.id)) {
        updateUpload(task.id, { state: "paused", message: "已暂停，可继续上传" });
      } else if (!cancelledUploadsRef.current.has(task.id)) {
        updateUpload(task.id, { state: "error", message: errorMessage(error) });
      }
    }
  }

  function pauseUpload(task: UploadTask) {
    task.controller.abort(new DOMException("已暂停", "AbortError"));
  }

  function resumeUpload(task: UploadTask) {
    const controller = new AbortController();
    const resumed = { ...task, controller, state: "waiting" as const };
    setUploads((current) => current.map((entry) => entry.id === task.id ? resumed : entry));
    void startUpload(resumed);
  }

  async function cancelUpload(task: UploadTask) {
    cancelledUploadsRef.current.add(task.id);
    task.controller.abort(new DOMException("已取消", "AbortError"));
    if (task.sessionId) await abortUploadSession(task.sessionId).catch(() => undefined);
    updateUpload(task.id, { state: "cancelled", message: "已取消" });
  }

  function updateUploadProgress(taskId: string, progress: UploadProgress) {
    updateUpload(taskId, {
      progress: progress.progress,
      speedBytesPerSecond: progress.speedBytesPerSecond,
      remainingSeconds: progress.remainingSeconds,
      message: progress.remainingSeconds === null
        ? "正在上传"
        : "预计剩余 " + formatDuration(progress.remainingSeconds),
    });
  }

  function updateUpload(taskId: string, update: Partial<UploadTask>) {
    setUploads((current) =>
      current.map((task) => task.id === taskId ? { ...task, ...update } : task),
    );
  }

  const pageTitle = view === "search"
    ? "搜索“" + searchTerm + "”"
    : NAV_ITEMS.find((item) => item.view === view)?.label ?? "我的文件";

  const itemActions: ItemActions = {
    items,
    trashView: view === "trash",
    selectedIds,
    onOpen: openItem,
    onFavorite: toggleFavorite,
    onRename: openRename,
    onMove: openMove,
    onTrash: requestTrash,
    onRestore: restoreItem,
    onPermanent: (item) => setDialog({ type: "permanent", item }),
    onSelect: toggleSelection,
    onSelectAll: selectCurrentPage,
  };

  return (
    <main className="drive-shell" ref={shellRef}>
      <a className="skip-link" href="#file-area">跳到文件区域</a>
      <aside className={"sidebar " + (sidebarOpen ? "sidebar-open" : "")} aria-label="文件导航">
        <div className="brand">
          <Image className="brand-mark" src="/leapbox-logo.png" alt="" width={42} height={42} priority />
          <div><strong>跃匣 <em>LeapBox</em></strong><span>PRIVATE FILES</span></div>
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
          <small>单文件最高 {uploadLimitLabel} · 实际总额度由 Sites 套餐决定</small>
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
              data-search-input
              aria-label="搜索文件"
              type="search"
              placeholder="搜索文件"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <kbd>⌘ K</kbd>
          </div>
          <div className="top-actions">
            <button type="button" className="secondary-button new-folder-button" onClick={() => { setDialogValue(""); setDialog({ type: "new-folder" }); }} disabled={view !== "files"}>＋ 新建文件夹</button>
            <div className="upload-actions">
              <button type="button" className="primary-button" onClick={chooseFiles} disabled={view !== "files"}>↑ <span className="desktop-upload-label">上传文件</span><span className="mobile-upload-label">上传</span></button>
              <button type="button" className="secondary-button folder-upload-button" aria-label="上传文件夹" onClick={chooseFolder} disabled={view !== "files"}><span className="folder-upload-icon" aria-hidden="true">▣</span><span className="folder-upload-label">上传文件夹</span></button>
            </div>
            <input ref={fileInputRef} className="visually-hidden" type="file" multiple onChange={handleFileSelection} />
            <input ref={folderInputRef} className="visually-hidden" type="file" multiple {...FOLDER_INPUT_ATTRIBUTES} onChange={handleFileSelection} />
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
              <p>{loading ? "正在读取…" : items.length + " 个项目"}</p>
            </div>
            <div className="view-tools">
              {refreshing && <span className="refresh-indicator" role="status">正在更新</span>}
              <label className="sort-control"><span className="mobile-sort-label" aria-hidden="true">排序</span><span className="visually-hidden">排序方式</span>
                <select value={sort + ":" + direction} onChange={handleSort}>
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
            className={"drop-zone " + (dragActive ? "drop-active" : "")}
            onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false); }}
            onDrop={(event) => void handleDrop(event)}
          >
            {dragActive && <div className="drop-message">松开即可上传文件或文件夹到当前位置</div>}
            {loading ? (
              <div className="loading-state" role="status"><span /><p>正在整理你的文件匣</p></div>
            ) : items.length === 0 ? (
              <div className="empty-state">
                <div className="empty-box" aria-hidden="true"><span /></div>
                <h2>{emptyTitle(view)}</h2>
                <p>{emptyDescription(view)}</p>
                {view === "files" && <div className="empty-actions"><button type="button" className="primary-button" onClick={chooseFiles}>上传文件</button><button type="button" className="secondary-button" onClick={chooseFolder}>上传文件夹</button></div>}
              </div>
            ) : layout === "list" ? (
              <FileList {...itemActions} />
            ) : (
              <FileGrid {...itemActions} />
            )}
            {nextCursor && !loading && (
              <div className="load-more">
                <button type="button" className="secondary-button" disabled={loadingMore} onClick={() => void loadData(undefined, { append: true, cursor: nextCursor })}>{loadingMore ? "正在加载…" : "加载更多"}</button>
              </div>
            )}
          </div>
        </div>
      </section>

      {selectedIds.size > 0 && (
        <section className="batch-toolbar" aria-label="批量操作">
          <strong>已选择 {selectedIds.size} 项</strong>
          {view === "trash" ? (
            <>
              <button type="button" onClick={() => void executeBatch({ action: "restore" }, "所选项目已恢复")}>恢复</button>
              <button type="button" className="danger-link" onClick={() => setDialog({ type: "batch-permanent", count: selectedIds.size })}>永久删除</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => void executeBatch({ action: "favorite", favorite: true }, "所选项目已收藏")}>收藏</button>
              <button type="button" onClick={() => { setMoveParentId(""); setDialog({ type: "batch-move", count: selectedIds.size }); }}>移动</button>
              <button type="button" className="danger-link" onClick={() => void requestBatchTrash()}>移入回收站</button>
            </>
          )}
          <button type="button" className="batch-close" aria-label="清空选择" onClick={() => setSelectedIds(new Set())}>×</button>
        </section>
      )}

      {uploads.length > 0 && (
        <section className="upload-panel" aria-label="上传中心" data-animate-panel>
          <header><strong>上传中心</strong><span>{uploads.filter((task) => task.state === "uploading").length} 个进行中</span><button type="button" aria-label="清除已完成任务" onClick={() => setUploads((current) => current.filter((task) => task.state === "uploading" || task.state === "waiting" || task.state === "paused"))}>×</button></header>
          {uploads.slice(0, 6).map((task) => (
            <div className="upload-task" key={task.id}>
              <span className={"upload-status " + task.state} aria-hidden="true">{task.state === "success" ? "✓" : task.state === "error" ? "!" : task.state === "paused" ? "Ⅱ" : "↑"}</span>
              <div>
                <strong>{task.relativePath || task.file.name}</strong>
                <small>{formatBytes(task.file.size)} · {task.message}{task.speedBytesPerSecond > 0 ? " · " + formatBytes(task.speedBytesPerSecond) + "/s" : ""}</small>
                <span className="progress"><i style={{ transform: "scaleX(" + task.progress / 100 + ")" }} /></span>
              </div>
              <div className="upload-task-actions">
                <b>{task.progress}%</b>
                {task.state === "uploading" && <button type="button" onClick={() => pauseUpload(task)}>暂停</button>}
                {(task.state === "paused" || task.state === "error") && <button type="button" onClick={() => resumeUpload(task)}>继续</button>}
                {(task.state === "uploading" || task.state === "paused" || task.state === "error") && <button type="button" className="danger-link" onClick={() => void cancelUpload(task)}>取消</button>}
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="toast" aria-live="polite" aria-atomic="true">{message && <span data-animate-panel>{message}<button type="button" aria-label="关闭提示" onClick={() => setMessage("")}>×</button></span>}</div>

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
  selectedIds: Set<string>;
  onOpen(item: PublicItem): void;
  onFavorite(item: PublicItem): void;
  onRename(item: PublicItem): void;
  onMove(item: PublicItem): void;
  onTrash(item: PublicItem): void;
  onRestore(item: PublicItem): void;
  onPermanent(item: PublicItem): void;
  onSelect(item: PublicItem, index: number, shiftKey: boolean): void;
  onSelectAll(): void;
};

function FileList(props: ItemActions) {
  return (
    <div className="file-table" role="table" aria-label="文件列表">
      <div className="file-row table-header" role="row">
        <span role="columnheader"><input type="checkbox" aria-label="选择当前页全部项目" checked={props.items.length > 0 && props.selectedIds.size === props.items.length} onChange={props.onSelectAll} /></span>
        <span role="columnheader">名称</span><span role="columnheader">类型</span><span role="columnheader">大小</span><span role="columnheader">更新时间</span><span role="columnheader">操作</span>
      </div>
      {props.items.map((item, index) => (
        <div className={"file-row " + (props.selectedIds.has(item.id) ? "selected-item" : "")} role="row" key={item.id}>
          <span className="selection-cell" role="cell"><input type="checkbox" aria-label={"选择 " + item.name} checked={props.selectedIds.has(item.id)} onClick={(event: MouseEvent<HTMLInputElement>) => props.onSelect(item, index, event.shiftKey)} onChange={() => undefined} /></span>
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
      {props.items.map((item, index) => (
        <article className={"file-card " + (props.selectedIds.has(item.id) ? "selected-item" : "")} key={item.id}>
          <header>
            <input type="checkbox" aria-label={"选择 " + item.name} checked={props.selectedIds.has(item.id)} onClick={(event: MouseEvent<HTMLInputElement>) => props.onSelect(item, index, event.shiftKey)} onChange={() => undefined} />
            <FileIcon item={item} large />
            <button type="button" className="favorite-button" aria-label={item.isFavorite ? "取消收藏" : "收藏"} onClick={() => props.onFavorite(item)} disabled={props.trashView}>{item.isFavorite ? "★" : "☆"}</button>
          </header>
          <button type="button" className="card-name" onClick={() => props.onOpen(item)}>{item.name}</button>
          <p>{item.type === "folder" ? typeLabel(item) : typeLabel(item) + " · " + formatBytes(item.sizeBytes)}</p>
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
      {!props.compact && <button type="button" aria-label={item.isFavorite ? "取消收藏 " + item.name : "收藏 " + item.name} onClick={() => props.onFavorite(item)}>{item.isFavorite ? "★" : "☆"}</button>}
      {item.type === "file" && <a href={"/api/items/" + encodeURIComponent(item.id) + "/content?mode=download"} download aria-label={"下载 " + item.name}>↓</a>}
      <button type="button" aria-label={"重命名 " + item.name} onClick={() => props.onRename(item)}>改名</button>
      <button type="button" aria-label={"移动 " + item.name} onClick={() => props.onMove(item)}>移动</button>
      <button type="button" className="danger-link" aria-label={"删除 " + item.name} onClick={() => props.onTrash(item)}>删除</button>
    </div>
  );
}

function FileIcon({ item, large = false }: { item: PublicItem; large?: boolean }) {
  const label = item.type === "folder" ? "文件夹" : typeLabel(item);
  return <span className={"file-icon " + item.type + " " + (large ? "large" : "")} aria-label={label}><i />{item.type === "folder" ? "" : fileGlyph(item)}</span>;
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
        <div className="modal-card" data-animate-panel>
          <header><div><FileIcon item={item} /><span><strong id="preview-title">{item.name}</strong><small>{typeLabel(item)} · {formatBytes(item.sizeBytes)}</small></span></div><button type="button" aria-label="关闭预览" onClick={props.onClose}>×</button></header>
          {dialog.type === "preview" ? (
            <iframe title={"预览 " + item.name} src={"/api/items/" + encodeURIComponent(item.id) + "/content?mode=preview"} />
          ) : (
            <div className="details-panel"><FileIcon item={item} large /><h2>此格式暂不支持站内预览</h2><p>文件内容不会被执行或解压。你可以安全地查看详情，或下载到本地后打开。</p><dl><div><dt>文件名</dt><dd>{item.name}</dd></div><div><dt>类型</dt><dd>{item.mimeType ?? "未知"}</dd></div><div><dt>大小</dt><dd>{formatBytes(item.sizeBytes)}</dd></div><div><dt>更新时间</dt><dd>{formatDate(item.updatedAt)}</dd></div></dl></div>
          )}
          <footer><button type="button" className="secondary-button" onClick={props.onClose}>关闭</button><a className="primary-button" href={"/api/items/" + encodeURIComponent(item.id) + "/content?mode=download"} download>下载文件</a></footer>
        </div>
      </dialog>
    );
  }

  const isDanger = dialog.type === "permanent" || dialog.type === "batch-permanent";
  return (
    <dialog open className="modal" aria-labelledby="dialog-title">
      <form className="modal-card compact-modal" data-animate-panel onSubmit={props.onSubmit}>
        <header><div><span className={isDanger ? "modal-danger-icon" : "modal-icon"} aria-hidden="true">{isDanger ? "!" : "↗"}</span><span><strong id="dialog-title">{dialogTitle(dialog)}</strong><small>{dialogSubtitle(dialog)}</small></span></div><button type="button" aria-label="关闭对话框" onClick={props.onClose}>×</button></header>
        {(dialog.type === "new-folder" || dialog.type === "rename") && (
          <label className="field-label">名称<input required maxLength={180} value={props.value} onChange={(event) => props.onValueChange(event.target.value)} placeholder={dialog.type === "new-folder" ? "例如：旅行资料" : undefined} /></label>
        )}
        {(dialog.type === "move" || dialog.type === "batch-move") && (
          <label className="field-label">移动到<select value={props.moveParentId} onChange={(event) => props.onMoveParentChange(event.target.value)}><option value="">我的文件（根目录）</option>{props.folders.filter((folder) => dialog.type !== "move" || folder.id !== dialog.item.id).map((folder) => <option key={folder.id} value={folder.id}>{folder.location} / {folder.name}</option>)}</select></label>
        )}
        {dialog.type === "trash" && dialog.count > 0 && <div className="warning-box"><strong>此文件夹中包含 {dialog.count} 个项目</strong><p>确认后，这些项目会一起进入回收站，之后仍可恢复。</p></div>}
        {dialog.type === "batch-trash" && <div className="warning-box"><strong>共影响 {dialog.count} 个项目</strong><p>其中包含 {dialog.descendants} 个文件夹后代。整批操作会一起成功或一起失败。</p></div>}
        {dialog.type === "permanent" && <div className="danger-box"><strong>此操作无法撤销</strong><p>“{dialog.item.name}”及其中内容会从存储中彻底清除。</p></div>}
        {dialog.type === "batch-permanent" && <div className="danger-box"><strong>将永久删除 {dialog.count} 个所选项目</strong><p>其中的目录内容也会一并清除，之后无法下载或恢复。</p></div>}
        <footer><button type="button" className="secondary-button" onClick={props.onClose}>取消</button><button type="submit" disabled={props.busy} className={isDanger ? "danger-button" : "primary-button"}>{props.busy ? "正在处理…" : dialogAction(dialog)}</button></footer>
      </form>
    </dialog>
  );
}

async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<SelectedFile[]> {
  const entries = Array.from(dataTransfer.items).flatMap((item) => {
    const entry = (item as DataTransferItem & {
      webkitGetAsEntry?: () => FileSystemEntryLike | null;
    }).webkitGetAsEntry?.();
    return entry ? [entry] : [];
  });
  if (entries.length === 0) {
    return Array.from(dataTransfer.files).map((file) => ({ file, relativePath: null }));
  }
  const nested = await Promise.all(entries.map((entry) => walkEntry(entry, "")));
  return nested.flat();
}

async function walkEntry(entry: FileSystemEntryLike, parentPath: string): Promise<SelectedFile[]> {
  const relativePath = parentPath ? parentPath + "/" + entry.name : entry.name;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntryLike).file(resolve, reject);
    });
    return [{ file, relativePath }];
  }
  if (!entry.isDirectory) return [];
  const reader = (entry as FileSystemDirectoryEntryLike).createReader();
  const children: FileSystemEntryLike[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) break;
    children.push(...batch);
  }
  const nested = await Promise.all(children.map((child) => walkEntry(child, relativePath)));
  return nested.flat();
}

async function mutate<T = unknown>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return undefined as T;
  return readResponse<T>(response);
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return (value >= 10 ? value.toFixed(0) : value.toFixed(1)) + " " + units[index];
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 1) return "不到 1 秒";
  if (seconds < 60) return Math.ceil(seconds) + " 秒";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return minutes + " 分钟";
  return Math.ceil(minutes / 60) + " 小时";
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
  return "拖放文件或完整文件夹到这里，支持单文件最高 5 GB。";
}

type ActionDialog = Exclude<DialogState, { type: "closed" | "preview" | "details" }>;

function dialogTitle(dialog: ActionDialog): string {
  if (dialog.type === "new-folder") return "新建文件夹";
  if (dialog.type === "rename") return "重命名";
  if (dialog.type === "move") return "移动项目";
  if (dialog.type === "trash") return "移入回收站";
  if (dialog.type === "permanent") return "永久删除";
  if (dialog.type === "batch-move") return "批量移动";
  if (dialog.type === "batch-trash") return "批量移入回收站";
  return "批量永久删除";
}

function dialogSubtitle(dialog: ActionDialog): string {
  if (dialog.type === "new-folder") return "在当前位置创建一个新目录";
  if (dialog.type === "rename") return "正在修改“" + dialog.item.name + "”";
  if (dialog.type === "move") return "为“" + dialog.item.name + "”选择新位置";
  if (dialog.type === "trash") return "“" + dialog.item.name + "”可在回收站恢复";
  if (dialog.type === "permanent") return "即将彻底删除“" + dialog.item.name + "”";
  return "本次将统一处理 " + dialog.count + " 个所选项目";
}

function dialogAction(dialog: ActionDialog): string {
  if (dialog.type === "new-folder") return "创建文件夹";
  if (dialog.type === "rename") return "保存名称";
  if (dialog.type === "move" || dialog.type === "batch-move") return "确认移动";
  if (dialog.type === "trash" || dialog.type === "batch-trash") return "移入回收站";
  return "永久删除";
}
