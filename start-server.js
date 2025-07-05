const { spawn } = require('child_process');
const path = require('path');

class ServerManager {
  constructor() {
    this.serverProcess = null;
    this.restartCount = 0;
    this.maxRestarts = 10;
    this.restartDelay = 5000; // 5秒
    this.isShuttingDown = false;
  }

  start() {
    console.log('启动服务器管理器...');
    
    // 设置进程退出处理
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
      console.error('服务器管理器未捕获异常:', error);
      this.restart('uncaughtException');
    });

    this.startServer();
  }

  startServer() {
    if (this.isShuttingDown) {
      console.log('正在关闭中，不启动新的服务器进程');
      return;
    }

    console.log(`启动服务器进程 (重启次数: ${this.restartCount}/${this.maxRestarts})`);
    
    // 启动服务器进程
    this.serverProcess = spawn('node', ['server.js'], {
      stdio: 'inherit',
      cwd: __dirname
    });

    // 监听进程退出
    this.serverProcess.on('exit', (code, signal) => {
      console.log(`服务器进程退出: 代码=${code}, 信号=${signal}`);
      
      if (!this.isShuttingDown) {
        if (code === 0) {
          console.log('服务器正常退出');
        } else {
          console.error(`服务器异常退出，代码: ${code}`);
          this.restart('exit');
        }
      }
    });

    // 监听进程错误
    this.serverProcess.on('error', (error) => {
      console.error('服务器进程错误:', error);
      if (!this.isShuttingDown) {
        this.restart('error');
      }
    });

    // 重置重启计数器（如果服务器运行超过5分钟）
    setTimeout(() => {
      if (this.serverProcess && !this.serverProcess.killed) {
        console.log('服务器稳定运行5分钟，重置重启计数器');
        this.restartCount = 0;
      }
    }, 5 * 60 * 1000);
  }

  restart(reason) {
    if (this.isShuttingDown) {
      return;
    }

    console.log(`准备重启服务器，原因: ${reason}`);
    
    // 检查重启次数
    if (this.restartCount >= this.maxRestarts) {
      console.error(`已达到最大重启次数 (${this.maxRestarts})，停止重启`);
      this.shutdown('maxRestartsReached');
      return;
    }

    this.restartCount++;

    // 清理当前进程
    if (this.serverProcess && !this.serverProcess.killed) {
      console.log('终止当前服务器进程...');
      this.serverProcess.kill('SIGTERM');
      
      // 如果5秒后进程还没退出，强制杀死
      setTimeout(() => {
        if (this.serverProcess && !this.serverProcess.killed) {
          console.log('强制终止服务器进程...');
          this.serverProcess.kill('SIGKILL');
        }
      }, 5000);
    }

    // 延迟重启
    console.log(`${this.restartDelay/1000}秒后重启服务器...`);
    setTimeout(() => {
      this.startServer();
    }, this.restartDelay);
  }

  shutdown(reason) {
    if (this.isShuttingDown) {
      return;
    }

    console.log(`关闭服务器管理器，原因: ${reason}`);
    this.isShuttingDown = true;

    if (this.serverProcess && !this.serverProcess.killed) {
      console.log('正在关闭服务器进程...');
      this.serverProcess.kill('SIGTERM');
      
      // 给进程5秒时间优雅退出
      setTimeout(() => {
        if (this.serverProcess && !this.serverProcess.killed) {
          console.log('强制关闭服务器进程...');
          this.serverProcess.kill('SIGKILL');
        }
        process.exit(0);
      }, 5000);
    } else {
      process.exit(0);
    }
  }
}

// 启动服务器管理器
const manager = new ServerManager();
manager.start();

console.log('服务器管理器已启动');
console.log('使用 Ctrl+C 来安全关闭服务器'); 