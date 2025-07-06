/**
 * 污水处理站3D可视化引擎核心模块
 * 版本: 1.0.0
 * 作者: 污水处理站监控系统
 * 描述: 提供3D场景管理、设备建模、交互控制等核心功能
 */

class ThreeDEngine {
    constructor() {
        console.log('🔧 初始化3D引擎核心模块...');
        
        // 核心组件
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.raycaster = null;
        this.mouse = new THREE.Vector2();
        
        // 场景元素
        this.devices = [];
        this.lights = [];
        this.environment = null;
        this.waterTanks = [];
        this.pumpStations = [];
        this.pipeSystems = [];
        
        // 状态管理
        this.isInitialized = false;
        this.renderMode = 'auto'; // auto, 3d, 2d
        this.performanceMode = 'high'; // high, medium, low
        this.selectedDevice = null;
        
        // 性能监控
        this.stats = {
            fps: 0,
            frameTime: 0,
            memoryUsage: 0,
            drawCalls: 0
        };
        
        // 数据连接
        this.dataConnector = null;
        this.lastDataUpdate = Date.now();
        
        // 动画系统
        this.animationMixer = null;
        this.clock = new THREE.Clock();
        
        // 事件监听器
        this.eventListeners = new Map();
        
        console.log('✅ 3D引擎核心模块初始化完成');
    }
    
    /**
     * 初始化3D引擎
     */
    async init() {
        console.log('🚀 开始初始化3D引擎...');
        
        try {
            // 按顺序初始化各个组件
            await this.initRenderer();
            await this.initScene();
            await this.initCamera();
            await this.initLights();
            await this.initControls();
            await this.initRaycaster();
            await this.createEnvironment();
            await this.createDevices();
            await this.setupEventListeners();
            await this.startRenderLoop();
            
            this.isInitialized = true;
            console.log('🎉 3D引擎初始化完成!');
            
            // 触发初始化完成事件
            this.emit('initialized');
            
        } catch (error) {
            console.error('❌ 3D引擎初始化失败:', error);
            throw error;
        }
    }
    
