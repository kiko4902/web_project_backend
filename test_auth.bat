@echo off
curl -X POST "https://vxuawvuqgsmhztriwejd.supabase.co/auth/v1/token?grant_type=password" -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4dWF3dnVxZ3NtaHp0cml3ZWpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDk0ODM5OSwiZXhwIjoyMDY2NTI0Mzk5fQ.uF4r3c3ZKuqjD7nDYjJl3Q1dqbrm4RkCJcKV9zlu9Zk" -H "Content-Type: application/json" -d "{\"email\":\"kikodzoic@gmail.com\",\"password\":\"password123\"}" > login.json
for /f "tokens=*" %%i in ('jq -r ".access_token" login.json') do set TOKEN=%%i
curl -X GET "http://localhost:3000/protected" -H "Authorization: Bearer %TOKEN%"


