const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    auth: {
      persistSession: false
    },
    db: {
      schema: 'public'
    }
  }
);

// Custom methods
supabase.getPublicUrl = (path) => {
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${path}`;
};

module.exports = supabase;