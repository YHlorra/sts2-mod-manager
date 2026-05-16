# MOD管理功能增强实施计划（修订版）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 添加7z解压支持，修复智能替换失效（同一mod新旧版本并存）

**Architecture:** `main.js` 是单文件Electron主进程（1249行），所有mod处理逻辑集中在此。修改策略：在 `smartExtractZip` 函数内部分叉处理.zip/.7z；ZIP走完整manifest扫描+提取逻辑，7z直接解压到临时目录后调用 `installFolder`（简化路径，零新增manifest检测逻辑）；替换修复在 destDir/subDir 提取前强制清理。

**Tech Stack:** `node-7z`（新增）；现有 `adm-zip` 保留用于ZIP；`fs.rmSync` 做目录清理；`os.tmpdir()` 做临时目录。

**关键约束：**
- `smartExtractZip` 改为 `async function`（原为同步函数），所有调用处加 `await`
- `node-7z` 的 `extract.full()` 返回 EventEmitter，不是 Promise，必须用 Promise 包装后 await
- 系统需安装 7-Zip（node-7z 是 7z.exe 的 wrapper）
- 7z分支跳过manifest检测（有意简化）：所有7z包都当文件夹mod处理，直接解压后 installFolder

---

## 文件修改清单

- Modify: `main.js:1-10` — 顶部添加 `const os = require('os')`
- Modify: `main.js:370` — `smartExtractZip` 函数签名改为 `async function smartExtractZip(zipPath, modsDir)`
- Modify: `main.js:372-385` — 扩展名校验 + 错误消息
- Modify: `main.js:387-425` — AdmZip初始化替换为ZIP/7z分支
- Modify: `main.js:428-430` — destDir提取前清理（替换修复）
- Modify: `main.js:465-475` — fallback legacy subDir提取前清理（替换修复）
- Modify: `main.js:498-502` — `installFolder` 目标目录清理（替换修复）
- Modify: `main.js:510` — 安装文件过滤器（extensions: ['zip', '7z']，label改为'Archives'）
- Modify: `main.js:977,1135,1167,1235` — 其他ZIP过滤器（共4处，扩展extensions + 改label）
- Modify: `main.js:522` — `smartExtractZip` 调用处加 `await`
- Modify: `package.json` — 添加 `node-7z` 依赖

---

## 任务定义

### Task 1: 添加 os 模块引入 + 安装 node-7z 依赖

- [ ] **Step 1: 在 main.js 顶部添加 os 模块引入**

原代码（第1-4行）：
```javascript
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
```

替换为：
```javascript
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const AdmZip = require('adm-zip');
```

- [ ] **Step 2: 安装 node-7z**

运行: `cd E:/Desktop/workspace/sts2-mod-manager && pnpm add node-7z`

- [ ] **Step 3: 提交**

```bash
git add package.json main.js
git commit -m "chore: add os module and node-7z dependency for 7z support"
```

---

### Task 2: 将 smartExtractZip 改为 async function 并添加7z支持

**Files:**
- Modify: `main.js:370` — 函数签名
- Modify: `main.js:372-385` — 扩展名校验 + 错误消息
- Modify: `main.js:387-425` — ZIP/7z 分支初始化
- Modify: `main.js:522` — 调用处加 await

- [ ] **Step 1: 修改函数签名**

原代码（第370行）：
```javascript
function smartExtractZip(zipPath, modsDir) {
```

替换为：
```javascript
async function smartExtractZip(zipPath, modsDir) {
```

- [ ] **Step 2: 修改扩展名校验和错误消息**

原代码（第372-378行）：
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

替换为：
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

- [ ] **Step 3: 替换AdmZip初始化为ZIP/7z分支**

原代码（第380-392行）：
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

替换为：
```javascript
  let zip;
  let entries = [];
  try {
    if (ext === '.zip') {
      zip = new AdmZip(zipPath);
      entries = zip.getEntries();
    } else if (ext === '.7z') {
      // 7z: 解压到临时目录后通过 installFolder 处理
      // 注意：7z分支跳过manifest检测，所有7z包都当文件夹mod处理
      const { extract } = require('node-7z');
      const tmpDir = path.join(os.tmpdir(), 'sts2mod-' + Date.now());
      fs.mkdirSync(tmpDir, { recursive: true });
      try {
        // extract.full 返回 EventEmitter，用 Promise 包装等待完成
        await new Promise((resolve, reject) => {
          const stream = extract.full(zipPath, tmpDir, { $bin: '7z' });
          stream.on('end', resolve);
          stream.on('error', reject);
        });
        // 解压完成后，用 installFolder 安装到 modsDir
        // installFolder 会做目标目录清理（见 Task 3 Step 3）
        installFolder(tmpDir, modsDir);
      } finally {
        // 无论成功还是失败，都清理临时目录
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
      return; // 7z解压安装完成，直接返回
    }
  } catch (e) {
    if (e.message && e.message.includes('7-Zip executable not found')) {
      throw new Error(
        `未找到 7-Zip 程序。\n\n` +
        `node-7z 需要系统已安装 7-Zip。\n` +
        `请从 https://www.7-zip.org 下载并安装 7-Zip，然后重新启动应用。`
      );
    }
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

