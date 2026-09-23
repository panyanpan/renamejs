const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 配置
const HASH_FILE = 'hashes.txt';
const LOG_FILE = 'result.log';
const CURRENT_DIR = process.cwd();

// 读取 hashes.txt 中的 sha256 列表
function readHashes(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`找不到文件: ${filePath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  // 按行分割，去除空白行，统一转小写
  return content
    .split(/\r?\n/)
    .map(line => line.trim().toLowerCase())
    .filter(line => line.length > 0);
}

// 计算文件的 sha256
function calculateSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// 递归遍历目录，收集所有文件路径
function walkDir(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    // 跳过日志文件本身和 hashes.txt（避免读取自身）
    if (entry.isDirectory()) {
      walkDir(fullPath, fileList);
    } else if (entry.isFile()) {
      if (entry.name === LOG_FILE || entry.name === HASH_FILE) continue;
      fileList.push(fullPath);
    }
  }
  return fileList;
}

async function main() {
  const hashFilePath = path.join(CURRENT_DIR, HASH_FILE);
  const targetHashes = readHashes(hashFilePath);

  if (targetHashes.length === 0) {
    console.log('hashes.txt 中没有有效的 sha256');
    return;
  }

  // 使用 Set 提高查找效率
  const hashSet = new Set(targetHashes);
  console.log(`共加载 ${targetHashes.length} 个待匹配的 sha256`);

  // 获取所有文件
  const allFiles = walkDir(CURRENT_DIR);
  console.log(`共扫描到 ${allFiles.length} 个文件`);

  // 存储结果： sha256 -> [文件信息]
  const results = new Map();

  let processed = 0;
  for (const filePath of allFiles) {
    processed++;
    try {
      const fileHash = await calculateSha256(filePath);
      if (hashSet.has(fileHash)) {
        if (!results.has(fileHash)) {
          results.set(fileHash, []);
        }
        results.get(fileHash).push({
          path: filePath,
          name: path.basename(filePath),
          sha256: fileHash
        });
        console.log(`[匹配] ${filePath}`);
      }
    } catch (err) {
      console.error(`[错误] 处理文件失败: ${filePath} - ${err.message}`);
    }
    // 进度提示
    if (processed % 100 === 0) {
      console.log(`已处理 ${processed}/${allFiles.length}`);
    }
  }

  // 写入日志
  const logLines = [];
  logLines.push(`# 匹配结果 - 生成时间: ${new Date().toISOString()}`);
  logLines.push(`# 待匹配 sha256 数量: ${targetHashes.length}`);
  logLines.push(`# 扫描文件总数: ${allFiles.length}`);
  logLines.push(`# 匹配到的文件数量: ${[...results.values()].reduce((s, arr) => s + arr.length, 0)}`);
  logLines.push('');

  // 未匹配的 hash
  const unmatched = targetHashes.filter(h => !results.has(h));

  // 写入匹配结果
  logLines.push('===== 匹配到的文件 =====');
  for (const [hash, files] of results.entries()) {
    for (const f of files) {
      logLines.push(`SHA256: ${f.sha256}`);
      logLines.push(`文件名: ${f.name}`);
      logLines.push(`路径:   ${f.path}`);
      logLines.push('---');
    }
  }

  // 写入未匹配的 hash
  if (unmatched.length > 0) {
    logLines.push('');
    logLines.push('===== 未找到对应文件的 SHA256 =====');
    unmatched.forEach(h => logLines.push(h));
  }

  const logPath = path.join(CURRENT_DIR, LOG_FILE);
  fs.writeFileSync(logPath, logLines.join('\n'), 'utf-8');
  console.log(`\n结果已写入: ${logPath}`);
}

main().catch(err => {
  console.error('程序异常:', err);
  process.exit(1);
});


//cmd   dir /b > list.txt
//powershell sha256 Get-ChildItem -Recurse -File | Where-Object { $_.Name -ne 'hashes.txt' } | Get-FileHash -Algorithm SHA256 | Select-Object -ExpandProperty Hash | Out-File -Encoding utf8 hashes.txt
