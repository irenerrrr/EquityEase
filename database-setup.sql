-- 创建symbols表来存储股票代码映射
CREATE TABLE IF NOT EXISTS symbols (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 为symbols表添加索引
CREATE INDEX IF NOT EXISTS idx_symbols_symbol ON symbols(symbol);

-- 确保daily_prices表存在（如果不存在则创建）
CREATE TABLE IF NOT EXISTS daily_prices (
  symbol_id INTEGER NOT NULL,
  as_of_date DATE NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  adj_close NUMERIC NOT NULL,
  volume NUMERIC NOT NULL,
  source TEXT DEFAULT 'yahoo_finance',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (symbol_id, as_of_date),
  FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
);

-- 为daily_prices表添加索引
CREATE INDEX IF NOT EXISTS idx_daily_prices_symbol_id ON daily_prices(symbol_id);
CREATE INDEX IF NOT EXISTS idx_daily_prices_as_of_date ON daily_prices(as_of_date);
CREATE INDEX IF NOT EXISTS idx_daily_prices_symbol_as_of ON daily_prices(symbol_id, as_of_date);

-- 启用行级安全策略
ALTER TABLE symbols ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_prices ENABLE ROW LEVEL SECURITY;

-- 创建RLS策略，允许所有操作（用于API访问）
CREATE POLICY "Allow all operations on symbols" ON symbols
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on daily_prices" ON daily_prices
  FOR ALL USING (true) WITH CHECK (true);

-- 插入TQQQ和SQQQ的初始数据
INSERT INTO symbols (symbol, name) 
VALUES 
  ('TQQQ', 'ProShares UltraPro QQQ'),
  ('SQQQ', 'ProShares UltraPro Short QQQ')
ON CONFLICT (symbol) DO NOTHING;
