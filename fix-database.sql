-- 修复数据库RLS策略的脚本

-- 1. 首先禁用RLS（如果存在）
ALTER TABLE IF EXISTS symbols DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS daily_prices DISABLE ROW LEVEL SECURITY;

-- 2. 删除现有的策略（如果存在）
DROP POLICY IF EXISTS "Allow all operations on symbols" ON symbols;
DROP POLICY IF EXISTS "Allow all operations on daily_prices" ON daily_prices;

-- 3. 重新启用RLS
ALTER TABLE symbols ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_prices ENABLE ROW LEVEL SECURITY;

-- 4. 创建新的策略，允许所有操作
CREATE POLICY "Allow all operations on symbols" ON symbols
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on daily_prices" ON daily_prices
  FOR ALL USING (true) WITH CHECK (true);

-- 5. 插入初始数据
INSERT INTO symbols (symbol, name) 
VALUES 
  ('TQQQ', 'ProShares UltraPro QQQ'),
  ('SQQQ', 'ProShares UltraPro Short QQQ')
ON CONFLICT (symbol) DO NOTHING;

-- 6. 验证数据
SELECT * FROM symbols;

