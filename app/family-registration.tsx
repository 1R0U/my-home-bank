import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type RegistrationRole = "parent" | "child";

const roleOptions: Array<{ description: string; icon: keyof typeof Ionicons.glyphMap; label: string; value: RegistrationRole }> = [
  { description: "家族のクエストや報酬を管理します", icon: "people-outline", label: "親", value: "parent" },
  { description: "クエストに挑戦して報酬を受け取ります", icon: "happy-outline", label: "子", value: "child" },
];

export default function FamilyRegistrationScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<RegistrationRole>("parent");
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow px-6 pb-10" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View className="mt-6 flex-row items-center">
            <Pressable accessibilityLabel="戻る" accessibilityRole="button" className="h-11 w-11 items-center justify-center rounded-full bg-white active:bg-slate-200" onPress={() => router.back()}>
              <Ionicons color="#334155" name="arrow-back" size={22} />
            </Pressable>
          </View>

          <View className="mt-8">
            <Text className="text-3xl font-bold text-slate-900">家族メンバーを登録</Text>
            <Text className="mt-2 text-base leading-6 text-slate-600">新しいメンバーの情報と役割を入力してください。</Text>
          </View>

          <View className="mt-8 gap-5 rounded-3xl bg-white px-5 py-6">
            <View>
              <Text className="mb-2 text-sm font-semibold text-slate-800">名前</Text>
              <TextInput accessibilityLabel="名前" autoCapitalize="words" className="rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900" onChangeText={setName} placeholder="例：やまだ たろう" placeholderTextColor="#94a3b8" returnKeyType="next" value={name} />
            </View>

            <View>
              <Text className="mb-2 text-sm font-semibold text-slate-800">メールアドレス</Text>
              <TextInput accessibilityLabel="メールアドレス" autoCapitalize="none" autoComplete="email" className="rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900" keyboardType="email-address" onChangeText={setEmail} placeholder="family@example.com" placeholderTextColor="#94a3b8" returnKeyType="next" value={email} />
            </View>

            <View>
              <Text className="mb-2 text-sm font-semibold text-slate-800">パスワード</Text>
              <View className="flex-row items-center rounded-xl border border-slate-200">
                <TextInput accessibilityLabel="パスワード" autoCapitalize="none" autoComplete="new-password" className="flex-1 px-4 py-3 text-base text-slate-900" onChangeText={setPassword} placeholder="パスワードを入力" placeholderTextColor="#94a3b8" returnKeyType="done" secureTextEntry={!passwordVisible} value={password} />
                <Pressable accessibilityLabel={passwordVisible ? "パスワードを隠す" : "パスワードを表示"} accessibilityRole="button" className="px-4 py-3" onPress={() => setPasswordVisible((visible) => !visible)}>
                  <Ionicons color="#64748b" name={passwordVisible ? "eye-off-outline" : "eye-outline"} size={22} />
                </Pressable>
              </View>
            </View>

            <View>
              <Text className="mb-2 text-sm font-semibold text-slate-800">役割</Text>
              <View className="gap-3">
                {roleOptions.map((option) => {
                  const selected = option.value === role;
                  return (
                    <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected }} className={`flex-row items-center rounded-xl border px-4 py-4 ${selected ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white"}`} onPress={() => setRole(option.value)}>
                      <View className={`h-10 w-10 items-center justify-center rounded-full ${selected ? "bg-blue-600" : "bg-slate-100"}`}>
                        <Ionicons color={selected ? "#ffffff" : "#64748b"} name={option.icon} size={21} />
                      </View>
                      <View className="ml-3 flex-1">
                        <Text className="text-base font-bold text-slate-900">{option.label}</Text>
                        <Text className="mt-1 text-xs text-slate-500">{option.description}</Text>
                      </View>
                      <Ionicons color={selected ? "#2563eb" : "#cbd5e1"} name={selected ? "radio-button-on" : "radio-button-off"} size={22} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          <Pressable accessibilityRole="button" className="mt-8 items-center rounded-xl bg-blue-600 px-4 py-4 active:bg-blue-700" onPress={() => router.replace("/")}>
            <Text className="text-base font-bold text-white">登録</Text>
          </Pressable>
          <Text className="mt-3 text-center text-xs text-slate-500">現在はモック画面のため、入力内容は保存されません。</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
