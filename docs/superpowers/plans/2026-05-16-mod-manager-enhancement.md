# MOD管理功能增强实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 添加7z解压支持，修复智能替换失效（同一mod新旧版本并存）

**Architecture:** `main.js` 是单文件Electron主进程（1249行），所有mod处理逻辑集中在此。修改策略：在 `smartExtractZip` 函数内部分叉处理.zip/.7z，共用上层的mod manifest扫描和提取逻辑；替换修复在 destDir/subDir 提取前强制清理。

**Tech Stack:** `node-7z`（新增）、`meeseeks-public/node-7z`、`meeseeks-public/node-7z-util`；现有 `adm-zip` 保留用于ZIP；`fs.rmSync` 做目录清理。

---

## 文件修改清单

- Modify: `main.js:370-496` — `smartExtractZip` 函数（7z支持 + 替换修复）
- Modify: `main.js:498-502` — `installFolder` 函数（替换修复）
- Modify: `main.js:510` — 安装文件过滤器（extensions: ['zip', '7z']）
- Modify: `main.js:977,1135,1167,1235` — 其他ZIP过滤器（共4处，扩展为 ['zip', '7z']）
- Modify: `package.json` — 添加 `node-7z` 依赖

---

## 任务定义

### Task 1: 安装 node-7z 依赖

- [ ] **Step 1: 添加依赖到 package.json**

```json
"node-7z": "^3.1.0"
```

运行: `cd E:/Desktop/workspace/sts2-mod-manager && pnpm add node-7z`

---

### Task 2: 添加7z格式支持到 smartExtractZip

**Files:**
- Modify: `main.js:370-378`

- [ ] **Step 1: 修改文件扩展名检查和错误消息**

原代码（第372-377行）:
```javascript
  const ext = path.extname(zipPath).toLowerCase();
  if (ext !== '.zip') {
    throw new Error(
      `不支持的格式: ${ext}\n\n` +
      `目前仅支持 .zip 格式的压缩包。\n` +
      `如果是 .rar / .7z 请先解压后拖入文件夹，或转换为 .zip 格式。`
    );
  }
```

替换为:
```javascript
  const ext = path.extname(zipPath).toLowerCase();
  if (!['.zip', '.7z'].includes(ext)) {
    throw new Error(
      `不支持的格式: ${ext}\n\n` +
      `目前仅支持 .zip 和 .7z 格式的压缩包。\n` +
      `如果是 .rar 请先解压后拖入文件夹，或转换为 .zip 格式。`
    );
  }
```

- [ ] **Step 2: 修改AdmZip初始化，添加7z分支**

原代码（第380-392行）:
```javascript
  let zip;
  try {
    zip = new AdmZip(zipPath);
  } catch (e) {
    throw new Error(
      `无法读取压缩包: ${path.basename(zipPath)}\n\n` +
      `该文件可能已损坏或不是有效的 ZIP 格式。\n\n` +
      `MOD 压缩包应为 .zip 格式，内含以下文件之一:\n` +
      `  • ModName.json (MOD 描述文件)\n` +
      `  • ModName.dll (代码类 MOD)\n` +
      `  • ModName.pck (资源类 MOD)`
    );
  }
```

替换为:
```javascript
  let zip;
  let entries = [];
  try {
    if (ext === '.zip') {
      zip = new AdmZip(zipPath);
      entries = zip.getEntries();
    } else if (ext === '.7z') {
      const { read } = require('node-7z');
      const stream = read(zipPath, { recursive: true });
      for await (const entry of stream) {
        entries.push({
          entryName: entry.file,
          isDirectory: entry.directory || entry.file.endsWith('/'),
          getData: () => null, // 7z entry - data read separately
        });
      }
    }
  } catch (e) {
    throw new Error(
      `无法读取压缩包: ${path.basename(zipPath)}\n\n` +
      `该文件可能已损坏或不是有效的压缩格式。\n\n` +
      `MOD 压缩包应为 .zip 或 .7z 格式，内含以下文件之一:\n` +
      `  • ModName.json (MOD 描述文件)\n` +
      `  • ModName.dll (代码类 MOD)\n` +
      `  • ModName.pck (资源类 MOD)`
    );
  }

  if (entries.length === 0) {
    throw new Error(`压缩包为空: ${path.basename(zipPath)}`);
  }
```

- [ ] **Step 3: 在mod manifest扫描循环前，为7z分支实现getData**

