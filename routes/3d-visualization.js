const express = require('express');
const router = express.Router();
const path = require('path');

// 3D可视化大屏页面路由
router.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/3d-dashboard.html'));
});

// 获取3D场景配置
router.get('/api/scene-config', (req, res) => {
    try {
        // 这里将来会从配置文件或数据库读取场景配置
        const sceneConfig = {
            layout: {
                width: 1000,
                height: 800,
                depth: 600
            },
            areas: [
                { name: '进水区', x: -400, y: 0, z: -200, width: 200, height: 100, depth: 200 },
                { name: '处理区', x: 0, y: 0, z: 0, width: 400, height: 100, depth: 400 },
                { name: '出水区', x: 400, y: 0, z: 200, width: 200, height: 100, depth: 200 }
            ]
        };
        res.json({ success: true, data: sceneConfig });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取设备列表和位置信息
router.get('/api/devices', (req, res) => {
    try {
        // 这里将来会从数据库读取设备信息
        const devices = [
            { id: 'cod_sensor_1', name: 'COD传感器1', type: 'sensor', x: -300, y: 50, z: -100 },
            { id: 'ph_sensor_1', name: 'pH传感器1', type: 'sensor', x: -200, y: 50, z: -100 },
            { id: 'pump_1', name: '进水泵1', type: 'pump', x: -350, y: 0, z: -150 },
            { id: 'pump_2', name: '出水泵1', type: 'pump', x: 450, y: 0, z: 250 }
        ];
        res.json({ success: true, data: devices });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取设备实时数据
router.get('/api/device-data/:deviceId', (req, res) => {
    try {
        const deviceId = req.params.deviceId;
        // 这里将来会从实时数据系统获取设备数据
        const deviceData = {
            id: deviceId,
            status: 'normal', // normal, warning, error
            value: Math.random() * 100,
            timestamp: new Date().toISOString()
        };
        res.json({ success: true, data: deviceData });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router; 