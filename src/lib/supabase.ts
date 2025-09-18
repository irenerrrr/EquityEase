import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// 客户端 Supabase 实例
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 创建客户端实例的函数
export const createSupabaseClient = () => createClient(supabaseUrl, supabaseAnonKey)
