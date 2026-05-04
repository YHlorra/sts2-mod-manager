import React, { useState, useEffect } from 'react';
import { X, ToggleLeft, ToggleRight, Trash2, AlertTriangle, FileText, Box, Code, Languages, ExternalLink, Shield, Gamepad2, Palette, Pencil, Plus } from 'lucide-react';

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDateTime(ms) {
  if (!ms) return null;
  const d = new Date(ms);
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function isChinese(text) {
  if (!text) return false;
  return /[\u4e00-\u9fff]/.test(text);
}

function getModCategory(mod, allMods) {
  const isDepForOthers = allMods.some(m => m.id !== mod.id && m.dependencies && m.dependencies.includes(mod.id));
  if (isDepForOthers) return { label: '框架前置', color: 'bg-indigo-50 text-indigo-600', icon: Shield };
  if (mod.affects_gameplay || mod.has_dll) return { label: '玩法改动', color: 'bg-amber-50 text-amber-700', icon: Gamepad2 };
  return { label: '资源类', color: 'bg-teal-50 text-teal-600', icon: Palette };
}

export default function ModDetail({ mod, allMods, onClose, onToggle, onUninstall, onSelectMod, onTranslationSaved }) {
  const enabledIds = allMods.filter(m => m.enabled).map(m => m.id);
  const missingDeps = (mod.dependencies || []).filter(d => !enabledIds.includes(d));
  const dependents = allMods.filter(m => m.dependencies && m.dependencies.includes(mod.id) && m.enabled);
  const category = getModCategory(mod, allMods);
  const CategoryIcon = category.icon;

  const [translatedDesc, setTranslatedDesc] = useState(null);
  const [translatedName, setTranslatedName] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState(null);

  const [nexusUrl, setNexusUrl] = useState(null);
  const [urlEditMode, setUrlEditMode] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState('');
  const [urlWarning, setUrlWarning] = useState(null);

  const [displayNameValue, setDisplayNameValue] = useState(null);
  const [displayNameEditMode, setDisplayNameEditMode] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState('');

  // Load saved translations when mod changes
  useEffect(() => {
    setTranslateError(null);
    if (window.api.loadTranslations) {
      window.api.loadTranslations().then(saved => {
        const t = saved[mod.id];
        if (t) {
          setTranslatedName(t.name || null);
          setTranslatedDesc(t.desc || null);
        } else {
          setTranslatedName(null);
          setTranslatedDesc(null);
        }
        // Load display name from _mod_display_names
        const dn = saved._mod_display_names?.[mod.instanceKey] || saved._mod_display_names?.[mod.id] || null;
        setDisplayNameValue(dn);
        setDisplayNameInput(dn || '');
      }).catch(() => {
        setTranslatedName(null);
        setTranslatedDesc(null);
        setDisplayNameValue(null);
        setDisplayNameInput('');
      });
    } else {
      setTranslatedName(null);
      setTranslatedDesc(null);
      setDisplayNameValue(null);
      setDisplayNameInput('');
    }
  }, [mod.id, mod.instanceKey]);

  // Load saved URL
  useEffect(() => {
    setUrlEditMode(false);
    setUrlWarning(null);
    if (window.api.loadTranslations) {
      window.api.loadTranslations().then(saved => {
        const url = saved._nexus_urls?.[mod.id]?.url || null;
        setNexusUrl(url);
        setUrlInputValue(url || '');
      }).catch(() => {
        setNexusUrl(null);
        setUrlInputValue('');
      });
    }
  }, [mod.id, mod.instanceKey]);

  const handleTranslate = async () => {
    setTranslating(true);
    setTranslateError(null);
    try {
      const descText = mod.description || '';
      const nameText = mod.name || '';
      const results = await Promise.all([
        !isChinese(descText) && descText ? window.api.translateText(descText) : null,
        !isChinese(nameText) && nameText ? window.api.translateText(nameText) : null,
      ]);
      let newName = translatedName, newDesc = translatedDesc;
      if (results[0]?.success) { newDesc = results[0].translated; setTranslatedDesc(newDesc); }
      if (results[1]?.success) { newName = results[1].translated; setTranslatedName(newName); }
      if (results[0] && !results[0].success) setTranslateError(results[0].error);
      // Persist
      if (window.api.saveTranslations && (newName || newDesc)) {
        const saved = await window.api.loadTranslations();
        saved[mod.id] = { name: newName, desc: newDesc };
        await window.api.saveTranslations(saved);
        if (onTranslationSaved) onTranslationSaved();
      }
    } catch (e) {
      setTranslateError(e.message);
    }
    setTranslating(false);
  };

  const handleUrlSave = async () => {
    setUrlEditMode(false);
    const trimmed = urlInputValue.trim();

    // Validate format (warn only, do not reject)
    if (trimmed && !trimmed.match(/^https?:\/\//)) {
      setUrlWarning('链接格式异常，可能无法正常打开');
    } else {
      setUrlWarning(null);
    }

    if (trimmed !== nexusUrl) {
      try {
        const saved = await window.api.loadTranslations();
        if (!saved._nexus_urls) saved._nexus_urls = {};
        saved._nexus_urls[mod.id] = { url: trimmed };
        await window.api.saveTranslations(saved);
        setNexusUrl(trimmed);
      } catch (e) {
        console.error('Failed to save URL:', e);
      }
    }
  };

  const handleDisplayNameSave = async () => {
    setDisplayNameEditMode(false);
    const trimmed = displayNameInput.trim();

    if (trimmed !== displayNameValue) {
      try {
        const saved = await window.api.loadTranslations();
        if (!saved._mod_display_names) saved._mod_display_names = {};
        if (trimmed) {
          saved._mod_display_names[mod.instanceKey] = trimmed;
        } else {
          delete saved._mod_display_names[mod.instanceKey];
        }
        await window.api.saveTranslations(saved);
        setDisplayNameValue(trimmed || null);
        if (onTranslationSaved) onTranslationSaved();
      } catch (e) {
        console.error('Failed to save display name:', e);
      }
    }
  };

  const hasEnglishContent = !isChinese(mod.description) || !isChinese(mod.name);

  return (
    <div className="w-80 bg-white border-l border-gray-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <div className="min-w-0 flex-1 mr-2">
          <h2 className="font-bold text-base truncate">{translatedName || mod.name}</h2>
          {translatedName && <p className="text-[11px] text-gray-400 truncate">{mod.name}</p>}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">状态</span>
          <button onClick={onToggle} className="flex items-center gap-2">
            {mod.enabled
              ? <><span className="text-sm text-emerald-600 font-medium">已启用</span><ToggleRight size={24} className="text-emerald-500" /></>
              : <><span className="text-sm text-gray-400 font-medium">已禁用</span><ToggleLeft size={24} className="text-gray-300" /></>
            }
          </button>
        </div>

        {/* Display Name */}
        <div className="space-y-1.5">
          <span className="text-xs text-gray-400">显示名称</span>
          {displayNameEditMode ? (
            <div className="flex flex-col gap-1">
              <input
                type="text"
                value={displayNameInput}
                onChange={(e) => setDisplayNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleDisplayNameSave();
                  if (e.key === 'Escape') {
                    setDisplayNameInput(displayNameValue || '');
                    setDisplayNameEditMode(false);
                  }
                }}
                onBlur={handleDisplayNameSave}
                placeholder="自定义显示名称"
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
                autoFocus
              />
            </div>
          ) : displayNameValue ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-700">{displayNameValue}</span>
              <button
                onClick={() => {
                  setDisplayNameInput(displayNameValue || '');
                  setDisplayNameEditMode(true);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <Pencil size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setDisplayNameInput('');
                setDisplayNameEditMode(true);
              }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Plus size={12} /> 添加显示名称
            </button>
          )}
        </div>

        {/* Category badge */}
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${category.color}`}>
            <CategoryIcon size={13} /> {category.label}
          </span>
          {missingDeps.length > 0 && mod.enabled && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-600">
              <AlertTriangle size={13} /> 缺失依赖
            </span>
          )}
        </div>

        {/* Info rows */}
        <div className="space-y-3">
          {[
            ['ID', mod.id],
            ['作者', mod.author || '未知'],
            ['版本', mod.version || '未知'],
            ['大小', formatSize(mod.size)],
            ['类型', mod.isFolder ? '文件夹 MOD' : '独立文件 MOD'],
            ...(mod.localUpdatedAt ? [['本地更新', formatDateTime(mod.localUpdatedAt)]] : []),
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-xs text-gray-400">{label}</span>
              <span className="text-xs text-gray-700 font-medium">{value}</span>
            </div>
          ))}
        </div>

        {/* URL row */}
        <div className="space-y-1.5">
          {urlEditMode ? (
            <div className="flex flex-col gap-1">
              <input
                type="text"
                value={urlInputValue}
                onChange={(e) => {
                  setUrlInputValue(e.target.value);
                  setUrlWarning(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUrlSave();
                  if (e.key === 'Escape') {
                    setUrlInputValue(nexusUrl || '');
                    setUrlEditMode(false);
                    setUrlWarning(null);
                  }
                }}
                onBlur={handleUrlSave}
                placeholder="https://nexusmods.com/mods/..."
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
                autoFocus
              />
              {urlWarning && (
                <p className="text-[11px] text-amber-500">{urlWarning}</p>
              )}
            </div>
          ) : nexusUrl ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">链接</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.api.openUrl(nexusUrl)}
                  className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors"
                >
                  <ExternalLink size={12} />
                  {nexusUrl.length > 30 ? nexusUrl.slice(0, 30) + '...' : nexusUrl}
                </button>
                <button
                  onClick={() => {
                    setUrlInputValue(nexusUrl || '');
                    setUrlEditMode(true);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <Pencil size={12} />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                setUrlInputValue('');
                setUrlEditMode(true);
              }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Plus size={12} /> 添加链接
            </button>
          )}
        </div>

        {/* Description */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-400">描述</p>
            {hasEnglishContent && (
              <button onClick={handleTranslate} disabled={translating}
                className="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 disabled:text-gray-300 transition-colors">
                <Languages size={12} />
                {translating ? '翻译中...' : translatedDesc ? '重新翻译' : '翻译'}
              </button>
            )}
          </div>
          {translatedDesc ? (
            <>
              <p className="text-sm text-gray-700 leading-relaxed">{translatedDesc}</p>
              <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">{mod.description}</p>
            </>
          ) : (
            <p className="text-sm text-gray-600 leading-relaxed">{mod.description || '暂无描述'}</p>
          )}
          {translateError && (
            <p className="mt-1 text-xs text-red-400">翻译失败: {translateError}</p>
          )}
        </div>

        {/* Dependencies */}
        {mod.dependencies && mod.dependencies.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-2">依赖项</p>
            {mod.dependencies.map(dep => {
              const isMissing = missingDeps.includes(dep);
              const depMod = allMods.find(m => m.id === dep);
              const canJump = depMod && onSelectMod;
              return (
                <div key={dep}
                  onClick={canJump ? () => onSelectMod(depMod) : undefined}
                  className={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-sm mb-1 ${
                    isMissing ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                  } ${canJump ? 'cursor-pointer hover:ring-1 hover:ring-current/20 transition-all' : ''}`}>
                  {isMissing ? <AlertTriangle size={14} /> : <Box size={14} />}
                  <span className="flex-1 truncate">{depMod ? depMod.name : dep}</span>
                  {isMissing && !depMod && <span className="text-[10px] ml-auto">未安装</span>}
                  {isMissing && depMod && <span className="text-[10px] ml-auto">未启用</span>}
                  {canJump && <ExternalLink size={12} className="flex-shrink-0 opacity-50" />}
                </div>
              );
            })}
          </div>
        )}

        {/* Dependents warning */}
        {dependents.length > 0 && (
          <div className="bg-amber-50 rounded-lg p-3">
            <p className="text-xs text-amber-700 font-medium mb-1">⚠ 以下 MOD 依赖此 MOD</p>
            {dependents.map(d => (
              <p key={d.id} className="text-xs text-amber-600">{d.name}</p>
            ))}
          </div>
        )}

        {/* Files */}
        <div>
          <p className="text-xs text-gray-400 mb-2">文件列表</p>
          <div className="space-y-1">
            {(mod.files || []).map(f => (
              <div key={f} className="flex items-center gap-2 text-xs text-gray-500 py-1">
                {f.endsWith('.dll') ? <Code size={12} /> :
                 f.endsWith('.json') ? <FileText size={12} /> :
                 <Box size={12} />}
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="p-4 border-t border-gray-50 space-y-2">
        <button onClick={onToggle}
          className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
            mod.enabled
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              : 'bg-gray-900 text-white hover:bg-gray-800'
          }`}>
          {mod.enabled ? '禁用 MOD' : '启用 MOD'}
        </button>
        <button onClick={onUninstall}
          className="w-full py-2 rounded-lg text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors flex items-center justify-center gap-2">
          <Trash2 size={14} /> 卸载 MOD
        </button>
      </div>
    </div>
  );
}
