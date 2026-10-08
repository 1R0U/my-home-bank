// 親が自分の家族へ子供アカウントを追加する Edge Function（Issue #264）。
//
// デプロイ: npx supabase functions deploy create-child-account
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY は Supabase が自動で渡す。
// 処理の本体は handler.ts。ここは Deno と Supabase クライアントへのつなぎだけを置く。

import { createClient } from "npm:@supabase/supabase-js@2";
import { handleCreateChildAccount } from "./handler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve((request) =>
  handleCreateChildAccount(request, {
    async prepareChildAccount(authorization, name) {
      // 認可をDBに任せるため、管理者ではなく呼び出した親のJWTで呼ぶ
      const asCaller = createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: authorization } },
      });
      const { data, error } = await asCaller.rpc("prepare_child_account", { p_name: name });
      if (error) throw new Error(error.message);
      return data as string;
    },
    async createAuthUser(email) {
      // パスワードは付けない。子供はパスワードでログインせず、親が発行するログインコードで入る
      // （#264 の2つ目）。メールは実在しないアドレスなので、確認済みにして送信させない。
      const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
      if (error) throw error;
      return data.user.id;
    },
  })
);
