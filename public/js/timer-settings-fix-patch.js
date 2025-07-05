/**
 * timer-settings-fix-patch.js
 * 解决timer-settings-fix.js无法找到timerSettingsBtn的问题
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('计时器设置补丁脚本已加载');
    
    // 检查原始脚本是否已执行
    setTimeout(function() {
        if (typeof initTimerSettingsBtn === 'function') {
            console.log('检测到原始initTimerSettingsBtn函数，替换为修正版本');
            
            // 替换原始函数为修正版本
            window.initTimerSettingsBtn = function() {
                console.log('执行修正版的初始化计时器设置按钮函数');
                
                // 获取正确的设置按钮（使用toggleSettings代替timerSettingsBtn）
                const settingsBtn = document.getElementById('toggleSettings');
                if (!settingsBtn) {
                    console.error('无法找到计时器设置按钮元素，ID: toggleSettings');
                    return;
                }
                
                console.log('找到正确的设置按钮:', settingsBtn);
                
                // 获取设置模态框元素
                const settingsModal = document.getElementById('timerSettingsModal');
                if (!settingsModal) {
                    console.error('无法找到计时器设置模态框元素，ID: timerSettingsModal');
                    return;
                }
                
                // 获取设置表单元素
                const settingsForm = document.getElementById('timerSettingsForm');
                if (!settingsForm) {
                    console.error('无法找到计时器设置表单元素，ID: timerSettingsForm');
                    return;
                }
                
                // 获取关闭按钮元素
                const closeBtn = settingsModal.querySelector('.close-btn') || settingsModal.querySelector('.close');
                if (!closeBtn) {
                    console.warn('无法找到模态框关闭按钮元素，尝试创建一个');
                    
                    // 尝试创建关闭按钮
                    const newCloseBtn = document.createElement('span');
                    newCloseBtn.className = 'close-btn';
                    newCloseBtn.innerHTML = '&times;';
                    newCloseBtn.style.position = 'absolute';
                    newCloseBtn.style.right = '15px';
                    newCloseBtn.style.top = '10px';
                    newCloseBtn.style.fontSize = '24px';
                    newCloseBtn.style.cursor = 'pointer';
                    
                    // 添加到模态框
                    const modalContent = settingsModal.querySelector('.modal-content');
                    if (modalContent) {
                        modalContent.style.position = 'relative';
                        modalContent.insertBefore(newCloseBtn, modalContent.firstChild);
                    } else {
                        settingsModal.insertBefore(newCloseBtn, settingsModal.firstChild);
                    }
                }
                
                // 获取保存按钮元素
                const saveBtn = document.getElementById('saveTimerSettings');
                if (!saveBtn) {
                    console.error('无法找到保存设置按钮元素，ID: saveTimerSettings');
                }
                
                // 获取测试音频按钮元素
                const testAudioBtn = document.getElementById('testAudioBtn');
                if (!testAudioBtn) {
                    console.warn('无法找到测试音频按钮元素，ID: testAudioBtn');
                }
                
                // 添加设置按钮点击事件
                settingsBtn.addEventListener('click', function(e) {
                    console.log('设置按钮被点击(补丁版本)');
                    e.preventDefault();
                    
                    // 加载当前设置到表单
                    loadSettingsToForm();
                    
                    // 显示模态框
                    settingsModal.style.display = 'block';
                });
                
                // 添加关闭按钮点击事件
                const allCloseBtns = settingsModal.querySelectorAll('.close-btn, .close');
                allCloseBtns.forEach(function(btn) {
                    btn.addEventListener('click', function() {
                        console.log('关闭按钮被点击');
                        settingsModal.style.display = 'none';
                    });
                });
                
                // 添加模态框背景点击关闭事件
                settingsModal.addEventListener('click', function(e) {
                    if (e.target === settingsModal) {
                        console.log('模态框背景被点击，关闭模态框');
                        settingsModal.style.display = 'none';
                    }
                });
                
                // 添加保存按钮点击事件
                if (saveBtn) {
                    saveBtn.addEventListener('click', function(e) {
                        console.log('保存按钮被点击');
                        e.preventDefault();
                        saveSettings(settingsForm);
                        settingsModal.style.display = 'none';
                        showNotification('设置已保存！', 'success');
                    });
                }
                
                // 添加测试音频按钮点击事件
                if (testAudioBtn) {
                    testAudioBtn.addEventListener('click', function(e) {
                        console.log('测试音频按钮被点击');
                        e.preventDefault();
                        testAudioLoopPlayback();
                    });
                }
                
                // 添加表单提交事件（防止页面刷新）
                if (settingsForm) {
                    settingsForm.addEventListener('submit', function(e) {
                        e.preventDefault();
                        saveSettings(settingsForm);
                        settingsModal.style.display = 'none';
                        showNotification('设置已保存！', 'success');
                    });
                }
                
                console.log('计时器设置按钮初始化完成(补丁版本)');
            };
            
            // 重新执行初始化
            initTimerSettingsBtn();
        } else {
            console.log('未检测到原始initTimerSettingsBtn函数，无需修正');
        }
    }, 500); // 等待500ms确保原始脚本已加载
}); 