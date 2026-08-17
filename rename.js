const fs = require('fs');
const path = require('path');

// ========== 配置区 ==========
const targetDir = __dirname;  // 当前文件夹，可改为具体路径如 'C:/Users/YourName/Desktop/files'
const prefix = 'cn';          // 自定义前缀，可改为 'img'、'photo' 等
// ===========================

// 获取文件列表
function getFiles(dir) {
    try {
        const items = fs.readdirSync(dir);
        const files = [];
        const scriptName = path.basename(__filename);
        const logFileName = 'log.txt';
        
        items.forEach(item => {
            const fullPath = path.join(dir, item);
            // 排除文件夹、脚本自身和日志文件
            if (fs.statSync(fullPath).isFile() && 
                item !== scriptName && 
                item !== logFileName) {
                files.push({
                    name: item,
                    path: fullPath,
                    size: fs.statSync(fullPath).size,
                    ext: path.extname(item)
                });
            }
        });
        return files;
    } catch (err) {
        console.error('读取文件夹失败:', err);
        return [];
    }
}

// 生成新文件名
function generateNewName(index, ext, total, prefix) {
    const digits = Math.max(3, String(total).length);
    const padded = String(index).padStart(digits, '0');
    return `${prefix}${padded}${ext}`;
}

// 执行重命名
function renameFiles() {
    console.log('📂 扫描文件...');
    const files = getFiles(targetDir);
    
    if (files.length === 0) {
        console.log('⚠️ 没有找到可重命名的文件。');
        return;
    }
    
    console.log(`✅ 找到 ${files.length} 个文件`);
    
    // 按大小从小到大排序
    files.sort((a, b) => a.size - b.size);
    
    // 生成映射并执行重命名
    const renameMap = [];
    const total = files.length;
    
    console.log('🔄 开始重命名...');
    
    files.forEach((file, index) => {
        const newName = generateNewName(index + 1, file.ext, total, prefix);
        const newPath = path.join(targetDir, newName);
        
        try {
            fs.renameSync(file.path, newPath);
            renameMap.push({
                oldName: file.name,
                newName: newName
            });
            console.log(`  ✅ ${file.name} → ${newName}`);
        } catch (err) {
            console.error(`  ❌ 重命名失败: ${file.name}`, err.message);
            renameMap.push({
                oldName: file.name,
                newName: '❌ 失败',
                error: err.message
            });
        }
    });
    
    // 生成 log.txt
    const logContent = renameMap.map(item => {
        if (item.error) {
            return `${item.newName}    ${item.oldName}    (错误: ${item.error})`;
        }
        return `${item.newName}    ${item.oldName}`;
    }).join('\n');
    
    const logPath = path.join(targetDir, 'log.txt');
    fs.writeFileSync(logPath, logContent, 'utf8');
    console.log(`\n📝 日志已保存至: ${logPath}`);
    console.log('✨ 重命名完成！');
}

// 执行
renameFiles();