    /**
     * 初始化渲染器
     */
    async initRenderer() {
        console.log('🖥️ 初始化渲染器...');
        
        const container = document.getElementById('threejs-container');
        if (!container) {
            throw new Error('未找到3D容器元素');
        }
        
        // 创建WebGL渲染器
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance'
        });
        
        // 设置渲染器属性
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        
        // 设置背景色
        this.renderer.setClearColor(0x0a0a0a, 1);
        
        // 添加到容器
        container.appendChild(this.renderer.domElement);
        
        // 处理窗口大小变化
        window.addEventListener('resize', () => this.onWindowResize());
        
        console.log('✅ 渲染器初始化完成');
    }
    
    /**
     * 初始化场景
     */
    async initScene() {
        console.log('🌍 初始化场景...');
        
        this.scene = new THREE.Scene();
        
        // 设置雾效果
        this.scene.fog = new THREE.Fog(0x0a0a0a, 10, 1000);
        
        // 添加天空盒
        await this.createSkybox();
        
        console.log('✅ 场景初始化完成');
    }
    
    /**
     * 初始化摄像机
     */
    async initCamera() {
        console.log('📷 初始化摄像机...');
        
        const container = document.getElementById('threejs-container');
        const aspect = container.clientWidth / container.clientHeight;
        
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 2000);
        this.camera.position.set(50, 30, 50);
        this.camera.lookAt(0, 0, 0);
        
        console.log('✅ 摄像机初始化完成');
    }
    
    /**
     * 初始化光照系统
     */
    async initLights() {
        console.log('💡 初始化光照系统...');
        
        // 环境光
        const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
        this.scene.add(ambientLight);
        this.lights.push(ambientLight);
        
        // 主方向光（太阳光）
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(100, 100, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 500;
        directionalLight.shadow.camera.left = -100;
        directionalLight.shadow.camera.right = 100;
        directionalLight.shadow.camera.top = 100;
        directionalLight.shadow.camera.bottom = -100;
        this.scene.add(directionalLight);
        this.lights.push(directionalLight);
        
        // 补充光源
        const fillLight = new THREE.DirectionalLight(0x4a90e2, 0.3);
        fillLight.position.set(-50, 50, -50);
        this.scene.add(fillLight);
        this.lights.push(fillLight);
        
        // 点光源（设备照明）
        const pointLight = new THREE.PointLight(0xffffff, 0.5, 100);
        pointLight.position.set(0, 20, 0);
        pointLight.castShadow = true;
        this.scene.add(pointLight);
        this.lights.push(pointLight);
        
        console.log('✅ 光照系统初始化完成');
    }
    
    /**
     * 初始化控制器
     */
    async initControls() {
        console.log('🎮 初始化控制器...');
        
        // 检查OrbitControls是否可用
        if (typeof THREE.OrbitControls === 'undefined') {
            console.warn('⚠️ OrbitControls不可用，使用基础控制器');
            return;
        }
        
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;
        this.controls.minDistance = 10;
        this.controls.maxDistance = 500;
        this.controls.maxPolarAngle = Math.PI / 2;
        
        console.log('✅ 控制器初始化完成');
    }
    
    /**
     * 初始化射线检测器
     */
    async initRaycaster() {
        console.log('🎯 初始化射线检测器...');
        
        this.raycaster = new THREE.Raycaster();
        
        console.log('✅ 射线检测器初始化完成');
    }
    
    /**
     * 创建天空盒
     */
    async createSkybox() {
        console.log('🌌 创建天空盒...');
        
        const geometry = new THREE.SphereGeometry(1000, 32, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0x1a1a2e,
            side: THREE.BackSide
        });
        
        const skybox = new THREE.Mesh(geometry, material);
        this.scene.add(skybox);
        
        console.log('✅ 天空盒创建完成');
    }
    
    /**
     * 创建环境
     */
    async createEnvironment() {
        console.log('🏗️ 创建环境...');
        
        // 创建地面
        const groundGeometry = new THREE.PlaneGeometry(200, 200);
        const groundMaterial = new THREE.MeshLambertMaterial({
            color: 0x2c3e50,
            transparent: true,
            opacity: 0.8
        });
        
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        
        // 创建网格辅助线
        const gridHelper = new THREE.GridHelper(200, 20, 0x444444, 0x222222);
        this.scene.add(gridHelper);
        
        // 创建坐标轴辅助器
        const axesHelper = new THREE.AxesHelper(20);
        this.scene.add(axesHelper);
        
        console.log('✅ 环境创建完成');
    }
    
    /**
     * 创建设备
     */
    async createDevices() {
        console.log('🏭 创建设备...');
        
        // 创建示例设备
        await this.createSampleDevices();
        
        console.log('✅ 设备创建完成');
    }
    
    /**
     * 创建示例设备
     */
    async createSampleDevices() {
        // 创建污水池
        const waterTank = this.createWaterTank(
            new THREE.Vector3(0, 0, 0),
            { width: 20, height: 8, depth: 15 },
            0.7 // 水位70%
        );
        this.waterTanks.push(waterTank);
        
        // 创建泵站
        const pumpStation = this.createPumpStation(
            new THREE.Vector3(30, 0, 0),
            'centrifugal',
            'running'
        );
        this.pumpStations.push(pumpStation);
        
        // 创建管道系统
        const pipeSystem = this.createPipeSystem(
            new THREE.Vector3(10, 2, 0),
            new THREE.Vector3(25, 2, 0),
            0.5
        );
        this.pipeSystems.push(pipeSystem);
        
        // 创建监测设备
        const monitorDevice = this.createMonitorDevice(
            new THREE.Vector3(-20, 0, 20),
            'COD_MONITOR'
        );
        this.devices.push(monitorDevice);
    }
    
    /**
     * 创建污水池
     */
    createWaterTank(position, size, waterLevel) {
        const group = new THREE.Group();
        group.position.copy(position);
        
        // 水池外壳
        const tankGeometry = new THREE.BoxGeometry(size.width, size.height, size.depth);
        const tankMaterial = new THREE.MeshPhongMaterial({
            color: 0x34495e,
            transparent: true,
            opacity: 0.8
        });
        
        const tank = new THREE.Mesh(tankGeometry, tankMaterial);
        tank.position.y = size.height / 2;
        tank.castShadow = true;
        tank.receiveShadow = true;
        group.add(tank);
        
        // 水面
        const waterGeometry = new THREE.PlaneGeometry(size.width - 0.2, size.depth - 0.2);
        const waterMaterial = new THREE.MeshPhongMaterial({
            color: 0x3498db,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        
        const water = new THREE.Mesh(waterGeometry, waterMaterial);
        water.rotation.x = -Math.PI / 2;
        water.position.y = size.height * waterLevel;
        group.add(water);
        
        // 添加设备信息
        group.userData = {
            type: 'water_tank',
            id: 'tank_' + Date.now(),
            size: size,
            waterLevel: waterLevel,
            capacity: size.width * size.height * size.depth,
            currentVolume: size.width * size.height * size.depth * waterLevel
        };
        
        this.scene.add(group);
        return group;
    }
    
    /**
     * 创建泵站
     */
    createPumpStation(position, type, status) {
        const group = new THREE.Group();
        group.position.copy(position);
        
        // 泵体
        const pumpGeometry = new THREE.CylinderGeometry(2, 2, 4, 8);
        const pumpMaterial = new THREE.MeshPhongMaterial({
            color: status === 'running' ? 0x27ae60 : 0xe74c3c
        });
        
        const pump = new THREE.Mesh(pumpGeometry, pumpMaterial);
        pump.position.y = 2;
        pump.castShadow = true;
        pump.receiveShadow = true;
        group.add(pump);
        
        // 基座
        const baseGeometry = new THREE.BoxGeometry(6, 1, 6);
        const baseMaterial = new THREE.MeshPhongMaterial({
            color: 0x2c3e50
        });
        
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.y = 0.5;
        base.castShadow = true;
        base.receiveShadow = true;
        group.add(base);
        
        // 状态指示灯
        const lightGeometry = new THREE.SphereGeometry(0.3, 8, 8);
        const lightMaterial = new THREE.MeshBasicMaterial({
            color: status === 'running' ? 0x00ff00 : 0xff0000,
            emissive: status === 'running' ? 0x004400 : 0x440000
        });
        
        const statusLight = new THREE.Mesh(lightGeometry, lightMaterial);
        statusLight.position.set(0, 4.5, 0);
        group.add(statusLight);
        
        // 添加设备信息
        group.userData = {
            type: 'pump_station',
            id: 'pump_' + Date.now(),
            pumpType: type,
            status: status,
            flow: status === 'running' ? 150 : 0, // L/min
            power: status === 'running' ? 5.5 : 0, // kW
            efficiency: status === 'running' ? 85 : 0 // %
        };
        
        this.scene.add(group);
        return group;
    }
    
    /**
     * 创建管道系统
     */
    createPipeSystem(startPoint, endPoint, diameter) {
        const group = new THREE.Group();
        
        // 计算管道方向和长度
        const direction = new THREE.Vector3().subVectors(endPoint, startPoint);
        const length = direction.length();
        
        // 创建管道
        const pipeGeometry = new THREE.CylinderGeometry(diameter, diameter, length, 8);
        const pipeMaterial = new THREE.MeshPhongMaterial({
            color: 0x7f8c8d,
            metalness: 0.3,
            roughness: 0.7
        });
        
        const pipe = new THREE.Mesh(pipeGeometry, pipeMaterial);
        
        // 设置管道位置和方向
        pipe.position.copy(startPoint).add(endPoint).multiplyScalar(0.5);
        pipe.lookAt(endPoint);
        pipe.rotateX(Math.PI / 2);
        
        pipe.castShadow = true;
        pipe.receiveShadow = true;
        group.add(pipe);
        
        // 添加流体动画效果
        const flowGeometry = new THREE.CylinderGeometry(diameter * 0.8, diameter * 0.8, length, 8);
        const flowMaterial = new THREE.MeshBasicMaterial({
            color: 0x3498db,
            transparent: true,
            opacity: 0.3
        });
        
        const flow = new THREE.Mesh(flowGeometry, flowMaterial);
        flow.position.copy(pipe.position);
        flow.rotation.copy(pipe.rotation);
        group.add(flow);
        
        // 添加设备信息
        group.userData = {
            type: 'pipe_system',
            id: 'pipe_' + Date.now(),
            startPoint: startPoint,
            endPoint: endPoint,
            diameter: diameter,
            length: length,
            flowRate: 100, // L/min
            pressure: 2.5, // bar
            temperature: 25 // °C
        };
        
        this.scene.add(group);
        return group;
    }
    
    /**
     * 创建监测设备
     */
    createMonitorDevice(position, deviceType) {
        const group = new THREE.Group();
        group.position.copy(position);
        
        // 设备主体
        const deviceGeometry = new THREE.BoxGeometry(2, 3, 1);
        const deviceMaterial = new THREE.MeshPhongMaterial({
            color: 0x34495e
        });
        
        const device = new THREE.Mesh(deviceGeometry, deviceMaterial);
        device.position.y = 1.5;
        device.castShadow = true;
        device.receiveShadow = true;
        group.add(device);
        
        // 显示屏
        const screenGeometry = new THREE.PlaneGeometry(1.5, 1);
        const screenMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            emissive: 0x001100
        });
        
        const screen = new THREE.Mesh(screenGeometry, screenMaterial);
        screen.position.set(0, 1.8, 0.51);
        group.add(screen);
        
        // 支架
        const poleGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1.5, 8);
        const poleMaterial = new THREE.MeshPhongMaterial({
            color: 0x2c3e50
        });
        
        const pole = new THREE.Mesh(poleGeometry, poleMaterial);
        pole.position.y = 0.75;
        group.add(pole);
        
        // 添加设备信息
        group.userData = {
            type: 'monitor_device',
            id: 'monitor_' + Date.now(),
            deviceType: deviceType,
            status: 'online',
            lastReading: Math.random() * 100,
            unit: deviceType === 'COD_MONITOR' ? 'mg/L' : 'pH',
            calibrationDate: new Date().toISOString().split('T')[0]
        };
        
        this.scene.add(group);
        return group;
    }
    
    /**
     * 设置事件监听器
     */
    async setupEventListeners() {
        console.log('👂 设置事件监听器...');
        
        // 鼠标点击事件
        this.renderer.domElement.addEventListener('click', (event) => {
            this.onMouseClick(event);
        });
        
        // 鼠标移动事件
        this.renderer.domElement.addEventListener('mousemove', (event) => {
            this.onMouseMove(event);
        });
        
        console.log('✅ 事件监听器设置完成');
    }
    
    /**
     * 鼠标点击事件处理
     */
    onMouseClick(event) {
        // 计算鼠标位置
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        // 射线检测
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);
        
        if (intersects.length > 0) {
            const clickedObject = intersects[0].object;
            const device = this.findDeviceByObject(clickedObject);
            
            if (device) {
                this.selectDevice(device);
            }
        }
    }
    
    /**
     * 鼠标移动事件处理
     */
    onMouseMove(event) {
        // 更新鼠标位置
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }
    
    /**
     * 查找设备对象
     */
    findDeviceByObject(object) {
        let current = object;
        while (current) {
            if (current.userData && current.userData.type) {
                return current;
            }
            current = current.parent;
        }
        return null;
    }
    
    /**
     * 选择设备
     */
    selectDevice(device) {
        console.log('🎯 选择设备:', device.userData);
        
        // 取消之前的选择
        if (this.selectedDevice) {
            this.unselectDevice(this.selectedDevice);
        }
        
        // 设置新的选择
        this.selectedDevice = device;
        this.highlightDevice(device);
        
        // 更新UI
        this.updateDeviceInfo(device);
        
        // 触发选择事件
        this.emit('deviceSelected', device);
    }
    
    /**
     * 取消选择设备
     */
    unselectDevice(device) {
        this.unhighlightDevice(device);
    }
    
    /**
     * 高亮设备
     */
    highlightDevice(device) {
        device.traverse((child) => {
            if (child.isMesh && child.material) {
                // 保存原始材质
                if (!child.userData.originalMaterial) {
                    child.userData.originalMaterial = child.material.clone();
                }
                
                // 应用高亮效果
                child.material.emissive = new THREE.Color(0x444444);
            }
        });
    }
    
    /**
     * 取消高亮设备
     */
    unhighlightDevice(device) {
        device.traverse((child) => {
            if (child.isMesh && child.userData.originalMaterial) {
                child.material.emissive = new THREE.Color(0x000000);
            }
        });
    }
    
    /**
     * 更新设备信息显示
     */
    updateDeviceInfo(device) {
        const infoPanel = document.getElementById('device-info');
        if (!infoPanel) return;
        
        const data = device.userData;
        let html = `
            <div class="device-info-header">
                <h5>${this.getDeviceTypeName(data.type)}</h5>
                <span class="device-id">${data.id}</span>
            </div>
            <div class="device-info-content">
        `;
        
        // 根据设备类型显示不同信息
        switch (data.type) {
            case 'water_tank':
                html += `
                    <div class="info-item">
                        <span class="label">容量:</span>
                        <span class="value">${data.capacity.toFixed(1)} L</span>
                    </div>
                    <div class="info-item">
                        <span class="label">当前水位:</span>
                        <span class="value">${(data.waterLevel * 100).toFixed(1)}%</span>
                    </div>
                    <div class="info-item">
                        <span class="label">当前水量:</span>
                        <span class="value">${data.currentVolume.toFixed(1)} L</span>
                    </div>
                `;
                break;
                
            case 'pump_station':
                html += `
                    <div class="info-item">
                        <span class="label">状态:</span>
                        <span class="value status-${data.status}">${data.status === 'running' ? '运行中' : '停止'}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">流量:</span>
                        <span class="value">${data.flow} L/min</span>
                    </div>
                    <div class="info-item">
                        <span class="label">功率:</span>
                        <span class="value">${data.power} kW</span>
                    </div>
                    <div class="info-item">
                        <span class="label">效率:</span>
                        <span class="value">${data.efficiency}%</span>
                    </div>
                `;
                break;
                
            case 'pipe_system':
                html += `
                    <div class="info-item">
                        <span class="label">直径:</span>
                        <span class="value">${data.diameter} m</span>
                    </div>
                    <div class="info-item">
                        <span class="label">长度:</span>
                        <span class="value">${data.length.toFixed(1)} m</span>
                    </div>
                    <div class="info-item">
                        <span class="label">流量:</span>
                        <span class="value">${data.flowRate} L/min</span>
                    </div>
                    <div class="info-item">
                        <span class="label">压力:</span>
                        <span class="value">${data.pressure} bar</span>
                    </div>
                `;
                break;
                
            case 'monitor_device':
                html += `
                    <div class="info-item">
                        <span class="label">设备类型:</span>
                        <span class="value">${data.deviceType}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">状态:</span>
                        <span class="value status-${data.status}">${data.status === 'online' ? '在线' : '离线'}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">最新读数:</span>
                        <span class="value">${data.lastReading.toFixed(2)} ${data.unit}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">校准日期:</span>
                        <span class="value">${data.calibrationDate}</span>
                    </div>
                `;
                break;
        }
        
        html += '</div>';
        infoPanel.innerHTML = html;
    }
    
    /**
     * 获取设备类型名称
     */
    getDeviceTypeName(type) {
        const names = {
            'water_tank': '污水池',
            'pump_station': '泵站',
            'pipe_system': '管道系统',
            'monitor_device': '监测设备'
        };
        return names[type] || type;
    }
    
    /**
     * 开始渲染循环
     */
    startRenderLoop() {
        console.log('🔄 开始渲染循环...');
        
        const animate = () => {
            requestAnimationFrame(animate);
            
            // 更新控制器
            if (this.controls) {
                this.controls.update();
            }
            
            // 更新动画
            const delta = this.clock.getDelta();
            if (this.animationMixer) {
                this.animationMixer.update(delta);
            }
            
            // 更新性能统计
            this.updateStats();
            
            // 渲染场景
            this.renderer.render(this.scene, this.camera);
        };
        
        animate();
        console.log('✅ 渲染循环启动完成');
    }
    
    /**
     * 更新性能统计
     */
    updateStats() {
        // 简单的FPS计算
        const now = Date.now();
        if (this.lastFrameTime) {
            const delta = now - this.lastFrameTime;
            this.stats.fps = Math.round(1000 / delta);
            this.stats.frameTime = delta;
        }
        this.lastFrameTime = now;
        
        // 更新UI显示
        const fpsElement = document.getElementById('fps-counter');
        if (fpsElement) {
            fpsElement.textContent = this.stats.fps;
        }
    }
    
    /**
     * 处理窗口大小变化
     */
    onWindowResize() {
        const container = document.getElementById('threejs-container');
        if (!container) return;
        
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(width, height);
    }
    
    /**
     * 设置渲染模式
     */
    setRenderMode(mode) {
        console.log('🎨 设置渲染模式:', mode);
        
        this.renderMode = mode;
        
        // 更新UI显示
        const modeElement = document.getElementById('render-mode');
        if (modeElement) {
            modeElement.textContent = mode === 'auto' ? '自动' : (mode === '3d' ? '3D模式' : '2D模式');
        }
        
        // 根据模式调整渲染设置
        switch (mode) {
            case 'high':
                this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                this.renderer.shadowMap.enabled = true;
                break;
            case 'medium':
                this.renderer.setPixelRatio(1);
                this.renderer.shadowMap.enabled = true;
                break;
            case 'low':
                this.renderer.setPixelRatio(1);
                this.renderer.shadowMap.enabled = false;
                break;
        }
    }
    
    /**
     * 更新设备数据
     */
    updateDeviceData() {
        // 模拟数据更新
        this.devices.forEach(device => {
            if (device.userData.type === 'monitor_device') {
                device.userData.lastReading = Math.random() * 100;
            }
        });
        
        // 更新泵站状态
        this.pumpStations.forEach(pump => {
            const isRunning = Math.random() > 0.3;
            pump.userData.status = isRunning ? 'running' : 'stopped';
            pump.userData.flow = isRunning ? 100 + Math.random() * 100 : 0;
            
            // 更新状态灯颜色
            pump.traverse((child) => {
                if (child.material && child.material.emissive) {
                    child.material.color.setHex(isRunning ? 0x00ff00 : 0xff0000);
                    child.material.emissive.setHex(isRunning ? 0x004400 : 0x440000);
                }
            });
        });
        
        // 如果有选中的设备，更新其信息显示
        if (this.selectedDevice) {
            this.updateDeviceInfo(this.selectedDevice);
        }
    }
    
    /**
     * 事件发射器
     */
    emit(eventName, data) {
        const listeners = this.eventListeners.get(eventName);
        if (listeners) {
            listeners.forEach(listener => listener(data));
        }
    }
    
    /**
     * 添加事件监听器
     */
    on(eventName, listener) {
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, []);
        }
        this.eventListeners.get(eventName).push(listener);
    }
    
    /**
     * 销毁引擎
     */
    destroy() {
        console.log('🗑️ 销毁3D引擎...');
        
        // 停止渲染循环
        if (this.renderer) {
            this.renderer.dispose();
        }
        
        // 清理场景
        if (this.scene) {
            this.scene.clear();
        }
        
        // 移除事件监听器
        window.removeEventListener('resize', this.onWindowResize);
        
        console.log('✅ 3D引擎销毁完成');
    }
}

// 导出到全局
window.ThreeDEngine = ThreeDEngine;

console.log('📦 3D引擎核心模块加载完成'); 