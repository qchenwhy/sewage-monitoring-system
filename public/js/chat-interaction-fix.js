/**
 * chat-interaction-fix.js
 * 修复chat.html页面中lastUserInteractionTime变量在初始化前被访问的问题
 * 
 * 此脚本应在所有可能使用lastUserInteractionTime的脚本之前加载
 * 特别是必须在chat-audio-url-fix.js之前加载
 */

(function() {
    // 记录当前时间，用于性能分析
    var startTime = performance.now();
    console.log('[聊天交互修复] 开始初始化lastUserInteractionTime变量');
    
    // 立即初始化变量
    if (typeof window.lastUserInteractionTime === 'undefined') {
        // 创建一个安全的内部变量来存储时间
        window._secureInteractionTime = Date.now();
        console.log('[聊天交互修复] 初始化时间: ' + new Date(window._secureInteractionTime).toLocaleTimeString());
    } else {
        // 保存原始值
        window._secureInteractionTime = window.lastUserInteractionTime;
        console.log('[聊天交互修复] 保存已存在的值: ' + new Date(window._secureInteractionTime).toLocaleTimeString());
    }
    
    // 使用Object.defineProperty设置安全访问器
    try {
        // 删除可能存在的同名属性
        if (Object.getOwnPropertyDescriptor(window, 'lastUserInteractionTime')) {
            try {
                delete window.lastUserInteractionTime;
            } catch (e) {
                console.warn('[聊天交互修复] 无法删除现有属性:', e);
            }
        }
        
        Object.defineProperty(window, 'lastUserInteractionTime', {
            configurable: true,
            enumerable: true,
            get: function() {
                if (typeof window._secureInteractionTime === 'undefined') {
                    console.warn('[聊天交互修复] 尝试访问未初始化的lastUserInteractionTime，返回当前时间');
                    window._secureInteractionTime = Date.now();
                }
                return window._secureInteractionTime;
            },
            set: function(value) {
                window._secureInteractionTime = value;
                if (window.chatDebugMode) {
                    console.log('[聊天交互修复] 更新用户交互时间: ' + new Date(value).toLocaleTimeString());
                }
            }
        });
        
        console.log('[聊天交互修复] 安全访问器设置成功');
    } catch (error) {
        console.error('[聊天交互修复] 设置访问器失败:', error);
        // 降级处理 - 直接赋值
        window.lastUserInteractionTime = window._secureInteractionTime || Date.now();
    }
    
    // 添加更新交互时间的函数
    window.updateLastUserInteraction = function() {
        window.lastUserInteractionTime = Date.now();
        return window.lastUserInteractionTime;
    };
    
    // 创建一个事件监听添加器
    function addInteractionListeners() {
        console.log('[聊天交互修复] 设置事件监听');
        
        // 添加用户交互事件监听
        ['click', 'touchstart', 'mousedown', 'keydown', 'input'].forEach(function(eventType) {
            document.addEventListener(eventType, window.updateLastUserInteraction, { passive: true });
        });
        
        // 获取所有输入元素
        setTimeout(function() {
            try {
                var inputs = document.querySelectorAll('input, textarea, select, button');
                inputs.forEach(function(input) {
                    ['focus', 'blur', 'change'].forEach(function(eventType) {
                        input.addEventListener(eventType, window.updateLastUserInteraction, { passive: true });
                    });
                });
                console.log('[聊天交互修复] 已为', inputs.length, '个输入元素添加事件监听');
            } catch (e) {
                console.warn('[聊天交互修复] 添加输入元素事件监听失败:', e);
            }
        }, 1000); // 延迟1秒，确保DOM已加载
        
        console.log('[聊天交互修复] 所有事件监听器已设置');
    }
    
    // 如果DOM已加载，立即添加事件监听
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        addInteractionListeners();
    } else {
        // 否则等待DOM加载完成
        window.addEventListener('DOMContentLoaded', addInteractionListeners);
    }
    
    // 导出检查函数，可用于其他脚本确认变量已初始化
    window.ensureUserInteractionTimeInitialized = function() {
        if (typeof window._secureInteractionTime === 'undefined') {
            window._secureInteractionTime = Date.now();
            console.log('[聊天交互修复] 通过检查函数初始化交互时间');
        }
        return window.lastUserInteractionTime;
    };
    
    // 确保在页面关闭前更新一次时间
    window.addEventListener('beforeunload', function() {
        window.lastUserInteractionTime = Date.now();
    });
    
    // 性能分析
    var endTime = performance.now();
    console.log('[聊天交互修复] 初始化完成，耗时: ' + (endTime - startTime).toFixed(2) + 'ms');
})(); 