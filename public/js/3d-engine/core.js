/**
 * 3D可视化引擎核心类
 * 负责场景初始化、渲染管理、设备数据绑定等核心功能
 */
class ThreeDEngine {
    constructor() {
        // 基础属性
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.container = null;
        this.canvas2d = null;
        this.ctx2d = null;
        
        // 渲染模式 ('auto', '3d', '2d')
        this.renderMode = 'auto';
        this.currentRenderer = 'threejs'; // 'threejs' or 'canvas2d'
        
        // 设备数据
        this.devices = [];
        this.deviceObjects = new Map(); // 设备ID -> 3D对象映射
        
        // 性能监控
        this.fps = 0;
        this.frameCount = 0;
        this.lastTime = performance.now();
        
        // 动画控制
        this.animationId = null;
        this.isRunning = false;
        
        // 事件绑定
        this.onWindowResize = this.onWindowResize.bind(this);
        this.animate = this.animate.bind(this);
    }
    
    /**
     * 初始化3D引擎
     */
    async init() {
        try {
            console.log('开始初始化3D引擎...');
            
            // 获取DOM容器
            this.container = document.getElementById('threejs-container');
            this.canvas2d = document.getElementById('canvas2d-container');
            
            if (!this.container || !this.canvas2d) {
                throw new Error('找不到渲染容器');
            }
            
            // 初始化Canvas 2D上下文
            this.ctx2d = this.canvas2d.getContext('2d');
            
            // 检测设备性能并选择渲染模式
            await this.detectPerformance();
            
            // 初始化Three.js场景
            this.initThreeJS();
            
            // 加载设备数据
            await this.loadDevices();
            
            // 创建基础场景
            this.createBasicScene();
            
            // 开始渲染循环
            this.startRenderLoop();
            
            // 绑定事件
            this.bindEvents();
            
            // 隐藏加载动画
            this.hideLoading();
            
            console.log('3D引擎初始化完成');
            
        } catch (error) {
            console.error('3D引擎初始化失败:', error);
            this.showError('初始化失败: ' + error.message);
        }
    }
    
    /**
     * 初始化Three.js场景
     */
    initThreeJS() {
        // 创建场景
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0a);
        
        // 创建相机
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.camera.position.set(0, 50, 100);
        this.camera.lookAt(0, 0, 0);
        
        // 创建渲染器
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // 将渲染器添加到容器
        this.container.appendChild(this.renderer.domElement);
        
        // 添加基础光照
        this.addLights();
        
