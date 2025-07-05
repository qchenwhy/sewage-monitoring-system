/**
 * timer-interaction-fix.js
 * 修复lastUserInteractionTime变量在初始化前被访问的问题
 * 确保在页面早期加载阶段就完成初始化
 */

(function() {
    console.log('[交互时间修复] 开始初始化lastUserInteractionTime变量');
    
    // 立即初始化变量 - 确保是第一时间执行
    if (typeof window.lastUserInteractionTime === 'undefined') {
        window._safeLastUserInteractionTime = Date.now();
        console.log('[交互时间修复] 初始化时间: ' + new Date(window._safeLastUserInteractionTime).toLocaleTimeString());
    } else {
        // 保存原始值
        window._safeLastUserInteractionTime = window.lastUserInteractionTime;
    }
    
    // 使用Object.defineProperty设置安全访问器
    try {
        Object.defineProperty(window, 'lastUserInteractionTime', {
            configurable: true,
            get: function() {
                if (typeof window._safeLastUserInteractionTime === 'undefined') {
                    console.warn('[交互时间修复] 尝试访问未初始化的lastUserInteractionTime，返回当前时间');
                    window._safeLastUserInteractionTime = Date.now();
                }
                return window._safeLastUserInteractionTime;
            },
            set: function(value) {
                window._safeLastUserInteractionTime = value;
                console.log('[交互时间修复] 更新用户交互时间: ' + new Date(value).toLocaleTimeString());
            }
        });
        
        console.log('[交互时间修复] 安全访问器设置成功');
    } catch (error) {
        console.error('[交互时间修复] 设置访问器失败:', error);
        // 降级处理 - 直接赋值
        window.lastUserInteractionTime = window._safeLastUserInteractionTime || Date.now();
    }
    
    // 添加更新交互时间的函数，并导出到全局作用域
    window.updateLastInteractionTime = function() {
        window.lastUserInteractionTime = Date.now();
    };
    
    // 尝试尽早添加事件监听，不等待DOM完全加载
    try {
        // 添加用户交互事件监听
        ['click', 'touchstart', 'mousedown', 'keydown', 'mousemove', 'scroll', 'input'].forEach(function(eventType) {
            window.addEventListener(eventType, window.updateLastInteractionTime, { passive: true });
        });
        console.log('[交互时间修复] 已添加全局事件监听');
    } catch (e) {
        console.error('[交互时间修复] 添加全局事件监听失败:', e);
    }
    
    // 监听DOM加载完成，添加更多精细的事件监听
    window.addEventListener('DOMContentLoaded', function() {
        console.log('[交互时间修复] DOM已加载，设置元素事件监听');
        
        // 特别处理input元素，确保它们的事件也被捕获
        try {
            var inputs = document.querySelectorAll('input, textarea, select, button');
            inputs.forEach(function(input) {
                ['focus', 'blur', 'change'].forEach(function(eventType) {
                    input.addEventListener(eventType, window.updateLastInteractionTime, { passive: true });
                });
            });
            console.log('[交互时间修复] 已为' + inputs.length + '个输入元素添加事件监听');
        } catch (e) {
            console.error('[交互时间修复] 添加输入元素事件监听失败:', e);
        }
        
        // 设置定期检查，确保变量始终可用
        setInterval(function() {
            if (typeof window._safeLastUserInteractionTime === 'undefined') {
                window._safeLastUserInteractionTime = Date.now();
                console.warn('[交互时间修复] 定期检查发现变量缺失，重新初始化');
            }
        }, 5000); // 每5秒检查一次
        
        console.log('[交互时间修复] 所有事件监听器已设置');
    });
    
    // 导出检查函数，可用于其他脚本确认变量已初始化
    window.ensureInteractionTimeInitialized = function() {
        if (typeof window._safeLastUserInteractionTime === 'undefined') {
            window._safeLastUserInteractionTime = Date.now();
            console.log('[交互时间修复] 通过检查函数初始化交互时间');
        }
        return window.lastUserInteractionTime;
    };
    
    // 如果window.onload已设置，保存引用并扩展
    var originalOnload = window.onload;
    window.onload = function() {
        // 调用原来的onload处理程序（如果有）
        if (typeof originalOnload === 'function') {
            originalOnload();
        }
        
        // 执行我们的额外检查
        window.ensureInteractionTimeInitialized();
        console.log('[交互时间修复] window.onload中进行了额外检查');
    };
    
    console.log('[交互时间修复] 初始化完成');
})(); 