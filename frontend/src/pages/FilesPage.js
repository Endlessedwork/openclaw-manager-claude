import React, { useEffect, useState, useCallback } from 'react';
import { getFileCategories, getFileTree, getFileContent, updateFileContent, getFileRaw } from '../lib/api';
import {
  Bot, Sparkles, Settings, Image, Brain, Key, FileCode, Globe,
  Layout, FolderOpen, ChevronRight, ChevronDown, Folder, File,
  ArrowLeft, Save, X, Pencil
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

const iconMap = {
  bot: Bot,
  sparkles: Sparkles,
  settings: Settings,
  image: Image,
  brain: Brain,
  key: Key,
  'file-code': FileCode,
  globe: Globe,
  layout: Layout,
  'folder-open': FolderOpen,
};

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function TreeNode({ node, selectedPath, onSelectFile, loadedDirs, onToggleDir }) {
  const [expanded, setExpanded] = useState(false);
  const children = loadedDirs[node.path] || [];
  const isSelected = selectedPath === node.path;

  const handleClick = () => {
    if (node.isDir) {
      const next = !expanded;
      setExpanded(next);
      if (next && !loadedDirs[node.path]) {
        onToggleDir(node.path);
      }
    } else {
      onSelectFile(node.path);
    }
  };

  const sortedChildren = [...children].sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <button
        data-testid={`tree-node-${node.path}`}
        onClick={handleClick}
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-md transition-colors text-left ${
          isSelected
            ? 'bg-orange-500/10 text-orange-400'
            : 'text-theme-muted hover:text-theme-primary hover:bg-muted'
        }`}
      >
        {node.isDir ? (
          expanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-theme-faint" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-theme-faint" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {node.isDir ? (
          <Folder className="w-4 h-4 shrink-0 text-orange-500/70" />
        ) : (
          <File className="w-4 h-4 shrink-0 text-theme-faint" />
        )}
        <span className="truncate font-mono text-xs">{node.name}</span>
        {node.isDir && children.length > 0 && (
          <span className="ml-auto text-[10px] text-theme-dimmed">{children.length}</span>
        )}
        {!node.isDir && node.size != null && (
          <span className="ml-auto text-[10px] text-theme-dimmed">{formatSize(node.size)}</span>
        )}
      </button>
      {node.isDir && expanded && (
        <div className="ml-3 border-l border-subtle pl-1">
          {sortedChildren.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              loadedDirs={loadedDirs}
              onToggleDir={onToggleDir}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FilesPage() {
  const [mode, setMode] = useState('overview'); // 'overview' | 'browse'
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(null);

  // Browse mode state
  const [treeNodes, setTreeNodes] = useState([]);
  const [loadedDirs, setLoadedDirs] = useState({});
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);

  // Image preview state
  const [imageUrl, setImageUrl] = useState(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  const { canEdit } = useAuth();

  const loadCategories = useCallback(async () => {
    try {
      const res = await getFileCategories();
      setCategories(res.data);
    } catch {
      toast.error('Failed to load file categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const enterCategory = async (category) => {
    setActiveCategory(category);
    setMode('browse');
    setTreeLoading(true);
    setSelectedPath(null);
    setFileData(null);
    setEditing(false);
    setLoadedDirs({});
    try {
      const res = await getFileTree(category.path);
      const sorted = [...res.data].sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });
      setTreeNodes(sorted);
    } catch {
      toast.error('Failed to load file tree');
    } finally {
      setTreeLoading(false);
    }
  };

  const loadDir = async (path) => {
    try {
      const res = await getFileTree(path);
      setLoadedDirs((prev) => ({ ...prev, [path]: res.data }));
    } catch {
      toast.error('Failed to load directory');
    }
  };

  const loadFile = async (path) => {
    setSelectedPath(path);
    setFileLoading(true);
    setEditing(false);
    if (imageUrl) { URL.revokeObjectURL(imageUrl); setImageUrl(null); }
    try {
      const res = await getFileContent(path);
      setFileData(res.data);
      if (res.data.isImage) {
        try {
          const blob = await getFileRaw(path);
          setImageUrl(URL.createObjectURL(blob.data));
        } catch { /* image preview not critical */ }
      }
    } catch {
      toast.error('Failed to load file');
      setFileData(null);
    } finally {
      setFileLoading(false);
    }
  };

  const startEdit = () => {
    setEditContent(fileData.content || '');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const saveFile = async () => {
    setSaving(true);
    try {
      await updateFileContent(fileData.path, editContent);
      toast.success('File saved successfully');
      setFileData({ ...fileData, content: editContent });
      setEditing(false);
    } catch {
      toast.error('Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    setMode('overview');
    setActiveCategory(null);
    setSelectedPath(null);
    setFileData(null);
    setEditing(false);
    if (imageUrl) { URL.revokeObjectURL(imageUrl); setImageUrl(null); }
  };

  // Breadcrumb parts
  const breadcrumbParts = [];
  if (activeCategory) {
    breadcrumbParts.push(activeCategory.name);
  }
  if (selectedPath && activeCategory) {
    const relative = selectedPath.replace(activeCategory.path + '/', '');
    if (relative !== selectedPath) {
      breadcrumbParts.push(relative);
    }
  }

  const isEditable = fileData && fileData.isText && canEdit();

  // Overview mode
  if (mode === 'overview') {
    return (
      <div data-testid="files-page" className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Files</h1>
          <p className="text-sm text-theme-faint mt-1">Browse and manage gateway configuration files</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div data-testid="category-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {categories.map((cat) => {
              const IconComp = iconMap[cat.icon] || FolderOpen;
              return (
                <button
                  key={cat.id}
                  data-testid={`category-card-${cat.id}`}
                  onClick={() => enterCategory(cat)}
                  className="bg-surface-card border border-subtle rounded-lg p-5 text-left hover:border-orange-500/30 transition-all group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                      <IconComp className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-theme-primary group-hover:text-orange-400 transition-colors" style={{ fontFamily: 'Manrope, sans-serif' }}>
                        {cat.name}
                      </h3>
                    </div>
                  </div>
                  <p className="text-xs text-theme-faint mb-3 line-clamp-2">{cat.description}</p>
                  <div className="flex items-center gap-3 text-[11px] text-theme-dimmed">
                    <span>{cat.fileCount} files</span>
                    <span className="text-theme-dimmed">|</span>
                    <span>{formatSize(cat.totalSize)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Browse mode
  return (
    <div data-testid="files-page" className="space-y-4 h-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Button
          data-testid="files-back-btn"
          variant="ghost"
          size="sm"
          onClick={goBack}
          className="text-theme-muted hover:text-theme-primary hover:bg-muted -ml-2"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Files
        </Button>
        {breadcrumbParts.map((part, i) => (
          <React.Fragment key={i}>
            <ChevronRight className="w-3.5 h-3.5 text-theme-dimmed" />
            {i === 0 ? (
              <button
                onClick={() => { setSelectedPath(null); setFileData(null); setEditing(false); }}
                className={`text-sm font-mono transition-colors ${selectedPath ? 'text-theme-faint hover:text-orange-400 cursor-pointer' : 'text-theme-secondary'}`}
              >
                {part}
              </button>
            ) : (
              <span className="text-sm text-theme-secondary font-mono">{part}</span>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Split view */}
      <div className="flex gap-4" style={{ minHeight: 'calc(100vh - 180px)' }}>
        {/* Left panel - tree */}
        <div
          data-testid="file-tree-panel"
          className="w-72 shrink-0 bg-surface-card border border-subtle rounded-lg overflow-hidden flex flex-col"
        >
          <div className="px-3 py-2.5 border-b border-subtle">
            <h2 className="text-xs font-semibold text-theme-muted uppercase tracking-wider" style={{ fontFamily: 'Manrope, sans-serif' }}>
              {activeCategory?.name || 'Files'}
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {treeLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : treeNodes.length === 0 ? (
              <p className="text-xs text-theme-dimmed text-center py-8">No files found</p>
            ) : (
              treeNodes.map((node) => (
                <TreeNode
                  key={node.path}
                  node={node}
                  selectedPath={selectedPath}
                  onSelectFile={loadFile}
                  loadedDirs={loadedDirs}
                  onToggleDir={loadDir}
                />
              ))
            )}
          </div>
        </div>

        {/* Right panel - content viewer */}
        <div
          data-testid="file-content-panel"
          className="flex-1 bg-surface-card border border-subtle rounded-lg overflow-hidden flex flex-col"
        >
          {fileLoading ? (
            <div className="flex justify-center items-center flex-1">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !fileData ? (
            <div className="flex flex-col items-center justify-center flex-1 text-theme-dimmed">
              <File className="w-12 h-12 mb-3 text-theme-dimmed" />
              <p className="text-sm">Select a file to view</p>
            </div>
          ) : (
            <>
              {/* File header */}
              <div className="px-4 py-3 border-b border-subtle flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-theme-primary font-mono">{fileData.name}</h3>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-theme-faint">
                    <span>{formatSize(fileData.size)}</span>
                    {fileData.modified && (
                      <span>{new Date(fileData.modified * 1000).toLocaleString()}</span>
                    )}
                  </div>
                </div>
                {isEditable && !editing && (
                  <Button
                    data-testid="edit-file-btn"
                    variant="ghost"
                    size="sm"
                    onClick={startEdit}
                    className="text-theme-muted hover:text-orange-500 hover:bg-orange-500/10"
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                  </Button>
                )}
                {editing && (
                  <div className="flex items-center gap-2">
                    <Button
                      data-testid="cancel-edit-btn"
                      variant="ghost"
                      size="sm"
                      onClick={cancelEdit}
                      className="text-theme-muted hover:text-theme-primary hover:bg-muted"
                    >
                      <X className="w-3.5 h-3.5 mr-1" /> Cancel
                    </Button>
                    <Button
                      data-testid="save-file-btn"
                      size="sm"
                      onClick={saveFile}
                      disabled={saving}
                      className="bg-orange-600 hover:bg-orange-700 text-white"
                    >
                      <Save className="w-3.5 h-3.5 mr-1.5" /> {saving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                )}
              </div>

              {/* File content */}
              <div className="flex-1 overflow-auto p-4">
                {fileData.isText ? (
                  editing ? (
                    <textarea
                      data-testid="file-editor"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full h-full min-h-[400px] bg-surface-page border border-subtle rounded-md p-4 font-mono text-sm text-theme-secondary resize-none focus:outline-none focus:border-orange-500/50"
                      spellCheck={false}
                    />
                  ) : (
                    <pre
                      data-testid="file-content"
                      className="font-mono text-sm text-theme-secondary whitespace-pre-wrap break-words"
                    >
                      {fileData.content}
                    </pre>
                  )
                ) : fileData.isImage && imageUrl ? (
                  <div data-testid="image-preview" className="flex flex-col items-center justify-center p-4">
                    <img
                      src={imageUrl}
                      alt={fileData.name}
                      className="max-w-full max-h-[calc(100vh-300px)] rounded-lg border border-subtle object-contain"
                    />
                    <p className="text-xs text-theme-dimmed mt-3">{fileData.name} — {formatSize(fileData.size)}</p>
                  </div>
                ) : (
                  <div data-testid="binary-file-info" className="flex flex-col items-center justify-center py-12 text-theme-faint">
                    <File className="w-16 h-16 mb-4 text-theme-dimmed" />
                    <p className="text-sm font-medium text-theme-muted mb-2">{fileData.name}</p>
                    <p className="text-xs">{formatSize(fileData.size)}</p>
                    {fileData.modified && (
                      <p className="text-xs mt-1">{new Date(fileData.modified * 1000).toLocaleString()}</p>
                    )}
                    <p className="text-xs mt-3 text-theme-dimmed">{fileData.message || 'Binary file - preview not available'}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