        console.log('Three.js场景初始化完成');
    }
    
    /**
     * 添加光照
     */
    addLights() {
        // 环境光
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);
        
        // 方向光
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 50, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);
        
        // 点光源
        const pointLight = new THREE.PointLight(0x00aaff, 0.5, 100);
        pointLight.position.set(0, 20, 0);
        this.scene.add(pointLight);
    }
    
    /**
     * 创建基础场景
     */
    createBasicScene() {
        // 创建地面网格
        const gridHelper = new THREE.GridHelper(200, 20, 0x444444, 0x222222);
        this.scene.add(gridHelper);
        
        // 创建坐标轴辅助线
        const axesHelper = new THREE.AxesHelper(50);
        this.scene.add(axesHelper);
        
        // 创建一个简单的立方体作为测试对象
        const geometry = new THREE.BoxGeometry(10, 10, 10);
        const material = new THREE.MeshLambertMaterial({ color: 0x00ff00 });
        const cube = new THREE.Mesh(geometry, material);
        cube.position.set(0, 5, 0);
        cube.castShadow = true;
        cube.receiveShadow = true;
        this.scene.add(cube);
        
        // 保存立方体引用用于动画
        this.testCube = cube;
        
        console.log('基础场景创建完成');
    }
    
    /**
     * 检测设备性能
     */
    async detectPerformance() {
        const performanceInfo = {
            gpu: 'unknown',
            memory: navigator.deviceMemory || 'unknown',
            cores: navigator.hardwareConcurrency || 'unknown',
            score: 0
        };
        
        try {
            // GPU检测
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    performanceInfo.gpu = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                }
            }
            
            // 简单的性能基准测试
            const startTime = performance.now();
            let result = 0;
            for (let i = 0; i < 100000; i++) {
                result += Math.sqrt(i);
            }
            const endTime = performance.now();
            const testTime = endTime - startTime;
            
            // 计算性能得分 (时间越短得分越高)
            performanceInfo.score = Math.max(0, 100 - testTime);
            
            // 根据性能得分决定渲染模式
            if (this.renderMode === 'auto') {
                if (performanceInfo.score > 70) {
                    this.currentRenderer = 'threejs';
                    this.updatePerformanceDisplay('high', '高性能');
                } else if (performanceInfo.score > 40) {
                    this.currentRenderer = 'threejs';
                    this.updatePerformanceDisplay('medium', '中等性能');
                } else {
                    this.currentRenderer = 'canvas2d';
                    this.updatePerformanceDisplay('low', '低端设备');
                }
            }
            
            console.log('设备性能检测完成:', performanceInfo);
            
        } catch (error) {
            console.warn('性能检测失败:', error);
            this.currentRenderer = 'threejs'; // 默认使用3D模式
            this.updatePerformanceDisplay('medium', '未知');
        }
    }
    
    /**
     * 加载设备数据
     */
    async loadDevices() {
        try {
            const response = await fetch('/3d-visualization/api/devices');
            const result = await response.json();
            
            if (result.success) {
                this.devices = result.data;
                this.renderDeviceList();
                console.log('设备数据加载完成:', this.devices.length, '个设备');
            } else {
                throw new Error(result.error || '加载设备数据失败');
            }
        } catch (error) {
            console.error('加载设备数据失败:', error);
            // 使用模拟数据
            this.devices = [
                { id: 'test_device', name: '测试设备', type: 'sensor', x: 20, y: 10, z: 20 }
            ];
            this.renderDeviceList();
        }
    }
    
    /**
     * 渲染设备列表
     */
    renderDeviceList() {
        const deviceList = document.getElementById('device-list');
        if (!deviceList) return;
        
        deviceList.innerHTML = '';
        
        this.devices.forEach(device => {
            const deviceItem = document.createElement('div');
            deviceItem.className = 'device-item';
            deviceItem.dataset.deviceId = device.id;
            
            deviceItem.innerHTML = `
                <div class="device-name">${device.name}</div>
                <div class="device-status">
                    <span class="status-indicator normal"></span>
                    <span>正常运行</span>
                </div>
                <div class="device-value">数值: 加载中...</div>
            `;
            
            deviceItem.addEventListener('click', () => {
                this.selectDevice(device.id);
            });
            
            deviceList.appendChild(deviceItem);
        });
    }
    
    /**
     * 选择设备
     */
    selectDevice(deviceId) {
        // 移除其他设备的选中状态
        document.querySelectorAll('.device-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // 添加当前设备的选中状态
        const deviceItem = document.querySelector(`[data-device-id="${deviceId}"]`);
        if (deviceItem) {
            deviceItem.classList.add('active');
        }
        
        // 显示设备详情
        this.showDeviceDetails(deviceId);
        
        // 相机聚焦到设备
        this.focusOnDevice(deviceId);
    }
    
    /**
     * 显示设备详情
     */
    showDeviceDetails(deviceId) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) return;
        
        const deviceInfo = document.getElementById('device-info');
        if (!deviceInfo) return;
        
        deviceInfo.innerHTML = `
            <div class="detail-item">
                <span class="detail-label">设备名称:</span>
                <span class="detail-value">${device.name}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">设备类型:</span>
                <span class="detail-value">${device.type}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">位置坐标:</span>
                <span class="detail-value">(${device.x}, ${device.y}, ${device.z})</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">运行状态:</span>
                <span class="detail-value">正常</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">当前数值:</span>
                <span class="detail-value">待更新</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">最后更新:</span>
                <span class="detail-value">${new Date().toLocaleString()}</span>
            </div>
        `;
    }
    
    /**
     * 聚焦到设备
     */
    focusOnDevice(deviceId) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device || !this.camera) return;
        
        // 简单的相机移动动画
        const targetPosition = {
            x: device.x + 30,
            y: device.y + 20,
            z: device.z + 30
        };
        
        // 这里可以添加更复杂的相机动画
        this.camera.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
        this.camera.lookAt(device.x, device.y, device.z);
    }
    
    /**
     * 开始渲染循环
     */
    startRenderLoop() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.animate();
        console.log('渲染循环已启动');
    }
    
    /**
     * 停止渲染循环
     */
    stopRenderLoop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.isRunning = false;
        console.log('渲染循环已停止');
    }
    
    /**
     * 动画循环
     */
    animate() {
        if (!this.isRunning) return;
        
        this.animationId = requestAnimationFrame(this.animate);
        
        // 更新FPS计数
        this.updateFPS();
        
        // 执行动画
        this.update();
        
        // 渲染场景
        this.render();
    }
    
    /**
     * 更新逻辑
     */
    update() {
        // 旋转测试立方体
        if (this.testCube) {
            this.testCube.rotation.x += 0.01;
            this.testCube.rotation.y += 0.01;
        }
        
        // 这里可以添加更多更新逻辑
    }
    
    /**
     * 渲染场景
     */
    render() {
        if (this.currentRenderer === 'threejs' && this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        } else if (this.currentRenderer === 'canvas2d' && this.ctx2d) {
            this.renderCanvas2D();
        }
    }
    
    /**
     * Canvas 2D渲染
     */
    renderCanvas2D() {
        const canvas = this.canvas2d;
        const ctx = this.ctx2d;
        
        // 清空画布
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 设置背景色
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 绘制网格
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 1;
        
        const gridSize = 20;
        for (let i = 0; i <= canvas.width; i += gridSize) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, canvas.height);
            ctx.stroke();
        }
        
        for (let i = 0; i <= canvas.height; i += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(canvas.width, i);
            ctx.stroke();
        }
        
        // 绘制简单的设备表示
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(canvas.width / 2 - 10, canvas.height / 2 - 10, 20, 20);
        
        // 添加文字
        ctx.fillStyle = '#ffffff';
        ctx.font = '16px Arial';
        ctx.fillText('2D降级模式', 10, 30);
    }
    
    /**
     * 更新FPS计数
     */
    updateFPS() {
        this.frameCount++;
        const currentTime = performance.now();
        
        if (currentTime - this.lastTime >= 1000) {
            this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
            this.frameCount = 0;
            this.lastTime = currentTime;
            
            // 更新FPS显示
            const fpsCounter = document.getElementById('fps-counter');
            if (fpsCounter) {
                fpsCounter.textContent = this.fps;
            }
        }
    }
    
    /**
     * 设置渲染模式
     */
    setRenderMode(mode) {
        this.renderMode = mode;
        
        switch (mode) {
            case '3d':
                this.currentRenderer = 'threejs';
                this.showThreeJS();
                break;
            case '2d':
                this.currentRenderer = 'canvas2d';
                this.showCanvas2D();
                break;
            case 'auto':
                this.detectPerformance();
                break;
        }
        
        // 更新显示
        const renderModeSpan = document.getElementById('render-mode');
        if (renderModeSpan) {
            renderModeSpan.textContent = mode === 'auto' ? '自动' : 
                                        mode === '3d' ? '3D模式' : '2D模式';
        }
        
        console.log('渲染模式已切换为:', mode);
    }
    
    /**
     * 显示Three.js渲染
     */
    showThreeJS() {
        if (this.container) {
            this.container.style.display = 'block';
        }
        if (this.canvas2d) {
            this.canvas2d.style.display = 'none';
        }
    }
    
    /**
     * 显示Canvas 2D渲染
     */
    showCanvas2D() {
        if (this.container) {
            this.container.style.display = 'none';
        }
        if (this.canvas2d) {
            this.canvas2d.style.display = 'block';
            // 调整canvas尺寸
            this.resizeCanvas2D();
        }
    }
    
    /**
     * 调整Canvas 2D尺寸
     */
    resizeCanvas2D() {
        const parent = this.canvas2d.parentElement;
        this.canvas2d.width = parent.clientWidth;
        this.canvas2d.height = parent.clientHeight;
    }
    
    /**
     * 更新性能显示
     */
    updatePerformanceDisplay(level, text) {
        const statusElement = document.getElementById('performance-status');
        const performanceElement = document.getElementById('device-performance');
        
        if (statusElement) {
            statusElement.textContent = `设备性能: ${text}`;
            statusElement.className = `status ${level}`;
        }
        
        if (performanceElement) {
            performanceElement.textContent = text;
        }
    }
    
    /**
     * 更新设备数据
     */
    updateDeviceData() {
        // 这里可以从服务器获取最新的设备数据
        // 暂时使用模拟数据
        this.devices.forEach(device => {
            const deviceItem = document.querySelector(`[data-device-id="${device.id}"]`);
            if (deviceItem) {
                const valueElement = deviceItem.querySelector('.device-value');
                if (valueElement) {
                    valueElement.textContent = `数值: ${(Math.random() * 100).toFixed(2)}`;
                }
            }
        });
    }
    
    /**
     * 绑定事件
     */
    bindEvents() {
        window.addEventListener('resize', this.onWindowResize);
    }
    
    /**
     * 解绑事件
     */
    unbindEvents() {
        window.removeEventListener('resize', this.onWindowResize);
    }
    
    /**
     * 窗口大小改变事件
     */
    onWindowResize() {
        if (!this.container) return;
        
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        // 更新相机
        if (this.camera) {
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
        }
        
        // 更新渲染器
        if (this.renderer) {
            this.renderer.setSize(width, height);
        }
        
        // 更新Canvas 2D
        if (this.currentRenderer === 'canvas2d') {
            this.resizeCanvas2D();
        }
    }
    
    /**
     * 隐藏加载动画
     */
    hideLoading() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = 'none';
        }
    }
    
    /**
     * 显示错误信息
     */
    showError(message) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.innerHTML = `<div style="color: #ff6b6b;">${message}</div>`;
        }
    }
    
    /**
     * 销毁引擎
     */
    destroy() {
        this.stopRenderLoop();
        this.unbindEvents();
        
        if (this.renderer) {
            this.renderer.dispose();
        }
        
        if (this.container && this.renderer) {
            this.container.removeChild(this.renderer.domElement);
        }
        
        console.log('3D引擎已销毁');
    }
}

// 将类添加到全局作用域
window.ThreeDEngine = ThreeDEngine; 