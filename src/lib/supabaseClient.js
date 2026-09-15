import { createClient } from '@supabase/supabase-js'



const supabaseUrl = 'https://pbsythpzncjoafpmijyd.supabase.co'

const supabaseAnonKey = 'sb_publishable_rxPYaugTvgGTF8ZNOJu5Tg_CODwQ9GS'



export const supabase = createClient(supabaseUrl, supabaseAnonKey)