- [ ] **Step 4: 在 mods:install 调用处加 await**

原代码（第522行附近）：
```javascript
        smartExtractZip(filePath, modsDir);
```

替换为：
```javascript
        await smartExtractZip(filePath, modsDir);
```

- [ ] **Step 5: 提交**

```bash
git add main.js
git commit -m "feat: add .7z archive support via node-7z

- smartExtractZip 改为 async function
- extend extension check to .zip/.7z
- 7z branch: extract to tmpDir, use installFolder, with try/finally cleanup
- add 7-Zip not found error message
- await call site in mods:install handler"
```

---

### Task 3: 修复智能替换失效（替换修复）

**Files:**
- Modify: `main.js:428-430` — 文件夹mod destDir 提取前清理
- Modify: `main.js:465-475` — fallback legacy subDir 提取前清理
- Modify: `main.js:498-502` — installFolder 目标目录清理

- [ ] **Step 1: 在 destDir 创建前清理已存在的目录**

原代码（第428-430行）：
```javascript
        const destDir = path.join(modsDir, mr.folderName);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
```

替换为：
```javascript
        const destDir = path.join(modsDir, mr.folderName);
        // 安全防护：确保目标在 modsDir 内
        const resolvedDest = path.resolve(destDir);
        const resolvedModsDir = path.resolve(modsDir);
        if (!resolvedDest.startsWith(resolvedModsDir + path.sep)) {
          throw new Error(`安全限制：拒绝删除 mods 目录外的路径 ${destDir}`);
        }
        if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
        fs.mkdirSync(destDir, { recursive: true });
```

- [ ] **Step 2: 在 fallback legacy 提取前清理 subDir**

原代码（第465-475行附近）：
```javascript
    const subDir = path.join(modsDir, baseName);
    if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });
    zip.extractAllTo(subDir, true);
```

替换为：
```javascript
    // 安全防护：确保目标在 modsDir 内
    const subDir = path.join(modsDir, baseName);
    const resolvedSub = path.resolve(subDir);
    const resolvedModsDir = path.resolve(modsDir);
    if (!resolvedSub.startsWith(resolvedModsDir + path.sep)) {
      throw new Error(`安全限制：拒绝删除 mods 目录外的路径 ${subDir}`);
    }
    if (fs.existsSync(subDir)) fs.rmSync(subDir, { recursive: true, force: true });
    fs.mkdirSync(subDir, { recursive: true });
    zip.extractAllTo(subDir, true);
```

- [ ] **Step 3: 在 installFolder 复制前清理 dest**

原代码（第498-502行）：
```javascript
function installFolder(folderPath, modsDir) {
  const folderName = path.basename(folderPath);
  const dest = path.join(modsDir, folderName);
  fs.cpSync(folderPath, dest, { recursive: true });
}
```

替换为：
```javascript
function installFolder(folderPath, modsDir) {
  const folderName = path.basename(folderPath);
  const dest = path.join(modsDir, folderName);
  // 安全防护：确保目标在 modsDir 内
  const resolvedDest = path.resolve(dest);
  const resolvedModsDir = path.resolve(modsDir);
  if (!resolvedDest.startsWith(resolvedModsDir + path.sep)) {
    throw new Error(`安全限制：拒绝删除 mods 目录外的路径 ${dest}`);
  }
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(folderPath, dest, { recursive: true });
}
```

- [ ] **Step 4: 提交**

```bash
git add main.js
git commit -m "fix: delete existing mod dir before extract to prevent duplicates

- smartExtractZip folder-mod: clean destDir before extract + safety guard
- smartExtractZip legacy fallback: clean subDir before extract + safety guard
- installFolder: clean dest before copy + safety guard"
```

---

### Task 4: 更新文件过滤器扩展名和标签

**Files:**
- Modify: `main.js:510` — 安装对话框过滤器
- Modify: `main.js:977,1135,1167,1235` — 其他4处过滤器

- [ ] **Step 1: 更新5处文件过滤器**

将所有 `filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]` 或 `filters: [{ name: 'Archives', extensions: ['zip'] }]` 统一替换为：

```javascript
filters: [{ name: 'Archives', extensions: ['zip', '7z'] }]
```

（注意：标签统一改为 'Archives'，不是 'ZIP Archive'）

- [ ] **Step 2: 提交**

```bash
git add main.js
git commit -m "chore: update 5 file dialog filters to show .7z extension

- extend extensions from ['zip'] to ['zip', '7z']
- standardize label to 'Archives'"
```

---

## 验证步骤

1. 启动 Electron 应用
2. 安装一个mod的.zip版本（记住mod名和文件夹名）
3. 再次安装同一mod的新版本.zip，确认mods目录只有一个文件夹，无重复
4. 安装一个.7z格式mod，确认正常识别和显示
5. 再次安装同一.7z mod的新版本，确认无重复（目标目录被清理重建）
6. 确认假/空7z包会报错（7z not found 或 empty archive）

---

**Plan 自我审查通过：无 placeholder，无类型不一致，覆盖全部修改点。所有🚨BLOCKING问题已修正。**