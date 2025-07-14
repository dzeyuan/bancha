let tableNames = [];

// 统一错误处理函数
function handleError(message) {
    //localStorage.setItem('errorMessage', message);
    //window.location.href = 'error.html';
    console.log(message);
}

// 全局错误监听
window.onerror = function(message, source, lineno, colno, error) {
    handleError(`发生未捕获错误: ${message} (行: ${lineno})`);
    return true;
};

// 显示帮助弹窗
function showHelpModal() {
    document.getElementById('helpModal').style.display = 'block';
}

// 关闭帮助弹窗
const closeBtn = document.getElementsByClassName('close')[0];
closeBtn.onclick = function() {
    document.getElementById('helpModal').style.display = 'none';
};

// 点击空白处关闭弹窗
window.onclick = function(event) {
    if (event.target === document.getElementById('helpModal')) {
        document.getElementById('helpModal').style.display = 'none';
    }
  };

// 解析表格文件
async function parseTable(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });     
                if (!workbook.SheetNames.length) {
                    handleError('Excel文件中没有找到工作表');
                }
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);
                
                if (!jsonData.length) {
                    handleError('工作表中没有找到数据');
                }
                // 提取第一列数据并过滤空值
                const tableNames = jsonData.map(item => {
                    const value = Object.values(item)[0];
                    return value ? String(value).trim() : '';
                }).filter(name => name);
                resolve(tableNames);
            } catch (error) {
                handleError(error);
            }
        };
        
        reader.onerror = function() {
            const error = new Error('文件读取失败: ' + reader.error.message);
            handleError(error);
        };
        
        reader.readAsArrayBuffer(file);
    });
}

let worker;

// 更新进度步骤状态
function updateStep(stepNumber, status) {
    const step = document.getElementById(`step${stepNumber}`);
    if (step) {
        // 移除所有状态类
        step.classList.remove('active', 'completed');
        // 添加请求的状态类
        step.classList.add(status);
        
        // 更新之前的步骤为已完成
        for (let i = 1; i < stepNumber; i++) {
            const prevStep = document.getElementById(`step${i}`);
            if (prevStep) {
                prevStep.classList.remove('active');
                prevStep.classList.add('completed');
            }
        }
    }
}

// 检查是否两个文件都已选择
function checkFilesSelected() {
    const tableFile = document.getElementById('tableFile').files.length > 0;
    const imageFile = document.getElementById('imageFile').files.length > 0;
    
    if (tableFile && imageFile) {
        updateStep(3, 'active');
    }
}

// 为文件输入添加事件监听器
if (document.getElementById('tableFile')) {
    document.getElementById('tableFile').addEventListener('change', checkFilesSelected);
    document.getElementById('tableFile').addEventListener('change', function(e) {
        const fileName = e.target.files[0] ? e.target.files[0].name : '未选择文件';
        document.getElementById('tableFileName').textContent = fileName;
    });
}
if (document.getElementById('imageFile')) {
    document.getElementById('imageFile').addEventListener('change', checkFilesSelected);
    document.getElementById('imageFile').addEventListener('change', function(e) {
        const fileName = e.target.files[0] ? e.target.files[0].name : '未选择文件';
        document.getElementById('imageFileName').textContent = fileName;
    });
}

// 页面加载完成后初始化Tesseract worker
window.addEventListener('DOMContentLoaded', async () => {
    try {
        // 初始化Tesseract Worker时指定使用原始引擎
        worker = Tesseract.createWorker({
        lang: 'chi_sim',
        oem: 0, // 使用原始Tesseract引擎(支持白名单)
        langPath: '/tessdata'
        });
        
        // 识别时无需重复设置白名单
        await worker.load();
        await worker.loadLanguage('chi_sim');
        await worker.initialize('chi_sim');
        console.log('Tesseract worker initialized successfully');
        updateStep(2, 'active');
    } catch (error) {
        handleError('Failed to initialize Tesseract worker: ' + error.message);
    }
});

// 识别图片中的文字
const recognizeImage = async function(file, whitelist) {
    if (!worker) {
        handleError('OCR引擎初始化失败，请刷新页面重试');
        return;
    }
    // 在生成whitelist后设置参数
    console.log('生成的OCR白名单:', whitelist);
    await worker.setParameters({
      tessedit_char_whitelist: whitelist
    });
    // 执行OCR识别并获取结果
    const { data: { text } } = await worker.recognize(file);
    // 二次过滤：移除空格和换行符
    const filteredText = text.replace(/[\s\n]/g, '');
    console.log('OCR原始识别结果:', text);
    console.log('过滤后识别结果:', filteredText);
    updateStep(4, 'active');
    return filteredText;
};

// 开始比对
const compareNames = async function() {
    const tableFile = document.getElementById('tableFile').files[0];
    const imageFile = document.getElementById('imageFile').files[0];

    if (!tableFile || !imageFile) {
        alert('请上传表格和图片文件');
        return;
    }
    if (!window.compressedImage) {
        alert('图片尚未处理成功，请稍等');
        return;
    }
    try {
        // 解析表格并获取姓名列表
        const tableNames = await parseTable(tableFile);
        // 调试：检查parseTable执行后tableNames的值
        console.log('parseTable执行后tableNames:', tableNames);
        // 生成OCR白名单（表格内容去重字符）
        const whitelist = [...new Set(tableNames.join(''))].join('');
        const recognizedText = await recognizeImage(window.compressedImage, whitelist);
        const found = [];
        const notFound = [];
        // 遍历tableNames中的每个元素，检查是否存在于recognizedText中
        tableNames.forEach(name => {
        if (recognizedText.includes(name)) {
            found.push(name);
        } else {
            notFound.push(name);
        }
        });
        document.getElementById('foundNames').textContent = found.join(', ');
        document.getElementById('notFoundNames').textContent = notFound.join(', ');
    } catch (error) {
        handleError('处理错误: ' + error.message);
    }

    
};

const imageUpload = document.getElementById('imageFile');
if (imageUpload) {
    imageUpload.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            // 使用CompressorJS压缩图片
            new Compressor(file, {
                quality: 0.7, // 压缩质量(0-1)
                maxWidth: 1200, // 最大宽度
                maxHeight: 1200, // 最大高度
                success: function(compressedFile) {
                    console.log('图片压缩成功 - 原始大小:', file.size, '压缩后大小:', compressedFile.size);
                    // 存储压缩后的文件，不立即识别
                    window.compressedImage = compressedFile;
                },
                error: function(err) {
                    console.error('图片压缩失败:', err.message);
                    // 存储原始文件，不立即识别
                    window.compressedImage = file;
                    console.log('压缩失败，将使用原始图片识别');
                }
            });
        }
    });
} else {
    console.error('未找到图片上传元素 #imageFile');
}