-- 创建对话历史表
CREATE TABLE IF NOT EXISTS chat_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_message TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    ai_reply TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建提示词模板表
CREATE TABLE IF NOT EXISTS prompt_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 插入一些默认的提示词模板
INSERT INTO prompt_templates (name, content) VALUES 
('通用助手', '你是一个有用的助手，请用简洁明了的中文回答问题。'),
('代码专家', '你是一个编程专家，擅长解决各种编程问题。请提供详细的代码示例和解释。'),
('数据分析师', '你是一个数据分析专家，擅长解释数据趋势和提供数据分析建议。'); 