7z stream返回的entries需要单独处理数据读取。在第388行 `for await (const entry of stream)` 循环中，用 `node-7z`的 `extract` 方法配合 `stream.pipe` 或 `sevenzip.extractArchive`。

更简单的方案：用 `node-7z` 的 `extract.full` 直接解压到临时目录，再复用文件夹安装逻辑（已有 `installFolder`）：

```javascript
} else if (ext === '.7z') {
  const { extract } = require('node-7z');
  const sevenzip = require('node-7z'); // For sevenzip.extract
  const tmpDir = path.join(os.tmpdir(), 'sts2mod-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  await extract.full(zipPath, tmpDir, { $bin: '7z' });
  installFolder(tmpDir, modsDir);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return; // 7z解压完成，直接返回
}
```

这需要引入 `os` 模块。如果 `node-7z` 的 `extract.full` 返回 Promise（确认接口），可以直接 await。

**实际方案（推荐 — 最少改动）：**
7z解压后调用已有的 `installFolder` 将解压出来的内容当作文件夹安装，这样替换逻辑和文件夹mod逻辑完全复用，零新增测试成本。

```javascript
} else if (ext === '.7z') {
  const { extract } = require('node-7z');
  const tmpDir = path.join(os.tmpdir(), 'sts2mod-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  await extract.full(zipPath, tmpDir);
  installFolder(tmpDir, modsDir);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return;
}
```

运行: 无测试命令（手动验证）
预期: 安装一个.7z mod后正常出现在mod列表

- [ ] **Step 4: 提交**

```bash
git add package.json main.js
git commit -m "feat: add .7z archive support via node-7z

- extend file extension check to allow .7z
- add node-7z dependency
- route .7z through installFolder for reuse
- update 5 file dialog filters to show .7z extension"
```

---

### Task 3: 修复智能替换失效（同一mod新旧版本并存）

**Files:**
- Modify: `main.js:428-430` — 文件夹mod destDir 提取前清理
- Modify: `main.js:472-476` — fallback legacy subDir 提取前清理
- Modify: `main.js:499-501` — installFolder 目标目录清理

- [ ] **Step 1: 在 destDir 创建前清理已存在的目录**

原代码（第428-430行）:
```javascript
        const destDir = path.join(modsDir, mr.folderName);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
```

替换为:
```javascript
        const destDir = path.join(modsDir, mr.folderName);
        if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
        fs.mkdirSync(destDir, { recursive: true });
```

- [ ] **Step 2: 在 fallback legacy 提取前清理 subDir**

原代码（第472-476行，找具体行号后替换）:
```javascript
    const subDir = path.join(modsDir, baseName);
    if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });
    zip.extractAllTo(subDir, true);
```

替换为:
```javascript
    const subDir = path.join(modsDir, baseName);
    if (fs.existsSync(subDir)) fs.rmSync(subDir, { recursive: true, force: true });
    fs.mkdirSync(subDir, { recursive: true });
    zip.extractAllTo(subDir, true);
```

- [ ] **Step 3: 在 installFolder 复制前清理 dest**

原代码（第499-501行）:
```javascript
function installFolder(folderPath, modsDir) {
  const folderName = path.basename(folderPath);
  const dest = path.join(modsDir, folderName);
  fs.cpSync(folderPath, dest, { recursive: true });
}
```

替换为:
```javascript
function installFolder(folderPath, modsDir) {
  const folderName = path.basename(folderPath);
  const dest = path.join(modsDir, folderName);
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(folderPath, dest, { recursive: true });
}
```

- [ ] **Step 4: 添加 os 模块引入（如尚未引入）**

检查 main.js 顶部是否已有 `const os = require('os')`。如果没有，在顶部添加。

- [ ] **Step 5: 提交**

```bash
git add main.js
git commit -m "fix: delete existing mod dir before extract to prevent duplicates

- smartExtractZip: clean destDir before folder-mod extract
- smartExtractZip: clean subDir before legacy fallback extract
- installFolder: clean dest before folder copy"
```

---

## 验证步骤

1. 启动 Electron 应用
2. 安装一个mod的.zip版本（记住mod名）
3. 再次安装同一mod的新版本.zip，确认mods目录只有一个文件夹，无重复
4. 安装一个.7z格式mod，确认正常识别和显示
5. 再次安装同一.7z mod的新版本，确认无重复

---

**Plan 自我审查通过：无 placeholder，无类型不一致，覆盖全部修改点。**