<template>
  <view class="container">
    <view class="header">
      <text class="title">MQTT数据监控</text>
      <view class="refresh-btn" @click="fetchData">
        <text class="refresh-text">刷新</text>
      </view>
    </view>
    
    <view class="data-cards">
      <view v-for="(item, index) in sensorData" :key="index" class="data-card">
        <view class="card-header">
          <text class="sensor-name">{{ getSensorDisplayName(item.name) }}</text>
          <text class="timestamp">{{ formatTime(item.timestamp) }}</text>
        </view>
        <view class="card-body">
          <text class="value">{{ formatValue(item.value) }} {{ getSensorUnit(item.name) }}</text>
        </view>
      </view>
    </view>
    
    <view v-if="loading" class="loading">
      <text>加载中...</text>
    </view>
    
    <view v-if="sensorData.length === 0 && !loading" class="empty-data">
      <text>暂无数据</text>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

// 数据状态
const sensorData = ref([]);
const loading = ref(true);
let ws = null;

// 获取数据
const fetchData = async () => {
  loading.value = true;
  try {
    const response = await uni.request({
      url: 'http://localhost:3000/api/data',
      method: 'GET'
    });
    
    if (response.statusCode === 200) {
      sensorData.value = response.data;
    } else {
      uni.showToast({
        title: '获取数据失败',
        icon: 'none'
      });
    }
  } catch (error) {
    console.error('获取数据失败:', error);
    uni.showToast({
      title: '网络错误',
      icon: 'none'
    });
  } finally {
    loading.value = false;
  }
};

// 初始化WebSocket连接
const initWebSocket = () => {
  ws = new WebSocket('ws://localhost:3000');
  
  ws.onopen = () => {
    console.log('WebSocket连接已建立');
  };
  
  ws.onmessage = (event) => {
    try {
      const newData = JSON.parse(event.data);
      // 将新数据添加到列表顶部
      sensorData.value.unshift(newData);
      // 保持列表不超过20条
      if (sensorData.value.length > 20) {
        sensorData.value = sensorData.value.slice(0, 20);
      }
    } catch (error) {
      console.error('解析WebSocket消息失败:', error);
    }
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket错误:', error);
  };
  
  ws.onclose = () => {
    console.log('WebSocket连接已关闭');
    // 尝试重新连接
    setTimeout(initWebSocket, 5000);
  };
};

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())} ${padZero(date.getHours())}:${padZero(date.getMinutes())}:${padZero(date.getSeconds())}`;
};

// 数字补零
const padZero = (num) => {
  return num < 10 ? `0${num}` : num;
};

// 格式化传感器值
const formatValue = (value) => {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch (e) {
      // 如果不是JSON字符串，保持原样
    }
  }
  
  if (typeof value === 'number') {
    return value.toFixed(2);
  }
  
  return value;
};

// 获取传感器显示名称
const getSensorDisplayName = (name) => {
  const nameMap = {
    'temperature': '温度',
    'humidity': '湿度',
    'pressure': '气压',
    'light': '光照',
    'co2': '二氧化碳',
    'pm25': 'PM2.5'
  };
  
  return nameMap[name] || name;
};

// 获取传感器单位
const getSensorUnit = (name) => {
  const unitMap = {
    'temperature': '°C',
    'humidity': '%',
    'pressure': 'hPa',
    'light': 'lux',
    'co2': 'ppm',
    'pm25': 'μg/m³'
  };
  
  return unitMap[name] || '';
};

// 生命周期钩子
onMounted(() => {
  fetchData();
  initWebSocket();
});

onUnmounted(() => {
  if (ws) {
    ws.close();
  }
});
</script>

<style>
.container {
  padding: 30rpx;
  background-color: #f5f5f5;
  min-height: 100vh;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30rpx;
}

.title {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
}

.refresh-btn {
  background-color: #007AFF;
  padding: 15rpx 30rpx;
  border-radius: 10rpx;
}

.refresh-text {
  color: #fff;
  font-size: 28rpx;
}

.data-cards {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.data-card {
  background-color: #fff;
  border-radius: 20rpx;
  padding: 30rpx;
  box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.05);
}

.card-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.sensor-name {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.timestamp {
  font-size: 24rpx;
  color: #999;
}

.card-body {
  display: flex;
  align-items: center;
}

.value {
  font-size: 48rpx;
  color: #007AFF;
  font-weight: bold;
}

.loading {
  text-align: center;
  margin-top: 100rpx;
  color: #999;
}

.empty-data {
  text-align: center;
  margin-top: 100rpx;
  color: #999;
}
</style> 