const fs = require('fs');
const path = require('path');

// ===== 配置 =====
const TXT_FILE = 'list.txt';        // 存放文件名的 txt（每行一个）
const LOG_PREFIX = 'log';           // 目标文件夹前缀
const SOURCE_DIR = __dirname;       // 搜索起始目录（当前文件夹）
const CASE_INSENSITIVE = false;     // 是否忽略大小写匹配
// ================

// 生成时间戳：YYYYMMDDHHmmss
function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  );
}

// 去掉 UTF-8 BOM
function stripBOM(str) {
  return str.charCodeAt(0) === 0xfeff ? str.slice(1) : str;
}

// 递归遍历目录，返回所有文件的完整路径
function walkDir(dir, skipAbs, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (path.resolve(fullPath) === skipAbs) continue;
      walkDir(fullPath, skipAbs, fileList);
    } else if (entry.isFile()) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

// 解析 txt 中每一行，得到“真实文件名”
function parseLine(line) {
  let s = line.replace(/\r$/, '');
  if (s.trim() === '') return null;
  if (s.trimStart().startsWith('#')) return null;

  const trimmed = s.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return s.trim();
}

function main() {
  const txtPath = path.join(SOURCE_DIR, TXT_FILE);
  if (!fs.existsSync(txtPath)) {
    console.error(`找不到文件列表: ${txtPath}`);
    process.exit(1);
  }

  // 读取并解析文件名列表
  const raw = stripBOM(fs.readFileSync(txtPath, 'utf-8'));
  const names = raw.split(/\n/).map(parseLine).filter((n) => n !== null);

  if (names.length === 0) {
    console.log('txt 中没有有效的文件名。');
    return;
  }

  // 目标文件夹：log + 时间戳
  const targetDir = path.join(SOURCE_DIR, LOG_PREFIX + timestamp());
  fs.mkdirSync(targetDir, { recursive: true });

  // 日志文件（放在目标文件夹内）
  const logPath = path.join(targetDir, `${LOG_PREFIX}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: 'a', encoding: 'utf-8' });
  const writeLog = (line) => logStream.write(line + '\n');

  writeLog(`===== 开始: ${new Date().toLocaleString()} =====`);
  writeLog(`目标文件夹: ${targetDir}`);
  writeLog(`待匹配文件名数: ${names.length}`);

  // 收集所有文件（跳过目标文件夹自身）
  const targetAbs = path.resolve(targetDir);
  const allFiles = walkDir(SOURCE_DIR, targetAbs);

  // 建立 key -> 路径列表 的映射
  const normalize = (s) => (CASE_INSENSITIVE ? s.toLowerCase() : s);
  const fileMap = new Map();
  for (const f of allFiles) {
    const base = normalize(path.basename(f));
    if (!fileMap.has(base)) fileMap.set(base, []);
    fileMap.get(base).push(f);
  }

  let moved = 0;
  let failed = 0;
  let notFound = 0;

  for (const name of names) {
    const matches = fileMap.get(normalize(name));

    if (!matches || matches.length === 0) {
      writeLog(`[未找到] ${JSON.stringify(name)}`);
      notFound++;
      continue;
    }

    for (const src of matches) {
      const baseName = path.basename(src);
      let dest = path.join(targetDir, baseName);

      // 目标重名时加序号
      if (fs.existsSync(dest)) {
        const ext = path.extname(baseName);
        const stem = path.basename(baseName, ext);
        let i = 1;
        while (fs.existsSync(dest)) {
          dest = path.join(targetDir, `${stem}_${i}${ext}`);
          i++;
        }
      }

      try {
        fs.renameSync(src, dest);
        writeLog(`[成功] ${JSON.stringify(src)} -> ${JSON.stringify(dest)}`);
        moved++;
      } catch (err) {
        // 跨盘 / 权限时退化为复制 + 删除
        try {
          fs.copyFileSync(src, dest);
          fs.unlinkSync(src);
          writeLog(`[成功-复制] ${JSON.stringify(src)} -> ${JSON.stringify(dest)}`);
          moved++;
        } catch (e) {
          writeLog(`[失败] ${JSON.stringify(src)} | 目标: ${JSON.stringify(dest)} | 原因: ${e.message}`);
          failed++;
        }
      }
    }
  }

  writeLog(`===== 完成: 成功 ${moved}，失败 ${failed}，未找到 ${notFound} =====`);
  logStream.end();

  // 终端只输出一行简要结果
  console.log(`完成。日志: ${logPath}（成功 ${moved}，失败 ${failed}，未找到 ${notFound}）`);
}

main();