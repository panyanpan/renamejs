const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

// 中间件
app.use(express.json());
app.use(express.static('public'));

// 获取当前目录的文件列表
app.get('/api/files', (req, res) => {
    try {
        const dir = req.query.dir || __dirname;
        const items = fs.readdirSync(dir);
        const files = [];
        const excludeFiles = ['server.js', 'package.json', 'package-lock.json', 'log.txt', 'app.js'];
        
        items.forEach(item => {
            const fullPath = path.join(dir, item);
            if (fs.statSync(fullPath).isFile() && !excludeFiles.includes(item)) {
                files.push({
                    name: item,
                    size: fs.statSync(fullPath).size,
                    ext: path.extname(item)
                });
            }
        });
        
        res.json({ success: true, files, currentDir: dir });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 执行重命名
app.post('/api/rename', (req, res) => {
    try {
        const { prefix, files, targetDir } = req.body;
        const dir = targetDir || __dirname;
        const renameMap = [];
        const errors = [];
        
        // 按大小排序
        const sortedFiles = [...files].sort((a, b) => a.size - b.size);
        const total = sortedFiles.length;
        const digits = Math.max(3, String(total).length);
        const finalPrefix = prefix || 'cn';
        
        // 执行重命名
        sortedFiles.forEach((file, index) => {
            const padded = String(index + 1).padStart(digits, '0');
            const newName = `${finalPrefix}${padded}${file.ext}`;
            const oldPath = path.join(dir, file.name);
            const newPath = path.join(dir, newName);
            
            try {
                fs.renameSync(oldPath, newPath);
                renameMap.push({
                    oldName: file.name,
                    newName: newName
                });
            } catch (err) {
                errors.push({
                    oldName: file.name,
                    newName: newName,
                    error: err.message
                });
            }
        });
        
        // 生成 log.txt
        let logContent = renameMap.map(item => 
            `${item.newName}    ${item.oldName}`
        ).join('\n');
        
        if (errors.length > 0) {
            logContent += '\n\n错误记录:\n';
            logContent += errors.map(err => 
                `${err.newName}    ${err.oldName}    (错误: ${err.error})`
            ).join('\n');
        }
        
        fs.writeFileSync(path.join(dir, 'log.txt'), logContent, 'utf8');
        
        res.json({
            success: true,
            renamed: renameMap,
            errors: errors,
            logContent: logContent,
            total: renameMap.length
        });
        
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 服务器已启动！`);
    console.log(`📂 默认目录: ${__dirname}`);
    console.log(`🌐 访问地址: http://localhost:${PORT}`);
    console.log(`\n⚠️  注意：所有操作将在选择的目录下执行！`);
    console.log(`📝 重命名操作将实际修改文件！\n`);
});