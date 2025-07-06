// 更新现有多条件报警规则，添加连续触发次数设置
const fs = require('fs');
const path = require('path');

console.log('=== 更新多条件报警规则 - 添加连续触发次数设置 ===');

const rulesFile = path.join(__dirname, 'data', 'multi-condition-alarm-rules.json');

function updateRules() {
  try {
    // 读取现有规则
    if (!fs.existsSync(rulesFile)) {
      console.log('❌ 未找到多条件报警规则文件');
      return;
    }

    const data = fs.readFileSync(rulesFile, 'utf8');
    const rules = JSON.parse(data);

    console.log(`📊 找到 ${rules.length} 个多条件报警规则`);

    let updatedCount = 0;

    // 为每个规则添加连续触发次数设置
    rules.forEach((rule, index) => {
      if (!rule.consecutiveCount) {
        rule.consecutiveCount = 2; // 默认设置为连续2次触发
        rule.updatedAt = new Date().toISOString();
        updatedCount++;
        console.log(`✓ 规则 "${rule.name}" 已添加连续触发次数设置：2次`);
      } else {
        console.log(`- 规则 "${rule.name}" 已有连续触发次数设置：${rule.consecutiveCount}次`);
      }
    });

    if (updatedCount > 0) {
      // 备份原文件
      const backupFile = `${rulesFile}.backup.${Date.now()}`;
      fs.writeFileSync(backupFile, data, 'utf8');
      console.log(`💾 已备份原文件到: ${backupFile}`);

      // 写入更新后的规则
      fs.writeFileSync(rulesFile, JSON.stringify(rules, null, 2), 'utf8');
      console.log(`✅ 成功更新 ${updatedCount} 个规则`);
    } else {
      console.log('ℹ️ 所有规则都已有连续触发次数设置，无需更新');
    }

  } catch (error) {
    console.error('❌ 更新规则失败:', error);
  }
}

updateRules();

console.log('\n🔄 更新完成！');
console.log('📋 说明：');
console.log('   - 默认设置为连续2次触发，可避免信号传输延迟造成的误报警');
console.log('   - 如需修改，可通过前端界面编辑规则');
console.log('   - 新创建的规则可以自定义连续触发次数（1-5次）'); 