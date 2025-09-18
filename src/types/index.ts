// 用户类型
export interface User {
  id: string
  email: string
  created_at: string
}

// 交易类型枚举
export type TradeType = 'buy' | 'sell'

// 交易记录接口
export interface Trade {
  id: string
  user_id: string
  stock_symbol: string
  stock_name?: string
  trade_type: TradeType
  trade_date: string
  quantity: number
  price: number
  fees: number
  notes?: string
  created_at: string
  updated_at: string
}

// 创建交易记录的输入类型
export interface CreateTradeInput {
  stock_symbol: string
  stock_name?: string
  trade_type: TradeType
  trade_date: string
  quantity: number
  price: number
  fees?: number
  notes?: string
}

// 更新交易记录的输入类型
export interface UpdateTradeInput extends Partial<CreateTradeInput> {
  id: string
}

// 持仓统计接口
export interface PortfolioSummary {
  stock_symbol: string
  stock_name?: string
  total_quantity: number
  average_cost: number
  total_cost: number
  current_value?: number
  profit_loss?: number
  profit_loss_percentage?: number
}
